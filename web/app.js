// FinFamily: pantallas, navegación por hash y sincronización.
import * as api from './api.js';
import * as cola from './cola.js';

// La app aparte para registrar gastos (gasto.html) usa este mismo código en modo "gasto".
const SOLO_GASTO = document.documentElement.dataset.app === 'gasto';

// Instalación en el equipo (el navegador avisa cuando se puede).
let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); eventoInstalar = ev; document.body.classList.add('instalable'); });
window.addEventListener('appinstalled', () => { eventoInstalar = null; document.body.classList.remove('instalable'); });
async function instalarApp() {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  try { await eventoInstalar.userChoice; } catch { /* nada */ }
  eventoInstalar = null;
  document.body.classList.remove('instalable');
}
const esIphoneSinInstalar = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone;

// Confirmación a pantalla completa al guardar un gasto.
function celebrar(monto) {
  const calmado = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const capa = h('div', { class: 'celebra', role: 'status' },
    h('div', { class: 'celebra-centro' },
      calmado ? null : Array.from({ length: 18 }, (_, i) => h('i', { class: 'confeti', 'aria-hidden': 'true',
        style: `--a: ${i * 20}deg; --d: ${80 + (i % 5) * 22}px; --c: var(--d${(i % 5) + 1}); --r: ${i % 2 ? 1 : -1}` })),
      h('span', { class: 'celebra-check' }, icono('check')),
      h('strong', {}, 'Guardado'),
      h('span', {}, soles(monto))));
  document.body.append(capa);
  setTimeout(() => capa.classList.add('fuera'), 1300);
  setTimeout(() => capa.remove(), 1750);
}

// El indicador del menú se desliza hasta la sección activa.
function moverIndicador() {
  const nav = document.getElementById('nav');
  const ind = nav?.querySelector('.nav-indicador');
  if (!ind) return;
  const activo = nav.querySelector('a[aria-current="page"]:not(.central)');
  if (!activo || !activo.offsetWidth) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.width = `${activo.offsetWidth}px`;
  ind.style.height = `${activo.offsetHeight}px`;
  ind.style.transform = `translate(${activo.offsetLeft}px, ${activo.offsetTop}px)`;
}

// ---------- Constantes (copia de las reglas del backend para la vista previa) ----------

const CICLOS_LOCAL = {
  SIP: { cierre: 10, vence: 3 },
  IBK_P: { cierre: 20, vence: 15 },
  IBK_B: { cierre: 20, vence: 20 },
  BCP: { cierre: 20, vence: 20 },
  RIPLEY: { cierre: null, vence: null },
};

const MEDIOS_LOCAL = [
  { id: 'TC_SIP', etiqueta: 'TC SIP', hoja: 'TC SIP', tipo: 'tarjeta' },
  { id: 'TC_IBK', etiqueta: 'TC Interbank', hoja: 'TC IBK', tipo: 'tarjeta' },
  { id: 'TC_BCP', etiqueta: 'TC BCP', hoja: 'TC BCP', tipo: 'tarjeta' },
  { id: 'TC_RIPLEY', etiqueta: 'TC Ripley', hoja: 'TC Ripley', tipo: 'tarjeta' },
  { id: 'YAPE', etiqueta: 'Yape', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'PLIN', etiqueta: 'Plin', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'EFECTIVO', etiqueta: 'Efectivo', hoja: 'Gastos Hormiga', tipo: 'directo' },
];

// Respaldo solo si aún no se pudo leer la hoja 'Configuración'.
const CONCEPTOS_LOCAL = [
  'Chucherías', 'Cuidado Personal', 'Delivery', 'Desayuno', 'Emergencia', 'Entretenimiento',
  'Internet y Telefonía', 'Limpieza', 'Mascotas', 'Matanza', 'Pasajes y Transporte', 'Préstamo',
  'Restaurantes y Salidas', 'Ropa y Calzado', 'Salud y Farmacia', 'Seguro', 'Supermercado', 'Suscripciones',
];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ICONOS = {
  'sin-contacto': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 9a4.6 4.6 0 0 1 0 6M11 6.6a8.4 8.4 0 0 1 0 10.8M14.6 4.2a12.4 12.4 0 0 1 0 15.6"/></svg>',
  meta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="0.9"/></svg>',
  novedad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  'sin-senal': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9a13 13 0 0 1 4.5-3M21 9a13 13 0 0 0-8-3.9M6 12.5a8.5 8.5 0 0 1 3-1.9M18 12.5a8.5 8.5 0 0 0-3.6-2.2M9 16a4 4 0 0 1 6 0M4 4l16 16"/><circle cx="12" cy="19" r=".8"/></svg>',
  recargar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>',
  lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  papelera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
  borrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/></svg>',
  personas: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 13.7c2.7.3 4.5 2.1 4.5 4.8"/></svg>',
  descargar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
  lista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>',
  dona: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v5.3M18.5 17.5l-4-3.2"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  candado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  luna: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  salir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  inicio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  tarjetas: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  presupuesto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  adelante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  'ojo-tachado': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.8 3.6"/><path d="M6.3 6.3C3.8 8.3 2.5 12 2.5 12s3.5 7 9.5 7a9.8 9.8 0 0 0 4.2-.9"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  sube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  baja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 7 7 17M15 17H7V9"/></svg>',
  billetera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><path d="M16 14.5h.01"/></svg>',
};

// Ícono y color por concepto (Configuración del Sheets). Lo que no esté aquí usa 'otro'.
const CATEGORIAS = {
  'supermercado': ['#0E7C66', '<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.4"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'],
  'delivery': ['#E8661C', '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h5l3-6h3l1 6M14 11l-2-4H9"/>'],
  'restaurantes y salidas': ['#D9473A', '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2.5 1-4 3.5-4 7h4"/>'],
  'desayuno': ['#A0642C', '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3c-.8 1 .8 2 0 3M12 3c-.8 1 .8 2 0 3"/>'],
  'chucherias': ['#D97706', '<rect x="8" y="8" width="8" height="8" rx="3"/><path d="M8 12 3 8v8zM16 12l5-4v8z"/>'],
  'matanza': ['#B8860B', '<path d="M6 8h10v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M16 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M6 8c0-2.5 2-3.5 4-2.5C11 3.5 15 4 16 8"/>'],
  'pasajes y transporte': ['#2F6FB3', '<path d="M5 16V9.5L7 5h10l2 4.5V16H5z"/><path d="M5 12h14M7.5 19v-3M16.5 19v-3"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>'],
  'cuidado personal': ['#0F9AA8', '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9 15 19 4M15 15 5 4"/>'],
  'salud y farmacia': ['#D2453B', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>'],
  'mascotas': ['#8B5E34', '<circle cx="12" cy="15.5" r="3.5"/><circle cx="6" cy="10" r="1.6"/><circle cx="9.5" cy="6.5" r="1.6"/><circle cx="14.5" cy="6.5" r="1.6"/><circle cx="18" cy="10" r="1.6"/>'],
  'limpieza': ['#1A9BB8', '<path d="M8 10h8l-1 11H9z"/><path d="M10 10V6h4v4M14 6l3-2M17 7h2"/>'],
  'internet y telefonia': ['#2F6FB3', '<path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="19" r=".8"/>'],
  'suscripciones': ['#4A6FA5', '<rect x="3" y="5" width="18" height="13" rx="3"/><path d="m10 9 5 2.5-5 2.5z"/>'],
  'entretenimiento': ['#C2410C', '<path d="M4 8V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v0a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V8z"/><path d="M14 5v14"/>'],
  'ropa y calzado': ['#0E7C66', '<path d="M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z"/>'],
  'seguro': ['#4A6FA5', '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>'],
  'prestamo': ['#6B7A3A', '<circle cx="15" cy="8" r="4"/><path d="M3 15h4l4 2h5a1.5 1.5 0 0 0 0-3h-3"/><path d="M7 15v5h0l6 1 7-4"/>'],
  'emergencia': ['#C93D33', '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>'],
  'otro': ['#5C6B66', '<path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8z"/><circle cx="8.5" cy="8.5" r="1.2"/>'],
};

function catIco(concepto) {
  const [color, path] = CATEGORIAS[normalizar(concepto)] || CATEGORIAS.otro;
  const s = document.createElement('span');
  s.className = 'cat-ico';
  s.style.setProperty('--cc', color);
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`; // texto fijo
  return s;
}

// Nombre de tarjeta y dueño para la vista tipo "tarjeta de crédito".
const NOMBRE_TC = { SIP: 'SIP · Oh!', IBK_P: 'Interbank', IBK_B: 'Interbank', BCP: 'BCP', RIPLEY: 'Ripley', HORMIGA: 'Gastos hormiga' };
const DUENIO_TC = { IBK_P: 'Pedro', IBK_B: 'Britney' };
// Color del punto en "Medio de pago" (mismo de cada tarjeta).
const COLOR_MEDIO = { TC_SIP: 'SIP', TC_BCP: 'BCP', TC_RIPLEY: 'RIPLEY', YAPE: 'HORMIGA', PLIN: 'HORMIGA', EFECTIVO: 'HORMIGA' };

// Convierte "IZI*ANGELA CAFE QPS" en "Angela Cafe" y "291 PVEA LA CURVA" en "Plaza Vea La Curva".
function limpiarComercio(texto) {
  let s = String(texto || '').trim();
  if (!s) return s;
  const original = s;
  s = s.replace(/^[A-Z]{2,4}\d*\s*\*\s*/i, '')   // IZI*, PYU*, DLC*
    .replace(/^SB\d+\s*-\s*/i, '')
    .replace(/^\d{2,5}\s+/, '')                  // número de tienda al inicio
    .replace(/QPS$/i, '').replace(/\s+(QPS|PE)$/i, '')
    .replace(/^E\s+(?=WONG)/i, '')
    .trim();
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|[\s\-/(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
  }
  s = s.replace(/\bPvea\b/i, 'Plaza Vea');
  return s || original;
}

// Escribe un monto. Con data-rico, el símbolo y los céntimos van más chicos (se lee primero la cifra).
function pintarMonto(el, valor) {
  const texto = soles(valor);
  const m = el.hasAttribute('data-rico') ? /^(-?)S\/ ([\d,]+)(\.\d+)$/.exec(texto) : null;
  if (!m) { el.textContent = texto; return; }
  if (!el._partes) {
    const entero = h('span', { class: 'm-e' });
    const centimos = h('span', { class: 'm-c' });
    el.replaceChildren(h('span', { class: 'm-s' }, 'S/'), entero, centimos);
    el._partes = [entero, centimos];
  }
  el._partes[0].textContent = m[1] + m[2];
  el._partes[1].textContent = m[3];
}

// Anima un número de 0 al valor final (respeta "reducir movimiento").
function contar(el, valor, desde = 0, dur = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(valor) || desde === valor) { pintarMonto(el, valor); return; }
  const t0 = performance.now();
  pintarMonto(el, desde);
  const paso = (t) => {
    if (!el.isConnected) return;
    const p = Math.min((t - t0) / dur, 1);
    pintarMonto(el, desde + (valor - desde) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Menú de la cuenta: quién eres, apariencia y cerrar sesión. Va en la barra lateral y, en celular, arriba a la derecha.
function botonCuenta(variante) {
  const nombre = (usuarioActual()?.nombre || '').split(' ')[0];
  const correo = api.emailGuardado();
  const panel = h('div', { class: 'cuenta-panel', hidden: true, role: 'dialog', 'aria-label': 'Tu cuenta' },
    h('div', { class: 'cuenta-quien' }, avatar(nombre || correo, 'grande'),
      h('div', {}, h('strong', {}, nombre || 'Tu cuenta'), h('span', { class: 'suave correo', title: correo }, ...String(correo || '').split('@').flatMap((p, i) => (i ? [h('wbr'), '@' + p] : [p]))))),
    panelApariencia(),
    h('div', { class: 'cuenta-enlaces' },
      SOLO_GASTO
        ? h('a', { class: 'cuenta-enlace', href: './#inicio' }, icono('presupuesto'), 'Ver cómo va el mes')
        : h('a', { class: 'cuenta-enlace', href: 'gasto.html' }, icono('mas'), 'App solo para gastos'),
      h('button', { type: 'button', class: 'cuenta-enlace', 'aria-pressed': String(document.body.classList.contains('montos-ocultos')), onclick: (ev) => {
        const oculto = document.body.classList.toggle('montos-ocultos');
        try { localStorage.setItem('ff:ocultar', oculto ? '1' : ''); } catch { /* nada */ }
        ev.currentTarget.setAttribute('aria-pressed', String(oculto));
        ev.currentTarget.lastChild.textContent = oculto ? 'Mostrar montos' : 'Ocultar montos';
        ev.currentTarget.firstChild.replaceWith(icono(oculto ? 'ojo-tachado' : 'ojo'));
      } }, icono(document.body.classList.contains('montos-ocultos') ? 'ojo-tachado' : 'ojo'), document.body.classList.contains('montos-ocultos') ? 'Mostrar montos' : 'Ocultar montos'),
      h('button', { type: 'button', class: 'cuenta-enlace instalar', onclick: instalarApp }, icono('descargar'), 'Instalar la app'),
      esIphoneSinInstalar() ? h('p', { class: 'cuenta-pista' }, 'En iPhone: Compartir, luego "Agregar a inicio".') : null),
    zonaSesion());
  const caja = h('div', { class: `cuenta-menu ${variante}` });
  const disparador = h('button', { type: 'button', class: 'cuenta-boton', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    'aria-label': 'Tu cuenta y apariencia', onclick: () => {
      const abrir = panel.hidden || !caja.classList.contains('abierto');
      cerrarMenusCuenta();
      if (!abrir) return;
      panel.classList.remove('sale-suave');
      panel.hidden = false;
      caja.classList.add('abierto');
      disparador.setAttribute('aria-expanded', 'true');
    } },
    avatar(nombre || correo),
    variante === 'nav' ? h('span', { class: 'cuenta-boton-texto' }, h('strong', {}, nombre || 'Tu cuenta'), h('span', {}, correo)) : null,
    variante === 'nav' ? icono('ajustes') : null);
  caja.append(disparador, panel);
  return caja;
}

// Todo lo que entra con animación también sale con una: se desvanece y baja un poco antes de quitarse.
function salirSuave(el, alTerminar) {
  if (!el || el.hidden || !el.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) { alTerminar(); return; }
  el.classList.add('sale-suave');
  setTimeout(() => { el.classList.remove('sale-suave'); alTerminar(); }, 160);
}

function cerrarMenusCuenta() {
  document.querySelectorAll('.cuenta-menu.abierto').forEach((m) => {
    m.classList.remove('abierto');
    const panel = m.querySelector('.cuenta-panel');
    salirSuave(panel, () => { if (!m.classList.contains('abierto')) panel.hidden = true; });
    m.querySelector('.cuenta-boton').setAttribute('aria-expanded', 'false');
  });
}

// Tope "redondo" para el eje de un gráfico (1, 2, 2.5, 5 o 10 por una potencia de diez).
function topeBonito(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) || v;
}

// Barras de consumo por día (una sola serie). Al pasar el cursor o tocar un día se ve su monto.
function graficoDias(consumos, dias = 30) {
  const hoy = deISO(hoyISO());
  const suma = new Map();
  const cuantos = new Map();
  for (const c of consumos) {
    if (!deISO(c.fecha)) continue;
    suma.set(c.fecha, (suma.get(c.fecha) || 0) + (Number(c.monto) || 0));
    cuantos.set(c.fecha, (cuantos.get(c.fecha) || 0) + 1);
  }
  const serie = [];
  for (let k = dias - 1; k >= 0; k--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - k);
    const clave = iso(d);
    serie.push({ d, valor: suma.get(clave) || 0, n: cuantos.get(clave) || 0, hoy: k === 0 });
  }
  const total = serie.reduce((s, x) => s + x.valor, 0);
  const tope = topeBonito(Math.max(...serie.map((x) => x.valor), 1));
  const prom = total / dias;
  const fecha = (x) => `${x.d.getDate()} ${ABREV[x.d.getMonth()]}`;
  const tip = h('div', { class: 'gd-tip', hidden: true, role: 'status' });
  const barras = h('div', { class: 'gd-barras' });
  const quitarActiva = () => barras.querySelectorAll('.activa').forEach((e) => e.classList.remove('activa'));
  const mostrarTip = (col, x) => {
    tip.replaceChildren(h('span', {}, x.hoy ? `${fecha(x)} · hoy` : fecha(x)), h('strong', {}, soles(x.valor)),
      h('span', {}, x.n === 0 ? 'Sin consumos' : `${x.n} consumo${x.n === 1 ? '' : 's'}`));
    tip.hidden = false;
    tip.classList.remove('fuera');
    tip.style.left = `${Math.max(62, Math.min(barras.offsetWidth - 62, col.offsetLeft + col.offsetWidth / 2))}px`;
    quitarActiva();
    col.classList.add('activa');
  };
  serie.forEach((x, i) => {
    const col = h('button', { type: 'button', class: 'gd-col' + (x.hoy ? ' hoy' : '') + (x.valor ? '' : ' cero'), style: `--i: ${i}`,
      'aria-label': `${fecha(x)}: ${soles(x.valor)}` },
      h('i', { style: `height: ${x.valor ? Math.max(3, (x.valor / tope) * 100).toFixed(1) : 0}%` }));
    col.addEventListener('pointerenter', () => mostrarTip(col, x));
    col.addEventListener('focus', () => mostrarTip(col, x));
    col.addEventListener('click', () => mostrarTip(col, x));
    barras.append(col);
  });
  barras.addEventListener('pointerleave', () => { tip.classList.add('fuera'); quitarActiva(); });
  const eje = h('div', { class: 'gd-eje', 'aria-hidden': 'true' },
    serie.map((x, i) => h('span', {}, (dias - 1 - i) % 7 === 0 ? (x.hoy ? 'Hoy' : fecha(x)) : '')));
  const nodo = h('div', { class: 'gd' },
    h('div', { class: 'gd-plano' },
      h('div', { class: 'gd-rejilla', 'aria-hidden': 'true' },
        [1, 0.5, 0].map((f) => h('span', { style: `bottom: ${f * 100}%` }, h('b', {}, solesCorto(tope * f))))),
      prom > 0 ? h('div', { class: 'gd-prom', style: `bottom: ${Math.min(100, (prom / tope) * 100).toFixed(1)}%`, 'aria-hidden': 'true' },
        h('b', {}, `Promedio ${solesCorto(prom)}`)) : null,
      barras, tip),
    eje,
    // El promedio se escribe debajo del gráfico, donde no tapa ninguna barra.
    prom > 0 ? h('p', { class: 'gd-nota' }, h('i', { 'aria-hidden': 'true' }), `Promedio ${solesCorto(prom)} por día`) : null);
  return { total, prom, nodo };
}

// Tras pintar una pantalla: barras que crecen y montos que cuentan.
// "previo" es la foto de lo que mostraba la misma pantalla (ver fotoDeCifras): con ella cada cifra, barra y anillo
// sigue desde donde estaba en vez de volver a empezar de cero.
function claveCifra(el, cuenta) {
  const base = el.dataset.clave || `${el.tagName}.${el.className}`;
  const n = cuenta.get(base) || 0;
  cuenta.set(base, n + 1);
  return `${base}#${n}`;
}
function fotoDeCifras(raiz) {
  const foto = new Map();
  for (const [sel, leer] of [['[data-contar]', (el) => Number(el.dataset.contar)], ['[data-w]', (el) => el.dataset.w], ['[data-offset]', (el) => el.dataset.offset]]) {
    const cuenta = new Map();
    raiz.querySelectorAll(sel).forEach((el) => foto.set(sel + claveCifra(el, cuenta), leer(el)));
  }
  return foto;
}
function animarVista(raiz, previo = null) {
  const cuenta = [new Map(), new Map(), new Map()];
  const antes = (sel, el, i) => (previo ? previo.get(sel + claveCifra(el, cuenta[i])) : undefined);
  raiz.querySelectorAll('[data-contar]').forEach((el) => {
    const valor = Number(el.dataset.contar);
    const desde = antes('[data-contar]', el, 0);
    if (!previo) { contar(el, valor); return; }
    if (desde === undefined || desde === valor) { pintarMonto(el, valor); return; }
    contar(el, valor, desde, 520);
    el.classList.add('cambio');
    setTimeout(() => el.classList.remove('cambio'), 1300);
  });
  const barras = [...raiz.querySelectorAll('[data-w]')];
  const arcos = [...raiz.querySelectorAll('[data-offset]')];
  if (previo) {
    // Arrancan en la medida que ya tenían; dos cuadros después van a la nueva.
    barras.forEach((el) => { const v = antes('[data-w]', el, 1); if (v !== undefined) el.style.width = v; });
    arcos.forEach((el) => { const v = antes('[data-offset]', el, 2); if (v !== undefined) el.style.strokeDashoffset = v; });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    barras.forEach((el) => { el.style.width = el.dataset.w; });
    arcos.forEach((el) => { el.style.strokeDashoffset = el.dataset.offset; });
  }));
  darVida(raiz, !!previo);
}

// ---------- Apariencia (modo claro/oscuro y color de la app) ----------

const COLORES = [['marino', 'Marino'], ['esmeralda', 'Esmeralda'], ['turquesa', 'Turquesa'], ['coral', 'Coral']];

function leerPref(clave, porDefecto) {
  try { return localStorage.getItem(clave) || porDefecto; } catch { return porDefecto; }
}

function aplicarApariencia() {
  const raiz = document.documentElement;
  const modo = leerPref('ff:modo', matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro') === 'oscuro' ? 'oscuro' : 'claro';
  const color = COLORES.some(([id]) => id === leerPref('ff:color', 'marino')) ? leerPref('ff:color', 'marino') : 'marino';
  raiz.dataset.modo = modo;
  raiz.dataset.color = color;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(raiz).getPropertyValue('--fondo').trim() || '#F2F4F8');
  document.querySelectorAll('[data-op-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.opModo === modo)));
  document.querySelectorAll('[data-op-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.opColor === color)));
}

function elegirApariencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: dura hasta recargar */ }
  const raiz = document.documentElement;
  raiz.classList.add('cambiando');
  clearTimeout(elegirApariencia.reloj);
  elegirApariencia.reloj = setTimeout(() => raiz.classList.remove('cambiando'), 520);
  if (clave === 'ff:modo') raiz.dataset.modo = valor; else raiz.dataset.color = valor;
  aplicarApariencia();
}

// Controles de modo y color (barra lateral en computadora, "Tu cuenta" en celular).
function panelApariencia() {
  const modo = document.documentElement.dataset.modo;
  const color = document.documentElement.dataset.color;
  return h('div', { class: 'apariencia' },
    h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Modo' },
      [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna']].map(([id, texto, ico]) => h('button', { type: 'button', title: `Modo ${texto.toLowerCase()}`,
        'aria-label': `Modo ${texto.toLowerCase()}`, 'data-op-modo': id, 'aria-pressed': String(modo === id), onclick: () => elegirApariencia('ff:modo', id) }, icono(ico)))),
    h('div', { class: 'colores', role: 'group', 'aria-label': 'Color de la app' },
      COLORES.map(([id, nombre]) => h('button', { type: 'button', class: `color-op op-${id}`, title: nombre, 'aria-label': `Color ${nombre}`,
        'data-op-color': id, 'aria-pressed': String(color === id), onclick: () => elegirApariencia('ff:color', id) }))));
}

// ---------- Piezas visuales ----------

function svg(tag, attrs, ...hijos) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of hijos.flat()) if (c != null) el.append(c);
  return el;
}

function solesCorto(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + 'S/ ' + Math.abs(v).toLocaleString('en-US');
}

function chipTC(id, extra = '') {
  return h('span', { class: `chip-tc tc-${id} ${extra}`.trim(), 'aria-hidden': 'true' });
}

function duenioTC(t) {
  return DUENIO_TC[t.id] || (t.responsable ? String(t.responsable).split(' ')[0] : '');
}

// Nombre de una línea del presupuesto sin los códigos internos de la hoja: "Alimentación (BCP-DEB-PE)" queda "Alimentación".
function nombreLinea(texto) {
  return String(texto || '').replace(/\s*\((?:[A-Z0-9]{2,}(?:[-/][A-Z0-9]+)*|S\/\s*[\d.,]+)\)\s*$/, '').trim() || String(texto || '');
}
// Porcentaje para leyendas: nunca dice "0%" si el monto existe.
function pctTexto(parte, total) {
  const p = Math.round(((Number(parte) || 0) / (Number(total) || 1)) * 100);
  return p === 0 && parte > 0 ? '<1%' : `${p}%`;
}
function nombreCortoTC(t) {
  const d = DUENIO_TC[t.id];
  return `${NOMBRE_TC[t.id] || t.nombre}${d ? ' · ' + d : ''}`;
}

// Círculo con la inicial de la persona.
// Foto de Google de quien inició sesión, si el nombre (o el correo) es el suyo. De la otra persona no hay foto:
// Google solo entrega la de quien entra.
function fotoDe(nombre) {
  const foto = api.fotoGuardada();
  if (!foto) return '';
  const n = normalizar(String(nombre || '').trim().split(' ')[0]);
  const yo = normalizar((usuarioActual()?.nombre || '').trim().split(' ')[0]);
  return n && (n === yo || n === normalizar(api.emailGuardado())) ? foto : '';
}
function ponerFoto(el, foto) {
  if (!foto || el.querySelector('img')) return;
  const img = h('img', { src: foto, alt: '', referrerpolicy: 'no-referrer', decoding: 'async', draggable: 'false' });
  img.addEventListener('load', () => el.classList.add('con-foto'));
  img.addEventListener('error', () => img.remove()); // si no carga, queda la inicial
  el.append(img);
}
function avatar(nombre, extra = '') {
  const n = String(nombre || '').trim();
  const el = h('span', { class: `avatar av-${normalizar(n).charAt(0) || 'x'} ${extra}`.trim(), title: n || null, 'aria-hidden': 'true' },
    (n.charAt(0) || '?').toUpperCase());
  ponerFoto(el, fotoDe(n));
  return el;
}

// Estado del próximo vencimiento: texto + clase de color (nunca solo color).
function estadoVence(vence, pendiente) {
  if (!(pendiente > 0)) return { clase: 'ok', texto: 'Al día' };
  if (!vence) return { clase: '', texto: 'Sin fecha' };
  const dias = diasEntre(hoyISO(), vence);
  if (dias < 0) return { clase: 'mal', texto: `Venció el ${fechaCorta(vence)}` };
  if (dias === 0) return { clase: 'aviso', texto: 'Vence hoy' };
  if (dias === 1) return { clase: 'aviso', texto: 'Vence mañana' };
  if (dias <= 7) return { clase: 'aviso', texto: `Vence en ${dias} días` };
  return { clase: '', texto: `Faltan ${dias} días` };
}

function estadoPill(vence, pendiente) {
  const e = estadoVence(vence, pendiente);
  return h('span', { class: `pill ${e.clase}`.trim() }, e.texto);
}

// Tarjeta dibujada como plástico: marca, monto por pagar, titular y vencimiento.
function tarjetaVisual(t, comoEnlace = true) {
  const esH = t.id === 'HORMIGA';
  const e = esH ? null : estadoVence(t.proximoVence, t.pendiente);
  // Como una tarjeta de verdad: emisor y símbolo de pago sin contacto arriba, chip, monto en grande y titular abajo.
  return h(comoEnlace ? 'a' : 'div', { class: `plastico tc-${t.id}`, href: comoEnlace ? `#tarjeta-${t.id}` : null },
    h('i', { class: 'plastico-brillo', 'aria-hidden': 'true' }),
    h('span', { class: 'plastico-top' },
      h('span', { class: 'plastico-marca' }, NOMBRE_TC[t.id] || t.nombre),
      icono(esH ? 'billetera' : 'sin-contacto')),
    esH ? null : h('span', { class: 'plastico-medio', 'aria-hidden': 'true' },
      h('span', { class: 'plastico-chip' }, h('i'), h('i')),
      h('span', { class: 'plastico-puntos' }, '••••  ••••  ••••')),
    h('span', { class: 'plastico-monto' },
      h('span', {}, esH ? 'Gastado este mes' : 'Por pagar'),
      h('strong', { 'data-rico': '', 'data-contar': String(t.pendiente || 0) }, soles(0))),
    h('span', { class: 'plastico-pie' },
      h('span', { class: 'plastico-titular' }, esH ? 'Yape · Plin · Efectivo' : duenioTC(t)),
      e ? h('span', { class: `plastico-estado ${e.clase}`.trim() }, e.clase === '' && t.proximoVence ? `Vence el ${fechaCorta(t.proximoVence)}` : e.texto) : null));
}
function anillo(pct, etiqueta = 'del plan') {
  const r = 52;
  const c = 2 * Math.PI * r;
  const caja = h('div', { class: 'anillo', role: 'img', title: `${pct}% del ingreso ya ${etiqueta}`, 'aria-label': `${pct}% del ingreso ya ${etiqueta}` });
  caja.append(
    svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' },
      svg('defs', {}, svg('linearGradient', { id: 'anillo-degradado', x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: '0%', class: 'anillo-g1' }), svg('stop', { offset: '100%', class: 'anillo-g2' }))),
      svg('circle', { class: 'anillo-pista', cx: 60, cy: 60, r }),
      svg('circle', { class: 'anillo-valor', cx: 60, cy: 60, r, 'stroke-dasharray': c.toFixed(1), 'stroke-dashoffset': c.toFixed(1),
        'data-offset': (c * (1 - Math.min(pct, 100) / 100)).toFixed(1) })),
    h('div', { class: 'anillo-texto' }, h('strong', {}, `${pct}%`), h('span', {}, etiqueta)));
  return caja;
}

// Gráfico de dona con leyenda. Al pasar el cursor o tocar una parte, el centro muestra su monto.
// Panel con pestañas: un solo recuadro que alterna entre varias vistas.
function panelPestanas(clase, pestanas) {
  const cuerpo = h('div', { class: 'pest-cuerpo' });
  const lado = h('span', { class: 'suave pest-lado' });
  const botones = pestanas.map((p, i) => h('button', { type: 'button', class: 'pest', role: 'tab',
    'aria-selected': String(i === 0), onclick: () => elegir(i) }, p.etiqueta));
  function elegir(i) {
    botones.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    lado.replaceChildren(pestanas[i].lado || '');
    lado.title = pestanas[i].pista || '';
    cuerpo.replaceChildren(pestanas[i].nodo);
    if (!cuerpo.isConnected) return;
    cuerpo.classList.remove('entra');
    void cuerpo.offsetWidth;
    cuerpo.classList.add('entra');
    animarVista(cuerpo);
  }
  elegir(0);
  return h('section', { class: `panel panel-pestanas ${clase}`.trim() },
    h('div', { class: 'panel-cab' }, h('div', { class: 'pestanas', role: 'tablist' }, botones), lado),
    cuerpo);
}

function dona(partes, etiquetaCentro) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  const r = 54;
  const c = 2 * Math.PI * r;
  const hueco = partes.length > 1 ? 3 : 0;
  let acum = 0;
  let fijo = null; // parte elegida con un toque
  const centroEtq = h('span', {}, etiquetaCentro);
  const centroVal = h('strong', {}, solesCorto(total));
  const caja = h('div', { class: 'dona' });
  const enfocar = (i) => {
    const k = i == null ? fijo : i;
    caja.classList.toggle('con-foco', k != null);
    arcos.forEach((a, n) => a.classList.toggle('activa', n === k));
    filas.forEach((f, n) => f.classList.toggle('activa', n === k));
    centroEtq.textContent = k == null ? etiquetaCentro : partes[k].etiqueta;
    centroVal.textContent = solesCorto(k == null ? total : partes[k].valor);
  };
  const escuchar = (el, i) => {
    el.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') enfocar(i); });
    el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') enfocar(null); });
    el.addEventListener('click', () => { fijo = fijo === i ? null : i; enfocar(null); });
  };
  const arcos = partes.map((p, i) => {
    const largo = Math.max((p.valor / total) * c - hueco, 1);
    const arco = svg('circle', { class: `dona-arco d${i}`, cx: 70, cy: 70, r, style: `--i: ${i}`,
      'stroke-dasharray': `${largo.toFixed(2)} ${(c - largo).toFixed(2)}`, 'stroke-dashoffset': (-(acum / total) * c).toFixed(2) });
    const titulo = svg('title', {});
    titulo.textContent = `${p.etiqueta}: ${soles(p.valor)}`;
    arco.append(titulo);
    acum += p.valor;
    escuchar(arco, i);
    return arco;
  });
  const filas = partes.map((p, i) => {
    const fila = h('li', { title: `${p.etiqueta}: ${soles(p.valor)}` },
      h('i', { class: `punto d${i}`, 'aria-hidden': 'true' }),
      h('span', { class: 'dona-nombre' }, p.etiqueta),
      h('span', { class: 'suave' }, `${Math.round((p.valor / total) * 100)}%`),
      h('strong', {}, soles(p.valor)));
    escuchar(fila, i);
    return fila;
  });
  const grafico = h('div', { class: 'dona-grafico', role: 'img',
    'aria-label': partes.map((p) => `${p.etiqueta}: ${soles(p.valor)}`).join(', ') });
  grafico.append(svg('svg', { viewBox: '0 0 140 140', 'aria-hidden': 'true' }, arcos),
    h('div', { class: 'dona-centro' }, centroEtq, centroVal));
  caja.append(grafico, h('ul', { class: 'dona-leyenda' }, filas));
  return caja;
}

// Movimiento que depende del cursor o del scroll: inclinación de tarjetas, luz del panel y aparición al bajar.
// Carrusel de verdad: las tarjetas giran de forma continua y sin fin, a velocidad pareja.
// Frena suave al poner el cursor encima, se puede arrastrar (con inercia) y las flechas lo llevan una tarjeta.
// No usa el desplazamiento del navegador: mueve la fila completa con transform, que es lo que lo hace fluido.
function activarCarrusel(carril) {
  const pista = carril.querySelector('.carrusel-pista');
  const n = Number(carril.dataset.n) || 0;
  if (!pista || !n || carril.dataset.listo) return;
  const tarjetas = [...pista.children];
  if (tarjetas.length !== n * 3) return;
  carril.dataset.listo = '1';
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VELOCIDAD = 36; // píxeles por segundo
  let juego = 0; // lo que mide un juego completo de tarjetas
  let paso = 0; // de una tarjeta a la siguiente
  const medir = () => {
    juego = tarjetas[n].offsetLeft - tarjetas[0].offsetLeft;
    paso = tarjetas[1].offsetLeft - tarjetas[0].offsetLeft;
  };
  medir();
  if (!juego) return;
  // Si la pantalla solo se actualizó, el carrusel sigue girando desde donde iba.
  const sigue = Number.isFinite(estado.giroCarrusel) && !quieto;
  let x = sigue ? estado.giroCarrusel % juego : 0; // avance dentro de un juego, de 0 a juego
  let vel = sigue ? VELOCIDAD : 0; // velocidad actual (arranca y frena de a pocos)
  let meta = quieto ? 0 : VELOCIDAD; // velocidad a la que quiere ir
  carril.posicion = () => x;
  let impulso = 0; // inercia después de arrastrar
  let destino = null; // posición pedida con las flechas
  let arrastre = null;
  let encima = false;
  let ult = performance.now();
  const envolver = () => {
    while (x >= juego) { x -= juego; if (destino !== null) destino -= juego; }
    while (x < 0) { x += juego; if (destino !== null) destino += juego; }
  };
  const pintar = () => { pista.style.transform = `translate3d(${(-(x + paso)).toFixed(2)}px, 0, 0)`; };
  const cuadro = (t) => {
    if (!carril.isConnected) return; // se cambió de pantalla: deja de girar
    const dt = Math.min(0.05, Math.max(0, (t - ult) / 1000));
    ult = t;
    if (!arrastre) {
      if (destino !== null) {
        const falta = destino - x;
        x += falta * Math.min(1, dt * 7);
        if (Math.abs(falta) < 0.4) { x = destino; destino = null; vel = 0; }
      } else {
        const quiere = encima || (!conPuntero && carril.matches(':focus-within')) ? 0 : meta;
        vel += (quiere - vel) * Math.min(1, dt * 4);
        x += (vel + impulso) * dt;
        impulso *= Math.pow(0.12, dt);
        if (Math.abs(impulso) < 0.5) impulso = 0;
      }
    }
    envolver();
    pintar();
    requestAnimationFrame(cuadro);
  };
  pintar();
  requestAnimationFrame(cuadro);
  window.addEventListener('resize', () => { if (carril.isConnected) medir(); });

  // Cursor encima: frena hasta detenerse; al salir, retoma.
  carril.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') encima = true; });
  carril.addEventListener('pointerleave', () => { encima = false; });

  // Arrastrar con el mouse o el dedo
  carril.addEventListener('dragstart', (ev) => ev.preventDefault());
  // conPuntero: el último gesto fue con mouse o dedo. Así el foco que deja un clic no cuenta como foco de teclado.
  let conPuntero = false;
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') conPuntero = false; });
  carril.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    conPuntero = true;
    arrastre = { x0: ev.clientX, inicio: x, movido: false, ultX: ev.clientX, ultT: performance.now(), v: 0, muestras: [] };
    destino = null; impulso = 0;
  });
  window.addEventListener('pointermove', (ev) => {
    if (!arrastre) return;
    if (!arrastre.movido) {
      if (Math.abs(ev.clientX - arrastre.x0) < 6) return;
      // Empieza a arrastrar desde donde está el dedo ahora: sin el salto de los primeros píxeles.
      arrastre.movido = true;
      arrastre.x0 = ev.clientX; arrastre.inicio = x; arrastre.ultX = ev.clientX; arrastre.ultT = performance.now();
      carril.classList.add('arrastrando');
      try { carril.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
      return;
    }
    const dx = ev.clientX - arrastre.x0;
    const ahora = performance.now();
    // Velocidad del gesto: se mide con lo recorrido en los últimos 90 ms, no con un solo evento.
    arrastre.muestras.push([ahora, ev.clientX]);
    while (arrastre.muestras.length > 2 && ahora - arrastre.muestras[0][0] > 90) arrastre.muestras.shift();
    arrastre.ultX = ev.clientX; arrastre.ultT = ahora;
    x = arrastre.inicio - dx;
    envolver();
    arrastre.inicio = x + dx; // si dio la vuelta, el origen acompaña
  });
  const soltar = () => {
    if (!arrastre) return;
    if (arrastre.movido) {
      const m = arrastre.muestras; const ahora = performance.now();
      let v = 0;
      // Si el dedo se quedó quieto antes de soltar, no hay lanzamiento.
      if (m.length >= 2 && ahora - m[m.length - 1][0] < 80) {
        const dtm = Math.max(16, m[m.length - 1][0] - m[0][0]);
        v = (-(m[m.length - 1][1] - m[0][1]) / dtm) * 1000;
      }
      impulso = Math.max(-2400, Math.min(2400, v));
      destino = null; // nada pendiente: manda el impulso del lanzamiento
      // Sigue girando a su paso normal en el mismo sentido en que venía, sin frenar a cero.
      vel = Math.abs(impulso) > 60 ? 0 : vel;
      // Lo que empezó como arrastre no cuenta como toque en la tarjeta.
      const sinClic = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      carril.addEventListener('click', sinClic, { capture: true, once: true });
      setTimeout(() => { carril.removeEventListener('click', sinClic, true); carril.classList.remove('arrastrando'); }, 60);
    }
    arrastre = null;
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);

  // Rueda o panel táctil en horizontal
  carril.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
    ev.preventDefault();
    destino = null; x += ev.deltaX; vel = 0;
  }, { passive: false });

  // Flechas: una tarjeta por toque, con movimiento suave
  carril.moverTarjeta = (dir) => {
    const base = destino !== null ? destino : x;
    destino = base + dir * paso; // exactamente una tarjeta desde donde está
    impulso = 0;
  };
  // Con teclado: la tarjeta enfocada se trae a la vista
  carril.addEventListener('focusin', (ev) => {
    const el = ev.target.closest?.('.plastico');
    if (!el || !pista.contains(el) || conPuntero || arrastre) return;
    const pos = (el.offsetLeft - tarjetas[0].offsetLeft) % juego;
    let d = pos - paso;
    while (d - x > juego / 2) d -= juego;
    while (x - d > juego / 2) d += juego;
    destino = d;
  });
}

function darVida(raiz, yaVisto = false) {
  raiz.querySelectorAll('.carrusel.infinito').forEach(activarCarrusel);
  // Pantalla que solo se actualizó: lo que ya se veía queda a la vista, sin volver a entrar.
  if (yaVisto) raiz.querySelectorAll('.revelar').forEach((el) => el.classList.add('visible', 'quieto'));
  const calmado = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!calmado && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    raiz.querySelectorAll('a.plastico').forEach((el) => {
      el.addEventListener('pointermove', (ev) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--ry', `${(((ev.clientX - r.left) / r.width - 0.5) * 12).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(((ev.clientY - r.top) / r.height - 0.5) * -10).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
    });
    const hero = raiz.querySelector('.hero');
    hero?.addEventListener('pointermove', (ev) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', `${Math.round(ev.clientX - r.left)}px`);
      hero.style.setProperty('--my', `${Math.round(ev.clientY - r.top)}px`);
    });
  }
  const pendientes = [...raiz.querySelectorAll('.revelar:not(.visible)')];
  if (!pendientes.length) return;
  const mostrarTodo = () => pendientes.forEach((el) => el.classList.add('visible'));
  if (calmado || !('IntersectionObserver' in window)) { mostrarTodo(); return; }
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px' });
  pendientes.forEach((el) => io.observe(el));
}

// Barra partida en proporciones (cada parte con su clase de color y su texto al pasar el cursor).
function barraPartes(partes) {
  const visibles = partes.filter((p) => p.valor > 0);
  const total = visibles.reduce((s, p) => s + p.valor, 0) || 1;
  return h('div', { class: 'partes', role: 'img', 'aria-label': visibles.map((p) => `${p.etiqueta}: ${soles(p.valor)}`).join(', ') },
    visibles.map((p) => h('i', { class: p.clase, style: `flex: ${((p.valor / total) * 100).toFixed(2)} 1 0`, title: `${p.etiqueta}: ${soles(p.valor)}` })));
}

// Fila de un consumo en las listas de Inicio.
function filaMov(c, derecha, sinFecha = false) {
  return h('li', { class: 'mov', title: c.descripcion },
    catIco(c.concepto),
    h('span', { class: 'mov-texto' }, h('span', {}, limpiarComercio(c.descripcion)),
      h('span', { class: 'suave' }, [sinFecha ? '' : fechaCorta(c.fecha), c.concepto].filter(Boolean).join(' · '))),
    h('span', { class: 'mov-der' }, h('strong', {}, soles(c.monto)), derecha ? h('span', { class: 'suave' }, derecha) : null));
}

// Caja con título y, si hace falta, un enlace o dato a la derecha.
const ICONO_PANEL = { 'Consumos por día': 'presupuesto', '¿En qué se fue?': 'dona', 'Últimos consumos': 'lista',
  'Gastos hormiga': 'billetera', 'Calendario de pagos': 'calendario', Ingresos: 'sube', Gastos: 'baja', Ahorros: 'billetera', 'Tus tarjetas': 'tarjetas', 'Gastos fijos': 'check', 'Quién gastó': 'personas' };
function tituloSeccion(titulo) {
  return h('h2', {}, ICONO_PANEL[titulo] ? h('span', { class: 'titulo-ico' }, icono(ICONO_PANEL[titulo])) : null, titulo);
}
function panel(clase, titulo, lado, ...hijos) {
  return h('section', { class: `panel ${clase}`.trim() },
    h('div', { class: 'panel-cab' }, tituloSeccion(titulo), lado || null),
    hijos);
}

// Todos los consumos de las tarjetas que cumplan el filtro, con su tarjeta.
function consumosDe(tarjetas, filtro) {
  const salida = [];
  for (const t of tarjetas || []) {
    if (!filtro(t)) continue;
    for (const g of t.estados || []) for (const c of g.consumos || []) salida.push({ ...c, tarjeta: t });
  }
  return salida;
}

// Zona con correo y "Cerrar sesión" (pide confirmación en el mismo lugar).
function zonaSesion() {
  const zona = h('div', { class: 'zona-sesion' });
  zona.append(
    h('span', { class: 'suave correo' }, api.emailGuardado()),
    h('button', { type: 'button', class: 'boton enlace', onclick: () => {
      const enEspera = estado.cola.length;
      confirmarEnLinea(zona,
        enEspera ? `Hay ${enEspera} ${enEspera === 1 ? 'gasto' : 'gastos'} sin enviar; se enviarán cuando vuelvas a entrar con esta misma cuenta.` : '¿Cerrar sesión?',
        'Cerrar sesión', async () => {
          borrarCaches();
          api.cerrarSesion();
          estado.tsDatos = null;
          estado.cola = [];
          estado.filasEnEspera = new Set();
          mostrar(pantallaLogin('Sesión cerrada.'));
          construirNav();
          pintarAvisos();
        });
    } }, icono('salir'), 'Cerrar sesión'));
  return zona;
}

// ---------- Estado ----------

const estado = {
  navId: 0,
  pideLogin: false,
  tsDatos: null, // hora de los datos guardados que se están mostrando
  motivoDatos: null, // por qué se muestran datos guardados ('sin_conexion', 'error_interno', ...)
  irARevisar: false,
  cola: [],
  filasEnEspera: new Set(),
  mesPres: null,
  recienRegistrados: [], // gastos registrados en esta visita (para mostrarlos al instante en Nuevo gasto)
  plasticoClic: null, // última tarjeta tocada (para saber cuál viaja al detalle)
  mesInicio: null, // mes elegido en Inicio (null = el mes en curso)
  selTarjeta: null,
  seleccion: new Set(),
  mensajeTarjeta: null,
  form: null,
  oneTapIntentado: false,
  frescoDesde: 0, // lo guardado antes de esta hora no se muestra: se espera al Sheets
  cambioDesde: 0, // lo guardado antes de esta hora se muestra, pero se vuelve a pedir por detrás
  rutaVista: null, // página que se está viendo (para saber hacia dónde va la transición)
  sentido: null, // sentido pedido para la próxima transición
  registroSW: null, // registro del service worker, para buscar versión nueva
  enviando: false, // hay un envío de la cola en curso
};

const vista = document.getElementById('vista');
const avisos = document.getElementById('avisos');

// ---------- Utilidades ----------

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyISO = () => iso(new Date());
const mesActual = () => hoyISO().slice(0, 7);

function deISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const fmtNumero = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function soles(n) {
  const v = Number(n) || 0;
  const s = 'S/ ' + fmtNumero.format(Math.abs(v));
  return v < 0 ? '-' + s : s;
}

// Calendario propio con el diseño de la app. Envuelve un campo de fecha (que queda oculto) y muestra un botón
// con la fecha en palabras; al tocarlo se abre un mes con atajos "Hoy" y "Ayer". Respeta el tope (max) del campo.
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function textoFecha(s) {
  const d = deISO(s);
  if (!d) return 'Elegir fecha';
  const hoy = hoyISO(); const ayer = iso(new Date(Date.now() - 86400000));
  if (s === hoy) return `Hoy · ${d.getDate()} ${ABREV[d.getMonth()]}`;
  if (s === ayer) return `Ayer · ${d.getDate()} ${ABREV[d.getMonth()]}`;
  const dia = d.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '');
  return `${dia} ${d.getDate()} ${ABREV[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}
function selectorFecha(input) {
  input.type = 'text'; input.classList.add('fecha-oculta'); input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
  const boton = h('button', { type: 'button', class: 'fecha-boton', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, icono('calendario'), h('span', {}, textoFecha(input.value)));
  const pop = h('div', { class: 'fecha-pop', role: 'dialog', 'aria-label': 'Elegir fecha', hidden: true });
  const caja = h('div', { class: 'fecha-caja' }, input, boton, pop);
  let vista = null; // mes que se muestra (YYYY-MM)
  const tope = () => input.getAttribute('max') || '';
  const elegir = (s) => {
    if (tope() && s > tope()) return;
    input.value = s;
    boton.lastChild.textContent = textoFecha(s);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
  };
  const pintar = () => {
    const [a, m] = vista.split('-').map(Number);
    const primero = new Date(a, m - 1, 1);
    const dias = new Date(a, m, 0).getDate();
    const desplaza = (primero.getDay() + 6) % 7; // lunes primero
    const hoy = hoyISO(); const ayer = iso(new Date(Date.now() - 86400000));
    const celdas = [];
    for (let i = 0; i < desplaza; i++) celdas.push(h('i', { 'aria-hidden': 'true' }));
    for (let d = 1; d <= dias; d++) {
      const clave = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const fuera = tope() && clave > tope();
      celdas.push(h('button', { type: 'button', class: 'fecha-dia' + (clave === input.value ? ' elegido' : '') + (clave === hoy ? ' hoy' : ''), disabled: fuera || null,
        'aria-label': fechaLarga(clave), 'aria-pressed': String(clave === input.value), onclick: () => elegir(clave) }, String(d)));
    }
    const sigDeshabilitado = tope() && `${a}-${String(m).padStart(2, '0')}-01` >= tope().slice(0, 7) + '-01';
    pop.replaceChildren(
      h('div', { class: 'fecha-atajos' },
        h('button', { type: 'button', class: 'chip-filtro' + (input.value === hoy ? ' activo' : ''), 'aria-pressed': String(input.value === hoy), onclick: () => elegir(hoy) }, 'Hoy'),
        h('button', { type: 'button', class: 'chip-filtro' + (input.value === ayer ? ' activo' : ''), 'aria-pressed': String(input.value === ayer), onclick: () => elegir(ayer) }, 'Ayer')),
      h('div', { class: 'fecha-cab' },
        h('button', { type: 'button', class: 'boton icono-solo', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('atras')),
        h('strong', {}, `${MESES_LARGO[m - 1]} ${a}`),
        h('button', { type: 'button', class: 'boton icono-solo', 'aria-label': 'Mes siguiente', disabled: sigDeshabilitado || null, onclick: () => mover(1) }, icono('adelante'))),
      h('div', { class: 'fecha-semana', 'aria-hidden': 'true' }, DIAS_SEMANA.map((x) => h('span', {}, x))),
      h('div', { class: 'fecha-grilla' }, celdas));
  };
  const mover = (n) => { vista = sumarMes(vista, n); pop.classList.remove('gira'); void pop.offsetWidth; pop.classList.add('gira'); pintar(); };
  const alClicFuera = (ev) => { if (!caja.contains(ev.target)) cerrar(); };
  const alTecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); boton.focus(); } };
  const abrir = () => {
    vista = (input.value || hoyISO()).slice(0, 7);
    pintar();
    pop.hidden = false; pop.classList.remove('sale-suave');
    // Si abajo no hay sitio, el calendario se abre hacia arriba.
    const r = boton.getBoundingClientRect();
    pop.classList.toggle('arriba', innerWidth > 600 && r.bottom + 400 > innerHeight && r.top > 400);
    boton.setAttribute('aria-expanded', 'true');
    setTimeout(() => { document.addEventListener('pointerdown', alClicFuera); document.addEventListener('keydown', alTecla, true); }, 0);
    pop.querySelector('.fecha-dia.elegido')?.focus();
  };
  const cerrar = () => {
    if (pop.hidden) return;
    document.removeEventListener('pointerdown', alClicFuera); document.removeEventListener('keydown', alTecla, true);
    boton.setAttribute('aria-expanded', 'false');
    salirSuave(pop, () => { pop.hidden = true; });
  };
  boton.addEventListener('click', () => (pop.hidden ? abrir() : cerrar()));
  // Si el campo cambia por código (por ejemplo, al guardar se vuelve a hoy), el botón se actualiza.
  input.addEventListener('change', () => { boton.lastChild.textContent = textoFecha(input.value); });
  caja.refrescar = () => { boton.lastChild.textContent = textoFecha(input.value); };
  return caja;
}

function fechaLarga(s) {
  const d = deISO(s);
  return d ? `${d.getDate()} ${ABREV[d.getMonth()]} ${d.getFullYear()}` : '';
}
function fechaCorta(s) {
  const d = deISO(s);
  return d ? `${d.getDate()} ${ABREV[d.getMonth()]}` : '';
}
const diasEntre = (a, b) => Math.round((deISO(b) - deISO(a)) / 86400000);
const hora = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Correo de quien usa la app: el del token vigente o, si venció, el último que inició sesión.
function emailSesion() {
  return api.emailActual() || api.emailGuardado();
}

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

function sumarMes(clave, n) {
  const [y, m] = clave.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function nombreMesClave(clave) {
  const m = /^(\d{4})-(\d{2})$/.exec(clave || '');
  return m ? `${MESES[+m[2] - 1]} ${m[1]}` : '';
}

function normalizar(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Misma regla del contrato: si el día pasa el cierre, el ciclo pasa al mes siguiente.
function calcularCiclo(idCiclo, fISO, ciclos) {
  const c = (ciclos || CICLOS_LOCAL)[idCiclo];
  const d = deISO(fISO);
  if (!c || c.cierre == null || !d) return { pago: '', vence: '' };
  let m = d.getMonth();
  if (d.getDate() > c.cierre) m += 1;
  const pago = new Date(d.getFullYear(), m + 1, 0); // último día del mes m
  const vence = new Date(d.getFullYear(), m + 1, c.vence); // día 'vence' del mes m+1
  return { pago: iso(pago), vence: iso(vence) };
}

function leerMonto(texto) {
  let s = String(texto ?? '').trim().replace(/^s\/\.?/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
  else if (s.includes(',')) {
    const p = s.split(',');
    s = p.length === 2 && p[1].length <= 2 ? `${p[0]}.${p[1]}` : s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 ? n : null;
}

// Crea nodos sin usar innerHTML con datos (evita inyección).
function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') { if (k in el) el[k] = v; else el.setAttribute(k, ''); }
    else el.setAttribute(k, v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function icono(nombre) {
  const s = document.createElement('span');
  s.className = 'icono';
  s.innerHTML = ICONOS[nombre]; // texto fijo, no viene de datos
  return s;
}

// ---------- Datos guardados en el equipo ----------

// Cada dato guardado lleva el correo de su dueño: otra cuenta en el mismo equipo no lo ve.
function guardarCache(clave, datos) {
  const email = emailSesion();
  if (!email) return;
  try { localStorage.setItem('ff:c:' + clave, JSON.stringify({ ts: Date.now(), email, datos })); } catch { /* lleno o bloqueado */ }
}
function leerCache(clave) {
  const email = emailSesion();
  if (!email) return null;
  try {
    const v = localStorage.getItem('ff:c:' + clave);
    const c = v ? JSON.parse(v) : null;
    return c && c.email === email ? c : null;
  } catch { return null; }
}
function borrarCaches() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('ff:c:')).forEach((k) => localStorage.removeItem(k));
  } catch { /* nada */ }
}

// Pide datos a la API; si no hay señal (o falla el servidor) devuelve lo último guardado.
// Con 'no_autorizado' no se muestran datos guardados: la cuenta pudo perder el acceso.
async function cargar(accion, datos, clave) {
  try {
    const d = await llamarApi(accion, datos);
    guardarCache(clave, d);
    estado.pideLogin = false;
    return { datos: d, ts: null };
  } catch (e) {
    if (e.codigo === 'no_autorizado') {
      estado.pideLogin = true;
      if (e.rechazada) borrarCaches(); // el servidor rechazó la cuenta incluso con un token nuevo
    }
    const c = leerCache(clave);
    if (c && ['sin_conexion', 'error_interno'].includes(e.codigo)) {
      return { datos: c.datos, ts: c.ts, error: e };
    }
    throw e;
  }
}

// Carga al instante: muestra lo último guardado en el equipo y pregunta al Sheets por detrás
// (responde en 2 a 5 segundos). Si llegó algo distinto, la pantalla se repinta sola.
// Solo espera al Sheets cuando no hay nada guardado o cuando se acaba de editar algo en esa pantalla.
const FRESCO_MS = 30000; // lo traído hace menos de 30 s no se vuelve a pedir
const refrescos = new Map(); // pedidos por detrás en curso, para no repetirlos
async function cargarRapido(accion, datos, clave) {
  const c = leerCache(clave);
  if (!c || c.ts < estado.frescoDesde) return cargar(accion, datos, clave);
  if (!navigator.onLine) return { datos: c.datos, ts: c.ts, error: { codigo: 'sin_conexion' } };
  if (c.ts < estado.cambioDesde || Date.now() - c.ts > FRESCO_MS) refrescarPorDetras(accion, datos, clave, c);
  return { datos: c.datos, ts: null };
}

function refrescarPorDetras(accion, datos, clave, c) {
  if (refrescos.has(clave)) return;
  const antes = JSON.stringify(c.datos);
  const navId = estado.navId;
  refrescos.set(clave, cargar(accion, datos, clave).then((r) => {
    if (navId !== estado.navId) return; // ya se cambió de pantalla
    if (r.ts) { marcarDatos(r); pintarAvisos(); return; } // no hubo respuesta: se avisa que son datos guardados
    if (JSON.stringify(r.datos) !== antes) pedirRepintado();
  }).catch((e) => {
    if (e?.codigo !== 'no_autorizado') return;
    if (e.rechazada) navegar(); else pintarAvisos();
  }).finally(() => refrescos.delete(clave)));
}

// Repinta la pantalla actual con los datos nuevos, sin animación de salida ni casa de carga.
function pedirRepintado() {
  clearTimeout(pedirRepintado.reloj);
  pedirRepintado.reloj = setTimeout(() => {
    if (refrescos.size) { pedirRepintado(); return; } // espera a que lleguen todos los pedidos de esta pantalla
    if (!hayEdicionAbierta()) navegar({ silencioso: true });
  }, 80);
}

function marcarDatos(r) {
  if (!r.ts) return;
  estado.tsDatos = estado.tsDatos ? Math.min(estado.tsDatos, r.ts) : r.ts;
  if (estado.motivoDatos !== 'sin_conexion') estado.motivoDatos = r.error?.codigo || null;
}

function usuarioActual() {
  return leerCache('config')?.datos?.usuario || leerCache('inicio')?.datos?.usuario || null;
}

// ---------- Cola ----------

// Solo se muestran (y se envían) los movimientos de quien tiene la sesión.
async function refrescarCola() {
  const yo = emailSesion();
  try { estado.cola = yo ? (await cola.listar()).filter((i) => i.email === yo) : []; } catch { estado.cola = []; }
  estado.filasEnEspera = new Set();
  for (const it of estado.cola) {
    if (it.accion === 'marcarPagado' && it.estado === 'pendiente') {
      for (const f of it.datos.filas) estado.filasEnEspera.add(`${it.datos.hoja}#${f}`);
    }
  }
  pintarAvisos();
}

async function procesarCola() {
  if (!navigator.onLine || !api.configurado()) { await refrescarCola(); return null; }
  let res = null;
  try {
    const yo = emailSesion();
    if (!yo) { await refrescarCola(); return null; } // sin usuario conocido no se envía nada
    // Mientras se envía, la barra de avance ya lo indica: el aviso de espera solo aparece si algo queda sin enviar.
    estado.enviando = true;
    pintarAvisos();
    res = await cola.procesar(llamarApi, yo);
    if (res.detenido === 'no_autorizado') estado.pideLogin = true;
  } catch { /* se reintenta luego */ }
  estado.enviando = false;
  await refrescarCola();
  return res;
}

// Procesa la cola y, si el elemento entró cuando ya había un envío en curso, repite una vez.
async function procesarHasta(id) {
  let res = await procesarCola();
  if (res && !res.detenido && !res.resultados?.[id]) res = await procesarCola();
  return res;
}

// ---------- Avisos superiores ----------

// Menú lateral (computadora): la tarjeta que vence primero, tomada de lo último guardado.
// Globo sobre "Tarjetas" en el menú: cuántas tarjetas con deuda vencen en los próximos 7 días (o ya vencieron).
function pintarGlobos(lista) {
  document.querySelectorAll('.barra-nav a[data-ruta="tarjetas"]').forEach((a) => {
    const n = api.emailGuardado() ? lista.filter((t) => t.id !== 'HORMIGA' && t.pendiente > 0 && t.proximoVence && diasEntre(hoyISO(), t.proximoVence) <= 7).length : 0;
    let g = a.querySelector('.nav-globo');
    if (!n) { g?.remove(); return; }
    if (!g) { g = h('span', { class: 'nav-globo' }); a.append(g); }
    if (g.textContent !== String(n)) g.textContent = String(n);
    g.title = n === 1 ? '1 tarjeta vence en 7 días o menos' : `${n} tarjetas vencen en 7 días o menos`;
  });
}

function pintarProximoPago() {
  const lista = leerCache('tarjetas')?.datos?.tarjetas || [];
  pintarGlobos(lista);
  const caja = document.querySelector('.nav-proximo');
  if (!caja) return;
  const prox = lista.filter((t) => t.id !== 'HORMIGA' && t.pendiente > 0 && t.proximoVence)
    .sort((a, b) => String(a.proximoVence).localeCompare(String(b.proximoVence)))[0];
  if (!prox || !api.emailGuardado()) { caja.hidden = true; caja.dataset.clave = ''; return; }
  const e = estadoVence(prox.proximoVence, prox.pendiente);
  const clave = [prox.id, prox.pendiente, e.texto].join('|');
  if (caja.dataset.clave === clave) return; // sin cambios: no se vuelve a animar
  caja.dataset.clave = clave;
  caja.hidden = false;
  caja.href = `#tarjeta-${prox.id}`;
  caja.className = `nav-proximo ${e.clase}`.trim();
  caja.replaceChildren(
    h('span', { class: 'np-cab' }, icono('calendario'), h('span', {}, 'Próximo pago'), icono('adelante')),
    h('strong', { class: 'np-monto' }, soles(prox.pendiente)),
    h('span', { class: 'np-pie' }, chipTC(prox.id, 'mini'), h('span', { class: 'np-nombre' }, nombreCortoTC(prox))),
    h('span', { class: `pill ${e.clase}`.trim() }, e.texto));
}

function pintarAvisos() {
  pintarProximoPago();
  const partes = [];
  if (!navigator.onLine || estado.tsDatos) {
    partes.push(h('div', { class: 'aviso aviso-red', role: 'status' }, icono('sin-senal'), h('span', {}, textoDatosGuardados())));
  }
  if (estado.pideLogin && api.configurado()) {
    const caja = h('div', { class: 'aviso aviso-sesion' },
      h('span', {}, 'Tu sesión venció. Inicia sesión para actualizar.'));
    const boton = h('div', { class: 'boton-google' });
    caja.append(boton);
    api.renderBoton(boton);
    partes.push(caja);
  }
  const pendientes = estado.cola.filter((i) => i.estado === 'pendiente').length;
  const revisar = estado.cola.filter((i) => i.estado === 'revisar').length;
  if (pendientes && !estado.enviando) {
    partes.push(h('div', { class: 'aviso aviso-cola', role: 'status' }, h('span', { class: 'giro', 'aria-hidden': 'true' }),
      h('span', {}, pendientes === 1 ? '1 movimiento en espera de envío' : `${pendientes} movimientos en espera de envío`)));
  }
  if (revisar) {
    partes.push(h('a', { class: 'aviso aviso-revisar', href: '#inicio', onclick: (ev) => { ev.preventDefault(); irARevisar(); } },
      icono('alerta'), h('span', {}, revisar === 1 ? '1 gasto por revisar' : `${revisar} gastos por revisar`), icono('adelante')));
  }
  avisos.replaceChildren(...partes);
}

function textoDatosGuardados() {
  const ts = estado.tsDatos;
  if (!ts) return 'Sin conexión';
  const sinRed = !navigator.onLine || estado.motivoDatos === 'sin_conexion';
  const d = new Date(ts);
  const cuando = iso(d) === hoyISO()
    ? `de las ${hora(ts)}`
    : `del ${d.getDate()} ${ABREV[d.getMonth()]}, ${hora(ts)}`;
  return sinRed ? `Sin conexión, datos guardados ${cuando}` : `Mostrando datos guardados ${cuando}`;
}

// Lleva a la sección 'Por revisar' de Inicio, aunque ya se esté en Inicio.
function enfocarRevisar() {
  const s = document.getElementById('por-revisar');
  if (!s) return false;
  s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  s.focus({ preventScroll: true });
  return true;
}

function irARevisar() {
  const ruta = location.hash.slice(1) || 'inicio';
  if (ruta === 'inicio' && enfocarRevisar()) return;
  estado.irARevisar = true;
  if (ruta === 'inicio') navegar(); else location.hash = '#inicio';
}

// ---------- Componentes ----------

// Mientras se habla con el Sheets, arriba se ve una barra de avance.
let cargasActivas = 0;
function ocupado(delta) {
  cargasActivas = Math.max(0, cargasActivas + delta);
  document.body.classList.toggle('cargando-datos', cargasActivas > 0);
}
const SOLO_LEEN = ['inicio', 'config', 'tarjetas', 'presupuesto', 'personas', 'ahorros', 'version'];
// El motor de Google instalado dice su versión desde la 1.2.0. Las funciones nuevas solo se ofrecen si ya está.
function motorNuevo() {
  let v = leerCache('inicio')?.datos?.version || leerCache('config')?.datos?.version || '';
  if (!v) { try { v = localStorage.getItem('ff:motor') || ''; } catch { /* nada */ } }
  const [a, b] = String(v).split('.').map(Number);
  return a > 1 || (a === 1 && b >= 2);
}
const EN_PANTALLA = ['editarGasto', 'borrarGasto', 'marcarPagado']; // después de estos se espera al Sheets para ver el cambio
async function llamarApi(...args) {
  ocupado(1);
  try { return await api.llamar(...args); } finally {
    ocupado(-1);
    const accion = args[0];
    if (!SOLO_LEEN.includes(accion) && accion !== 'marcarFijo') {
      estado.cambioDesde = Date.now();
      if (EN_PANTALLA.includes(accion)) estado.frescoDesde = Date.now();
    }
  }
}

// Mientras llega cada pantalla se ve la casa del logo armándose (la misma del arranque).
function cargando() {
  return h('div', { class: 'pantalla cargando arranque', 'aria-busy': 'true', 'aria-label': 'Cargando' },
    logoMarca('vivo'), h('i', { class: 'arranque-barra', 'aria-hidden': 'true' }, h('b')));
}

// Botón que está trabajando: se bloquea y muestra un círculo que gira.
function ocuparBoton(btn, texto) {
  btn.disabled = true;
  btn.classList.add('ocupado');
  if (texto) btn.textContent = texto;
}
function liberarBoton(btn, texto) {
  btn.disabled = false;
  btn.classList.remove('ocupado');
  if (texto) btn.textContent = texto;
}

// Campo con error: tiembla, se pinta de rojo y muestra la nota debajo. Se limpia al corregirlo.
function limpiarError(campo) {
  if (!campo) return;
  campo.classList.remove('con-error', 'tiembla');
  campo.querySelector(':scope > .nota-error')?.remove();
}
function marcarError(campo, texto) {
  if (!campo) return;
  limpiarError(campo);
  campo.append(h('p', { class: 'nota-error', role: 'alert' }, icono('alerta'), texto));
  void campo.offsetWidth;
  campo.classList.add('con-error', 'tiembla');
}

// Aviso de "no hay nada que mostrar", con ícono.
function vacio(...hijos) {
  return h('div', { class: 'vacio' }, h('span', { class: 'vacio-ico', 'aria-hidden': 'true' }, icono('lista')), h('p', {}, hijos));
}

function dato(etiqueta, valor) {
  return h('div', { class: 'dato' }, h('span', { class: 'etiqueta' }, etiqueta), h('strong', {}, soles(valor)));
}

// Reemplaza una zona por una confirmación en la misma pantalla.
function confirmarEnLinea(zona, texto, etiquetaSi, alConfirmar) {
  const previo = [...zona.childNodes];
  const cancelar = () => salirSuave(zona.querySelector('.confirmacion'), () => zona.replaceChildren(...previo));
  const si = h('button', { type: 'button', class: 'boton primario', onclick: async () => {
    ocuparBoton(si, 'Procesando…'); no.disabled = true;
    await alConfirmar();
  } }, etiquetaSi);
  const no = h('button', { type: 'button', class: 'boton', onclick: cancelar }, 'Cancelar');
  zona.replaceChildren(h('div', { class: 'confirmacion', role: 'alertdialog', 'aria-live': 'polite' },
    h('p', {}, texto), h('div', { class: 'acciones' }, si, no)));
  si.focus();
}

// Logo dibujado con el color de la app (cambia con la apariencia elegida).
// Logo de trazos, sin fondo: una casa dibujada con una sola línea y una flecha que sale hacia arriba.
// Cada trazo se dibuja con stroke-dashoffset, así que se puede animar en bucle.
const LOGO_SVG = '<defs><linearGradient id="lm-degradado" gradientUnits="userSpaceOnUse" x1="14" y1="16" x2="106" y2="108"><stop offset="0" class="lm-g1"/><stop offset="1" class="lm-g2"/></linearGradient></defs><path class="lm-t lm-casa" pathLength="100" d="M98 74v26H22V58l38-34 26 23"/><path class="lm-t lm-flecha" pathLength="100" d="M42 82l14-14 12 10 30-32"/><path class="lm-t lm-punta" pathLength="100" d="M84 46h14v14"/><path class="lm-t lm-pulso" pathLength="100" d="M42 82l14-14 12 10 30-32"/>';
function logoMarca(clase = '') {
  const el = svg('svg', { class: `logo-marca ${clase}`.trim(), viewBox: '11 13 98 98', 'aria-hidden': 'true' });
  el.innerHTML = LOGO_SVG;
  return el;
}
// Nombre de la app: "Fin" con peso y "Family" más liviano.
const nombreMarca = () => h('strong', { class: 'marca-texto' }, 'Fin', h('span', {}, 'Family'));

const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// Botón de entrada: se ve con el diseño de la app y, encima e invisibles, van dos botones reales de Google
// (uno cubre la mitad de arriba y otro la de abajo), que son los que reciben el clic.
// Si Google no carga, se muestra un aviso con "Volver a intentar".
function botonEntrar() {
  const arriba = h('div', { class: 'boton-google arriba' });
  const abajo = h('div', { class: 'boton-google abajo' });
  const g = h('span', { class: 'google-g' });
  g.innerHTML = LOGO_GOOGLE; // texto fijo
  const envoltura = h('div', { class: 'google-envoltura' },
    h('div', { class: 'google-arte', 'aria-hidden': 'true' },
      g,
      h('span', { class: 'google-texto' }, h('b', {}, 'Continuar con Google')),
      h('span', { class: 'google-flecha' }, icono('adelante'))),
    arriba, abajo);
  const clasico = () => envoltura.classList.add('clasico');
  let anchoPintado = 0;
  const pintar = async () => {
    const ancho = Math.max(200, Math.min(400, Math.round(envoltura.clientWidth) || 320));
    if (Math.abs(ancho - anchoPintado) < 8) return;
    anchoPintado = ancho;
    const ok = await api.renderBoton(arriba, ancho);
    if (ok) { await api.renderBoton(abajo, ancho); return; }
    clasico();
    arriba.replaceChildren(
      h('p', { class: 'suave' }, 'No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'),
      h('button', { type: 'button', class: 'boton', onclick: () => navegar() }, 'Volver a intentar'));
  };
  // Se pinta cuando la pantalla ya está puesta (para medir el ancho real) y de nuevo si cambia el ancho.
  Promise.resolve().then(() => {
    pintar();
    if ('ResizeObserver' in window) new ResizeObserver(() => { pintar(); }).observe(envoltura);
  });
  return { envoltura };
}

function pantallaLogin(mensaje) {
  const titulo = h('h1', {});
  'Las cuentas de la casa, claras para los dos.'.split(' ').forEach((palabra, i) => {
    titulo.append(h('span', { class: 'palabra', style: `--i: ${i}` }, palabra), ' ');
  });

  // Vista de ejemplo de la app (montos inventados, solo decorativa).
  const escena = h('div', { class: 'login-escena', 'aria-hidden': 'true' },
    h('div', { class: 'esc-pieza esc-saldo' },
      h('span', { class: 'esc-etq' }, 'Saldo del mes', h('em', {}, 'Ejemplo')),
      h('strong', {}, 'S/ 1,250.00'),
      h('span', { class: 'esc-barra' }, h('i')),
      h('span', { class: 'esc-pie' }, '64% del ingreso comprometido')),
    h('div', { class: 'esc-pieza esc-tarjeta' },
      h('span', { class: 'esc-t-top' }, h('b', {}, 'Tarjeta'), h('i', { class: 'plastico-chip' })),
      h('span', { class: 'esc-t-monto' }, h('small', {}, 'Por pagar'), h('strong', {}, 'S/ 480.00')),
      h('span', { class: 'esc-t-pie' }, 'Vence el 20')),
    h('div', { class: 'esc-pieza esc-chip' },
      catIco('Supermercado'),
      h('span', {}, h('b', {}, 'Supermercado'), h('small', {}, 'Hoy, con tarjeta')),
      h('strong', {}, 'S/ 86.40')));

  const marca = h('div', { class: 'login-marca' },
    h('div', { class: 'login-logo' }, logoMarca('vivo'), nombreMarca()),
    titulo,
    escena);

  const cerrada = mensaje === 'Sesión cerrada.';
  const entrar = botonEntrar();
  const raiz = h('div', { class: 'pantalla login partida' },
    h('div', { class: 'hero-fondo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    marca,
    h('div', { class: 'login-lado' },
      h('div', { class: 'login-caja' },
        h('div', { class: 'login-sello', 'aria-hidden': 'true' }, logoMarca('vivo')),
        cerrada ? h('span', { class: 'pill ok' }, 'Sesión cerrada') : null,
        h('h2', {}, cerrada ? 'Hasta pronto' : 'Hola de nuevo'),
        mensaje && !cerrada ? h('p', { class: 'mensaje error' }, mensaje) : null,
        entrar.envoltura,
        h('p', { class: 'login-nota' }, icono('candado'), 'Solo cuentas de la familia'))));

  // La luz y la vista de ejemplo siguen al cursor.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    raiz.addEventListener('pointermove', (ev) => {
      const r = raiz.getBoundingClientRect();
      raiz.style.setProperty('--mx', `${Math.round(ev.clientX - r.left)}px`);
      raiz.style.setProperty('--my', `${Math.round(ev.clientY - r.top)}px`);
      raiz.style.setProperty('--px', ((ev.clientX - r.left) / r.width - 0.5).toFixed(3));
      raiz.style.setProperty('--py', ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
    raiz.addEventListener('pointerleave', () => { raiz.style.removeProperty('--px'); raiz.style.removeProperty('--py'); });
  }
  // Ofrece también One Tap una vez por visita a esta pantalla.
  if (!mensaje && !api.tokenVigente() && !estado.oneTapIntentado) {
    estado.oneTapIntentado = true;
    api.renovar().then(async () => { estado.pideLogin = false; await procesarCola(); navegar(); }).catch(() => {});
  }
  return raiz;
}

// Pone una pantalla en la vista; la de ingreso oculta el menú.
function mostrar(nodo) {
  const esLogin = !!nodo.classList?.contains('login');
  document.body.classList.toggle('sin-sesion', esLogin);
  // En celular, el menú de cuenta va arriba a la derecha de cada pantalla.
  if (!esLogin && !nodo.classList?.contains('cargando') && api.emailGuardado()) nodo.append(botonCuenta(SOLO_GASTO ? 'movil' : 'movil solo-movil'));
  // En celular no hay menú lateral: el logo va junto al título de la página.
  if (!esLogin && !SOLO_GASTO && !nodo.classList?.contains('cargando')) {
    const cab = nodo.querySelector?.('.cabecera');
    if (cab && !cab.querySelector('.logo-marca')) cab.prepend(logoMarca('marca-movil solo-movil'));
  }
  vista.replaceChildren(nodo);
}

function pantallaSinConfig() {
  return h('div', { class: 'pantalla login' },
    h('img', { src: 'iconos/icono.svg', alt: '', class: 'logo', width: '72', height: '72' }),
    h('h1', {}, 'Falta configurar'),
    h('p', { class: 'suave' }, 'Completa API_URL y CLIENT_ID en config.js y vuelve a publicar la app.'));
}

function vistaError(e) {
  // Si el servidor dio el motivo (p. ej. 'Tu cuenta no tiene acceso a FinFamily.') se muestra tal cual.
  if (e?.codigo === 'no_autorizado') return pantallaLogin(e.delServidor ? e.message : undefined);
  if (e?.codigo === 'sin_configurar') return pantallaSinConfig();
  return h('div', { class: 'pantalla' }, estadoError(e, () => navegar()));
}

// Bloque de error: ícono, qué pasó y un botón para volver a intentar.
function estadoError(e, alReintentar) {
  const sinRed = e?.codigo === 'sin_conexion';
  return h('div', { class: 'estado ' + (sinRed ? 'sin-red' : 'error'), role: 'alert' },
    h('span', { class: 'estado-ico', 'aria-hidden': 'true' }, icono(sinRed ? 'sin-senal' : 'alerta')),
    h('h2', {}, sinRed ? 'Sin conexión' : 'Algo salió mal'),
    h('p', {}, sinRed ? 'No hay señal. Cuando vuelva, toca Reintentar.'
      : mensajeError(e, 'No se pudo cargar esta pantalla.')),
    h('button', { type: 'button', class: 'boton primario', onclick: alReintentar }, icono('recargar'), 'Reintentar'));
}

// ---------- Por revisar ----------

function seccionRevisar() {
  const items = estado.cola.filter((i) => i.estado === 'revisar');
  if (!items.length) return null;
  return h('section', { class: 'bloque', id: 'por-revisar', tabindex: '-1' },
    h('h2', {}, 'Por revisar'),
    h('ul', { class: 'lista' }, items.map(itemRevisar)));
}

function itemRevisar(it) {
  const d = it.datos;
  const zona = h('div', { class: 'acciones' });
  const li = h('li', { class: 'tarjeta revisar' });
  if (it.accion === 'registrar') {
    li.append(
      h('div', { class: 'linea' }, h('strong', {}, d.descripcion), h('strong', {}, soles(d.monto))),
      h('p', { class: 'suave' }, `${fechaLarga(d.fecha)} · ${etiquetaMedio(d.medio)} · ${d.concepto}`));
    if (it.coincidencia) {
      const c = it.coincidencia;
      li.append(h('p', { class: 'nota-revisar' },
        `Parece repetido. Ya hay un gasto en ${c.hoja}: ${fechaLarga(c.fecha)} · ${c.descripcion} · ${soles(c.monto)}.`));
      zona.append(h('button', { type: 'button', class: 'boton primario', onclick: async () => {
        await cola.confirmarDuplicado(it.idCliente);
        await procesarCola();
        navegar();
      } }, 'Guardar igual'));
    }
  } else {
    li.append(h('div', { class: 'linea' }, h('strong', {}, `Marcar pagado en ${d.hoja}`),
      h('span', {}, `${d.filas.length} ${d.filas.length === 1 ? 'gasto' : 'gastos'}`)));
  }
  if (it.error) {
    li.append(h('p', { class: 'nota-revisar' }, it.error));
    zona.append(h('button', { type: 'button', class: 'boton', onclick: async () => {
      await cola.reintentar(it.idCliente);
      await procesarCola();
      navegar();
    } }, 'Reintentar'));
  }
  zona.append(h('button', { type: 'button', class: 'boton', onclick: () => {
    confirmarEnLinea(zona, 'Se descartará y no se guardará.', 'Sí, descartar', async () => {
      await cola.quitar(it.idCliente);
      await refrescarCola();
      navegar();
    });
  } }, 'Descartar'));
  li.append(zona);
  return li;
}

function etiquetaMedio(id) {
  const medios = leerCache('config')?.datos?.medios || MEDIOS_LOCAL;
  return medios.find((m) => m.id === id)?.etiqueta || id;
}

// ---------- Avisos breves ----------

// opciones: { ico, accion, alAccion, fijo }. Con "fijo" se queda hasta que se toque el botón o la X.
function avisar(texto, tipo = '', opciones = {}) {
  document.querySelectorAll('.tostada').forEach((t) => t.remove());
  const cerrar = () => { t.classList.add('fuera'); setTimeout(() => t.remove(), 400); };
  const t = h('div', { class: `tostada ${tipo} ${opciones.fijo ? 'fija' : ''}`.replace(/\s+/g, ' ').trim(), role: 'status' },
    icono(opciones.ico || (tipo === 'error' ? 'alerta' : 'check')),
    h('span', {}, texto),
    opciones.accion ? h('button', { type: 'button', class: 'tostada-accion', onclick: () => { cerrar(); opciones.alAccion?.(); } }, opciones.accion) : null,
    opciones.fijo ? h('button', { type: 'button', class: 'tostada-cerrar', 'aria-label': 'Cerrar aviso', title: 'Cerrar', onclick: cerrar }, icono('cerrar'))
      : h('i', { class: 'tostada-tiempo', 'aria-hidden': 'true', style: opciones.dura ? `animation-duration: ${opciones.dura}ms` : null }));
  document.body.append(t);
  if (!opciones.fijo) setTimeout(cerrar, opciones.dura || 2600);
}

// Deshacer: el cambio se ve aplicado al instante, pero se envía recién a los 6 segundos.
// Mientras tanto el aviso trae el botón "Deshacer". Si se cierra o se cambia de pantalla antes, se envía ya (no se pierde).
let porDeshacer = null;
function enviarPendiente() { porDeshacer?.enviar(); }
function conDeshacer(texto, filas, enviar) {
  enviarPendiente();
  const filasLi = () => filas.map((f) => vista.querySelector(`li[data-fila="${f}"]`)).filter(Boolean);
  // La franja de un día se oculta si todos sus gastos se están yendo.
  const franjas = () => vista.querySelectorAll('.consumos').forEach((ul) => ul.querySelectorAll('li.dia').forEach((d) => {
    const suyos = [...ul.querySelectorAll(`li[data-fila][data-dia="${d.dataset.dia}"]`)];
    d.classList.toggle('yendose', suyos.length > 0 && suyos.every((li) => li.hidden || li.classList.contains('yendose')));
  }));
  filasLi().forEach((li) => li.classList.add('yendose'));
  franjas();
  const p = { hecho: false };
  const cerrar = () => { p.hecho = true; clearTimeout(p.reloj); if (porDeshacer === p) porDeshacer = null; };
  p.enviar = () => { if (p.hecho) return; cerrar(); enviar(); };
  p.deshacer = () => { if (p.hecho) return; cerrar(); filasLi().forEach((li) => li.classList.remove('yendose')); franjas(); avisar('Deshecho', '', { ico: 'atras' }); };
  p.reloj = setTimeout(p.enviar, 6000);
  porDeshacer = p;
  avisar(texto, 'ok', { accion: 'Deshacer', alAccion: p.deshacer, dura: 6000 });
}

function mensajeError(e, porDefecto) {
  if (e?.codigo === 'sin_conexion') return 'Sin conexión. Inténtalo cuando vuelva la señal.';
  if (e?.codigo === 'no_autorizado') return 'Tu sesión venció. Vuelve a entrar.';
  if (e?.codigo === 'servidor') return e.message || 'El servidor no respondió. Intenta en un momento.';
  const m = String(e?.message || '');
  // Un mensaje técnico (de Google o del motor) no se muestra tal cual: queda en la consola.
  if (e?.codigo === 'error_interno' || /^(Exception|Error|TypeError|ReferenceError)\b|failed|Service /.test(m)) {
    console.warn('FinFamily, error del motor:', m);
    return 'La hoja no respondió bien. Intenta en un momento.';
  }
  return m || porDefecto;
}

// ---------- Gastos fijos pagados ----------

// Líneas de gasto del presupuesto que se pueden marcar (las de tarjetas se pagan en Tarjetas).
const fijosDe = (filas) => (filas || []).filter((f) => f.seccion === 'gastos' && f.fila && !f.esTarjeta && f.monto > 0);

function actualizarCacheFijo(mes, f) {
  const c = leerCache('presupuesto:' + mes);
  const linea = c?.datos?.filas?.find((x) => x.fila === f.fila);
  if (!linea) return;
  linea.pagado = f.pagado;
  linea.pagadoNota = f.pagadoNota;
  guardarCache('presupuesto:' + mes, c.datos);
}

// Botón redondo para marcar o desmarcar un gasto fijo. Cambia al instante y, si el Sheets no responde, vuelve atrás.
function botonFijo(f, mes, alCambiar) {
  const btn = h('button', { type: 'button', class: 'check-fijo', 'aria-pressed': String(!!f.pagado),
    'aria-label': `Pagado: ${f.concepto}`, title: f.pagado ? 'Quitar pagado' : 'Marcar pagado' }, icono('check'));
  btn.addEventListener('click', async () => {
    if (btn.dataset.enviando) return;
    const nuevo = !f.pagado;
    btn.dataset.enviando = '1';
    f.pagado = nuevo;
    btn.setAttribute('aria-pressed', String(nuevo));
    alCambiar?.(f);
    try {
      const r = await llamarApi('marcarFijo', { idCliente: uuid(), mes, fila: f.fila, concepto: f.concepto, pagado: nuevo }, { email: emailSesion() });
      f.pagado = !!r.pagado;
      f.pagadoNota = r.pagadoNota || '';
      actualizarCacheFijo(mes, f);
    } catch (e) {
      f.pagado = !nuevo;
      avisar(mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'), 'error');
    }
    delete btn.dataset.enviando;
    btn.setAttribute('aria-pressed', String(!!f.pagado));
    btn.title = f.pagado ? 'Quitar pagado' : 'Marcar pagado';
    alCambiar?.(f);
  });
  return btn;
}

// Panel de Inicio: avance de los gastos fijos del mes y la lista para marcarlos.
function panelFijos(pres, mes, maximo = 6) {
  const fijos = fijosDe(pres?.filas);
  if (!fijos.length) return null;
  const total = fijos.reduce((s, f) => s + f.monto, 0) || 1;
  const resumen = h('span', { class: 'pill' });
  const avance = h('i');
  const pintar = () => {
    const pagados = fijos.filter((f) => f.pagado);
    resumen.textContent = `${pagados.length} de ${fijos.length}`;
    resumen.classList.toggle('ok', pagados.length === fijos.length);
    avance.style.width = `${Math.round((pagados.reduce((s, f) => s + f.monto, 0) / total) * 100)}%`;
  };
  const orden = [...fijos].sort((a, b) => (a.pagado - b.pagado) || (b.monto - a.monto));
  const visibles = orden.slice(0, maximo);
  const lista = h('ul', { class: 'lista-fijos' }, visibles.map((f) => {
    const li = h('li', { class: 'fijo' + (f.pagado ? ' pagado' : '') });
    li.append(
      botonFijo(f, mes, (x) => { li.classList.toggle('pagado', !!x.pagado); pintar(); }),
      h('span', { class: 'fijo-nombre', title: f.concepto }, nombreLinea(f.concepto)),
      h('strong', {}, soles(f.monto)));
    return li;
  }));
  pintar();
  return panel('panel-fijos revelar', 'Gastos fijos', resumen,
    h('div', { class: 'progreso-fijos', 'aria-hidden': 'true' }, avance),
    lista,
    orden.length > visibles.length ? h('a', { class: 'panel-enlace', href: '#presupuesto' }, `Ver los ${orden.length}`, icono('adelante')) : null);
}

// ---------- Gasto por persona ----------

function panelPersonas(datos) {
  const personas = (datos?.personas || []).filter((p) => p.total > 0);
  if (!personas.length) return null;
  const total = personas.reduce((s, p) => s + p.total, 0) || 1;
  return panel('panel-personas revelar', 'Quién gastó',
    h('span', { class: 'suave', title: 'Todos los consumos con fecha de este mes, pagados o no' }, soles(total)),
    h('ul', { class: 'gp-lista' }, personas.map((p, i) => {
      const pct = Math.round((p.total / total) * 100);
      const mas = p.conceptos?.[0]?.concepto;
      return h('li', { class: 'gp-fila', title: (p.conceptos || []).slice(0, 6).map((x) => `${x.concepto}: ${soles(x.monto)}`).join('\n') },
        avatar(p.nombre, 'grande'),
        h('div', { class: 'gp-texto' },
          h('div', { class: 'gp-linea' },
            h('strong', {}, p.nombre.split(' ')[0]),
            h('span', { class: 'gp-pct' }, `${pct}%`),
            h('strong', { class: 'gp-total' }, soles(p.total))),
          h('div', { class: 'gp-barra', 'aria-hidden': 'true' }, h('i', { class: `d${i}`, 'data-w': `${pct}%` })),
          h('span', { class: 'suave' }, `${p.consumos} consumo${p.consumos === 1 ? '' : 's'}${mas ? ` · más en ${mas}` : ''}`)));
    })));
}

// ---------- Editar o borrar un gasto ----------

function editarConsumo(t, c) {
  const conceptosBase = leerCache('config')?.datos?.conceptos?.length ? leerCache('config').datos.conceptos : CONCEPTOS_LOCAL;
  const conceptos = conceptosBase.some((x) => normalizar(x) === normalizar(c.concepto)) || !c.concepto ? conceptosBase : [c.concepto, ...conceptosBase];
  const manana = iso(new Date(Date.now() + 86400000));
  const inMonto = h('input', { id: 'ed-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: Number(c.monto).toFixed(2) });
  const inDesc = h('input', { id: 'ed-descripcion', type: 'text', maxlength: '120', autocomplete: 'off', value: c.descripcion || '' });
  const selConcepto = h('select', { id: 'ed-concepto' }, conceptos.map((x) => h('option', { value: x, selected: normalizar(x) === normalizar(c.concepto) }, x)));
  const inFecha = h('input', { id: 'ed-fecha', type: 'date', max: manana, value: c.fecha || '' });
  const inNota = h('input', { id: 'ed-nota', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Opcional', value: c.nota || '' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const zona = h('div', { class: 'acciones modal-acciones' });
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': 'Editar gasto' });
  const alVolver = () => cerrar(true);
  const cerrar = (porAtras = false) => {
    if (dlg.classList.contains('cerrando')) return;
    dlg.classList.add('cerrando');
    window.removeEventListener('popstate', alVolver);
    if (porAtras !== true && history.state?.ventana) history.back();
    setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190);
  };
  try { history.pushState({ ventana: true }, ''); window.addEventListener('popstate', alVolver); } catch { /* sin historial */ }
  const base = { idCliente: uuid(), hoja: t.hoja, fila: c.fila, verificar: { monto: c.monto, descripcion: c.descripcion } };
  const fallar = (e, porDefecto) => { msg.textContent = mensajeError(e, porDefecto); msg.hidden = false; pintarZona(); };

  const guardar = async (btn) => {
    const cambios = {};
    const monto = leerMonto(inMonto.value);
    msg.hidden = true;
    if (!monto) { marcarError(cMonto, 'Escribe cuánto fue.'); inMonto.focus(); return; }
    if (Math.round(monto * 100) !== Math.round(c.monto * 100)) cambios.monto = monto;
    const desc = inDesc.value.trim();
    if (!desc) { marcarError(cDesc, 'Escribe una descripción.'); inDesc.focus(); return; }
    if (desc !== (c.descripcion || '')) cambios.descripcion = desc;
    if (normalizar(selConcepto.value) !== normalizar(c.concepto)) cambios.concepto = selConcepto.value;
    if (inFecha.value && inFecha.value !== (c.fecha || '')) cambios.fecha = inFecha.value;
    if (inNota.value.trim() !== (c.nota || '')) cambios.nota = inNota.value.trim();
    if (!Object.keys(cambios).length) { cerrar(); return; }
    ocuparBoton(btn, 'Guardando…');
    try {
      await llamarApi('editarGasto', { ...base, cambios }, { email: emailSesion() });
      cerrar();
      avisar('Cambios guardados', 'ok');
      navegar();
    } catch (e) {
      fallar(e, 'No se pudo guardar. Intenta de nuevo.');
    }
  };

  function pintarZona() {
    const btnGuardar = h('button', { type: 'button', class: 'boton primario', onclick: () => guardar(btnGuardar) }, 'Guardar');
    zona.replaceChildren(
      btnGuardar,
      h('button', { type: 'button', class: 'boton peligro', onclick: () => {
        msg.hidden = true;
        cerrar();
        conDeshacer(`Borrado: ${limpiarComercio(c.descripcion)}, ${soles(c.monto)}`, [c.fila], async () => {
          try {
            await llamarApi('borrarGasto', base, { email: emailSesion() });
          } catch (e) {
            avisar(mensajeError(e, 'No se pudo borrar. Intenta de nuevo.'), 'error');
          }
          navegar({ silencioso: true });
        });
      } }, icono('papelera'), 'Borrar'),
      h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar'));
  }
  pintarZona();

  const campo = (id, etiqueta, control, clase = '') => h('div', { class: `campo ${clase}`.trim() }, h('label', { for: id }, etiqueta), control);
  const cMonto = campo('ed-monto', 'Monto (S/)', inMonto, 'campo-chico');
  const cDesc = campo('ed-descripcion', 'Descripción', inDesc);
  inMonto.addEventListener('input', () => limpiarError(cMonto));
  inDesc.addEventListener('input', () => limpiarError(cDesc));
  dlg.append(
    h('div', { class: 'modal-cab' }, catIco(c.concepto),
      h('div', {}, h('strong', {}, 'Editar gasto'), h('span', { class: 'suave' }, NOMBRE_TC[t.id] || t.nombre)),
      h('button', { type: 'button', class: 'boton icono-solo', 'aria-label': 'Cerrar', title: 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    h('div', { class: 'modal-cuerpo' },
      cMonto,
      campo('ed-fecha', 'Fecha', selectorFecha(inFecha), 'campo-chico'),
      cDesc,
      campo('ed-concepto', 'Concepto', selConcepto),
      campo('ed-nota', 'Nota', inNota)),
    msg, zona);
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); }); // clic fuera
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- Teclado propio para el monto (app de gastos en celular) ----------

function tecladoMonto(inMonto) {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'borrar'];
  return h('div', { class: 'teclado', role: 'group', 'aria-label': 'Teclado del monto' }, teclas.map((k) => h('button', {
    type: 'button', class: 'tecla' + (k === 'borrar' ? ' tecla-borrar' : ''), 'aria-label': k === 'borrar' ? 'Borrar' : k === '.' ? 'Punto' : k,
    onclick: () => {
      let v = inMonto.value;
      if (k === 'borrar') v = v.slice(0, -1);
      else if (k === '.') { if (v.includes('.')) return; v = (v || '0') + '.'; }
      else {
        const [entero, decimales] = v.split('.');
        if (decimales !== undefined && decimales.length >= 2) return;
        if (decimales === undefined && entero.length >= 6) return;
        v = v === '0' ? k : v + k;
      }
      inMonto.value = v;
      inMonto.dispatchEvent(new Event('input', { bubbles: true }));
      inMonto.classList.remove('pulso');
      void inMonto.offsetWidth;
      inMonto.classList.add('pulso');
    },
  }, k === 'borrar' ? icono('borrar') : k)));
}

// ---------- Pantalla: Inicio ----------

async function vistaInicio() {
  const mesHoy = mesActual();
  // Mes que se está viendo. En el mes en curso sale todo; en otro mes, lo que es propio de ese mes
  // (saldo, reparto, gastos fijos, quién gastó y en qué), porque las deudas de tarjeta son siempre las de hoy.
  const mes = estado.mesInicio || mesHoy;
  const esHoy = mes === mesHoy;
  const [r, rt, rp, rf, rtodo] = await Promise.all([
    cargarRapido('inicio', { hoy: hoyISO() }, 'inicio'),
    cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: false }, 'tarjetas').catch(() => null),
    cargarRapido('personas', { mes }, 'personas:' + mes).catch(() => null),
    // Si lo guardado es de una versión anterior (sin el dato de "pagado"), se pide de nuevo.
    cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes)
      .then((x) => (x?.datos?.filas?.some((f) => f.fila === undefined) ? cargar('presupuesto', { mes }, 'presupuesto:' + mes) : x))
      .catch(() => null),
    // Todo lo gastado, pagado o no: para que los gráficos no pierdan lo que ya se pagó.
    esHoy ? cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo').catch(() => null) : null,
  ]);
  marcarDatos(r);
  const d = r.datos;
  const p = esHoy ? d.presupuesto : (rf?.datos?.totales || null);
  if (rf?.datos?.meses?.length) guardarCache('meses', rf.datos.meses);
  const mesesLista = rf?.datos?.meses || leerCache('meses')?.datos || [];
  const nombre = (d.usuario?.nombre || '').split(' ')[0];
  const hoy = new Date();
  const fechaHoy = hoy.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const mesNombre = (nombreMesClave(mes) || '').split(' ')[0].toLowerCase();
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasQuedan = ultimoDia - hoy.getDate();
  // En computadora con ventana suficiente, Inicio es un tablero que entra completo, sin bajar.
  // El dueño prefirió el Inicio amplio con scroll antes que el tablero apretado sin scroll (6 nov 2026).
  const tablero = false;
  const raiz = h('div', { class: 'pantalla inicio' + (tablero ? ' tablero' : '') });

  raiz.append(h('header', { class: 'cabecera-fila' },
    h('div', { class: 'cabecera' },
      h('p', { class: 'sobretitulo' }, fechaHoy),
      h('h1', {}, nombre ? `${saludo}, ${nombre}` : saludo)),
    h('div', { class: 'mes-inicio' },
      esHoy ? h('button', { type: 'button', class: 'boton boton-hoy boton-cierre', title: 'Cómo cerró el mes pasado', onclick: () => abrirCierre(sumarMes(mesHoy, -1)) },
        icono('check'), `Cierre de ${(nombreMesClave(sumarMes(mesHoy, -1)) || '').slice(0, 3).toLowerCase()}.`) : null,
      esHoy ? null : h('button', { type: 'button', class: 'boton boton-hoy', title: 'Volver al mes en curso', onclick: () => {
        estado.sentido = cmpMes(mesHoy, mes) > 0 ? 'adelante' : 'atras';
        estado.mesInicio = null;
        navegar();
      } }, icono('calendario'), 'Hoy'),
      selectorMes(mesesLista, mes, nombreMesClave(mes) || '', (m) => { estado.mesInicio = m.clave === mesHoy ? null : m.clave; }))));

  const alertas = esHoy ? (d.alertas || []) : [];
  if (alertas.length) {
    raiz.append(h('section', { class: 'avisos-inicio' }, alertas.map((a) => {
      const dias = diasEntre(hoyISO(), a.vence);
      const texto = a.tipo === 'vencida'
        ? `venció el ${fechaLarga(a.vence)}`
        : dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} días (${fechaCorta(a.vence)})`;
      return h('a', { class: 'aviso-fila ' + a.tipo, href: `#tarjeta-${a.tarjeta}` },
        icono('alerta'),
        h('span', {}, h('strong', {}, NOMBRE_TC[a.tarjeta] ? nombreCortoTC({ id: a.tarjeta }) : a.nombre), ` ${texto}`),
        h('strong', { class: 'aviso-monto' }, soles(a.monto)),
        icono('adelante'));
    })));
  }

  const tarjetas = (d.tarjetas || []).filter((t) => t.id !== 'HORMIGA');
  const hormiga = (d.tarjetas || []).find((t) => t.id === 'HORMIGA');
  const conDeuda = tarjetas.filter((t) => t.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
  const proxima = conDeuda.filter((t) => t.proximoVence).sort((a, b) => a.proximoVence.localeCompare(b.proximoVence))[0];

  // Panel del mes: saldo, avance, lo que falta pagar y los datos clave.
  const dato = (ico, etiqueta, valor, extra) => h('li', {},
    h('span', { class: 'hero-ico' }, icono(ico)),
    h('span', { class: 'hero-dato-etq' }, etiqueta),
    h('strong', {}, valor),
    extra || null);
  const hero = h('section', { class: 'hero' },
    h('div', { class: 'hero-fondo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
  if (p && !(p.ingresos > 0)) {
    // Mes sin ingresos cargados en la hoja: no es una pérdida, solo faltan datos.
    hero.append(h('div', { class: 'hero-principal' },
      h('p', { class: 'hero-etq' }, `Saldo de ${mesNombre}`),
      h('p', { class: 'hero-vacio' }, `${nombreMesClave(mes) || 'Este mes'} aún no tiene ingresos cargados.`)));
  } else if (p) {
    const pct = Math.max(0, Math.min(100, Math.round((p.gastos / p.ingresos) * 100)));
    const falta = p.saldo < 0;
    hero.append(
      h('div', { class: 'hero-principal' + (falta ? ' en-falta' : '') },
        h('p', { class: 'hero-etq' }, falta ? [icono('alerta'), ` Falta en ${mesNombre}`] : `Saldo de ${mesNombre}`),
        h('p', { class: 'hero-monto', 'data-rico': '', 'data-contar': String(Math.abs(p.saldo)) }, soles(0)),
        h('p', { class: 'hero-personal' }, h('span', { class: 'avatares' }, avatar('Pedro'), avatar('Britney')),
          h('span', {}, h('strong', {}, soles(Math.abs(p.saldoPersonal))), ' c/u'))),
      anillo(pct));
  } else {
    hero.append(h('div', { class: 'hero-principal' },
      h('p', { class: 'hero-etq' }, 'Saldo del mes'),
      h('p', { class: 'hero-vacio' }, `${nombreMesClave(mes) || 'Este mes'} todavía no está en el presupuesto.`)));
  }
  if (esHoy) hero.append(h('a', { class: 'hero-pagar', href: '#tarjetas' },
    h('span', { class: 'hero-pagar-cab' }, 'Por pagar', icono('adelante')),
    h('strong', { class: 'hero-pagar-monto', 'data-rico': '', 'data-contar': String(d.totalPorPagar || 0) }, soles(0)),
    conDeuda.length ? barraPartes(conDeuda.map((t) => ({ etiqueta: nombreCortoTC(t), valor: t.pendiente, clase: `tc-${t.id}` }))) : null,
    conDeuda.length > 1 ? h('ul', { class: 'hero-leyenda compacta' }, conDeuda.slice(0, 3).map((t) => h('li', {},
      chipTC(t.id, 'mini'), h('span', {}, nombreCortoTC(t)), h('b', {}, pctTexto(t.pendiente, d.totalPorPagar))))) : null,
    h('span', { class: 'hero-pagar-pie' }, icono('calendario'),
      proxima ? `Próximo: ${fechaCorta(proxima.proximoVence)} · ${nombreCortoTC(proxima)}` : 'Sin vencimientos pendientes')));
  if (p && !esHoy && p.ingresos > 0) {
    // Otro mes: en vez de lo que falta pagar hoy, cómo se repartió (o se repartirá) el ingreso de ese mes.
    const gastos = Math.max(p.gastos || 0, 0);
    const ahorros = Math.max(p.ahorros || 0, 0);
    const libre = Math.max(p.saldo || 0, 0);
    const base = Math.max(p.ingresos || 0, gastos + ahorros, 1);
    const reparto = [
      { etiqueta: 'Gastos', valor: gastos, clase: 'r-gastos' },
      { etiqueta: 'Ahorros', valor: ahorros, clase: 'r-ahorros' },
      { etiqueta: 'Saldo libre', valor: libre, clase: 'r-libre' },
    ];
    hero.append(
      h('div', { class: 'hero-pagar hero-reparto' },
        h('span', { class: 'hero-pagar-cab' }, 'Reparto del ingreso'),
        barraPartes(reparto),
        h('ul', { class: 'hero-leyenda' }, reparto.map((x) => h('li', {},
          h('i', { class: `punto ${x.clase}`, 'aria-hidden': 'true' }), h('span', {}, x.etiqueta),
          h('b', {}, `${Math.round((x.valor / base) * 100)}%`))))),
      h('ul', { class: 'hero-datos' },
        dato('sube', 'Ingresos', soles(p.ingresos)),
        dato('baja', 'Gastos', soles(p.gastos)),
        dato('billetera', 'Ahorros', soles(p.ahorros || 0)),
        dato('check', 'Saldo libre', soles(libre))));
  }
  if (p && esHoy) {
    const libre = Math.max(p.saldo, 0);
    hero.append(h('ul', { class: 'hero-datos' },
      dato('sube', 'Ingresos', soles(p.ingresos)),
      dato('baja', 'Gastos', soles(p.gastos)),
      dato('billetera', 'Libre por día', soles(diasQuedan > 0 ? libre / diasQuedan : libre)),
      dato('calendario', 'Fin de mes', diasQuedan === 0 ? 'Hoy' : `En ${diasQuedan} día${diasQuedan === 1 ? '' : 's'}`,
        h('i', { class: 'mes-barra', title: `Día ${hoy.getDate()} de ${ultimoDia}` }, h('b', { 'data-w': `${Math.round((hoy.getDate() / ultimoDia) * 100)}%` })))));
  }
  raiz.append(hero);

  // Tarjetas en carrusel, de la que vence primero a la última.
  const ordenadas = [...tarjetas].sort((a, b) => (b.pendiente > 0) - (a.pendiente > 0)
    || String(a.proximoVence || '9').localeCompare(String(b.proximoVence || '9')));
  const enCarril = [...ordenadas, hormiga].filter(Boolean);
  if (esHoy && enCarril.length) {
    const carril = h('div', { class: 'carrusel' }, enCarril.map((t, i) => {
      const el = tarjetaVisual(t);
      el.style.setProperty('--i', String(i));
      return el;
    }));
    // Con cuatro tarjetas o más el carrusel gira sin fin: se arma con tres juegos iguales en fila y,
    // al completar una vuelta, vuelve al principio sin que se note.
    if (enCarril.length >= 4) {
      const originales = [...carril.children];
      const copia = () => originales.map((el) => {
        const c = el.cloneNode(true);
        c.classList.add('clon'); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1;
        return c;
      });
      carril.prepend(...copia());
      carril.append(...copia());
      // Los tres juegos van en una sola fila, que es la que se mueve.
      const pista = h('div', { class: 'carrusel-pista' });
      pista.append(...carril.children);
      carril.append(pista);
      carril.classList.add('infinito');
      carril.dataset.n = String(originales.length);
    }
    const pasoCarril = () => { const t = carril.children; return t.length > 1 ? t[1].offsetLeft - t[0].offsetLeft : 280; };
    const mover = (dir) => () => (carril.moverTarjeta ? carril.moverTarjeta(dir) : carril.scrollBy({ left: dir * pasoCarril(), behavior: 'smooth' }));
    raiz.append(h('section', { class: 'tarjetas-inicio' },
      h('div', { class: 'seccion-cab' },
        tituloSeccion('Tus tarjetas'),
        h('div', { class: 'seccion-acciones' },
          h('button', { type: 'button', class: 'boton icono-solo solo-pc', 'aria-label': 'Tarjetas anteriores', onclick: mover(-1) }, icono('atras')),
          h('button', { type: 'button', class: 'boton icono-solo solo-pc', 'aria-label': 'Tarjetas siguientes', onclick: mover(1) }, icono('adelante')),
          h('a', { href: '#tarjetas' }, 'Ver todas'))),
      carril));
  }

  // Gastos fijos a la izquierda. A la derecha, quién gastó y debajo los gastos hormiga (en otro mes, en qué se fue).
  let extraPanel = null;
  if (esHoy && rt?.datos?.tarjetas) {
    const hormigas = consumosDe(rt.datos.tarjetas, (t) => t.id === 'HORMIGA')
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 3);
    // En el tablero los gastos hormiga van como una pestaña más del panel de gasto.
    if (!tablero) extraPanel = panel('panel-lista panel-hormiga revelar', 'Gastos hormiga', h('a', { href: '#tarjeta-HORMIGA' }, soles(hormiga?.pendiente || 0)),
      hormigas.length ? h('ul', { class: 'lista-mov' }, hormigas.map((c) => filaMov(c, c.medio))) : vacio('Sin gastos hormiga este mes.'),
      h('a', { class: 'boton panel-accion', href: '#registrar' }, icono('mas'), 'Registrar gasto'));
  } else if (!esHoy) {
    // En qué se fue ese mes: todos los consumos con fecha del mes, sumados por concepto.
    const porConcepto = new Map();
    for (const per of rp?.datos?.personas || []) {
      for (const x of per.conceptos || []) porConcepto.set(x.concepto, (porConcepto.get(x.concepto) || 0) + (Number(x.monto) || 0));
    }
    const orden = [...porConcepto].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const partes = orden.slice(0, 5).map(([etiqueta, valor]) => ({ etiqueta, valor }));
    const resto = orden.slice(5).reduce((s, [, v]) => s + v, 0);
    if (resto > 0) partes.push({ etiqueta: 'Otros conceptos', valor: resto });
    extraPanel = panel('panel-dona revelar', '¿En qué se fue?', null,
      partes.length ? dona(partes, 'Total') : vacio('No hay consumos con fecha de este mes.'));
  }
  const fijosPanel = panelFijos(rf?.datos, mes, tablero ? Math.max(4, Math.min(10, Math.floor((innerHeight - 356) / 45))) : esHoy ? 7 : 10);
  const personasPanel = panelPersonas(rp?.datos);
  const pila = personasPanel || extraPanel ? h('div', { class: 'col-pila' }, personasPanel, extraPanel) : null;
  if (fijosPanel || pila) raiz.append(h('div', { class: 'rejilla-2b' }, fijosPanel, pila));

  if (esHoy && rt?.datos?.tarjetas) {
    const todas = rt.datos.tarjetas;
    // Lo gastado en los últimos 30 días según su fecha, pagado o no. Si aún no llegó la lista completa, se usa lo pendiente.
    const completo = !!rtodo?.datos?.tarjetas;
    const desde30 = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29));
    const gasto30 = consumosDe(completo ? rtodo.datos.tarjetas : todas, () => true)
      .filter((c) => (completo || c.tarjeta.id === 'HORMIGA' || c.estado !== 'Pagado') && String(c.fecha || '') >= desde30);
    const dias = graficoDias(gasto30, 30);
    if (!(dias.total > 0)) dias.nodo = vacio('Todavía no hay gastos en los últimos 30 días.');
    const rejilla = h('div', { class: 'rejilla-3 dos' });
    const agregar = (nodo) => { nodo.classList.add('revelar'); nodo.style.setProperty('--i', String(rejilla.children.length)); rejilla.append(nodo); };

    // En qué se fue: consumos por pagar + gastos hormiga, por concepto
    const porConcepto = new Map();
    for (const c of gasto30) {
      const k = c.concepto || 'Sin concepto';
      porConcepto.set(k, (porConcepto.get(k) || 0) + (Number(c.monto) || 0));
    }
    const orden = [...porConcepto].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const cuantos = tablero && innerHeight < 720 ? 3 : tablero && innerHeight < 760 ? 4 : 5;
    const partes = orden.slice(0, cuantos).map(([etiqueta, valor]) => ({ etiqueta, valor }));
    const resto = orden.slice(cuantos).reduce((s, [, v]) => s + v, 0);
    if (resto > 0) partes.push({ etiqueta: 'Otros conceptos', valor: resto });
    // Un solo panel con dos vistas del mismo gasto: por día y por concepto.
    const pestanasGasto = [
      { etiqueta: tablero ? 'Por día' : 'Gasto por día', lado: `${soles(dias.total)} en 30 días`, pista: 'Todo lo gastado en los últimos 30 días, pagado o no.', nodo: dias.nodo },
      { etiqueta: tablero ? 'Por concepto' : 'Gasto por concepto', lado: soles(orden.reduce((s, [, v]) => s + v, 0)), pista: 'Todo lo gastado en los últimos 30 días, por concepto.',
        nodo: h('div', { class: 'dona-ancha' }, partes.length ? dona(partes, 'Total') : vacio('Todavía no hay consumos este mes.')) },
    ];

    const recientes = consumosDe(completo ? rtodo.datos.tarjetas : todas, (t) => t.id !== 'HORMIGA').filter((c) => completo || c.estado !== 'Pagado')
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, tablero ? Math.max(3, Math.min(6, Math.floor((innerHeight - 380) / 60))) : 6);
    const listaRecientes = recientes.length ? h('ul', { class: 'lista-mov' }, recientes.map((c) => {
      const fila = filaMov(c, nombreCortoTC(c.tarjeta));
      if (c.estado === 'Pagado' && c.tarjeta?.id !== 'HORMIGA') fila.querySelector('.mov-der .suave')?.prepend(h('i', { class: 'mov-pagado', title: 'Pagado', 'aria-label': 'Pagado' }, icono('check')));
      return fila;
    })) : vacio('Todavía no hay gastos.');
    if (tablero) {
      const hormigas = consumosDe(todas, (t) => t.id === 'HORMIGA').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, Math.max(3, Math.min(6, Math.floor((innerHeight - 380) / 60))));
      pestanasGasto.push(
        { etiqueta: 'Últimos', lado: h('a', { href: '#movimientos' }, 'Ver todos'), nodo: h('div', { class: 'pest-lista' }, listaRecientes) },
        { etiqueta: 'Hormiga', lado: h('a', { href: '#tarjeta-HORMIGA' }, soles(hormiga?.pendiente || 0)),
          nodo: h('div', { class: 'pest-lista' }, hormigas.length ? h('ul', { class: 'lista-mov' }, hormigas.map((c) => filaMov(c, c.medio))) : vacio('Sin gastos hormiga este mes.')) });
    }
    agregar(panelPestanas('panel-gasto', pestanasGasto));
    if (!tablero) agregar(panel('panel-lista', 'Últimos consumos', h('a', { href: '#movimientos' }, 'Ver todos'), listaRecientes));

    raiz.append(rejilla);
  }

  const revisar = seccionRevisar();
  if (revisar) raiz.append(revisar);

  try {
    const pasado = sumarMes(mesHoy, -1);
    if (esHoy && hoy.getDate() <= 7 && localStorage.getItem('ff:cierre') !== pasado && leerCache('presupuesto:' + pasado)) {
      localStorage.setItem('ff:cierre', pasado);
      setTimeout(() => { if (location.hash.slice(1) === 'inicio' || !location.hash) abrirCierre(pasado); }, 1800);
    }
  } catch { /* sin almacenamiento */ }
  return raiz;
}

// ---------- Editar el monto en el mismo lugar: clic, escribir, Enter ----------

function editarEnLinea(boton, mes, f) {
  if (boton.classList.contains('guardando')) return;
  const entrada = h('input', { type: 'text', inputmode: 'decimal', class: 'monto-entrada', value: Number(f.monto || 0).toFixed(2), 'aria-label': `Nuevo monto de ${nombreLinea(f.concepto)}`, autocomplete: 'off' });
  let cerrado = false;
  const volver = () => { if (cerrado) return; cerrado = true; entrada.replaceWith(boton); };
  const guardar = async () => {
    if (cerrado) return;
    const texto = entrada.value.trim();
    const monto = Number(texto) === 0 && texto !== '' ? 0 : leerMonto(texto);
    if (monto === null || monto === undefined) { entrada.classList.add('mal'); entrada.focus(); return; }
    if (Math.round(monto * 100) === Math.round((f.monto || 0) * 100)) { volver(); return; }
    volver();
    boton.classList.add('guardando');
    boton.textContent = soles(monto);
    try {
      await llamarApi('editarPresupuesto', { idCliente: uuid(), mes, fila: f.fila, concepto: f.concepto, montoAnterior: f.monto || 0, monto }, { email: emailSesion() });
      try { await cargar('presupuesto', { mes }, 'presupuesto:' + mes); } catch { /* se verá al refrescar */ }
      avisar(`${nombreLinea(f.concepto)}: ${soles(monto)}`, 'ok');
      navegar({ silencioso: true });
    } catch (e) {
      boton.classList.remove('guardando');
      boton.textContent = soles(f.monto || 0);
      avisar(mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'), 'error');
    }
  };
  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); guardar(); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); volver(); boton.focus(); }
  });
  entrada.addEventListener('input', () => entrada.classList.remove('mal'));
  entrada.addEventListener('blur', () => { if (!entrada.classList.contains('mal')) guardar(); else volver(); });
  boton.replaceWith(entrada);
  entrada.focus(); entrada.select();
}

// Orden y densidad de la lista de gastos (se recuerdan en el equipo). Al reordenar, cada fila se desliza a su nuevo lugar.
function controlesGastos(seccion) {
  const ul = seccion.querySelector('.filas-pres');
  const cab = seccion.querySelector('.panel-cab');
  if (!ul || !cab) return;
  let pref = { orden: 'monto', compacta: false };
  try { pref = { ...pref, ...JSON.parse(localStorage.getItem('ff:pres-vista') || '{}') }; } catch { /* nada */ }
  const recordar = () => { try { localStorage.setItem('ff:pres-vista', JSON.stringify(pref)); } catch { /* nada */ } };
  const criterio = {
    monto: (a, b) => Number(b.dataset.plan) - Number(a.dataset.plan),
    nombre: (a, b) => a.dataset.nombre.localeCompare(b.dataset.nombre),
    pendiente: (a, b) => (a.classList.contains('pagado') - b.classList.contains('pagado')) || ((b.dataset.marcable ? 1 : 0) - (a.dataset.marcable ? 1 : 0)) || (Number(b.dataset.plan) - Number(a.dataset.plan)),
  };
  const ordenar = (animar) => {
    const filas = [...ul.children];
    const antes = new Map(filas.map((li) => [li, li.getBoundingClientRect()]));
    filas.sort(criterio[pref.orden] || criterio.monto).forEach((li) => ul.append(li));
    if (!animar || sinMovimiento()) return;
    filas.forEach((li, i) => {
      const a = antes.get(li); const d = li.getBoundingClientRect();
      const dx = a.left - d.left; const dy = a.top - d.top;
      if (!dx && !dy) return;
      li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, delay: Math.min(i * 14, 160), easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
    });
  };
  const botonesOrden = [['monto', 'Monto'], ['nombre', 'A–Z'], ['pendiente', 'Por pagar']].map(([id, texto]) => h('button', { type: 'button', 'aria-pressed': String(pref.orden === id),
    title: id === 'monto' ? 'Del más grande al más chico' : id === 'nombre' ? 'Por nombre' : 'Primero lo que falta pagar',
    onclick: () => { pref.orden = id; recordar(); botonesOrden.forEach((b, k) => b.setAttribute('aria-pressed', String(['monto', 'nombre', 'pendiente'][k] === id))); ordenar(true); } }, texto));
  const densidad = h('button', { type: 'button', class: 'boton icono-solo pres-densidad', 'aria-pressed': String(pref.compacta), title: 'Vista compacta o amplia', 'aria-label': 'Cambiar entre vista compacta y amplia',
    onclick: () => { pref.compacta = !pref.compacta; recordar(); densidad.setAttribute('aria-pressed', String(pref.compacta)); seccion.classList.toggle('compacta', pref.compacta); } }, icono('lista'));
  seccion.classList.toggle('compacta', pref.compacta);
  cab.after(h('div', { class: 'pres-controles' }, h('div', { class: 'segmentos pres-orden', role: 'group', 'aria-label': 'Ordenar gastos' }, botonesOrden), densidad));
  if (pref.orden !== 'monto') ordenar(false);
}

// ---------- Editar el monto de una línea del presupuesto ----------

function editarLinea(mes, f) {
  const inMonto = h('input', { id: 'pl-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: Number(f.monto || 0).toFixed(2) });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': 'Cambiar monto' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const btn = h('button', { type: 'submit', class: 'boton primario' }, 'Guardar');
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    const monto = inMonto.value.trim() === '0' || Number(inMonto.value) === 0 ? 0 : leerMonto(inMonto.value);
    msg.hidden = true;
    if (monto === null || monto === undefined) { msg.textContent = 'Escribe un monto válido.'; msg.hidden = false; inMonto.focus(); return; }
    ocuparBoton(btn, 'Guardando…');
    try {
      await llamarApi('editarPresupuesto', { idCliente: uuid(), mes, fila: f.fila, concepto: f.concepto, montoAnterior: f.monto || 0, monto }, { email: emailSesion() });
      try { await cargar('presupuesto', { mes }, 'presupuesto:' + mes); } catch { /* se verá al refrescar */ }
      cerrar();
      avisar(`${nombreLinea(f.concepto)}: ${soles(monto)}`, 'ok');
      navegar();
    } catch (e) {
      liberarBoton(btn, 'Guardar');
      msg.textContent = mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'); msg.hidden = false;
    }
  } },
    h('p', { class: 'cierre-etq' }, nombreLinea(f.concepto)),
    h('p', { class: 'suave' }, `${nombreMesClave(mes) || mes} · ahora ${soles(f.monto || 0)}`),
    h('div', { class: 'campo' }, h('label', { for: 'pl-monto' }, 'Nuevo monto (S/)'), inMonto),
    msg,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar')));
  dlg.append(form);
  document.body.append(dlg);
  dlg.showModal();
  inMonto.focus(); inMonto.select();
}

// ---------- Cierre de mes: cómo terminó el mes anterior y si se gastó más o menos que el de antes ----------

async function abrirCierre(mes) {
  const antes = sumarMes(mes, -1);
  const [rp, rg, rgAntes] = await Promise.all([
    cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes).catch(() => null),
    cargarRapido('personas', { mes }, 'personas:' + mes).catch(() => null),
    cargarRapido('personas', { mes: antes }, 'personas:' + antes).catch(() => null),
  ]);
  const tot = rp?.datos?.totales;
  const personas = (rg?.datos?.personas || []).filter((x) => x.total > 0);
  const gastado = personas.reduce((x, y) => x + y.total, 0);
  const gastadoAntes = (rgAntes?.datos?.personas || []).reduce((x, y) => x + (y.total || 0), 0);
  if (!tot && !gastado) { avisar(`Todavía no hay datos de ${nombreMesClave(mes) || 'ese mes'}`); return; }
  const nombre = (nombreMesClave(mes) || '').split(' ')[0].toLowerCase();
  const nombreAntes = (nombreMesClave(antes) || '').split(' ')[0].toLowerCase();
  const porConcepto = new Map();
  for (const per of personas) for (const x of per.conceptos || []) porConcepto.set(x.concepto, (porConcepto.get(x.concepto) || 0) + (Number(x.monto) || 0));
  const top = [...porConcepto].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxTop = top[0]?.[1] || 1;
  const dif = gastadoAntes > 0 ? ((gastado - gastadoAntes) / gastadoAntes) * 100 : null;
  const dlg = h('dialog', { class: 'hoja-modal cierre-mes', 'aria-label': `Cierre de ${nombre}` });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const falta = tot && tot.saldo < 0;
  dlg.append(h('div', { class: 'cierre-caja' },
    h('p', { class: 'cierre-etq' }, `Así cerró ${nombre}`),
    tot ? h('p', { class: 'cierre-monto' + (falta ? ' mal' : ''), 'data-rico': '', 'data-contar': String(Math.abs(tot.saldo)) }, soles(0)) : null,
    tot ? h('p', { class: 'suave' }, falta ? 'faltó para cubrir el mes' : 'quedó libre según el plan') : null,
    gastado ? h('div', { class: 'cierre-gasto' },
      h('span', {}, 'Se gastó'), h('strong', { 'data-contar': String(gastado) }, soles(0)),
      dif == null ? null : Math.abs(dif) < 0.5 ? h('span', { class: 'suave' }, `igual que en ${nombreAntes}`)
        : h('span', { class: 'delta ' + (dif <= 0 ? 'bien' : 'mal') }, `${dif > 0 ? '▲' : '▼'} ${Math.abs(dif).toFixed(0)}% vs ${nombreAntes}`)) : null,
    personas.length ? h('ul', { class: 'cierre-personas' }, personas.map((per, i) => h('li', {}, avatar(per.nombre, 'chico'),
      h('span', {}, per.nombre.split(' ')[0]), h('i', { class: 'gp-barra' }, h('i', { class: `d${i}`, 'data-w': `${Math.round((per.total / (gastado || 1)) * 100)}%` })), h('strong', {}, soles(per.total))))) : null,
    top.length ? h('ul', { class: 'cierre-top' }, top.map(([c, v], i) => h('li', { style: `--i: ${i}` }, catIco(c), h('span', {}, c),
      h('i', { class: 'gp-barra' }, h('i', { class: 'd0', 'data-w': `${Math.round((v / maxTop) * 100)}%` })), h('strong', {}, soles(v))))) : null,
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: cerrar }, 'Listo'))));
  document.body.append(dlg);
  dlg.showModal();
  animarVista(dlg);
}

// ---------- Pantalla: Movimientos (todos los gastos juntos, pagados o no) ----------

async function vistaMovimientos() {
  const r = await cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo');
  marcarDatos(r);
  const todos = consumosDe(r.datos.tarjetas || [], () => true)
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const raiz = h('div', { class: 'pantalla movimientos' },
    h('a', { class: 'volver', href: '#inicio' }, icono('atras'), 'Inicio'), h('header', { class: 'cabecera' }, h('h1', {}, 'Movimientos')));
  if (!todos.length) { raiz.append(vacio('Todavía no hay gastos.')); return raiz; }
  const entrada = h('input', { type: 'search', id: 'buscar-mov', placeholder: 'Buscar gasto', 'aria-label': 'Buscar gasto', autocomplete: 'off' });
  const cuenta = h('span', { class: 'buscador-cuenta', 'aria-live': 'polite' });
  const lista = h('ul', { class: 'lista consumos lista-todos' });
  const mas = h('button', { type: 'button', class: 'boton ver-mas' }, 'Ver más');
  const nada = vacio('Ningún gasto coincide.');
  nada.querySelector('.vacio-ico')?.replaceChildren(icono('buscar'));
  let concepto = null;
  let tope = 60;
  const texto = (c) => normalizar(`${c.descripcion} ${limpiarComercio(c.descripcion)} ${c.concepto || ''} ${nombreCortoTC(c.tarjeta)} ${c.medio || ''}`);
  const indice = todos.map((c) => [c, texto(c)]);
  const pintar = () => {
    const q = normalizar(entrada.value);
    const sal = indice.filter(([c, t]) => (!q || t.includes(q)) && (!concepto || (c.concepto || 'Sin concepto') === concepto)).map(([c]) => c);
    const suma = sal.reduce((x, c) => x + (Number(c.monto) || 0), 0);
    cuenta.textContent = `${sal.length} · ${soles(suma)}`;
    const nodos = [];
    sal.slice(0, tope).forEach((c, k, arr) => {
      if (k === 0 || arr[k - 1].fecha !== c.fecha) {
        const delDia = sal.filter((x) => x.fecha === c.fecha).reduce((x, y) => x + (Number(y.monto) || 0), 0);
        nodos.push(h('li', { class: 'dia' },
          h('span', {}, c.fecha ? deISO(c.fecha).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha'),
          h('strong', { class: 'dia-total' }, soles(delDia))));
      }
      const fila = filaMov(c, nombreCortoTC(c.tarjeta), true);
      if (c.estado === 'Pagado' && c.tarjeta?.id !== 'HORMIGA') fila.querySelector('.mov-der .suave')?.prepend(h('i', { class: 'mov-pagado', title: 'Pagado', 'aria-label': 'Pagado' }, icono('check')));
      if (c.estado === 'Pagado' && c.tarjeta.id !== 'HORMIGA' && c.fila && motorNuevo() && emailSesion()) {
        fila.append(h('button', { type: 'button', class: 'boton-editar mov-devolver', title: 'Devolver a pendiente', 'aria-label': `Devolver a pendiente ${limpiarComercio(c.descripcion)}`, onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          try {
            const res = await llamarApi('desmarcarPagado', { idCliente: uuid(), hoja: c.tarjeta.hoja, filas: [c.fila], verificar: [{ fila: c.fila, monto: c.monto, descripcion: c.descripcion }] }, { email: emailSesion() });
            if (res?.actualizadas) { avisar('Volvió a pendiente', 'ok', { ico: 'atras' }); navegar(); }
            else { avisar(`No se cambió: ${res?.omitidas?.[0]?.motivo || 'revisa el gasto'}`, 'error'); b.disabled = false; }
          } catch (e) { avisar(mensajeError(e, 'No se pudo cambiar. Intenta de nuevo.'), 'error'); b.disabled = false; }
        } }, icono('atras')));
      }
      nodos.push(fila);
    });
    lista.replaceChildren(...nodos);
    mas.hidden = sal.length <= tope;
    mas.textContent = `Ver más (${sal.length - tope})`;
    nada.hidden = sal.length > 0;
    lista.parentElement.hidden = !sal.length;
  };
  entrada.addEventListener('input', () => { tope = 60; pintar(); });
  mas.addEventListener('click', () => { tope += 120; pintar(); });
  const porConcepto = new Map();
  for (const c of todos) porConcepto.set(c.concepto || 'Sin concepto', (porConcepto.get(c.concepto || 'Sin concepto') || 0) + (Number(c.monto) || 0));
  const chips = [...porConcepto].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nombre]) => {
    const chip = h('button', { type: 'button', class: 'chip-filtro', 'aria-pressed': 'false', onclick: () => {
      concepto = concepto === nombre ? null : nombre;
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === chip && concepto === nombre)));
      tope = 60; pintar();
    } }, catIco(nombre), h('span', {}, nombre));
    return chip;
  });
  raiz.append(h('div', { class: 'buscador' }, icono('buscar'), entrada, cuenta),
    h('div', { class: 'chips-filtro', role: 'group', 'aria-label': 'Filtrar por concepto' }, chips),
    h('section', { class: 'bloque grupo' }, lista), nada, mas);
  pintar();
  return raiz;
}

// ---------- Pantalla: Registrar ----------

function idCicloDeMedio(medio, usuario) {
  if (!medio || medio.tipo !== 'tarjeta') return null;
  if (medio.id === 'TC_IBK') return usuario?.clave === 'B' || usuario?.nombre === 'Britney' ? 'IBK_B' : 'IBK_P';
  return { TC_SIP: 'SIP', TC_BCP: 'BCP', TC_RIPLEY: 'RIPLEY' }[medio.id] || null;
}

// Índice descripción -> concepto a partir de los consumos ya cargados.
function indiceHistorial() {
  const filas = [];
  const t = leerCache('tarjetas')?.datos?.tarjetas || [];
  for (const tar of t) for (const g of tar.estados || []) for (const c of g.consumos || []) {
    if (c.descripcion && c.concepto) filas.push({ d: normalizar(c.descripcion), c: c.concepto });
  }
  for (const it of estado.cola) {
    if (it.accion === 'registrar') filas.push({ d: normalizar(it.datos.descripcion), c: it.datos.concepto });
  }
  return filas;
}

function sugerirConcepto(descripcion, historial, conceptos) {
  const q = normalizar(descripcion);
  if (q.length < 3) return null;
  const palabras = q.split(' ').filter((p) => p.length >= 3);
  const puntos = new Map();
  for (const { d, c } of historial) {
    if (!conceptos.includes(c)) continue;
    let s = 0;
    if (d === q) s = 10;
    else if (d.startsWith(q) || q.startsWith(d)) s = 5;
    else {
      const otras = d.split(' ');
      for (const p of palabras) if (otras.some((o) => o.startsWith(p) || p.startsWith(o) && o.length >= 3)) s += 2;
    }
    if (s) puntos.set(c, (puntos.get(c) || 0) + s);
  }
  // Si no hay historial, intenta con el nombre del concepto.
  if (!puntos.size) {
    for (const c of conceptos) {
      const nc = normalizar(c);
      if (palabras.some((p) => nc.split(' ').some((o) => o.length >= 4 && (o.startsWith(p) || p.startsWith(o))))) puntos.set(c, 1);
    }
  }
  let mejor = null;
  for (const [c, s] of puntos) if (!mejor || s > mejor[1]) mejor = [c, s];
  return mejor ? mejor[0] : null;
}

async function vistaRegistrar() {
  let cfg;
  try { cfg = (await cargarRapido('config', {}, 'config')).datos; } catch { cfg = null; }
  const medios = cfg?.medios?.length ? cfg.medios : MEDIOS_LOCAL;
  const conceptos = cfg?.conceptos?.length ? cfg.conceptos : CONCEPTOS_LOCAL;
  const ciclos = cfg?.ciclos || CICLOS_LOCAL;
  const usuario = cfg?.usuario || usuarioActual();
  if (!leerCache('tarjetas')) cargar('tarjetas', { hoy: hoyISO(), incluirPagados: false }, 'tarjetas').catch(() => {});

  let medioRecordado = '';
  try { medioRecordado = localStorage.getItem('ff:medio') || ''; } catch { /* nada */ }
  const f = estado.form || (estado.form = {
    monto: '', medio: medios.some((m) => m.id === medioRecordado) ? medioRecordado : null,
    descripcion: '', concepto: null, conceptoManual: false, nota: '', fecha: hoyISO(), fechaManual: false,
  });
  // La PWA puede quedar abierta de un día para otro: si el usuario no eligió la fecha, es la de hoy.
  if (!f.fechaManual) f.fecha = hoyISO();

  let manana = iso(new Date(Date.now() + 86400000));
  const msg = h('div', { class: 'mensaje', role: 'status', 'aria-live': 'polite' });
  const vistaPrevia = h('p', { class: 'vista-previa' });
  const sugerencia = h('p', { class: 'sugerencia' });

  const inMonto = h('input', { id: 'monto', class: 'campo-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    placeholder: '0.00', 'aria-label': 'Monto en soles', value: f.monto, enterkeyhint: 'done' });
  inMonto.addEventListener('input', () => {
    inMonto.value = inMonto.value.replace(/[^\d.,]/g, '');
    f.monto = inMonto.value;
    limpiarError(cajaMonto);
  });
  // En la app de gastos del celular el monto se escribe con un teclado propio (sin abrir el del sistema).
  // El teclado propio sale en todos los equipos. En pantallas táctiles reemplaza al del sistema;
  // en computadora convive con el teclado físico (se puede escribir o tocar los números).
  const conTeclado = true;
  if (matchMedia('(pointer: coarse)').matches) { inMonto.readOnly = true; inMonto.setAttribute('inputmode', 'none'); }
  let cajaMonto = null;
  const plegar = () => cajaMonto?.classList.add('plegado');

  const colorMedio = (m) => (m.id === 'TC_IBK' ? (idCicloDeMedio(m, usuario) || 'IBK_P') : (COLOR_MEDIO[m.id] || 'HORMIGA'));
  const botonesMedio = medios.map((m) => h('button', { type: 'button', class: `opcion medio tc-${colorMedio(m)}`, 'data-id': m.id,
    'aria-pressed': String(f.medio === m.id), onclick: () => {
      f.medio = m.id;
      try { localStorage.setItem('ff:medio', m.id); } catch { /* nada */ }
      botonesMedio.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === m.id)));
      actualizarPrevia();
      plegar();
      limpiarError(campoMedio);
    } }, h('span', { class: `chip-tc mini tc-${colorMedio(m)}`, 'aria-hidden': 'true' }), m.etiqueta));

  const inDesc = h('input', { id: 'descripcion', type: 'text', maxlength: '120', autocomplete: 'off',
    placeholder: 'Ej. Plaza Vea, almuerzo, taxi', value: f.descripcion, enterkeyhint: 'done' });

  // Los conceptos que más usas van primero.
  const usos = new Map();
  for (const x of indiceHistorial()) usos.set(x.c, (usos.get(x.c) || 0) + 1);
  const conceptosOrden = [...conceptos].sort((a, b) => (usos.get(b) || 0) - (usos.get(a) || 0));
  const botonesConcepto = conceptosOrden.map((c) => h('button', { type: 'button', class: 'opcion chica', 'data-c': c,
    'aria-pressed': String(f.concepto === c), onclick: () => {
      f.concepto = c; f.conceptoManual = true; pintarConceptos(); sugerencia.textContent = '';
      plegar();
      limpiarError(campoConcepto);
    } }, catIco(c), h('span', { class: 'opcion-texto' }, c)));
  function pintarConceptos() {
    botonesConcepto.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === f.concepto)));
  }
  function actualizarSugerencia() {
    const s = sugerirConcepto(f.descripcion, indiceHistorial(), conceptos);
    if (s && !f.conceptoManual) { f.concepto = s; pintarConceptos(); }
    sugerencia.textContent = s && f.concepto === s && !f.conceptoManual ? `Concepto sugerido: ${s}` : '';
  }
  inDesc.addEventListener('input', () => { f.descripcion = inDesc.value; actualizarSugerencia(); });

  const inNota = h('input', { id: 'nota', type: 'text', maxlength: '200', autocomplete: 'off',
    placeholder: 'Opcional', value: f.nota, enterkeyhint: 'done' });
  inNota.addEventListener('input', () => { f.nota = inNota.value; });

  const inFecha = h('input', { id: 'fecha', type: 'date', max: manana, value: f.fecha });
  inFecha.addEventListener('change', () => {
    f.fecha = inFecha.value;
    f.fechaManual = !!inFecha.value && inFecha.value !== hoyISO();
    actualizarPrevia();
  });

  function actualizarPrevia() {
    const m = medios.find((x) => x.id === f.medio);
    if (!m) { vistaPrevia.textContent = ''; return; }
    if (m.tipo !== 'tarjeta') {
      vistaPrevia.textContent = `${m.hoja} · ${m.etiqueta}`;
      return;
    }
    const idc = idCicloDeMedio(m, usuario);
    const { pago, vence } = calcularCiclo(idc, f.fecha, ciclos);
    vistaPrevia.textContent = vence
      ? `Se paga el ${fechaLarga(pago)} · vence el ${fechaLarga(vence)}`
      : 'Sin fecha de pago';
  }

  const btnGuardar = h('button', { type: 'submit', class: 'boton primario grande' }, 'Guardar gasto');

  const campoMedio = h('fieldset', { class: 'f-medios' }, h('legend', {}, 'Pagué con'), h('div', { class: 'opciones' }, botonesMedio));
  const campoConcepto = h('fieldset', { class: 'f-conceptos' }, h('legend', {}, 'Concepto'), h('div', { class: 'opciones chicas' }, botonesConcepto));
  const cajaFecha = selectorFecha(inFecha);
  const campoFecha = h('div', { class: 'campo' }, h('label', { for: 'fecha' }, 'Fecha'), cajaFecha);
  inFecha.addEventListener('change', () => limpiarError(campoFecha));
  // Últimos gastos: primero los registrados en esta visita, luego los más recientes que ya están en el Sheets.
  const listaRecientes = h('ul', { class: 'rec-lista' });
  const pintarRecientes = () => {
    const guardados = consumosDe(leerCache('tarjetas')?.datos?.tarjetas || [], () => true)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const items = [...(estado.recienRegistrados || []), ...guardados].slice(0, 4);
    listaRecientes.replaceChildren(...items.map((c) => h('li', { class: 'rec' + (c.nuevo ? ' nuevo' : ''), title: c.descripcion || c.concepto || '' },
      catIco(c.concepto),
      h('span', { class: 'rec-texto' }, h('span', {}, limpiarComercio(c.descripcion || c.concepto || 'Gasto')), h('span', { class: 'suave' }, fechaCorta(c.fecha))),
      h('strong', {}, soles(c.monto)),
      c.nuevo ? h('span', { class: 'rec-ok', 'aria-label': 'Recién registrado' }, icono('check')) : null)));
  };
  pintarRecientes();
  const recientes = h('section', { class: 'f-recientes', 'aria-label': 'Últimos gastos registrados' },
    h('span', { class: 'f-recientes-etq' }, 'Últimos'), listaRecientes);
  const form = h('form', { class: 'formulario', novalidate: true },
    (cajaMonto = h('div', { class: 'hero monto-caja' + (conTeclado ? ' con-teclado' : '') }, heroFondo(),
      h('label', { class: 'campo-monto-caja', for: 'monto', onclick: () => cajaMonto.classList.remove('plegado') }, h('span', { class: 'moneda' }, 'S/'), inMonto),
      vistaPrevia,
      conTeclado ? tecladoMonto(inMonto) : null)),
    campoMedio,
    h('div', { class: 'campo' }, h('label', { for: 'descripcion' }, 'Descripción (opcional)'), inDesc, sugerencia),
    campoConcepto,
    h('div', { class: 'fila-dos' },
      campoFecha,
      h('div', { class: 'campo' }, h('label', { for: 'nota' }, 'Nota'), inNota)),
    h('div', { class: 'f-cierre' }, msg, btnGuardar),
    recientes);

  // Muestra en 'msg' lo que pasó con el envío de un gasto (también tras 'Guardar igual').
  function mostrarResultado(datos, res) {
    const r = res?.resultados?.[datos.idCliente];
    if (r?.tipo === 'enviado') {
      if (!r.datos?.duplicadoId) celebrar(datos.monto); // la celebración sale cuando de verdad quedó guardado
      msg.className = 'mensaje ok';
      msg.replaceChildren(r.datos?.duplicadoId
        ? `Ya estaba guardado en ${r.datos.hoja}.`
        : `Guardado en ${r.datos?.hoja || 'tu hoja'}: ${datos.descripcion}, ${soles(datos.monto)}.`);
    } else if (r?.tipo === 'revisar') {
      const c = r.datos?.coincidencia || {};
      const zona = h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'boton primario', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          await cola.confirmarDuplicado(datos.idCliente);
          msg.className = 'mensaje';
          msg.replaceChildren('Enviando…');
          mostrarResultado(datos, await procesarHasta(datos.idCliente));
        } }, 'Guardar igual'),
        h('button', { type: 'button', class: 'boton', onclick: async () => {
          await cola.quitar(datos.idCliente);
          await refrescarCola();
          msg.className = 'mensaje';
          msg.replaceChildren('Descartado.');
        } }, 'Descartar'));
      msg.className = 'mensaje alerta-dup';
      msg.replaceChildren(
        h('p', {}, `Parece repetido. Ya hay en ${c.hoja}: ${fechaLarga(c.fecha)} · ${c.descripcion} · ${soles(c.monto)}.`),
        zona);
    } else if (r?.tipo === 'error') {
      msg.className = 'mensaje error';
      msg.replaceChildren(`${r.error.message} Quedó en "Por revisar".`);
    } else if (!cola.persistente()) {
      msg.className = 'mensaje error';
      msg.replaceChildren('No se pudo guardar: no cierres la app hasta que vuelva la señal.');
    } else {
      msg.className = 'mensaje';
      msg.replaceChildren(
        res?.detenido === 'no_autorizado' ? 'Guardado aquí. Inicia sesión para enviarlo.'
          : res?.detenido === 'otro_usuario' ? 'Guardado aquí. Se enviará cuando entres con tu cuenta.'
            : 'Guardado aquí. Se enviará cuando vuelva la señal.');
    }
  }

  let ultimoEnvio = 0;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Recalcula 'hoy' y 'mañana' por si la app quedó abierta desde otro día.
    manana = iso(new Date(Date.now() + 86400000));
    inFecha.max = manana;
    if (!f.fechaManual) { f.fecha = hoyISO(); inFecha.value = f.fecha; cajaFecha.refrescar(); actualizarPrevia(); }
    const monto = leerMonto(f.monto);
    [cajaMonto, campoMedio, campoConcepto, campoFecha].forEach(limpiarError);
    const email = emailSesion();
    const fallos = [];
    if (!monto) fallos.push([cajaMonto, 'Escribe cuánto fue.']);
    if (!f.medio) fallos.push([campoMedio, 'Elige con qué pagaste.']);
    if (!f.concepto) fallos.push([campoConcepto, 'Elige un concepto.']);
    if (!deISO(f.fecha)) fallos.push([campoFecha, 'Revisa la fecha.']);
    else if (f.fecha > manana) fallos.push([campoFecha, 'La fecha no puede ser futura.']);
    if (fallos.length || !email) {
      fallos.forEach(([campo, texto]) => marcarError(campo, texto));
      // La nota va en cada campo; abajo solo se avisa si falta iniciar sesión.
      msg.className = email ? 'mensaje' : 'mensaje error';
      msg.replaceChildren(...(email ? [] : ['Inicia sesión para registrar gastos.']));
      if (fallos.length) fallos[0][0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!monto) { inMonto.focus({ preventScroll: true }); cajaMonto?.classList.remove('plegado'); }
      return;
    }
    msg.className = 'mensaje';
    msg.replaceChildren();
    ocuparBoton(btnGuardar, 'Guardando…');
    const datos = {
      idCliente: uuid(), monto, medio: f.medio, concepto: f.concepto,
      descripcion: (f.descripcion.trim() || f.concepto || '').slice(0, 120), nota: f.nota.trim().slice(0, 200),
      fecha: f.fecha, confirmarDuplicado: false,
    };
    try {
      await cola.encolar('registrar', datos, email);
    } catch {
      msg.className = 'mensaje error';
      msg.replaceChildren('No se pudo guardar. Intenta de nuevo.');
      liberarBoton(btnGuardar, 'Guardar gasto');
      return;
    }
    // Ya está en la cola: se puede registrar el siguiente mientras se envía.
    Object.assign(f, { monto: '', descripcion: '', concepto: null, conceptoManual: false, nota: '' });
    cajaMonto?.classList.remove('plegado');
    inMonto.value = ''; inDesc.value = ''; inNota.value = ''; sugerencia.textContent = ''; pintarConceptos();
    liberarBoton(btnGuardar, 'Guardar gasto');
    try { localStorage.removeItem('ff:borrador'); } catch { /* nada */ }
    const miEnvio = ++ultimoEnvio;
    msg.className = 'mensaje';
    msg.replaceChildren(cola.persistente() ? 'Guardado aquí. Enviando…' : 'Enviando…');
    estado.recienRegistrados = [{ descripcion: datos.descripcion, concepto: datos.concepto, monto: datos.monto, fecha: datos.fecha, nuevo: true },
      ...(estado.recienRegistrados || [])].slice(0, 4);
    pintarRecientes();
    inMonto.focus();

    const res = await procesarHasta(datos.idCliente);
    if (miEnvio !== ultimoEnvio) return; // ya hay un registro más reciente en pantalla
    mostrarResultado(datos, res);
  });

  try {
    const b = JSON.parse(localStorage.getItem('ff:borrador') || 'null');
    if (b && Date.now() - (b.t || 0) < 12 * 3600 * 1000 && !f.monto && !f.descripcion) {
      f.monto = b.monto || ''; f.descripcion = b.descripcion || ''; f.nota = b.nota || '';
      if (b.concepto) { f.concepto = b.concepto; f.conceptoManual = true; }
      inMonto.value = f.monto; inDesc.value = f.descripcion; inNota.value = f.nota;
    }
  } catch { /* sin borrador */ }
  const guardarBorrador = () => setTimeout(() => {
    try {
      if (f.monto || f.descripcion || f.nota) localStorage.setItem('ff:borrador', JSON.stringify({ t: Date.now(), monto: f.monto, descripcion: f.descripcion, nota: f.nota, concepto: f.conceptoManual ? f.concepto : null }));
      else localStorage.removeItem('ff:borrador');
    } catch { /* nada */ }
  }, 0);
  form.addEventListener('input', guardarBorrador);
  form.addEventListener('click', guardarBorrador);
  actualizarPrevia();
  pintarConceptos();
  const raiz = h('div', { class: 'pantalla registrar' },
    SOLO_GASTO
      ? h('header', { class: 'cabecera-gasto' }, logoMarca('vivo'), h('h1', {}, 'Nuevo gasto'),
        h('button', { type: 'button', class: 'boton instalar', onclick: instalarApp }, icono('descargar'), 'Instalar'),
        h('a', { class: 'boton reporte', href: './#inicio' }, icono('presupuesto'), 'Cómo va el mes'))
      : h('header', { class: 'cabecera' }, h('h1', {}, 'Nuevo gasto')),
    form);
  requestAnimationFrame(() => { if (!f.monto) inMonto.focus({ preventScroll: true }); });
  return raiz;
}

// ---------- Pantalla: Tarjetas ----------

function obtenerTarjetas() {
  return cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: false }, 'tarjetas');
}

// Dato dentro de un panel de color: ícono, etiqueta y valor.
function heroDato(ico, etiqueta, valor, extra) {
  return h('li', {},
    h('span', { class: 'hero-ico' }, icono(ico)),
    h('span', { class: 'hero-dato-etq' }, etiqueta),
    h('strong', {}, valor),
    extra || null);
}

function heroFondo() {
  return h('div', { class: 'hero-fondo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}

// Reparto de consumos por concepto: las partes más grandes y el resto junto.
function porConceptoDe(consumos, maximo) {
  const mapa = new Map();
  for (const c of consumos) {
    const k = c.concepto || 'Sin concepto';
    mapa.set(k, (mapa.get(k) || 0) + (Number(c.monto) || 0));
  }
  const orden = [...mapa].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const partes = orden.slice(0, maximo).map(([etiqueta, valor]) => ({ etiqueta, valor }));
  const resto = orden.slice(maximo).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) partes.push({ etiqueta: 'Otros conceptos', valor: resto });
  return partes;
}

async function vistaTarjetas() {
  const r = await obtenerTarjetas();
  marcarDatos(r);
  const lista = r.datos.tarjetas || [];
  const deCredito = lista.filter((t) => t.id !== 'HORMIGA');
  const hormiga = lista.find((t) => t.id === 'HORMIGA');
  const total = deCredito.reduce((s, t) => s + (t.pendiente || 0), 0);
  const conDeuda = deCredito.filter((t) => t.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
  const porFecha = conDeuda.filter((t) => t.proximoVence).sort((a, b) => a.proximoVence.localeCompare(b.proximoVence));
  const proxima = porFecha[0];
  const raiz = h('div', { class: 'pantalla tarjetas' },
    h('header', { class: 'cabecera' }, h('h1', {}, 'Tarjetas')));
  if (!lista.length) { raiz.append(vacio('No hay tarjetas para mostrar.')); return raiz; }

  // Resumen: total, reparto por tarjeta y datos clave
  const heroTarjetas = h('section', { class: 'hero simple' }, heroFondo(),
    h('div', { class: 'hero-principal' },
      h('p', { class: 'hero-etq' }, 'Por pagar'),
      h('p', { class: 'hero-monto', 'data-rico': '', 'data-contar': String(total) }, soles(0)),
      h('p', { class: 'hero-personal' }, `${conDeuda.length} tarjeta${conDeuda.length === 1 ? '' : 's'} con deuda`)),
    conDeuda.length ? h('div', { class: 'hero-extra' },
      barraPartes(conDeuda.map((t) => ({ etiqueta: nombreCortoTC(t), valor: t.pendiente, clase: `tc-${t.id}` }))),
      h('ul', { class: 'hero-leyenda' }, conDeuda.map((t) => h('li', {}, chipTC(t.id, 'mini'), h('span', {}, nombreCortoTC(t)),
        h('b', {}, pctTexto(t.pendiente, total)))))) : null,
    h('ul', { class: 'hero-datos' },
      heroDato('calendario', 'Próximo pago', proxima ? fechaCorta(proxima.proximoVence) : 'Ninguno'),
      heroDato('tarjetas', 'La más alta', conDeuda[0] ? nombreCortoTC(conDeuda[0]) : 'Ninguna'),
      heroDato('billetera', 'Gastos hormiga', soles(hormiga?.pendiente || 0))));

  // Calendario de pagos: de hoy a la última fecha
  let panelRuta = null;
  if (porFecha.length) {
    const hoy = deISO(hoyISO());
    const paso = (clase, fecha, titulo, detalle, monto, href, i) => h(href ? 'a' : 'div', { class: `ruta-paso ${clase}`.trim(), href: href || null, style: `--i: ${i}` },
      h('span', { class: 'ruta-fecha' }, h('b', {}, String(fecha.getDate())), h('i', {}, ABREV[fecha.getMonth()])),
      h('span', { class: 'ruta-texto' }, h('strong', {}, titulo), h('span', {}, detalle)),
      monto != null ? h('strong', { class: 'ruta-monto' }, soles(monto)) : null);
    panelRuta = h('section', { class: 'panel panel-ruta revelar' },
      h('div', { class: 'panel-cab' }, tituloSeccion('Calendario de pagos')),
      h('div', { class: 'ruta' },
        paso('hoy', hoy, 'Hoy', '', null, null, 0),
        porFecha.map((t, i) => {
          const e = estadoVence(t.proximoVence, t.pendiente);
          return paso(`tc-${t.id} ${e.clase}`, deISO(t.proximoVence), nombreCortoTC(t), e.texto, t.pendiente, `#tarjeta-${t.id}`, i + 1);
        })));
  }

  // Billetera: las tarjetas van encimadas, como en una billetera. La que vence primero queda adelante, completa;
  // de las demás se ve la franja de arriba con el nombre y lo que falta pagar.
  const peso = (t) => (t.id === 'HORMIGA' ? 0 : t.pendiente > 0 && t.proximoVence ? 2 : 1);
  const enPila = [...lista].sort((a, b) => peso(a) - peso(b) || String(b.proximoVence || '').localeCompare(String(a.proximoVence || '')));
  const billetera = h('div', { class: 'billetera' }, enPila.map((t, i) => {
    const el = tarjetaVisual(t);
    el.style.setProperty('--i', String(i));
    const arriba = el.querySelector('.plastico-top');
    arriba.insertBefore(h('strong', { class: 'pila-monto' }, soles(t.pendiente || 0)), arriba.lastChild);
    return el;
  }));
  // A un lado la billetera; al otro, el resumen y el calendario de pagos.
  raiz.append(h('div', { class: 'rejilla-billetera' },
    h('div', { class: 'col-pila' }, heroTarjetas, panelRuta),
    h('section', { class: 'billetera-caja' }, h('div', { class: 'seccion-cab' }, tituloSeccion('Tus tarjetas')), billetera)));
  return raiz;
}

async function vistaTarjeta(id) {
  const r = await obtenerTarjetas();
  marcarDatos(r);
  const t = (r.datos.tarjetas || []).find((x) => x.id === id);
  const volver = h('a', { class: 'volver', href: '#tarjetas' }, icono('atras'), 'Tarjetas');
  if (!t) return h('div', { class: 'pantalla' }, volver, vacio('No encontramos esta tarjeta.'));

  if (estado.selTarjeta !== id) { estado.selTarjeta = id; estado.seleccion = new Set(); }
  const esHormiga = t.id === 'HORMIGA';
  const enEspera = (c) => estado.filasEnEspera.has(`${t.hoja}#${c.fila}`);
  const marcable = (c) => c.estado !== 'Pagado' && !enEspera(c);
  const pendientesTC = consumosDe([t], () => true).filter((c) => esHormiga || c.estado !== 'Pagado');
  const porPagar = pendientesTC.length;
  const partes = porConceptoDe(pendientesTC, 4);
  const totalPartes = partes.reduce((s, p) => s + p.valor, 0) || 1;

  // En computadora: tarjeta a la izquierda (fija) y consumos a la derecha.
  const col = h('div', { class: 'columna' });
  const raiz = h('div', { class: 'pantalla con-barra detalle' },
    h('aside', { class: 'lateral' }, volver,
      h('h1', { class: 'solo-lector' }, NOMBRE_TC[t.id] || t.nombre),
      tarjetaVisual(t, false),
      h('section', { class: 'panel resumen-tc' },
        esHormiga ? null : h('div', { class: 'linea' }, h('span', { class: 'suave' }, 'Próximo vencimiento'), estadoPill(t.proximoVence, t.pendiente)),
        h('div', { class: 'linea' }, h('span', { class: 'suave' }, esHormiga ? 'Gastos del mes' : 'Consumos por pagar'), h('strong', {}, String(porPagar))),
        duenioTC(t) ? h('div', { class: 'linea' }, h('span', { class: 'suave' }, 'Titular'),
          h('span', { class: 'titular' }, avatar(duenioTC(t), 'chico'), duenioTC(t))) : null,
        partes.length ? h('div', { class: 'resumen-conceptos' },
          h('p', { class: 'etq' }, 'En qué se usó'),
          barraPartes(partes.map((p, i) => ({ ...p, clase: `d${i}` }))),
          h('ul', { class: 'resumen-leyenda' }, partes.map((p, i) => h('li', { title: `${p.etiqueta}: ${soles(p.valor)}` },
            h('i', { class: `punto d${i}`, 'aria-hidden': 'true' }), h('span', {}, p.etiqueta),
            h('span', { class: 'suave' }, `${Math.round((p.valor / totalPartes) * 100)}%`), h('strong', {}, soles(p.valor)))))) : null)), col);

  if (estado.mensajeTarjeta) {
    col.append(h('div', { class: 'mensaje ' + (estado.mensajeTarjeta.tipo || '') , role: 'status' }, estado.mensajeTarjeta.texto));
    estado.mensajeTarjeta = null;
  }

  const todos = [];
  const barra = h('div', { class: 'barra-seleccion', hidden: true });
  const actualizarBarra = () => {
    const sel = todos.filter((c) => estado.seleccion.has(c.fila) && marcable(c));
    if (!sel.length) {
      salirSuave(barra, () => { if (!todos.some((c) => estado.seleccion.has(c.fila) && marcable(c))) { barra.hidden = true; barra.replaceChildren(); } });
      return;
    }
    const total = sel.reduce((s, c) => s + c.monto, 0);
    barra.classList.remove('sale-suave');
    barra.hidden = false;
    barra.replaceChildren(
      h('span', {}, `${sel.length} ${sel.length === 1 ? 'seleccionado' : 'seleccionados'} · ${soles(total)}`),
      h('button', { type: 'button', class: 'boton primario', onclick: () => {
        estado.seleccion = new Set();
        col.querySelectorAll('.consumo input[type="checkbox"]').forEach((x) => { x.checked = false; });
        actualizarBarra();
        conDeshacer(`${sel.length === 1 ? '1 gasto marcado como pagado' : `${sel.length} gastos marcados como pagados`} · ${soles(total)}`, sel.map((c) => c.fila), () => marcarPagados(t, sel));
      } }, 'Marcar pagados'));
  };

  const grupos = t.estados || [];
  if (!grupos.length || grupos.every((g) => !(g.consumos || []).length)) {
    col.append(vacio(esHormiga ? 'Sin gastos hormiga este mes.' : 'No hay consumos pendientes.'));
  }

  const botonesGrupo = [];
  const montoMax = Math.max(1, ...grupos.flatMap((g) => (g.consumos || []).map((c) => Math.abs(c.monto) || 0)));
  for (const g of grupos) {
    const consumos = g.consumos || [];
    if (!consumos.length) continue;
    todos.push(...consumos);
    const pendientes = consumos.filter(marcable);
    const titulo = esHormiga ? nombreMesClave(mesActual()) : g.vence ? `Vence ${fechaCorta(g.vence)}` : 'Sin fecha de vencimiento';
    const zona = h('div', { class: 'acciones' });
    if (pendientes.length && !esHormiga) {
      // Con búsqueda o filtro puesto, el botón actúa solo sobre lo que se ve.
      const aLaVista = () => pendientes.filter((c) => { const li = zona.parentElement?.querySelector(`li[data-fila="${c.fila}"]`); return !li?.hidden && !li?.classList.contains('yendose'); });
      const boton = h('button', { type: 'button', class: 'boton', onclick: () => {
        const lista = aLaVista();
        if (!lista.length) return;
        const suma = lista.reduce((s, c) => s + c.monto, 0);
        boton.hidden = true;
        conDeshacer(`${lista.length === 1 ? '1 gasto marcado como pagado' : `${lista.length} gastos marcados como pagados`} · ${soles(suma)}`, lista.map((c) => c.fila), () => marcarPagados(t, lista));
        setTimeout(() => { if (boton.isConnected) botonesGrupo.forEach((f) => f()); }, 6400);
      } }, 'Marcar todo pagado');
      zona.append(boton);
      botonesGrupo.push(() => {
        const lista = aLaVista();
        boton.hidden = !lista.length;
        boton.textContent = lista.length === pendientes.length ? 'Marcar todo pagado'
          : `Marcar ${lista.length === 1 ? 'este' : `estos ${lista.length}`} · ${soles(lista.reduce((s, c) => s + c.monto, 0))}`;
      });
    }
    const dias = !esHormiga && g.vence ? diasEntre(hoyISO(), g.vence) : null;
    const pill = dias == null ? null
      : dias < 0 ? h('span', { class: 'estado-pill vencido' }, `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`)
        : dias <= 7 ? h('span', { class: 'estado-pill pronto' }, dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`)
          : h('span', { class: 'estado-pill al-dia' }, `Faltan ${dias} días`);
    col.append(h('section', { class: 'bloque grupo' + (dias != null && dias < 0 && pendientes.length ? ' vencido' : '') },
      h('div', { class: 'grupo-cabecera' },
        h('div', {}, pill, h('h2', {}, titulo),
          h('p', { class: 'suave' }, [!esHormiga && g.pago ? `Pago ${fechaCorta(g.pago)}` : null,
            `${consumos.length} ${esHormiga ? 'gasto' : 'consumo'}${consumos.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')),
          // Cuánto puso cada persona en este grupo: para saber de qué bolsillo sale el pago.
          (() => {
            const porPersona = new Map();
            for (const c of consumos) { if (esHormiga || c.estado !== 'Pagado') { const n = (c.responsable || '').split(' ')[0] || 'Sin nombre'; porPersona.set(n, (porPersona.get(n) || 0) + (Number(c.monto) || 0)); } }
            if (!porPersona.size) return null;
            return h('div', { class: 'grupo-personas' }, [...porPersona].sort((a, b) => b[1] - a[1]).map(([n, v]) =>
              h('span', { class: 'gp-chip', title: `${n}: ${soles(v)}` }, avatar(n, 'mini'), h('b', {}, n), h('span', {}, soles(v)))));
          })()),
        h('div', { class: 'derecha' }, h('strong', { class: 'monto-medio' }, soles(esHormiga ? g.total : g.pendiente)),
          !esHormiga && g.total !== g.pendiente ? h('p', { class: 'suave' }, `de ${soles(g.total)}`) : null)),
      zona,
      h('ul', { class: 'lista consumos' }, consumos.flatMap((c, k) => {
        // Antes del primer consumo de cada día va una franja con la fecha y lo gastado ese día.
        const nuevoDia = k === 0 || consumos[k - 1].fecha !== c.fecha;
        const delDia = nuevoDia ? consumos.filter((x) => x.fecha === c.fecha) : null;
        const franja = nuevoDia ? h('li', { class: 'dia', 'data-dia': c.fecha || '' },
          h('span', {}, c.fecha ? deISO(c.fecha).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin fecha'),
          h('strong', { class: 'dia-total' }, soles(delDia.reduce((s, x) => s + (Number(x.monto) || 0), 0)))) : null;
        const puede = marcable(c) && !esHormiga;
        const caja = h('input', { type: 'checkbox', checked: estado.seleccion.has(c.fila), disabled: !puede,
          'aria-label': `Seleccionar ${c.descripcion}` });
        caja.addEventListener('change', () => {
          if (caja.checked) estado.seleccion.add(c.fila); else estado.seleccion.delete(c.fila);
          actualizarBarra();
        });
        const etiquetaEstado = enEspera(c) ? 'En espera' : c.estado === 'Pagado' ? 'Pagado' : '';
        const sub = [c.concepto, esHormiga ? c.medio : ''].filter(Boolean).join(' · ');
        const fila = h('li', { 'data-fila': String(c.fila), 'data-dia': c.fecha || '', 'data-concepto': c.concepto || 'Sin concepto', 'data-monto': String(Number(c.monto) || 0),
          'data-texto': normalizar(`${c.descripcion} ${limpiarComercio(c.descripcion)} ${c.concepto || ''} ${esHormiga ? c.medio || '' : ''}`) },
          h('label', { class: 'consumo' + (puede ? '' : ' inactivo'), title: c.descripcion,
            style: `--p: ${Math.round(Math.sqrt(Math.abs(c.monto || 0) / montoMax) * 100)}%` }, // raíz: un consumo muy grande no aplasta a los demás
          esHormiga ? null : caja,
          catIco(c.concepto),
          c.responsable ? avatar(c.responsable, 'mini quien') : null,
          h('div', { class: 'consumo-texto', onclick: (ev) => {
            // En pantallas táctiles no hay lápiz: tocar el nombre abre la edición.
            if (enEspera(c) || !matchMedia('(hover: none)').matches) return;
            ev.preventDefault(); editarConsumo(t, c);
          } }, h('span', {}, limpiarComercio(c.descripcion)), h('span', { class: 'suave' }, sub)),
          enEspera(c) ? null : h('button', { type: 'button', class: 'boton-editar', title: 'Editar', 'aria-label': `Editar ${limpiarComercio(c.descripcion)}`,
            onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); editarConsumo(t, c); } }, icono('lapiz')),
          h('div', { class: 'derecha' }, h('strong', {}, soles(c.monto)),
            etiquetaEstado ? h('span', { class: 'etiqueta-estado' }, etiquetaEstado) : null)));
        return franja ? [franja, fila] : [fila];
      }))));
  }
  if (todos.length > 6) {
    const cuenta = h('span', { class: 'buscador-cuenta', 'aria-live': 'polite' });
    const sinResultados = vacio('Ningún consumo coincide.');
    sinResultados.querySelector('.vacio-ico').replaceChildren(icono('buscar'));
    sinResultados.hidden = true;
    const entrada = h('input', { type: 'search', id: 'buscar-consumo', placeholder: 'Buscar por comercio o concepto', 'aria-label': 'Buscar consumo', autocomplete: 'off' });
    let conceptoElegido = null;
    // Filtra por texto y por concepto a la vez; las franjas de cada día muestran solo lo que queda a la vista.
    const filtrar = () => {
      const q = normalizar(entrada.value);
      let visibles = 0;
      col.querySelectorAll('.grupo').forEach((grupo) => {
        let enGrupo = 0;
        const porDia = new Map();
        grupo.querySelectorAll('li[data-texto]').forEach((li) => {
          const ok = (!q || li.dataset.texto.includes(q)) && (!conceptoElegido || li.dataset.concepto === conceptoElegido);
          li.hidden = !ok;
          if (!ok) return;
          enGrupo++;
          porDia.set(li.dataset.dia, (porDia.get(li.dataset.dia) || 0) + Number(li.dataset.monto));
        });
        grupo.querySelectorAll('li.dia').forEach((li) => {
          li.hidden = !porDia.has(li.dataset.dia);
          if (!li.hidden) li.querySelector('.dia-total').textContent = soles(porDia.get(li.dataset.dia));
        });
        grupo.hidden = enGrupo === 0;
        visibles += enGrupo;
      });
      // Con filtro se ve cuánto suma lo encontrado, no solo cuántos son.
      const sumaVisible = [...col.querySelectorAll('li[data-texto]')].reduce((s, li) => s + (li.hidden ? 0 : Number(li.dataset.monto)), 0);
      cuenta.textContent = q || conceptoElegido ? `${visibles} de ${todos.length} · ${soles(sumaVisible)}` : '';
      sinResultados.hidden = visibles > 0;
      botonesGrupo.forEach((f) => f());
    };
    entrada.addEventListener('input', filtrar);
    // Conceptos de esta tarjeta, del que más pesa al que menos
    const porConcepto = new Map();
    for (const c of todos) porConcepto.set(c.concepto || 'Sin concepto', (porConcepto.get(c.concepto || 'Sin concepto') || 0) + (Number(c.monto) || 0));
    const chips = [...porConcepto].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nombre]) => {
      const chip = h('button', { type: 'button', class: 'chip-filtro', 'aria-pressed': 'false', title: `${nombre}: ${soles(porConcepto.get(nombre))}`,
        onclick: () => {
          conceptoElegido = conceptoElegido === nombre ? null : nombre;
          chips.forEach((x) => x.setAttribute('aria-pressed', String(x === chip && conceptoElegido === nombre)));
          filtrar();
        } }, catIco(nombre), h('span', {}, nombre));
      return chip;
    });
    col.prepend(h('div', { class: 'buscador' }, icono('buscar'), entrada, cuenta),
      chips.length > 1 ? h('div', { class: 'chips-filtro', role: 'group', 'aria-label': 'Filtrar por concepto' }, chips) : null);
    col.append(sinResultados);
  }
  raiz.append(barra);
  actualizarBarra();
  activarSeleccionArrastrando(col, todos, marcable, actualizarBarra);
  return raiz;
}

// Como en una tabla: se aprieta una casilla y se arrastra hacia abajo para marcar varias; con Mayús + clic se marca un rango.
function activarSeleccionArrastrando(col, todos, marcable, actualizarBarra) {
  let pintando = null; // { valor, tocadas:Set }
  let ultima = null;
  const cajaDe = (el) => el?.closest?.('li[data-fila]')?.querySelector('input[type="checkbox"]:not(:disabled)') || null;
  const aplicar = (caja, valor) => {
    if (!caja || pintando.tocadas.has(caja)) return;
    pintando.tocadas.add(caja);
    caja.checked = valor;
    const fila = Number(caja.closest('li').dataset.fila);
    if (valor) estado.seleccion.add(fila); else estado.seleccion.delete(fila);
    caja.closest('.consumo')?.classList.add('tocada');
    setTimeout(() => caja.closest('.consumo')?.classList.remove('tocada'), 260);
    actualizarBarra();
  };
  col.addEventListener('pointerdown', (ev) => {
    const caja = ev.target.closest?.('input[type="checkbox"]');
    if (!caja || caja.disabled || ev.button > 0) return;
    pintando = { valor: !caja.checked, tocadas: new Set(), id: ev.pointerId };
    aplicar(caja, pintando.valor);
    try { col.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
  });
  col.addEventListener('pointermove', (ev) => {
    if (!pintando) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    aplicar(cajaDe(el), pintando.valor);
  });
  const soltar = () => { if (pintando) setTimeout(() => { pintando = null; }, 0); };
  col.addEventListener('pointerup', soltar);
  col.addEventListener('pointercancel', soltar);
  col.addEventListener('click', (ev) => {
    const caja = ev.target.closest?.('input[type="checkbox"]');
    if (!caja) return;
    if (pintando?.tocadas.has(caja)) { ev.preventDefault(); return; } // el clic no deshace lo que hizo el arrastre
    if (ev.shiftKey && ultima && ultima !== caja) {
      const cajas = [...col.querySelectorAll('li[data-fila] input[type="checkbox"]:not(:disabled)')];
      const a = cajas.indexOf(ultima), b = cajas.indexOf(caja);
      if (a >= 0 && b >= 0) {
        const valor = caja.checked;
        pintando = { valor, tocadas: new Set() };
        cajas.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => aplicar(x, valor));
        pintando = null;
      }
    }
    ultima = caja;
  });
}

// Texto para el resultado de marcarPagado, agrupado por motivo de las filas omitidas.
function mensajeMarcado(res, id) {
  const r = res?.resultados?.[id];
  if (r?.tipo === 'enviado') {
    const actualizadas = r.datos?.actualizadas ?? 0;
    const porMotivo = new Map();
    for (const o of r.datos?.omitidas || []) {
      const m = o?.motivo || 'motivo desconocido';
      porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
    }
    const partes = [];
    if (actualizadas || !porMotivo.size) partes.push((actualizadas === 1 ? 'Listo: 1 gasto marcado como pagado.' : `Listo: ${actualizadas} gastos marcados como pagados.`));
    let hayError = false;
    for (const [motivo, n] of porMotivo) {
      if (motivo === 'ya estaba pagado') {
        partes.push(n === 1 ? '1 ya estaba pagado.' : `${n} ya estaban pagados.`);
      } else {
        hayError = true;
        const texto = motivo === 'la fila cambió' ? 'ese gasto cambió mientras tanto; revisa y vuelve a intentar' : motivo;
        partes.push(n === 1 ? `1 no se marcó: ${texto}.` : `${n} no se marcaron: ${texto}.`);
      }
    }
    return { tipo: hayError ? 'error' : actualizadas ? 'ok' : '', texto: partes.join(' ') };
  }
  if (r?.tipo === 'error') return { tipo: 'error', texto: `${r.error.message} Quedó en "Por revisar".` };
  if (!cola.persistente()) {
    return { tipo: 'error', texto: 'No se pudo guardar: no cierres la app hasta que vuelva la señal.' };
  }
  if (res?.detenido === 'no_autorizado') return { tipo: '', texto: 'Quedó guardado aquí. Inicia sesión para enviarlo.' };
  return { tipo: '', texto: 'Se marcarán como pagados cuando vuelva la señal.' };
}

async function marcarPagados(t, consumos) {
  const email = emailSesion();
  if (!email) {
    estado.mensajeTarjeta = { tipo: 'error', texto: 'Inicia sesión para marcar pagos.' };
    navegar();
    return;
  }
  const datos = {
    idCliente: uuid(),
    hoja: t.hoja,
    filas: consumos.map((c) => c.fila),
    verificar: consumos.map((c) => ({ fila: c.fila, monto: c.monto, descripcion: c.descripcion })),
  };
  try {
    await cola.encolar('marcarPagado', datos, email);
  } catch {
    estado.mensajeTarjeta = { tipo: 'error', texto: 'No se pudo guardar. Intenta de nuevo.' };
    navegar();
    return;
  }
  estado.seleccion = new Set();
  const ruta = location.hash;
  const envio = procesarHasta(datos.idCliente);
  // Con señal débil no se deja la pantalla en 'Procesando…': a los 8 s se avisa y el envío sigue por detrás.
  const aTiempo = await Promise.race([envio.then(() => true, () => true), esperar(8000).then(() => false)]);
  if (aTiempo) {
    estado.mensajeTarjeta = mensajeMarcado(await envio.catch(() => null), datos.idCliente);
    navegar();
    return;
  }
  estado.mensajeTarjeta = { tipo: '', texto: 'Quedó guardado aquí. Se está enviando…' };
  navegar();
  envio.catch(() => null).then((res) => {
    if (location.hash !== ruta) return;
    estado.mensajeTarjeta = mensajeMarcado(res, datos.idCliente);
    navegar();
  });
}

// ---------- Pantalla: Presupuesto ----------

// Si no hay lista de meses guardada, prueba meses cercanos hasta que uno exista y trae d.meses.
async function buscarMeses(mes) {
  const candidatos = [];
  for (let k = 1; k <= 24; k++) candidatos.push(sumarMes(mes, -k), sumarMes(mes, k));
  for (let i = 0; i < candidatos.length; i += 6) {
    const lote = candidatos.slice(i, i + 6);
    const res = await Promise.allSettled(lote.map((c) => llamarApi('presupuesto', { mes: c })));
    const ok = res.find((x) => x.status === 'fulfilled' && x.value?.meses?.length);
    if (ok) {
      guardarCache('meses', ok.value.meses);
      guardarCache('presupuesto:' + ok.value.mes, ok.value);
      return ok.value.meses;
    }
    // Si falla por otra causa (sin señal, sesión) no se sigue probando.
    if (res.some((x) => x.status === 'rejected' && x.reason?.codigo !== 'datos_invalidos')) return [];
  }
  return [];
}

async function vistaPresupuesto() {
  const mes = estado.mesPres || mesActual();
  let meses = leerCache('meses')?.datos || [];
  let r;
  try {
    r = await cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes);
  } catch (e) {
    if (e.codigo === 'no_autorizado' || e.codigo === 'sin_configurar') throw e;
    if (e.codigo === 'datos_invalidos') {
      if (!meses.length) meses = await buscarMeses(mes);
      // El mes de hoy no está: salta al mes disponible más cercano.
      if (!estado.mesPres && meses.length) {
        const cercano = meses.reduce((a, b) => (Math.abs(cmpMes(b.clave, mes)) < Math.abs(cmpMes(a.clave, mes)) ? b : a));
        if (cercano.clave !== mes) { estado.mesPres = cercano.clave; return vistaPresupuesto(); }
      }
      return h('div', { class: 'pantalla' },
        h('header', { class: 'cabecera-fila' }, h('div', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
          selectorMes(meses, mes, nombreMesClave(mes))),
        meses.length ? vacio('Este mes no está en el presupuesto.')
          : estadoError({ message: 'Este mes no está en el presupuesto y no se pudo leer la lista de meses.' }, () => { estado.mesPres = mes; navegar(); }));
    }
    // Sin señal (u otro error) y este mes no está guardado: se muestra el selector con los meses
    // guardados y la próxima vez Presupuesto vuelve al mes actual.
    estado.mesPres = null;
    return h('div', { class: 'pantalla' },
      h('header', { class: 'cabecera-fila' }, h('div', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
        selectorMes(meses, mes, nombreMesClave(mes))),
      estadoError(e, () => { estado.mesPres = mes; navegar(); }));
  }
  marcarDatos(r);
  const d = r.datos;
  if (d.meses?.length) guardarCache('meses', d.meses);
  const tot = d.totales || {};
  const fijos = fijosDe(d.filas);
  const resumenFijos = h('span', { class: 'pill resumen-fijos' });
  const pintarResumenFijos = () => {
    const n = fijos.filter((f) => f.pagado).length;
    resumenFijos.textContent = `${n} de ${fijos.length} pagados`;
    resumenFijos.classList.toggle('ok', n > 0 && n === fijos.length);
  };
  pintarResumenFijos();
  const seccion = (clave, titulo, totalEtiqueta, total) => {
    const filas = (d.filas || []).filter((f) => f.seccion === clave);
    if (!filas.length && !total) return null;
    const max = Math.max(...filas.map((f) => Math.abs(f.monto || 0)), 1);
    const ordenadas = clave === 'gastos' ? [...filas].sort((a, b) => (b.monto || 0) - (a.monto || 0)) : filas;
    if (clave === 'ahorros' && !(total > 0)) {
      return h('section', { class: 'panel seccion-pres seccion-ahorros sin-ahorro' },
        h('div', { class: 'panel-cab' }, tituloSeccion(titulo), h('strong', { class: 'cifra-cab' }, soles(0))),
        h('div', { class: 'ahorro-vacio' },
          h('span', { class: 'ahorro-vacio-ico', 'aria-hidden': 'true' }, icono('meta')),
          h('strong', {}, 'Sin ahorro este mes'),
          libre > 0 ? h('span', { class: 'pill ok' }, `${soles(libre)} libres`) : null,
          filas.length ? h('ul', { class: 'ahorro-metas' }, filas.map((f) => h('li', {}, nombreLinea(f.concepto)))) : null));
    }
    return h('section', { class: `panel seccion-pres seccion-${clave}` },
      h('div', { class: 'panel-cab' }, tituloSeccion(titulo),
        clave === 'gastos' && fijos.length ? resumenFijos : null,
        h('strong', { class: 'cifra-cab' }, soles(total))),
      h('ul', { class: 'filas-pres' }, ordenadas.map((f) => {
        const marcable = fijos.includes(f);
        const nota = h('small', { class: 'nota-pagado' }, f.pagadoNota || '');
        const li = h('li', { class: [f.monto ? '' : 'cero', f.pagado && marcable ? 'pagado' : ''].join(' ').trim(), 'data-nombre': normalizar(nombreLinea(f.concepto)), 'data-marcable': marcable ? '1' : null, 'data-linea': clave === 'gastos' && !f.esTarjeta ? normalizar(nombreLinea(f.concepto)) : null, 'data-plan': String(Math.abs(f.monto || 0)) },
          h('div', { class: 'fila-pres-top' },
            h('span', { class: 'fila-pres-nombre' },
              marcable ? botonFijo(f, d.mes, (x) => { li.classList.toggle('pagado', !!x.pagado); nota.textContent = x.pagado ? (x.pagadoNota || '') : ''; pintarResumenFijos(); }) : null,
              h('span', { title: f.concepto }, nombreLinea(f.concepto), marcable ? nota : null)),
            h('span', {}, f.monto && total ? h('small', { class: 'pct' }, `${Math.round((f.monto / total) * 100)}%`) : null,
              motorNuevo() && clave !== 'ingresos' && f.fila && !f.esTarjeta && !(f.monto < 0) && emailSesion()
                ? h('button', { type: 'button', class: 'monto-editable', title: 'Clic para cambiar el monto', 'aria-label': `Cambiar monto de ${nombreLinea(f.concepto)}, ahora ${soles(f.monto)}`,
                  onclick: (ev) => editarEnLinea(ev.currentTarget, d.mes, f) }, soles(f.monto))
                : soles(f.monto))),
          h('div', { class: 'barra-pres', 'aria-hidden': 'true' }, h('i', { 'data-w': `${Math.round((Math.abs(f.monto || 0) / max) * 100)}%` })));
        return li;
      })));
  };

  // Lo gastado de verdad en el mes, por concepto: se cruza con cada línea del plan que tenga el mismo nombre.
  const pintarLlevas = (raizPres) => cargarRapido('personas', { mes: d.mes }, 'personas:' + d.mes).then((rp) => {
    const real = new Map();
    for (const per of rp?.datos?.personas || []) for (const x of per.conceptos || []) {
      const k = normalizar(x.concepto || '');
      real.set(k, (real.get(k) || 0) + (Number(x.monto) || 0));
    }
    raizPres.querySelectorAll('li[data-linea]').forEach((li) => {
      const linea = li.dataset.linea; const plan = Number(li.dataset.plan) || 0;
      if (!linea || !plan || li.querySelector('.llevas')) return;
      const clave = [...real.keys()].find((k) => k === linea || (linea.length >= 5 && k.startsWith(linea)) || (k.length >= 5 && linea.startsWith(k)));
      if (!clave) return;
      const gastado = real.get(clave); const pct = (gastado / plan) * 100;
      const tono = pct > 100 ? 'pasado' : pct >= 80 ? 'justo' : 'bien';
      li.querySelector('.fila-pres-nombre > span:last-child')?.append(h('small', { class: `llevas ${tono}` }, pct > 100 ? `Te pasaste: ${soles(gastado)} de ${soles(plan)}` : `Llevas ${soles(gastado)} de ${soles(plan)}`));
      const barra = li.querySelector('.barra-pres');
      const ancho = parseFloat(barra?.querySelector('i')?.dataset.w) || 0;
      if (barra) { const b = h('b', { class: `real ${tono}` }); barra.append(b); requestAnimationFrame(() => requestAnimationFrame(() => { b.style.width = `${Math.min(100, (ancho * Math.min(pct, 100)) / 100)}%`; })); }
    });
  }).catch(() => {});

  // Cómo se reparte el ingreso: gastos, ahorros y lo que queda libre.
  const gastos = Math.max(tot.gastos || 0, 0);
  const ahorros = Math.max(tot.ahorros || 0, 0);
  const libre = Math.max(tot.saldo || 0, 0);
  const base = Math.max(tot.ingresos || 0, gastos + ahorros, 1);
  const pct = Math.max(0, Math.min(100, Math.round(((gastos + ahorros) / base) * 100)));
  const partes = [
    { etiqueta: 'Gastos', valor: gastos, clase: 'r-gastos' },
    { etiqueta: 'Ahorros', valor: ahorros, clase: 'r-ahorros' },
    { etiqueta: 'Saldo libre', valor: libre, clase: 'r-libre' },
  ];
  const mesNombre = (nombreMesClave(d.mes) || d.etiquetaMes || '').split(' ')[0].toLowerCase();
  const deltas = { ingresos: h('span', { class: 'hero-delta' }), gastos: h('span', { class: 'hero-delta' }), ahorros: h('span', { class: 'hero-delta' }), saldo: h('span', { class: 'hero-delta' }) };
  // Gráfico de saldo por mes, pensado para entenderse de un vistazo:
  //  - pocos meses (los dos anteriores, el elegido y los cuatro siguientes), con su nombre y el monto escrito encima;
  //  - una línea de cero: lo que sobra sube, lo que falta baja y va en rojo;
  //  - los meses que todavía no tienen ingresos cargados en el Sheets se marcan como "sin datos" en vez de
  //    aparecer como una gran pérdida.
  const todosMeses = d.meses || meses;
  const CUANTOS = matchMedia('(max-width: 640px)').matches ? 5 : 7;
  const iElegido = Math.max(0, todosMeses.findIndex((m) => m.clave === d.mes));
  const desde = Math.max(0, Math.min(iElegido - (CUANTOS === 5 ? 1 : 2), todosMeses.length - CUANTOS));
  const ventana = todosMeses.slice(desde, desde + CUANTOS);
  const ABR_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const datosMes = new Map([[d.mes, { saldo: tot.saldo || 0, ingresos: tot.ingresos || 0 }]]);
  const plano = h('div', { class: 'mb-plano' });
  const leyendaMeses = h('ul', { class: 'mb-leyenda' });
  const pintarBarras = () => {
    const conDatos = ventana.map((m) => datosMes.get(m.clave)).filter((x) => x && x.ingresos > 0).map((x) => x.saldo);
    const maxSobra = Math.max(0, ...conDatos);
    const maxFalta = Math.max(0, ...conDatos.map((v) => -v));
    const rango = (maxSobra + maxFalta) || 1;
    plano.style.setProperty('--cero', `${((maxFalta / rango) * 100).toFixed(1)}%`); // altura de la línea de cero
    const vistos = new Set();
    plano.replaceChildren(...ventana.map((m) => {
      const x = datosMes.get(m.clave);
      const nMes = Number(m.clave.slice(5, 7));
      const tipo = !x ? 'cargando' : !(x.ingresos > 0) ? 'nodato' : x.saldo < 0 ? 'falta' : 'sobra';
      vistos.add(tipo);
      const alto = tipo === 'sobra' || tipo === 'falta' ? Math.max(3, (Math.abs(x.saldo) / rango) * 100) : 0;
      const texto = tipo === 'cargando' ? '…' : tipo === 'nodato' ? 'sin datos'
        : `${x.saldo < 0 ? '−' : ''}${solesCorto(Math.abs(x.saldo))}`;
      const explicacion = tipo === 'nodato' ? `${nombreMesClave(m.clave)}: todavía no tiene ingresos cargados`
        : tipo === 'cargando' ? `${nombreMesClave(m.clave)}: cargando`
          : `${nombreMesClave(m.clave)}: ${x.saldo < 0 ? 'faltan' : 'sobran'} ${soles(Math.abs(x.saldo))}`;
      return h('button', { type: 'button', class: `mb-col ${tipo}${m.clave === d.mes ? ' actual' : ''}`, style: `--h: ${alto.toFixed(1)}%`,
        title: explicacion, 'aria-label': explicacion, 'aria-current': m.clave === d.mes ? 'true' : null,
        onclick: () => {
          if (m.clave === d.mes) return;
          estado.sentido = cmpMes(m.clave, d.mes) > 0 ? 'adelante' : 'atras';
          estado.mesPres = m.clave;
          navegar();
        } },
        h('span', { class: 'mb-zona' }, h('i', { class: 'mb-barra' }), h('b', { class: 'mb-valor' }, texto)),
        h('span', { class: 'mb-mes' }, ABR_MES[nMes - 1] || '',
          nMes === 1 || m === ventana[0] ? h('small', {}, m.clave.slice(0, 4)) : null,
          m.clave === mesActual() ? h('em', {}, 'hoy') : null));
    }));
    // La leyenda solo nombra lo que de verdad aparece en el gráfico.
    const nombres = { sobra: 'Sobra', falta: 'Falta', nodato: 'Sin ingresos cargados' };
    leyendaMeses.replaceChildren(...['sobra', 'falta', 'nodato'].filter((t) => vistos.has(t))
      .map((t) => h('li', {}, h('i', { class: `mb-punto ${t}`, 'aria-hidden': 'true' }), nombres[t])));
  };
  // De los otros meses se usa lo guardado en el equipo; lo que falte se pide de a tres, sin frenar la pantalla.
  const faltan = [];
  for (const m of ventana) {
    if (m.clave === d.mes) continue;
    const guardado = leerCache('presupuesto:' + m.clave)?.datos?.totales;
    if (guardado) datosMes.set(m.clave, { saldo: guardado.saldo || 0, ingresos: guardado.ingresos || 0 }); else faltan.push(m.clave);
  }
  pintarBarras();
  if (faltan.length && navigator.onLine) {
    const navId = estado.navId;
    (async () => {
      for (let k = 0; k < faltan.length; k += 3) {
        if (navId !== estado.navId) return; // se cambió de pantalla
        await Promise.all(faltan.slice(k, k + 3).map((clave) => cargar('presupuesto', { mes: clave }, 'presupuesto:' + clave)
          .then((x) => { const t = x?.datos?.totales; if (t) datosMes.set(clave, { saldo: t.saldo || 0, ingresos: t.ingresos || 0 }); }).catch(() => {})));
        pintarBarras();
      }
    })();
  }
  const sinIngresos = !(tot.ingresos > 0);
  const hero = h('section', { class: 'hero hero-meses' }, heroFondo(),
    sinIngresos
      ? h('div', { class: 'hero-principal' },
        h('p', { class: 'hero-etq' }, `Saldo final de ${mesNombre}`),
        h('p', { class: 'hero-vacio' }, `${nombreMesClave(d.mes) || 'Este mes'} aún no tiene ingresos cargados.`))
      : h('div', { class: 'hero-principal' },
        h('p', { class: 'hero-etq' }, `Saldo final de ${mesNombre}`),
        h('p', { class: 'hero-monto', 'data-rico': '', 'data-contar': String(tot.saldo || 0) }, soles(0)),
        h('p', { class: 'hero-personal' }, h('span', { class: 'avatares' }, avatar('Pedro'), avatar('Britney')),
          h('span', {}, h('strong', {}, soles(tot.saldoPersonal)), ' c/u'))),
    h('div', { class: 'meses-barras', role: 'group', 'aria-label': 'Lo que sobra o falta cada mes' },
      h('div', { class: 'mb-cab' }, h('span', { class: 'mb-titulo' }, 'Lo que sobra o falta cada mes'), leyendaMeses),
      plano),
    h('ul', { class: 'hero-datos' },
      heroDato('sube', 'Ingresos', soles(tot.ingresos), deltas.ingresos),
      heroDato('baja', 'Gastos', soles(tot.gastos), deltas.gastos),
      heroDato('billetera', 'Ahorros', soles(tot.ahorros), deltas.ahorros),
      heroDato('check', 'Saldo libre', soles(libre), deltas.saldo)));

  // Cambio frente al mes anterior (se completa cuando llegan esos datos, sin frenar la pantalla).
  const listaMeses = d.meses || meses;
  const iMes = listaMeses.findIndex((m) => m.clave === d.mes);
  const previo = iMes > 0 ? listaMeses[iMes - 1] : null;
  if (previo && !sinIngresos) {
    cargarRapido('presupuesto', { mes: previo.clave }, 'presupuesto:' + previo.clave).then((rp) => {
      const antes = rp?.datos?.totales;
      if (!antes) return;
      const corto = (nombreMesClave(previo.clave) || '').slice(0, 3).toLowerCase();
      const poner = (el, ahora, anterior, subirEsBueno = true) => {
        if (!anterior || !Number.isFinite(ahora)) return;
        const dif = ((ahora - anterior) / Math.abs(anterior)) * 100;
        if (Math.abs(dif) < 0.5) { el.textContent = `Igual que en ${corto}`; return; }
        el.textContent = `${dif > 0 ? '▲' : '▼'} ${Math.abs(dif).toFixed(0)}% vs ${corto}`;
        el.classList.add('delta', (dif > 0) === subirEsBueno ? 'bien' : 'mal');
      };
      poner(deltas.ingresos, tot.ingresos, antes.ingresos);
      poner(deltas.gastos, tot.gastos, antes.gastos, false);
      poner(deltas.ahorros, tot.ahorros, antes.ahorros);
      poner(deltas.saldo, libre, Math.max(antes.saldo || 0, 0));
    }).catch(() => {});
  }

  const secciones = [
    seccion('ingresos', 'Ingresos', 'Total ingresos', tot.ingresos),
    seccion('ahorros', 'Ahorros', 'Total ahorros', tot.ahorros),
    seccion('gastos', 'Gastos', 'Total gastos', tot.gastos),
  ];
  secciones.forEach((el, i) => { if (el) { el.classList.add('revelar'); el.style.setProperty('--i', String(i)); } });

  if (secciones[2]) { pintarLlevas(secciones[2]); controlesGastos(secciones[2]); }
  // Ahorros: una sola lista por meta. De cada una se ve cuánto lleva guardado en total, cuánto se puso este mes
  // (se cambia con un clic) y en cuántos meses se aportó. Arriba, lo ahorrado este mes y el total guardado.
  if (secciones[1] && motorNuevo()) {
    cargarRapido('ahorros', { mes: d.mes }, 'ahorros:' + d.mes).then((ra) => {
      const sec = secciones[1];
      if (!ra?.datos?.metas || sec.querySelector('.metas')) return;
      const lineas = (d.filas || []).filter((f) => f.seccion === 'ahorros');
      const porNombre = new Map(ra.datos.metas.map((m) => [normalizar(m.concepto), m]));
      const metas = lineas.map((f) => ({ f, m: porNombre.get(normalizar(f.concepto)) || { acumulado: f.monto || 0, delMes: f.monto || 0, meses: [] } }));
      for (const m of ra.datos.metas) if (!lineas.some((f) => normalizar(f.concepto) === normalizar(m.concepto))) metas.push({ f: null, m });
      if (!metas.length) return;
      const total = metas.reduce((x, y) => x + (y.m.acumulado || 0), 0);
      const delMes = metas.reduce((x, y) => x + (y.m.delMes || 0), 0);
      const mayor = Math.max(...metas.map((y) => y.m.acumulado || 0), 1);
      const editable = emailSesion();
      // Se quita lo anterior (lista del mes, estado vacío y etiquetas sueltas) y queda solo la cabecera.
      [...sec.children].forEach((el) => { if (!el.classList.contains('panel-cab')) el.remove(); });
      sec.classList.remove('sin-ahorro');
      sec.append(
        h('div', { class: 'ahorro-resumen' },
          h('div', {}, h('span', { class: 'suave' }, 'Este mes'), h('strong', { 'data-contar': String(delMes) }, soles(0))),
          h('div', {}, h('span', { class: 'suave' }, 'Guardado en total'), h('strong', { class: 'ahorro-total', 'data-contar': String(total) }, soles(0)))),
        h('ul', { class: 'metas' }, metas.sort((a, b) => (b.m.acumulado || 0) - (a.m.acumulado || 0)).map(({ f, m }, k) => {
          const aportes = (m.meses || []).filter((x) => x.monto > 0);
          const nombre = nombreLinea(f?.concepto || m.concepto);
          const vacia = !(m.acumulado > 0);
          return h('li', { class: vacia ? 'meta vacia' : 'meta', style: `--i: ${k}`, title: aportes.map((x) => `${x.etiqueta}: ${soles(x.monto)}`).join('\n') },
            h('div', { class: 'meta-top' }, h('span', { class: 'meta-nombre' }, nombre),
              h('strong', { 'data-contar': String(m.acumulado || 0) }, soles(0))),
            h('div', { class: 'gp-barra' }, h('i', { 'data-w': `${Math.round(((m.acumulado || 0) / mayor) * 100)}%` })),
            h('div', { class: 'meta-pie' },
              h('span', {}, 'Este mes ',
                f && editable && !(f.monto < 0)
                  ? h('button', { type: 'button', class: 'monto-editable', title: 'Clic para cambiar lo de este mes', 'aria-label': `Cambiar el ahorro de este mes en ${nombre}`, onclick: (ev) => editarEnLinea(ev.currentTarget, d.mes, f) }, soles(f.monto || 0))
                  : h('b', {}, soles(m.delMes || 0))),
              h('span', { class: 'suave' }, vacia ? 'Aún sin aportes' : aportes.length === 1 ? `1 aporte (${aportes[0].etiqueta.replace('-', ' ')})` : aportes.length ? `${aportes.length} aportes desde ${aportes[0].etiqueta.replace('-', ' ')}` : '')));
        })));
      animarVista(sec);
    }).catch(() => {});
  }
  return h('div', { class: 'pantalla presupuesto' },
    h('header', { class: 'cabecera-fila' },
      h('div', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
      selectorMes(d.meses || meses, d.mes, nombreMesClave(d.mes) || d.etiquetaMes)),
    hero,
    tot.saldo < 0 && !sinIngresos ? h('p', { class: 'mensaje error' }, `Los gastos y ahorros superan a los ingresos por ${soles(-tot.saldo)}.`) : null,
    h('div', { class: 'rejilla-pres' }, secciones[0], secciones[1]),
    secciones[2]);
}

function cmpMes(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
}

function selectorMes(meses, mes, etiqueta, alElegir) {
  const i = meses.findIndex((m) => m.clave === mes);
  // Si el mes mostrado no está en la lista, se ofrece el más cercano hacia atrás y hacia adelante.
  const anterior = i > 0 ? meses[i - 1] : i < 0 ? [...meses].reverse().find((m) => cmpMes(m.clave, mes) < 0) || null : null;
  const siguiente = i >= 0 ? (i < meses.length - 1 ? meses[i + 1] : null) : meses.find((m) => cmpMes(m.clave, mes) > 0) || null;
  const ir = (m) => () => {
    estado.sentido = cmpMes(m.clave, mes) > 0 ? 'adelante' : 'atras';
    if (alElegir) alElegir(m); else estado.mesPres = m.clave;
    navegar();
  };
  return h('div', { class: 'selector-mes' },
    h('button', { type: 'button', class: 'boton icono-solo', disabled: !anterior, 'aria-label': 'Mes anterior', title: 'Mes anterior',
      onclick: anterior ? ir(anterior) : null }, icono('atras')),
    h('strong', { 'aria-live': 'polite' }, etiqueta),
    h('button', { type: 'button', class: 'boton icono-solo', disabled: !siguiente, 'aria-label': 'Mes siguiente', title: 'Mes siguiente',
      onclick: siguiente ? ir(siguiente) : null }, icono('adelante')));
}

// ---------- Navegación ----------

// Transición entre páginas: el navegador toma una foto de la pantalla que sale y otra de la que entra,
// y las anima según el sentido (adelante, atras, entra a un detalle, sale de él, abre, igual).
// El menú se queda quieto; el panel de color y la tarjeta elegida viajan de una página a la otra.
const ORDEN_RUTAS = { inicio: 0, tarjetas: 1, registrar: 2, presupuesto: 3 };
const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const puedeTransicionar = () => typeof document.startViewTransition === 'function' && !sinMovimiento() && document.visibilityState === 'visible';

function tipoTransicion(antes, ahora) {
  if (estado.sentido) { const s = estado.sentido; estado.sentido = null; return s; }
  if (!antes) return 'abre';
  if (antes === ahora) return 'igual';
  const deDetalle = antes.startsWith('tarjeta-');
  const aDetalle = ahora.startsWith('tarjeta-');
  if (ahora === 'movimientos') return 'adelante';
  if (antes === 'movimientos') return 'atras';
  if (aDetalle) return deDetalle ? 'igual' : 'entra';
  if (deDetalle && ahora === 'tarjetas') return 'sale';
  const a = ORDEN_RUTAS[deDetalle ? 'tarjetas' : antes] ?? 0;
  const b = ORDEN_RUTAS[ahora] ?? 0;
  if (a === b) return 'sale';
  return b > a ? 'adelante' : 'atras';
}

function limpiarNombres() {
  document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => el.style.removeProperty('view-transition-name'));
}
// Marca lo que viaja por separado en la foto: menú, barra de avance, aviso breve, panel de color y tarjeta.
function nombrarParaTransicion(idTarjeta) {
  limpiarNombres();
  const poner = (el, nombre) => { if (el) el.style.viewTransitionName = nombre; };
  poner(document.getElementById('nav'), 'nav');
  poner(document.querySelector('.barra-carga'), 'carga');
  poner(document.querySelector('.tostada'), 'aviso');
  poner(vista.querySelector('.hero'), 'hero');
  if (idTarjeta) {
    // En el carrusel hay copias: viaja la que se tocó o, al volver, la que quedó más al centro.
    const lista = [...vista.querySelectorAll(`a.plastico[href="#tarjeta-${CSS.escape(idTarjeta)}"]`)];
    let el = lista.includes(estado.plasticoClic) ? estado.plasticoClic : null;
    if (!el && lista.length) {
      const centro = innerWidth / 2;
      el = lista.map((x) => { const r = x.getBoundingClientRect(); return [Math.abs(r.left + r.width / 2 - centro), x]; }).sort((a, b) => a[0] - b[0])[0][1];
    }
    poner(el || vista.querySelector('div.plastico'), 'tarjeta');
  }
}

let turnoTransicion = 0;
function conTransicion(tipo, cambio, idTarjeta, nombrar = () => nombrarParaTransicion(idTarjeta)) {
  if (!puedeTransicionar()) { cambio(); return; }
  const turno = ++turnoTransicion;
  const raiz = document.documentElement;
  let hecho = false;
  const una = () => {
    if (hecho) return;
    hecho = true;
    cambio();
    nombrar();
  };
  nombrar();
  raiz.dataset.vt = tipo;
  let t;
  try { t = document.startViewTransition(una); } catch { una(); }
  const terminar = () => {
    if (turno !== turnoTransicion) return;
    delete raiz.dataset.vt;
    limpiarNombres();
  };
  if (!t) { terminar(); return; }
  // Si el navegador no alcanza a tomar la foto, la pantalla cambia igual, sin animación.
  const reloj = setTimeout(() => { if (!hecho) { una(); t.skipTransition(); } }, 700);
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => { clearTimeout(reloj); terminar(); });
}

const RUTAS = { movimientos: vistaMovimientos, inicio: vistaInicio, registrar: vistaRegistrar, tarjetas: vistaTarjetas, presupuesto: vistaPresupuesto };

function marcarNav(ruta) {
  const base = ruta.startsWith('tarjeta') ? 'tarjetas' : ruta === 'movimientos' ? 'inicio' : ruta;
  document.querySelectorAll('.barra-nav a').forEach((a) => {
    if (a.dataset.ruta === base) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.ruta = base;
  const titulos = { inicio: 'Inicio', tarjetas: 'Tarjetas', registrar: 'Nuevo gasto', presupuesto: 'Presupuesto', movimientos: 'Movimientos' };
  document.title = SOLO_GASTO ? 'FinFamily Gasto' : `${titulos[ruta] || titulos[base] || 'Inicio'} · FinFamily`;
  moverIndicador();
}

async function navegar(opciones) {
  const silencioso = opciones?.silencioso === true; // (los eventos del navegador también llegan aquí como argumento)
  const ruta = SOLO_GASTO ? 'registrar' : (location.hash.slice(1) || 'inicio');
  const id = ++estado.navId;
  if (ruta === 'inicio' && estado.rutaVista && estado.rutaVista !== 'inicio') estado.mesInicio = null;
  estado.tsDatos = null;
  estado.motivoDatos = null;
  marcarNav(ruta);
  if (!api.configurado()) { mostrar(pantallaSinConfig()); return; }
  if (!api.emailGuardado() && !api.tokenVigente() && !leerCache('inicio')) {
    estado.rutaVista = null;
    mostrar(pantallaLogin());
    pintarAvisos();
    return;
  }
  let fn = RUTAS[ruta];
  let arg;
  if (ruta.startsWith('tarjeta-')) { fn = vistaTarjeta; arg = ruta.slice('tarjeta-'.length); }
  if (!fn) fn = vistaInicio;
  // Nuevo gasto abre al instante si ya tiene guardadas las listas; si no, también muestra la casa.
  // La pantalla se arma ya. Si tiene datos guardados responde al instante; la casa de carga
  // solo aparece cuando de verdad hay que esperar al Sheets.
  let nodo;
  const armado = Promise.resolve().then(() => fn(arg)).then((n) => { nodo = n; }, (e) => { nodo = vistaError(e); });
  if (!silencioso && (ruta !== 'registrar' || !leerCache('config'))) {
    const actual = vista.querySelector('.pantalla:not(.cargando):not(.login):not(.arranque)');
    if (actual && !puedeTransicionar() && !sinMovimiento()) {
      // Navegadores sin transición de páginas: la pantalla anterior se desvanece.
      actual.classList.add('saliendo');
      await esperar(150);
    } else {
      await Promise.race([armado, esperar(120)]);
    }
    if (id !== estado.navId) return;
    if (!nodo && !vista.querySelector('.arranque')) mostrar(cargando());
  }
  await armado;
  if (id !== estado.navId) return;
  if (silencioso) {
    // Datos nuevos en la misma pantalla: se funden con los anteriores, sin mover la página.
    const altura = window.scrollY;
    const previo = fotoDeCifras(vista);
    const giro = vista.querySelector('.carrusel.infinito')?.posicion?.();
    if (id !== estado.navId) return;
    // Sin foto de transición: nada desaparece ni vuelve a entrar; solo se mueve lo que cambió.
    vista.classList.remove('entrada');
    vista.classList.add('quieta');
    estado.giroCarrusel = giro ?? null;
    mostrar(nodo);
    animarVista(vista, previo);
    estado.giroCarrusel = null;
    window.scrollTo(0, altura);
    pintarAvisos();
    return;
  }
  const antes = estado.rutaVista;
  const tipo = tipoTransicion(antes, ruta);
  // Misma pantalla con otros datos (cambio de mes): las cifras siguen desde lo que mostraban.
  const previoMes = antes === ruta ? fotoDeCifras(vista) : null;
  vista.classList.remove('quieta');
  const idTarjeta = tipo === 'entra' ? ruta.slice('tarjeta-'.length) : tipo === 'sale' && antes?.startsWith('tarjeta-') ? antes.slice('tarjeta-'.length) : null;
  conTransicion(tipo, () => {
    if (id !== estado.navId) return;
    mostrar(nodo);
    estado.rutaVista = nodo.classList?.contains('login') ? null : ruta;
    animarVista(vista, previoMes && previoMes.size ? new Map([...previoMes].filter(([k]) => k.startsWith('[data-contar]'))) : null);
    vista.classList.remove('entrada');
    void vista.offsetWidth;
    vista.classList.add('entrada');
    if (ruta !== 'registrar') window.scrollTo(0, 0);
    pintarAvisos();
    // Mueve el foco al contenido nuevo para que el lector de pantalla anuncie el cambio
    // (Registrar ya enfoca el monto).
    if (estado.irARevisar && ruta === 'inicio') {
      estado.irARevisar = false;
      if (enfocarRevisar()) return;
    }
    if (ruta !== 'registrar') vista.focus({ preventScroll: true });
  }, idTarjeta);
}

// Menú lateral (computadora): se puede ocultar y queda solo una columna de íconos. Se recuerda en el equipo.
function aplicarMenu() {
  let chico = false;
  try { chico = localStorage.getItem('ff:menu') === 'chico'; } catch { /* sin almacenamiento */ }
  document.body.classList.toggle('menu-chico', chico);
}
const MENU_MS = 520; // igual que --menu-dur en estilos.css
function alternarMenu() {
  const cuerpo = document.body;
  const chico = !cuerpo.classList.contains('menu-chico');
  try { localStorage.setItem('ff:menu', chico ? 'chico' : 'ancho'); } catch { /* dura hasta recargar */ }
  cerrarMenusCuenta();
  // El menú cambia de ancho con una transición normal: es chico y está fijo, así que no obliga a recalcular
  // la página en cada cuadro. El contenido cambia de lugar de una sola vez y enseguida se le aplica un
  // desplazamiento que lo deja donde estaba; ese desplazamiento se anima hasta cero. Así la página sigue viva
  // (el carrusel no se detiene) y el movimiento lo hace la tarjeta gráfica.
  const piezas = [vista, document.getElementById('avisos')].filter(Boolean);
  const donde = (el) => (el.firstElementChild || el).getBoundingClientRect().left;
  const antes = piezas.map(donde);
  cuerpo.classList.add('menu-moviendo');
  cuerpo.classList.toggle('menu-chico', chico);
  if (!sinMovimiento()) {
    piezas.forEach((el, k) => {
      el.style.transition = 'none';
      el.style.transform = '';
      const dx = antes[k] - donde(el);
      if (Math.abs(dx) > 0.5) el.style.transform = `translate3d(${dx.toFixed(2)}px, 0, 0)`;
    });
    void cuerpo.offsetWidth; // fija el punto de partida antes de animar
    piezas.forEach((el) => {
      if (!el.style.transform) { el.style.transition = ''; return; }
      el.style.transition = `transform ${MENU_MS}ms cubic-bezier(0.5, 0, 0.2, 1)`; // arranca y termina despacio
      el.style.transform = 'translate3d(0, 0, 0)';
    });
  }
  clearTimeout(alternarMenu.reloj);
  alternarMenu.reloj = setTimeout(() => {
    piezas.forEach((el) => { el.style.transition = ''; el.style.transform = ''; });
    // El resaltado de la página activa toma su medida nueva antes de volver a verse (si no, aparece un
    // instante con el ancho del menú abierto y se sale encima del contenido).
    moverIndicador();
    void document.getElementById('nav')?.offsetWidth;
    cuerpo.classList.remove('menu-moviendo');
  }, MENU_MS + 60);
}

function construirNav() {
  const enlace = (ruta, texto, clase = '') => h('a', { href: `#${ruta}`, 'data-ruta': ruta, class: clase, title: texto },
    icono(ruta === 'registrar' ? 'mas' : ruta), h('span', { class: clase ? 'texto-central' : '' }, texto));
  if (SOLO_GASTO) { document.getElementById('nav').replaceChildren(); return; }
  document.getElementById('nav').replaceChildren(
    h('span', { class: 'nav-indicador', 'aria-hidden': 'true' }),
    h('div', { class: 'nav-marca' }, logoMarca(), nombreMarca()),
    h('button', { type: 'button', class: 'nav-plegar', 'aria-label': 'Ocultar o mostrar el menú', title: 'Ocultar o mostrar el menú', onclick: alternarMenu }, icono('atras')),
    enlace('inicio', 'Inicio'),
    enlace('tarjetas', 'Tarjetas'),
    enlace('registrar', 'Registrar gasto', 'central'),
    enlace('presupuesto', 'Presupuesto'),
    h('a', { class: 'nav-proximo', hidden: true }),
    h('div', { class: 'nav-pie' }, api.emailGuardado() ? botonCuenta('nav') : null));
  pintarProximoPago();
  marcarNav(location.hash.slice(1) || 'inicio');
}

// ---------- Arranque ----------

// Hay algo a medio escribir (Nuevo gasto, el editor de un gasto o una selección): no se recarga la pantalla sola.
function hayEdicionAbierta() {
  return SOLO_GASTO || (location.hash.slice(1) || 'inicio') === 'registrar' || !!document.querySelector('dialog[open]') || estado.seleccion.size > 0;
}

async function arrancar() {
  aplicarApariencia();
  aplicarMenu();
  document.body.classList.toggle('solo-gasto', SOLO_GASTO);
  construirNav();
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest?.('.cuenta-menu')) cerrarMenusCuenta();
    const tocada = ev.target.closest?.('a.plastico');
    if (tocada) estado.plasticoClic = tocada;
  }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarMenusCuenta(); });
  try { if (localStorage.getItem('ff:ocultar')) document.body.classList.add('montos-ocultos'); } catch { /* nada */ }
  // Atajos de teclado en computadora: N nuevo gasto, 1 Inicio, 2 Tarjetas, 3 Presupuesto, M movimientos, / buscar.
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || SOLO_GASTO || document.querySelector('dialog[open]')) return;
    const en = ev.target;
    if (en?.closest?.('input, textarea, select, [contenteditable]')) return;
    const destino = { n: '#registrar', 1: '#inicio', 2: '#tarjetas', 3: '#presupuesto', m: '#movimientos' }[ev.key.toLowerCase()];
    if (destino) { ev.preventDefault(); location.hash = destino; return; }
    if (ev.key === '/') { const b = vista.querySelector('input[type="search"]'); if (b) { ev.preventDefault(); b.focus(); } }
  });
  window.addEventListener('resize', moverIndicador);
  document.body.append(h('div', { class: 'barra-carga', 'aria-hidden': 'true' }, h('i')));
  // El brillo de los paneles de vidrio sigue al cursor.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let pendiente = null;
    document.addEventListener('pointermove', (ev) => {
      const el = ev.target.closest?.('.panel, .grupo');
      if (!el) return;
      pendiente = [el, ev.clientX, ev.clientY];
      requestAnimationFrame(() => {
        if (!pendiente) return;
        const [caja, x, y] = pendiente; pendiente = null;
        const r = caja.getBoundingClientRect();
        caja.style.setProperty('--px', `${Math.round(x - r.left)}px`);
        caja.style.setProperty('--py', `${Math.round(y - r.top)}px`);
      });
    }, { passive: true });
  }
  // Onda al tocar un botón.
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.boton, .opcion, .cuenta-boton, .pest, .chip-filtro');
    if (!el || el.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const onda = h('span', { class: 'onda', 'aria-hidden': 'true',
      style: `left: ${ev.clientX - r.left}px; top: ${ev.clientY - r.top}px; --t: ${Math.round(Math.max(r.width, r.height) * 2.2)}px` });
    el.append(onda);
    setTimeout(() => onda.remove(), 700);
  });
  if ('serviceWorker' in navigator) {
    // Si la app ya estaba abierta cuando se publicó una versión nueva, se avisa con un botón para actualizar.
    const habiaVersion = !!navigator.serviceWorker.controller;
    const abiertaDesde = Date.now();
    navigator.serviceWorker.register('./sw.js').then((reg) => { estado.registroSW = reg; }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Recién abierta ya trae los archivos nuevos: solo se avisa si llevaba un rato abierta.
      if (!habiaVersion || Date.now() - abiertaDesde < 60000) return;
      avisar('Hay una versión nueva', '', { ico: 'novedad', fijo: true, accion: 'Actualizar', alAccion: () => location.reload() });
    });
  }
  window.addEventListener('hashchange', enviarPendiente);
  window.addEventListener('pagehide', enviarPendiente);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarPendiente(); });
  window.addEventListener('hashchange', navegar);
  window.addEventListener('foto-cambio', () => document.querySelectorAll('.avatar').forEach((el) => ponerFoto(el, fotoDe(el.title))));
  window.addEventListener('online', async () => {
    avisar('Conexión recuperada', 'ok');
    estado.tsDatos = null; estado.motivoDatos = null;
    await procesarCola();
    if (!hayEdicionAbierta()) navegar();
  });
  window.addEventListener('offline', () => {
    pintarAvisos();
    avisar('Sin conexión. Lo que registres se envía al volver la señal.', '', { ico: 'sin-senal' });
  });
  window.addEventListener('cola-cambio', () => { refrescarCola(); });
  // Lo que quedó en espera de envío se vuelve a intentar solo: cada 45 segundos y al volver a la app.
  const reintentar = () => { if (navigator.onLine && document.visibilityState === 'visible' && api.emailGuardado()) procesarCola().catch(() => {}); };
  setInterval(reintentar, 45000);
  // Pregunta una vez qué versión del motor está instalada; si es la nueva, aparecen sus funciones.
  if (api.emailGuardado() && navigator.onLine) {
    setTimeout(() => llamarApi('version', {}).then((r) => {
      const antes = motorNuevo();
      try { localStorage.setItem('ff:motor', r?.version || ''); } catch { /* nada */ }
      if (!antes && motorNuevo() && !hayEdicionAbierta()) navegar({ silencioso: true });
    }).catch(() => { try { localStorage.removeItem('ff:motor'); } catch { /* nada */ } }), 1500);
  }
  document.addEventListener('visibilitychange', reintentar);
  // Al volver a la app: se envía lo pendiente, se busca versión nueva y, si pasó un buen rato, se traen los datos de nuevo.
  let ocultaDesde = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { ocultaDesde = Date.now(); return; }
    if (!navigator.onLine) return;
    procesarCola();
    estado.registroSW?.update().catch(() => {});
    const rato = ocultaDesde && Date.now() - ocultaDesde > 5 * 60000;
    if (rato && !hayEdicionAbierta() && api.emailGuardado()) navegar();
  });

  if (api.configurado()) {
    api.iniciarGoogle(async (conectado, desdeBoton) => {
      // Solo el botón de Google vuelve a pintar; las renovaciones las maneja quien las pidió.
      if (!conectado || !desdeBoton) return;
      estado.pideLogin = false;
      await procesarCola();
      await navegar();
      construirNav();
    });
  }
  await refrescarCola();
  navegar();
  procesarCola();
}

arrancar();
