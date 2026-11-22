// wfc-instagram-sync: copy West Farnborough FC's Instagram posts into wfc_instagram
// for the club website's gallery and feed (Instagram API with Instagram Login).
//
// Instagram image links are signed and expire, so every picture (and carousel
// picture, and video cover) is copied into the public "gallery" bucket under
// westfarnborough/. Posts arrive shown; a manager can hide one in the club hub.
//
// The token is pasted into the hub by a club admin (wfc_set_ig_token) and kept in
// wfc_private. Long-lived tokens last 60 days, so the token is refreshed here
// whenever it is more than a week old, which keeps it alive while the sync runs.
//
// Who may run it: the nightly job (x-wfc-cron header = wfc_private.cron_secret)
// or a signed-in hub admin, committee member or manager ("Sync now").
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = [/^https:\/\/(www\.)?dunnworks\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.some((r) => r.test(o)) ? o : "https://dunnworks.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wfc-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});
const IG = "https://graph.instagram.com";
const BUCKET = "gallery";
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}";

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const priv = async (k: string) => (await db.from("wfc_private").select("v,updated_at").eq("k", k).maybeSingle()).data;

  // who is asking
  const cron = req.headers.get("x-wfc-cron");
  let allowed = false;
  if (cron) { const s = await priv("cron_secret"); allowed = !!s && s.v === cron; }
  else {
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("authorization") || "" } }, auth: { persistSession: false } });
    const { data: role } = await user.rpc("wfc_role");
    allowed = ["admin", "committee", "manager"].includes(role as string);
  }
  if (!allowed) return json({ error: "Not allowed" }, 403);

  const tok = await priv("ig_token");
  if (!tok) return json({ connected: false, error: "Instagram is not connected yet. An admin pastes the token in Manage > Instagram." }, 400);
  let token = tok.v;

  // keep the 60-day token alive
  if (Date.now() - new Date(tok.updated_at).getTime() > 7 * 864e5) {
    const r = await fetch(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.access_token) {
      token = j.access_token;
      await db.from("wfc_private").update({ v: token, updated_at: new Date().toISOString() }).eq("k", "ig_token");
    }
  }

  const copy = async (src: string | undefined, path: string): Promise<string | null> => {
    if (!src) return null;
    const bin = await fetch(src);
    if (!bin.ok) return null;
    const type = bin.headers.get("content-type") || "image/jpeg";
    const { error } = await db.storage.from(BUCKET).upload(path, new Uint8Array(await bin.arrayBuffer()), { contentType: type, upsert: true });
    return error ? null : db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const { data: have } = await db.from("wfc_instagram").select("id,image_url");
  const known = new Map((have || []).map((r) => [r.id, r.image_url]));
  let next: string | null = `${IG}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=50&access_token=${encodeURIComponent(token)}`;
  let added = 0, updated = 0, pages = 0;
  try {
    while (next && pages < 6) {
      pages++;
      const r = await fetch(next);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || `Instagram said ${r.status}`);
      for (const m of j.data || []) {
        const row: Record<string, unknown> = { id: m.id, media_type: m.media_type, caption: m.caption ?? null, permalink: m.permalink, posted_at: m.timestamp, synced_at: new Date().toISOString() };
        if (!known.get(m.id)) {
          row.image_url = await copy(m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url, `westfarnborough/${m.id}.jpg`);
          const kids: string[] = [];
          for (const c of (m.children?.data || []).slice(1, 10)) {
            const u = await copy(c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url, `westfarnborough/${m.id}-${c.id}.jpg`);
            if (u) kids.push(u);
          }
          row.children = kids;
          added++;
        } else updated++;
        await db.from("wfc_instagram").upsert(row, { onConflict: "id" });
      }
      next = j.paging?.next || null;
    }
  } catch (e) {
    return json({ connected: true, error: String((e as Error).message || e), added, updated }, 502);
  }
  return json({ connected: true, added, updated });
});
