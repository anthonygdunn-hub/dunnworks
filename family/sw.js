/* Dunn Hub offline shell.
 * The app's own files are fetched fresh whenever there's signal (so updates show straight away)
 * and only fall back to the saved copy when offline. Family data always comes live from Supabase
 * and is never cached here. Bump VERSION on every release. */
const VERSION = 'fam-v9';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'vendor/supabase.js',
  'icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/apple-touch-icon-v2.png'];
self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: 'reload' }).then((r) => r.ok && c.put(u, r)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fam-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request).then((hit) => hit ||
      fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; }).catch(() => new Response('', { status: 504 })))));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith('/family/')) return;
  // network first, saved copy when offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request.mode === 'navigate' ? 'index.html' : e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request.mode === 'navigate' ? 'index.html' : e.request)));
});
