// cgc-insights: the Google side of the Coastal Golf Co dashboard in the Dunnworks console.
//   { what: "speed" }            PageSpeed Insights for mobile and desktop (cached 12 hours)
//   { what: "google", days: 28 } Google Analytics 4 + Search Console (cached 1 hour)
//   add force: true to skip the cache.
// Owner only (info@dunnworks.io). Google settings live in cgc_google, which only the owner can read
// or write: a service account key (JSON), the GA4 property ID (numbers only) and the Search Console site.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = "https://www.coastalgolfco.co.uk/";
const OWNER = "info@dunnworks.io";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function cached(key: string, maxAgeMs: number, force: boolean, make: () => Promise<unknown>) {
  if (!force) {
    const { data } = await db.from("cgc_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < maxAgeMs) return { ...data.data, cached: true, fetched_at: data.fetched_at };
  }
  const fresh = await make() as Record<string, unknown>;
  const fetched_at = new Date().toISOString();
  if (!JSON.stringify(fresh).includes('"error":')) await db.from("cgc_cache").upsert({ key, data: fresh, fetched_at });
  return { ...fresh, cached: false, fetched_at };
}

/* ---------- PageSpeed ---------- */
async function psi(strategy: string, key: string | null) {
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", SITE); u.searchParams.set("strategy", strategy);
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) u.searchParams.append("category", c);
  if (key) u.searchParams.set("key", key);
  const r = await fetch(u, { signal: AbortSignal.timeout(120_000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `PageSpeed answered ${r.status}`);
  const lr = j.lighthouseResult ?? {}, a = lr.audits ?? {}, cat = lr.categories ?? {};
  const sc = (k: string) => cat[k]?.score == null ? null : Math.round(cat[k].score * 100);
  const m = (k: string) => a[k] ? { v: a[k].displayValue ?? null, n: a[k].numericValue ?? null, s: a[k].score } : null;
  const field = j.loadingExperience?.metrics ?? null;
  const fm = (k: string) => field?.[k] ? { p75: field[k].percentile, cat: field[k].category } : null;
  return {
    scores: { performance: sc("performance"), accessibility: sc("accessibility"), best: sc("best-practices"), seo: sc("seo") },
    lab: { fcp: m("first-contentful-paint"), lcp: m("largest-contentful-paint"), tbt: m("total-blocking-time"), cls: m("cumulative-layout-shift"), si: m("speed-index") },
    field: field ? { lcp: fm("LARGEST_CONTENTFUL_PAINT_MS"), inp: fm("INTERACTION_TO_NEXT_PAINT"), cls: fm("CUMULATIVE_LAYOUT_SHIFT_SCORE"), overall: j.loadingExperience?.overall_category ?? null } : null,
    weight: a["total-byte-weight"]?.numericValue ?? null,
    opportunities: Object.values(a as Record<string, any>)
      .filter((x) => x?.details?.type === "opportunity" && x.score != null && x.score < 0.9 && (x.details.overallSavingsMs ?? 0) > 100)
      .sort((x, y) => (y.details.overallSavingsMs ?? 0) - (x.details.overallSavingsMs ?? 0))
      .slice(0, 4).map((x) => ({ title: x.title, saving_ms: Math.round(x.details.overallSavingsMs ?? 0) })),
  };
}

/* ---------- Google auth with the service account ---------- */
async function googleToken(sa: { client_email: string; private_key: string }) {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
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

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function ga4(token: string, prop: string, days: number) {
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(prop)}:runReport`;
  const range = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const prev = [{ startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }];
  const mets = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration"].map((name) => ({ name }));
  const rows = (j: any) => (j.rows ?? []).map((r: any) => ({ d: (r.dimensionValues ?? []).map((x: any) => x.value), m: (r.metricValues ?? []).map((x: any) => Number(x.value)) }));
  const [tot, totp, daily, chan, pages, cities, events] = await Promise.all([
    gpost(base, token, { dateRanges: range, metrics: mets }),
    gpost(base, token, { dateRanges: prev, metrics: mets }),
    gpost(base, token, { dateRanges: range, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
    gpost(base, token, { dateRanges: range, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 }),
    gpost(base, token, { dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10 }),
    gpost(base, token, { dateRanges: range, dimensions: [{ name: "city" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 8 }),
    gpost(base, token, { dateRanges: range, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 10 }),
  ]);
  const t = (j: any) => { const m = rows(j)[0]?.m ?? [0, 0, 0, 0, 0, 0]; return { users: m[0], new_users: m[1], sessions: m[2], views: m[3], engagement: Math.round((m[4] ?? 0) * 100), avg_secs: Math.round(m[5] ?? 0) }; };
  return {
    cur: t(tot), prev: t(totp),
    daily: rows(daily).map((r: any) => ({ d: `${r.d[0].slice(0, 4)}-${r.d[0].slice(4, 6)}-${r.d[0].slice(6, 8)}`, users: r.m[0], sessions: r.m[1] })),
    channels: rows(chan).map((r: any) => ({ k: r.d[0], n: r.m[0] })),
    pages: rows(pages).map((r: any) => ({ k: r.d[0], n: r.m[0], u: r.m[1] })),
    cities: rows(cities).map((r: any) => ({ k: r.d[0], n: r.m[0] })).filter((x: any) => x.k && x.k !== "(not set)"),
    events: rows(events).map((r: any) => ({ k: r.d[0], n: r.m[0] })),
  };
}

async function gsc(token: string, site: string, days: number) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  // Search Console runs about 2-3 days behind
  const end = new Date(Date.now() - 2 * 86400_000), start = new Date(end.getTime() - (days - 1) * 86400_000);
  const pend = new Date(start.getTime() - 86400_000), pstart = new Date(pend.getTime() - (days - 1) * 86400_000);
  const q = (s: Date, e: Date, dimensions: string[], rowLimit = 15) => gpost(url, token, { startDate: ymd(s), endDate: ymd(e), dimensions, rowLimit, dataState: "all" });
  const [tot, totp, daily, queries, pages] = await Promise.all([
    q(start, end, [], 1), q(pstart, pend, [], 1), q(start, end, ["date"], 500), q(start, end, ["query"], 15), q(start, end, ["page"], 10),
  ]);
  const t = (j: any) => { const r = j.rows?.[0]; return r ? { clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 } : { clicks: 0, impressions: 0, ctr: 0, position: null }; };
  const map = (j: any) => (j.rows ?? []).map((r: any) => ({ k: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }));
  return { from: ymd(start), to: ymd(end), cur: t(tot), prev: t(totp), daily: map(daily).map((r: any) => ({ d: r.k, clicks: r.clicks, impressions: r.impressions })), queries: map(queries), pages: map(pages) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (u?.user?.email?.toLowerCase() !== OWNER) return json({ error: "Owner only" }, 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* defaults */ }
  const force = b.force === true;
  const days = [7, 28, 90].includes(Number(b.days)) ? Number(b.days) : 28;
  const { data: cfg } = await db.from("cgc_google").select("*").eq("id", 1).maybeSingle();

  try {
    if (b.what === "speed") {
      return json(await cached("psi", 12 * 3600_000, force, async () => {
        try {
          const [mobile, desktop] = await Promise.all([psi("mobile", cfg?.psi_key ?? null), psi("desktop", cfg?.psi_key ?? null)]);
          return { mobile, desktop };
        } catch (e) { return { error: String((e as Error).message ?? e) }; }
      }));
    }
    if (b.what === "google") {
      let sa: any = null;
      try { sa = cfg?.sa_json ? JSON.parse(cfg.sa_json) : null; } catch { return json({ error: "The service account key isn't valid JSON. Paste the whole downloaded file." }); }
      if (!sa?.client_email || !sa?.private_key) return json({ setup: true, ga4: null, gsc: null });
      return json(await cached(`google:${days}`, 3600_000, force, async () => {
        let tok: string;
        try { tok = await googleToken(sa); } catch (e) { return { error: "Google sign-in: " + (e as Error).message, sa_email: sa.client_email }; }
        const [g, s] = await Promise.allSettled([
          cfg?.ga4_property ? ga4(tok, String(cfg.ga4_property).replace(/\D/g, ""), days) : Promise.reject(new Error("Add the GA4 property ID")),
          cfg?.gsc_site ? gsc(tok, cfg.gsc_site, days) : Promise.reject(new Error("Add the Search Console site")),
        ]);
        return {
          sa_email: sa.client_email, days,
          ga4: g.status === "fulfilled" ? g.value : { error: (g.reason as Error).message },
          gsc: s.status === "fulfilled" ? s.value : { error: (s.reason as Error).message },
        };
      }));
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
