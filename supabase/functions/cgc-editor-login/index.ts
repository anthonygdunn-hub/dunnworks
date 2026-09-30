// cgc-editor-login: emails a sign-in link for Stuart's editor (dunnworks.io/editor/coastal-golf-co/).
// Only addresses in public.cgc_editors get a link; everyone else gets the same "check your inbox"
// answer, so the list can't be probed. The link carries a one-time token the editor page swaps for
// a session (POST /auth/v1/verify), so no redirect settings are needed in Supabase Auth.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), RESEND_API_KEY,
// CGC_EDITOR_FROM (a sender on a domain verified in Resend, e.g. editor@coastalgolfco.co.uk).
// Falls back to BOOKING_FROM, then onboarding@resend.dev (which only reaches the Resend account owner).
import { createClient } from "npm:@supabase/supabase-js@2";

const EDITOR_URL = "https://dunnworks.io/editor/coastal-golf-co/";
const ORIGINS = [/^https:\/\/(www\.)?dunnworks\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.some((r) => r.test(origin)) ? origin : "https://dunnworks.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let email = "";
  try { email = String((await req.json()).email ?? "").trim().toLowerCase(); } catch { return json({ error: "Bad request" }, 400); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "Please enter your email address." }, 400);

  // at most 8 link requests an hour across everyone: plenty for two editors, useless for spam
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("dw_client_attempts").select("id", { count: "exact", head: true }).eq("slug", "cgc-editor-login").gte("at", since);
  if ((count ?? 0) >= 8) return json({ error: "Too many sign-in emails this hour. Please try again later." }, 429);

  const { data: ed } = await db.from("cgc_editors").select("email,name").eq("email", email).maybeSingle();
  await db.from("dw_client_attempts").insert({ slug: "cgc-editor-login", ok: !!ed });
  if (!ed) return json({ ok: true });

  // make sure the account exists, then mint a one-time sign-in token
  const made = await db.auth.admin.createUser({ email, email_confirm: true });
  if (made.error && !/already|registered|exists/i.test(made.error.message)) {
    console.error("createUser", made.error.message);
    return json({ error: "Could not send the email. Please try again." }, 500);
  }
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link?.properties?.hashed_token;
  if (error || !hashed) { console.error("generateLink", error?.message); return json({ error: "Could not send the email. Please try again." }, 500); }
  const url = `${EDITOR_URL}?token_hash=${encodeURIComponent(hashed)}&type=magiclink`;

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("CGC_EDITOR_FROM") ?? Deno.env.get("BOOKING_FROM") ?? "onboarding@resend.dev";
  const hi = ed.name ? `Hi ${ed.name},` : "Hi,";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#022042;max-width:520px">
    <p style="margin:0 0 14px">${hi}</p>
    <p style="margin:0 0 20px">Tap the button to sign in to your Coastal Golf Co editor. The link works once and runs out in an hour.</p>
    <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#022042;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">Sign in to the editor</a></p>
    <p style="margin:0;color:#5b6b85;font-size:14px">Didn't ask for this? You can ignore it; nobody can sign in without the link.</p></div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Coastal Golf Co editor <${from}>`, to: [email], subject: "Your sign-in link for the Coastal Golf Co editor", html,
        text: `${hi}\n\nSign in to your Coastal Golf Co editor (the link works once and runs out in an hour):\n${url}\n\nDidn't ask for this? You can ignore it.` }),
    });
    if (!r.ok) { console.error("Resend refused", r.status, await r.text()); return json({ error: "Could not send the email. Please try again later." }, 502); }
  } catch (e) { console.error("send failed", e); return json({ error: "Could not send the email. Please try again later." }, 502); }
  return json({ ok: true });
});
