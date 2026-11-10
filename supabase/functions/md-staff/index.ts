// md-staff: a principal (or Dunnworks) gives a coach or principal a staff login, or sets a new password.
// Accounts are created already confirmed, so no email is sent; the principal passes the password on.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const { data: principal } = await caller.rpc("md_is_principal");
  if (!principal) return json({ error: "Only a principal can manage staff logins." }, 403);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const password = String(b.password || "");
  if (password.length < 10 || password.length > 72) return json({ error: "Passwords need at least 10 characters." }, 400);

  if (b.action === "create") {
    const email = String(b.email || "").trim().toLowerCase(), name = String(b.name || "").trim().slice(0, 60);
    const phone = String(b.phone || "").trim().slice(0, 30) || null;
    const role = b.role === "Principal" ? "Principal" : "Coach";
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Add a name and a valid email." }, 400);
    const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { app: "md", name } });
    if (error || !made?.user) return json({ error: /registered|exists/i.test(error?.message || "") ? "That email already has a login. Ask Dunnworks to link it." : "Could not create the login." }, 409);
    const { error: e2 } = await admin.from("md_staff").insert({ user_id: made.user.id, email, name, phone, role, active: true });
    if (e2) { await admin.auth.admin.deleteUser(made.user.id); return json({ error: "Could not save the staff member." }, 500); }
    return json({ ok: true });
  }

  if (b.action === "password") {
    const uid = String(b.user_id || "");
    const { data: s } = await admin.from("md_staff").select("user_id").eq("user_id", uid).maybeSingle();
    if (!s) return json({ error: "Not an MD staff login." }, 404);
    const { error } = await admin.auth.admin.updateUserById(uid, { password });
    if (error) return json({ error: "Could not set the password." }, 500);
    return json({ ok: true });
  }
  return json({ error: "action" }, 400);
});
