/* Build id and complete asset list are generated after Vite builds. */
const CACHE_PREFIX = 'lamina-' + btoa(self.registration.scope) + '-';
const CACHE_NAME = CACHE_PREFIX + '__BUILD_ID__';
const APP_SHELL = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('precache.json', self.registration.scope), { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo preparar el modo sin conexión.');
    const { urls } = await response.json();
    const cache = await caches.open(CACHE_NAME);
    // Installation succeeds only after every required image and app asset is cached.
    await cache.addAll(urls.map(url => new URL(url, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'LAMINA_OFFLINE_READY' }));
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch { /* Use the last fully installed app when offline. */ }
      return (await caches.match(APP_SHELL, { cacheName: CACHE_NAME })) || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request, { cacheName: CACHE_NAME });
    if (cached) return cached;
    return fetch(request);
  })());
});
