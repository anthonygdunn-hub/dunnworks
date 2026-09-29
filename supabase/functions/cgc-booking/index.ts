// cgc-booking: the Coastal Golf Co booking form, sent straight from the website.
// Saves the request to cgc_bookings, then emails hello@coastalgolfco.co.uk.
// If the email can't be sent the booking is still saved and the site falls back
// to opening the customer's email app, so no request is ever lost silently.
//
// Secrets: RESEND_API_KEY; BOOKING_TO (default hello@coastalgolfco.co.uk);
// BOOKING_FROM (a sender on a domain verified in Resend, e.g. bookings@coastalgolfco.co.uk).
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = [/^https:\/\/(www\.)?coastalgolfco\.co\.uk$/, /^https:\/\/anthonygdunn-hub\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.some((r) => r.test(origin)) ? origin : "https://www.coastalgolfco.co.uk",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const clip = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s + (Deno.env.get("SUPABASE_URL") ?? "")));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  // spam checks: a hidden field people never fill in, and forms sent faster than a person can type
  if (clip(b.website, 200) || Number(b.ms ?? 0) < 2500) return json({ ok: true, emailed: true });

  const row = {
    name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 200), postcode: clip(b.postcode, 12)?.toUpperCase() ?? null,
    service: clip(b.service, 80), clubs: Number.isFinite(Number(b.clubs)) && b.clubs !== "" ? Math.max(0, Math.min(30, Math.round(Number(b.clubs)))) : null,
    collection_day: /^\d{4}-\d{2}-\d{2}$/.test(String(b.day ?? "")) ? String(b.day) : null,
    grip: clip(b.grip, 200), discount: clip(b.discount, 60), message: clip(b.message, 4000), page: clip(b.page, 200),
    ip_hash: await sha(req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"),
  };
  if (!row.name || !row.phone || row.phone.replace(/\D/g, "").length < 7) return json({ error: "Please add your name and a phone number." }, 400);

  // no more than 5 requests an hour from one connection
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("cgc_bookings").select("id", { count: "exact", head: true }).eq("ip_hash", row.ip_hash).gte("created_at", since);
  if ((count ?? 0) >= 5) return json({ error: "We've had a few requests from you already. Please call or WhatsApp 07792 554989." }, 429);

  const { data: saved, error } = await db.from("cgc_bookings").insert(row).select("id").single();
  if (error) { console.error("insert failed", error); return json({ error: "Could not save your request." }, 500); }

  let emailed = false;
  const key = Deno.env.get("RESEND_API_KEY");
  if (key) {
    const lines: [string, string | number | null][] = [["Name", row.name], ["Phone", row.phone], ["Email", row.email], ["Collection postcode", row.postcode],
      ["Service", row.service], ["Clubs", row.clubs], ["Preferred collection day", row.collection_day], ["Grip preference", row.grip], ["Discount", row.discount]];
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#022042">
      <h2 style="margin:0 0 4px">New booking request</h2><p style="margin:0 0 16px;color:#666">From the Coastal Golf Co website</p>
      <table style="border-collapse:collapse;margin-bottom:16px">${lines.map(([l, v]) => `<tr><td style="padding:5px 14px 5px 0;color:#666">${l}</td><td><strong>${esc(String(v ?? "not given"))}</strong></td></tr>`).join("")}</table>
      <p style="margin:0 0 6px;color:#666">Anything else</p><p style="margin:0;padding:12px 14px;background:#f8f2e2;border-radius:6px;white-space:pre-wrap">${esc(row.message ?? "Nothing added")}</p>
      <p style="margin:20px 0 0"><a href="tel:${encodeURIComponent(row.phone)}">Call back</a> &nbsp;·&nbsp; <a href="https://wa.me/${row.phone.replace(/\D/g, "").replace(/^0/, "44")}">WhatsApp</a></p></div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Coastal Golf Co website <${Deno.env.get("BOOKING_FROM") ?? "onboarding@resend.dev"}>`,
          to: [Deno.env.get("BOOKING_TO") ?? "hello@coastalgolfco.co.uk"],
          reply_to: row.email ?? undefined,
          subject: `Booking request: ${row.service ?? "not sure"} (${row.name})`,
          html, text: lines.map(([l, v]) => `${l}: ${v ?? "not given"}`).join("\n") + "\n\n" + (row.message ?? ""),
        }),
      });
      emailed = r.ok;
      if (!r.ok) console.error("Resend refused", r.status, await r.text());
    } catch (e) { console.error("send failed", e); }
  }
  if (emailed) await db.from("cgc_bookings").update({ emailed: true }).eq("id", saved.id);
  return json({ ok: true, emailed });
});
