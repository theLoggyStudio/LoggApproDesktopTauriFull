importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  // Prend le contrôle immédiatement
  workbox.core.clientsClaim();
  workbox.core.skipWaiting();

  // Mise en cache des fichiers statiques générés (prerender)
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // Cache dynamique pour toutes les requêtes réseau (HTML, JS, CSS, images, API, etc.)
  workbox.routing.registerRoute(
    ({request}) => [
      'document',
      'script',
      'style',
      'image',
      'font',
      'audio',
      'video',
      'manifest'
    ].includes(request.destination),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'dynamic-cache-v1',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 1 semaine
        }),
      ],
    })
  );

  // Cache dynamique pour les requêtes API (optionnel)
  workbox.routing.registerRoute(
    ({url}) => url.pathname.startsWith('/api/'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'api-cache-v1',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 jour
        }),
      ],
    })
  );

  // Fallback offline (optionnel)
  workbox.routing.setCatchHandler(async ({event}) => {
    if (event.request.destination === 'document') {
      return caches.match('/index.html');
    }
    return Response.error();
  });

  // Log pour debug
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

  console.log('Service Worker Workbox avec cache dynamique et offline prêt !');
} else {
  console.log('Workbox non chargé, le service worker ne sera pas actif.');
} 
