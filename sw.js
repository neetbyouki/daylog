// Daylog のサービスワーカー：画面のファイルだけを覚えておき、電波が弱くても開けるようにする（データは毎回取りにいく）
const CACHE = 'daylog-shell-v4';
const SHELL = ['./', './index.html', './boot.js', './daylog.js', './manifest.webmanifest', './icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 新しい版を優先し、つながらないときだけ覚えている版を出す
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
