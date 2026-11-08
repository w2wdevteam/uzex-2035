const C = "uzex2035-v2";
const SHELL = ["./", "index.html", "styles.css?v=2", "config.js?v=2", "engine.js?v=2", "app.js?v=2", "icon.svg", "fonts/onest-latin.woff2", "fonts/onest-latin-ext.woff2", "fonts/plexmono-500-latin.woff2", "manifest.webmanifest", "data/market.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
