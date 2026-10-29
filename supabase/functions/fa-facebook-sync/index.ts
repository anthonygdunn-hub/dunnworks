// fa-facebook-sync: pull new photos and videos from The Falkners Arms Facebook
// Page into fa_gallery (see supabase/falkners-gallery.sql).
//
// Facebook CDN links are signed and expire within days, so photos (and video
// thumbnails) are copied into the public "gallery" bucket under falkners/.
// Videos themselves are not copied: they link to the post on Facebook.
// Everything arrives with approved = false so a manager picks what shows.
//
// Needs secrets FA_FB_PAGE_TOKEN (a Page access token from a Page admin) and,
// optionally, FA_FB_PAGE_ID (defaults to thefalknersarms). Without a token it
// returns a 400 and does nothing.
import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'gallery';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function copyToStorage(src: string, path: string): Promise<string | null> {
  const bin = await fetch(src);
  if (!bin.ok) return null;
  const type = bin.headers.get('content-type') || 'image/jpeg';
  const { error } = await db.storage.from(BUCKET).upload(path, new Uint8Array(await bin.arrayBuffer()), { contentType: type, upsert: true });
  if (error) return null;
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

Deno.serve(async () => {
  const token = Deno.env.get('FA_FB_PAGE_TOKEN');
  const page = Deno.env.get('FA_FB_PAGE_ID') ?? 'thefalknersarms';
  if (!token) return Response.json({ ok: false, error: 'FA_FB_PAGE_TOKEN is not set yet. A Page admin needs to connect the Page.' }, { status: 400 });

  const { data: seenRows } = await db.from('fa_gallery').select('external_id').not('external_id', 'is', null);
  const seen = new Set((seenRows || []).map((r: any) => r.external_id));
  const added: string[] = [], failed: { id: string; why: string }[] = [];

  const photos = await (await fetch(`${GRAPH}/${page}/photos?type=uploaded&fields=id,created_time,name,images&limit=50&access_token=${token}`)).json();
  if (photos.error) return Response.json({ ok: false, stage: 'photos', error: photos.error.message }, { status: 502 });
  for (const p of photos.data ?? []) {
    if (seen.has(p.id)) continue;
    const best = (p.images ?? []).slice().sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0];
    if (!best) { failed.push({ id: p.id, why: 'no image sizes' }); continue; }
    const url = await copyToStorage(best.source, `falkners/${p.id}.jpg`);
    if (!url) { failed.push({ id: p.id, why: 'copy failed' }); continue; }
    const { error } = await db.from('fa_gallery').insert({ external_id: p.id, kind: 'photo', image_url: url, caption: (p.name ?? '').trim() || null, taken_at: p.created_time, source: 'facebook', approved: false });
    error ? failed.push({ id: p.id, why: error.message }) : added.push(p.id);
  }

  const videos = await (await fetch(`${GRAPH}/${page}/videos?fields=id,created_time,description,picture,permalink_url&limit=25&access_token=${token}`)).json();
  if (!videos.error) for (const v of videos.data ?? []) {
    if (seen.has(v.id) || !v.picture) continue;
    const thumb = await copyToStorage(v.picture, `falkners/${v.id}-thumb.jpg`);
    if (!thumb) { failed.push({ id: v.id, why: 'thumbnail copy failed' }); continue; }
    const link = v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : 'https://www.facebook.com' + v.permalink_url) : null;
    const { error } = await db.from('fa_gallery').insert({ external_id: v.id, kind: 'video', image_url: thumb, video_url: link, caption: (v.description ?? '').trim() || null, taken_at: v.created_time, source: 'facebook', approved: false });
    error ? failed.push({ id: v.id, why: error.message }) : added.push(v.id);
  }

  return Response.json({ ok: true, added: added.length, failed, note: 'New items wait for a manager to approve them.' });
});
