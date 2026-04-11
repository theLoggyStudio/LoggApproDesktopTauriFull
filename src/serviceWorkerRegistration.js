// Ce fichier permet d'enregistrer le service worker pour le mode PWA (offline/installable)
// Inspiré du template CRA

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    // [::1] est l'adresse IPv6 localhost.
    window.location.hostname === '[::1]' ||
    // 127.0.0.0/8 sont considérés comme localhost pour IPv4.
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

export function register(config) {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // Ceci est exécuté sur localhost. Vérifie si un service worker existe.
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('Ce site est servi en cache-first par un service worker.');
        });
      } else {
        // Enregistre le service worker
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then(registration => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Nouveau contenu dispo, rechargement possible
              console.log('Nouveau contenu disponible, actualisez la page.');
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // Contenu mis en cache pour offline
              console.log('Contenu mis en cache pour une utilisation hors-ligne.');
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch(error => {
      console.error('Erreur lors de l’enregistrement du service worker:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then(response => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // Pas de service worker trouvé. Recharge la page.
        navigator.serviceWorker.ready.then(registration => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker trouvé. Procède à l'enregistrement.
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('Pas de connexion internet. Mode hors-ligne uniquement.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(registration => {
        registration.unregister();
      })
      .catch(error => {
        console.error(error.message);
      });
  }
} 