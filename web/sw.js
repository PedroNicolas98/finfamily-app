// Service worker de FinFamily: guarda el cascarón de la app para abrirla sin conexión.
// La API (Apps Script) y Google están en otros dominios: esas peticiones no se tocan
// y van directo a la red. Cambia VERSION al publicar cambios.

const VERSION = 'finfamily-v8';
const CASCARON = [
  './',
  './index.html',
  './estilos.css',
  './config.js',
  './api.js',
  './cola.js',
  './app.js',
  './manifest.webmanifest',
  './iconos/icono.svg',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './fuentes/plus-jakarta-sans.woff2',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARON)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API y Google: sin intervenir

  // Navegación: red primero y, si no hay señal, el index guardado.
  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then(async (r) => {
          // Solo una respuesta correcta reemplaza el cascarón: un 404/500 nunca se guarda.
          if (r.ok && r.type === 'basic') {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copia));
            return r;
          }
          const guardado = await caches.match('./index.html');
          return guardado || r;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Archivos del cascarón: lo guardado al instante y se actualiza por detrás.
  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then((guardado) => {
      const deRed = fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return r;
        })
        .catch(() => guardado);
      return guardado || deRed;
    }),
  );
});
