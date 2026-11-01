/* The Falkners Arms offline worker: keeps the app on the phone so it opens
 * with no signal. Live listings, bookings and the gallery come from Supabase
 * and are never cached here. Bump VERSION on every release. */
const VERSION = 'fa-v1';
const BASE = '/preview/the-falkners-arms/';
const SHELL = [BASE, BASE + 'manifest.webmanifest', BASE + 'icons/icon-192.png', BASE + 'icons/icon-512.png', BASE + 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fa-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') && url.pathname.includes('/rest/')) return;   // live data, never cached
  // Fonts and photos (pub website, gallery storage, club badges): cache once, then serve from cache
  if (/^(fonts\.(googleapis|gstatic)\.com|thefalknersarms\.co\.uk|r2\.thesportsdb\.com|www\.thesportsdb\.com|www\.thefalknersarmsgolfsociety\.co\.uk)$/.test(url.hostname) ||
      (url.hostname.endsWith('supabase.co') && url.pathname.includes('/storage/'))) {
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request).then((hit) => hit ||
      fetch(e.request).then((res) => { if (res.ok || res.type === 'opaque') c.put(e.request, res.clone()); return res; }).catch(() => new Response('', { status: 504 })))));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  // The page: network first so updates land, cached copy when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(BASE, copy)); return res; })
      .catch(() => caches.match(BASE)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
