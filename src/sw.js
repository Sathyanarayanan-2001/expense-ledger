/* Network first, so updates arrive as soon as you are online; the cached page is the offline fallback.
   GitHub Pages serves every project of one account from the same origin, so this file only ever touches
   caches that start with "expense-ledger-" and leaves other projects' caches alone. */
const PREFIX = 'expense-ledger-';
const CACHE = PREFIX + '__VERSION__';
const ROOT = new URL('./', location).pathname;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(ROOT)) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(url.pathname === ROOT ? './' : e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./'))));
});
