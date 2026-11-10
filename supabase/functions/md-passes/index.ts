// md-passes: emails event tickets and gift vouchers to the buyer, each with a link to its QR page.
// 'send' {type: 'ticket'|'voucher', ids: uuid[]} (signed-in principal). Tickets for one buyer go in one email.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PASS = "https://dunnworks.io/preview/md-dance-academy/pass/#";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (p: number) => "£" + (p / 100).toFixed(2).replace(/\.00$/, "");
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
type Row = Record<string, any>;

const shell = (title: string, inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2B2B2E;max-width:560px;margin:0 auto">
<div style="background:linear-gradient(135deg,#C8102E,#D6136F);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0"><div style="font-weight:bold;letter-spacing:.12em;font-size:13px">MD DANCE ACADEMY</div><div style="font:bold 22px Georgia,serif;margin-top:4px">${esc(title)}</div></div>
<div style="border:1px solid #F6D3DC;border-top:0;border-radius:0 0 14px 14px;padding:20px 22px">${inner}
<p style="margin:18px 0 0;font-size:13px;color:#66666C">Questions? Reply to this email or call 07810 208765.<br>MD Dance Academy, Bordon</p></div></div>`;
const btn = (href: string, label: string) => `<a href="${href}" style="display:inline-block;background:#D81B2C;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:bold;margin:4px 6px 4px 0">${esc(label)}</a>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const { data: isP } = await caller.rpc("md_is_principal");
  if (!isP) return json({ error: "Only a principal can send these." }, 403);
  let b: Row;
  try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 200);
  if (!ids.length) return json({ error: "nothing to send" }, 400);
  const key = Deno.env.get("RESEND_API_KEY");
  const from = (await db.from("md_private").select("v").eq("k", "mail_from").maybeSingle()).data?.v ?? Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const send = async (to: string, subject: string, html: string, text: string) => {
    if (!key) return false;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `MD Dance Academy <${from}>`, to: [to], reply_to: "mddanceacademy18@gmail.com", subject, html, text }) });
    if (!r.ok) console.error("Resend refused", r.status, await r.text());
    return r.ok;
  };
  const okEmail = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));
  let sent = 0, failed = 0, noEmail = 0;

  if (b.type === "ticket") {
    const { data: ts } = await db.from("md_tickets").select("id,code,kind,holder,price_pence,buyer_name,buyer_email,paid,status,md_events(title,starts_on,time_label,venue)").in("id", ids);
    const groups = new Map<string, Row[]>();
    for (const t of (ts || []) as Row[]) { if (t.status === "cancelled") continue; if (!okEmail(t.buyer_email)) { noEmail++; continue; } const k = t.buyer_email.toLowerCase(); groups.set(k, [...(groups.get(k) || []), t]); }
    for (const [to, list] of groups) {
      const ev = list[0].md_events || {};
      const inner = `<p>Hi ${esc(String(list[0].buyer_name || "").split(" ")[0] || "there")},</p><p>Here ${list.length === 1 ? "is your ticket" : "are your " + list.length + " tickets"} for <b>${esc(ev.title)}</b>.</p>
<p style="background:#FFF5F7;border-radius:10px;padding:12px 14px;margin:0 0 14px"><b>${esc(ev.starts_on ? day(ev.starts_on) : "")}</b>${ev.time_label ? ", " + esc(ev.time_label) : ""}${ev.venue ? "<br>" + esc(ev.venue) : ""}</p>
<p>Show the QR code on your phone at the door, or print it. Each ticket has its own code.</p><p>${list.map((t) => btn(PASS + t.code, (t.holder || t.kind) + " ticket")).join("")}</p>
<p style="font-size:14px;color:#4A4A4F">${list.map((t) => esc((t.holder ? t.holder + ", " : "") + t.kind) + " · code <b style=\"letter-spacing:.08em\">" + esc(t.code) + "</b>").join("<br>")}${list.some((t) => !t.paid) ? "<br><br><b>To pay:</b> " + money(list.filter((t) => !t.paid).reduce((s, t) => s + (t.price_pence || 0), 0)) + ", at class or on the door." : ""}</p>`;
      const text = `Your tickets for ${ev.title}, ${ev.starts_on ? day(ev.starts_on) : ""} ${ev.time_label || ""}, ${ev.venue || ""}\n\n` + list.map((t) => `${t.holder || t.kind}: ${PASS}${t.code}`).join("\n");
      const ok = await send(to, `Your tickets: ${ev.title}`, shell("Your tickets", inner), text);
      if (ok) { sent += list.length; await db.from("md_tickets").update({ emailed_at: new Date().toISOString() }).in("id", list.map((t) => t.id)); } else failed += list.length;
    }
  } else if (b.type === "voucher") {
    const { data: vs } = await db.from("md_vouchers").select("*").in("id", ids);
    for (const v of (vs || []) as Row[]) {
      if (!okEmail(v.buyer_email)) { noEmail++; continue; }
      const inner = `<p>Here is the MD Dance Academy gift voucher${v.for_name ? " for <b>" + esc(v.for_name) + "</b>" : ""}.</p>
<div style="border:2px dashed #D6136F;border-radius:14px;padding:18px;text-align:center;margin:0 0 14px"><div style="font:bold 34px Georgia,serif;color:#B0111F">${money(v.value_pence)}</div><div style="font-size:14px;color:#4A4A4F">Dance lesson gift voucher${v.from_name ? " · from " + esc(v.from_name) : ""}</div>${v.message ? `<p style="font-style:italic;margin:10px 0 0">“${esc(v.message)}”</p>` : ""}<div style="margin-top:10px;font-size:14px">Code <b style="letter-spacing:.1em">${esc(v.code)}</b>${v.expires_on ? " · use by " + esc(day(v.expires_on)) : ""}</div></div>
<p>${btn(PASS + v.code, "Open the voucher to print or forward")}</p><p style="font-size:14px;color:#4A4A4F">Use it for classes, private lessons or the shop. Just quote the code or show the QR.</p>`;
      const ok = await send(v.buyer_email, `Your MD Dance Academy gift voucher, ${money(v.value_pence)}`, shell("Gift voucher", inner), `Gift voucher ${money(v.value_pence)}, code ${v.code}: ${PASS}${v.code}`);
      if (ok) { sent++; await db.from("md_vouchers").update({ emailed_at: new Date().toISOString() }).eq("id", v.id); } else failed++;
    }
  } else return json({ error: "type" }, 400);
  return json({ ok: true, sent, failed, noEmail });
});
