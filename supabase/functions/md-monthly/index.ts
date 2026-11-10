// md-monthly: the monthly member email for MD Dance Academy families.
// 'tick'    (pg_cron md-monthly-email daily, internal key): two days before the 1st, emails principals a preview and
//           alerts their phones; on the 1st, sends every family (with an email and an active dancer) their own summary,
//           unless a principal has held that month in the staff app. Each month is sent once (md_mailings, md_mail_log).
// 'preview' (signed-in principal) {family_id?}: the email as a family would see it, plus how many families get it.
// 'test'    (signed-in principal) {family_id?}: sends that preview to the principal's own email.
// Every tick also sends review emails the day after a free trial marked attended or joined (md_settings reviews_on, review_url).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PARENT_URL = "https://dunnworks.io/preview/md-dance-academy/parents/";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (p: number) => "£" + (Math.abs(p) / 100).toFixed(2).replace(/\.00$/, "");
const t12 = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h % 12 || 12) + (m ? "." + String(m).padStart(2, "0") : "") + (h < 12 ? "am" : "pm"); };
const dlong = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monthStart = (d: string) => d.slice(0, 8) + "01";
const monthEnd = (m: string) => { const x = new Date(m + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1, 0); return x.toISOString().slice(0, 10); };
const monthName = (m: string) => new Date(m + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

type Row = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const keys = Object.fromEntries(((await db.from("md_private").select("k,v")).data || []).map((r: Row) => [r.k, r.v]));
  let b: Row;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const from = keys.mail_from ?? Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const resend = Deno.env.get("RESEND_API_KEY");

  // everything the emails need for one month, loaded once
  const load = async (month: string) => {
    const end = monthEnd(month), today = londonToday();
    const [fam, dan, enr, cls, les, ld, ch, pay, ev, ent, staff] = await Promise.all([
      db.from("md_families").select("id,parent_name,email,demo"),
      db.from("md_dancers").select("id,family_id,first_name").eq("active", true),
      db.from("md_enrolments").select("dancer_id,class_id").eq("status", "active"),
      db.from("md_classes").select("id,name,day,starts,ends,venue,coach_id").eq("active", true),
      db.from("md_lessons").select("id,on_date,starts,ends,venue,coach_id,status").gte("on_date", month).lte("on_date", end).neq("status", "cancelled"),
      db.from("md_lesson_dancers").select("lesson_id,dancer_id"),
      db.from("md_charges").select("family_id,amount_pence,due_on").lte("due_on", today),
      db.from("md_payments").select("family_id,amount_pence"),
      db.from("md_events").select("id,title,kind,starts_on,ends_on,time_label,venue,open").gte("starts_on", today).lte("starts_on", addDays(today, 120)).order("starts_on"),
      db.from("md_entries").select("event_id,dancer_id,status"),
      db.from("md_staff").select("user_id,name"),
    ]);
    return { month, end, today, fam: fam.data || [], dan: dan.data || [], enr: enr.data || [], cls: cls.data || [], les: les.data || [], ld: ld.data || [],
      ch: ch.data || [], pay: pay.data || [], ev: ev.data || [], ent: ent.data || [], staff: staff.data || [] };
  };
  type D = Awaited<ReturnType<typeof load>>;
  const okEmail = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));
  const recipients = (d: D, includeDemo = false) => d.fam.filter((f: Row) => okEmail(f.email) && (includeDemo || !f.demo) && d.dan.some((x: Row) => x.family_id === f.id));

  const build = (d: D, f: Row) => {
    const coach = (id: string) => (d.staff.find((s: Row) => s.user_id === id)?.name || "").split(" ")[0];
    const kids = d.dan.filter((x: Row) => x.family_id === f.id);
    const kidIds = new Set(kids.map((k: Row) => k.id));
    const nameOf = (id: string) => kids.find((k: Row) => k.id === id)?.first_name || "";
    const bal = d.ch.filter((c: Row) => c.family_id === f.id).reduce((s: number, c: Row) => s + c.amount_pence, 0) - d.pay.filter((p: Row) => p.family_id === f.id).reduce((s: number, p: Row) => s + p.amount_pence, 0);
    const byClass = new Map<string, { c: Row; names: string[] }>();
    for (const e of d.enr.filter((e: Row) => kidIds.has(e.dancer_id))) {
      const c = d.cls.find((c: Row) => c.id === e.class_id);
      if (!c) continue;
      if (!byClass.has(c.id)) byClass.set(c.id, { c, names: [] });
      byClass.get(c.id)!.names.push(nameOf(e.dancer_id));
    }
    const classes = [...byClass.values()].map((x) => ({ c: x.c, who: x.names.join(" & ") }))
      .sort((a: Row, z: Row) => ((a.c.day % 7 || 7) - (z.c.day % 7 || 7)) || a.c.starts.localeCompare(z.c.starts));
    const lessons = d.les.map((l: Row) => ({ l, who: d.ld.filter((x: Row) => x.lesson_id === l.id && kidIds.has(x.dancer_id)).map((x: Row) => nameOf(x.dancer_id)) }))
      .filter((x: Row) => x.who.length).sort((a: Row, z: Row) => (a.l.on_date + a.l.starts).localeCompare(z.l.on_date + z.l.starts));
    const entered = d.ev.map((e: Row) => ({ e, who: d.ent.filter((x: Row) => x.event_id === e.id && kidIds.has(x.dancer_id) && x.status !== "withdrawn").map((x: Row) => nameOf(x.dancer_id) + (x.status === "paid" ? " (paid)" : "")) })).filter((x: Row) => x.who.length);
    const enteredIds = new Set(entered.map((x: Row) => x.e.id));
    const open = d.ev.filter((e: Row) => e.open && e.starts_on > d.today && !enteredIds.has(e.id)).slice(0, 6);
    const dates = d.ev.filter((e: Row) => e.starts_on <= d.end && !enteredIds.has(e.id) && !open.some((o: Row) => o.id === e.id));
    const evWhen = (e: Row) => dlong(e.starts_on) + (e.ends_on && e.ends_on !== e.starts_on ? " to " + dlong(e.ends_on) : "") + (e.time_label ? ", " + e.time_label : "");
    const mName = monthName(d.month).split(" ")[0];

    const sec = (title: string, inner: string) => `<h3 style="margin:22px 0 8px;font:bold 15px Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#B0111F">${title}</h3>${inner}`;
    const rows = (items: string[][]) => `<table role="presentation" style="width:100%;border-collapse:collapse">${items.map(([a, z]) => `<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #F6D3DC;vertical-align:top;white-space:nowrap;color:#4A4A4F">${a}</td><td style="padding:8px 0;border-bottom:1px solid #F6D3DC">${z}</td></tr>`).join("")}</table>`;
    const balBox = bal > 0
      ? `<div style="background:#FDE4E8;border-radius:12px;padding:16px 18px"><div style="font-size:14px;color:#8E1230">To pay</div><div style="font:bold 30px Arial,Helvetica,sans-serif;color:#B0111F">${money(bal)}</div><div style="font-size:14px;color:#4A4A4F">Please pay at your next class, or ask us for bank transfer details. The parent app shows every charge and payment.</div></div>`
      : `<div style="background:#E3F3EA;border-radius:12px;padding:16px 18px;color:#1E6B43"><b style="font-size:18px">${bal < 0 ? money(bal) + " in credit" : "All paid up"}</b><div style="font-size:14px;color:#4A4A4F">Thank you. Nothing to pay right now.</div></div>`;

    const html = `<!doctype html><html><body style="margin:0;background:#FFF7F8"><div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2B2B2E;max-width:600px;margin:0 auto;padding:16px">
<div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:20px 22px;border-radius:14px 14px 0 0"><div style="font-weight:bold;letter-spacing:.12em;font-size:13px">MD DANCE ACADEMY</div><div style="font:bold 24px Georgia,serif;margin-top:4px">Your ${esc(mName)} update</div></div>
<div style="background:#fff;border:1px solid #F6D3DC;border-top:0;border-radius:0 0 14px 14px;padding:20px 22px">
<p style="margin:0 0 16px">Hi ${esc(String(f.parent_name || "").split(" ")[0] || "there")}, here’s everything for ${esc(kids.map((k: Row) => k.first_name).join(" and "))} this month.</p>
${balBox}
${classes.length ? sec("Weekly classes", rows(classes.map((x: Row) => [esc(DAYS[x.c.day]) + " " + t12(x.c.starts), "<b>" + esc(x.c.name) + "</b>" + (kids.length > 1 ? " · " + esc(x.who) : "") + "<br><span style=\"color:#66666C;font-size:14px\">" + esc(x.c.venue || "") + (x.c.coach_id && coach(x.c.coach_id) ? " · with " + esc(coach(x.c.coach_id)) : "") + "</span>"]))) : ""}
${lessons.length ? sec("Private and pair lessons in " + esc(mName), rows(lessons.map((x: Row) => [esc(dlong(x.l.on_date)), t12(x.l.starts) + "–" + t12(x.l.ends) + " · <b>" + esc(x.who.join(" & ")) + "</b>" + (coach(x.l.coach_id) ? " with " + esc(coach(x.l.coach_id)) : "") + (x.l.venue ? "<br><span style=\"color:#66666C;font-size:14px\">" + esc(x.l.venue) + "</span>" : "")]))) : ""}
${entered.length ? sec("Competitions and events you’re in", rows(entered.map((x: Row) => [esc(dlong(x.e.starts_on)), "<b>" + esc(x.e.title) + "</b> · " + esc(x.who.join(", ")) + "<br><span style=\"color:#66666C;font-size:14px\">" + esc(evWhen(x.e)) + (x.e.venue ? " · " + esc(x.e.venue) : "") + "</span>"]))) : ""}
${open.length ? sec("Open for entries", rows(open.map((e: Row) => [esc(dlong(e.starts_on)), "<b>" + esc(e.title) + "</b><br><span style=\"color:#66666C;font-size:14px\">" + esc(evWhen(e)) + (e.venue ? " · " + esc(e.venue) : "") + "</span>"])) + `<p style="margin:10px 0 0;font-size:14px">Enter in the parent app, or reply to this email.</p>`) : ""}
${dates.length ? sec("Other dates this month", rows(dates.map((e: Row) => [esc(dlong(e.starts_on)), "<b>" + esc(e.title) + "</b>" + (e.time_label || e.venue ? "<br><span style=\"color:#66666C;font-size:14px\">" + esc([e.time_label, e.venue].filter(Boolean).join(" · ")) + "</span>" : "")]))) : ""}
<p style="margin:24px 0 6px"><a href="${PARENT_URL}" style="display:inline-block;background:#D81B2C;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open the parent app</a></p>
<p style="margin:16px 0 0;font-size:13px;color:#66666C">Anything wrong or changed? Just reply to this email or call 07810 208765.<br>MD Dance Academy, Bordon</p>
</div></div></body></html>`;
    const text = [`Your ${mName} update from MD Dance Academy`, "", bal > 0 ? `To pay: ${money(bal)}` : bal < 0 ? `${money(bal)} in credit` : "All paid up",
      ...(classes.length ? ["", "Weekly classes:", ...classes.map((x: Row) => `- ${DAYS[x.c.day]} ${t12(x.c.starts)}: ${x.c.name}${kids.length > 1 ? " (" + x.who + ")" : ""}`)] : []),
      ...(lessons.length ? ["", "Lessons:", ...lessons.map((x: Row) => `- ${dlong(x.l.on_date)} ${t12(x.l.starts)}: ${x.who.join(" & ")}`)] : []),
      ...(entered.length ? ["", "You're entered in:", ...entered.map((x: Row) => `- ${dlong(x.e.starts_on)}: ${x.e.title} (${x.who.join(", ")})`)] : []),
      ...(open.length ? ["", "Open for entries:", ...open.map((e: Row) => `- ${dlong(e.starts_on)}: ${e.title}`)] : []),
      "", "Parent app: " + PARENT_URL, "Questions? Reply to this email or call 07810 208765."].join("\n");
    return { subject: `MD Dance Academy: your ${mName} update` + (bal > 0 ? ` (${money(bal)} to pay)` : ""), html, text };
  };

  const sendOne = async (to: string, m: { subject: string; html: string; text: string }) => {
    if (!resend) return { ok: false, error: "no RESEND_API_KEY" };
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `MD Dance Academy <${from}>`, to: [to], reply_to: "mddanceacademy18@gmail.com", ...m }) });
    return r.ok ? { ok: true } : { ok: false, error: r.status + " " + (await r.text()).slice(0, 200) };
  };

  const principals = async () => (await db.from("md_staff").select("user_id,email,name").eq("active", true).eq("role", "Principal")).data || [];
  const pushTo = async (ids: string[], msg: Row) => {
    if (!ids.length || !keys.vapid_public) return;
    webpush.setVapidDetails("mailto:info@dunnworks.io", keys.vapid_public, keys.vapid_private);
    const { data: subs } = await db.from("md_push_subs").select("id,endpoint,p256dh,auth").in("user_id", ids);
    await Promise.all((subs || []).map(async (s: Row) => { try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 12 * 3600 }); } catch (e) { const c = (e as Row).statusCode; if (c === 404 || c === 410) await db.from("md_push_subs").delete().eq("id", s.id); } }));
  };
  const sample = (d: D, familyId?: string) => {
    const list = recipients(d, true);
    return (familyId && d.fam.find((f: Row) => f.id === familyId)) || list.find((f: Row) => !f.demo) || list[0] || null;
  };

  // the day after a free trial, families get a thank-you with a link to leave a review
  const reviews = async () => {
    const cfg = Object.fromEntries(((await db.from("md_settings").select("k,v")).data || []).map((r: Row) => [r.k, r.v]));
    if (cfg.reviews_on !== "yes" || !/^https:\/\//.test(cfg.review_url || "")) return 0;
    const t = londonToday();
    const { data: rs } = await db.from("md_requests").select("id,parent_name,dancer_name,email,class_label").eq("kind", "trial").in("status", ["attended", "joined"])
      .gte("trial_on", addDays(t, -3)).lte("trial_on", addDays(t, -1)).is("review_sent_at", null).eq("demo", false);
    let n = 0;
    for (const r of (rs || []) as Row[]) {
      if (!okEmail(r.email)) continue;
      const first = esc(String(r.parent_name || "").split(" ")[0] || "there"), dancer = esc(String(r.dancer_name || "").split(" ")[0]);
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2B2B2E;max-width:540px;margin:0 auto"><div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;font-weight:bold;letter-spacing:.12em;font-size:13px">MD DANCE ACADEMY</div><div style="border:1px solid #F6D3DC;border-top:0;border-radius:0 0 14px 14px;padding:20px 22px"><p>Hi ${first},</p><p>Thank you for bringing ${dancer || "your dancer"} to try ${esc(r.class_label || "a class")}. We hope they loved it.</p><p>If you have a minute, a short review really helps other families find us.</p><p><a href="${esc(cfg.review_url)}" style="display:inline-block;background:#D81B2C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Leave a review</a></p><p style="font-size:14px;color:#66666C">Any questions about joining, just reply to this email or call 07810 208765.</p></div></div>`;
      const r2 = await sendOne(String(r.email).trim(), { subject: `How was ${dancer ? dancer + "’s" : "your"} free trial?`, html, text: `Thank you for coming to try ${r.class_label || "a class"}. A short review really helps: ${cfg.review_url}` });
      if (r2.ok) { n++; await db.from("md_requests").update({ review_sent_at: new Date().toISOString() }).eq("id", r.id); }
    }
    return n;
  };

  if (b.kind === "tick") {
    if (!keys.internal || req.headers.get("x-internal") !== keys.internal) return json({ error: "not allowed" }, 403);
    const reviewed = await reviews().catch((e) => { console.error("reviews", e); return 0; });
    if (reviewed) console.log("review emails sent", reviewed);
    const today = b.today && b.force ? String(b.today) : londonToday();
    // preview, two days before the 1st
    if (addDays(today, 2).endsWith("-01")) {
      const month = addDays(today, 2);
      const { data: m } = await db.from("md_mailings").select("*").eq("month", month).maybeSingle();
      if (m?.previewed_at && !b.force) return json({ ok: true, skipped: "already previewed" });
      await db.from("md_mailings").upsert({ month, previewed_at: new Date().toISOString(), status: m?.status ?? "scheduled", updated_at: new Date().toISOString() });
      const d = await load(month), n = recipients(d).length, f = sample(d), ps = await principals();
      const when = dlong(month);
      if (f) {
        const e = build(d, f);
        const banner = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:16px 16px 0"><div style="background:#FFF3D6;border-radius:12px;padding:14px 16px;color:#5A3B00;font-size:15px"><b>Preview.</b> The monthly email goes to ${n} famil${n === 1 ? "y" : "ies"} on ${esc(when)} at about 8am. Below is ${esc(f.parent_name)}’s copy. Every family sees their own fees, lessons and entries. To stop it, open the staff app, go to Fees and tap Hold.</div></div>`;
        for (const p of ps) if (okEmail(p.email)) await sendOne(p.email, { subject: `Preview: monthly email goes to ${n} families on ${when}`, html: e.html.replace("<body style=\"margin:0;background:#FFF7F8\">", "<body style=\"margin:0;background:#FFF7F8\">" + banner), text: `Preview for ${when}.\n\n` + e.text });
      }
      await pushTo(ps.map((p: Row) => p.user_id), { title: "Monthly email goes " + when, body: `${n} families will get their update. Tap to preview or hold it.`, url: "#money", tag: "monthly-" + month });
      return json({ ok: true, previewed: month, families: n });
    }
    // send, on the 1st
    if (today.endsWith("-01")) {
      const month = today;
      const { data: m } = await db.from("md_mailings").select("*").eq("month", month).maybeSingle();
      if (m && (m.status === "held" || m.status === "sent")) return json({ ok: true, skipped: m.status });
      await db.from("md_mailings").upsert({ month, status: "sending", updated_at: new Date().toISOString() });
      const d = await load(month);
      const done = new Set(((await db.from("md_mail_log").select("family_id").eq("month", month).eq("ok", true)).data || []).map((r: Row) => r.family_id));
      let sent = 0, failed = 0;
      const todo = recipients(d).filter((f: Row) => !done.has(f.id));
      for (let i = 0; i < todo.length; i += 50) { // Resend takes up to 100 emails a request
        const chunk = todo.slice(i, i + 50);
        let ok = false, error: string | null = "no RESEND_API_KEY";
        if (resend) {
          const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
            body: JSON.stringify(chunk.map((f: Row) => ({ from: `MD Dance Academy <${from}>`, to: [String(f.email).trim()], reply_to: "mddanceacademy18@gmail.com", ...build(d, f) }))) });
          ok = r.ok; error = r.ok ? null : r.status + " " + (await r.text()).slice(0, 200);
        }
        await db.from("md_mail_log").insert(chunk.map((f: Row) => ({ month, family_id: f.id, email: f.email, ok, error })));
        ok ? (sent += chunk.length) : (failed += chunk.length);
        if (i + 50 < todo.length) await new Promise((res) => setTimeout(res, 600));
      }
      await db.from("md_mailings").update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed, updated_at: new Date().toISOString() }).eq("month", month);
      const ps = await principals();
      await pushTo(ps.map((p: Row) => p.user_id), { title: "Monthly email sent", body: `${sent} families got their ${monthName(month).split(" ")[0]} update` + (failed ? `, ${failed} couldn’t be sent` : ""), url: "#money", tag: "monthly-" + month });
      return json({ ok: true, sent, failed });
    }
    return json({ ok: true, skipped: "nothing today" });
  }

  // principal actions from the staff app
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const { data: isP } = await caller.rpc("md_is_principal");
  const { data: who } = await caller.auth.getUser();
  if (!isP || !who?.user) return json({ error: "Only a principal can do this." }, 403);
  const today = londonToday();
  const month = today.slice(8) === "01" ? today : addDays(monthStart(today), 40).slice(0, 8) + "01";
  const d = await load(month);
  const f = sample(d, b.family_id ? String(b.family_id) : undefined);
  if (!f) return json({ error: "No families with an email and an active dancer yet." }, 400);
  const e = build(d, f);
  if (b.kind === "preview") {
    return json({ ok: true, month, families: recipients(d).length, demo_families: recipients(d, true).length - recipients(d).length, family: { id: f.id, parent_name: f.parent_name }, subject: e.subject, html: e.html,
      choices: recipients(d, true).map((x: Row) => ({ id: x.id, parent_name: x.parent_name, demo: !!x.demo })) });
  }
  if (b.kind === "test") {
    const r = await sendOne(String(who.user.email), { ...e, subject: "Test: " + e.subject });
    return json({ ok: r.ok, to: who.user.email, error: r.ok ? null : "The email service refused it. The sender domain may not be verified yet." });
  }
  return json({ error: "kind" }, 400);
});
