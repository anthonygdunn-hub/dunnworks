// cgc-ping: checks www.coastalgolfco.co.uk is up and how fast it answers, and records the result
// in cgc_uptime. Run every 10 minutes by pg_cron (job "cgc-uptime"). verify_jwt is off so the
// cron job needs no key; it can only ever check this one site, and it skips if checked in the last 2 minutes.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const URL_ = "https://www.coastalgolfco.co.uk/";

Deno.serve(async () => {
  const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
  const { data: last } = await db.from("cgc_uptime").select("at").order("at", { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].at).getTime() < 120_000) return json({ ok: true, skipped: true });
  const t = performance.now();
  let row: Record<string, unknown>;
  try {
    const r = await fetch(URL_, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Dunnworks uptime check" } });
    const body = await r.text();
    const ok = r.ok && /Coastal Golf Co/i.test(body);
    row = { ok, status: r.status, ms: Math.round(performance.now() - t), note: ok ? null : (r.ok ? "Page loaded but the content looked wrong" : r.statusText) };
  } catch (e) {
    row = { ok: false, status: null, ms: Math.round(performance.now() - t), note: String((e as Error)?.message ?? e).slice(0, 200) };
  }
  await db.from("cgc_uptime").insert(row);
  // keep 120 days
  await db.from("cgc_uptime").delete().lt("at", new Date(Date.now() - 120 * 86400_000).toISOString());
  return json(row);
});
