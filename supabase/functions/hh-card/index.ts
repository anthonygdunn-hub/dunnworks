// hh-card: a tester hands in a review card, with up to three photos.
// Only approved testers can send one: the card must carry their personal tester code.
// Name and home course come from the tester's own record, so nobody can write as someone else.
// The card is saved as "submitted" and waits for approval in the dunnworks.io console.
// verify_jwt off: called from the public site with no sign-in.
import { CATS, clip, corsFor, db, handicap, ipHash, normCode, notifyTo, send, sha, table } from "../_shared/hh.ts";

const MAX_PHOTOS = 3, MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function score(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

// count failed code attempts per connection, kept in hh_settings
async function failures(ip: string, add = false) {
  const key = "codefail:" + ip;
  const { data } = await db.from("hh_settings").select("value").eq("key", key).maybeSingle();
  const now = Date.now();
  let v = (data?.value as { n: number; since: number } | null) ?? { n: 0, since: now };
  if (now - v.since > 3600_000) v = { n: 0, since: now };
  if (add) { v.n += 1; await db.from("hh_settings").upsert({ key, value: v, updated_at: new Date().toISOString() }); }
  return v.n;
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let f: FormData;
  try { f = await req.formData(); } catch { return json({ error: "Bad request" }, 400); }
  const g = (k: string) => f.get(k);

  if (clip(g("website"), 200) || (g("check") !== "1" && Number(g("ms") ?? 0) < 8000)) return json({ ok: true });

  const ip = await ipHash(req);
  if (await failures(ip) >= 8) return json({ error: "Too many wrong codes. Wait an hour, or ask Anthony for your code again." }, 429);

  const code = normCode(g("code"));
  const { data: tester } = code
    ? await db.from("hh_testers").select("id,name,email,course,handicap,status").eq("code_hash", await sha(code)).maybeSingle()
    : { data: null };
  if (!tester || tester.status !== "approved") {
    await failures(ip, true);
    return json({ error: "That tester code isn't right. Check it against the message you were sent, or ask Anthony for it again.", field: "code" }, 403);
  }

  // the form checks the code first, so the tester sees their own name before filling the card in
  if (g("check") === "1") return json({ ok: true, first_name: String(tester.name).trim().split(/\s+/)[0], handicap: tester.handicap });

  const hc = handicap(g("handicap"));
  const category = String(g("category") ?? "");
  const row = {
    tester_id: tester.id,
    first_name: String(tester.name).trim().split(/\s+/)[0].slice(0, 40),
    course: tester.course,
    handicap: hc === null || Number.isNaN(hc) ? tester.handicap : hc,
    product: clip(g("product"), 140), category,
    source: clip(g("source"), 40), paid: clip(g("paid"), 30), rounds: clip(g("rounds"), 80),
    performance: score(g("performance")), feel: score(g("feel")), build: score(g("build")), value: score(g("value")), overall: score(g("overall")),
    again: g("again") === "Yes" ? true : g("again") === "No" ? false : null,
    oneline: clip(g("oneline"), 200), writeup: clip(g("writeup"), 8000),
    suits: clip(g("suits"), 300), notsuits: clip(g("notsuits"), 300), annoyed: clip(g("annoyed"), 300),
    ip_hash: ip,
  };
  if (!row.product) return json({ error: "Please add the brand and model.", field: "product" }, 400);
  if (!CATS[category]) return json({ error: "Please pick a category.", field: "category" }, 400);
  if ([row.performance, row.feel, row.build, row.value, row.overall].some((s) => s === null)) return json({ error: "Please give all five scores, each from 1 to 10.", field: "performance" }, 400);
  if (row.again === null) return json({ error: "Would you buy it again? Pick yes or no.", field: "again" }, 400);
  if (!row.oneline) return json({ error: "Please add your one-line verdict.", field: "oneline" }, 400);
  if (!row.writeup || row.writeup.length < 150) return json({ error: "Tell us a bit more about how it played: a couple of paragraphs is perfect.", field: "writeup" }, 400);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("hh_reviews").select("id", { count: "exact", head: true }).eq("tester_id", tester.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return json({ error: "That's five cards in an hour. Have a breather and send the rest later." }, 429);

  const files = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, MAX_PHOTOS);
  for (const p of files) {
    if (!TYPES[p.type]) return json({ error: "Photos need to be JPG, PNG or WebP.", field: "photos" }, 400);
    if (p.size > MAX_BYTES) return json({ error: "Each photo needs to be under 8 MB.", field: "photos" }, 400);
  }

  const { data: saved, error } = await db.from("hh_reviews").insert(row).select("id").single();
  if (error) { console.error("insert failed", error); return json({ error: "Could not save your card. Please try again in a minute." }, 500); }

  const paths: string[] = [];
  for (const [i, p] of files.entries()) {
    const path = `${saved.id}/${i + 1}.${TYPES[p.type]}`;
    const { error: up } = await db.storage.from("hh-uploads").upload(path, p, { contentType: p.type, upsert: true });
    if (up) console.error("photo upload failed", up); else paths.push(path);
  }
  if (paths.length) await db.from("hh_reviews").update({ photos: paths }).eq("id", saved.id);

  const lines: [string, unknown][] = [["Tester", `${row.first_name} (${row.handicap})`], ["Product", row.product], ["Category", CATS[category]],
    ["Came from", row.source], ["Paid", row.paid], ["Rounds", row.rounds],
    ["Scores", `Performance ${row.performance}, feel ${row.feel}, build ${row.build}, value ${row.value}`], ["Overall", row.overall],
    ["Buy again", row.again ? "Yes" : "No"], ["Verdict", row.oneline], ["Photos", paths.length]];
  await send(notifyTo(), `Review card: ${row.product} from ${row.first_name} (${row.overall}/10)`,
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"><h2 style="margin:0 0 12px">New review card</h2>${table(lines)}
     <p style="margin-top:18px"><a href="https://dunnworks.io/console/#/hh">Check and publish it in the console</a></p></div>`,
    lines.map(([l, v]) => `${l}: ${v ?? ""}`).join("\n"), tester.email);

  return json({ ok: true, photos: paths.length, first_name: row.first_name });
});
