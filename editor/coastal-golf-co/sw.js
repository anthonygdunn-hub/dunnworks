// CGC Admin app: opens with no signal (the screens come from the cache when the network can't)
// and shows phone alerts for new bookings. Data from Supabase is never cached here.
const CACHE = "cgc-admin-v4";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./badge.svg", "./icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;
  const shell = url.origin === self.location.origin || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com");
  if (!shell) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))));
});

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: "Coastal Golf Co", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Coastal Golf Co", {
    body: m.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: m.tag || undefined, renotify: !!m.tag, data: { url: m.url || "#home" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL("./" + ((e.notification.data && e.notification.data.url) || "#home"), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
