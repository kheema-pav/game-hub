/* Game Hub service worker: offline play. Spec: docs/hubkit-spec.md (amendment B). */
const VERSION = 'gh-v1';
const CACHE = VERSION;
const FONTS = 'gh-fonts-v1';
const PRECACHE = ['./', 'codex/', 'isles/', 'gems/', 'sketch/', 'shared/hubkit.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) =>
    // One missing file must not block the install, so add each on its own.
    Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})))
  ));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: true });
    const fallback = () => fromCache().then((hit) => { if (!settled) { settled = true; resolve(hit || Response.error()); } });
    const timer = setTimeout(fallback, 3000);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); fallback(); });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(FONTS).then((cache) =>
    cache.match(request).then((hit) => {
      const net = fetch(request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
        return res;
      }).catch(() => hit || Response.error());
      return hit || net;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});
