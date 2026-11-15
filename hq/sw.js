/* Dunnworks Workspace app: alerts and a small offline shell.
   Data always comes live from Supabase; only the app's own files are cached. */
var V = 'dw-hq-3';
var SHELL = ['/hq/', '/hq/index.html', '/assets/css/styles.css', '/assets/css/console.css?v=20261115', '/hq/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* network first for the app's own files, cache as the fallback; everything else untouched */
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (!/^\/(hq|assets)\//.test(u.pathname)) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(V).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('/hq/index.html'); }); }));
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dunnworks', {
    body: d.body || '', tag: d.tag || undefined, icon: '/hq/icon-192.png', badge: '/hq/badge.png',
    data: { url: d.url || '/hq/#/hq' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/hq/#/hq';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf('/hq/') !== -1) { cs[i].navigate(url).catch(function () {}); return cs[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
