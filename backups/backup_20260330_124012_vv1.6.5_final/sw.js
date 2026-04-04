self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name))))
    );
    self.registration.unregister();
});
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
