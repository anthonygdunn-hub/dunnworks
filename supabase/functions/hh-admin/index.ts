// hh-admin: the Honest Handicap actions behind the dunnworks.io console.
// Owner only (info@dunnworks.io), checked against the signed-in user's token.
//
// Actions (POST JSON { action, id?, ... }):
//   approve_tester / reissue_code  -> issues a tester code, returns it once (only its hash is kept)
//   decline_tester / remove_tester -> stops the code working
//   photos                         -> short-lived links to a card's private photos
//   publish                        -> copies photos to the public bucket, marks the card published, rebuilds the site
//   unpublish / reject             -> takes it down (and rebuilds if it was live)
//   rebuild                        -> asks GitHub to rebuild and redeploy the site
//
// Secrets: HH_GITHUB_TOKEN (fine-grained token, Actions: read and write on the honest-handicap repo),
// HH_GITHUB_REPO (default anthonygdunn-hub/honest-handicap), HH_FROM to email testers their code
// (only once a domain like honesthandicap.golf is verified in Resend).
import { CATS, corsFor, db, esc, newCode, send, sha } from "../_shared/hh.ts";

const OWNER = "info@dunnworks.io";
const SITE = "https://honesthandicap.golf";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");

async function rebuild(reason: string) {
  const token = Deno.env.get("HH_GITHUB_TOKEN");
  const repo = Deno.env.get("HH_GITHUB_REPO") ?? "anthonygdunn-hub/honest-handicap";
  const at = new Date().toISOString();
  if (!token) {
    await db.from("hh_settings").upsert({ key: "last_build", value: { at, reason, ok: false, why: "no HH_GITHUB_TOKEN yet" }, updated_at: at });
    return { ok: false, why: "The site can't rebuild itself yet: the GitHub token hasn't been added. The change is saved and goes out on the next build." };
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/build.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "dunnworks-hh-admin" },
    body: JSON.stringify({ ref: "main", inputs: { reason: reason.slice(0, 100) } }),
  });
  const ok = r.status === 204;
  const why = ok ? null : `GitHub said ${r.status}: ${(await r.text()).slice(0, 200)}`;
  await db.from("hh_settings").upsert({ key: "last_build", value: { at, reason, ok, why, repo }, updated_at: at });
  return ok ? { ok, why: null } : { ok, why: "The rebuild didn't start. " + why };
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (u?.user?.email?.toLowerCase() !== OWNER) return json({ error: "Not allowed" }, 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const id = String(b.id ?? "");
  const action = String(b.action ?? "");

  if (action === "approve_tester" || action === "reissue_code") {
    const { data: t } = await db.from("hh_testers").select("*").eq("id", id).single();
    if (!t) return json({ error: "Tester not found" }, 404);
    const code = newCode();
    const at = new Date().toISOString();
    const { error } = await db.from("hh_testers").update({ status: "approved", code_hash: await sha(code), code_issued_at: at, approved_at: t.approved_at ?? at }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    const first = String(t.name).trim().split(/\s+/)[0];
    const message = `Hi ${first}, you're in as an Honest Handicap tester. Your tester code is ${code}. ` +
      `Keep it to yourself: you'll need it each time you hand in a review card at ${SITE}/submit/ . ` +
      `Play at least three rounds (or two and a range session) with the kit first, and be honest. That's the whole point. Cheers, Anthony`;
    let emailed = false;
    if (Deno.env.get("HH_FROM")) {
      emailed = await send([t.email], "You're an Honest Handicap tester",
        `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;max-width:560px"><p>Hi ${esc(first)},</p>
         <p>You're in as an Honest Handicap tester. Your tester code is:</p>
         <p style="font:700 26px/1 monospace;letter-spacing:3px;padding:14px 18px;background:#0B0B2A;color:#19D3FF;display:inline-block;border-radius:6px">${code}</p>
         <p>Keep it to yourself: you'll need it each time you hand in a review card at <a href="${SITE}/submit/">${SITE.replace("https://", "")}/submit</a>.</p>
         <p>Play at least three rounds (or two and a range session) with the kit before you send a card, and be honest. That's the whole point.</p><p>Cheers,<br>Anthony</p></div>`,
        message);
    }
    return json({ ok: true, code, message, emailed, email: t.email });
  }

  if (action === "decline_tester" || action === "remove_tester") {
    const { error } = await db.from("hh_testers").update({ status: action === "decline_tester" ? "declined" : "left", code_hash: null }).eq("id", id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (action === "photos") {
    const { data: r } = await db.from("hh_reviews").select("photos").eq("id", id).single();
    const paths = (r?.photos ?? []) as string[];
    if (!paths.length) return json({ ok: true, urls: [] });
    const { data } = await db.storage.from("hh-uploads").createSignedUrls(paths, 600);
    return json({ ok: true, urls: (data ?? []).map((x) => x.signedUrl) });
  }

  if (action === "publish") {
    const { data: r } = await db.from("hh_reviews").select("*").eq("id", id).single();
    if (!r) return json({ error: "Card not found" }, 404);
    if (!CATS[r.category]) return json({ error: "Pick a category first" }, 400);
    let slug = slugify(String(b.slug || r.slug || r.product));
    if (!slug) return json({ error: "That needs a web address" }, 400);
    const { data: clash } = await db.from("hh_reviews").select("id").eq("slug", slug).neq("id", id).maybeSingle();
    if (clash) slug = `${slug}-${String(r.first_name).toLowerCase().replace(/[^a-z]/g, "")}`.slice(0, 80);

    // copy the photos to the public bucket under the review's address
    const pub: string[] = [];
    for (const [i, p] of ((r.photos ?? []) as string[]).entries()) {
      const { data: blob, error: dl } = await db.storage.from("hh-uploads").download(p);
      if (dl || !blob) { console.error("photo download failed", p, dl); continue; }
      const ext = p.split(".").pop();
      const dest = `${r.category}/${slug}/${i + 1}.${ext}`;
      const { error: up } = await db.storage.from("hh-public").upload(dest, blob, { contentType: blob.type || "image/jpeg", upsert: true });
      if (up) console.error("public upload failed", dest, up); else pub.push(dest);
    }
    const { error } = await db.from("hh_reviews").update({
      slug, status: "published", public_photos: pub, published_at: r.published_at ?? new Date().toISOString(),
      title: r.title || `${r.product} review`,
    }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    const built = await rebuild(`Published ${r.product}`);
    return json({ ok: true, slug, url: `${SITE}/reviews/${r.category}/${slug}/`, built });
  }

  if (action === "unpublish" || action === "reject") {
    const { data: r } = await db.from("hh_reviews").select("status,public_photos").eq("id", id).single();
    if (!r) return json({ error: "Card not found" }, 404);
    const wasLive = r.status === "published";
    if ((r.public_photos ?? []).length) await db.storage.from("hh-public").remove(r.public_photos);
    const { error } = await db.from("hh_reviews").update({ status: action === "reject" ? "rejected" : "unpublished", public_photos: [] }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, built: wasLive ? await rebuild("Took down a review") : null });
  }

  if (action === "rebuild") return json({ ok: true, built: await rebuild(String(b.reason ?? "Rebuilt from the console")) });

  return json({ error: "Unknown action" }, 400);
});
