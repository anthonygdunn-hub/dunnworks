// cgc-ical: Stuart's collections and returns as a calendar feed his phone subscribes to (Coastal Golf Co admin app, More > Settings).
// GET ?k=<key>; the key lives in public.cgc_private (k = 'ical') and is shown in the app to signed-in editors only.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const fold = (s: string) => { const out: string[] = []; let x = s; while (x.length > 72) { out.push(x.slice(0, 72)); x = " " + x.slice(72); } out.push(x); return out.join("\r\n"); };
const txt = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");
const next = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const k = new URL(req.url).searchParams.get("k") || "";
  const { data: key } = await db.from("cgc_private").select("v").eq("k", "ical").maybeSingle();
  if (!key?.v || k !== key.v) return new Response("Not found", { status: 404 });

  const from = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  const [{ data: jobs }, { data: cus }, { data: bks }] = await Promise.all([
    db.from("cgc_jobs").select("id,customer_id,status,service,clubs,price,paid,collect_on,return_on").or(`collect_on.gte.${from},return_on.gte.${from}`),
    db.from("cgc_customers").select("id,name,phone,address,postcode"),
    db.from("cgc_bookings").select("id,name,phone,address,postcode,service,clubs,collection_day,status").gte("collection_day", from).in("status", ["new", "contacted"]),
  ]);
  const C = new Map((cus || []).map((c) => [c.id, c]));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev: string[] = [];
  const add = (uid: string, day: string, title: string, where: string, desc: string) => {
    ev.push(["BEGIN:VEVENT", `UID:${uid}@coastalgolfco`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${next(day)}`,
      fold("SUMMARY:" + txt(title)), where ? fold("LOCATION:" + txt(where)) : "", fold("DESCRIPTION:" + txt(desc)), "TRANSP:TRANSPARENT", "END:VEVENT"].filter(Boolean).join("\r\n"));
  };
  for (const j of jobs || []) {
    const c = C.get(j.customer_id) || {} as Record<string, string>;
    const where = [c.address, c.postcode].filter(Boolean).join(", ");
    const what = [j.service, j.clubs ? j.clubs + " clubs" : ""].filter(Boolean).join(", ");
    const link = `https://dunnworks.io/editor/coastal-golf-co/#job/${j.id}`;
    if (j.collect_on) add(`c-${j.id}`, j.collect_on, (j.status === "booked" ? "Collect: " : "✓ Collected: ") + (c.name || "customer"), where, [what, c.phone, link].filter(Boolean).join("\n"));
    if (j.return_on) add(`r-${j.id}`, j.return_on, (j.status === "returned" ? "✓ Returned: " : "Return: ") + (c.name || "customer") + (!j.paid && j.price != null ? ` (take £${j.price})` : ""), where, [what, c.phone, link].filter(Boolean).join("\n"));
  }
  for (const b of bks || []) add(`b-${b.id}`, b.collection_day, "Booking request: " + b.name, [b.address, b.postcode].filter(Boolean).join(", "),
    [[b.service, b.clubs ? b.clubs + " clubs" : ""].filter(Boolean).join(", "), b.phone, "Not confirmed yet", `https://dunnworks.io/editor/coastal-golf-co/#booking/${b.id}`].filter(Boolean).join("\n"));

  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coastal Golf Co//Admin//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Coastal Golf Co", "X-WR-TIMEZONE:Europe/London", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H", ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" } });
});
