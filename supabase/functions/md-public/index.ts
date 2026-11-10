// md-public: the MD Dance Academy website forms (free trial, term enrolment, shop order, contact).
// A trial or enrolment for a full class (capacity reached) goes on the class waiting list instead.
// kind 'pass' looks up a ticket or gift voucher code for the pass page (rate limited).
// Saves each one to the md_ tables, then emails the school so nothing waits for someone to log in.
// If the email can't be sent the record is still saved and shows in the staff app.
//
// RESEND_API_KEY is a secret. Who gets the emails and who they come from live in md_private:
// notify_to (comma separated) and mail_from (a sender on a domain verified in Resend). Each address is sent
// separately, so one that can't be reached never stops the others.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = [/^https:\/\/(www\.)?dunnworks\.io$/, /^https:\/\/(www\.)?mddanceacademy\.co\.uk$/, /^https:\/\/anthonygdunn-hub\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.some((r) => r.test(origin)) ? origin : "https://dunnworks.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const STAFF_URL = "https://dunnworks.io/preview/md-dance-academy/staff/";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const clip = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const okEmail = (e: string | null) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s + (Deno.env.get("SUPABASE_URL") ?? "")));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function tooMany(table: string, ip: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
  return (count ?? 0) >= 5;
}

async function notify(subject: string, heading: string, lines: [string, unknown][], extra: string | null, replyTo: string | null) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const cfg = Object.fromEntries(((await db.from("md_private").select("k,v").in("k", ["notify_to", "mail_from"])).data || []).map((r: { k: string; v: string }) => [r.k, r.v]));
  const to = (cfg.notify_to ?? Deno.env.get("MD_NOTIFY_TO") ?? "info@dunnworks.io").split(",").map((s: string) => s.trim()).filter(Boolean);
  const from = cfg.mail_from ?? Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2B2B2E;max-width:560px">
    <div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.06em">MD DANCE ACADEMY</div>
    <div style="border:1px solid #F6D3DC;border-top:0;border-radius:0 0 12px 12px;padding:20px">
    <h2 style="margin:0 0 14px;font-size:20px">${esc(heading)}</h2>
    <table style="border-collapse:collapse;margin-bottom:14px">${lines.map(([l, v]) => `<tr><td style="padding:5px 14px 5px 0;color:#66666C;vertical-align:top">${esc(l)}</td><td><strong>${esc(v ?? "not given")}</strong></td></tr>`).join("")}</table>
    ${extra ? `<p style="margin:0 0 14px;padding:12px 14px;background:#FFF5F7;border-radius:8px;white-space:pre-wrap">${esc(extra)}</p>` : ""}
    <p style="margin:0"><a href="${STAFF_URL}" style="display:inline-block;background:#D81B2C;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Open the staff app</a></p></div></div>`;
  const text = lines.map(([l, v]) => `${l}: ${v ?? "not given"}`).join("\n") + (extra ? "\n\n" + extra : "") + "\n\nStaff app: " + STAFF_URL;
  let any = false;
  for (const addr of to) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `MD Dance Academy website <${from}>`, to: [addr], reply_to: replyTo ?? undefined, subject, html, text }),
      });
      if (r.ok) any = true; else console.error("Resend refused", addr, r.status, await r.text());
    } catch (e) { console.error("send failed", addr, e); }
  }
  return any;
}

// phone alert to staff through md-push; never holds up or fails the form
async function push(payload: Record<string, unknown>) {
  try {
    const { data } = await db.from("md_private").select("v").eq("k", "internal").maybeSingle();
    if (!data) return;
    await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/md-push", {
      method: "POST", headers: { "Content-Type": "application/json", "x-internal": data.v, Authorization: "Bearer " + Deno.env.get("SUPABASE_ANON_KEY") },
      body: JSON.stringify(Object.assign({ kind: "website" }, payload)),
    });
  } catch (e) { console.error("push failed", e); }
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  // a ticket or gift voucher page looks up its code (rate limited, no personal details beyond the names printed on it)
  if (b.kind === "pass") {
    const ip0 = await sha(req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown");
    const { count } = await db.from("md_pass_lookups").select("id", { count: "exact", head: true }).eq("ip_hash", ip0).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 40) return json({ error: "Too many lookups. Please try again later." }, 429);
    await db.from("md_pass_lookups").insert({ ip_hash: ip0 });
    const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    if (code.length < 8) return json({ error: "Not found" }, 404);
    const { data: t } = await db.from("md_tickets").select("code,kind,holder,status,paid,md_events(title,starts_on,time_label,venue)").eq("code", code).maybeSingle();
    if (t) return json({ ok: true, type: "ticket", code: t.code, kind: t.kind, holder: t.holder, status: t.status, paid: t.paid, event: t.md_events });
    const { data: v } = await db.from("md_vouchers").select("code,value_pence,balance_pence,for_name,from_name,message,expires_on,status").eq("code", code).maybeSingle();
    if (v) return json({ ok: true, type: "voucher", ...v });
    return json({ error: "Not found" }, 404);
  }

  // a hidden field people never fill in, and forms sent faster than a person can fill them
  if (clip(b.website, 200) || Number(b.ms ?? 0) < 2500) return json({ ok: true });
  const ip = await sha(req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown");
  const kind = String(b.kind ?? "");

  if (kind === "trial" || kind === "enrol") {
    const row = {
      kind, dancer_name: clip(b.dancer, 80), dancer_age: clip(b.age, 30), parent_name: clip(b.name, 120), phone: clip(b.tel, 40),
      email: clip(b.email, 200)?.toLowerCase() ?? null, pay: kind === "enrol" ? clip(b.pay, 20) : null, medical: clip(b.medical, 1000),
      photo_ok: kind === "enrol" ? b.photo === "yes" : null, notes: clip(b.notes, 2000), class_label: clip(b.classLabel, 200),
      class_id: null as string | null, ip_hash: ip,
    };
    if (!row.dancer_name || !row.parent_name || !row.phone || row.phone.replace(/\D/g, "").length < 7 || !okEmail(row.email)) {
      return json({ error: "Please add the dancer's name, your name and a phone number." }, 400);
    }
    if (await tooMany("md_requests", ip)) return json({ error: "We've had a few requests from you already. Please call 07810 208765." }, 429);
    const code = clip(b.cls, 40);
    if (code) {
      const { data: c } = await db.from("md_classes").select("id,name").eq("code", code).maybeSingle();
      if (c) { row.class_id = c.id; row.class_label = row.class_label ?? c.name; }
      else row.class_label = row.class_label ?? ({ private: "Private lesson", wedding: "Wedding first dance", unsure: "Not sure, please recommend" } as Record<string, string>)[code] ?? code;
    }
    if (row.class_id) {
      const { data: cl } = await db.from("md_classes").select("capacity,name").eq("id", row.class_id).maybeSingle();
      if (cl?.capacity) {
        const { count: taken } = await db.from("md_enrolments").select("id", { count: "exact", head: true }).eq("class_id", row.class_id).eq("status", "active");
        if ((taken ?? 0) >= cl.capacity) {
          if (await tooMany("md_waitlist", ip)) return json({ error: "We've had a few requests from you already. Please call 07810 208765." }, 429);
          const { error: we } = await db.from("md_waitlist").insert({ class_id: row.class_id, dancer_name: row.dancer_name, dancer_age: row.dancer_age, parent_name: row.parent_name, phone: row.phone, email: row.email, notes: row.notes, ip_hash: ip });
          if (we) { console.error("waitlist insert failed", we); return json({ error: "Could not save your details. Please call 07810 208765." }, 500); }
          const emailed = await notify(`Waiting list: ${row.dancer_name} (${cl.name})`, "New waiting list request",
            [["Dancer", row.dancer_name], ["Age", row.dancer_age], ["Parent or dancer", row.parent_name], ["Mobile", row.phone], ["Email", row.email], ["Class", cl.name + " (full)"]], row.notes, row.email);
          await push({ type: "enrol", class_id: row.class_id, title: "Waiting list: " + row.dancer_name, body: cl.name + " is full · " + row.parent_name });
          return json({ ok: true, waitlist: true, emailed });
        }
      }
    }
    const { data: saved, error } = await db.from("md_requests").insert(row).select("id").single();
    if (error) { console.error("insert failed", error); return json({ error: "Could not save your booking. Please call 07810 208765." }, 500); }
    const emailed = await notify(
      kind === "trial" ? `Free trial request: ${row.dancer_name} (${row.class_label ?? "class not chosen"})` : `Term enrolment: ${row.dancer_name} (${row.class_label ?? "class not chosen"})`,
      kind === "trial" ? "New free trial request" : "New term enrolment",
      [["Dancer", row.dancer_name], ["Age", row.dancer_age], ["Parent or dancer", row.parent_name], ["Mobile", row.phone], ["Email", row.email], ["Class", row.class_label],
        ...(kind === "enrol" ? [["Paying", row.pay], ["Photo consent", row.photo_ok ? "Yes" : "No"], ["Medical", row.medical]] as [string, unknown][] : [])],
      row.notes, row.email);
    if (emailed) await db.from("md_requests").update({ emailed: true }).eq("id", saved.id);
    await push({ type: kind, class_id: row.class_id, title: kind === "trial" ? "New free trial: " + row.dancer_name : "New enrolment: " + row.dancer_name, body: (row.class_label ?? "Class not chosen") + " · " + row.parent_name });
    return json({ ok: true, emailed });
  }

  if (kind === "order") {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => {
      const o = (i ?? {}) as Record<string, unknown>;
      return { name: clip(o.name, 100), size: clip(o.size, 40), qty: Math.max(1, Math.min(20, Math.round(Number(o.qty) || 1))) };
    }).filter((i) => i.name);
    const row = {
      items, collect: clip(b.collect, 120), dancer_name: clip(b.dancer, 120), email: clip(b.email, 200)?.toLowerCase() ?? null, phone: clip(b.tel, 40),
      total_pence: Number.isFinite(Number(b.totalPence)) && Number(b.totalPence) > 0 ? Math.round(Number(b.totalPence)) : null, ip_hash: ip,
      ref: "MD-" + String(Math.floor(1000 + Math.random() * 9000)) + String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    };
    if (!items.length || !row.collect || !row.dancer_name || !row.email || !okEmail(row.email)) return json({ error: "Please add something to your basket, where to collect it, the dancer's name and your email." }, 400);
    if (await tooMany("md_orders", ip)) return json({ error: "We've had a few orders from you already. Please call 07810 208765." }, 429);
    const { data: saved, error } = await db.from("md_orders").insert(row).select("id,ref").single();
    if (error) { console.error("insert failed", error); return json({ error: "Could not place your order. Please try again." }, 500); }
    const emailed = await notify(`Shop order ${saved.ref}: ${row.dancer_name}`, `New shop order ${saved.ref}`,
      [["Dancer", row.dancer_name], ["Collect at", row.collect], ["Email", row.email], ["Mobile", row.phone],
        ["Items", items.map((i) => `${i.qty} x ${i.name}${i.size ? " (" + i.size + ")" : ""}`).join(", ")]], "To be paid at collection.", row.email);
    if (emailed) await db.from("md_orders").update({ emailed: true }).eq("id", saved.id);
    await push({ type: "order", title: "Shop order " + saved.ref, body: row.dancer_name + " · " + items.map((i) => i.qty + " x " + i.name).join(", ") });
    return json({ ok: true, emailed, ref: saved.ref });
  }

  if (kind === "contact") {
    const row = { name: clip(b.name, 120), email: clip(b.email, 200)?.toLowerCase() ?? null, phone: clip(b.tel, 40), topic: clip(b.topic, 40), message: clip(b.msg, 4000), ip_hash: ip };
    if (!row.name || !row.message || !row.email || !okEmail(row.email)) return json({ error: "Please add your name, email and a message." }, 400);
    if (await tooMany("md_messages", ip)) return json({ error: "We've had a few messages from you already. Please call 07810 208765." }, 429);
    const { data: saved, error } = await db.from("md_messages").insert(row).select("id").single();
    if (error) { console.error("insert failed", error); return json({ error: "Could not send your message. Please try again." }, 500); }
    const emailed = await notify(`Website message: ${row.topic ?? "general"} (${row.name})`, "New message from the website",
      [["Name", row.name], ["Email", row.email], ["Mobile", row.phone], ["About", row.topic]], row.message, row.email);
    if (emailed) await db.from("md_messages").update({ emailed: true }).eq("id", saved.id);
    await push({ type: "message", title: "Website message from " + row.name, body: (row.message ?? "").slice(0, 120) });
    return json({ ok: true, emailed });
  }

  return json({ error: "Unknown form" }, 400);
});
