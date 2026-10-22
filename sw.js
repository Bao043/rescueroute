/* 救途 RescueRoute：離線快取
 * - 網頁本身：先用網路（拿到最新版），沒網路時用快取
 * - 地圖程式庫、字型、Firebase SDK：快取優先
 * - 地圖圖磚（OpenStreetMap）：看過的區域會留著，沒網路時還看得到
 * - Gemini、車程、Firebase 資料：一律走網路（資料另存在瀏覽器裡）
 */
const VERSION = 'v3.30.0';
const SHELL = 'shell-' + VERSION;
const LIBS = 'libs-v1';
const TILES = 'tiles-v2';   // v2：改用 OpenStreetMap，舊的 CARTO 圖磚（含 API KEY 字樣）一併清掉
const TILE_MAX = 400;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', './index.html', './manifest.webmanifest?v=2', './icon-192.png?v=2', './icon-512.png?v=2', './apple-touch-icon.png?v=2']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => (k.startsWith('shell-') && k !== SHELL) || (k.startsWith('tiles-') && k !== TILES)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 網頁本身
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(SHELL).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  // 同網域的靜態檔
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  // 程式庫與字型
  if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs/.test(url.host + url.pathname)) {
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // 地圖圖磚
  if (/(^|\.)tile\.openstreetmap\.org$/.test(url.host)) {
    e.respondWith(caches.open(TILES).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimCache(TILES, TILE_MAX); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })));
  }
});
