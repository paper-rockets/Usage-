const CACHE = 'token-eater-v2';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './usage.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('token-eater-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cached = response.clone();
        event.waitUntil(cache.put(event.request, cached));
      }
      return response;
    } catch {
      const saved = await cache.match(event.request);
      if (saved) {
        const headers = new Headers(saved.headers);
        headers.set('X-Token-Eater-Cached', '1');
        return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers });
      }
      if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
