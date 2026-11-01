/* Trip Log offline worker: keeps the app itself on the phone so it opens with no signal.
 * Trip data lives in the page's own storage and syncs to Supabase when online;
 * Supabase requests are never cached here. Bump VERSION on every release. */
const VERSION = 'tl-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'vendor/supabase.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tl-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;            // live data, never cached
  // Google font: cache once, then serve from cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request).then((hit) => hit ||
      fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; }).catch(() => new Response('', { status: 504 })))));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith('/triplog/')) return;
  // pages: network first so updates land, cache when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  // everything else: cache first, refresh in the background
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
