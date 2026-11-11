// Service worker de FinFamily: guarda el cascarón de la app para abrirla sin conexión.
// La API (Apps Script) y Google están en otros dominios: esas peticiones no se tocan
// y van directo a la red. Cambia VERSION al publicar cambios.

const VERSION = 'finfamily-v129';
const CASCARON = [
  './',
  './index.html',
  './gasto.html',
  './gasto.webmanifest',
  './iconos/gasto.svg',
  './iconos/gasto-logo-192.png',
  './iconos/gasto-logo-512.png',
  './iconos/gasto-fondo-192.png',
  './iconos/gasto-fondo-512.png',
  './estilos.css',
  './config.js',
  './api.js',
  './cola.js',
  './app.js',
  './manifest.webmanifest',
  './iconos/icono.svg',
  './iconos/logo-192.png',
  './iconos/logo-512.png',
  './iconos/logo-fondo-192.png',
  './iconos/logo-fondo-512.png',
  './fuentes/plus-jakarta-sans.woff2',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARON.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
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

  // Navegación: red primero y, si no hay señal, la página guardada (la app completa o la de gastos).
  if (req.mode === 'navigate') {
    const pagina = url.pathname.endsWith('/gasto.html') ? './gasto.html' : './index.html';
    ev.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(async (r) => {
          // Solo una respuesta correcta reemplaza el cascarón: un 404/500 nunca se guarda.
          if (r.ok && r.type === 'basic') {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put(pagina, copia));
            return r;
          }
          const guardado = await caches.match(pagina);
          return guardado || r;
        })
        .catch(() => caches.match(pagina)),
    );
    return;
  }

  // Archivos de la app: red primero (así siempre se ve la versión nueva) y, si no hay
  // señal o la red tarda más de 4 s, lo guardado en el equipo.
  ev.respondWith((async () => {
    const guardado = await caches.match(req, { ignoreSearch: true });
    // 'no-cache': pregunta al servidor si cambió (GitHub guarda copias 10 min en el navegador).
    const deRed = fetch(req, { cache: 'no-cache' }).then((r) => {
      if (r.ok && r.type === 'basic') {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copia));
      }
      return r;
    });
    if (!guardado) return deRed;
    const espera = new Promise((res) => setTimeout(() => res(null), 4000));
    try {
      const r = await Promise.race([deRed, espera]);
      return r && r.ok ? r : guardado;
    } catch {
      return guardado;
    }
  })());
});
