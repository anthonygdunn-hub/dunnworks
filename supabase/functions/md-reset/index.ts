// md-reset: staff reset their own password from the login page.
// 'request' {email}: if it's an active MD staff login, emails a link (valid 1 hour) to the staff app.
//   Always answers the same way, so it never reveals who has a login. At most 3 links per login per hour.
// 'set' {token, password}: checks the link and sets the new password.
// Sender and settings come from md_private (mail_from); RESEND_API_KEY is a secret.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const STAFF_URL = "https://dunnworks.io/preview/md-dance-academy/staff/";
const hash = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))).map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  if (b.action === "request") {
    const email = String(b.email || "").trim().toLowerCase();
    const done = json({ ok: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return done;
    const { data: st } = await db.from("md_staff").select("user_id,name,active").eq("email", email).maybeSingle();
    if (!st || !st.active) return done;
    const { count } = await db.from("md_reset_tokens").select("id", { count: "exact", head: true }).eq("user_id", st.user_id).gte("created_at", new Date(Date.now() - 3600e3).toISOString());
    if ((count ?? 0) >= 3) return done;
    const raw = crypto.getRandomValues(new Uint8Array(32)), token = Array.from(raw).map((x) => x.toString(16).padStart(2, "0")).join("");
    await db.from("md_reset_tokens").insert({ user_id: st.user_id, token_hash: await hash(token), expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const key = Deno.env.get("RESEND_API_KEY");
    const from = (await db.from("md_private").select("v").eq("k", "mail_from").maybeSingle()).data?.v ?? Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
    const link = STAFF_URL + "#reset=" + token;
    if (key) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `MD Dance Academy staff <${from}>`, to: [email], subject: "Reset your MD Staff password",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2B2B2E;max-width:520px"><div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.06em">MD DANCE ACADEMY</div><div style="border:1px solid #F6D3DC;border-top:0;border-radius:0 0 12px 12px;padding:20px"><p>Hi ${String(st.name).split(" ")[0].replace(/[<>&]/g, "")},</p><p>Tap the button to choose a new password for MD Staff. The link works for one hour.</p><p><a href="${link}" style="display:inline-block;background:#D81B2C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p style="font-size:13px;color:#66666C">If you didn't ask for this, you can ignore this email and your password stays the same.</p></div></div>`,
          text: `Choose a new password for MD Staff (link works for one hour): ${link}\n\nIf you didn't ask for this, ignore this email.`,
        }),
      });
      if (!r.ok) console.error("Resend refused", r.status, await r.text());
    }
    return done;
  }

  if (b.action === "set") {
    const token = String(b.token || ""), password = String(b.password || "");
    if (password.length < 10 || password.length > 72) return json({ error: "Passwords need at least 10 characters." }, 400);
    const { data: t } = await db.from("md_reset_tokens").select("id,user_id,expires_at,used").eq("token_hash", await hash(token)).maybeSingle();
    if (!t || t.used || new Date(t.expires_at) < new Date()) return json({ error: "That link has expired or already been used. Ask for a new one from the login page." }, 400);
    const { error } = await db.auth.admin.updateUserById(t.user_id, { password });
    if (error) return json({ error: "Could not set the password. Please try again." }, 500);
    await db.from("md_reset_tokens").update({ used: true }).eq("id", t.id);
    const { data: st } = await db.from("md_staff").select("email").eq("user_id", t.user_id).maybeSingle();
    return json({ ok: true, email: st?.email ?? null });
  }
  return json({ error: "action" }, 400);
});
