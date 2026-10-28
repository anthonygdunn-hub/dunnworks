// tl-notify: emails for Trip Log (dunnworks.io/triplog).
//   { action: "registered", email }  -> tells the owner someone is waiting for approval.
//      Called by the app straight after sign-up, before the user may have a session,
//      so it only acts on a pending profile created in the last day that has not
//      already triggered an email. Always answers ok, so it can't be used to probe emails.
//   { action: "approved", user_id }  -> tells the user they can sign in. Owner JWT only.
// Deploy with verify_jwt = false (the first call has no user JWT).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), RESEND_API_KEY,
// TL_NOTIFY_TO (default info@dunnworks.io), NOTIFY_FROM (default onboarding@resend.dev,
// which only delivers to the Resend account owner; use a verified domain to email users).
import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER = "info@dunnworks.io";
const APP = "https://dunnworks.io/triplog/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function send(to: string, subject: string, heading: string, lines: string[], cta: { href: string; label: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.warn("RESEND_API_KEY not set"); return false; }
  const from = Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const html = `<div style="background:#08080c;padding:28px 16px;font-family:Inter,system-ui,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#101018;border:1px solid #26262f;border-radius:16px;overflow:hidden">
    <div style="height:5px;background:linear-gradient(90deg,#d3246f,#7000ff)"></div>
    <div style="padding:24px;color:#e7e7ee;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 12px;font-size:20px;color:#fff">${esc(heading)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 10px;color:#c9c9d6">${esc(l)}</p>`).join("")}
    <p style="margin:20px 0 0"><a href="${cta.href}" style="display:inline-block;background:linear-gradient(135deg,#d3246f,#7000ff);color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${esc(cta.label)}</a></p>
    </div></div></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `Trip Log <${from}>`, to: [to], subject, html, text: lines.join("\n\n") + "\n\n" + cta.href }),
  });
  if (!r.ok) console.error("resend", r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  if (b.action === "registered") {
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!email) return json({ ok: true });
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: p } = await db.from("tl_profiles").select("*")
      .eq("email", email).eq("status", "pending").is("notified_at", null).gte("created_at", since).maybeSingle();
    if (p) {
      await db.from("tl_profiles").update({ notified_at: new Date().toISOString() }).eq("user_id", p.user_id);
      await send(Deno.env.get("TL_NOTIFY_TO") ?? OWNER, `Trip Log: ${p.full_name || email} wants access`, "New Trip Log registration", [
        `${p.full_name || "Someone"} (${email}) has registered and is waiting for you to approve them.`,
        [p.employer, p.employee_no && `Employee ${p.employee_no}`, p.vehicle_reg, p.manager_name && `Manager ${p.manager_name}`].filter(Boolean).join(" · "),
      ].filter(Boolean), { href: APP + "admin/", label: "Review registration" });
    }
    return json({ ok: true });
  }

  if (b.action === "approved") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if ((u?.user?.email ?? "").toLowerCase() !== OWNER) return json({ error: "Forbidden" }, 403);
    const { data: p } = await db.from("tl_profiles").select("*").eq("user_id", String(b.user_id ?? "")).maybeSingle();
    if (!p || p.status !== "approved") return json({ error: "Not approved" }, 400);
    const sent = await send(p.email, "You're in: Trip Log is ready", "You're approved", [
      `Hi ${String(p.full_name || "").split(" ")[0] || "there"}, your Trip Log account has been approved.`,
      "Sign in with the email and password you registered with. On your phone, add it to your home screen so it opens like an app and works with no signal.",
    ], { href: APP, label: "Open Trip Log" });
    return json({ ok: true, emailed: sent });
  }

  return json({ error: "Unknown action" }, 400);
});
