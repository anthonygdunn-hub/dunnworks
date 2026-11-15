// dw-site-insights: Google side of every site dashboard in the console (Workspace → Dashboards).
// Same as wb-insights, for any row of dw_sites:
//   { site, what: "google", days | from+to }  Search Console totals, daily, searches, close to page 1, pages, target keywords (3h cache)
//   { site, what: "speed" }                   PageSpeed Insights, mobile and desktop (12h cache)
//   { what: "properties" }                    which Search Console properties the service account can see
// Uses the dashboard service account and PageSpeed key already saved for woolmer (wb_google). Owner only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const OWNER = "info@dunnworks.io";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const isDay = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

async function cached(key: string, maxAgeMs: number, force: boolean, make: () => Promise<unknown>) {
  if (!force) {
    const { data } = await db.from("dw_site_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < maxAgeMs) return { ...data.data, cached: true, fetched_at: data.fetched_at };
  }
  const fresh = await make() as Record<string, unknown>;
  const fetched_at = new Date().toISOString();
  if (!JSON.stringify(fresh).includes('"error":')) await db.from("dw_site_cache").upsert({ key, data: fresh, fetched_at });
  return { ...fresh, cached: false, fetched_at };
}

async function googleToken(sa: { client_email: string; private_key: string }) {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/webmasters.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? "Google sign-in failed");
  return j.access_token as string;
}
async function gpost(url: string, token: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Google answered ${r.status}`);
  return j;
}

type Site = { slug: string; name: string; url: string; host: string; gsc: string | null };

async function gsc(site: Site, token: string, start: Date, end: Date) {
  const tries = [site.gsc, `sc-domain:${site.host}`, site.url, `https://${site.host}/`, `https://www.${site.host}/`].filter(Boolean) as string[];
  let prop = "", lastErr = "";
  for (const s of tries) {
    try { await gpost(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(s)}/searchAnalytics/query`, token, { startDate: ymd(new Date(Date.now() - 5 * 864e5)), endDate: ymd(new Date()), rowLimit: 1 }); prop = s; break; }
    catch (e) { lastErr = (e as Error).message; }
  }
  if (!prop) throw new Error(`The service account can't see ${site.host} in Search Console yet. Add it as a user on the property. (${lastErr})`);
  if (prop !== site.gsc) await db.from("dw_sites").update({ gsc: prop }).eq("slug", site.slug);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}/searchAnalytics/query`;
  const len = Math.round((end.getTime() - start.getTime()) / 864e5) + 1;
  const pend = new Date(start.getTime() - 864e5), pstart = new Date(pend.getTime() - (len - 1) * 864e5);
  const q = (s: Date, e: Date, dimensions: string[], rowLimit = 25) => gpost(url, token, { startDate: ymd(s), endDate: ymd(e), dimensions, rowLimit, dataState: "all" });
  const [tot, totp, daily, queries, pages] = await Promise.all([q(start, end, [], 1), q(pstart, pend, [], 1), q(start, end, ["date"], 500), q(start, end, ["query"], 1000), q(start, end, ["page"], 50)]);
  const t = (j: any) => { const r = j.rows?.[0]; return r ? { clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 } : { clicks: 0, impressions: 0, ctr: 0, position: null }; };
  const map = (j: any) => (j.rows ?? []).map((r: any) => ({ k: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }));
  const allQ = map(queries);
  const byDay: Record<string, any> = {}; map(daily).forEach((r: any) => byDay[r.k] = r);
  const days = []; for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) { const k = ymd(d); days.push({ d: k, clicks: byDay[k]?.clicks ?? 0, impressions: byDay[k]?.impressions ?? 0 }); }
  const { data: kws } = await db.from("dw_site_keywords").select("keyword,page,volume,sort").eq("site", site.slug).order("sort");
  const byQ: Record<string, any> = {}; allQ.forEach((r: any) => byQ[r.k.toLowerCase()] = r);
  // brand searches: the first word of the host (e.g. "farnboroughcontracting" or "woolmer") and the site name
  const brandWords = [site.host.split(".")[0], ...site.name.toLowerCase().split(/\s+/).filter((w) => w.length > 4)];
  const brand = new RegExp(brandWords.map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean).join("|"), "i");
  const hostRe = new RegExp("^https?://(www\\.)?" + site.host.replace(/\./g, "\\."));
  return {
    site: prop, from: ymd(start), to: ymd(end), cur: t(tot), prev: t(totp),
    nonbrand_clicks: allQ.filter((r: any) => !brand.test(r.k.replace(/\s+/g, ""))).reduce((a: number, r: any) => a + r.clicks, 0),
    daily: days,
    queries: allQ.slice(0, 50),
    close: allQ.filter((r: any) => r.position > 3 && r.position <= 20).sort((a: any, b: any) => b.impressions - a.impressions).slice(0, 20),
    pages: map(pages).map((r: any) => ({ ...r, k: r.k.replace(hostRe, "") || "/" })),
    keywords: (kws || []).map((k: any) => { const r = byQ[k.keyword.toLowerCase()]; return { keyword: k.keyword, page: k.page, volume: k.volume, position: r ? r.position : null, impressions: r ? r.impressions : 0, clicks: r ? r.clicks : 0 }; }),
  };
}

async function psi(url: string, strategy: string, key: string | null) {
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url); u.searchParams.set("strategy", strategy);
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) u.searchParams.append("category", c);
  if (key) u.searchParams.set("key", key);
  const r = await fetch(u, { signal: AbortSignal.timeout(120_000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `PageSpeed answered ${r.status}`);
  const lr = j.lighthouseResult ?? {}, a = lr.audits ?? {}, cat = lr.categories ?? {};
  const sc = (k: string) => cat[k]?.score == null ? null : Math.round(cat[k].score * 100);
  return {
    scores: { performance: sc("performance"), accessibility: sc("accessibility"), best: sc("best-practices"), seo: sc("seo") },
    lcp: a["largest-contentful-paint"]?.displayValue ?? null, cls: a["cumulative-layout-shift"]?.displayValue ?? null, tbt: a["total-blocking-time"]?.displayValue ?? null,
    opportunities: Object.values(a as Record<string, any>).filter((x) => x?.details?.type === "opportunity" && x.score != null && x.score < 0.9 && (x.details.overallSavingsMs ?? 0) > 100)
      .sort((x, y) => (y.details.overallSavingsMs ?? 0) - (x.details.overallSavingsMs ?? 0)).slice(0, 4).map((x) => ({ title: x.title, saving_ms: Math.round(x.details.overallSavingsMs ?? 0) })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (u?.user?.email?.toLowerCase() !== OWNER) return json({ error: "Owner only" }, 403);
  let b: Record<string, unknown> = {}; try { b = await req.json(); } catch { /* defaults */ }
  const force = b.force === true;
  const { data: cfg } = await db.from("wb_google").select("sa_json, psi_key").eq("id", 1).maybeSingle();
  let sa: any = null; try { sa = cfg?.sa_json ? JSON.parse(cfg.sa_json) : null; } catch { /* below */ }
  try {
    if (b.what === "properties") {
      if (!sa?.client_email) return json({ setup: true });
      const tok = await googleToken(sa);
      const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } }).then((x) => x.json());
      return json({ sa_email: sa.client_email, sites: (r.siteEntry ?? []).map((s: any) => s.siteUrl) });
    }
    const { data: site } = await db.from("dw_sites").select("slug,name,url,host,gsc").eq("slug", String(b.site ?? "")).maybeSingle();
    if (!site) return json({ error: "Unknown site" }, 400);
    if (b.what === "speed") {
      return json(await cached(`${site.slug}:psi`, 12 * 3600_000, force, async () => {
        try { const k = cfg?.psi_key ?? null; const [mobile, desktop] = await Promise.all([psi(site.url, "mobile", k), psi(site.url, "desktop", k)]); return { mobile, desktop }; } catch (e) { return { error: String((e as Error).message ?? e) }; }
      }));
    }
    if (b.what === "google") {
      if (!sa?.client_email || !sa?.private_key) return json({ setup: true });
      let start: Date, end: Date;
      const today = new Date(ymd(new Date()) + "T00:00:00Z");
      if (isDay(b.from) && isDay(b.to)) {
        start = new Date(String(b.from) + "T00:00:00Z"); end = new Date(String(b.to) + "T00:00:00Z");
        if (end > today) end = today; if (start > end) start = new Date(end);
        if ((end.getTime() - start.getTime()) / 864e5 > 485) start = new Date(end.getTime() - 485 * 864e5);
      } else {
        const days = Math.min(Math.max(Number(b.days) || 30, 1), 486);
        end = new Date(today.getTime() - 2 * 864e5); start = new Date(end.getTime() - (days - 1) * 864e5);
      }
      return json(await cached(`${site.slug}:google:${ymd(start)}:${ymd(end)}`, 3 * 3600_000, force, async () => {
        try { const tok = await googleToken(sa); return { sa_email: sa.client_email, gsc: await gsc(site as Site, tok, start, end) }; }
        catch (e) { return { sa_email: sa.client_email, error: (e as Error).message }; }
      }));
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
