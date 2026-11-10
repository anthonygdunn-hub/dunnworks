// md-push: phone alerts for MD Dance Academy staff.
// 'website' (from md-public, internal key): new trial, enrolment, shop order or message, to principals,
//            plus the class's coach for trials and enrolments.
// 'lesson'  (signed-in staff): a lesson was booked, changed or cancelled for another coach; tells that coach.
// 'test'    (signed-in staff): a test alert to your own phone.
// 'parent'  (signed-in parent): an event entry or details change, to principals.
// 'reminders' (pg_cron md-4pm-reminders, internal key): at 4pm London time, each coach's booked lessons and classes today.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const t12 = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h % 12 || 12) + (m ? "." + String(m).padStart(2, "0") : "") + (h < 12 ? "am" : "pm"); };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const keys = Object.fromEntries(((await admin.from("md_private").select("k,v")).data || []).map((r: { k: string; v: string }) => [r.k, r.v]));
  webpush.setVapidDetails("mailto:info@dunnworks.io", keys.vapid_public, keys.vapid_private);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  const send = async (userIds: string[], msg: { title: string; body: string; url: string; tag?: string }) => {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return 0;
    const { data: subs } = await admin.from("md_push_subs").select("id,endpoint,p256dh,auth").in("user_id", ids);
    let n = 0;
    await Promise.all((subs || []).map(async (s: { id: number; endpoint: string; p256dh: string; auth: string }) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 }); n++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin.from("md_push_subs").delete().eq("id", s.id); }
    }));
    return n;
  };

  if (b.kind === "website") {
    if (!keys.internal || req.headers.get("x-internal") !== keys.internal) return json({ error: "not allowed" }, 403);
    const { data: principals } = await admin.from("md_staff").select("user_id").eq("active", true).eq("role", "Principal");
    const ids = (principals || []).map((p: { user_id: string }) => p.user_id);
    const type = String(b.type);
    if ((type === "trial" || type === "enrol") && b.class_id) {
      const { data: c } = await admin.from("md_classes").select("coach_id").eq("id", String(b.class_id)).maybeSingle();
      if (c?.coach_id) ids.push(c.coach_id);
    }
    const link = type === "order" ? "#shop" : "#bookings";
    return json({ ok: true, sent: await send(ids, { title: clip(b.title, 80), body: clip(b.body, 180), url: link }) });
  }

  if (b.kind === "reminders") {
    if (!keys.internal || req.headers.get("x-internal") !== keys.internal) return json({ error: "not allowed" }, 403);
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(now));
    if (hour !== 16 && !b.force) return json({ ok: true, skipped: "not 4pm in London" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    const { data: staff } = await admin.from("md_staff").select("user_id").eq("active", true);
    const active = new Set((staff || []).map((s: { user_id: string }) => s.user_id));
    const { data: ls } = await admin.from("md_lessons").select("id,starts,coach_id,guest,md_lesson_dancers(md_dancers(first_name))").eq("on_date", today).eq("status", "booked").order("starts");
    const { data: cs } = await admin.from("md_classes").select("name,starts,coach_id,day").eq("active", true).in("day", dow === 0 ? [0, 7] : [dow]).order("starts");
    const per = new Map<string, { t: string; s: string }[]>();
    const add = (id: string | null, t: string, s: string) => { if (!id || !active.has(id)) return; if (!per.has(id)) per.set(id, []); per.get(id)!.push({ t, s }); };
    for (const l of (ls || []) as { starts: string; coach_id: string; guest: string | null; md_lesson_dancers: { md_dancers: { first_name: string } | null }[] }[]) {
      const names = l.md_lesson_dancers.map((x) => x.md_dancers?.first_name).filter(Boolean).concat(l.guest ? [l.guest] : []).join(" & ") || "Lesson";
      add(l.coach_id, l.starts, t12(l.starts) + " " + names);
    }
    for (const c of (cs || []) as { name: string; starts: string; coach_id: string }[]) add(c.coach_id, c.starts, t12(c.starts) + " " + c.name);
    let sent = 0;
    for (const [id, items] of per) {
      items.sort((a, z) => a.t.localeCompare(z.t));
      const body = items.slice(0, 6).map((i) => i.s).join(" · ") + (items.length > 6 ? " · +" + (items.length - 6) + " more" : "");
      sent += await send([id], { title: items.length === 1 ? "Your lesson tonight" : "Your " + items.length + " lessons tonight", body: clip(body, 180), url: "#timetable", tag: "today-" + today });
    }
    return json({ ok: true, coaches: per.size, sent });
  }

  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const { data: who } = await caller.auth.getUser();

  // a parent entered or withdrew from an event, or changed their details: tell the principals
  if (b.kind === "parent") {
    if (!who?.user) return json({ error: "not allowed" }, 403);
    const { data: fams } = await admin.from("md_families").select("id,parent_name").eq("user_id", who.user.id);
    if (!fams?.length) return json({ error: "not allowed" }, 403);
    let title = "", body = "";
    if (b.action === "entry") {
      const { data: d } = await admin.from("md_dancers").select("first_name,family_id").eq("id", String(b.dancer_id)).maybeSingle();
      const { data: e } = await admin.from("md_events").select("title,starts_on").eq("id", String(b.event_id)).maybeSingle();
      if (!d || !e || !fams.some((f: { id: string }) => f.id === d.family_id)) return json({ ok: true, sent: 0 });
      title = b.enter ? "New event entry" : "Event entry withdrawn";
      body = d.first_name + (b.enter ? " entered " : " withdrawn from ") + e.title + ", " + day(e.starts_on) + " · by " + clip(fams[0].parent_name, 40);
    } else if (b.action === "details") {
      title = "Family details updated"; body = clip(fams[0].parent_name, 40) + " updated their contact or medical details in the parent app";
    } else return json({ error: "action" }, 400);
    const { data: ps } = await admin.from("md_staff").select("user_id").eq("active", true).eq("role", "Principal");
    return json({ ok: true, sent: await send((ps || []).map((p: { user_id: string }) => p.user_id), { title, body: clip(body, 180), url: b.action === "entry" ? "#events" : "#dancers" }) });
  }

  const { data: isStaff } = await caller.rpc("md_is_staff");
  if (!who?.user || !isStaff) return json({ error: "not allowed" }, 403);
  const { data: me } = await admin.from("md_staff").select("name").eq("user_id", who.user.id).maybeSingle();
  const myName = clip(me?.name || "Dunnworks", 40);

  if (b.kind === "test") {
    return json({ ok: true, sent: await send([who.user.id], { title: "Notifications are on", body: "You'll get alerts like this for new bookings and lesson changes.", url: "#today" }) });
  }

  if (b.kind === "lesson") {
    const { data: l } = await admin.from("md_lessons").select("id,on_date,starts,ends,coach_id,status,guest").eq("id", String(b.lesson_id)).maybeSingle();
    if (!l) return json({ ok: true, sent: 0 });
    const { data: ds } = await admin.from("md_lesson_dancers").select("md_dancers(first_name)").eq("lesson_id", l.id);
    const names = ((ds || []) as { md_dancers: { first_name: string } | null }[]).map((x) => x.md_dancers?.first_name).filter(Boolean).concat(l.guest ? [l.guest] : []).join(" & ") || "a lesson";
    const n = Math.max(1, Math.min(52, Number(b.count) || 1));
    const action = String(b.action);
    const when = day(l.on_date) + ", " + t12(l.starts);
    const title = action === "cancelled" ? "Lesson cancelled" : action === "booked" ? (n > 1 ? n + " weekly lessons booked" : "New lesson booked") : "Lesson changed";
    const body = names + (action === "booked" && n > 1 ? " from " : ", ") + when + " · by " + myName;
    const to = [l.coach_id, clip(b.old_coach, 40)].filter((x) => x && x !== who.user!.id);
    return json({ ok: true, sent: await send(to as string[], { title, body, url: "#timetable", tag: "lesson-" + l.id }) });
  }
  return json({ error: "kind" }, 400);
});
