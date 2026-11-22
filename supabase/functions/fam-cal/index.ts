// fam-cal: keeps Dunn Hub (dunnworks.io/family) and the joint Google calendar in step.
//   { action: "status" }                       is Google connected? which calendar? last sync
//   { action: "sync" }                         push app-only events up, then pull the window down
//   { action: "save", ev, scope: "one"|"all" } create or edit an event (Google first when connected)
//   { action: "delete", id, scope }            delete one occurrence or the whole series
// Callers: a family member's JWT (email listed in fam_members, or info@dunnworks.io),
// or pg_cron with the x-cron header matching fam_private.cron.
// Google: a service account key in the FAM_GOOGLE_SA secret (JSON). Share the calendar named in
// fam_settings.gcal_id with the service account's email, with "Make changes to events".
// Until that is done everything still works in the app, and events wait as sync_status = 'local'.
// Who an event is for, the driver and "needs a lift" travel in the Google event's private
// extended properties, so they survive edits made in Google Calendar itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const OWNER = "info@dunnworks.io";
const TZ = "Europe/London";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Row = Record<string, unknown> & { id: string };
type Ev = {
  id?: string; title: string; all_day?: boolean; starts_at?: string; ends_at?: string; start_date?: string; end_date?: string;
  location?: string; notes?: string; people?: string[]; driver?: string | null; needs_lift?: boolean;
  recurrence?: string | null; until_date?: string | null;
};

// ---------------------------------------------------------------- google
let tok: { v: string; exp: number } | null = null;
function sa() {
  const raw = Deno.env.get("FAM_GOOGLE_SA");
  if (!raw) return null;
  try { const j = JSON.parse(raw); return j.client_email && j.private_key ? j as { client_email: string; private_key: string } : null; } catch { return null; }
}
async function token() {
  if (tok && tok.exp > Date.now() + 60_000) return tok.v;
  const s = sa(); if (!s) throw new Error("not_configured");
  const key = await importPKCS8(s.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/calendar.events" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(s.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json();
  if (!r.ok) throw new Error("Google sign-in: " + (j.error_description ?? j.error ?? r.status));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tok.v;
}
async function calId() {
  const { data } = await db.from("fam_settings").select("value").eq("key", "gcal_id").maybeSingle();
  return (data?.value as string) || "";
}
async function g(method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const cal = encodeURIComponent(await calId());
  const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${cal}${path}`);
  Object.entries(query ?? {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { method, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204 || (method === "DELETE" && (r.status === 410 || r.status === 404))) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message ?? String(r.status);
    if (r.status === 404 || r.status === 403) throw new Error(`Google calendar not shared with the app yet (${msg})`);
    throw new Error("Google: " + msg);
  }
  return j;
}

// ---------------------------------------------------------------- mapping
const RRULE: Record<string, string> = { weekly: "FREQ=WEEKLY", fortnightly: "FREQ=WEEKLY;INTERVAL=2", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };
const FOOT = "— Dunn Hub:";
const stripFoot = (s?: string | null) => String(s ?? "").split("\n").filter((l) => !l.startsWith(FOOT)).join("\n").trim();

async function people() {
  const { data } = await db.from("fam_people").select("id,name,gcal_colour");
  return (data ?? []) as { id: string; name: string; gcal_colour: string | null }[];
}
function infer(text: string, ppl: { id: string; name: string }[]) {
  const t = " " + text.toLowerCase() + " ";
  const hit = ppl.filter((p) => p.id !== "family" && (t.includes(p.name.toLowerCase()) ||
    (p.id === "stanley" && /\bstan\b/.test(t)) || (p.id === "nana" && /\bamanda\b/.test(t))));
  return hit.length ? hit.map((p) => p.id) : ["family"];
}
function toGoogle(ev: Ev, ppl: { id: string; name: string; gcal_colour: string | null }[], withRecurrence: boolean) {
  const who = (ev.people?.length ? ev.people : ["family"]);
  const names = who.map((id) => ppl.find((p) => p.id === id)?.name ?? id);
  const driver = ev.driver ? (ppl.find((p) => p.id === ev.driver)?.name ?? ev.driver) : "";
  const foot = `${FOOT} ${names.join(", ")}${ev.needs_lift ? " · Lift: " + (driver || "not sorted yet") : ""}`;
  const notes = stripFoot(ev.notes);
  const body: Record<string, unknown> = {
    summary: ev.title,
    location: ev.location ?? "",
    description: (notes ? notes + "\n\n" : "") + foot,
    extendedProperties: { private: { fam_people: who.join(","), fam_driver: ev.driver ?? "", fam_lift: ev.needs_lift ? "1" : "0" } },
  };
  const colour = who.length === 1 ? ppl.find((p) => p.id === who[0])?.gcal_colour : null;
  if (colour) body.colorId = colour;
  if (ev.all_day) {
    body.start = { date: ev.start_date }; body.end = { date: ev.end_date ?? ev.start_date };
  } else {
    body.start = { dateTime: ev.starts_at, timeZone: TZ }; body.end = { dateTime: ev.ends_at ?? ev.starts_at, timeZone: TZ };
  }
  if (withRecurrence && ev.recurrence && RRULE[ev.recurrence]) {
    body.recurrence = ["RRULE:" + RRULE[ev.recurrence] + (ev.until_date ? ";UNTIL=" + ev.until_date.replace(/-/g, "") + "T235959Z" : "")];
  }
  return body;
}
// deno-lint-ignore no-explicit-any
function fromGoogle(e: any, ppl: { id: string; name: string }[]): Row {
  const p = e.extendedProperties?.private ?? {};
  const tagged = typeof p.fam_people === "string" && p.fam_people.length > 0;
  return {
    id: "g:" + e.id, series_id: e.recurringEventId ?? null,
    title: e.summary || "(No title)", all_day: !!e.start?.date,
    starts_at: e.start?.dateTime ?? null, ends_at: e.end?.dateTime ?? null,
    start_date: e.start?.date ?? null, end_date: e.end?.date ?? null,
    location: e.location ?? null, notes: stripFoot(e.description) || null,
    people: tagged ? p.fam_people.split(",") : infer(`${e.summary ?? ""} ${e.description ?? ""}`, ppl),
    driver: p.fam_driver || null, needs_lift: p.fam_lift === "1",
    recurrence: null, until_date: null,
    source: tagged ? "app" : "google", sync_status: "synced", sync_error: null, updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- sync
async function setStatus(ok: boolean, error: string | null) {
  await db.from("fam_settings").upsert({ key: "gcal_last_sync", value: { at: new Date().toISOString(), ok, error }, updated_at: new Date().toISOString() });
}
async function pushLocal(ppl: Awaited<ReturnType<typeof people>>) {
  const { data } = await db.from("fam_events").select("*").in("sync_status", ["local", "error"]);
  for (const r of (data ?? []) as Ev[] & Row[]) {
    try {
      await g("POST", "/events", toGoogle(r as unknown as Ev, ppl, true));
      await db.from("fam_events").delete().eq("id", r.id);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "not_configured" || msg.startsWith("Google calendar not shared")) throw e;
      await db.from("fam_events").update({ sync_status: "error", sync_error: msg }).eq("id", r.id);
    }
  }
}
async function pull(ppl: Awaited<ReturnType<typeof people>>) {
  const min = new Date(Date.now() - 45 * 864e5).toISOString();
  const max = new Date(Date.now() + 400 * 864e5).toISOString();
  const rows: Row[] = [];
  let pageToken = "";
  do {
    const q: Record<string, string> = { singleEvents: "true", timeMin: min, timeMax: max, maxResults: "2500", orderBy: "startTime" };
    if (pageToken) q.pageToken = pageToken;
    const j = await g("GET", "/events", undefined, q);
    // deno-lint-ignore no-explicit-any
    for (const e of (j.items ?? []) as any[]) if (e.status !== "cancelled") rows.push(fromGoogle(e, ppl));
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("fam_events").upsert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const seen = new Set(rows.map((r) => r.id));
  const { data: old } = await db.from("fam_events").select("id").like("id", "g:%");
  const gone = (old ?? []).map((r) => r.id as string).filter((id) => !seen.has(id));
  for (let i = 0; i < gone.length; i += 200) await db.from("fam_events").delete().in("id", gone.slice(i, i + 200));
  return rows.length;
}
async function fullSync() {
  if (!sa()) { await setStatus(false, "not_configured"); return { connected: false, reason: "not_configured" }; }
  try {
    const ppl = await people();
    await pushLocal(ppl);
    const n = await pull(ppl);
    await setStatus(true, null);
    return { connected: true, events: n };
  } catch (e) {
    const msg = (e as Error).message;
    await setStatus(false, msg);
    return { connected: false, reason: msg };
  }
}

// ---------------------------------------------------------------- save / delete
const localId = () => "l:" + crypto.randomUUID();
function clean(ev: Ev, by: string): Row {
  return {
    id: ev.id && ev.id.startsWith("l:") ? ev.id : localId(),
    series_id: null, title: String(ev.title ?? "").trim().slice(0, 200) || "Untitled",
    all_day: !!ev.all_day,
    starts_at: ev.all_day ? null : ev.starts_at ?? null, ends_at: ev.all_day ? null : ev.ends_at ?? null,
    start_date: ev.all_day ? ev.start_date ?? null : null, end_date: ev.all_day ? ev.end_date ?? null : null,
    location: ev.location || null, notes: ev.notes || null,
    people: ev.people?.length ? ev.people : ["family"], driver: ev.driver || null, needs_lift: !!ev.needs_lift,
    recurrence: ev.recurrence && RRULE[ev.recurrence] ? ev.recurrence : null, until_date: ev.until_date || null,
    source: "app", sync_status: "local", sync_error: null, created_by: by, updated_at: new Date().toISOString(),
  };
}
async function save(ev: Ev, scope: string, by: string) {
  const ppl = await people();
  const existing = ev.id ? (await db.from("fam_events").select("*").eq("id", ev.id).maybeSingle()).data as Row | null : null;
  const isGoogle = !!existing && existing.id.startsWith("g:");
  if (!sa() || (!isGoogle && !(await canReachGoogle()))) {
    if (isGoogle) throw new Error("Google calendar isn't reachable right now, try again in a minute");
    const row = clean(ev, by);
    const { error } = await db.from("fam_events").upsert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, local: true };
  }
  if (!existing || existing.id.startsWith("l:")) {
    await g("POST", "/events", toGoogle(ev, ppl, true));
    if (existing) await db.from("fam_events").delete().eq("id", existing.id);
  } else if (scope === "all" && existing.series_id) {
    const sid = existing.series_id as string;
    const series = await g("GET", `/events/${encodeURIComponent(sid)}`);
    const body = toGoogle(ev, ppl, false);
    if (ev.all_day && existing.all_day && series.start?.date) {
      const shift = Date.parse(ev.start_date!) - Date.parse(existing.start_date as string);
      const len = Date.parse(ev.end_date ?? ev.start_date!) - Date.parse(ev.start_date!);
      const s = new Date(Date.parse(series.start.date) + shift);
      body.start = { date: s.toISOString().slice(0, 10) };
      body.end = { date: new Date(s.getTime() + Math.max(len, 864e5)).toISOString().slice(0, 10) };
    } else if (!ev.all_day && !existing.all_day && series.start?.dateTime) {
      const shift = Date.parse(ev.starts_at!) - Date.parse(existing.starts_at as string);
      const len = Date.parse(ev.ends_at ?? ev.starts_at!) - Date.parse(ev.starts_at!);
      const s = new Date(Date.parse(series.start.dateTime) + shift);
      body.start = { dateTime: s.toISOString(), timeZone: TZ };
      body.end = { dateTime: new Date(s.getTime() + len).toISOString(), timeZone: TZ };
    } else { delete body.start; delete body.end; }
    await g("PATCH", `/events/${encodeURIComponent(sid)}`, body);
  } else {
    await g("PATCH", `/events/${encodeURIComponent(existing.id.slice(2))}`, toGoogle(ev, ppl, false));
  }
  await pull(ppl);
  await setStatus(true, null);
  return { ok: true };
}
let reach: boolean | null = null;
async function canReachGoogle() {
  if (reach !== null) return reach;
  try { await g("GET", "/events", undefined, { maxResults: "1" }); reach = true; } catch { reach = false; }
  return reach;
}
async function remove(id: string, scope: string) {
  const { data: row } = await db.from("fam_events").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: true };
  if (id.startsWith("l:")) { await db.from("fam_events").delete().eq("id", id); return { ok: true }; }
  if (scope === "all" && row.series_id) {
    await g("DELETE", `/events/${encodeURIComponent(row.series_id)}`);
    await db.from("fam_events").delete().eq("series_id", row.series_id);
  } else {
    await g("DELETE", `/events/${encodeURIComponent(id.slice(2))}`);
    await db.from("fam_events").delete().eq("id", id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- handler
async function caller(req: Request) {
  const cron = req.headers.get("x-cron");
  if (cron) {
    const { data } = await db.from("fam_private").select("v").eq("k", "cron").maybeSingle();
    return data?.v && data.v === cron ? "cron" : null;
  }
  const t = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(t);
  const email = u?.user?.email?.toLowerCase();
  if (!email) return null;
  if (email === OWNER) return email;
  const { data: m } = await db.from("fam_members").select("email").eq("email", email).maybeSingle();
  return m ? email : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await caller(req);
  if (!who) return json({ error: "Family members only" }, 403);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* empty */ }
  const by = String(b.by ?? who).slice(0, 40);
  try {
    switch (b.action ?? "sync") {
      case "status": {
        const s = sa();
        const { data } = await db.from("fam_settings").select("value").eq("key", "gcal_last_sync").maybeSingle();
        let reachable = false, error: string | null = null;
        if (s) { try { await g("GET", "/events", undefined, { maxResults: "1" }); reachable = true; } catch (e) { error = (e as Error).message; } }
        return json({ configured: !!s, connected: reachable, sa_email: s?.client_email ?? null, calendar_id: await calId(), last: data?.value ?? null, error });
      }
      case "sync": return json(await fullSync());
      case "save": return json(await save(b.ev as Ev, String(b.scope ?? "one"), by));
      case "delete": return json(await remove(String(b.id), String(b.scope ?? "one")));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
