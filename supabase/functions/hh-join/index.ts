// hh-join: the Honest Handicap "Become a tester" form.
// Saves the application to hh_testers (status applied) and emails Anthony.
// verify_jwt off: called from the public site with no sign-in.
import { clip, corsFor, db, handicap, ipHash, notifyTo, send, table } from "../_shared/hh.ts";

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  // spam: a hidden box people never fill in, and forms sent faster than anyone types
  if (clip(b.website, 200) || Number(b.ms ?? 0) < 3000) return json({ ok: true });

  const hc = handicap(b.handicap);
  const row = {
    name: clip(b.name, 120), email: clip(b.email, 200)?.toLowerCase() ?? null, handicap: hc,
    course: clip(b.course, 120), often: clip(b.often, 60), kit: clip(b.kit, 60), bag: clip(b.bag, 2000),
    consent: b.ok === true || b.ok === "on" || b.ok === "true",
    ip_hash: await ipHash(req),
  };
  if (!row.name || !row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json({ error: "Please add your name and a working email address." }, 400);
  if (row.handicap === null || Number.isNaN(row.handicap)) return json({ error: "Please put your handicap index in as a number, like 14.2." }, 400);
  if (!row.course) return json({ error: "Please tell us your home course." }, 400);
  if (!row.consent) return json({ error: "Please tick the box at the end so we can show your first name, handicap and course on your reviews." }, 400);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("hh_testers").select("id", { count: "exact", head: true }).eq("ip_hash", row.ip_hash).gte("created_at", since);
  if ((count ?? 0) >= 5) return json({ error: "We've had a few applications from you already. Email hello@honesthandicap.golf instead." }, 429);

  // one application per email address: a second one just updates the first while it's waiting
  const { data: had } = await db.from("hh_testers").select("id,status").eq("email", row.email).maybeSingle();
  if (had && had.status === "approved") return json({ ok: true, already: true });
  const q = had ? db.from("hh_testers").update({ ...row, status: "applied" }).eq("id", had.id) : db.from("hh_testers").insert(row);
  const { error } = await q;
  if (error) { console.error("save failed", error); return json({ error: "Could not save that. Please try again in a minute." }, 500); }

  const lines: [string, unknown][] = [["Name", row.name], ["Email", row.email], ["Handicap", row.handicap], ["Home course", row.course],
    ["Plays", row.often], ["Wants to test", row.kit], ["In the bag", row.bag]];
  await send(notifyTo(), `New tester application: ${row.name} (${row.handicap})`,
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"><h2 style="margin:0 0 12px">New tester application</h2>${table(lines)}
     <p style="margin-top:18px"><a href="https://dunnworks.io/console/#/hh">Approve or decline in the console</a></p></div>`,
    lines.map(([l, v]) => `${l}: ${v ?? ""}`).join("\n"), row.email);
  return json({ ok: true });
});
