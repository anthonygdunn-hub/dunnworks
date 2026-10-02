// cgc-track: the Coastal Golf Co visit counter. Each page sends one small beacon when it opens
// and another with the time spent when it closes.
// No cookies and nothing stored on the visitor's device. Visitors are counted with a hash of
// IP + browser + the day + a secret, so the same person is one visitor per day and can't be
// followed from one day to the next. The IP itself is never stored.
// Deployed with verify_jwt off: browsers send it with navigator.sendBeacon, which can't add headers.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = /^https:\/\/(www\.)?coastalgolfco\.co\.uk$/;
const BOTS = /bot|crawl|spider|slurp|preview|lighthouse|headless|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|whatsapp|curl|wget|python|axios|node-fetch|go-http/i;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SALT = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").slice(-24);

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && SITE.test(origin) ? origin : "https://www.coastalgolfco.co.uk",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const clip = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function source(ref: string | null): string | null {
  if (!ref) return null;
  let h = "";
  try { h = new URL(ref).hostname.toLowerCase().replace(/^(www|m|l|lm|mobile)\./, ""); } catch { return null; }
  if (!h || /(^|\.)coastalgolfco\.co\.uk$/.test(h)) return null;
  if (/^google\./.test(h) || h.endsWith(".google.com") || h === "google.com") return "Google";
  if (/^bing\./.test(h)) return "Bing";
  if (/duckduckgo/.test(h)) return "DuckDuckGo";
  if (/yahoo/.test(h)) return "Yahoo";
  if (/ecosia/.test(h)) return "Ecosia";
  if (/facebook|fb\.com|fb\.me/.test(h)) return "Facebook";
  if (/instagram/.test(h)) return "Instagram";
  if (/whatsapp|wa\.me/.test(h)) return "WhatsApp";
  if (/t\.co$|twitter|x\.com/.test(h)) return "X (Twitter)";
  if (/linkedin|lnkd\.in/.test(h)) return "LinkedIn";
  if (/chatgpt|openai/.test(h)) return "ChatGPT";
  if (/perplexity/.test(h)) return "Perplexity";
  if (/dunnworks\.io$/.test(h)) return "dunnworks.io";
  return h;
}

function browser(ua: string) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/FBAN|FBAV|Instagram/.test(ua)) return "Facebook/Instagram app";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox";
  if (/Chrome|CriOS/.test(ua)) return "Chrome";
  if (/Safari/.test(ua)) return "Safari";
  return "Other";
}
function os(ua: string) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}
function device(ua: string, w: number) {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "Tablet";
  if (/Mobi|iPhone|Android/.test(ua)) return "Mobile";
  if (w && w < 760) return "Mobile";
  return "Desktop";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = cors(origin);
  const done = () => new Response(null, { status: 204, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: h });
  if (!origin || !SITE.test(origin)) return done();          // only count the real site
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOTS.test(ua)) return done();

  let b: Record<string, unknown> = {};
  try { b = JSON.parse(await req.text()); } catch { return done(); }
  const vid = clip(b.v, 40);

  if (b.t === "leave") {
    const ms = Math.round(Number(b.ms));
    if (vid && ms > 0 && ms < 4 * 3600_000) {
      await db.from("cgc_pageviews").update({ ms }).eq("vid", vid).is("ms", null).gte("at", new Date(Date.now() - 4 * 3600_000).toISOString());
    }
    return done();
  }

  let path = clip(b.p, 300) ?? "/";
  path = path.replace(/[?].*$/, "").replace(/\/index\.html$/, "/") || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "";
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const country = clip(req.headers.get("cf-ipcountry") ?? req.headers.get("x-country") ?? req.headers.get("x-vercel-ip-country"), 2);
  const row = {
    vid, path,
    visitor: await sha(`${ip}|${ua}|${day}|${SALT}`),
    ref: source(clip(b.r, 500)),
    utm: clip(b.u, 60)?.toLowerCase() ?? null,
    device: device(ua, Number(b.w) || 0), browser: browser(ua), os: os(ua),
    country: country && country !== "XX" ? country.toUpperCase() : null,
  };
  // simple flood guard: no more than 300 views an hour from one visitor
  const { count } = await db.from("cgc_pageviews").select("id", { count: "exact", head: true })
    .eq("visitor", row.visitor).gte("at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) < 300) await db.from("cgc_pageviews").insert(row);
  return done();
});
