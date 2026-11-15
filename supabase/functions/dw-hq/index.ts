// dw-hq: the server side of the console Workspace (#/hq).
//
// actions
//   me          who is signed in, owner or collaborator, and which projects they can see
//   repos       GitHub repos for anthonygdunn-hub with last commit and Pages status (cached 10 min)
//   mail_status whether Gmail is connected
//   mail_sync   pull the last 30 days of info@dunnworks.io into dw_inbox and match each to a project
//   ai          ask / draft / summary / tasks, grounded in the project's jobs, docs, contacts and email
//   invite      add or update a collaborator and send them a sign-in invite
//
// Secrets: ANTHROPIC_API_KEY (already set for cv-ai), HQ_AI_MODEL (optional),
//          GITHUB_TOKEN (optional, read-only fine-grained token; without it public repos only, 60 calls an hour),
//          GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (for the inbox; the refresh token comes from Connect Gmail in the Inbox)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const OWNER = "info@dunnworks.io";
const GH_USER = "anthonygdunn-hub";
const MODEL = Deno.env.get("HQ_AI_MODEL") ?? "claude-sonnet-5-5";
const URL_ = Deno.env.get("SUPABASE_URL")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const FREEMAIL = new Set(["gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.co.uk",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "btinternet.com", "aol.com", "sky.com", "dunnworks.io"]);
const domainOf = (s?: string | null) => {
  if (!s) return "";
  const m = String(s).toLowerCase().match(/@([^>\s]+)/);
  if (m) return m[1];
  try { return new URL(s.startsWith("http") ? s : "https://" + s).hostname.replace(/^www\./, ""); } catch { return ""; }
};

// Settings live in Supabase secrets, or in dw_hq_private (service role only, no RLS policies) so the
// console can be connected without anyone pasting keys into a dashboard.
const CFG: Record<string, string> = {};
async function loadCfg() {
  const { data } = await admin.from("dw_hq_private").select("key,value");
  (data ?? []).forEach((r: any) => { CFG[r.key] = r.value; });
}
const cfg = (env: string, key: string) => Deno.env.get(env) || CFG[key] || "";

// ------------------------------------------------------------------ GitHub
async function gh(path: string) {
  const token = cfg("GITHUB_TOKEN", "github_token");
  const r = await fetch("https://api.github.com" + path, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "dunnworks-console", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
  return r.json();
}

async function repos(force: boolean) {
  const { data: cache } = await admin.from("dw_repo_cache").select("*").eq("id", 1).maybeSingle();
  if (!force && cache && Date.now() - Date.parse(cache.fetched_at) < 10 * 60 * 1000) return { repos: cache.data, fetched_at: cache.fetched_at, cached: true };
  const token = !!cfg("GITHUB_TOKEN", "github_token");
  const list = token
    ? await gh(`/user/repos?per_page=100&sort=pushed&affiliation=owner`)
    : await gh(`/users/${GH_USER}/repos?per_page=100&sort=pushed`);
  const top = (list as any[]).slice(0, 25);
  const out = await Promise.all(top.map(async (r) => {
    const row: Record<string, unknown> = {
      full_name: r.full_name, name: r.name, private: r.private, url: r.html_url, homepage: r.homepage,
      pushed_at: r.pushed_at, default_branch: r.default_branch, open_issues: r.open_issues_count, has_pages: r.has_pages,
    };
    try {
      const c = await gh(`/repos/${r.full_name}/commits?per_page=1`);
      if (c[0]) row.last_commit = { msg: String(c[0].commit.message).split("\n")[0].slice(0, 140), at: c[0].commit.author?.date, sha: c[0].sha.slice(0, 7), url: c[0].html_url };
    } catch { /* empty repo */ }
    if (r.has_pages) {
      try { const b = await gh(`/repos/${r.full_name}/pages/builds/latest`); row.pages = { status: b.status, at: b.updated_at }; } catch { /* needs token */ }
    }
    return row;
  }));
  const fetched_at = new Date().toISOString();
  await admin.from("dw_repo_cache").upsert({ id: 1, data: out, fetched_at });
  return { repos: out, fetched_at, cached: false, authed: token };
}

// ------------------------------------------------------------------- Gmail
// The refresh token comes from the one-click Connect Gmail flow (stored in dw_hq_private, service role only)
// or, failing that, a GMAIL_REFRESH_TOKEN secret.
const REDIRECT = "https://dunnworks.io/console/";
const CID = () => cfg("GMAIL_CLIENT_ID", "gmail_client_id");
const CSECRET = () => cfg("GMAIL_CLIENT_SECRET", "gmail_client_secret");
const gmailClient = () => !!(CID() && CSECRET());
async function refreshToken() { return cfg("GMAIL_REFRESH_TOKEN", "gmail_refresh"); }
async function gmailReadyAsync() { return gmailClient() && !!(await refreshToken()); }
function gmailAuthUrl() {
  if (!gmailClient()) throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are not set in Supabase yet");
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: CID(), redirect_uri: REDIRECT, response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly", access_type: "offline", prompt: "consent",
    state: "gmail", login_hint: OWNER, include_granted_scopes: "true",
  });
}
async function gmailExchange(code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CID(), client_secret: CSECRET(),
      redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Google said: " + (j.error_description || j.error || r.status));
  if (!j.refresh_token) throw new Error("Google didn't return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again");
  const p = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json());
  await admin.from("dw_hq_private").upsert({ key: "gmail_refresh", value: j.refresh_token, updated_at: new Date().toISOString() });
  await admin.from("dw_hq_private").upsert({ key: "gmail_address", value: p.emailAddress ?? "", updated_at: new Date().toISOString() });
  CFG.gmail_refresh = j.refresh_token;
  return { ok: true, address: p.emailAddress };
}

async function gmailToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CID(), client_secret: CSECRET(),
      refresh_token: await refreshToken(), grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Gmail sign-in failed: " + (j.error_description || j.error || r.status));
  return j.access_token as string;
}

async function mailSync() {
  if (!(await gmailReadyAsync())) return { connected: false, added: 0 };
  const tok = await gmailToken();
  const g = async (p: string) => {
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + p, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  };
  const list = await g("messages?maxResults=60&q=" + encodeURIComponent("in:inbox newer_than:30d -category:promotions -category:social"));
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  if (!ids.length) return { connected: true, added: 0 };
  const { data: have } = await admin.from("dw_inbox").select("id").in("id", ids);
  const known = new Set((have ?? []).map((h: any) => h.id));
  const fresh = ids.filter((i) => !known.has(i));

  // project matching: exact contact email, then business domain
  const [{ data: projects }, { data: contacts }] = await Promise.all([
    admin.from("dw_projects").select("id,name,contact_email,website,live_url"),
    admin.from("dw_contacts").select("project_id,email"),
  ]);
  const byEmail = new Map<string, string>(), byDomain = new Map<string, string>();
  (projects ?? []).forEach((p: any) => {
    if (p.contact_email) byEmail.set(p.contact_email.toLowerCase(), p.id);
    [p.contact_email, p.website, p.live_url].forEach((v) => { const d = domainOf(v); if (d && !FREEMAIL.has(d)) byDomain.set(d, p.id); });
  });
  (contacts ?? []).forEach((c: any) => { if (c.email) byEmail.set(c.email.toLowerCase(), c.project_id); });
  let added = 0; const rows: any[] = [];
  for (const id of fresh) {
    const m = await g(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const h = (n: string) => (m.payload?.headers ?? []).find((x: any) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    const from = h("From");
    const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    const name = from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || email;
    const project_id = byEmail.get(email) ?? byDomain.get(domainOf(email)) ?? null;
    const row = {
      id, thread_id: m.threadId, from_email: email, from_name: name, subject: h("Subject") || "(no subject)",
      snippet: String(m.snippet ?? "").slice(0, 300), received_at: new Date(Number(m.internalDate)).toISOString(),
      project_id, is_read: !(m.labelIds ?? []).includes("UNREAD"),
    };
    await admin.from("dw_inbox").upsert(row); rows.push(row);
    if (project_id) await admin.from("dw_activity").insert({ actor: email, project_id, kind: "email", ref_id: id, summary: `email from ${name}: ${row.subject}`.slice(0, 200) });
    added++;
  }
  return { connected: true, added, rows };
}

// ------------------------------------------------------------------- push
// Phone alerts for the Workspace app (dunnworks.io/hq). Subscriptions in dw_push_subs, VAPID keys and
// the cron key in dw_hq_private. pg_cron calls { action: "tick" } every 10 minutes with x-cron.
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
async function push(kind: string, title: string, body: string, url: string, only?: string) {
  if (!CFG.vapid_public || !CFG.vapid_private) return { sent: 0 };
  webpush.setVapidDetails("mailto:info@dunnworks.io", CFG.vapid_public, CFG.vapid_private);
  let q = admin.from("dw_push_subs").select("id,endpoint,p256dh,auth,prefs");
  if (only) q = q.eq("endpoint", only);
  const { data: subs } = await q;
  const msg = JSON.stringify({ title: clip(title, 60), body: clip(body, 180), url, tag: kind + "-" + Date.now() });
  let sent = 0;
  for (const s of subs ?? []) {
    if (!only && s.prefs && s.prefs[kind] === false) continue;
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, { TTL: 12 * 3600 }); sent++;
      await admin.from("dw_push_subs").update({ last_ok: new Date().toISOString() }).eq("id", s.id); }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await admin.from("dw_push_subs").delete().eq("id", s.id); else console.error("push", c); }
  }
  return { sent };
}
const londonNow = () => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ""; return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) }; };

async function tick() {
  const st: any = (() => { try { return JSON.parse(CFG.push_state || "null"); } catch { return null; } })() || {};
  const first = !st.started; const now = londonNow(); const out: Record<string, unknown> = {};
  const save = async () => { st.started = true; await admin.from("dw_hq_private").upsert({ key: "push_state", value: JSON.stringify(st), updated_at: new Date().toISOString() }); };
  const A = "/hq/#/hq";
  // 1. new client email (Gmail sync, matched to a project)
  try {
    const m: any = await mailSync();
    const hits = (m.rows || []).filter((r: any) => r.project_id);
    out.mail = { added: m.added, matched: hits.length };
    if (!first && hits.length) {
      const { data: ps } = await admin.from("dw_projects").select("id,name").in("id", hits.map((h: any) => h.project_id));
      const nm = new Map((ps ?? []).map((p: any) => [p.id, p.name]));
      if (hits.length <= 3) for (const h of hits) await push("email", `${nm.get(h.project_id) ?? "Client"}: ${h.from_name}`, h.subject, A + "/inbox");
      else await push("email", `${hits.length} new client emails`, hits.slice(0, 3).map((h: any) => nm.get(h.project_id)).join(", "), A + "/inbox");
    }
  } catch (e) { out.mail = String((e as Error).message); }
  // 2. enquiries and bookings: form sends counted by t.js, plus the sites' own tables
  const { data: ev } = await admin.from("dw_site_events").select("site,kind,n").eq("day", now.day).in("kind", ["form", "booking"]);
  const tot: Record<string, number> = {}; (ev ?? []).forEach((r: any) => { const k = r.site + "|" + r.kind; tot[k] = (tot[k] || 0) + r.n; });
  if (st.evday !== now.day) { st.evday = now.day; st.ev = {}; }
  for (const k of Object.keys(tot)) {
    const was = st.ev[k] || 0;
    if (!first && tot[k] > was) { const [site, kind] = k.split("|"); await push("enquiry", kind === "booking" ? "New booking" : "New enquiry", `${tot[k] - was} on ${site.replace(/-/g, " ")}`, A + "/dashboards/" + site); }
    st.ev[k] = tot[k];
  }
  const since = st.forms_at || new Date().toISOString();
  const forms: [string, string, string, string][] = [["cgc_bookings", "Coastal Golf Co booking", "service", "coastal-golf-co"], ["tcooper_enquiries", "T Cooper enquiry", "service", "tcooper-interiors"], ["hh_testers", "Honest Handicap tester application", "course", "honest-handicap"]];
  for (const [t, label, col, site] of forms) {
    const { data } = await admin.from(t).select(`created_at,name,${col}`).gt("created_at", since).order("created_at");
    if (!first) for (const r of (data ?? []).slice(0, 3)) await push("enquiry", label, `${r.name ?? "Someone"}${(r as any)[col] ? ": " + (r as any)[col] : ""}`, A + "/dashboards/" + site);
  }
  st.forms_at = new Date().toISOString();
  // 3. collaborator and client activity
  const { data: acts } = await admin.from("dw_activity").select("id,actor,summary,project_id").gt("id", st.act_id || 0).order("id").limit(50);
  const mine = (a: string) => !a || a === OWNER || a === "me" || a === "system";
  const theirs = (acts ?? []).filter((a: any) => !mine(a.actor) && !String(a.summary).startsWith("email from"));
  if (!first && theirs.length) {
    const { data: ms } = await admin.from("dw_members").select("email,name");
    const who = (a: string) => a === "client" ? "Client" : (ms ?? []).find((m: any) => m.email === a)?.name ?? a.split("@")[0];
    if (theirs.length <= 3) for (const a of theirs) await push("activity", who(a.actor), a.summary, A);
    else await push("activity", `${theirs.length} updates from collaborators`, theirs.slice(0, 2).map((a: any) => who(a.actor) + " " + a.summary).join("; "), A);
  }
  if (acts?.length) st.act_id = acts[acts.length - 1].id;
  // 4. morning summary, once a day from 7am
  if (now.hour >= 7 && st.summary_day !== now.day) {
    st.summary_day = now.day;
    if (!first) {
      const [{ data: due }, { data: chase }, { count: unread }] = await Promise.all([
        admin.from("dw_project_tasks").select("due_on").eq("done", false).or("owner.eq.me,owner.is.null").lte("due_on", now.day),
        admin.from("dw_projects").select("name").lte("next_action_on", now.day).not("stage", "in", "(won,lost,parked)"),
        admin.from("dw_inbox").select("id", { count: "exact", head: true }).eq("is_read", false).eq("archived", false),
      ]);
      const today = (due ?? []).filter((d: any) => d.due_on === now.day).length, late = (due ?? []).length - today;
      const bits = [today ? `${today} due today` : "", late ? `${late} overdue` : "", chase?.length ? `${chase.length} to chase` : "", unread ? `${unread} unread email${unread === 1 ? "" : "s"}` : ""].filter(Boolean);
      await push("summary", "Good morning", bits.length ? bits.join(" · ") : "Nothing due today. Enjoy it.", A);
    }
  }
  await save();
  return { ok: true, first, ...out };
}

// --------------------------------------------------------------------- AI
async function claude(system: string, user: string, maxTokens = 2500) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in Supabase (Edge Functions > Secrets)");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

const SAFE_COLS = "id,slug,name,sector,blurb,status,stage,hq_group,is_live,live_url,website,go_live_on,contact_name,contact_email,contact_phone,last_contact_on,next_action,next_action_on,outreach_notes,deal_value";

async function context(projectId: string | null) {
  if (projectId) {
    const [{ data: p }, { data: t }, { data: d }, { data: c }, { data: m }] = await Promise.all([
      admin.from("dw_projects").select(SAFE_COLS).eq("id", projectId).maybeSingle(),
      admin.from("dw_project_tasks").select("title,details,owner,phase,due_on,done,hq_state").eq("project_id", projectId).order("sort_order"),
      admin.from("dw_docs").select("title,body").eq("project_id", projectId),
      admin.from("dw_contacts").select("name,role,email,phone,notes").eq("project_id", projectId),
      admin.from("dw_inbox").select("from_name,subject,snippet,received_at").eq("project_id", projectId).order("received_at", { ascending: false }).limit(10),
    ]);
    return `PROJECT\n${JSON.stringify(p)}\n\nJOBS\n${JSON.stringify(t)}\n\nDOCS\n${(d ?? []).map((x: any) => `# ${x.title}\n${x.body}`).join("\n\n").slice(0, 20000)}\n\nCONTACTS\n${JSON.stringify(c)}\n\nRECENT EMAIL\n${JSON.stringify(m)}`;
  }
  const [{ data: ps }, { data: t }, { data: d }] = await Promise.all([
    admin.from("dw_projects").select("id,name,status,stage,hq_group,go_live_on,next_action,next_action_on").neq("hq_group", "prospect"),
    admin.from("dw_project_tasks").select("project_id,title,owner,due_on,done,hq_state").eq("done", false),
    admin.from("dw_docs").select("title,body").is("project_id", null),
  ]);
  const name = new Map((ps ?? []).map((p: any) => [p.id, p.name]));
  const open = (t ?? []).filter((x: any) => name.has(x.project_id)).map((x: any) => ({ ...x, project: name.get(x.project_id), project_id: undefined }));
  return `PROJECTS (own products and clients)\n${JSON.stringify(ps)}\n\nOPEN JOBS\n${JSON.stringify(open).slice(0, 30000)}\n\nGENERAL DOCS\n${(d ?? []).map((x: any) => `# ${x.title}\n${x.body}`).join("\n\n")}`;
}

const SYSTEM = `You are the assistant inside the Dunnworks console. Dunnworks is Tony Dunn's one-person web design business in Bordon, Hampshire: hand-coded sites for small businesses, no monthly licence, the client owns the files. He also runs his own products (woolmer.info, Honest Handicap, Awayday, Funworks, Trip Log).
House style: UK English spelling. Bullet points never end with a full stop. Professional, plain and direct. Never invent facts, prices, dates or promises that are not in the context; say what is missing instead. Emails are written in first person singular, signed Tony.`;

async function ai(b: Record<string, any>) {
  const mode = String(b.mode ?? "ask");
  const ctx = await context(b.project_id ? String(b.project_id) : null);
  const ask = String(b.prompt ?? "").slice(0, 4000);
  const brief: Record<string, string> = {
    ask: "Answer the question using the context.",
    draft: "Draft the email or message described. Give a subject line first as 'Subject: ...', then the body. Keep it short.",
    summary: "Summarise where this stands in under 150 words: what's done, what's next, what's blocking, and anything overdue.",
    tasks: "Break the request into concrete jobs. Return ONLY JSON: {\"tasks\":[{\"title\":string,\"details\":string|null,\"owner\":\"me\"|\"client\",\"due_on\":\"YYYY-MM-DD\"|null}]}. Max 12, no duplicates of existing jobs.",
  };
  const today = new Date().toISOString().slice(0, 10);
  const text = await claude(SYSTEM + `\nToday is ${today}.\n` + (brief[mode] ?? brief.ask), `CONTEXT\n${ctx}\n\nREQUEST\n${ask || "(none)"}`);
  if (mode === "tasks") {
    const a = text.indexOf("{"), z = text.lastIndexOf("}");
    try { return { tasks: JSON.parse(text.slice(a, z + 1)).tasks ?? [] }; } catch { return { text }; }
  }
  return { text };
}

// ------------------------------------------------------------------ invite
async function invite(b: Record<string, any>) {
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That email address doesn't look right");
  if (email === OWNER) throw new Error("That's you");
  const row = {
    email, name: String(b.name ?? email), role: b.role === "client" ? "client" : "collaborator",
    task_owner: b.task_owner ? String(b.task_owner).toLowerCase() : null,
    project_ids: Array.isArray(b.project_ids) ? b.project_ids : [], active: b.active !== false, invited_at: new Date().toISOString(),
  };
  const { error } = await admin.from("dw_members").upsert(row);
  if (error) throw error;
  let sent = false, note = "";
  if (b.send !== false && row.active) {
    const { error: e } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: "https://dunnworks.io/console/#/hq" });
    if (e) note = /already/i.test(e.message) ? "Already has a login: they can use Email me a link on the console sign-in." : e.message;
    else sent = true;
  }
  return { ok: true, sent, note };
}

// ------------------------------------------------------------------- serve
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const cron = req.headers.get("x-cron");
  if (cron) {
    await loadCfg();
    if (!CFG.cron_key || cron !== CFG.cron_key) return json({ error: "no" }, 403);
    try { return json(await tick()); } catch (e) { return json({ error: String((e as Error).message) }, 500); }
  }
  const sb = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await sb.auth.getUser();
  const email = (u?.user?.email ?? "").toLowerCase();
  if (!email) return json({ error: "Sign in first" }, 401);
  const isOwner = email === OWNER;
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch { /* empty */ }

  try {
    await loadCfg();
    if (b.action === "me") {
      if (isOwner) return json({ email, owner: true });
      const { data: m } = await admin.from("dw_members").select("name,role,task_owner,project_ids,active").eq("email", email).maybeSingle();
      return json({ email, owner: false, member: m && m.active ? m : null });
    }
    if (!isOwner) return json({ error: "Only Tony can do that" }, 403);
    switch (b.action) {
      case "repos": return json(await repos(!!b.force));
      case "mail_status": {
        const { data: last } = await admin.from("dw_inbox").select("created_at").order("created_at", { ascending: false }).limit(1);
        return json({ connected: await gmailReadyAsync(), client: gmailClient(), address: CFG.gmail_address || null, last: last?.[0]?.created_at ?? null });
      }
      case "mail_sync": return json(await mailSync());
      case "gmail_auth_url": return json({ url: gmailAuthUrl() });
      case "gmail_exchange": return json(await gmailExchange(String(b.code ?? "")));
      case "ai": return json(await ai(b));
      case "push_key": return json({ key: CFG.vapid_public ?? null });
      case "push_subscribe": {
        const sub = b.sub ?? {};
        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("No subscription");
        const row: any = { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: clip(b.device, 80) };
        if (b.prefs) row.prefs = b.prefs;
        await admin.from("dw_push_subs").upsert(row, { onConflict: "endpoint" });
        return json({ ok: true });
      }
      case "push_prefs": { await admin.from("dw_push_subs").update({ prefs: b.prefs }).eq("endpoint", String(b.endpoint ?? "")); return json({ ok: true }); }
      case "push_get": { const { data } = await admin.from("dw_push_subs").select("prefs,created_at,last_ok").eq("endpoint", String(b.endpoint ?? "")).maybeSingle(); return json({ sub: data }); }
      case "push_unsubscribe": { await admin.from("dw_push_subs").delete().eq("endpoint", String(b.endpoint ?? "")); return json({ ok: true }); }
      case "push_test": return json(await push("test", "Dunnworks", "Alerts are working. This is your phone talking.", "/hq/#/hq", String(b.endpoint ?? "")));
      case "invite": return json(await invite(b));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 500) }, 500);
  }
});
