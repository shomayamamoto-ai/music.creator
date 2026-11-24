// Music Creator のサービスワーカー(オフラインでも画面・履歴を開けるようにする)。
// 版は公開時に scripts/build-site.mjs が書き換えます。
const VERSION = '__VERSION__';
const CACHE = `mc-${VERSION}`;
const SHELL = ['./', './index.html', './style.css', './dist/app.js', './textbook.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mc-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // AI の API など、ほかのサイトへの通信には一切手を出さない(フォントだけは例外的に保存)
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;
  if (isFont) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // 自分のファイル:保存した版をすぐ返す(更新は新しいサービスワーカーで入れ替える)
  e.respondWith(caches.match(req, { ignoreSearch: url.pathname.endsWith('textbook.html') }).then((hit) => hit || fetch(req)));
});
