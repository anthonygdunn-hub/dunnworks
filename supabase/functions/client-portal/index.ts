// client-portal: the Dunnworks client page (dunnworks.io/client/<slug>/).
// A client signs in with their project passphrase (the same one as their preview),
// sees the launch plan, ticks their own jobs, replies to jobs and uploads files.
// Everything goes through here with the service role; the tables stay owner-only.
//
// Secrets used: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in),
// RESEND_API_KEY (optional, for the heads-up email), PORTAL_NOTIFY_TO (default info@dunnworks.io),
// NOTIFY_FROM (default onboarding@resend.dev).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const BUCKET = "client-files";
const CLIENT_OWNERS = (o: string) => o !== "me" && o !== "google";

async function tooManyFailures(slug: string) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db.from("dw_client_attempts").select("id", { count: "exact", head: true })
    .eq("slug", slug).eq("ok", false).gte("at", since);
  return (count ?? 0) >= 10;
}

async function signIn(slug: string, pass: string) {
  if (!slug || !pass) return null;
  if (await tooManyFailures(slug)) return "locked";
  const { data: p } = await db.from("dw_projects").select("id,name,slug,go_live_on,hours_per_day,contact_name")
    .eq("slug", slug).maybeSingle();
  let ok = false;
  if (p) {
    const { data: s } = await db.from("dw_project_secrets").select("passphrase").eq("project_id", p.id).maybeSingle();
    ok = !!s?.passphrase && s.passphrase.trim() === pass.trim();
  }
  await db.from("dw_client_attempts").insert({ slug, ok });
  return ok ? p : null;
}

async function notify(project: { name: string; slug: string }, subject: string, lines: string[]) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const to = Deno.env.get("PORTAL_NOTIFY_TO") ?? "info@dunnworks.io";
  const from = Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a141c">
    <h2 style="margin:0 0 6px">${esc(project.name)}: ${esc(subject)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 10px;white-space:pre-wrap">${esc(l)}</p>`).join("")}
    <p style="margin:18px 0 0"><a href="https://dunnworks.io/console/#/wip">Open the console</a></p></div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Dunnworks client page <${from}>`, to: [to], subject: `${project.name}: ${subject}`, html, text: lines.join("\n\n") }),
    });
  } catch (e) { console.error("notify failed", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const p = await signIn(String(b.slug ?? ""), String(b.pass ?? ""));
  if (p === "locked") return json({ error: "Too many attempts. Please wait 15 minutes and try again." }, 429);
  if (!p) return json({ error: "That passphrase doesn't match. Check the one Tony sent you." }, 401);
  const project = p as { id: string; name: string; slug: string; go_live_on: string | null; hours_per_day: number | null; contact_name: string | null };

  // a task that belongs to this project (and, for client actions, is theirs)
  const taskOf = async (id: string, clientOnly: boolean) => {
    const { data: t } = await db.from("dw_project_tasks").select("id,title,client_title,owner,project_id,done")
      .eq("id", id).eq("project_id", project.id).eq("client_hidden", false).maybeSingle();
    if (!t) return null;
    if (clientOnly && !CLIENT_OWNERS(t.owner)) return null;
    return t;
  };

  switch (b.action) {
    case "load": {
      const [{ data: tasks }, { data: notes }, { data: files }, { data: pack }] = await Promise.all([
        db.from("dw_project_tasks").select("id,title,client_title,client_note,details,owner,phase,due_on,done,done_at,sort_order,est_hours,milestone,waits")
          .eq("project_id", project.id).eq("client_hidden", false).order("sort_order"),
        db.from("dw_task_notes").select("id,task_id,author,body,created_at").eq("project_id", project.id).order("created_at"),
        db.from("dw_task_files").select("id,task_id,name,size,mime,author,created_at").eq("project_id", project.id).order("created_at"),
        db.from("dw_project_packs").select("pack").eq("project_id", project.id).maybeSingle(),
      ]);
      const owners = (pack?.pack as any)?.owners ?? {};
      const safe = (tasks ?? []).map((t: any) => {
        const mine = CLIENT_OWNERS(t.owner);
        return {
          id: t.id, owner: t.owner, phase: t.phase, due_on: t.due_on, done: t.done, done_at: t.done_at,
          sort_order: t.sort_order, est_hours: t.est_hours, milestone: t.milestone, waits: t.waits,
          title: t.client_title || t.title,
          // your working notes stay private; only client-facing wording is shared
          note: mine ? (t.client_note ?? t.details ?? "") : (t.client_note ?? ""),
          yours: mine,
        };
      });
      const seen = new Set(safe.map((t: any) => t.id));
      return json({
        project: { name: project.name, slug: project.slug, go_live_on: project.go_live_on, hours_per_day: project.hours_per_day ?? 4, contact_name: project.contact_name },
        owners, tasks: safe,
        notes: (notes ?? []).filter((n: any) => seen.has(n.task_id)),
        files: (files ?? []).filter((f: any) => seen.has(f.task_id)),
      });
    }
    case "tick": {
      const t = await taskOf(String(b.task), true);
      if (!t) return json({ error: "You can only tick your own jobs." }, 403);
      const done = !!b.done;
      await db.from("dw_project_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", t.id);
      if (done) await notify(project, `ticked "${t.client_title || t.title}"`, [`${project.contact_name || "Your client"} marked this job as done on their client page.`]);
      return json({ ok: true });
    }
    case "reply": {
      const t = await taskOf(String(b.task), false);
      const body = String(b.body ?? "").trim().slice(0, 5000);
      if (!t || !body) return json({ error: "Nothing to send." }, 400);
      const { data: n } = await db.from("dw_task_notes").insert({ task_id: t.id, project_id: project.id, author: "client", body })
        .select("id,task_id,author,body,created_at").single();
      await notify(project, `replied on "${t.client_title || t.title}"`, [body]);
      return json({ ok: true, note: n });
    }
    case "upload-url": {
      const t = await taskOf(String(b.task), false);
      const name = String(b.name ?? "file").replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
      if (!t) return json({ error: "Unknown job." }, 400);
      if (Number(b.size ?? 0) > 50 * 1024 * 1024) return json({ error: "That file is over 50 MB. Send it by WeTransfer instead." }, 400);
      const path = `${project.slug}/${t.id}/${crypto.randomUUID()}-${name}`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 500);
      return json({ path, token: data.token, signedUrl: data.signedUrl });
    }
    case "upload-done": {
      const t = await taskOf(String(b.task), false);
      const path = String(b.path ?? "");
      if (!t || !path.startsWith(`${project.slug}/${t.id}/`)) return json({ error: "Unknown upload." }, 400);
      const { data: f, error } = await db.from("dw_task_files").insert({
        task_id: t.id, project_id: project.id, path, name: String(b.name ?? "file").slice(0, 200),
        size: Number(b.size ?? 0) || null, mime: String(b.mime ?? "") || null, author: "client",
      }).select("id,task_id,name,size,mime,author,created_at").single();
      if (error) return json({ error: error.message }, 500);
      await notify(project, `uploaded a file to "${t.client_title || t.title}"`, [String(b.name ?? "file")]);
      return json({ ok: true, file: f });
    }
    case "file-url": {
      const { data: f } = await db.from("dw_task_files").select("path,name").eq("id", String(b.file)).eq("project_id", project.id).maybeSingle();
      if (!f) return json({ error: "File not found." }, 404);
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(f.path, 600, { download: f.name });
      if (error) return json({ error: error.message }, 500);
      return json({ url: data.signedUrl });
    }
    default:
      return json({ error: "Unknown action." }, 400);
  }
});
