/* BlockVault service worker. Bump V on every deploy so visitors get the new files. */
const V = "bv-v3";
const SHELL = ["./", "index.html", "css/store.css", "css/markdown.css", "js/store.js", "js/markdown.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.hostname === "api.github.com" || r.headers.has("Authorization") || u.pathname.includes("admin")) return;   // never touch the dashboard, GitHub API calls or authenticated requests
  const remote = /githubusercontent|jsdelivr/.test(u.hostname) || /\/data\/.*\.json$/.test(u.pathname);
  if (remote) {                                                                     // API JSON and libraries: network first, cache when offline
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => caches.match(r)));
    return;
  }
  if (r.mode === "navigate") { e.respondWith(fetch(r).catch(() => caches.match("index.html"))); return; }
  if (u.origin === location.origin) e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
});
