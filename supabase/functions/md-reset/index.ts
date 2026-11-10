// md-reset: password links for MD staff and parents.
// 'request' {email, app}: app 'staff' (default) needs an active staff login; app 'parent' needs a family with that email,
//   and makes the parent's login the first time. Emails a link valid for one hour. Always answers the same way,
//   so it never reveals who has a login. At most 3 links per login per hour.
// 'invite' {family_id} (signed-in principal): emails a family a welcome link to set up the parent app (valid 7 days).
// 'set' {token, password}: checks the link and sets the new password.
// Sender comes from md_private (mail_from); RESEND_API_KEY is a secret.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const BASE = "https://dunnworks.io/preview/md-dance-academy/";
const URLS: Record<string, string> = { staff: BASE + "staff/", parent: BASE + "parents/" };
const hex = (a: Uint8Array) => Array.from(a).map((x) => x.toString(16).padStart(2, "0")).join("");
const hash = async (t: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))));
const lit = (e: string) => e.replace(/[\\%_]/g, (m) => "\\" + m);
const okEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const first = (n: unknown) => String(n || "").trim().split(" ")[0].replace(/[<>&"]/g, "") || "there";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  const mail = async (to: string, subject: string, name: string, intro: string, button: string, link: string, valid: string) => {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return false;
    const from = (await db.from("md_private").select("v").eq("k", "mail_from").maybeSingle()).data?.v ?? Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `MD Dance Academy <${from}>`, to: [to], subject,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2B2B2E;max-width:520px"><div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.06em">MD DANCE ACADEMY</div><div style="border:1px solid #F6D3DC;border-top:0;border-radius:0 0 12px 12px;padding:20px"><p>Hi ${name},</p><p>${intro}</p><p><a href="${link}" style="display:inline-block;background:#D81B2C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${button}</a></p><p style="font-size:13px;color:#66666C">The link works for ${valid}. If you didn't ask for this, you can ignore this email.</p></div></div>`,
        text: `Hi ${name},\n\n${intro}\n\n${button}: ${link}\n\nThe link works for ${valid}. If you didn't ask for this, ignore this email.`,
      }),
    });
    if (!r.ok) console.error("Resend refused", r.status, await r.text());
    return r.ok;
  };

  // returns the login for a family email, making it (with a random password) the first time
  const parentLogin = async (email: string) => {
    let uid = (await db.rpc("md_auth_uid", { p_email: email })).data as string | null;
    if (!uid) {
      const pw = hex(crypto.getRandomValues(new Uint8Array(24)));
      const { data, error } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { md_parent: true } });
      if (error) { console.error("createUser", error.message); return null; }
      uid = data.user.id;
    }
    await db.from("md_families").update({ user_id: uid }).ilike("email", lit(email)).is("user_id", null);
    return uid;
  };

  const newToken = async (uid: string, hours: number) => {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.from("md_reset_tokens").insert({ user_id: uid, token_hash: await hash(token), expires_at: new Date(Date.now() + hours * 3600e3).toISOString() });
    return token;
  };
  const recent = async (uid: string) => (await db.from("md_reset_tokens").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", new Date(Date.now() - 3600e3).toISOString())).count ?? 0;

  if (b.action === "request") {
    const email = String(b.email || "").trim().toLowerCase();
    const app = b.app === "parent" ? "parent" : "staff";
    const done = json({ ok: true });
    if (!okEmail(email)) return done;
    let uid: string | null = null, name = "";
    if (app === "staff") {
      const { data: st } = await db.from("md_staff").select("user_id,name,active").eq("email", email).maybeSingle();
      if (!st || !st.active) return done;
      uid = st.user_id; name = st.name;
    } else {
      const { data: fams } = await db.from("md_families").select("id,parent_name,user_id").ilike("email", lit(email));
      if (!fams?.length) return done;
      const { count } = await db.from("md_dancers").select("id", { count: "exact", head: true }).in("family_id", fams.map((f: { id: string }) => f.id)).eq("active", true);
      if (!count) return done;
      uid = await parentLogin(email); name = fams[0].parent_name;
    }
    if (!uid || (await recent(uid)) >= 3) return done;
    const link = URLS[app] + "#reset=" + await newToken(uid, 1);
    await mail(email, app === "staff" ? "Reset your MD Staff password" : "Your MD Dance Academy parent log in",
      first(name), app === "staff" ? "Tap the button to choose a new password for MD Staff." : "Tap the button to choose your password for the MD Dance Academy parent app. You can see fees, lessons and classes, and enter competitions there.",
      "Choose a password", link, "one hour");
    return done;
  }

  if (b.action === "invite") {
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
    const { data: isP } = await caller.rpc("md_is_principal");
    if (!isP) return json({ error: "Only a principal can send invitations." }, 403);
    const { data: f } = await db.from("md_families").select("id,parent_name,email").eq("id", String(b.family_id)).maybeSingle();
    if (!f) return json({ error: "Family not found." }, 404);
    const email = String(f.email || "").trim().toLowerCase();
    if (!okEmail(email)) return json({ error: "Add an email address for this family first." }, 400);
    const uid = await parentLogin(email);
    if (!uid) return json({ error: "Could not set up a login for that email." }, 500);
    const link = URLS.parent + "#reset=" + await newToken(uid, 24 * 7);
    const sent = await mail(email, "Your MD Dance Academy parent app", first(f.parent_name),
      "You can now see your fees, lessons and classes, enter competitions and keep your details up to date in the MD Dance Academy parent app. Tap the button to choose your password.",
      "Set up my log in", link, "seven days");
    await db.from("md_families").update({ invited_at: new Date().toISOString() }).eq("id", f.id);
    return json({ ok: true, sent });
  }

  if (b.action === "set") {
    const token = String(b.token || ""), password = String(b.password || "");
    if (password.length < 10 || password.length > 72) return json({ error: "Passwords need at least 10 characters." }, 400);
    const { data: t } = await db.from("md_reset_tokens").select("id,user_id,expires_at,used").eq("token_hash", await hash(token)).maybeSingle();
    if (!t || t.used || new Date(t.expires_at) < new Date()) return json({ error: "That link has expired or already been used. Ask for a new one from the login page." }, 400);
    const { error } = await db.auth.admin.updateUserById(t.user_id, { password });
    if (error) return json({ error: "Could not set the password. Please try again." }, 500);
    await db.from("md_reset_tokens").update({ used: true }).eq("id", t.id);
    const { data: u } = await db.auth.admin.getUserById(t.user_id);
    return json({ ok: true, email: u?.user?.email ?? null });
  }
  return json({ error: "action" }, 400);
});
