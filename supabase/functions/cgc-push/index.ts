// cgc-push: phone alerts for the Coastal Golf Co admin app (dunnworks.io/editor/coastal-golf-co/).
// 'booking' (from cgc-booking, x-internal key): a new website booking, to every editor's phone.
// 'test'    (signed-in editor): a test alert to your own phone.
// Keys (VAPID pair, internal key) live in public.cgc_private, readable by the service role only.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const ORIGINS = [/^https:\/\/(www\.)?dunnworks\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.some((r) => r.test(o)) ? o : "https://dunnworks.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

let lastErrors: string[] = [];
Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const keys = Object.fromEntries(((await admin.from("cgc_private").select("k,v")).data || []).map((r: { k: string; v: string }) => [r.k, r.v]));
  webpush.setVapidDetails("mailto:info@dunnworks.io", keys.vapid_public, keys.vapid_private);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  const send = async (emails: string[] | null, msg: { title: string; body: string; url: string; tag?: string }) => {
    let q = admin.from("cgc_push_subs").select("id,endpoint,p256dh,auth");
    if (emails) q = q.in("email", emails);
    const { data: subs } = await q;
    let n = 0; const errors: string[] = [];
    await Promise.all((subs || []).map(async (s: { id: number; endpoint: string; p256dh: string; auth: string }) => {
      try { const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 24 * 3600, urgency: "high" }); console.log("push ok", r.statusCode, s.endpoint.slice(0, 40)); n++; }
      catch (e) {
        const x = e as { statusCode?: number; body?: string; message?: string };
        console.error("push failed", x.statusCode, x.body || x.message, s.endpoint.slice(0, 40)); errors.push(String(x.statusCode || "") + " " + String(x.body || x.message || "").slice(0, 200));
        if (x.statusCode === 404 || x.statusCode === 410) await admin.from("cgc_push_subs").delete().eq("id", s.id);
      }
    }));
    lastErrors = errors;
    return n;
  };

  if (b.kind === "booking") {
    if (!keys.internal || req.headers.get("x-internal") !== keys.internal) return json({ error: "not allowed" }, 403);
    const { data: bk } = await admin.from("cgc_bookings").select("id,name,service,clubs,postcode").eq("id", String(b.id)).maybeSingle();
    if (!bk) return json({ error: "not found" }, 404);
    const body = [bk.service || "Not sure yet", bk.clubs ? bk.clubs + " clubs" : "", bk.postcode || ""].filter(Boolean).join(" · ");
    return json({ ok: true, sent: await send(null, { title: "New booking: " + clip(bk.name, 60), body: clip(body, 160), url: "#booking/" + bk.id, tag: "booking-" + bk.id }) });
  }

  if (b.kind === "test") {
    const auth = req.headers.get("authorization") || "";
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await user.auth.getUser();
    const email = (u?.user?.email || "").toLowerCase();
    if (!email) return json({ error: "Please sign in again." }, 401);
    const { data: ed } = await admin.from("cgc_editors").select("email").eq("email", email).maybeSingle();
    if (!ed) return json({ error: "not allowed" }, 403);
    const n = await send([email], { title: "Coastal Golf Co", body: "Alerts are on. You'll get one like this for every new booking.", url: "#home", tag: "test" });
    return json({ ok: true, sent: n, errors: lastErrors });
  }
  if (b.kind === "diag") {
    if (!keys.internal || req.headers.get("x-internal") !== keys.internal) return json({ error: "not allowed" }, 403);
    const n = await send(null, { title: "Coastal Golf Co", body: "Test alert from the admin app.", url: "#home", tag: "test" });
    return json({ ok: true, sent: n, errors: lastErrors });
  }
  return json({ error: "unknown kind" }, 400);
});
