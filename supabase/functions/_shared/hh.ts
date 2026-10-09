// Shared bits for the Honest Handicap edge functions (hh-join, hh-card, hh-admin).
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = [
  /^https:\/\/(www\.)?honesthandicap\.golf$/,
  /^https:\/\/(www\.)?dunnworks\.io$/,
  /^https:\/\/anthonygdunn-hub\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

export function corsFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.some((r) => r.test(origin)) ? origin : "https://honesthandicap.golf",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export const clip = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
export const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s + (Deno.env.get("SUPABASE_URL") ?? "")));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const ipHash = async (req: Request) => (await sha(req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown")).slice(0, 32);

// Tester codes look like HH-7KQ2-MX9P. No 0/O or 1/I/L so they read clearly over WhatsApp.
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(r, (x) => ALPHA[x % ALPHA.length]).join("");
  return `HH-${c.slice(0, 4)}-${c.slice(4)}`;
}
export function normCode(v: unknown) {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HH/, "");
  return s.length === 8 ? `HH-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export const CATS: Record<string, string> = {
  drivers: "Drivers & woods", irons: "Irons & hybrids", wedges: "Wedges", putters: "Putters", balls: "Balls",
  grips: "Grips", shoes: "Shoes", bags: "Bags & trolleys", tech: "Rangefinders & tech", clothing: "Clothing",
};

export function handicap(v: unknown) {
  const s = String(v ?? "").trim().replace(/^\+/, "-");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : NaN;
}

// Email through Resend. HH_FROM must be on a domain verified in Resend; until honesthandicap.golf
// is verified it falls back to NOTIFY_FROM / BOOKING_FROM, and finally onboarding@resend.dev
// (which only delivers to the Resend account owner).
export async function send(to: string[], subject: string, html: string, text: string, replyTo?: string | null) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const addr = Deno.env.get("HH_FROM") ?? Deno.env.get("NOTIFY_FROM") ?? Deno.env.get("BOOKING_FROM") ?? "onboarding@resend.dev";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Honest Handicap <${addr}>`, to, subject, html, text, reply_to: replyTo ?? undefined }),
    });
    if (!r.ok) console.error("Resend refused", r.status, await r.text());
    return r.ok;
  } catch (e) { console.error("send failed", e); return false; }
}
export const notifyTo = () => [Deno.env.get("HH_NOTIFY_TO") ?? "anthonygdunn@gmail.com"];

export function table(lines: [string, unknown][]) {
  return `<table style="border-collapse:collapse">${lines.map(([l, v]) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#666;vertical-align:top">${esc(l)}</td><td style="white-space:pre-wrap"><strong>${esc(String(v ?? "not given"))}</strong></td></tr>`).join("")}</table>`;
}
