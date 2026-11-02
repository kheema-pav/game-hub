/* One complete cached release at a time. Bump VERSION whenever shipped assets change. */
const VERSION = 'gh-v10';
const CACHE = VERSION;
const FONTS = 'gh-fonts-v1';
const PRECACHE = [
  './', 'codex/', 'isles/', 'gems/', 'sketch/', 'ticket/', 'ludo/', 'connect4/', 'azul/', 'reversi/', 'yahtzee/',
  ...['codex', 'isles', 'gems', 'sketch'].flatMap(game =>
    ['style.css', 'engine.js', 'game.js'].map(file => game + '/' + file)),
  ...['ticket', 'ludo', 'connect4', 'azul', 'reversi', 'yahtzee'].flatMap(game => ['style.css', 'engine.js', 'game.js'].map(file => game + '/' + file)),
  'ticket/data.js', 'ticket/geography.js', 'shared/tabletop-core.js', 'shared/tabletop.js', 'shared/tabletop.css',
  'isles/bot.js', 'shared/hubkit.js', 'shared/online.js', 'shared/lobby.js',
  'shared/game-night.js', 'shared/game-night-hub.js', 'shared/session.js', 'shared/versions.js', 'shared/firebase-config.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', event => {
  // A missing asset rejects installation, leaving the previous complete release active.
  // Do not skipWaiting: running games must finish with the code they started with.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    PRECACHE.map(path => new Request(path, { cache: 'reload' }))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('gh-') && key !== CACHE && key !== FONTS)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

function pageKey(url) {
  // Query parameters carry room/mode intent, not different HTML. Only known document
  // routes are canonicalised. Scripts and styles always use exact cache keys.
  const root = new URL('./', self.location.href);
  const relative = url.pathname.slice(root.pathname.length);
  const page = relative === 'index.html' || relative === '' ? './'
    : /^(codex|isles|gems|sketch|ticket|ludo|connect4|azul|reversi|yahtzee)\/(index\.html)?$/.test(relative)
      ? relative.split('/')[0] + '/' : null;
  return page ? new URL(page, root).href : null;
}

async function releaseAsset(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  const documentKey = request.mode === 'navigate' ? pageKey(url) : null;
  const hit = await cache.match(documentKey || request);
  // Do not replace cached executable assets individually with a newer release.
  // A new service-worker install fetches and validates the complete next release.
  return hit || fetch(request);
}

async function fontAsset(request) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(releaseAsset(request));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fontAsset(request));
  }
  // Firebase SDK and APIs are deliberately left to the browser.
});
