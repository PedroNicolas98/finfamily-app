// FinFamily: pantallas, navegación por hash y sincronización.
import * as api from './api.js';
import * as cola from './cola.js';
import { API_URL } from './config.js';

// La app aparte para registrar gastos (gasto.html) usa este mismo código en modo "gasto".
const SOLO_GASTO = document.documentElement.dataset.app === 'gasto';
// Versión de esta copia de la app: se sube junto con la de sw.js en cada publicación (ver revisarVersionPublicada).
const VERSION_APP = 'finfamily-v171';
// Gasto rápido en computadora: abre la misma pantalla "Nuevo gasto" de la app (pedido del usuario, v151).
// Solo en una computadora de verdad (mouse, sin pantalla táctil) y nunca en la app instalada: en el celular, aunque
// sea ancho o esté en modo escritorio, gasto.html se queda para poder instalarse como app de gastos rápidos.
const esComputadora = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const esInstalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (SOLO_GASTO && esComputadora && !esInstalada && !new URLSearchParams(location.search).has('rapido')) location.replace(new URL('./#registrar', location.href).href);

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
  abajo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
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

// Ícono elegido para un tipo de gasto (Configuración › Gastos). Con el motor 1.5.1 viene de la hoja; si no, de este equipo.
function iconosElegidos() {
  const delMotor = leerCache('config')?.datos?.iconos;
  if (delMotor && typeof delMotor === 'object') return delMotor;
  try { return JSON.parse(localStorage.getItem('ff:iconos') || '{}'); } catch { return {}; }
}
function motorIconos() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && (v.b > 5 || (v.b === 5 && v.c >= 1))); }
// El motor guarda el nombre del ícono sin espacios ("restaurantes-y-salidas"); aquí se vuelve a la clave de CATEGORIAS.
const iconoAClave = (k) => (CATEGORIAS[k] ? k : String(k || '').replace(/-/g, ' '));
const claveAIcono = (k) => String(k || '').replace(/\s+/g, '-');
function iconoDe(concepto) {
  const bruto = iconosElegidos()[concepto] || iconosElegidos()[normalizar(concepto)];
  const elegido = bruto ? iconoAClave(bruto) : '';
  if (elegido && CATEGORIAS[elegido]) return elegido;
  return CATEGORIAS[normalizar(concepto)] ? normalizar(concepto) : 'otro';
}
function catIco(concepto) {
  const [color, path] = CATEGORIAS[iconoDe(concepto)] || CATEGORIAS.otro;
  const s = document.createElement('span');
  s.className = 'cat-ico';
  s.style.setProperty('--cc', color);
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`; // texto fijo
  return s;
}

// Nombre de tarjeta y dueño para la vista tipo "tarjeta de crédito".
const NOMBRE_TC = { SIP: 'SIP · Oh!', IBK_P: 'Interbank', IBK_B: 'Interbank', BCP: 'BCP', RIPLEY: 'Ripley', HORMIGA: 'Gastos hormiga' };
const DUENIO_TC = { IBK_P: 'PersonaA', IBK_B: 'PersonaB' };
// Catálogo de tarjetas: con el motor 1.4 viene de la hoja (se administra en Configuración); antes, el de siempre.
const CATALOGO_LOCAL = [
  { id: 'SIP', nombre: 'SIP · Oh!', titular: '', hoja: 'TC SIP', medio: 'TC_SIP', cierre: 10, vence: 3, color: 'rojo', activa: true },
  { id: 'IBK_P', nombre: 'Interbank', titular: 'PersonaA', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 15, color: 'verde', activa: true },
  { id: 'IBK_B', nombre: 'Interbank', titular: 'PersonaB', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 20, color: 'turquesa', activa: true },
  { id: 'BCP', nombre: 'BCP', titular: '', hoja: 'TC BCP', medio: 'TC_BCP', cierre: 20, vence: 20, color: 'azul', activa: true },
  { id: 'RIPLEY', nombre: 'Ripley', titular: '', hoja: 'TC Ripley', medio: 'TC_RIPLEY', cierre: null, vence: null, color: 'gris', activa: true },
];
// Colores de tarjeta: fondo claro, fondo oscuro y acento. Sin morados ni negros planos.
const COLORES_TC = {
  rojo: ['#C8372C', '#6E1512', '#FFC54D'], verde: ['#0C9C62', '#054B32', '#B5F26B'], turquesa: ['#0E9DAE', '#064A58', '#9FF0FF'],
  azul: ['#1E56BF', '#0A2359', '#FF8F2A'], gris: ['#4D5566', '#1C2029', '#D8C28C'], naranja: ['#E3922B', '#A3570C', '#FFE3B8'],
  vino: ['#8E2448', '#4A0F26', '#FFB8D1'], lima: ['#6FA81C', '#2F5208', '#F2FFB3'], celeste: ['#2E8BD6', '#0F3F6E', '#CFEBFF'],
  marino: ['#1F3A68', '#0B1A33', '#9FD0FF'], dorado: ['#B8892C', '#5E4210', '#FFF1B8'], grafito: ['#2F3542', '#121519', '#A9B4C7'],
};
function catalogoTC(conInactivas = false) {
  const lista = leerCache('config')?.datos?.tarjetas;
  const cat = Array.isArray(lista) && lista.length ? lista : CATALOGO_LOCAL;
  return conInactivas ? cat : cat.filter((t) => t.activa !== false);
}
function nombreTitular(t) { return String(t?.titular || '').split(' ')[0]; }
// Deja los nombres, dueños y colores al día con el catálogo (se llama al arrancar y cada vez que llega 'config').
function aplicarCatalogo() {
  const cat = catalogoTC(true);
  for (const k of Object.keys(NOMBRE_TC)) if (k !== 'HORMIGA') delete NOMBRE_TC[k];
  for (const k of Object.keys(DUENIO_TC)) delete DUENIO_TC[k];
  for (const k of Object.keys(COLOR_MEDIO)) if (!['YAPE', 'PLIN', 'EFECTIVO', 'LEMON'].includes(k)) delete COLOR_MEDIO[k];
  const porMedio = new Map();
  for (const t of cat) {
    NOMBRE_TC[t.id] = t.nombre;
    if (t.titular) DUENIO_TC[t.id] = nombreTitular(t);
    porMedio.set(t.medio, [...(porMedio.get(t.medio) || []), t]);
  }
  for (const [medio, ts] of porMedio) if (ts.length === 1) COLOR_MEDIO[medio] = ts[0].id;
  let css = document.getElementById('css-tarjetas');
  if (!css) { css = document.createElement('style'); css.id = 'css-tarjetas'; document.head.append(css); }
  css.textContent = cat.map((t) => {
    const c = colorAppTC(t);
    return `.tc-${t.id} { --c1: ${c[0]}; --c2: ${c[1]}; --acento: ${c[2]}; --op: ${c[0]}; }`;
  }).join('\n');
}
// Color del punto en "Medio de pago" (mismo de cada tarjeta).
const COLOR_MEDIO = { TC_SIP: 'SIP', TC_BCP: 'BCP', TC_RIPLEY: 'RIPLEY', YAPE: 'HORMIGA', PLIN: 'HORMIGA', EFECTIVO: 'HORMIGA', LEMON: 'HORMIGA' };

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

function alCambiarOcultos() {
  const caja = document.querySelector('.nav-proximo');
  if (caja) caja.dataset.clave = '';
  try { pintarProximoPago(); } catch { /* aún no hay menú */ }
  try { navegar({ silencioso: true }); } catch { /* nada */ }
}

// Escribe un monto. Con data-rico, el símbolo y los céntimos van más chicos (se lee primero la cifra).
function pintarMonto(el, valor) {
  const texto = soles(valor);
  const m = el.hasAttribute('data-rico') ? /^(-?)S\/ ([\d,]+)(\.\d+)?$/.exec(texto) : null;
  if (!m) { el.textContent = texto; return; }
  if (!el._partes) {
    const entero = h('span', { class: 'm-e' });
    const centimos = h('span', { class: 'm-c' });
    el.replaceChildren(h('span', { class: 'm-s' }, 'S/'), entero, centimos);
    el._partes = [entero, centimos];
  }
  el._partes[0].textContent = m[1] + m[2];
  el._partes[1].textContent = m[3] || '';
}

// Anima un número de 0 al valor final (respeta "reducir movimiento").
function contar(el, valor, desde = 0, dur = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(valor) || desde === valor) { pintarMonto(el, valor); return; }
  const t0 = performance.now();
  pintarMonto(el, desde);
  const paso = (t) => {
    if (!el.isConnected) return;
    const p = Math.min((t - t0) / dur, 1);
    const x = desde + (valor - desde) * (1 - Math.pow(1 - p, 3));
    pintarMonto(el, Number.isInteger(Math.round(valor * 100) / 100) ? Math.round(x) : x);
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
      SOLO_GASTO ? null : h('a', { class: 'cuenta-enlace', href: '#configuracion', onclick: cerrarMenusCuenta }, icono('ajustes'), 'Configuración'),
      SOLO_GASTO
        ? h('a', { class: 'cuenta-enlace', href: './#inicio' }, icono('presupuesto'), 'Ver cómo va el mes')
        : h('a', { class: 'cuenta-enlace', href: 'gasto.html' }, icono('mas'), 'App solo para gastos'),
      h('button', { type: 'button', class: 'cuenta-enlace', 'aria-pressed': String(document.body.classList.contains('montos-ocultos')), onclick: (ev) => {
        const oculto = document.body.classList.toggle('montos-ocultos');
        try { localStorage.setItem('ff:ocultar', oculto ? '1' : ''); } catch { /* nada */ }
        alCambiarOcultos();
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
  if (document.body.classList.contains('montos-ocultos')) return 'S/ ••••';
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + 'S/ ' + Math.abs(v).toLocaleString('en-US');
}

function chipTC(id, extra = '') {
  return h('span', { class: `chip-tc tc-${id} ${extra}`.trim(), 'aria-hidden': 'true' });
}

// Marca de la red de pago de cada tarjeta (se puede cambiar desde el detalle). BCP sale como Visa, como en el plástico.
const RED_TC = { BCP: 'visa', IBK_P: 'visa', IBK_B: 'visa', SIP: 'mastercard', RIPLEY: 'mastercard' };
// Diseños reales de cada banco (v141), sacados de las imágenes oficiales de cada uno. c = [claro, oscuro, acento].
const DISENOS_TC = {
  'ibk-clasica': { banco: 'Interbank', nombre: 'Visa Clásica (azul)', c: ['#1640C8', '#0A2493', '#05BE50'], logo: '#05BE50' },
  'ibk-verde': { banco: 'Interbank', nombre: 'Clásica verde (anterior)', c: ['#21B85A', '#0B8A3E', '#FFFFFF'], logo: '#FFFFFF' },
  'ibk-oro': { banco: 'Interbank', nombre: 'Oro', c: ['#E0AA16', '#B88608', '#FFFFFF'], logo: '#FFFFFF' },
  'ibk-platinum': { banco: 'Interbank', nombre: 'Platinum', c: ['#A9ABAE', '#7C7F84', '#FFFFFF'], logo: '#FFFFFF' },
  'ibk-signature': { banco: 'Interbank', nombre: 'Signature', c: ['#1C1F25', '#0A0C0F', '#6B7280'], logo: '#3D434D' },
  'bcp-qore': { banco: 'BCP', nombre: 'Qore Classic (azul)', c: ['#2259CC', '#123B98', '#FF7A00'] },
  'bcp-qore-gold': { banco: 'BCP', nombre: 'Qore Gold', c: ['#D6B061', '#A8823A', '#FF7A00'] },
  'bcp-qore-platinum': { banco: 'BCP', nombre: 'Qore Platinum', c: ['#ACB1B7', '#7B8189', '#FF7A00'] },
  'bcp-clasica': { banco: 'BCP', nombre: 'Visa Clásica (ondas)', c: ['#1F63D6', '#0C2C78', '#FF7A00'] },
  'sip-celeste': { banco: 'Sip', nombre: 'Celeste', c: ['#29AEF3', '#1595DD', '#0B1220'] },
  'sip-negra': { banco: 'Sip', nombre: 'Negra', c: ['#1C1D21', '#08090B', '#29AEF3'] },
  'ripley': { banco: 'Ripley', nombre: 'Mastercard', c: ['#4A4D53', '#26282C', '#E4002B'] },
};
// Color de cada tarjeta en la app (fichas, calendario, gráficos): el de su banco. Interbank SIEMPRE verde (su marca),
// aunque el plástico sea azul; la de la otra persona en un verde distinto para no confundirlas.
const VERDE_IBK_2 = ['#23B676', '#0B6A44', '#C8F7DC'];
function colorAppTC(t) {
  const dis = disenoTC(t);
  if (dis && DISENOS_TC[dis].banco === 'Interbank') return t.color === 'verde' || !t.color ? COLORES_TC.verde : VERDE_IBK_2;
  return dis ? DISENOS_TC[dis].c : COLORES_TC[t.color] || COLORES_TC.azul;
}
// Pedido del usuario (v155): con las tarjetas de débito sobran Efectivo y Lemon en "Pagué con" (lo ya anotado queda).
// Yape sale de la cuenta BCP y Plin de la de Interbank: se muestran con su banco y, como un débito, piden de dónde sale.
const MEDIOS_OCULTOS_REGISTRO = ['EFECTIVO'];
const CUENTA_DE_MEDIO = { YAPE: 'BCP', PLIN: 'Interbank' };
// v156: la débito BCP es la misma cuenta que Yape y la Interbank la misma que Plin: en "Pagué con" sobran.
const BILLETERA_DE_BANCO = { bcp: 'YAPE', interbank: 'PLIN' };
const billeteraDeDebito = (m) => (m?.tipo === 'debito' ? BILLETERA_DE_BANCO[normalizar(m.banco || '').replace(/[^a-z]/g, '')] || null : null);
const comoDebito = (m) => !!m && (m.tipo === 'debito' || !!CUENTA_DE_MEDIO[m.id]);
// Clase de color de una tarjeta de débito: por su banco (Interbank verde, BCP azul, Sip negra).
const claseDebito = (banco) => `TD-${normalizar(banco || '').replace(/[^a-z]/g, '') || 'otro'}`;
// Diseño de una tarjeta: el elegido; si no eligió, el de su banco según el nombre; 'propio' = colores de la app.
function disenoTC(t, forzado) {
  const d = forzado !== undefined ? forzado : datosTC(t.id)?.diseno;
  if (d === 'propio' || t.id === 'HORMIGA') return null;
  if (DISENOS_TC[d]) return d;
  const n = `${t.nombre || ''} ${t.id || ''}`;
  if (/interbank|\bibk/i.test(n)) return 'ibk-clasica';
  if (/\bbcp\b/i.test(n)) return 'bcp-qore';
  if (/\bsip\b|\boh\b/i.test(n)) return 'sip-negra';
  if (/ripley/i.test(n)) return 'ripley';
  return null;
}
// Dibujos fijos de cada banco (números y textos fijos, nunca datos de afuera).
const ARTE_TC = {
  BCP: '<svg viewBox="0 0 100 63" preserveAspectRatio="xMidYMid slice"><g class="qore-q"><path d="M62.5 34.2A32.8 32.8 0 1 0 34.3 42.7" fill="none" stroke-width="5.6"/><path d="M50 27C51 37.5 54 40.5 79 41.6C54 42.7 51 45.7 50 57C49 45.7 46 42.7 29 41.6C46 40.5 49 37.5 50 27Z"/></g><text x="6.5" y="45" class="qore-txt" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="7.2" font-weight="400" letter-spacing="-.2">Qore</text></svg>',
  'bcp-clasica': '<svg viewBox="0 0 100 63" preserveAspectRatio="none"><g fill="none" stroke="#fff" stroke-width=".5"><path stroke-opacity=".35" d="M0 38C22 26 40 50 62 38S88 26 100 34"/><path stroke-opacity=".25" d="M0 42C22 30 40 54 62 42S88 30 100 38"/><path stroke-opacity=".18" d="M0 46C22 34 40 58 62 46S88 34 100 42"/></g></svg>',
  Sip: '<svg viewBox="0 0 100 63" preserveAspectRatio="xMidYMid meet"><text x="75" y="46" text-anchor="middle" class="sip-letras" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="800" font-size="27" letter-spacing="-1.6">sıp</text><circle cx="91" cy="14.5" r="4.3" class="sip-punto"/><text transform="translate(7.4 58) rotate(-90)" class="sip-visa" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="6.4" letter-spacing=".1">VISA</text><text transform="translate(7.2 22) rotate(-90)" class="sip-credito" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="700" font-size="3">Crédito</text></svg>',
  Ripley: '<svg viewBox="0 0 100 63" preserveAspectRatio="xMinYMid meet"><text x="3" y="58" font-family="Georgia, Times New Roman, serif" font-size="68" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".24" stroke-width=".45">R</text></svg>',
};
const LOGO_IBK = (color) => `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="5" fill="${color}"/><path d="M11 10.5 30 8v23L11 33.5z" style="fill: var(--c1)"/></svg>`;
function datosTC(id) {
  try { return JSON.parse(localStorage.getItem('ff:tc-datos') || '{}')[id] || {}; } catch { return {}; }
}
function guardarDatosTC(id, datos) {
  let todo = {};
  try { todo = JSON.parse(localStorage.getItem('ff:tc-datos') || '{}'); } catch { todo = {}; }
  todo[id] = datos;
  try { localStorage.setItem('ff:tc-datos', JSON.stringify(todo)); } catch { /* sin espacio: se queda como estaba */ }
}
function redTC(t) {
  const d = datosTC(t.id);
  return d.red !== undefined ? d.red : (RED_TC[t.id] || '');
}
function marcaRed(red) {
  if (red === 'visa') return h('span', { class: 'plastico-red visa', 'aria-label': 'Visa' }, 'VISA');
  if (red === 'mastercard') return h('span', { class: 'plastico-red mastercard', 'aria-label': 'Mastercard' }, h('i'), h('i'));
  return null;
}
function duenioTC(t) {
  return DUENIO_TC[t.id] || (t.responsable ? String(t.responsable).split(' ')[0] : '');
}

// Nombre de una línea del presupuesto sin los códigos internos de la hoja: "Alimentación (BCP-DEB-PE)" queda "Alimentación".
function nombreLinea(texto) {
  return String(texto || '').replace(/\s*\((?:[A-Z0-9]{2,}(?:[-/][A-Z0-9]+)*|S\/\s*[\d.,]+)\)\s*$/, '').trim() || String(texto || '');
}
// Cobran a fin de mes: el presupuesto de un mes se gasta desde ese día de cobro (el último día del mes)
// hasta el día antes del siguiente cobro. Noviembre: del 30 nov al 30 dic. Lo gastado del 1 al 29 de
// noviembre sale del presupuesto de octubre.
function cicloDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const fin = new Date(a, m + 1, 0); fin.setDate(fin.getDate() - 1);
  return { desde: iso(new Date(a, m, 0)), hasta: iso(fin) };
}
// Mes del presupuesto que se está gastando en esa fecha.
function mesDelCiclo(fecha) {
  const d = deISO(fecha);
  const clave = fecha.slice(0, 7);
  return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() ? clave : sumarMes(clave, -1);
}
// Lo gastado por concepto dentro del ciclo de ese mes (solo débito, Yape, Plin, Lemon y efectivo del fondo común).
function gastadoEnCiclo(tarjetas, mes) {
  const { desde, hasta } = cicloDelMes(mes);
  const real = new Map();
  for (const c of consumosDe(tarjetas || [], () => true)) {
    if (!c.fecha || c.fecha < desde || c.fecha > hasta) continue;
    if (c.origen) continue; // sale del sobrante (P:) o de un ahorro (A:): no gasta la línea del presupuesto
    // Regla del usuario (v171): lo pagado con tarjeta de crédito ya cuenta en la línea de esa tarjeta (TC …);
    // nunca descuenta de las líneas de gastos fijos, que tienen su plata separada para otra cosa.
    if (c.tarjeta && c.tarjeta.id !== 'HORMIGA') continue;
    const k = normalizar(c.concepto || '');
    real.set(k, (real.get(k) || 0) + (Number(c.monto) || 0));
  }
  return real;
}

// Cuánto se lleva gastado en cada línea de gastos del presupuesto (sin las tarjetas), como el "Llevas…" de
// Presupuesto: con los conceptos asignados a la línea o, si no hay, por el nombre corto de la línea.
// real: Map concepto normalizado -> monto (ver gastadoEnCiclo).
function avanceLineas(filas, real) {
  const salida = [];
  for (const f of filas || []) {
    const plan = Math.abs(Number(f.monto) || 0);
    if (f.seccion !== 'gastos' || f.esTarjeta || /^TC\s/i.test(f.concepto || '') || !plan) continue;
    const linea = normalizar(nombreLinea(f.concepto));
    let gastado = null;
    if (f.conceptos && f.conceptos.length) gastado = f.conceptos.reduce((s, c) => s + (real.get(normalizar(c)) || 0), 0);
    else {
      const clave = [...real.keys()].find((k) => k === linea || (linea.length >= 5 && k.startsWith(linea)) || (k.length >= 5 && linea.startsWith(k)));
      if (clave) gastado = real.get(clave);
    }
    if (gastado === null) continue;
    salida.push({ nombre: nombreLinea(f.concepto), plan, gastado, pct: (gastado / plan) * 100 });
  }
  return salida;
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

// v157: el usuario paga las tarjetas a fin de mes (la "Fecha de pago" de la hoja), antes del vencimiento del banco.
// Los días que faltan se cuentan hasta ese pago. Fecha de pago del estado que vence primero:
function pagoDeTC(t) { return (t?.estados || []).find((g) => g.vence === t.proximoVence && g.pendiente > 0)?.pago || null; }
// Si el día de pago ya pasó sin pagar, lo que manda es el vencimiento del banco.
const fechaPagoTC = (t) => { const p = pagoDeTC(t); return p && p >= hoyISO() ? p : t?.proximoVence || p || null; };

// Estado del próximo pago: texto + clase de color (nunca solo color).
function estadoVence(vence, pendiente, pago) {
  if (!(pendiente > 0)) return { clase: 'ok', texto: 'Al día' };
  if (!vence && !pago) return { clase: '', texto: 'Sin fecha' };
  const dp = pago ? diasEntre(hoyISO(), pago) : null;
  const dv = vence ? diasEntre(hoyISO(), vence) : null;
  if (dp != null && dp >= 0 && !(dv < 0)) {
    if (dp === 0) return { clase: 'aviso', texto: 'Pagas hoy' };
    if (dp === 1) return { clase: 'aviso', texto: 'Pagas mañana' };
    if (dp <= 7) return { clase: 'aviso', texto: `Pagas en ${dp} días` };
    return { clase: '', texto: `Faltan ${dp} días` };
  }
  if (dp != null && dp < 0 && dv != null && dv > 1) return { clase: 'aviso', texto: `Pago atrasado · vence en ${dv} días` };
  if (!vence) return { clase: 'mal', texto: `Era para el ${fechaCorta(pago)}` };
  const dias = dv;
  if (dias < 0) return { clase: 'mal', texto: `Venció el ${fechaCorta(vence)}` };
  if (dias === 0) return { clase: 'aviso', texto: 'Vence hoy' };
  if (dias === 1) return { clase: 'aviso', texto: 'Vence mañana' };
  if (dias <= 7) return { clase: 'aviso', texto: `Vence en ${dias} días` };
  return { clase: '', texto: `Faltan ${dias} días` };
}

function estadoPill(vence, pendiente, pago) {
  const e = estadoVence(vence, pendiente, pago);
  return h('span', { class: `pill ${e.clase}`.trim() }, e.texto);
}

// v158: lo pagado con débito, Yape, Plin, Lemon o efectivo (hoja Gastos Hormiga) se muestra como una tarjeta por cuenta.
// Yape cuenta en la débito BCP y Plin en la Interbank de quien gastó. Las débito de quien mira salen aunque estén en cero.
function cuentasDeHormiga(hormiga) {
  if (!hormiga) return [];
  const debitos = (leerCache('config')?.datos?.medios || []).filter((m) => m.tipo === 'debito');
  if (!debitos.length) return [hormiga];
  const yo = usuarioActual()?.nombre || '';
  const grupos = new Map();
  const grupo = (clave, datos) => { if (!grupos.has(clave)) grupos.set(clave, { ...datos, consumos: [] }); return grupos.get(clave); };
  const debitoDe = (banco, quien) => debitos.find((d) => normalizar(d.banco) === normalizar(banco) && mismoNombre(d.titular, quien || ''));
  const deDebito = (d) => grupo(d.id, { id: d.id, nombre: d.etiqueta, banco: d.banco, titular: d.titular, tipo: 'debito' });
  for (const d of debitos) if (yo && mismoNombre(d.titular, yo)) deDebito(d);
  for (const g of hormiga.estados || []) for (const cons of g.consumos || []) {
    const m = normalizar(cons.medio || '');
    const cuenta = debitos.find((d) => normalizar(d.etiqueta) === m)
      || (m === 'yape' ? debitoDe('BCP', cons.responsable) : m === 'plin' ? debitoDe('Interbank', cons.responsable) : null);
    const gr = cuenta ? deDebito(cuenta)
      : m === 'lemon' ? grupo('LEMON', { id: 'LEMON', nombre: 'Lemon', banco: 'Lemon', titular: cons.responsable, tipo: 'debito' })
        : m === 'efectivo' ? grupo('EFECTIVO', { id: 'EFECTIVO', nombre: 'Efectivo', tipo: 'efectivo' })
          : m === 'yape' || m === 'plin' ? grupo(m.toUpperCase(), { id: m.toUpperCase(), nombre: cons.medio, banco: m === 'yape' ? 'BCP' : 'Interbank', titular: cons.responsable, tipo: 'debito' })
            : grupo('OTROS', { id: 'OTROS', nombre: 'Otros pagos', tipo: 'efectivo' });
    gr.consumos.push(cons);
  }
  return [...grupos.values()].map((x) => {
    const total = Math.round(x.consumos.reduce((sum, k) => sum + (Number(k.monto) || 0), 0) * 100) / 100;
    const usos = [...new Set(x.consumos.map((k) => (/^d[eé]bito/i.test(k.medio || '') ? 'Débito' : k.medio)).filter(Boolean))];
    return { id: x.id, nombre: x.nombre, hoja: hormiga.hoja, base: hormiga, cuenta: { ...x, usos }, pendiente: total, proximoVence: null,
      estados: [{ vence: '', pago: '', total, pendiente: total, consumos: x.consumos }] };
  });
}
const tarjetasVista = (lista) => (lista || []).flatMap((t) => (t.id === 'HORMIGA' ? cuentasDeHormiga(t) : [t]));

// Tarjeta dibujada como plástico: marca, monto por pagar, titular y vencimiento.
function tarjetaVisual(t, comoEnlace = true, opciones = {}) {
  const cta = t.cuenta || null;
  const esDeb = cta?.tipo === 'debito';
  const esH = t.id === 'HORMIGA' || !!cta;
  const dis = esH ? null : disenoTC(t, opciones.diseno);
  const D = dis ? DISENOS_TC[dis] : null;
  const pagoTC = esH ? null : pagoDeTC(t);
  const e = esH ? null : estadoVence(t.proximoVence, t.pendiente, pagoTC);
  const d = esH ? {} : datosTC(t.id);
  const fecha = !esH && (pagoTC || t.proximoVence) ? fechaCorta(pagoTC || t.proximoVence) : null;
  // Como una tarjeta de verdad: banco y pago sin contacto arriba, chip con el monto al lado,
  // número en relieve (con los últimos dígitos si se guardaron) y abajo titular, vencimiento y la marca.
  let rotulo = pagoTC ? 'Pagas' : 'Vence', valor = fecha || 'Sin fecha';
  if (e && e.clase === 'ok') { rotulo = 'Estado'; valor = 'Al día'; }
  else if (e && e.clase === 'mal') { rotulo = 'Venció'; valor = t.proximoVence ? fechaCorta(t.proximoVence) : valor; }
  else if (e && /atrasado/.test(e.texto)) { rotulo = 'Vence'; valor = fechaCorta(t.proximoVence); }
  else if (e && e.clase === 'aviso') { valor = /hoy$/i.test(e.texto) ? 'Hoy' : /mañana$/.test(e.texto) ? 'Mañana' : fecha; }
  const digitos = /^\d{4}$/.test(d.digitos || '') ? d.digitos : null;
  // Con diseño real: logo y dibujo del banco; el nombre de la tarjeta queda para lectores de pantalla.
  const nombre = NOMBRE_TC[t.id] || t.nombre;
  let marca = h('span', { class: 'plastico-marca', 'data-sub': esDeb ? 'Tarjeta de débito' : esH ? 'Billetera' : 'Tarjeta de crédito' }, esDeb ? cta.banco : nombre);
  let arriba = icono(esH && !esDeb ? 'billetera' : 'sin-contacto');
  if (esDeb && normalizar(cta.banco) === 'bcp') marca = h('span', { class: 'plastico-marca diseno bcp-logo', title: nombre }, h('b', {}, '›'), 'BCP', h('b', {}, '›'));
  const claseCta = esDeb ? (normalizar(cta.banco) === 'lemon' ? 'TD-lemon' : claseDebito(cta.banco)) : cta ? 'HORMIGA' : t.id;
  if (D?.banco === 'Interbank') { marca = h('span', { class: 'plastico-marca diseno', title: nombre }, 'Benefit'); arriba = svgFijo(LOGO_IBK(D.logo), 'plastico-logo'); }
  else if (D?.banco === 'BCP') marca = h('span', { class: 'plastico-marca diseno bcp-logo', title: nombre }, h('b', {}, '›'), 'BCP', h('b', {}, '›'));
  else if (D?.banco === 'Sip') marca = h('span', { class: 'plastico-marca diseno oculta' }, nombre);
  else if (D?.banco === 'Ripley') { marca = h('span', { class: 'plastico-marca diseno oculta' }, nombre); arriba = h('span', { class: 'ripley-logo', 'aria-hidden': 'true' }, 'banco ripley'); }
  const arte = D ? (ARTE_TC[dis] || ARTE_TC[D.banco] || '') : '';
  return h(comoEnlace ? 'a' : 'div', { class: `plastico tc-${claseCta}${esH && !esDeb ? ' hormiga' : ''}${esDeb ? ' debito' : ''}`, href: comoEnlace ? `#tarjeta-${t.id}` : null,
    'data-diseno': dis, style: D ? `--c1:${D.c[0]};--c2:${D.c[1]};--acento:${D.c[2]}` : null },
    h('i', { class: 'plastico-brillo', 'aria-hidden': 'true' }),
    arte ? h('i', { class: 'plastico-arte', 'aria-hidden': 'true' }, svgFijo(arte, 'arte-svg')) : null,
    D?.banco === 'Ripley' ? h('i', { class: 'plastico-franja', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'plastico-top' }, marca, arriba),
    h('span', { class: 'plastico-medio' },
      esH && !esDeb ? null : h('span', { class: 'plastico-chip', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('span', { class: 'plastico-monto' },
        h('span', {}, esH ? 'Gastado este mes' : 'Por pagar'),
        h('strong', { 'data-rico': '', 'data-contar': String(t.pendiente || 0) }, soles(0)))),
    esH ? null : h('span', { class: 'plastico-numero', 'aria-hidden': 'true' },
      h('b', {}, '••••'), h('b', {}, '••••'), h('b', {}, '••••'), h('b', { class: digitos ? 'real' : '' }, digitos || '••••'),
      h('i', { class: 'plastico-holo' })),
    h('span', { class: 'plastico-pie' },
      h('span', { class: 'plastico-datos' },
        esDeb ? h('span', { class: 'plastico-dato' }, h('small', {}, 'Titular'), h('span', { class: 'plastico-titular' }, nombreCorto(cta.titular) || '—'))
          : h('span', { class: 'plastico-dato' }, h('small', {}, esH ? 'Medios de pago' : 'Titular'), h('span', { class: 'plastico-titular' }, cta ? (cta.usos.join(' · ') || cta.nombre) : esH ? 'Yape · Plin · Efectivo' : (d.nombre || duenioTC(t)))),
        esDeb ? h('span', { class: 'plastico-dato' }, h('small', {}, 'Pagos con'), h('span', {}, cta.usos.join(' · ') || 'Sin gastos')) : null,
        e ? h('span', { class: `plastico-dato vence${e.clase ? ` est-${e.clase}` : ''}` }, h('small', {}, rotulo), h('span', {}, valor)) : null),
      esH ? null : marcaRed(redTC(t))));
}

// Los datos impresos en la tarjeta (últimos 4 dígitos, nombre, marca) se guardan solo en este equipo.
function editarDatosTC(t) {
  const d = datosTC(t.id);
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': 'Datos de la tarjeta' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const inDig = h('input', { id: 'tc-dig', type: 'text', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', placeholder: '1234', value: d.digitos || '' });
  inDig.addEventListener('input', () => { inDig.value = inDig.value.replace(/\D/g, '').slice(0, 4); });
  const inNombre = h('input', { id: 'tc-nombre', type: 'text', maxlength: '26', autocomplete: 'off', placeholder: duenioTC(t) || 'Como figura en la tarjeta', value: d.nombre || '' });
  const selRed = h('select', { id: 'tc-red' },
    h('option', { value: 'visa' }, 'Visa'), h('option', { value: 'mastercard' }, 'Mastercard'), h('option', { value: '' }, 'Sin marca'));
  selRed.value = redTC(t);
  const msg = h('p', { class: 'mensaje error', hidden: true, role: 'alert' });
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const dig = inDig.value.trim();
    if (dig && !/^\d{4}$/.test(dig)) { msg.textContent = 'Los últimos dígitos son 4 números.'; msg.hidden = false; inDig.focus(); return; }
    const nuevos = { digitos: dig, nombre: inNombre.value.trim(), red: selRed.value };
    guardarDatosTC(t.id, nuevos);
    // Con el motor 1.3 los datos viajan al motor para verse igual en todos los aparatos (y para que el lector de correos sepa de quién es cada Interbank).
    if (motorLector() && emailSesion()) llamarApi('guardarDatosTarjeta', { id: t.id, ...nuevos }, { email: emailSesion() }).catch(() => { /* quedó en este equipo */ });
    cerrar();
    avisar('Tarjeta actualizada', 'ok');
    navegar({ silencioso: true });
  } },
    h('p', { class: 'cierre-etq' }, NOMBRE_TC[t.id] || t.nombre),
    h('p', { class: 'suave' }, motorLector() ? 'Lo que se ve en la tarjeta. Se guarda en el motor, así se ve igual en el celular y en la computadora.' : 'Lo que se ve en la tarjeta. Se guarda solo en este equipo, no en la hoja.'),
    h('div', { class: 'modal-cuerpo' },
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tc-dig' }, 'Últimos 4 dígitos'), inDig),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tc-red' }, 'Marca'), selRed),
      h('div', { class: 'campo' }, h('label', { for: 'tc-nombre' }, 'Nombre en la tarjeta'), inNombre)),
    msg,
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'submit', class: 'boton primario' }, 'Guardar'), h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar')));
  dlg.append(form);
  document.body.append(dlg);
  dlg.showModal();
  inDig.focus();
}
function anillo(pct, etiqueta = 'del plan') {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frase = etiqueta === 'en gastos' ? `${pct}% de lo que entra se va en gastos, según tu presupuesto` : `${pct}% del ingreso ya ${etiqueta}`;
  const caja = h('div', { class: 'anillo', role: 'img', title: frase, 'aria-label': frase });
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

// Días plegados (v148): en las listas por día, cada franja se abre o se cierra al tocarla y dice cuántos gastos tiene.
// Empiezan cerradas (salvo las de `abiertos`); mientras se busca o filtra, el ul lleva la clase 'buscando' y se ve todo.
function plegarDias(ul, abiertos) {
  let franja = null;
  let filas = [];
  const cerrar = () => {
    if (!franja) return;
    const f = franja, lista = filas;
    const clave = f.dataset.dia || f.firstChild?.textContent || '';
    const abierto = abiertos.has(clave);
    f.classList.add('plegable');
    f.classList.toggle('plegado', !abierto);
    f.setAttribute('role', 'button');
    f.tabIndex = 0;
    f.setAttribute('aria-expanded', String(abierto));
    f.prepend(h('span', { class: 'dia-chev', 'aria-hidden': 'true' }, icono('adelante')));
    f.querySelector('.dia-total')?.before(h('small', { class: 'dia-n' }, `${lista.length} gasto${lista.length === 1 ? '' : 's'}`));
    lista.forEach((li) => li.classList.toggle('dia-oculto', !abierto));
    const alternar = () => {
      const abrir = f.classList.contains('plegado');
      if (abrir) abiertos.add(clave); else abiertos.delete(clave);
      f.classList.toggle('plegado', !abrir);
      f.setAttribute('aria-expanded', String(abrir));
      lista.forEach((li, i) => {
        li.classList.toggle('dia-oculto', !abrir);
        if (abrir && !sinMovimiento()) { li.style.setProperty('--i', String(i)); li.classList.remove('dia-entra'); void li.offsetWidth; li.classList.add('dia-entra'); }
      });
    };
    f.addEventListener('click', alternar);
    f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } });
  };
  for (const li of [...ul.children]) {
    if (li.classList.contains('dia')) { cerrar(); franja = li; filas = []; } else if (franja) filas.push(li);
  }
  cerrar();
}

// Fila de un consumo en las listas de Inicio.
function filaMov(c, derecha, sinFecha = false) {
  return h('li', { class: 'mov', title: c.descripcion },
    catIco(c.concepto),
    h('span', { class: 'mov-texto' }, h('span', {}, limpiarComercio(c.descripcion)),
      h('span', { class: 'suave' }, [sinFecha ? '' : fechaCorta(c.fecha), c.concepto].filter(Boolean).join(' · '), c.origen ? h('em', { class: 'de-donde' }, textoOrigen(c.origen)) : null)),
    h('span', { class: 'mov-der' }, h('strong', {}, soles(c.monto)), derecha ? h('span', { class: 'suave' }, derecha) : null));
}

// Caja con título y, si hace falta, un enlace o dato a la derecha.
const ICONO_PANEL = { 'Consumos por día': 'presupuesto', '¿En qué se fue?': 'dona', 'Últimos consumos': 'lista',
  'Gastos hormiga': 'billetera', 'Calendario de pagos': 'calendario', Ingresos: 'sube', 'Lo que entra': 'sube', Gastos: 'baja', Ahorros: 'billetera', 'Tus tarjetas': 'tarjetas', 'Gastos fijos': 'check', 'Quién gastó': 'personas' };
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
const fmtEntero = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
// 6000 -> 'S/ 6,000'; 1042.96 -> 'S/ 1,042.96'; 7.5 -> 'S/ 7.50'. Sin céntimos no se escriben decimales.
// v168: con "Ocultar montos" todo monto se escribe como en las tarjetas: S/ ••••
const montosOcultos = () => document.body.classList.contains('montos-ocultos');
function soles(n) {
  if (montosOcultos()) return 'S/ ••••';
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const abs = Math.abs(v);
  const s = 'S/ ' + (Number.isInteger(abs) ? fmtEntero.format(abs) : fmtNumero.format(abs));
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
function borrarCaches(solo) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('ff:c:') && (!solo || solo.some((s) => k === 'ff:c:' + s || k.startsWith('ff:c:' + s + ':')))).forEach((k) => localStorage.removeItem(k));
  } catch { /* nada */ }
}

// Pide datos a la API; si no hay señal (o falla el servidor) devuelve lo último guardado.
// Con 'no_autorizado' no se muestran datos guardados: la cuenta pudo perder el acceso.
async function cargar(accion, datos, clave) {
  const r = await cargarCrudo(accion, datos, clave);
  if (clave === 'config') { try { aplicarCatalogo(); } catch { /* nada */ } }
  return r;
}
function anotarVersionMotor(d) {
  const v = d && typeof d === 'object' ? String(d.version || '') : '';
  if (!v) return;
  const antes = versionMotor().texto;
  try { localStorage.setItem('ff:motor', v); } catch { /* nada */ }
  const despues = versionMotor().texto;
  if (despues !== antes) {
    // Motor recién actualizado: lo nuevo aparece sin salir y volver a la pantalla.
    clearTimeout(anotarVersionMotor.reloj);
    anotarVersionMotor.reloj = setTimeout(() => navegar({ silencioso: true }), 400);
  }
}
async function cargarCrudo(accion, datos, clave) {
  try {
    const d = await llamarApi(accion, datos);
    guardarCache(clave, d);
    anotarVersionMotor(d);
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
    const n = api.emailGuardado() ? lista.filter((t) => t.id !== 'HORMIGA' && t.pendiente > 0 && t.proximoVence && diasEntre(hoyISO(), fechaPagoTC(t)) <= 7).length : 0;
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
    .sort((a, b) => String(fechaPagoTC(a)).localeCompare(String(fechaPagoTC(b))))[0];
  if (!prox || !api.emailGuardado()) { caja.hidden = true; caja.dataset.clave = ''; return; }
  const e = estadoVence(prox.proximoVence, prox.pendiente, pagoDeTC(prox));
  const clave = [prox.id, prox.pendiente, e.texto, montosOcultos()].join('|');
  if (caja.dataset.clave === clave) return; // sin cambios: no se vuelve a animar
  caja.dataset.clave = clave;
  caja.hidden = false;
  caja.href = `#tarjeta-${prox.id}`;
  caja.className = `nav-proximo ${e.clase}`.trim();
  caja.replaceChildren(
    h('span', { class: 'np-cab' }, icono('calendario'), h('span', {}, 'Próximo pago'), icono('adelante')),
    h('strong', { class: 'np-monto' }, soles(prox.pendiente)),
    h('span', { class: 'np-pie' }, chipTC(prox.id, 'mini'), h('span', { class: 'np-nombre' }, nombreCortoTC(prox))),
    h('span', { class: `pill ${e.clase}`.trim() }, e.texto.replace('Pago atrasado · ', 'Atrasado · ')));
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
function versionMotor() {
  // Se toma la más nueva de las fuentes: la copia guardada de Inicio puede ser de antes de actualizar el motor.
  let guardada = '';
  try { guardada = localStorage.getItem('ff:motor') || ''; } catch { /* nada */ }
  const partes = (v) => { const [a, b, c] = String(v || '').split('.').map((n) => Number(n) || 0); return { a, b, c, texto: String(v || '') }; };
  const candidatas = [leerCache('inicio')?.datos?.version, leerCache('config')?.datos?.version, guardada].filter(Boolean).map(partes);
  if (!candidatas.length) return { a: 0, b: 0, c: 0, texto: '' };
  return candidatas.sort((x, y) => (y.a - x.a) || (y.b - x.b) || (y.c - x.c))[0];
}
function motorNuevo() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 2); }
// Motor 1.3: lee los correos de los bancos, manda alertas y pone los vencimientos en el calendario.
function motorLector() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 3); }
function responsables() {
  const lista = leerCache('config')?.datos?.responsables || [];
  return lista.map((n) => String(n).trim()).filter(Boolean);
}
function nombreCorto(n) { return String(n || '').split(' ')[0]; }
const EN_PANTALLA = ['editarGasto', 'borrarGasto', 'marcarPagado', 'pasarACuotas']; // después de estos se espera al Sheets para ver el cambio
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

// Mientras llega cada pantalla se ve la casa del logo armándose (la misma del arranque),
// con un texto que va cambiando para que se sepa que hay que esperar.
const PRIMER_TEXTO_CARGA = {
  inicio: 'Trayendo tu resumen del mes…', tarjetas: 'Trayendo tus tarjetas…', presupuesto: 'Sumando tu presupuesto…',
  movimientos: 'Trayendo tus movimientos…', configuracion: 'Abriendo configuración…', registrar: 'Preparando el nuevo gasto…',
};
function textosCarga(ruta = '') {
  const clave = ruta.startsWith('tarjeta-') ? 'tarjetas' : ruta.startsWith('configuracion') ? 'configuracion' : ruta;
  return [PRIMER_TEXTO_CARGA[clave] || 'Cargando…', 'Leyendo tu hoja de Google…', 'Ordenando los números…', 'Casi listo…'];
}
function animarTextoCarga(p, textos) {
  if (!p) return;
  const inicio = Date.now();
  let i = 0;
  const poner = (t) => {
    if (p.textContent === t) return;
    p.classList.remove('cambia'); void p.offsetWidth; p.classList.add('cambia');
    p.textContent = t;
  };
  const reloj = setInterval(() => {
    if (!p.isConnected) { clearInterval(reloj); return; }
    const pasado = Date.now() - inicio;
    if (pasado > 25000) poner('Sigue cargando. Si no abre, revisa tu internet.');
    else if (pasado > 11000) poner('Tu hoja está tardando un poco. Ya casi…');
    else { i = Math.min(i + 1, textos.length - 1); poner(textos[i]); }
  }, 2200);
}
function cargando(ruta) {
  const textos = textosCarga(ruta);
  const p = h('p', { class: 'arranque-texto', 'aria-live': 'polite' }, textos[0]);
  animarTextoCarga(p, textos);
  return h('div', { class: 'pantalla cargando arranque', 'aria-busy': 'true', 'aria-label': 'Cargando' },
    logoMarca('vivo'), h('i', { class: 'arranque-barra', 'aria-hidden': 'true' }, h('b')), p);
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

// ---------------------------------------------------------------------------
// Gastos fijos automáticos (v125, motor 1.13): cada fijo tiene su día. Los de débito automático se marcan
// pagados solos ese día; los demás se recuerdan en Inicio desde 2 días antes hasta que se marquen.
// ---------------------------------------------------------------------------
function motorFijosAuto() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 13); }
const fijosAutoGuardados = () => leerCache('fijos-auto')?.datos?.fijos || [];
const textoDia = (dia) => (dia >= 31 ? 'fin de mes' : `día ${dia}`);
const fijoAutoDe = (concepto) => fijosAutoGuardados().find((x) => normalizar(x.concepto) === normalizar(concepto)) || null;
function fechaDelFijo(dia, anioMes) {
  const [a, m] = anioMes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${anioMes}-${pad(Math.min(Math.max(1, dia), ultimo))}`;
}

// Ventanita "¿Qué día se paga?". Resuelve la lista nueva de fijos o null.
function abrirDiaFijo(f) {
  return new Promise((resolver) => {
    const actual = fijoAutoDe(f.concepto);
    let dia = actual?.dia || 0;
    let auto = !!actual?.auto;
    let terminado = false;
    const dlg = h('dialog', { class: 'hoja-modal dia-fijo-dlg', 'aria-label': `Día de ${f.concepto}` });
    const salir = (valor) => {
      if (terminado) return; terminado = true;
      dlg.classList.add('cerrando');
      setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190);
      resolver(valor);
    };
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); salir(null); });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) salir(null); });
    const msg = h('p', { class: 'mensaje error', hidden: true });
    const dias = Array.from({ length: 30 }, (_, i) => h('button', { type: 'button', class: 'dia-fijo', 'data-d': String(i + 1),
      onclick: () => { dia = i + 1; pintar(); } }, String(i + 1)));
    const finDeMes = h('button', { type: 'button', class: 'dia-fijo fin-mes', 'data-d': '31', onclick: () => { dia = 31; pintar(); } }, 'Fin de mes');
    dias.unshift(finDeMes);
    const resumen = h('p', { class: 'dia-fijo-resumen', 'aria-live': 'polite' });
    const btnGuardar = h('button', { type: 'button', class: 'boton primario' }, 'Guardar');
    const enviar = async (diaFinal) => {
      msg.hidden = true;
      ocuparBoton(btnGuardar, 'Guardando…');
      try {
        const r = await llamarApi('guardarFijoAuto', { concepto: f.concepto, dia: diaFinal, auto }, { email: emailSesion() });
        guardarCache('fijos-auto', { fijos: r?.fijos || [] });
        avisar(diaFinal ? (auto ? `${nombreLinea(f.concepto)}: se marca solo ${diaFinal >= 31 ? 'a fin de mes' : 'el día ' + diaFinal}` : `${nombreLinea(f.concepto)}: te aviso ${diaFinal >= 31 ? 'a fin de mes' : 'el día ' + diaFinal}`) : 'Día quitado', 'ok');
        salir(r?.fijos || []);
      } catch (e) {
        liberarBoton(btnGuardar, 'Guardar');
        msg.textContent = mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'); msg.hidden = false;
      }
    };
    btnGuardar.onclick = () => { if (dia) enviar(dia); };
    const pintar = () => {
      dias.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.d) === dia)));
      btnGuardar.disabled = !dia;
      resumen.replaceChildren(!dia ? 'Elige el día del mes en que se paga.'
        : auto ? h('span', {}, dia >= 31 ? 'A ' : 'El ', h('strong', {}, textoDia(dia)), ' se marca pagado solo.')
          : h('span', {}, 'Te aviso desde 2 días antes y ', dia >= 31 ? 'a ' : 'el ', h('strong', {}, textoDia(dia)), ' por correo.'));
    };
    dlg.append(h('div', { class: 'cierre-caja dia-fijo-caja' },
      h('p', { class: 'cierre-etq' }, `¿Qué día se paga ${nombreLinea(f.concepto)}?`),
      h('p', { class: 'suave' }, soles(f.monto)),
      h('div', { class: 'dia-fijo-grilla' }, dias),
      h('div', { class: 'config-fila dia-fijo-auto' },
        h('div', { class: 'config-texto' }, h('strong', {}, 'Se paga solo'), h('span', { class: 'suave' }, 'Débito automático: se marca pagado ese día.')),
        interruptor(auto, 'Se paga solo', (v) => { auto = v; pintar(); })),
      resumen, msg,
      h('div', { class: 'acciones modal-acciones' }, btnGuardar,
        actual ? h('button', { type: 'button', class: 'boton enlace', onclick: () => enviar(0) }, 'Quitar día') : null,
        h('button', { type: 'button', class: 'boton', onclick: () => salir(null) }, 'Cancelar'))));
    pintar();
    document.body.append(dlg);
    dlg.showModal();
    animarVista(dlg);
  });
}

// Chip del día junto a cada fijo: "día 5", "auto · 5" o "+ día".
function chipDiaFijo(f) {
  const b = h('button', { type: 'button', class: 'chip-dia-fijo', title: 'Día en que se paga' });
  const pintar = () => {
    const x = fijoAutoDe(f.concepto);
    b.classList.toggle('vacio', !x);
    b.classList.toggle('auto', !!x?.auto);
    b.replaceChildren(...(x ? [x.auto ? icono('recargar') : icono('calendario'), h('span', {}, textoDia(x.dia))] : [h('span', {}, '+ día')]));
    b.title = x ? (x.auto ? `Se marca pagado solo: ${textoDia(x.dia)}` : `Te aviso: ${textoDia(x.dia)}`) : 'Elegir el día en que se paga';
  };
  b.addEventListener('click', async () => { if (await abrirDiaFijo(f)) { pintar(); document.querySelectorAll('.chip-dia-fijo, .aviso-fijos').forEach((c) => c.refrescar?.()); } });
  b.refrescar = pintar;
  pintar();
  return b;
}

// Inicio: fijos que vencen en 2 días o menos (o ya vencieron este mes) y siguen sin marcar.
// Inicio en computadora: el mismo criterio que usa el CSS para ponerlo todo en una pantalla.
function esComputadoraInicio() { return matchMedia('(min-width: 1024px)').matches; }

function avisoFijos() {
  const sitio = h('section', { class: 'avisos-inicio avisos-pres aviso-fijos' });
  const pintar = async () => {
    const hoy = hoyISO();
    const ym = hoy.slice(0, 7);
    const proximos = fijosAutoGuardados().filter((x) => !x.auto).map((x) => {
      const fecha = fechaDelFijo(x.dia, ym);
      return { ...x, fecha, mes: mesDelCiclo(fecha), dias: Math.round((deISO(fecha) - deISO(hoy)) / 86400000) };
    }).filter((x) => x.dias <= 2);
    const filas = [];
    for (const x of proximos) {
      let pres = leerCache('presupuesto:' + x.mes)?.datos;
      if (!pres) pres = (await cargarRapido('presupuesto', { mes: x.mes }, 'presupuesto:' + x.mes).catch(() => null))?.datos;
      const linea = fijosDe(pres?.filas).find((l) => normalizar(l.concepto) === normalizar(x.concepto));
      if (linea && !linea.pagado) filas.push({ x, linea });
    }
    const porFecha = new Map();
    filas.forEach((f) => porFecha.set(f.x.fecha, [...(porFecha.get(f.x.fecha) || []), f]));
    const grupos = [...porFecha.values()];
    const cuandoDe = (x) => (x.dias === 0 ? 'vence hoy' : x.dias === 1 ? 'vence mañana' : x.dias === 2 ? 'vence en 2 días' : `venció el ${fechaCorta(x.fecha)}`);
    sitio.replaceChildren(...grupos.flatMap((g) => g.length < 3 ? g : [{ grupo: g }]).map((item) => {
      if (item.grupo) {
        const g = item.grupo, x = g[0].x;
        const total = g.reduce((s, y) => s + (Number(y.linea.monto) || 0), 0);
        return h('a', { class: 'aviso-fila ' + (x.dias < 0 ? 'vencida' : 'justo'), href: '#presupuesto' },
          icono('calendario'),
          h('span', {}, h('strong', {}, `Pagar ${g.length} gastos fijos`), h('small', {}, `${cuandoDe(x)} · ${g.slice(0, 3).map((y) => nombreLinea(y.linea.concepto)).join(', ')}${g.length > 3 ? '…' : ''}`)),
          h('strong', { class: 'aviso-monto' }, soles(total)),
          icono('adelante'));
      }
      const { x, linea } = item;
      const cuando = cuandoDe(x);
      const fila = h('div', { class: 'aviso-fila ' + (x.dias < 0 ? 'vencida' : 'justo') },
        icono('calendario'),
        h('span', {}, h('strong', {}, `Pagar ${nombreLinea(linea.concepto)}`), h('small', {}, `${cuando} · márcalo al pagar`)),
        h('strong', { class: 'aviso-monto' }, soles(linea.monto)),
        botonFijo(linea, x.mes, (r) => { if (r.pagado) { fila.classList.add('hecho'); setTimeout(() => fila.remove(), sinMovimiento() ? 0 : 420); } }));
      return fila;
    }));
  };
  sitio.refrescar = pintar;
  pintar();
  cargarRapido('fijosAuto', {}, 'fijos-auto').then(pintar).catch(() => { /* sin datos: no se avisa */ });
  return sitio;
}

// ---------------------------------------------------------------------------
// Cuentas entre ustedes (v126, motor 1.14): quién le debe a quién. Cuenta sola cuando uno paga con lo suyo un
// gasto que "sale de" el otro, y se pueden anotar préstamos y devoluciones a mano. El fondo común no cuenta.
// ---------------------------------------------------------------------------
function motorCuentas() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 14); }
const mismoNombre = (x, y) => normalizar(nombreCorto(x)) === normalizar(nombreCorto(y));

// Ventanita base (se cierra con Esc o tocando afuera). Devuelve {dlg, caja, cerrar}.
function ventanita(clase, etiqueta) {
  const dlg = h('dialog', { class: `hoja-modal ${clase}`, 'aria-label': etiqueta });
  const caja = h('div', { class: 'cierre-caja' });
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return; cerrado = true;
    dlg.classList.add('cerrando');
    setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190);
  };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  dlg.append(caja);
  const abrir = () => { document.body.append(dlg); dlg.showModal(); animarVista(dlg); };
  return { dlg, caja, cerrar, abrir };
}

async function enviarCuenta(datos, alTerminar) {
  const r = await llamarApi('anotarCuenta', { idCliente: uuid(), ...datos }, { email: emailSesion() });
  guardarCache('cuentas', r);
  alTerminar?.(r);
  return r;
}

// "Anotar": quién le dio plata a quién, cuánto y para qué.
function abrirAnotarCuenta(alTerminar) {
  const yo = usuarioActual()?.nombre || '';
  const otros = responsables().filter((n) => !mismoNombre(n, yo));
  if (!yo || !otros.length) return;
  let otro = otros[0];
  let yoDi = true;
  const v = ventanita('cuenta-dlg', 'Anotar entre ustedes');
  const inMonto = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Monto' });
  const inNota = h('input', { type: 'text', maxlength: '120', autocomplete: 'off', placeholder: '¿Para qué? (opcional)', 'aria-label': 'Nota' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const dir = h('div', { class: 'cuenta-dir', role: 'group', 'aria-label': 'Quién le dio a quién' });
  const quienes = otros.length > 1 ? h('div', { class: 'opciones cuenta-otro' }) : null;
  const btn = h('button', { type: 'button', class: 'boton primario' }, 'Guardar');
  const pintar = () => {
    dir.replaceChildren(
      h('button', { type: 'button', class: 'opcion', 'aria-pressed': String(yoDi), onclick: () => { yoDi = true; pintar(); } },
        avatar(yo, 'mini'), h('span', { class: 'opcion-texto' }, `Yo le di a ${nombreCorto(otro)}`)),
      h('button', { type: 'button', class: 'opcion', 'aria-pressed': String(!yoDi), onclick: () => { yoDi = false; pintar(); } },
        avatar(otro, 'mini'), h('span', { class: 'opcion-texto' }, `${nombreCorto(otro)} me dio`)));
    quienes?.replaceChildren(...otros.map((n) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(n === otro), onclick: () => { otro = n; pintar(); } }, nombreCorto(n))));
  };
  btn.onclick = async () => {
    const monto = leerMonto(inMonto.value);
    if (!monto) { inMonto.focus(); msg.textContent = 'Escribe cuánto fue.'; msg.hidden = false; return; }
    msg.hidden = true;
    ocuparBoton(btn, 'Guardando…');
    try {
      await enviarCuenta({ de: yoDi ? yo : otro, a: yoDi ? otro : yo, monto, nota: inNota.value.trim() }, alTerminar);
      avisar('Anotado', 'ok');
      v.cerrar();
    } catch (e) {
      liberarBoton(btn, 'Guardar');
      msg.textContent = mensajeError(e, 'No se pudo anotar. Intenta de nuevo.'); msg.hidden = false;
    }
  };
  [inMonto, inNota].forEach((x) => x.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); btn.click(); } }));
  v.caja.append(...[
    h('p', { class: 'cierre-etq' }, 'Anotar entre ustedes'),
    quienes, dir,
    h('label', { class: 'cuenta-monto' }, h('span', {}, 'S/'), inMonto),
    h('div', { class: 'campo' }, inNota),
    msg,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar'))].filter(Boolean));
  pintar();
  v.abrir();
  inMonto.focus();
}

// "Saldar": el que debe le paga todo al otro.
function abrirSaldar(s, alTerminar) {
  const yo = usuarioActual()?.nombre || '';
  const v = ventanita('cuenta-dlg', 'Saldar');
  const btn = h('button', { type: 'button', class: 'boton primario' }, 'Sí, quedamos a mano');
  btn.onclick = async () => {
    ocuparBoton(btn, 'Guardando…');
    try {
      await enviarCuenta({ de: s.deudor, a: s.acreedor, monto: s.monto, nota: 'Saldado' }, alTerminar);
      avisar('¡A mano!', 'ok');
      v.cerrar();
    } catch (e) {
      liberarBoton(btn, 'Sí, quedamos a mano');
      avisar(mensajeError(e, 'No se pudo saldar.'), 'error');
    }
  };
  const quien = mismoNombre(s.deudor, yo) ? `¿Le pagaste ${soles(s.monto)} a ${nombreCorto(s.acreedor)}?`
    : mismoNombre(s.acreedor, yo) ? `¿${nombreCorto(s.deudor)} te pagó ${soles(s.monto)}?`
      : `¿${nombreCorto(s.deudor)} le pagó ${soles(s.monto)} a ${nombreCorto(s.acreedor)}?`;
  v.caja.append(
    h('div', { class: 'cuenta-pareja' }, avatar(s.deudor, 'grande'), h('span', { class: 'cuenta-flecha' }, icono('adelante')), avatar(s.acreedor, 'grande')),
    h('p', { class: 'cierre-etq' }, quien),
    h('p', { class: 'suave' }, 'Se anota como pago y la cuenta queda en cero.'),
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar')));
  v.abrir();
}

function filaMovCuenta(m, conBorrar, alBorrar) {
  const yo = usuarioActual()?.nombre || '';
  const pagaYo = mismoNombre(m.paga, yo), paraYo = mismoNombre(m.para, yo);
  const quien = m.tipo === 'gasto'
    ? (pagaYo ? `Pagaste por ${nombreCorto(m.para)}` : paraYo ? `${nombreCorto(m.paga)} pagó por ti` : `${nombreCorto(m.paga)} pagó por ${nombreCorto(m.para)}`)
    : (pagaYo ? `Le diste a ${nombreCorto(m.para)}` : paraYo ? `${nombreCorto(m.paga)} te dio` : `${nombreCorto(m.paga)} le dio a ${nombreCorto(m.para)}`);
  return h('li', { class: 'cuenta-mov' },
    h('span', { class: 'cuenta-mov-ico' }, icono(m.tipo === 'gasto' ? 'tarjetas' : 'billetera')),
    h('span', { class: 'cuenta-mov-texto' }, h('strong', {}, limpiarComercio(m.texto || '') || m.texto), h('small', { class: 'suave' }, `${quien} · ${fechaCorta(m.fecha)}`)),
    h('strong', { class: 'cuenta-mov-monto' }, soles(m.monto)),
    conBorrar && m.tipo === 'mano' ? h('button', { type: 'button', class: 'boton icono-solo', 'aria-label': 'Borrar', title: 'Borrar', onclick: async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { const r = await llamarApi('borrarCuenta', { id: m.id }, { email: emailSesion() }); guardarCache('cuentas', r); alBorrar?.(r); avisar('Borrado', 'ok'); }
      catch (e) { b.disabled = false; avisar(mensajeError(e, 'No se pudo borrar.'), 'error'); }
    } }, icono('papelera')) : null);
}

function abrirMovimientosCuenta(datos, alCambiar) {
  const v = ventanita('cuenta-dlg cuenta-lista-dlg', 'Movimientos entre ustedes');
  const lista = h('ul', { class: 'cuenta-movs' });
  const pintar = (d) => lista.replaceChildren(...(d.movimientos || []).map((m) => filaMovCuenta(m, true, (r) => { pintar(r); alCambiar?.(r); })));
  pintar(datos);
  v.caja.append(
    h('p', { class: 'cierre-etq' }, 'Movimientos entre ustedes'),
    h('p', { class: 'suave' }, `Desde el ${fechaCorta(datos.desde)}. Los anotados a mano se pueden borrar.`),
    (datos.movimientos || []).length ? lista : h('p', { class: 'suave' }, 'Todavía no hay movimientos.'),
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: v.cerrar }, 'Listo')));
  v.abrir();
}


// ---------------------------------------------------------------------------
// Metas de ahorro con fecha (v127, motor 1.15): objetivo y mes límite por ahorro; cuánto falta, cuánto apartar
// al mes y si con lo que se pone este mes se llega.
// ---------------------------------------------------------------------------
function motorMetas() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 15); }
const mesesEntreClaves = (desde, hasta) => { const [a1, m1] = desde.split('-').map(Number), [a2, m2] = hasta.split('-').map(Number); return (a2 * 12 + m2) - (a1 * 12 + m1); };
// Igual que el motor (planDeMeta).
function planDeMeta(objetivo, fecha, disponible, aporteMes, mes) {
  const faltan = Math.max(0, Math.round((objetivo - (disponible || 0)) * 100) / 100);
  const restantes = mesesEntreClaves(mes, fecha);
  let porMes = 0, estado;
  if (faltan <= 0) estado = 'lista';
  else if (restantes <= 0) estado = 'vencida';
  else { porMes = Math.ceil((faltan / restantes) * 100) / 100; estado = (aporteMes || 0) + 0.005 >= porMes ? 'bien' : 'atrasada'; }
  return { objetivo, fecha, faltan, mesesRestantes: restantes, porMes, estado, pct: objetivo > 0 ? Math.max(0, Math.min(100, ((disponible || 0) / objetivo) * 100)) : 0 };
}
function textoMeta(p, aporteMes) {
  if (p.estado === 'lista') return { clase: 'ok', texto: '¡Meta cumplida!' };
  if (p.estado === 'vencida') return { clase: 'mal', texto: `Se pasó el plazo · faltan ${soles(p.faltan)}` };
  if (p.estado === 'bien') return { clase: 'ok', texto: `Vas bien · ${soles(p.porMes)} al mes` };
  return { clase: 'aviso', texto: `Aparta ${soles(p.porMes)} al mes${aporteMes > 0 ? ` (hoy ${soles(aporteMes)})` : ''}` };
}

// Ventanita "Meta de <ahorro>": cuánto y para cuándo, con el cálculo en vivo.
function abrirMeta({ concepto, disponible, aporteMes, mes, actual }, alGuardar) {
  const nombre = nombreLinea(concepto);
  const v = ventanita('meta-dlg', `Meta de ${nombre}`);
  const inMonto = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Objetivo', value: actual?.objetivo ? String(actual.objetivo) : '' });
  let fecha = actual?.fecha || sumarMes(mes, 6);
  const atajos = [3, 6, 12, 24].map((n) => ({ n, clave: sumarMes(mes, n) }));
  const chips = h('div', { class: 'meta-plazos' });
  const clavesMes = Array.from({ length: 60 }, (_, k) => sumarMes(mes, k + 1));
  if (fecha && !clavesMes.includes(fecha)) clavesMes.unshift(fecha);
  const inMes = h('select', { 'aria-label': 'Mes de la meta' }, clavesMes.map((k) => h('option', { value: k, selected: k === fecha }, nombreMesClave(k) || k)));
  const resumen = h('div', { class: 'meta-calculo', 'aria-live': 'polite' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const btn = h('button', { type: 'button', class: 'boton primario' }, 'Guardar meta');
  const pintar = () => {
    chips.replaceChildren(...atajos.map((x) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(x.clave === fecha),
      onclick: () => { fecha = x.clave; inMes.value = fecha; pintar(); } }, x.n < 12 ? `${x.n} meses` : x.n === 12 ? '1 año' : '2 años')));
    const objetivo = leerMonto(inMonto.value) || 0;
    btn.disabled = !(objetivo > 0) || !fecha;
    if (!(objetivo > 0)) { resumen.replaceChildren(h('span', { class: 'suave' }, `Ya tienes ${soles(disponible)} en ${nombre}.`)); return; }
    const p = planDeMeta(objetivo, fecha, disponible, aporteMes, mes);
    const t = p.estado === 'bien' ? { clase: 'ok', texto: `Con los ${soles(aporteMes)} de este mes llegas` }
      : p.estado === 'atrasada' ? { clase: 'aviso', texto: aporteMes > 0 ? `Hoy pones ${soles(aporteMes)}: súbelo para llegar` : 'Ponle ese monto en el presupuesto para llegar' }
        : textoMeta(p, aporteMes);
    resumen.replaceChildren(
      h('div', { class: 'gp-barra meta-barra' }, h('i', { style: `width: ${p.pct}%` })),
      h('strong', {}, p.estado === 'lista' ? '¡Ya llegaste!' : p.estado === 'vencida' ? 'Elige un mes más adelante' : `${soles(p.porMes)} al mes`),
      h('small', { class: 'suave' }, p.estado === 'lista' || p.estado === 'vencida' ? `${soles(disponible)} de ${soles(objetivo)}`
        : `por ${p.mesesRestantes} ${p.mesesRestantes === 1 ? 'mes' : 'meses'} hasta ${mesCorto(fecha)} · faltan ${soles(p.faltan)}`),
      h('span', { class: `meta-estado ${t.clase}` }, t.texto));
  };
  inMonto.addEventListener('input', pintar);
  inMes.addEventListener('change', () => { if (/^\d{4}-\d{2}$/.test(inMes.value)) { fecha = inMes.value; pintar(); } });
  const guardar = async (objetivo) => {
    msg.hidden = true;
    ocuparBoton(btn, 'Guardando…');
    try {
      const r = await llamarApi('guardarMeta', { concepto, objetivo, fecha, mes }, { email: emailSesion() });
      guardarCache('ahorros:' + mes, r);
      avisar(objetivo ? `Meta de ${nombre}: ${soles(objetivo)} para ${mesCorto(fecha)}` : 'Meta quitada', 'ok');
      v.cerrar();
      alGuardar?.(r);
    } catch (e) {
      liberarBoton(btn, 'Guardar meta');
      msg.textContent = mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'); msg.hidden = false;
    }
  };
  btn.onclick = () => { const o = leerMonto(inMonto.value); if (o > 0) guardar(o); };
  inMonto.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); btn.click(); } });
  v.caja.append(...[
    h('p', { class: 'cierre-etq' }, `Meta de ${nombre}`),
    h('label', { class: 'cuenta-monto' }, h('span', {}, 'S/'), inMonto),
    h('p', { class: 'etq meta-pregunta' }, '¿Para cuándo?'),
    chips,
    h('label', { class: 'meta-mes' }, h('span', { class: 'suave' }, 'u otro mes'), inMes),
    resumen, msg,
    h('div', { class: 'acciones modal-acciones' }, btn,
      actual ? h('button', { type: 'button', class: 'boton enlace', onclick: () => guardar(0) }, 'Quitar meta') : null,
      h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar'))].filter(Boolean));
  pintar();
  v.abrir();
  inMonto.focus();
}

// ---------------------------------------------------------------------------
// Cuadre de saldos (v128, motor 1.16): comparar con lo que dice el banco. Tarjetas: el total del estado de
// cuenta contra lo anotado. Débito y Lemon: el saldo de hoy contra (saldo del último cuadre − lo anotado desde
// entonces). Si no cuadra, muestra la diferencia y ayuda a buscar (pendientes por confirmar y posibles repetidos).
// ---------------------------------------------------------------------------
function motorCuadre() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 16); }
const MEDIOS_DEBITO = [{ id: 'YAPE', etiqueta: 'Yape' }, { id: 'PLIN', etiqueta: 'Plin' }, { id: 'EFECTIVO', etiqueta: 'Débito / efectivo' }];

async function abrirCuadre() {
  const yo = usuarioActual()?.nombre || '';
  const [rt, rc, rp] = await Promise.all([
    cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo').catch(() => null),
    cargarRapido('cuadres', {}, 'cuadres').catch(() => null),
    cargarRapido('pendientes', {}, 'pendientes').catch(() => null),
  ]);
  const tarjetas = rt?.datos?.tarjetas || [];
  let cuadres = rc?.datos?.cuadres || {};
  const pendientes = (rp?.datos?.pendientes || estado.ultimosPendientes || []).filter((p) => !p.moneda || p.moneda === 'PEN');
  const tcs = tarjetas.filter((t) => t.id !== 'HORMIGA' && (t.estados || []).length);
  const hormiga = consumosDe(tarjetas, (t) => t.id === 'HORMIGA').filter((c) => !c.fecha || c.fecha <= hoyISO());
  let modo = tcs.length ? 'tc' : 'debito';
  let tcElegida = tcs.find((t) => (t.estados || []).some((e) => e.pendiente > 0))?.id || tcs[0]?.id;
  // Medios de "Mi débito": Yape, Plin, efectivo y mis tarjetas de débito (motor 1.21). Se buscan por su nombre en la hoja.
  const misDebitos = (leerCache('config')?.datos?.medios || []).filter((m) => m.tipo === 'debito' && mismoNombre(m.titular || '', yo)).map((m) => ({ id: m.id, etiqueta: m.etiqueta.split(' · ')[0], texto: m.etiqueta }));
  const mediosCuadre = [...MEDIOS_DEBITO, ...misDebitos];
  const textoMedio = (id) => mediosCuadre.find((m) => m.id === id)?.texto || id;
  let mediosDeb = (cuadres['debito|' + yo]?.medios?.length ? cuadres['debito|' + yo].medios : mediosCuadre.map((m) => m.id));
  const v = ventanita('cuadre-dlg', 'Cuadrar con el banco');
  const cuerpo = h('div', { class: 'cuadre-cuerpo' });
  const pestanas = h('div', { class: 'cuadre-pestanas', role: 'tablist' });
  const inMonto = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', 'aria-label': 'Lo que dice el banco' });
  v.caja.append(h('p', { class: 'cierre-etq' }, 'Cuadrar con el banco'), pestanas, cuerpo,
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: v.cerrar }, 'Listo')));

  const estadoTC = (t) => [...(t.estados || [])].filter((e) => e.vence).sort((x, y) => (y.pendiente > 0) - (x.pendiente > 0) || String(x.vence).localeCompare(String(y.vence)))[0] || (t.estados || [])[0];
  const anotadoCon = (medios, soloMio) => hormiga.filter((c) => medios.some((m) => normalizar(c.medio || '').startsWith(normalizar(textoMedio(m))))
    && (!soloMio || mismoNombre(c.responsable, yo))).reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const listaAyuda = (titulo, items) => items.length ? h('div', { class: 'cuadre-ayuda' }, h('p', { class: 'etq' }, titulo),
    h('ul', {}, items.map((x) => h('li', { class: x.justo ? 'justo' : '' }, h('span', {}, x.texto), h('strong', {}, soles(x.monto)), x.justo ? h('em', {}, '¡justo la diferencia!') : null)))) : null;
  const resultado = (dif, textoMas, textoMenos) => {
    if (Math.abs(dif) < 0.01) return h('div', { class: 'cuadre-res ok' }, h('span', { class: 'cuadre-ico' }, icono('check')), h('strong', {}, '¡Cuadra!'));
    return h('div', { class: 'cuadre-res ' + (dif > 0 ? 'mas' : 'menos') }, h('span', { class: 'cuadre-ico' }, icono('alerta')),
      h('div', {}, h('strong', {}, `${dif > 0 ? 'Faltan' : 'Sobran'} ${soles(Math.abs(dif))}`), h('small', {}, dif > 0 ? textoMas : textoMenos)));
  };
  const guardar = async (clave, saldo, extra = {}) => {
    try {
      const r = await llamarApi('guardarCuadre', { clave, saldo, ...extra }, { email: emailSesion() });
      cuadres = r?.cuadres || cuadres; guardarCache('cuadres', { cuadres });
      avisar('Cuadre guardado', 'ok'); inMonto.value = ''; pintar();
    } catch (e) { avisar(mensajeError(e, 'No se pudo guardar.'), 'error'); }
  };

  const pintarTC = () => {
    const t = tcs.find((x) => x.id === tcElegida);
    if (!t) return [h('p', { class: 'suave' }, 'No hay estados de cuenta de tarjetas todavía.')];
    const e = estadoTC(t);
    const app = Math.round((Number(e?.total) || 0) * 100) / 100;
    const clave = `tc|${t.id}|${e?.vence || ''}`;
    const previo = cuadres[clave];
    const banco = leerMonto(inMonto.value);
    const dif = banco === null || banco === undefined || inMonto.value.trim() === '' ? null : Math.round((banco - app) * 100) / 100;
    const pend = pendientes.filter((p) => idTarjetaDePendiente(p) === t.id && !directoPend(p));
    const consumos = e?.consumos || [];
    const repetidos = [];
    consumos.forEach((c, i) => consumos.slice(i + 1).forEach((d) => {
      if (Math.round(c.monto * 100) === Math.round(d.monto * 100) && Math.abs((deISO(c.fecha) - deISO(d.fecha)) / 86400000) <= 1) repetidos.push({ texto: `${limpiarComercio(c.descripcion)} y ${limpiarComercio(d.descripcion)}`, monto: c.monto });
    }));
    return [
      h('div', { class: 'opciones cuadre-tcs' }, tcs.map((x) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(x.id === tcElegida), onclick: () => { tcElegida = x.id; inMonto.value = ''; pintar(); } },
        chipTC(x.id, 'mini insignia'), h('span', { class: 'opcion-texto' }, nombreTC(x.id))))),
      h('p', { class: 'cuadre-app' }, h('span', { class: 'suave' }, `Para el pago del ${fechaCorta(e?.vence)}, la app tiene`), h('strong', {}, soles(app))),
      h('label', { class: 'cuenta-monto' }, h('span', {}, 'Banco S/'), inMonto),
      h('p', { class: 'suave cuadre-tip' }, 'Escribe el total del estado de cuenta que ves en la app del banco.'),
      dif === null ? (previo ? h('p', { class: 'suave' }, `Último cuadre: ${fechaCorta(previo.fecha)} · banco ${soles(previo.saldo)}`) : null)
        : resultado(dif, 'Hay consumos en el banco que no están anotados.', 'La app tiene algo de más: revisa repetidos o de otra tarjeta.'),
      dif !== null && dif > 0 ? listaAyuda('Por confirmar de esta tarjeta', pend.map((p) => ({ texto: `${limpiarComercio(p.comercio || '')} · ${fechaCorta(p.fecha)}`, monto: p.monto, justo: Math.abs(p.monto - dif) < 0.01 }))) : null,
      dif !== null && dif < 0 ? listaAyuda('Podrían estar repetidos', repetidos.map((x) => ({ ...x, justo: Math.abs(x.monto + dif) < 0.01 }))) : null,
      dif !== null ? h('button', { type: 'button', class: 'boton chico', onclick: () => guardar(clave, banco, { base: app }) }, icono('check'), 'Guardar este cuadre') : null,
    ];
  };

  const pintarCuenta = (tipo) => {
    const lemon = tipo === 'lemon';
    const clave = `${tipo}|${yo}`;
    const medios = lemon ? ['LEMON'] : mediosDeb;
    const anotado = Math.round(anotadoCon(medios, !lemon) * 100) / 100;
    const punto = cuadres[clave];
    const banco = leerMonto(inMonto.value);
    const hay = inMonto.value.trim() !== '' && banco !== null;
    const chipsMedios = lemon ? null : h('div', { class: 'opciones cuadre-medios' }, mediosCuadre.map((m) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(medios.includes(m.id)),
      onclick: () => { mediosDeb = medios.includes(m.id) ? medios.filter((x) => x !== m.id) : [...medios, m.id]; pintar(); } }, m.etiqueta)));
    if (!punto) {
      return [
        chipsMedios,
        h('p', { class: 'cuadre-app' }, h('span', { class: 'suave' }, lemon ? 'Primera vez con Lemon' : 'Primera vez con tu débito'), h('strong', {}, 'Punto de partida')),
        h('label', { class: 'cuenta-monto' }, h('span', {}, 'Hoy S/'), inMonto),
        h('p', { class: 'suave cuadre-tip' }, `Escribe el saldo que ves hoy en ${lemon ? 'Lemon' : 'tu cuenta'}. Desde ahí la app sigue lo que anotes.`),
        hay ? h('button', { type: 'button', class: 'boton primario', onclick: () => guardar(clave, banco, { base: anotado, medios }) }, 'Guardar punto de partida') : null,
      ];
    }
    const gastado = Math.round((anotado - punto.base) * 100) / 100;
    const esperado = Math.round((punto.saldo - gastado) * 100) / 100;
    const dif = hay ? Math.round((banco - esperado) * 100) / 100 : null;
    const pend = pendientes.filter((p) => lemon ? String(p.medioSugerido || p.banco || '').toUpperCase() === 'LEMON' : (directoPend(p) && String(p.medioSugerido || '').toUpperCase() !== 'LEMON'));
    return [
      chipsMedios,
      h('p', { class: 'cuadre-app' }, h('span', { class: 'suave' }, `Desde el ${fechaCorta(punto.fecha)} (${soles(punto.saldo)}) anotaste ${soles(gastado)}. Deberías tener`), h('strong', {}, soles(esperado))),
      h('label', { class: 'cuenta-monto' }, h('span', {}, 'Hoy S/'), inMonto),
      dif === null ? h('p', { class: 'suave cuadre-tip' }, `Escribe el saldo que ves hoy en ${lemon ? 'Lemon' : 'tu cuenta'}.`)
        : Math.abs(dif) < 0.01 ? resultado(0) : h('div', { class: 'cuadre-res ' + (dif > 0 ? 'entro' : 'menos') }, h('span', { class: 'cuadre-ico' }, icono(dif > 0 ? 'sube' : 'baja')),
          h('div', {}, h('strong', {}, dif > 0 ? `Entraron ${soles(dif)} sin anotar` : `Salieron ${soles(-dif)} sin anotar`),
            h('small', {}, dif > 0 ? (lemon ? '¿Una recarga de Pasajes?' : '¿Sueldo, un depósito o una devolución?') : 'Falta anotar algún gasto: revisa lo de abajo.'))),
      dif !== null && dif < 0 ? listaAyuda('Por confirmar', pend.map((p) => ({ texto: `${limpiarComercio(p.comercio || '')} · ${fechaCorta(p.fecha)}`, monto: p.monto, justo: Math.abs(p.monto + dif) < 0.01 }))) : null,
      hay ? h('button', { type: 'button', class: 'boton chico', onclick: () => guardar(clave, banco, { base: anotado, medios }) }, icono('check'), 'Guardar como nuevo punto de partida') : null,
    ];
  };

  function pintar() {
    pestanas.replaceChildren(...[['tc', 'Tarjetas'], ['debito', 'Mi débito'], ['lemon', 'Lemon']].map(([k, t]) => h('button', { type: 'button', role: 'tab', class: 'cuadre-pestana', 'aria-selected': String(modo === k),
      onclick: () => { modo = k; inMonto.value = ''; pintar(); } }, t)));
    const enfocado = document.activeElement === inMonto;
    cuerpo.replaceChildren(...(modo === 'tc' ? pintarTC() : pintarCuenta(modo)).filter(Boolean));
    if (enfocado) { inMonto.focus(); const n = inMonto.value.length; inMonto.setSelectionRange(n, n); }
  }
  let reloj = 0;
  inMonto.addEventListener('input', () => { clearTimeout(reloj); reloj = setTimeout(pintar, 350); });
  inMonto.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(reloj); pintar(); } });
  pintar();
  v.abrir();
  inMonto.focus();
}
const directoPend = (p) => ['PLIN', 'YAPE', 'EFECTIVO', 'LEMON'].includes(String(p.medioSugerido || '').toUpperCase());

// ---------------------------------------------------------------------------
// Avisos por WhatsApp (v129, motor 1.17): cada uno conecta su WhatsApp con CallMeBot (gratis, uso personal).
// Los mismos avisos que llegan por correo llegan también por WhatsApp.
// ---------------------------------------------------------------------------
function motorWhatsapp() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 17); }
const PAGINA_CALLMEBOT = 'https://www.callmebot.com/blog/free-api-whatsapp-messages/';
const MENSAJE_CALLMEBOT = 'I allow callmebot to send me messages';

function abrirConectarWhatsapp(alTerminar) {
  const v = ventanita('conectar-avisos wsp-dlg', 'Avisos por WhatsApp');
  v.caja.classList.add('conectar-caja', 'entra');
  setTimeout(() => v.caja.classList.remove('entra'), 900);
  const inTel = h('input', { type: 'tel', autocomplete: 'tel', placeholder: '+51 987 654 321', value: '+51 ', 'aria-label': 'Tu número de WhatsApp' });
  const inClave = h('input', { type: 'text', autocomplete: 'off', inputmode: 'numeric', placeholder: 'Ej. 1234567', 'aria-label': 'Clave (apikey)' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const btn = h('button', { type: 'button', class: 'boton primario' }, 'Conectar');
  const enlace = (texto, url) => h('a', { class: 'boton chico', href: url, target: '_blank', rel: 'noopener' }, texto, icono('adelante'));
  const paso = (n, titulo, ayuda, ...controles) => h('li', { class: 'conectar-paso activo', style: `--i: ${n}` },
    h('span', { class: 'conectar-num' }, String(n)),
    h('div', { class: 'conectar-txt' }, h('strong', {}, titulo), h('small', { class: 'suave' }, ayuda), h('div', { class: 'conectar-ctrl' }, controles)));
  btn.onclick = async () => {
    msg.hidden = true;
    if (inTel.value.replace(/\D/g, '').length < 9) { msg.textContent = 'Escribe tu número con el código del país.'; msg.hidden = false; inTel.focus(); return; }
    if (!inClave.value.trim()) { msg.textContent = 'Pega la clave que te mandó el bot.'; msg.hidden = false; inClave.focus(); return; }
    ocuparBoton(btn, 'Probando…');
    try {
      const r = await llamarApi('guardarWhatsapp', { telefono: inTel.value, apikey: inClave.value.trim() }, { email: emailSesion() });
      guardarCache('whatsapp', r);
      avisar('¡WhatsApp conectado! Revisa el mensaje de bienvenida.', 'ok');
      v.cerrar();
      alTerminar?.(r);
    } catch (e) {
      liberarBoton(btn, 'Conectar');
      msg.textContent = mensajeError(e, 'No se pudo conectar. Revisa el número y la clave.'); msg.hidden = false;
    }
  };
  v.caja.append(
    h('span', { class: 'conectar-ico' }, icono('novedad')),
    h('p', { class: 'cierre-etq' }, 'Avisos por WhatsApp'),
    h('p', { class: 'suave' }, 'Los mismos avisos del correo, en tu WhatsApp. Una sola vez, desde tu celular.'),
    h('ol', { class: 'conectar-pasos' },
      paso(1, 'Agrega el número de CallMeBot', 'Está en su página. Si dice que está lleno, vuelve en unos días.', enlace('Ver el número', PAGINA_CALLMEBOT)),
      paso(2, 'Mándale este mensaje por WhatsApp', 'Te responde con tu clave (apikey) en unos segundos.', chipCopiar(MENSAJE_CALLMEBOT)),
      paso(3, 'Pega tu número y la clave', 'Te llegará un mensaje de bienvenida para comprobar.',
        h('div', { class: 'wsp-campos' }, inTel, inClave))),
    h('p', { class: 'suave conectar-pie' }, 'CallMeBot es un servicio gratuito de terceros: tus avisos pasan por él para llegar a tu WhatsApp.'),
    msg,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar')));
  v.abrir();
}

// WhatsApp oficial de Meta (v130, motor 1.18): número de prueba de la Cloud API, gratis hasta 5 destinatarios.
function motorWhatsappMeta() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 18); }
const PAGINA_META_APPS = 'https://developers.facebook.com/apps/';

function abrirWhatsappMeta(estadoActual, alTerminar) {
  let est = estadoActual || {};
  let cambiarDatos = !est.meta?.configurado;
  const v = ventanita('conectar-avisos wsp-dlg', 'WhatsApp oficial');
  v.caja.classList.add('conectar-caja');
  const inToken = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Token (empieza con EAA…)', 'aria-label': 'Token de Meta' });
  const inId = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Phone number ID', 'aria-label': 'Identificador del número' });
  const inTel = h('input', { type: 'tel', autocomplete: 'tel', placeholder: '+51 987 654 321', value: '+51 ', 'aria-label': 'Tu número de WhatsApp' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const pasos = h('ol', { class: 'conectar-pasos' });
  const error = (texto) => { msg.textContent = texto; msg.hidden = false; };
  const paso = (n, hecho, titulo, ayuda, ...controles) => h('li', { class: 'conectar-paso' + (hecho ? ' hecho' : ' activo'), style: `--i: ${n}` },
    h('span', { class: 'conectar-num' }, hecho ? icono('check') : String(n)),
    h('div', { class: 'conectar-txt' }, h('strong', {}, titulo), h('small', { class: 'suave' }, ayuda),
      controles.filter(Boolean).length ? h('div', { class: 'conectar-ctrl' }, controles.filter(Boolean)) : null));
  const btnDatos = h('button', { type: 'button', class: 'boton chico primario' }, 'Guardar datos');
  btnDatos.onclick = async () => {
    msg.hidden = true;
    if (inToken.value.trim().length < 30) { error('Pega el token completo.'); inToken.focus(); return; }
    if (inId.value.replace(/\D/g, '').length < 8) { error('Pega el «Phone number ID».'); inId.focus(); return; }
    ocuparBoton(btnDatos, 'Comprobando…');
    try {
      est = await llamarApi('guardarWhatsappMeta', { token: inToken.value.trim(), phoneId: inId.value.trim() }, { email: emailSesion() });
      guardarCache('whatsapp', est);
      inToken.value = ''; cambiarDatos = false;
      avisar(`Meta conectado${est.meta?.numero ? ` · número ${est.meta.numero}` : ''}`, 'ok');
      pintar();
    } catch (e) { liberarBoton(btnDatos, 'Guardar datos'); error(mensajeError(e, 'Meta no aceptó los datos.')); }
  };
  const btnTel = h('button', { type: 'button', class: 'boton chico primario' }, 'Conectar mi número');
  btnTel.onclick = async () => {
    msg.hidden = true;
    if (inTel.value.replace(/\D/g, '').length < 9) { error('Escribe tu número con el código del país.'); inTel.focus(); return; }
    ocuparBoton(btnTel, 'Enviando…');
    try {
      est = await llamarApi('guardarWhatsapp', { via: 'meta', telefono: inTel.value }, { email: emailSesion() });
      guardarCache('whatsapp', est);
      avisar('¡Conectado! Te llegó un «Hello World» de Meta.', 'ok');
      pintar(); alTerminar?.(est);
    } catch (e) { liberarBoton(btnTel, 'Conectar mi número'); error(mensajeError(e, 'No se pudo conectar tu número.')); }
  };
  const btnProbar = h('button', { type: 'button', class: 'boton chico' }, 'Probar aviso');
  btnProbar.onclick = async () => {
    ocuparBoton(btnProbar, 'Enviando…');
    try { const r = await llamarApi('probarWhatsapp', {}, { email: emailSesion() }); if (r?.enviado) avisar('Aviso de prueba enviado', 'ok'); else error(r?.motivo || 'No salió.'); }
    catch (e) { error(mensajeError(e, 'No se pudo enviar.')); }
    liberarBoton(btnProbar, 'Probar aviso');
  };
  function pintar() {
    const datosListos = !!est.meta?.configurado && !cambiarDatos;
    const miNumero = est.conectado && est.via === 'meta';
    pasos.replaceChildren(
      paso(1, datosListos, 'Datos de tu app de Meta', datosListos ? `Listo · plantilla «${est.meta.plantilla}». Se hace una sola vez para los dos.`
        : 'En developers.facebook.com › tu app › WhatsApp › API Setup: copia el token permanente y el «Phone number ID».',
      ...(datosListos ? [h('button', { type: 'button', class: 'boton chico enlace', onclick: () => { cambiarDatos = true; pintar(); } }, 'Cambiar')]
        : [h('div', { class: 'wsp-campos' }, inToken, inId), btnDatos, h('a', { class: 'boton chico', href: PAGINA_META_APPS, target: '_blank', rel: 'noopener' }, 'Abrir Meta', icono('adelante'))])),
      paso(2, miNumero, 'Tu número de WhatsApp', miNumero ? `Conectado: ${est.telefono}.` : 'Tiene que estar en la lista de destinatarios de la app (hasta 5 números). Te llega un «Hello World».',
        ...(miNumero ? [] : [h('div', { class: 'wsp-campos' }, inTel), datosListos ? btnTel : null])),
      paso(3, false, 'Plantilla «aviso_finfamily» aprobada', 'Meta revisa el texto de los avisos (suele tardar minutos). Mientras tanto siguen llegando por correo.',
        miNumero ? btnProbar : null));
  }
  v.caja.append(
    h('span', { class: 'conectar-ico' }, icono('novedad')),
    h('p', { class: 'cierre-etq' }, 'WhatsApp oficial (Meta)'),
    h('p', { class: 'suave' }, 'Gratis con el número de prueba de Meta. Los avisos llegan desde ese número a tu WhatsApp.'),
    pasos, msg,
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: v.cerrar }, 'Listo'),
      h('button', { type: 'button', class: 'boton enlace', onclick: () => { v.cerrar(); abrirConectarWhatsapp(alTerminar); } }, 'Usar CallMeBot')));
  pintar();
  v.abrir();
}

// WhatsApp con Green API (v132, motor 1.19): tu WhatsApp vinculado por QR manda los avisos (plan gratis: 3 chats).
function motorWhatsappGreen() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 19); }
const CONSOLA_GREEN = 'https://console.green-api.com';

function abrirWhatsappGreen(estadoActual, alTerminar) {
  let est = estadoActual || {};
  let cambiarDatos = !est.green?.configurado;
  const v = ventanita('conectar-avisos wsp-dlg', 'WhatsApp con Green API');
  v.caja.classList.add('conectar-caja');
  const inUrl = h('input', { type: 'url', autocomplete: 'off', placeholder: 'apiUrl (ej. https://7103.api.greenapi.com)', 'aria-label': 'apiUrl' });
  const inId = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'idInstance (solo números)', 'aria-label': 'idInstance' });
  const inToken = h('input', { type: 'password', autocomplete: 'off', placeholder: 'apiTokenInstance', 'aria-label': 'apiTokenInstance' });
  const inTel = h('input', { type: 'tel', autocomplete: 'tel', placeholder: '+51 987 654 321', value: '+51 ', 'aria-label': 'Tu número de WhatsApp' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const pasos = h('ol', { class: 'conectar-pasos' });
  const error = (t) => { msg.textContent = t; msg.hidden = false; };
  const paso = (n, hecho, titulo, ayuda, ...controles) => h('li', { class: 'conectar-paso' + (hecho ? ' hecho' : ' activo'), style: `--i: ${n}` },
    h('span', { class: 'conectar-num' }, hecho ? icono('check') : String(n)),
    h('div', { class: 'conectar-txt' }, h('strong', {}, titulo), h('small', { class: 'suave' }, ayuda),
      controles.filter(Boolean).length ? h('div', { class: 'conectar-ctrl' }, controles.filter(Boolean)) : null));
  const btnDatos = h('button', { type: 'button', class: 'boton chico primario' }, 'Guardar datos');
  btnDatos.onclick = async () => {
    msg.hidden = true;
    if (inId.value.replace(/\D/g, '').length < 6) { error('Pega el idInstance.'); inId.focus(); return; }
    if (inToken.value.trim().length < 20) { error('Pega el apiTokenInstance completo.'); inToken.focus(); return; }
    ocuparBoton(btnDatos, 'Comprobando…');
    try {
      est = await llamarApi('guardarWhatsappGreen', { apiUrl: inUrl.value.trim() || undefined, idInstance: inId.value.trim(), apiToken: inToken.value.trim() }, { email: emailSesion() });
      guardarCache('whatsapp', est);
      inToken.value = ''; cambiarDatos = false;
      avisar('Green API conectado', 'ok');
      pintar();
    } catch (e) { liberarBoton(btnDatos, 'Guardar datos'); error(mensajeError(e, 'Green API no aceptó los datos.')); }
  };
  const btnTel = h('button', { type: 'button', class: 'boton chico primario' }, 'Conectar mi número');
  btnTel.onclick = async () => {
    msg.hidden = true;
    if (inTel.value.replace(/\D/g, '').length < 9) { error('Escribe tu número con el código del país.'); inTel.focus(); return; }
    ocuparBoton(btnTel, 'Enviando…');
    try {
      est = await llamarApi('guardarWhatsapp', { via: 'green', telefono: inTel.value }, { email: emailSesion() });
      guardarCache('whatsapp', est);
      avisar('¡Conectado! Revisa el mensaje de bienvenida en WhatsApp.', 'ok');
      pintar(); alTerminar?.(est);
    } catch (e) { liberarBoton(btnTel, 'Conectar mi número'); error(mensajeError(e, 'No se pudo conectar tu número.')); }
  };
  function pintar() {
    const datosListos = !!est.green?.configurado && !cambiarDatos;
    const miNumero = est.conectado && est.via === 'green';
    pasos.replaceChildren(
      paso(1, datosListos, 'Cuenta gratis en Green API y QR', datosListos ? `Listo${est.green?.numero ? ` · manda desde ${est.green.numero}` : ''}. Se hace una sola vez para los dos.`
        : 'Crea tu cuenta (solo correo), crea una instancia «Developer» (gratis), toca «Get QR» y escanéalo en WhatsApp › Dispositivos vinculados. Luego copia aquí los 3 datos.',
      ...(datosListos ? [h('button', { type: 'button', class: 'boton chico enlace', onclick: () => { cambiarDatos = true; pintar(); } }, 'Cambiar')]
        : [h('div', { class: 'wsp-campos' }, inUrl, inId, inToken), btnDatos, h('a', { class: 'boton chico', href: CONSOLA_GREEN, target: '_blank', rel: 'noopener' }, 'Abrir Green API', icono('adelante'))])),
      paso(2, miNumero, 'Tu número de WhatsApp', miNumero ? `Conectado: ${est.telefono}.` : 'El número donde quieres recibir tus avisos. Te llega un mensaje de bienvenida.',
        ...(miNumero ? [] : [h('div', { class: 'wsp-campos' }, inTel), datosListos ? btnTel : null])));
  }
  v.caja.append(
    h('span', { class: 'conectar-ico' }, icono('novedad')),
    h('p', { class: 'cierre-etq' }, 'Avisos por WhatsApp'),
    h('p', { class: 'suave' }, 'Gratis con Green API: tu WhatsApp vinculado manda los avisos. Si es tu mismo número, a ti te llegan al chat «Tú» sin sonido.'),
    pasos, msg,
    h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: v.cerrar }, 'Listo'),
      h('button', { type: 'button', class: 'boton enlace', onclick: () => { v.cerrar(); (motorWhatsappMeta() ? abrirWhatsappMeta(est, alTerminar) : abrirConectarWhatsapp(alTerminar)); } }, 'Otras formas')));
  pintar();
  v.abrir();
}

// Fila de Ajustes › Avisos.
function filaWhatsapp() {
  const control = h('span', { class: 'wsp-control' });
  const fila = filaConfig('WhatsApp', 'Recibe los avisos también en tu WhatsApp.', control);
  const pintarCon = (d) => {
    if (!d) { control.replaceChildren(h('span', { class: 'suave' }, '…')); return; }
    if (!d.conectado) {
      control.replaceChildren(h('button', { type: 'button', class: 'boton chico primario', onclick: () => (motorWhatsappGreen() ? abrirWhatsappGreen(d, pintarCon) : motorWhatsappMeta() ? abrirWhatsappMeta(d, pintarCon) : abrirConectarWhatsapp(pintarCon)) }, 'Conectar'));
      return;
    }
    const probar = h('button', { type: 'button', class: 'boton chico', onclick: async () => {
      ocuparBoton(probar, 'Enviando…');
      try { const r = await llamarApi('probarWhatsapp', {}, { email: emailSesion() }); avisar(r?.enviado ? 'Mensaje de prueba enviado' : `No salió: ${r?.motivo || 'revisa la clave'}`, r?.enviado ? 'ok' : 'error'); }
      catch (e) { avisar(mensajeError(e, 'No se pudo enviar.'), 'error'); }
      liberarBoton(probar, 'Probar');
    } }, 'Probar');
    const quitar = h('button', { type: 'button', class: 'boton chico enlace', onclick: async () => {
      try { const r = await llamarApi('guardarWhatsapp', { quitar: true }, { email: emailSesion() }); guardarCache('whatsapp', r); pintarCon(r); avisar('WhatsApp desconectado', 'ok'); }
      catch (e) { avisar(mensajeError(e, 'No se pudo quitar.'), 'error'); }
    } }, 'Quitar');
    const ver = d.via === 'green' && motorWhatsappGreen() ? h('button', { type: 'button', class: 'boton chico enlace', onclick: () => abrirWhatsappGreen(d, pintarCon) }, 'Ver')
      : d.via === 'meta' && motorWhatsappMeta() ? h('button', { type: 'button', class: 'boton chico enlace', onclick: () => abrirWhatsappMeta(d, pintarCon) }, 'Ver') : null;
    control.replaceChildren(...[h('span', { class: 'pill ok', title: d.via === 'green' ? 'Green API' : d.via === 'meta' ? 'WhatsApp oficial (Meta)' : 'CallMeBot' }, d.telefono || 'Conectado'), probar, ver, quitar].filter(Boolean));
    fila.querySelector('.wsp-registro')?.remove();
    const reg = bloqueRegistroWhatsapp(d);
    if (reg) fila.append(reg);
  };
  pintarCon(leerCache('whatsapp')?.datos || null);
  cargarRapido('whatsapp', {}, 'whatsapp').then((r) => pintarCon(r?.datos)).catch(() => fila.remove());
  return fila;
}

// ---------------------------------------------------------------------------
// v133 (motor 1.20): pases entre ustedes, tope de antojos, antojos → metas y anotar gastos por WhatsApp.
// ---------------------------------------------------------------------------
function motorV120() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 20); }

// ¿Es un pase de plata a la otra persona? ("Yape a PersonaB…", "Plin a PersonaA…"). Devuelve su nombre o ''.
function otroDePase(texto, quien) {
  const t = ' ' + normalizar(texto) + ' ';
  if (!/\b(yape|plin|transferencia|transf|te envio|enviaste)\b|^ a /.test(t)) return '';
  return responsables().find((n) => !mismoNombre(n, quien) && nombreCorto(n).length >= 3 && t.includes(' ' + normalizar(nombreCorto(n)))) || '';
}

// Ventanita para un gasto ya anotado que en realidad fue un pase: a Cuentas (se lo prestó) o solo borrarlo.
function abrirNoEraGasto({ c, quien, otro, base, alTerminar }) {
  const v = ventanita('cuenta-dlg', 'No era gasto');
  const accion = async (btn, aCuentas) => {
    ocuparBoton(btn, 'Guardando…');
    try {
      if (aCuentas) await enviarCuenta({ de: quien, a: otro, monto: Number(c.monto), nota: limpiarComercio(c.descripcion) || 'Pase' });
      await llamarApi('borrarGasto', base, { email: emailSesion() });
      estado.cambioDesde = Date.now();
      v.cerrar();
      avisar(aCuentas ? `Pasó a Cuentas: ${nombreCorto(otro)} te debe ${soles(c.monto)}` : 'Quitado de los gastos', 'ok');
      alTerminar?.();
    } catch (e) { liberarBoton(btn, aCuentas ? 'Se lo presté' : 'Solo fue un pase'); avisar(mensajeError(e, 'No se pudo cambiar.'), 'error'); }
  };
  const b1 = h('button', { type: 'button', class: 'boton primario' }, 'Se lo presté');
  const b2 = h('button', { type: 'button', class: 'boton' }, 'Solo fue un pase');
  b1.onclick = () => accion(b1, true);
  b2.onclick = () => accion(b2, false);
  v.caja.append(
    h('div', { class: 'cuenta-pareja' }, avatar(quien, 'grande'), h('span', { class: 'cuenta-flecha' }, icono('adelante')), avatar(otro, 'grande')),
    h('p', { class: 'cierre-etq' }, `${soles(c.monto)} a ${nombreCorto(otro)}`),
    h('p', { class: 'suave' }, `Un pase de plata entre ustedes no es gasto. Si se lo prestaste, queda en Cuentas (${nombreCorto(otro)} te lo debe); si no, solo se quita.`),
    h('div', { class: 'acciones modal-acciones' }, b1, b2, h('button', { type: 'button', class: 'boton enlace', onclick: v.cerrar }, 'Cancelar')));
  v.abrir();
}

// ---- Tope semanal de antojos ----
function abrirAntojos(d, alGuardar) {
  const conceptosCfg = leerCache('config')?.datos?.conceptos || CONCEPTOS_LOCAL;
  let elegidos = new Set((d?.conceptos || []).map((x) => normalizar(x)));
  const sugerido = Math.max(10, Math.round(((d?.promedioSemanal || 0) * 0.8) / 10) * 10);
  const v = ventanita('meta-dlg antojos-dlg', 'Tope de antojos');
  const inTope = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: String(sugerido), 'aria-label': 'Tope por semana', value: d?.tope ? String(d.tope) : '' });
  const chips = h('div', { class: 'opciones chicas antojos-chips' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const pintar = () => chips.replaceChildren(...conceptosCfg.map((c) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(elegidos.has(normalizar(c))),
    onclick: () => { const k = normalizar(c); if (elegidos.has(k)) elegidos.delete(k); else elegidos.add(k); pintar(); } }, catIco(c), h('span', { class: 'opcion-texto' }, c))));
  const guardar = async (btn, tope) => {
    msg.hidden = true;
    ocuparBoton(btn, 'Guardando…');
    try {
      const r = await llamarApi('guardarAntojos', { tope, conceptos: conceptosCfg.filter((c) => elegidos.has(normalizar(c))) }, { email: emailSesion() });
      guardarCache('antojos', r);
      avisar(tope ? `Tope de antojos: ${soles(tope)} por semana` : 'Tope de antojos apagado', 'ok');
      v.cerrar(); alGuardar?.(r);
    } catch (e) { liberarBoton(btn, btn.dataset.texto); msg.textContent = mensajeError(e, 'No se pudo guardar.'); msg.hidden = false; }
  };
  const btn = h('button', { type: 'button', class: 'boton primario', 'data-texto': 'Guardar' }, 'Guardar');
  btn.onclick = () => { const t = leerMonto(inTope.value) || sugerido; guardar(btn, t); };
  const apagar = d?.tope ? h('button', { type: 'button', class: 'boton enlace', 'data-texto': 'Apagar' }, 'Apagar') : null;
  if (apagar) apagar.onclick = () => guardar(apagar, 0);
  v.caja.append(...[
    h('p', { class: 'cierre-etq' }, 'Tope semanal de antojos'),
    h('p', { class: 'suave' }, d?.promedioSemanal ? `En las últimas 4 semanas gastaron ${soles(d.promedioSemanal)} por semana en esto. Sugerido: ${soles(sugerido)} (20 % menos).` : 'Elige qué cuenta como antojo y cuánto por semana.'),
    chips,
    h('label', { class: 'cuenta-monto' }, h('span', {}, 'S/'), inTope),
    h('p', { class: 'suave cuadre-tip' }, 'De lunes a domingo. Les aviso al 80 % y si se pasan, por correo y WhatsApp.'),
    msg,
    h('div', { class: 'acciones modal-acciones' }, btn, apagar, h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar'))].filter(Boolean));
  pintar();
  v.abrir();
}

// Inicio: "Entre ustedes" y "Antojos" como dos tiras compactas lado a lado (v139), en vez de dos paneles casi vacíos.
// SVG armado aquí con números, nunca con datos de afuera.
function svgFijo(texto, clase = 'anillo-svg') { const s = document.createElement('span'); s.className = clase; s.innerHTML = texto; return s; }
function anilloTira(pct, nivel) {
  const C = 2 * Math.PI * 17;
  return h('span', { class: `tira-ico tira-anillo ${nivel}` },
    svgFijo(`<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="anillo-fondo" cx="22" cy="22" r="17"/><circle class="anillo-valor" cx="22" cy="22" r="17" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" data-offset="${(C * (1 - Math.min(100, pct) / 100)).toFixed(1)}"/></svg>`),
    h('b', {}, `${Math.min(999, Math.round(pct))}%`));
}
function tira(clase) {
  const principal = h('button', { type: 'button', class: 'tira-principal' });
  const accion = h('span', { class: 'tira-accion' });
  const caja = h('div', { class: `tira ${clase}` }, principal, accion);
  caja.pintar = ({ ico, etiqueta, valor, contar, sub, alTocar, boton, titulo }) => {
    principal.replaceChildren(ico, h('span', { class: 'tira-texto' },
      h('small', {}, etiqueta),
      h('strong', contar != null ? { 'data-contar': String(contar) } : {}, contar != null ? soles(0) : valor),
      sub ? h('span', {}, sub) : null));
    principal.onclick = alTocar;
    principal.title = titulo || '';
    accion.replaceChildren(...[boton || icono('adelante')].filter(Boolean));
    caja.classList.add('tira-lista');
    animarVista(caja);
  };
  return caja;
}
function tiraCuentas() {
  const t = tira('tira-cuentas');
  const pintar = (d) => {
    if (!d) { t.remove(); return; }
    const recargar = (r) => pintar(r);
    const yo = usuarioActual()?.nombre || '';
    const s = (d.saldos || [])[0];
    const quien = !s ? '' : mismoNombre(s.deudor, yo) ? `Le debes a ${nombreCorto(s.acreedor)}`
      : mismoNombre(s.acreedor, yo) ? `${nombreCorto(s.deudor)} te debe` : `${nombreCorto(s.deudor)} le debe a ${nombreCorto(s.acreedor)}`;
    const movs = (d.movimientos || []).length;
    t.classList.toggle('a-mano', !s);
    t.pintar({
      ico: s ? h('span', { class: 'tira-ico pareja' }, avatar(s.deudor, 'mini'), avatar(s.acreedor, 'mini')) : h('span', { class: 'tira-ico ok' }, icono('check')),
      etiqueta: 'Entre ustedes',
      valor: 'A mano', contar: s ? s.monto : null,
      sub: s ? quien : movs ? `${movs} movimiento${movs === 1 ? '' : 's'} anotado${movs === 1 ? '' : 's'}` : 'Nadie le debe a nadie',
      titulo: movs ? 'Ver lo anotado entre ustedes' : 'Anotar algo entre ustedes',
      alTocar: () => (movs ? abrirMovimientosCuenta(d, recargar) : abrirAnotarCuenta(recargar)),
      boton: s ? h('button', { type: 'button', class: 'boton chico primario', onclick: () => abrirSaldar(s, recargar) }, icono('check'), 'Saldar')
        : h('button', { type: 'button', class: 'tira-mas', title: 'Anotar', 'aria-label': 'Anotar entre ustedes', onclick: () => abrirAnotarCuenta(recargar) }, icono('mas')),
    });
  };
  cargarRapido('cuentas', {}, 'cuentas').then((r) => pintar(r?.datos)).catch(() => t.remove());
  return t;
}
function tiraAntojos() {
  const t = tira('tira-antojos');
  const pintar = (d) => {
    if (!d || (!d.configurado && !(d.promedioSemanal > 0))) { t.remove(); return; }
    const recargar = (r) => pintar(r);
    const que = (d.conceptos || []).slice(0, 3).map((x) => x.split(' ')[0].toLowerCase()).join(', ');
    if (!d.configurado) {
      const sugerido = Math.max(10, Math.round((d.promedioSemanal * 0.8) / 10) * 10);
      t.pintar({
        ico: h('span', { class: 'tira-ico antojo' }, icono('meta')),
        etiqueta: 'Antojos por semana', contar: d.promedioSemanal,
        sub: que ? `En ${que}` : 'Promedio de las últimas semanas',
        titulo: 'Ponerle un tope a los antojos', alTocar: () => abrirAntojos(d, recargar),
        boton: h('button', { type: 'button', class: 'boton chico primario', onclick: () => abrirAntojos(d, recargar) }, `Tope ${soles(sugerido)}`),
      });
      return;
    }
    const pct = d.tope > 0 ? (d.semana.gastado / d.tope) * 100 : 0;
    const nivel = pct >= 100 ? 'mal' : pct >= 80 ? 'aviso' : 'ok';
    t.pintar({
      ico: anilloTira(pct, nivel),
      etiqueta: 'Antojos de la semana', contar: d.semana.gastado,
      sub: pct >= 100 ? `Se pasaron ${soles(d.semana.gastado - d.tope)} del tope` : `de ${soles(d.tope)} · quedan ${d.semana.diasQuedan} día${d.semana.diasQuedan === 1 ? '' : 's'}`,
      titulo: (d.semana.porConcepto || []).map((x) => `${x.concepto}: ${soles(x.monto)}`).join(' · ') || 'Ajustar el tope',
      alTocar: () => abrirAntojos(d, recargar),
    });
  };
  cargarRapido('antojos', {}, 'antojos').then((r) => pintar(r?.datos)).catch(() => t.remove());
  return t;
}
function tirasInicio(conCuentas, conAntojos) {
  const fila = h('div', { class: 'tiras-inicio revelar' }, conCuentas ? tiraCuentas() : null, conAntojos ? tiraAntojos() : null);
  // Si una tira se quita (sin datos), la otra ocupa todo; si no queda ninguna, la fila desaparece.
  new MutationObserver(() => { if (!fila.children.length) fila.remove(); fila.classList.toggle('una', fila.children.length === 1); }).observe(fila, { childList: true });
  return fila;
}

// ---- Anotar gastos por WhatsApp (en la fila de WhatsApp de Ajustes) ----
function bloqueRegistroWhatsapp(d) {
  if (!motorV120() || d?.via !== 'green' || !d?.green?.configurado) return null;
  const caja = h('div', { class: 'wsp-registro' });
  caja.append(
    h('div', { class: 'config-texto' }, h('strong', {}, 'Anotar gastos por WhatsApp'),
      h('span', { class: 'suave' }, `Escribe en tu chat «Tú»: «25 tambo».${(() => { const o = responsables().find((x) => !mismoNombre(x, usuarioActual()?.nombre || '')); return o ? ` ${nombreCorto(o)} te escribe: «+25 tambo».` : ''; })()} Se anota solo y te confirma.`)),
    interruptor(!!d.green.registro, 'Anotar gastos por WhatsApp', async (activar) => {
      try {
        await llamarApi('registroWhatsapp', { activar, urlMotor: API_URL }, { email: emailSesion() });
        d.green.registro = activar; guardarCache('whatsapp', d);
        avisar(activar ? 'Listo: escribe «25 tambo» en tu chat «Tú»' : 'Ya no se anotan gastos por WhatsApp', 'ok');
      } catch (e) { avisar(mensajeError(e, 'No se pudo cambiar.'), 'error'); }
    }));
  return caja;
}

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
  if (motorFijosAuto() && emailSesion()) cargarRapido('fijosAuto', {}, 'fijos-auto').then(() => document.querySelectorAll('.chip-dia-fijo').forEach((c) => c.refrescar?.())).catch(() => null);
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
      motorFijosAuto() ? chipDiaFijo(f) : null,
      h('strong', {}, soles(f.monto)));
    return li;
  }));
  pintar();
  let btnTodos = null;
  if (motorFijosAuto() && emailSesion()) {
    btnTodos = h('button', { type: 'button', class: 'boton chico enlace fijos-todos', hidden: true, title: 'Poner fin de mes a los que no tienen día' }, icono('calendario'), 'Todos a fin de mes');
    const revisar = () => { btnTodos.hidden = !fijos.some((f) => !fijoAutoDe(f.concepto)); };
    btnTodos.onclick = async () => {
      ocuparBoton(btnTodos, 'Guardando…');
      try {
        const r = await llamarApi('guardarFijoAuto', { todos: true, dia: 31, soloSinDia: true }, { email: emailSesion() });
        guardarCache('fijos-auto', { fijos: r?.fijos || [] });
        document.querySelectorAll('.chip-dia-fijo, .aviso-fijos').forEach((c) => c.refrescar?.());
        avisar('Listo: todos los fijos a fin de mes', 'ok');
      } catch (e) { avisar(mensajeError(e, 'No se pudo guardar.'), 'error'); }
      liberarBoton(btnTodos, 'Todos a fin de mes'); revisar();
    };
    revisar();
    setTimeout(revisar, 1500);
  }
  return panel('panel-fijos revelar', 'Gastos fijos', resumen,
    h('div', { class: 'progreso-fijos', 'aria-hidden': 'true' }, avance),
    lista,
    btnTodos,
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
          h('span', { class: 'suave' }, `${p.consumos} consumo${p.consumos === 1 ? '' : 's'}${mas ? ` · más en ${mas}` : ''}`),
          (p.conceptos || []).length ? h('ul', { class: 'gp-top' }, p.conceptos.slice(0, personas.length > 1 ? 3 : 5).map((x) => h('li', {},
            h('span', {}, x.concepto), h('b', {}, soles(x.monto))))) : null));
    })));
}

// v164: en Inicio de computadora cada panel mide lo que sobra de la ventana; aquí se muestran solo las filas
// que entran completas (las demás se ocultan, nunca quedan cortadas a la mitad).
function encajarEn(caja, filas) {
  if (!esComputadoraInicio() || typeof ResizeObserver === 'undefined') return;
  const ajustar = () => {
    if (!caja.isConnected) return;
    const lista = filas();
    lista.forEach((li) => { li.hidden = false; });
    const tope = caja.getBoundingClientRect().bottom - 4;
    let pasar = false;
    for (const li of lista) { if (pasar || li.getBoundingClientRect().bottom > tope) { li.hidden = true; pasar = true; } }
  };
  new ResizeObserver(() => requestAnimationFrame(ajustar)).observe(caja);
  setTimeout(ajustar, 1300);
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
  const opsOrigen = motorBolsas() ? opcionesOrigen(c.responsable || usuarioActual()?.nombre || '') : [];
  if (c.origen && !opsOrigen.some((o) => o.valor === c.origen)) opsOrigen.push({ valor: c.origen, etiqueta: textoOrigen(c.origen) || c.origen });
  const selOrigen = h('select', { id: 'ed-origen' }, opsOrigen.map((o) => h('option', { value: o.valor, selected: o.valor === (c.origen || '') }, o.etiqueta)));
  // "Pagué con" (motor 1.9): cada tarjeta compartida aparece por separado, como al registrar.
  const mediosCfg = leerCache('config')?.datos?.medios || MEDIOS_LOCAL;
  const opsMedio = [];
  for (const m of mediosCfg) {
    const ts = m.tipo === 'tarjeta' ? catalogoTC().filter((x) => x.medio === m.id) : [];
    if (ts.length > 1) ts.forEach((x) => opsMedio.push({ valor: `${m.id}|${x.id}`, etiqueta: `${m.etiqueta} · ${nombreTitular(x) || x.nombre}`, directo: false }));
    else opsMedio.push({ valor: m.id, etiqueta: m.etiqueta, directo: m.tipo !== 'tarjeta' });
  }
  const medioActual = (() => {
    if (t.id === 'HORMIGA') {
      const m = mediosCfg.find((x) => x.tipo !== 'tarjeta' && normalizar(x.etiqueta) === normalizar(c.medio));
      return m ? m.id : '';
    }
    const tc = catalogoTC(true).find((x) => x.id === t.id);
    if (!tc) return '';
    return opsMedio.some((o) => o.valor === `${tc.medio}|${tc.id}`) ? `${tc.medio}|${tc.id}` : tc.medio;
  })();
  if (medioActual && !opsMedio.some((o) => o.valor === medioActual)) opsMedio.unshift({ valor: medioActual, etiqueta: NOMBRE_TC[t.id] || c.medio || medioActual });
  const selMedio = h('select', { id: 'ed-medio' }, opsMedio.map((o) => h('option', { value: o.valor, selected: o.valor === medioActual }, o.etiqueta)));
  const conPagadoCon = motorPagadoCon() && !!medioActual;
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
    if (motorBolsas() && selOrigen.value !== (c.origen || '')) cambios.origen = selOrigen.value;
    if (conPagadoCon && selMedio.value !== medioActual) {
      const [idMedio, idTarjeta] = selMedio.value.split('|');
      cambios.medio = idMedio;
      if (idTarjeta) cambios.tarjeta = idTarjeta;
      // Pagado en directo (efectivo, Yape, Plin, Lemon): si no se eligió otra cosa, sale de lo que ya tenía quien gastó.
      const directo = opsMedio.find((o) => o.valor === selMedio.value)?.directo;
      if (directo && motorBolsas() && cambios.origen === undefined && !(c.origen || '')) {
        const propio = opsOrigen.find((o) => o.valor.startsWith('P:'));
        if (propio) cambios.origen = propio.valor;
      }
    }
    if (!Object.keys(cambios).length) { cerrar(); return; }
    ocuparBoton(btn, 'Guardando…');
    try {
      await llamarApi('editarGasto', { ...base, cambios }, { email: emailSesion() });
      if (cambios.origen !== undefined || cambios.medio !== undefined) estado.cambioDesde = Date.now();
      cerrar();
      avisar(cambios.medio !== undefined ? `Ahora: ${opsMedio.find((o) => o.valor === selMedio.value)?.etiqueta || 'otro medio'}` : 'Cambios guardados', 'ok');
      navegar();
    } catch (e) {
      fallar(e, 'No se pudo guardar. Intenta de nuevo.');
    }
  };

  // Pasar a cuotas (v124): solo con tarjeta de crédito, si no está pagado ni ya en cuotas.
  const puedeCuotas = motorPasarCuotas() && t.id !== 'HORMIGA' && !esCuota(c.descripcion) && normalizar(c.estado) !== 'pagado' && Number(c.monto) > 0;
  const pasarACuotas = async (btn) => {
    msg.hidden = true;
    const ciclosCfg = leerCache('config')?.datos?.ciclos || CICLOS_LOCAL;
    const mesInicio = (calcularCiclo(c.tarjetaId || t.id, c.fecha, ciclosCfg).pago || '').slice(0, 7);
    const r = await elegirCuotas({ total: Number(c.monto), mesInicio });
    if (!r || !(r.cuotas > 1)) return;
    ocuparBoton(btn, 'Pasando…');
    try {
      const datos = { ...base, cuotas: r.cuotas };
      if (r.montoCuota > 0) datos.montoCuota = r.montoCuota;
      const d = await llamarApi('pasarACuotas', datos, { email: emailSesion() });
      estado.cambioDesde = Date.now();
      cerrar();
      avisar(`${limpiarComercio(c.descripcion)}: ${r.cuotas} cuotas de ${soles(d?.montoCuota ?? montosDeCuotas(c.monto, r.cuotas, r.montoCuota)[0])}`, 'ok');
      navegar();
    } catch (e) {
      fallar(e, 'No se pudo pasar a cuotas. Intenta de nuevo.');
    }
  };

  function pintarZona() {
    const btnGuardar = h('button', { type: 'button', class: 'boton primario', onclick: () => guardar(btnGuardar) }, 'Guardar');
    const btnCuotas = puedeCuotas ? h('button', { type: 'button', class: 'boton ed-cuotas', onclick: () => pasarACuotas(btnCuotas) }, icono('calendario'), 'Pasar a cuotas') : null;
    const otroPase = motorCuentas() ? otroDePase(c.descripcion, c.responsable || usuarioActual()?.nombre) : '';
    const btnPase = otroPase ? h('button', { type: 'button', class: 'boton ed-cuotas', onclick: () => {
      cerrar(); abrirNoEraGasto({ c, quien: c.responsable || usuarioActual()?.nombre, otro: otroPase, base, alTerminar: () => navegar() });
    } }, icono('personas'), 'No era gasto') : null;
    zona.replaceChildren(...[
      btnGuardar,
      btnCuotas,
      btnPase,
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
      h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar')].filter(Boolean));
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
      campo('ed-fecha', '¿Cuándo?', selectorFecha(inFecha), 'campo-chico'),
      cDesc,
      campo('ed-concepto', '¿En qué fue?', selConcepto),
      conPagadoCon ? campo('ed-medio', 'Pagué con', selMedio) : null,
      motorBolsas() ? campo('ed-origen', 'De dónde sale', selOrigen) : null,
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
  const pHoja = esHoy ? d.presupuesto : (rf?.datos?.totales || null);
  // Con bolsas (motor 1.7), del saldo del mes no se descuenta lo pagado con sobrantes personales o ahorros.
  const bolsasDatos = d.bolsas?.comun ? d.bolsas : (leerCache('bolsas')?.datos?.comun ? leerCache('bolsas').datos : null);
  const bolsas = esHoy && motorBolsas() ? bolsasDatos : null;
  if (esHoy && motorBolsas() && !bolsasDatos && !estado.pidioBolsas && emailSesion()) {
    // La copia guardada de Inicio es anterior al motor 1.7: se piden las bolsas aparte y se repinta.
    estado.pidioBolsas = true;
    cargar('bolsas', {}, 'bolsas').then(() => navegar({ silencioso: true })).catch(() => { /* se verá al refrescar */ });
  }
  const p = bolsas && pHoja ? { ...pHoja, saldo: bolsas.comun.saldo, gastos: Math.max(0, (pHoja.gastos || 0) - (bolsas.comun.fuera || 0)),
    saldoPersonal: bolsas.comun.saldo / Math.max(1, (bolsas.personas || []).length || 2) } : pHoja;
  if (rf?.datos?.meses?.length) guardarCache('meses', rf.datos.meses);
  const mesesLista = rf?.datos?.meses || leerCache('meses')?.datos || [];
  const nombre = (d.usuario?.nombre || '').split(' ')[0];
  const hoy = new Date();
  const fechaHoy = hoy.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const mesNombre = (nombreMesClave(mes) || '').split(' ')[0].toLowerCase();
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasQuedan = ultimoDia - hoy.getDate();
  const diaCobro2 = () => fechaCorta(iso(new Date(hoy.getFullYear(), hoy.getMonth(), ultimoDia)));
  // En computadora con ventana suficiente, Inicio es un tablero que entra completo, sin bajar.
  // El dueño prefirió el Inicio amplio con scroll antes que el tablero apretado sin scroll (6 nov 2026).
  const tablero = false;
  const raiz = h('div', { class: 'pantalla inicio' + (tablero ? ' tablero' : '') });

  raiz.append(h('header', { class: 'cabecera-fila' },
    h('div', { class: 'cabecera' },
      h('p', { class: 'sobretitulo' }, fechaHoy),
      h('h1', {}, nombre ? `${saludo}, ${nombre}` : saludo)),
    h('div', { class: 'mes-inicio' },
      esHoy ? h('button', { type: 'button', class: 'boton boton-hoy boton-cierre', title: 'Cómo cerró el último ciclo de cobro', onclick: () => abrirCierre(mesCerrado()) },
        icono('check'), `Cierre de ${(nombreMesClave(mesCerrado()) || '').slice(0, 3).toLowerCase()}.`) : null,
      esHoy ? h('button', { type: 'button', class: 'boton boton-hoy boton-cierre boton-cobrar' + (diasQuedan <= 5 ? ' pronto' : ''),
        title: 'Qué pasa con el sueldo de este mes al cobrar', onclick: () => abrirAlCobrar(mesHoy) }, icono('billetera'), 'Al cobrar') : null,
      esHoy && motorCuadre() && emailSesion() ? h('button', { type: 'button', class: 'boton boton-hoy boton-cierre', title: 'Comparar con lo que dice el banco', onclick: () => abrirCuadre() }, icono('balanza' in ICONOS ? 'balanza' : 'lista'), 'Cuadrar') : null,
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

  // Líneas del presupuesto que ya van por el 80 % o se pasaron (las 3 más altas): llevan a Presupuesto.
  const mesCiclo = mesDelCiclo(hoyISO());
  const presCiclo = !esHoy ? null : mesCiclo === mes ? rf : await cargarRapido('presupuesto', { mes: mesCiclo }, 'presupuesto:' + mesCiclo).catch(() => null);
  const todasLineas = esHoy && rtodo?.datos?.tarjetas ? avanceLineas(presCiclo?.datos?.filas, gastadoEnCiclo(rtodo.datos.tarjetas, mesCiclo)) : [];
  const avance = todasLineas.filter((x) => x.pct >= 80).sort((x, y) => y.pct - x.pct).slice(0, 3);
  // Ritmo (v121): avisa ANTES del 80 % si una línea va mucho más rápido que el mes (del día de cobro al siguiente).
  const pctCiclo = (() => {
    const { desde, hasta } = cicloDelMes(mesCiclo);
    const total = (deISO(hasta) - deISO(desde)) / 86400000 + 1;
    const van = (deISO(hoyISO()) - deISO(desde)) / 86400000 + 1;
    return Math.max(0, Math.min(100, (van / total) * 100));
  })();
  const ritmo = todasLineas.filter((x) => x.pct < 80 && x.pct >= 35 && x.pct > pctCiclo + 25 && x.plan >= 30)
    .sort((x, y) => (y.pct - pctCiclo) - (x.pct - pctCiclo)).slice(0, 2);
  // Aviso anticipado: si tus tarjetas ya se comieron casi todo (o más) del sobrante con que las pagarás.
  const avisoTC = (() => {
    if (!bolsas?.proximos) return null;
    const yo = nombreCorto(usuarioActual()?.nombre || '');
    for (const p of bolsas.proximos) {
      const s = p.personas?.find((x) => nombreCorto(x.nombre) === yo);
      if (!s || !(s.apartado > 0)) continue;
      const llega = Number(p.porPersona) || 0;
      if (s.queda < 0 || s.queda < llega * 0.25) return { mes: p.mes, ...s, llega };
    }
    return null;
  })();
  for (const s of esHoy ? Object.keys(BILLETERA_LINEA).map((id) => saldoBilletera(id)).filter(Boolean) : []) {
    if (!(s.plan > 0) || s.queda >= s.plan * 0.2) continue;
    const pasado = s.queda < 0;
    raiz.append(h('section', { class: 'avisos-inicio avisos-pres aviso-tc' + (pasado ? ' pasado' : '') },
      h('a', { class: 'aviso-fila ' + (pasado ? 'vencida' : 'justo'), href: '#presupuesto' },
        icono('alerta'),
        h('span', {}, h('strong', {}, pasado ? `${nombreBilletera(s.medio)} ya no tiene para ${s.linea.toLowerCase()}` : `${nombreBilletera(s.medio)} se está acabando`),
          h('small', {}, pasado ? `Usaste ${soles(s.usado)} de ${soles(s.plan)} de ${s.linea}` : `Quedan ${soles(s.queda)} de ${soles(s.plan)} para ${s.linea.toLowerCase()}`)),
        h('strong', { class: 'aviso-monto' }, soles(s.queda)),
        icono('adelante'))));
  }
  if (avisoTC) {
    const pasado = avisoTC.queda < 0;
    raiz.append(h('section', { class: 'avisos-inicio avisos-pres aviso-tc' + (pasado ? ' pasado' : '') },
      h('a', { class: 'aviso-fila ' + (pasado ? 'vencida' : 'justo'), href: '#presupuesto' },
        icono('alerta'),
        h('span', {}, h('strong', {}, pasado ? 'Para ya con la tarjeta' : 'Frena con la tarjeta'),
          h('small', {}, pasado
            ? `Tus tarjetas pasan tu sobrante de ${mesMinuscula(avisoTC.mes)} por ${soles(-avisoTC.queda)}`
            : `De tu sobrante de ${mesMinuscula(avisoTC.mes)} solo quedan ${soles(avisoTC.queda)} para tarjeta`)),
        h('strong', { class: 'aviso-monto' }, soles(avisoTC.apartado)),
        icono('adelante'))));
  }
  if (esHoy && motorFijosAuto() && emailSesion()) raiz.append(avisoFijos());
  if (ritmo.length) {
    raiz.append(h('section', { class: 'avisos-inicio avisos-pres aviso-ritmo' }, ritmo.map((x) => h('a', { class: 'aviso-fila justo', href: '#presupuesto' },
      icono('alerta'),
      h('span', {}, h('strong', {}, `Vas rápido en ${x.nombre}`),
        h('small', {}, `Llevas ${Math.floor(x.pct)} % y va ${Math.round(pctCiclo)} % del mes · quedan ${soles(Math.max(0, x.plan - x.gastado))}`)),
      h('strong', { class: 'aviso-monto' }, soles(x.gastado)),
      icono('adelante')))));
  }
  if (avance.length) {
    raiz.append(h('section', { class: 'avisos-inicio avisos-pres' }, avance.map((x) => h('a', { class: 'aviso-fila ' + (x.pct > 100 ? 'vencida' : 'justo'), href: '#presupuesto' },
      icono('alerta'),
      h('span', {}, h('strong', {}, x.nombre),
        h('small', {}, x.pct > 100 ? `Te pasaste por ${soles(x.gastado - x.plan)} · plan ${soles(x.plan)}` : `Vas en ${Math.floor(x.pct)} % · plan ${soles(x.plan)}`)),
      h('strong', { class: 'aviso-monto' }, soles(x.gastado)),
      icono('adelante')))));
  }

  const tarjetas = (d.tarjetas || []).filter((t) => t.id !== 'HORMIGA');
  const hormiga = (d.tarjetas || []).find((t) => t.id === 'HORMIGA');
  const conDeuda = tarjetas.filter((t) => t.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
  const proxima = conDeuda.filter((t) => t.proximoVence).sort((a, b) => String(fechaPagoTC(a)).localeCompare(String(fechaPagoTC(b))))[0];

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
    // v162: cuánto le toca a cada uno al cobrar, ya sin lo que separó para su tarjeta (antes decía "Tarjeta nov").
    const prox0 = esHoy && !falta ? bolsas?.proximos?.find((x) => x.mes === mes) : null;
    const diaCobro = fechaCorta(iso(new Date(hoy.getFullYear(), hoy.getMonth(), ultimoDia)));
    const personal = prox0?.personas?.length
      ? h('div', { class: 'hero-personas' },
        h('span', { class: 'hp-lead' }, `Al cobrar (${diaCobro}) a cada uno le toca:`),
        h('span', { class: 'hp-lista' }, prox0.personas.map((y) => h('span', { class: 'hp-persona' },
          avatar(y.nombre),
          h('span', { class: 'hp-datos' }, h('span', { class: 'hp-nombre' }, nombreCorto(y.nombre)), h('strong', {}, soles(y.queda)),
            y.apartado > 0 ? h('small', {}, `ya sin ${soles(y.apartado)} de tarjeta`) : null)))))
      : h('p', { class: 'hero-personal' }, h('span', { class: 'avatares' }, responsables().map((nombre) => avatar(nombre))),
        h('span', {}, h('strong', {}, soles(Math.abs(p.saldoPersonal))), ' para cada uno'));
    hero.append(
      h('div', { class: 'hero-principal' + (falta ? ' en-falta' : '') },
        h('p', { class: 'hero-etq' }, falta ? [icono('alerta'), ` ${esHoy ? 'Te va a faltar' : 'Faltó'} en ${mesNombre}`] : `${esHoy ? 'Te va a sobrar' : 'Sobra'} en ${mesNombre}`),
        h('p', { class: 'hero-monto', 'data-rico': '', 'data-contar': String(Math.abs(p.saldo)) }, soles(0)),
        personal),
      anillo(pct, 'en gastos'));
  } else {
    hero.append(h('div', { class: 'hero-principal' },
      h('p', { class: 'hero-etq' }, 'Saldo del mes'),
      h('p', { class: 'hero-vacio' }, `${nombreMesClave(mes) || 'Este mes'} todavía no está en el presupuesto.`)));
  }
  if (esHoy) hero.append(h('a', { class: 'hero-pagar', href: '#tarjetas' },
    h('span', { class: 'hero-pagar-cab' }, 'Por pagar de tarjetas', icono('adelante')),
    h('strong', { class: 'hero-pagar-monto', 'data-rico': '', 'data-contar': String(d.totalPorPagar || 0) }, soles(0)),
    conDeuda.length ? barraPartes(conDeuda.map((t) => ({ etiqueta: nombreCortoTC(t), valor: t.pendiente, clase: `tc-${t.id}` }))) : null,
    conDeuda.length > 1 ? h('ul', { class: 'hero-leyenda compacta' }, conDeuda.slice(0, 3).map((t) => h('li', {},
      chipTC(t.id, 'mini'), h('span', {}, nombreCortoTC(t)), h('b', {}, pctTexto(t.pendiente, d.totalPorPagar))))) : null,
    (() => {
      const atrasada = proxima && /atrasado/.test(estadoVence(proxima.proximoVence, proxima.pendiente, pagoDeTC(proxima)).texto);
      return h('span', { class: 'hero-pagar-pie' + (atrasada ? ' atrasada' : '') }, icono(atrasada ? 'alerta' : 'calendario'),
        !proxima ? 'No hay nada pendiente'
          : atrasada ? `Atrasada: ${nombreCortoTC(proxima)} · vence ${fechaCorta(proxima.proximoVence)}`
            : `Sigue: ${nombreCortoTC(proxima)} · ${fechaCorta(fechaPagoTC(proxima))}`);
    })()));
  if (p && !esHoy && p.ingresos > 0) {
    // Otro mes: en vez de lo que falta pagar hoy, cómo se repartió (o se repartirá) el ingreso de ese mes.
    const gastos = Math.max(p.gastos || 0, 0);
    const ahorros = Math.max(p.ahorros || 0, 0);
    const libre = Math.max(p.saldo || 0, 0);
    const base = Math.max(p.ingresos || 0, gastos + ahorros, 1);
    const reparto = [
      { etiqueta: 'Gastos', valor: gastos, clase: 'r-gastos' },
      { etiqueta: 'Ahorros', valor: ahorros, clase: 'r-ahorros' },
      { etiqueta: 'Sobra', valor: libre, clase: 'r-libre' },
    ];
    hero.append(
      h('div', { class: 'hero-pagar hero-reparto' },
        h('span', { class: 'hero-pagar-cab' }, 'Reparto del ingreso'),
        barraPartes(reparto),
        h('ul', { class: 'hero-leyenda' }, reparto.map((x) => h('li', {},
          h('i', { class: `punto ${x.clase}`, 'aria-hidden': 'true' }), h('span', {}, x.etiqueta),
          h('b', {}, `${Math.round((x.valor / base) * 100)}%`))))),
      h('ul', { class: 'hero-datos' },
        dato('sube', 'Entra', soles(p.ingresos)),
        dato('baja', 'Se va en gastos', soles(p.gastos)),
        dato('billetera', 'Ahorro', soles(p.ahorros || 0)),
        dato('check', 'Sobra', soles(libre))));
  }
  if (p && esHoy) {
    const libre = Math.max(p.saldo, 0);
    hero.append(h('ul', { class: 'hero-datos' },
      dato('sube', 'Entra este mes', soles(p.ingresos), h('small', { class: 'hero-dato-extra' }, 'los sueldos')),
      dato('baja', 'Se va en gastos', soles(p.gastos), h('small', { class: 'hero-dato-extra' }, 'según tu presupuesto')),
      bolsas ? (() => {
        const { mio, otros } = enManoPorPersona(bolsas);
        if (!mio) return dato('billetera', 'Plata en mano', soles(enMano(bolsas)));
        // Lo que tiene cada uno hoy (de meses ya cobrados). Lo del próximo cobro va arriba, junto al saldo.
        return dato('billetera', 'Tu plata hoy', soles(mio.monto),
          otros.length ? h('small', { class: 'hero-dato-extra' }, otros.map((x) => `${x.nombre} tiene ${soles(x.monto)}`).join(' · ')) : null);
      })() : dato('billetera', 'Libre por día', soles(diasQuedan > 0 ? libre / diasQuedan : libre)),
      dato('calendario', 'Día de cobro', diasQuedan === 0 ? 'Hoy' : diasQuedan === 1 ? 'Mañana' : `En ${diasQuedan} días`,
        h('span', { class: 'hero-dato-extra hero-dato-cobro' },
          h('small', {}, (() => { const t = `${new Date(hoy.getFullYear(), hoy.getMonth(), ultimoDia).toLocaleDateString('es-PE', { weekday: 'long' })} ${diaCobro2()}`; return t.charAt(0).toUpperCase() + t.slice(1); })()),
          h('i', { class: 'mes-barra', title: `Día ${hoy.getDate()} de ${ultimoDia}` }, h('b', { 'data-w': `${Math.round((hoy.getDate() / ultimoDia) * 100)}%` }))))));
  }
  raiz.append(hero);
  if (esHoy && motorLector() && emailSesion()) raiz.append(avisoPendientes(r?.datos?.pendientes));
  if (esHoy && motorReenvio() && emailSesion()) raiz.append(avisoConectar());
  // v164: sin el panel "Tu plata" (lo dice el resumen) ni el carrusel de tarjetas (está en Tarjetas): Inicio no repite.

  // v160: Inicio es solo el resumen. Los gastos hormiga (ya están en Tarjetas, por cuenta) y los gastos fijos
  // (ya están en Presupuesto) no se repiten aquí; el aviso "Pagar X · vence hoy" de los fijos sí queda arriba.
  // En otro mes, a la derecha va en qué se fue.
  let extraPanel = null;
  if (!esHoy) {
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
  const fijosPanel = null;
  const personasPanel = panelPersonas(rp?.datos);
  const pila = personasPanel || extraPanel ? h('div', { class: 'col-pila' }, personasPanel, extraPanel) : null;
  if (fijosPanel || pila) raiz.append(h('div', { class: 'rejilla-2b' }, fijosPanel, pila));
  const conCuentas = esHoy && motorCuentas() && emailSesion() && responsables().length > 1;
  const conAntojos = esHoy && motorV120() && emailSesion();
  if (conCuentas || conAntojos) raiz.append(tirasInicio(conCuentas, conAntojos));

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
    const cuantos = innerHeight < 720 ? 3 : innerHeight < 800 ? 4 : 5;
    const partes = orden.slice(0, cuantos).map(([etiqueta, valor]) => ({ etiqueta, valor }));
    const resto = orden.slice(cuantos).reduce((s, [, v]) => s + v, 0);
    if (resto > 0) partes.push({ etiqueta: 'Otros conceptos', valor: resto });
    // Un solo panel con dos vistas del mismo gasto: por día y por concepto.
    const pestanasGasto = [
      { etiqueta: 'Por día', lado: `${soles(dias.total)} en 30 días`, pista: 'Todo lo gastado en los últimos 30 días, pagado o no.', nodo: dias.nodo },
      { etiqueta: 'En qué se fue', lado: soles(orden.reduce((s, [, v]) => s + v, 0)), pista: 'Todo lo gastado en los últimos 30 días, por concepto.',
        nodo: h('div', { class: 'dona-ancha' }, partes.length ? dona(partes, 'Total') : vacio('Todavía no hay consumos este mes.')) },
    ];

    const recientes = consumosDe(completo ? rtodo.datos.tarjetas : todas, (t) => t.id !== 'HORMIGA').filter((c) => completo || c.estado !== 'Pagado')
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, esComputadoraInicio() ? 8 : 6);
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
    pestanasGasto.unshift({ etiqueta: 'Últimos gastos', lado: h('a', { href: '#movimientos' }, 'Ver todos'), nodo: h('div', { class: 'pest-lista' }, listaRecientes) });
    const panelGasto = panelPestanas('panel-gasto', pestanasGasto);
    agregar(panelGasto);
    setTimeout(() => { const pc = panelGasto.querySelector('.pest-cuerpo'); if (pc) encajarEn(pc, () => [...pc.querySelectorAll('.lista-mov > li')]); }, 0);

    raiz.append(rejilla);
  }

  const revisar = seccionRevisar();
  if (revisar) raiz.append(revisar);

  if (esHoy) {
    raiz.classList.add('una-pantalla');
    const avisos = [...raiz.querySelectorAll(':scope > .avisos-inicio, :scope > .aviso-pend')];
    if (avisos.length) { const fila = h('div', { class: 'avisos-fila' }); hero.before(fila); fila.append(...avisos); }
    const quien = raiz.querySelector(':scope > .rejilla-2b');
    const tiras = raiz.querySelector(':scope > .tiras-inicio');
    const gasto = raiz.querySelector(':scope > .rejilla-3');
    const abajo = h('div', { class: 'inicio-abajo' });
    if (quien) abajo.append(...quien.querySelectorAll('.panel'));
    const pp = abajo.querySelector('.panel-personas');
    if (pp) setTimeout(() => encajarEn(pp, () => [...pp.querySelectorAll('.gp-top > li')]), 0);
    if (gasto) abajo.append(...gasto.children);
    if (tiras) abajo.append(tiras);
    quien?.remove(); gasto?.remove();
    if (abajo.children.length) raiz.append(abajo);
  }

  try {
    // Se muestra solo en los primeros días después de cada cobro (cuando recién se cerró un ciclo).
    const pasado = mesCerrado();
    if (esHoy && hoy.getDate() <= 7 && localStorage.getItem('ff:cierre') !== pasado) {
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
  // v2: el orden por defecto es el de la hoja (Excel); lo que se guardó antes se reemplaza una vez.
  let pref = { orden: 'hoja', compacta: false, v: 2 };
  try {
    const guardado = JSON.parse(localStorage.getItem('ff:pres-vista') || '{}');
    pref = { ...pref, ...guardado };
    if (!(guardado.v >= 2)) { pref.orden = 'hoja'; pref.v = 2; }
  } catch { /* nada */ }
  const recordar = () => { try { localStorage.setItem('ff:pres-vista', JSON.stringify(pref)); } catch { /* nada */ } };
  const criterio = {
    hoja: (a, b) => Number(a.dataset.fila || 0) - Number(b.dataset.fila || 0),
    monto: (a, b) => Number(b.dataset.plan) - Number(a.dataset.plan),
    nombre: (a, b) => a.dataset.nombre.localeCompare(b.dataset.nombre),
    pendiente: (a, b) => (a.classList.contains('pagado') - b.classList.contains('pagado')) || ((b.dataset.marcable ? 1 : 0) - (a.dataset.marcable ? 1 : 0)) || (Number(b.dataset.plan) - Number(a.dataset.plan)),
  };
  const ordenar = (animar) => {
    const filas = [...ul.children];
    const antes = new Map(filas.map((li) => [li, li.getBoundingClientRect()]));
    filas.sort(criterio[pref.orden] || criterio.hoja).forEach((li) => ul.append(li));
    if (!animar || sinMovimiento()) return;
    filas.forEach((li, i) => {
      const a = antes.get(li); const d = li.getBoundingClientRect();
      const dx = a.left - d.left; const dy = a.top - d.top;
      if (!dx && !dy) return;
      li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, delay: Math.min(i * 14, 160), easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
    });
  };
  const ordenes = [['hoja', 'Como la hoja'], ['monto', 'Monto'], ['nombre', 'A–Z'], ['pendiente', 'Por pagar']];
  const botonesOrden = ordenes.map(([id, texto]) => h('button', { type: 'button', 'aria-pressed': String(pref.orden === id),
    title: id === 'hoja' ? 'En el mismo orden que la hoja' : id === 'monto' ? 'Del más grande al más chico' : id === 'nombre' ? 'Por nombre' : 'Primero lo que falta pagar',
    onclick: () => { pref.orden = id; recordar(); botonesOrden.forEach((b, k) => b.setAttribute('aria-pressed', String(ordenes[k][0] === id))); ordenar(true); } }, texto));
  const densidad = h('button', { type: 'button', class: 'boton icono-solo pres-densidad', 'aria-pressed': String(pref.compacta), title: 'Vista compacta o amplia', 'aria-label': 'Cambiar entre vista compacta y amplia',
    onclick: () => { pref.compacta = !pref.compacta; recordar(); densidad.setAttribute('aria-pressed', String(pref.compacta)); seccion.classList.toggle('compacta', pref.compacta); } }, icono('lista'));
  seccion.classList.toggle('compacta', pref.compacta);
  cab.after(h('div', { class: 'pres-controles' }, h('div', { class: 'segmentos pres-orden', role: 'group', 'aria-label': 'Ordenar gastos' }, botonesOrden), densidad));
  if (pref.orden !== 'hoja') ordenar(false);
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

// Último ciclo de cobro ya terminado (v121): con cobro a fin de mes, el presupuesto de un mes se gasta del
// día de cobro al día antes del siguiente; el que se puede cerrar es el anterior al que está corriendo.
function mesCerrado() { return sumarMes(mesDelCiclo(hoyISO()), -1); }
// Gastos por persona y concepto dentro del ciclo de cobro de ese mes, con los consumos ya cargados.
function gastosDelCiclo(tarjetas, mes) {
  const { desde, hasta } = cicloDelMes(mes);
  const porPersona = new Map();
  for (const c of consumosDe(tarjetas || [], () => true)) {
    if (!c.fecha || c.fecha < desde || c.fecha > hasta) continue;
    const quien = c.responsable || 'Sin nombre';
    const p = porPersona.get(quien) || { nombre: quien, total: 0, conceptos: new Map() };
    const m = Number(c.monto) || 0;
    p.total += m;
    p.conceptos.set(c.concepto || 'Otros', (p.conceptos.get(c.concepto || 'Otros') || 0) + m);
    porPersona.set(quien, p);
  }
  return [...porPersona.values()].map((p) => ({ nombre: p.nombre, total: Math.round(p.total * 100) / 100,
    conceptos: [...p.conceptos].map(([concepto, monto]) => ({ concepto, monto })) }));
}

async function abrirCierre(mes) {
  const antes = sumarMes(mes, -1);
  const [rp, rt] = await Promise.all([
    cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes).catch(() => null),
    cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo').catch(() => null),
  ]);
  const tot = rp?.datos?.totales;
  // Lo gastado se cuenta por ciclo de cobro (del día de cobro al día antes del siguiente), no por mes calendario.
  const ciclo = cicloDelMes(mes);
  const personas = gastosDelCiclo(rt?.datos?.tarjetas, mes).filter((x) => x.total > 0).sort((x, y) => y.total - x.total);
  const gastado = personas.reduce((x, y) => x + y.total, 0);
  const gastadoAntes = gastosDelCiclo(rt?.datos?.tarjetas, antes).reduce((x, y) => x + (y.total || 0), 0);
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
    h('p', { class: 'suave cierre-ciclo' }, `Del ${fechaCorta(ciclo.desde)} al ${fechaCorta(ciclo.hasta)}`),
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

// "Al cobrar": qué pasa con el ingreso del mes cuando cobran a fin de mes. Cuánto entra, cómo se reparte
// (tarjetas, gastos del mes, ahorros y lo que queda), qué tarjeta pagar y hasta cuándo, y cuánto le toca a
// cada uno para el mes siguiente. Es la pareja hacia adelante de "Cierre de <mes pasado>".
async function abrirAlCobrar(mes) {
  const [rp, rt] = await Promise.all([
    cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes).catch(() => null),
    cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: false }, 'tarjetas').catch(() => null),
  ]);
  const tot = rp?.datos?.totales;
  if (!tot) { avisar(`Todavía no hay datos de ${nombreMesClave(mes) || 'ese mes'}`); return; }
  const bolsas = motorBolsas() && mes === mesActual() ? bolsasGuardadas() : null;
  const n = Math.max(1, (bolsas?.personas || []).length || responsables().length || 2);
  const ingresos = Number(tot.ingresos) || 0;
  // Las líneas "TC …" del presupuesto suman lo que se paga este mes (por fecha de pago).
  const tarjetas = (rp.datos.filas || []).filter((f) => f.seccion === 'gastos' && /^TC\s/i.test(f.concepto || ''))
    .reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const ahorros = Number(tot.ahorros) || 0;
  // Igual que en Inicio: con bolsas, lo pagado con sobrantes o ahorros no sale del sueldo.
  const queda = bolsas?.comun ? Number(bolsas.comun.saldo) || 0 : Number(tot.saldo) || 0;
  const gastos = Math.max(0, ingresos - tarjetas - ahorros - queda);
  const porPagar = (rt?.datos?.tarjetas || []).filter((t) => t.id !== 'HORMIGA')
    .flatMap((t) => (t.estados || []).filter((e) => String(e.pago || '').startsWith(mes) && Number(e.pendiente) > 0)
      .map((e) => ({ id: t.id, monto: Number(e.pendiente), vence: e.vence })))
    .sort((x, y) => String(x.vence || '').localeCompare(String(y.vence || '')));
  const [anio, m] = mes.split('-').map(Number);
  const diaCobro = new Date(anio, m, 0);
  const cuando = diaCobro.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const siguiente = (nombreMesClave(sumarMes(mes, 1)) || '').split(' ')[0].toLowerCase();
  const falta = queda < 0;
  const base = Math.max(ingresos, tarjetas + gastos + ahorros, 1);
  const pct = (v) => `${Math.max(0, Math.round((v / base) * 1000) / 10)}%`;
  const partes = [
    { clase: 'd3', nombre: 'Tarjetas', monto: tarjetas },
    { clase: 'd1', nombre: 'Gastos del mes', monto: gastos },
    { clase: 'd4', nombre: 'Ahorros', monto: ahorros },
    { clase: 'd0 queda', nombre: falta ? 'Falta' : 'Te queda', monto: queda },
  ].filter((x) => x.monto > 0 || x.clase.includes('queda'));

  const dlg = h('dialog', { class: 'hoja-modal cierre-mes al-cobrar', 'aria-label': 'Al cobrar' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  dlg.append(h('div', { class: 'cierre-caja' },
    h('p', { class: 'cierre-etq' }, `Al cobrar · ${cuando}`),
    h('p', { class: 'cierre-monto', 'data-rico': '', 'data-contar': String(ingresos) }, soles(0)),
    h('p', { class: 'suave' }, 'entra entre los dos'),
    h('div', { class: 'cobro-barra', role: 'img', 'aria-label': partes.map((x) => `${x.nombre} ${soles(Math.abs(x.monto))}`).join(', ') },
      partes.filter((x) => x.monto > 0).map((x) => h('i', { class: x.clase, 'data-w': pct(x.monto), title: `${x.nombre}: ${soles(x.monto)}` }))),
    h('ul', { class: 'cobro-leyenda' }, partes.map((x, i) => h('li', { class: x.clase + (falta && x.clase.includes('queda') ? ' mal' : ''), style: `--i: ${i}` },
      h('span', {}, x.nombre), h('strong', {}, soles(Math.abs(x.monto)))))),
    porPagar.length ? h('p', { class: 'cobro-sub' }, 'Tarjetas por pagar') : null,
    porPagar.length ? h('ul', { class: 'cobro-tarjetas' }, porPagar.map((x, i) => h('li', { style: `--i: ${i}` },
      chipTC(x.id, 'mini'), h('span', {}, nombreTC(x.id), h('small', { class: 'suave' }, x.vence ? `vence ${fechaCorta(x.vence)}` : '')),
      h('strong', {}, soles(x.monto))))) : null,
    h('p', { class: 'cobro-nota' + (falta ? ' mal' : '') }, falta
      ? `Este mes falta ${soles(Math.abs(queda))}: revisen qué gasto pueden mover o de qué ahorro sale.`
      : `${soles(queda / n)} para cada uno pasa a "En mano" en ${siguiente}.`),
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
  const entrada = h('input', { type: 'search', id: 'buscar-mov', placeholder: 'Buscar gasto o fecha (ej. sábado 7)', 'aria-label': 'Buscar gasto o fecha', autocomplete: 'off' });
  const cuenta = h('span', { class: 'buscador-cuenta', 'aria-live': 'polite' });
  const lista = h('ul', { class: 'lista consumos lista-todos' });
  const mas = h('button', { type: 'button', class: 'boton ver-mas' }, 'Ver más');
  const nada = vacio('Ningún gasto coincide.');
  nada.querySelector('.vacio-ico')?.replaceChildren(icono('buscar'));
  let concepto = null;
  let tope = 60;
  const diasAbiertos = new Set(); // los días que abriste siguen abiertos al buscar o ver más
  const texto = (c) => normalizar(`${c.descripcion} ${limpiarComercio(c.descripcion)} ${c.concepto || ''} ${nombreCortoTC(c.tarjeta)} ${c.medio || ''}`) + ' ' + palabrasFecha(c.fecha);
  const indice = todos.map((c) => [c, texto(c)]);
  const pintar = () => {
    const q = normalizar(entrada.value);
    const sal = indice.filter(([c, t]) => cumpleBusqueda(t, q) && (!concepto || (c.concepto || 'Sin concepto') === concepto)).map(([c]) => c);
    const suma = sal.reduce((x, c) => x + (Number(c.monto) || 0), 0);
    cuenta.textContent = `${sal.length} · ${soles(suma)}`;
    const nodos = [];
    sal.slice(0, tope).forEach((c, k, arr) => {
      if (k === 0 || arr[k - 1].fecha !== c.fecha) {
        const delDia = sal.filter((x) => x.fecha === c.fecha).reduce((x, y) => x + (Number(y.monto) || 0), 0);
        nodos.push(h('li', { class: 'dia', 'data-dia': c.fecha || '' },
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
    plegarDias(lista, diasAbiertos);
    lista.classList.toggle('buscando', !!(q || concepto));
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

// ---------- Por confirmar: consumos que el motor leyó de los correos del banco ----------

// Ventana "Alto" antes de guardar un gasto que no alcanza (o que deja muy poco).
// o: {nivel: 'alto' | 'ojo', titulo, sub, tiene, monto, etqTiene}. Resuelve true si igual se guarda.
function frenoGasto(o) {
  return new Promise((resolver) => {
    const alto = o.nivel === 'alto';
    const costo = o.costo ?? o.monto; // con fondo común te cuesta tu parte del gasto
    const tope = Math.max(o.tiene, costo, 0.01);
    const usa = Math.max(0, Math.min(costo, Math.max(o.tiene, 0)));
    const exceso = Math.max(0, costo - Math.max(o.tiene, 0));
    const queda = o.queda ?? Math.round((o.tiene - o.monto) * 100) / 100;
    const dlg = h('dialog', { class: `hoja-modal freno ${alto ? 'alto' : 'ojo'}`, 'aria-label': o.titulo });
    let listo = false;
    const cerrar = (guardar) => {
      if (listo) return; listo = true;
      dlg.classList.add('cerrando');
      setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); resolver(guardar); }, sinMovimiento() ? 0 : 190);
    };
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(false); });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(false); });
    const cifra = (etq, monto, clase = '') => h('li', { class: clase }, h('span', {}, etq), h('strong', { 'data-contar': String(Math.abs(monto)) }, soles(0)));
    const botonNo = h('button', { type: 'button', class: 'boton ' + (alto ? 'primario' : 'enlace'), onclick: () => cerrar(false) }, o.textoNo || (alto ? 'Mejor no lo gasto' : 'Mejor no'));
    const botonSi = h('button', { type: 'button', class: 'boton ' + (alto ? 'enlace peligro' : 'primario'), onclick: () => cerrar(true) }, o.textoSi || (alto ? 'Guardar igual' : 'Guardar'));
    // Con tarjeta de crédito (v123): pasarlo a cuotas pesa menos este mes. Resuelve 'cuotas'.
    const botonCuotas = o.textoCuotas ? h('button', { type: 'button', class: 'boton freno-cuotas', onclick: () => cerrar('cuotas') }, icono('calendario'), o.textoCuotas) : null;
    dlg.append(h('div', { class: 'freno-caja' },
      h('div', { class: 'freno-ico', 'aria-hidden': 'true' }, h('span', {}, icono('alerta'))),
      h('h2', { class: 'freno-titulo' }, o.titulo),
      o.sub ? h('p', { class: 'freno-sub' }, o.sub) : null,
      h('div', { class: 'freno-barra', role: 'img', 'aria-label': `${o.etqTiene} ${soles(o.tiene)}; este gasto ${soles(o.monto)}` },
        h('b', { class: 'usa', style: `width: ${(usa / tope) * 100}%` }),
        exceso > 0 ? h('b', { class: 'exceso', style: `width: ${(exceso / tope) * 100}%` }) : null),
      h('ul', { class: 'freno-cifras' },
        cifra(o.etqTiene, o.tiene),
        cifra('Este gasto', o.monto),
        queda < 0 ? cifra('Te faltan', queda, 'mal') : cifra('Te quedarían', queda, 'queda'))),
      h('div', { class: 'acciones modal-acciones freno-acciones' }, alto ? [botonNo, botonCuotas, botonSi].filter(Boolean) : [botonSi, botonCuotas, botonNo].filter(Boolean)));
    document.body.append(dlg);
    dlg.showModal();
    animarVista(dlg);
    if (navigator.vibrate && alto) { try { navigator.vibrate([60, 40, 60]); } catch { /* nada */ } }
    botonNo.focus();
  });
}

// Cuánto queda en la línea del presupuesto de ese concepto, en el ciclo de cobro de esa fecha. null = no se sabe.
function restoDelPresupuesto(concepto, fecha) {
  if (!concepto || !fecha) return null;
  const mes = mesDelCiclo(fecha);
  const filas = leerCache('presupuesto:' + mes)?.datos?.filas;
  const tarjetas = leerCache('tarjetas-todo')?.datos?.tarjetas;
  if (!filas || !tarjetas) return null;
  const k = normalizar(concepto);
  const fila = filas.find((x) => x.seccion === 'gastos' && !x.esTarjeta && Math.abs(Number(x.monto) || 0) > 0 && (x.conceptos?.length
    ? x.conceptos.some((c) => normalizar(c) === k)
    : (() => { const l = normalizar(nombreLinea(x.concepto)); return l === k || (l.length >= 5 && k.startsWith(l)) || (k.length >= 5 && l.startsWith(k)); })()));
  if (!fila) return null;
  const real = gastadoEnCiclo(tarjetas, mes);
  const av = avanceLineas([fila], real)[0] || { nombre: nombreLinea(fila.concepto), plan: Math.abs(Number(fila.monto) || 0), gastado: 0 };
  return { nombre: av.nombre, plan: av.plan, gastado: av.gastado, queda: av.plan - av.gastado, mes };
}

// '2026-11' -> 'noviembre'.
function mesMinuscula(clave) { return (nombreMesClave(clave) || clave).split(' ')[0].toLowerCase(); }
// "S/ 119 apartado de noviembre" por cada próximo sobrante con tarjetas suyas (motor 1.9.5); antes, el total.
function apartadosDe(b, persona) {
  const lista = (b.proximos || []).map((p) => ({ mes: p.mes, x: (p.personas || []).find((y) => y.nombre === persona.nombre) }))
    .filter((p) => p.x && p.x.apartado > 0);
  if (lista.length) return lista.map((p) => `${soles(p.x.apartado)} apartado de ${mesMinuscula(p.mes)}`);
  return persona.comprometido > 0 ? [`${soles(persona.comprometido)} de tarjeta para el próximo sobrante`] : [];
}

// Panel "Tu plata": primero lo que ya está en la mano (sobrantes de meses cobrados y ahorros) y aparte
// lo que quedará del mes en curso, que recién llega cuando se cobra a fin de mes.
function panelBolsas(b, mesNombre) {
  const bolsa = (clase, cabeza, titulo, monto, sub) => h('div', { class: `bolsa ${clase}` + (monto < 0 ? ' en-rojo' : '') },
    h('span', { class: 'bolsa-cab' }, cabeza, h('span', {}, titulo)),
    h('strong', { 'data-rico': '', 'data-contar': String(Math.abs(monto)) }, soles(0)),
    h('span', { class: 'suave' }, monto < 0 ? `En rojo${sub ? ' · ' + sub : ''}` : sub));
  const piezas = [
    ...(b.personas || []).map((x) => bolsa('persona', avatar(x.nombre, 'chico'), `Sobrante de ${nombreCorto(x.nombre)}`, x.disponible,
      [x.gastadoMes > 0 ? `Usó ${soles(x.gastadoMes)} este mes` : 'De meses ya cobrados',
        // Tarjeta que pagará con lo que le sobre el mes del pago: no baja lo de hoy, queda apartada de ese sobrante.
        ...apartadosDe(b, x)].filter(Boolean).join(' · '))),
    ...(b.ahorros || []).filter((a) => a.acumulado > 0 || a.retirado > 0).map((a) => bolsa('ahorro', h('span', { class: 'bolsa-ico' }, icono('billetera')), nombreLinea(a.meta), a.disponible,
      a.retirado > 0 ? `Guardado ${soles(a.acumulado)} · usado ${soles(a.retirado)}` : 'Guardado')),
    ...Object.keys(BILLETERA_LINEA).map((id) => saldoBilletera(id)).filter(Boolean).map((s) => bolsa('ahorro billetera',
      h('span', { class: 'bolsa-ico' }, icono('billetera')), `${nombreBilletera(s.medio)} · ${s.linea}`, s.queda,
      `Cargado ${soles(s.plan)} · usado ${soles(s.usado)}`)),
    bolsa('comun por-llegar', h('span', { class: 'bolsa-ico' }, icono('calendario')), `Quedará de ${mesNombre}`, b.comun.saldo,
      (b.comun.fuera > 0 ? `${soles(b.comun.fuera)} se pagó con sobrantes o ahorros · ` : '') + 'Llega al cobrar a fin de mes'),
  ];
  const { mio, otros } = enManoPorPersona(b);
  const cabecera = mio
    ? h('span', { class: 'bolsas-total' }, 'En mano: tú ', h('strong', {}, soles(mio.monto)),
      ...otros.flatMap((x) => [` · ${x.nombre} `, h('strong', {}, soles(x.monto))]))
    : h('span', { class: 'bolsas-total' }, 'En mano hoy ', h('strong', {}, soles(enMano(b))));
  return panel('panel-bolsas revelar', 'Tu plata', cabecera,
    h('div', { class: 'bolsas' }, piezas));
}

// Aviso compacto en Inicio: cuántos consumos esperan y cuánto suman; lleva a la pantalla Por confirmar.
function avisoPendientes(cuantos) {
  const texto = h('strong', {});
  const total = h('span', { class: 'aviso-pend-total' });
  const caja = h('button', { type: 'button', class: 'aviso-pend revelar', hidden: true, onclick: () => abrirPendientes() },
    h('span', { class: 'aviso-pend-ico' }, icono('lista')),
    h('span', { class: 'aviso-pend-texto' }, texto, h('span', { class: 'suave' }, 'Leídos del correo de tu banco')),
    total,
    h('span', { class: 'aviso-pend-ir' }, 'Revisar', icono('adelante')));
  const pintar = (n, lista) => {
    caja.hidden = !n;
    texto.textContent = n === 1 ? '1 consumo por confirmar' : `${n} consumos por confirmar`;
    const suma = (lista || []).filter((p) => !p.moneda || p.moneda === 'PEN').reduce((s, p) => s + (Number(p.monto) || 0), 0);
    total.textContent = lista && suma ? soles(suma) : '';
  };
  if (Array.isArray(estado.ultimosPendientes)) pintar(estado.ultimosPendientes.length, estado.ultimosPendientes);
  else pintar(Number(cuantos) || 0, null);
  cargarRapido('pendientes', {}, 'pendientes').then((rp) => {
    const lista = (rp?.datos?.pendientes || []).slice();
    estado.ultimosPendientes = lista;
    pintar(lista.length, lista);
    const vistos = pendientesVistos();
    // Se espera a que Inicio termine de pintarse; si la persona ya se fue a otra pantalla, no se abre.
    if (lista.some((p) => !vistos.includes(p.id))) setTimeout(() => {
      if (document.querySelector('.aviso-pend:not([hidden])') && !document.querySelector('dialog[open]')) abrirPendientes();
    }, 700);
  }).catch(() => { /* se queda el número que vino con Inicio */ });
  return caja;
}

// Popup Por confirmar: un voucher a la vez, con todos los tipos de gasto a la vista.
// Tocar un tipo de gasto confirma y pasa al siguiente (un toque por consumo); "Confirmar los N" hace todos de golpe.
// El envío a la hoja va por detrás, en fila: la persona no espera a cada uno.
async function abrirPendientes() {
  if (document.querySelector('dialog.pend-dialogo')) return;
  if (!(leerCache('config')?.datos?.conceptos || []).length) await cargarRapido('config', {}, 'config').catch(() => null);
  const conceptos = leerCache('config')?.datos?.conceptos || [];
  const personas = responsables();
  const yo = usuarioActual()?.nombre || '';
  const cola = (estado.ultimosPendientes || []).slice();
  if (!cola.length) return;
  marcarPendientesVistos(cola);
  let enVuelo = 0, huboCambios = false, envios = Promise.resolve(), cerrado = false;

  const dlg = h('dialog', { class: 'hoja-modal pend-dialogo', 'aria-label': 'Por confirmar' });
  const cerrar = () => {
    if (cerrado) return; cerrado = true;
    dlg.classList.add('cerrando');
    setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190);
    if (huboCambios) { estado.cambioDesde = Date.now(); envios.then(() => navegar({ silencioso: true })); }
  };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const progreso = h('span', { class: 'suave pend-progreso' });
  const paso = h('div', { class: 'pend-paso' });
  dlg.append(h('div', { class: 'cierre-caja pend-caja' },
    h('div', { class: 'modal-cab' }, h('div', {}, h('strong', {}, 'Por confirmar'), progreso),
      h('button', { type: 'button', class: 'boton', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    paso));

  const idDe = (p) => idTarjetaDePendiente(p);
  const directoDe = (p) => (['PLIN', 'YAPE', 'EFECTIVO', 'LEMON'].includes(String(p.medioSugerido || '').toUpperCase()) ? String(p.medioSugerido).toUpperCase() : null);
  const enDolares = (p) => p.moneda && p.moneda !== 'PEN';
  const sugeridoDe = (p) => (p._concepto !== undefined ? p._concepto : (p._concepto = conceptoParaComercio(p.comercio) || ''));
  const quienDe = (p) => p._quien || (p._quien = p.responsable || DUENIO_TC[idDe(p)] || yo);
  const comercioDe = (p) => limpiarComercio(p.comercio || '') || p.comercio || 'Consumo';
  const montoDe = (p) => (enDolares(p) ? `US$ ${Number(p.monto).toFixed(2)}` : soles(p.monto));
  const debitoDe = (p) => (/^TD_/.test(String(p.medioSugerido || '')) ? (leerCache('config')?.datos?.medios || []).find((m) => m.id === p.medioSugerido) || { id: p.medioSugerido, etiqueta: 'Débito' } : null);
  const faltaOrigen = (p) => motorBolsas() && (!!debitoDe(p) || !!CUENTA_DE_MEDIO[directoDe(p)]) && p._origen === undefined; // débito, Yape o Plin: se pregunta cada vez
  const listos = () => cola.filter((p) => sugeridoDe(p) && !enDolares(p) && !faltaOrigen(p));
  const sacarDeMemoria = (p) => { if (Array.isArray(estado.ultimosPendientes)) estado.ultimosPendientes = estado.ultimosPendientes.filter((x) => x.id !== p.id); borrarCaches(['pendientes']); };
  const devolver = (p, nota) => { p._nota = nota; cola.push(p); if (!cerrado && cola.length === 1) pintar(); else if (!cerrado) refrescarProgreso(); };

  // Envíos en fila, por detrás.
  const enviar = (p, concepto) => {
    enVuelo++; huboCambios = true;
    const datos = { idCliente: uuid(), id: p.id, concepto, descripcion: comercioDe(p) };
    if (quienDe(p) && quienDe(p) !== yo) datos.responsable = quienDe(p);
    if (directoDe(p)) datos.medio = directoDe(p);
    if (p._repetido) datos.confirmarDuplicado = true;
    const origenP = p._origen === undefined && directoDe(p) && !lineaDeBilletera(directoDe(p)) ? 'P' : p._origen;
    if (motorBolsas() && origenP) datos.origen = origenP.startsWith('P') ? `P:${quienDe(p)}` : origenP;
    if (p._cuotas?.cuotas > 1) { datos.cuotas = p._cuotas.cuotas; if (p._cuotas.montoCuota > 0) datos.montoCuota = p._cuotas.montoCuota; }
    envios = envios.then(async () => {
      try {
        const res = await llamarApi('confirmarPendiente', datos, { email: emailSesion() });
        if (res?.posibleDuplicado) {
          const c = res.coincidencia || {};
          p._repetido = true; p._concepto = concepto;
          devolver(p, `Ya hay un gasto igual en ${c.hoja || 'la hoja'} (${c.descripcion || ''}, ${soles(c.monto || p.monto)}, ${fechaCorta(c.fecha || p.fecha)}). Confírmalo otra vez para guardarlo igual, o descártalo.`);
        } else { sacarDeMemoria(p); avisar(`Guardado: ${datos.descripcion}, ${montoDe(p)}${datos.cuotas ? ` en ${datos.cuotas} cuotas` : ''}`, 'ok'); }
      } catch (e) { devolver(p, mensajeError(e, 'No se pudo guardar. Intenta de nuevo.')); }
      enVuelo--; alTerminarEnvios();
    });
  };
  const descartarEnvio = (p) => {
    enVuelo++; huboCambios = true;
    envios = envios.then(async () => {
      try { await llamarApi('descartarPendiente', { id: p.id }, { email: emailSesion() }); sacarDeMemoria(p); }
      catch (e) { devolver(p, mensajeError(e, 'No se pudo descartar.')); }
      enVuelo--; alTerminarEnvios();
    });
  };
  const alTerminarEnvios = () => {
    if (cerrado) return;
    if (!cola.length && !enVuelo) setTimeout(() => { if (!cola.length && !enVuelo) cerrar(); }, sinMovimiento() ? 0 : 900);
    else if (!cola.length) pintar();
  };
  const refrescarProgreso = () => { progreso.textContent = cola.length ? (cola.length === 1 ? 'Queda 1' : `Quedan ${cola.length}`) : ''; };

  // Sale el voucher actual (sellado o cayendo) y entra el siguiente.
  const avanzar = (ticket, modo) => {
    if (!ticket || sinMovimiento()) { pintar(); return; }
    paso.classList.add('ocupado');
    if (modo === 'confirmado') {
      ticket.classList.add('confirmada');
      const sello = ticket.querySelector('.sello');
      sello.hidden = false; sello.classList.add('golpe');
      setTimeout(pintar, 520);
    } else if (modo === 'descartado') {
      ticket.animate([{ opacity: 1, transform: 'rotate(0) translateY(0)' }, { opacity: 0, transform: 'rotate(6deg) translateY(60px) scale(0.8)' }], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
      setTimeout(pintar, 300);
    } else {
      ticket.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-40px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      setTimeout(pintar, 200);
    }
  };

  const pintar = () => {
    if (cerrado) return;
    paso.classList.remove('ocupado');
    refrescarProgreso();
    if (!cola.length) {
      paso.replaceChildren(h('div', { class: 'pend-fin' }, h('span', { class: 'pend-fin-ico' }, icono('check')),
        h('strong', {}, 'Todo confirmado'), h('span', { class: 'suave' }, enVuelo ? 'Anotando en tu hoja…' : 'Quedó anotado en tu hoja.')));
      return;
    }
    const p = cola[0];
    const id = idDe(p), directo = directoDe(p), dolar = enDolares(p), sugerido = sugeridoDe(p);
    if (directo && !CUENTA_DE_MEDIO[directo] && motorBolsas() && p._origen === undefined) p._origen = 'P'; // efectivo: sale de lo que ya se tiene
    const hora = (p.fechaCorreo || '').slice(11, 16);
    const deBilletera = ['YAPE', 'LEMON'].includes(String(p.banco || '').toUpperCase()); // leído del correo de Yape o Lemon
    const deb = debitoDe(p);
    const emisor = deb ? deb.etiqueta : directo ? (deBilletera ? (directo === 'LEMON' ? 'Lemon' : 'Yape') : `${directo === 'PLIN' ? 'Plin' : directo === 'YAPE' ? 'Yape' : directo === 'LEMON' ? 'Lemon' : 'Efectivo'} · débito BCP`) : nombreTC(id);
    const ticket = h('article', { class: `pend voucher compacto tc-${deb ? claseDebito(deb.banco) : directo ? 'HORMIGA' : id}` },
      h('span', { class: 'sello', 'aria-hidden': 'true', hidden: true }, 'Confirmado'),
      h('div', { class: 'vch-fila' },
        h('span', { class: 'pend-ico' }, catIco(sugerido || 'otro'), chipTC(deb ? claseDebito(deb.banco) : directo ? 'HORMIGA' : id, 'mini insignia')),
        h('div', { class: 'vch-comercio' }, h('strong', {}, comercioDe(p).toUpperCase()),
          h('span', { class: 'vch-detalle' }, `${emisor}${p.ultimos4 ? ' ···· ' + p.ultimos4 : ''} · ${fechaCorta(p.fecha)}${hora ? ' · ' + hora : ''}`)),
        h('strong', { class: 'pend-monto' }, montoDe(p))));
    if (!sinMovimiento()) ticket.classList.add('entra');
    let cajaElige = null;
    const confirmar = (c) => {
      if (paso.classList.contains('ocupado')) return;
      if (faltaOrigen(p)) { p._concepto = c; cajaElige?.classList.remove('tiembla'); void cajaElige?.offsetWidth; cajaElige?.classList.add('tiembla'); return; }
      cola.shift(); enviar(p, c); avanzar(ticket, 'confirmado');
    };
    const nota = p._nota || (dolar ? 'Está en dólares: regístralo a mano con el monto en soles y descarta este.' : '');
    const chips = h('div', { class: 'elige-tipo' }, conceptos.map((c) => h('button', { type: 'button', class: 'opcion chica', disabled: dolar, 'aria-pressed': String(c === sugerido), onclick: () => confirmar(c) },
      catIco(c), h('span', { class: 'opcion-texto' }, c))));
    const botonesP = personas.length > 1 ? personas.map((n) => h('button', { type: 'button', class: 'opcion quien chica', title: nombreCorto(n), 'aria-pressed': String(n === quienDe(p)), onclick: () => {
      p._quien = n; botonesP.forEach((b) => b.setAttribute('aria-pressed', String(b.title === nombreCorto(n))));
    } }, avatar(n, 'mini'), h('span', { class: 'opcion-texto' }, nombreCorto(n)))) : [];
    const nListos = listos().length;
    const btnPrincipal = sugerido && !dolar
      ? h('button', { type: 'button', class: 'boton primario pend-ok', onclick: () => confirmar(sugerido) }, icono('check'), `Confirmar · ${sugerido}`)
      : null;
    const btnTodos = nListos >= 2 ? h('button', { type: 'button', class: 'boton pend-todos', onclick: () => {
      if (paso.classList.contains('ocupado')) return;
      const lote = listos();
      for (const x of lote) { cola.splice(cola.indexOf(x), 1); enviar(x, sugeridoDe(x)); }
      avanzar(lote.includes(p) ? ticket : null, 'confirmado');
    } }, `Confirmar los ${nListos}`) : null;
    paso.replaceChildren(...[
      ticket,
      nota ? h('p', { class: 'mensaje pend-nota' }, nota) : null,
      h('p', { class: 'etq pend-pregunta' }, dolar ? 'Tipo de gasto' : 'Toca el tipo de gasto y queda confirmado'),
      chips,
      faltaOrigen(p) ? (cajaElige = h('div', { class: 'pend-elige-origen' },
        h('span', {}, `Pagaste con ${deb ? 'débito' : directo === 'YAPE' ? 'Yape (cuenta BCP)' : 'Plin (cuenta Interbank)'}. ¿De dónde sale?`),
        h('div', { class: 'pend-pase-botones' },
          h('button', { type: 'button', class: 'boton chico', onclick: () => { p._origen = ''; pintar(); } }, icono('inicio'), 'Presupuesto'),
          h('button', { type: 'button', class: 'boton chico', onclick: () => { p._origen = 'P'; pintar(); } }, avatar(quienDe(p), 'mini'), `Sobrante de ${nombreCorto(quienDe(p))}`)))) : motorBolsas() ? (() => {
        const ops = () => opcionesOrigen(quienDe(p), !!directoDe(p) || !!deb, '', lineaDeBilletera(directoDe(p)) ? directoDe(p) : null);
        const actual = () => ops().find((o) => (o.valor.startsWith('P:') ? 'P' : o.valor) === (p._origen || '')) || ops()[0];
        const b = h('button', { type: 'button', class: 'pend-origen', title: 'Toca para cambiar de dónde sale', onclick: () => {
          const lista = ops();
          const i = lista.findIndex((o) => (o.valor.startsWith('P:') ? 'P' : o.valor) === (p._origen || ''));
          const sig = lista[(Math.max(0, i) + 1) % lista.length];
          p._origen = sig.valor.startsWith('P:') ? 'P' : sig.valor;
          b.lastChild.textContent = actual().etiqueta;
          b.classList.toggle('activo', !!p._origen);
        } }, h('span', { class: 'suave' }, 'Sale de'), h('strong', {}, actual().etiqueta));
        b.classList.toggle('activo', !!p._origen);
        return b;
      })() : null,
      motorCuotas() && !directo && !dolar ? (() => {
        const texto = () => { const c = p._cuotas; const l = c?.cuotas > 1 ? montosDeCuotas(p.monto, c.cuotas, c.montoCuota) : []; return l.length > 1 ? `${c.cuotas} × ${soles(l[l.length - 1])}` : 'No, un solo pago'; };
        const b = h('button', { type: 'button', class: 'pend-origen pend-cuotas', title: 'Toca si fue en cuotas', onclick: async () => {
          const r = await elegirCuotas({ total: Number(p.monto), cuotas: p._cuotas?.cuotas || 1, montoCuota: p._cuotas?.montoCuota || 0 });
          if (r) p._cuotas = r.cuotas > 1 ? r : null;
          b.lastChild.textContent = texto();
          b.classList.toggle('activo', !!p._cuotas);
        } }, h('span', { class: 'suave' }, 'En cuotas'), h('strong', {}, texto()));
        b.classList.toggle('activo', !!p._cuotas);
        return b;
      })() : null,
      h('div', { class: 'pend-pie' },
        botonesP.length ? h('div', { class: 'opciones pend-quien' }, botonesP) : null,
        h('button', { type: 'button', class: 'boton enlace', onclick: () => { if (paso.classList.contains('ocupado')) return; cola.shift(); descartarEnvio(p); avanzar(ticket, 'descartado'); } }, 'Descartar'),
        cola.length > 1 ? h('button', { type: 'button', class: 'boton enlace', onclick: () => { if (paso.classList.contains('ocupado')) return; cola.push(cola.shift()); avanzar(ticket, 'saltar'); } }, 'Saltar') : null),
      motorCuentas() && otroDePase(p.comercio, quienDe(p)) ? (() => {
        const otro = otroDePase(p.comercio, quienDe(p));
        return h('div', { class: 'pend-pase' },
          h('span', {}, `¿Es un pase de plata a ${nombreCorto(otro)}? No cuenta como gasto.`),
          h('div', { class: 'pend-pase-botones' },
            h('button', { type: 'button', class: 'boton chico primario', onclick: () => {
              if (paso.classList.contains('ocupado')) return;
              enviarCuenta({ de: quienDe(p), a: otro, monto: Number(p.monto), nota: comercioDe(p) }).then(() => avisar(`Pasó a Cuentas: ${nombreCorto(otro)} te debe ${soles(p.monto)}`, 'ok'))
                .catch((e) => avisar(mensajeError(e, 'No se pudo anotar en Cuentas.'), 'error'));
              cola.shift(); descartarEnvio(p); avanzar(ticket, 'descartado');
            } }, 'Se lo presté'),
            h('button', { type: 'button', class: 'boton chico', onclick: () => {
              if (paso.classList.contains('ocupado')) return;
              cola.shift(); descartarEnvio(p); avanzar(ticket, 'descartado'); avisar('No cuenta como gasto', 'ok');
            } }, 'Solo un pase')));
      })() : null,
      h('div', { class: 'pend-acciones' }, btnTodos, btnPrincipal)].filter(Boolean));
    if (btnPrincipal && matchMedia('(pointer: fine)').matches) btnPrincipal.focus({ preventScroll: true });
  };

  document.body.append(dlg);
  pintar();
  dlg.showModal();
}

// El popup se abre solo cuando hay consumos que todavía no se han visto en este equipo.
function pendientesVistos() { try { return JSON.parse(localStorage.getItem('ff:pend-vistos') || '[]'); } catch { return []; } }
function marcarPendientesVistos(lista) {
  const ids = [...new Set([...pendientesVistos(), ...lista.map((p) => p.id)])].slice(-200);
  try { localStorage.setItem('ff:pend-vistos', JSON.stringify(ids)); } catch { /* nada */ }
}

// Despedida de una tarjeta de la bandeja: confirmada (destello verde con check y se pliega) o descartada
// (se desliza a un lado). Las demás se acomodan deslizándose a su nuevo lugar (FLIP), nada salta.
function despedirPendiente(li, modo, alFinal) {
  const lista = li.parentElement;
  if (!lista || sinMovimiento()) { li.remove(); alFinal(); return; }
  const hermanos = [...lista.children].filter((x) => x !== li);
  const antes = new Map(hermanos.map((x) => [x, x.getBoundingClientRect()]));
  const quitarYAcomodar = () => {
    li.remove();
    hermanos.forEach((x) => {
      const a = antes.get(x); const b = x.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    alFinal();
  };
  li.style.pointerEvents = 'none';
  if (modo === 'confirmada') {
    li.classList.add('confirmada');
    const sello = li.querySelector('.sello');
    if (sello) { sello.hidden = false; sello.textContent = 'Confirmado'; sello.classList.remove('golpe'); void sello.offsetWidth; sello.classList.add('golpe'); }
    else li.append(h('span', { class: 'pend-check', 'aria-hidden': 'true' }, icono('check')));
    // 1) destello y check (520 ms) · 2) la tarjeta se encoge y desaparece (380 ms)
    setTimeout(() => {
      // El voucher se guarda: se encoge hacia arriba como si lo archivaran.
      li.animate([{ opacity: 1, transform: 'scale(1) translateY(0)' }, { opacity: 0, transform: 'scale(0.86) translateY(-18px)' }], { duration: 400, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      setTimeout(quitarYAcomodar, 410);
    }, 720);
  } else {
    // El papel se arruga y cae.
    li.animate([
      { opacity: 1, transform: 'rotate(0) scale(1) translateY(0)' },
      { opacity: 1, transform: 'rotate(-4deg) scale(0.94) translateY(6px)', offset: 0.35 },
      { opacity: 0, transform: 'rotate(7deg) scale(0.7) translateY(90px)' }], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    setTimeout(quitarYAcomodar, 530);
  }
}

function idTarjetaDePendiente(p) {
  const t = String(p.tarjeta || p.banco || '').toUpperCase();
  if (t === 'IBK') return 'IBK_P';
  return ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY'].includes(t) ? t : 'BCP';
}
function nombreTC(id) { return NOMBRE_TC[id] ? (DUENIO_TC[id] ? `${NOMBRE_TC[id]} · ${DUENIO_TC[id]}` : NOMBRE_TC[id]) : id; }

// Sugiere el concepto mirando qué concepto se le puso antes a ese mismo comercio.
function conceptoParaComercio(comercio) {
  const clave = normalizarTexto(limpiarComercio(comercio || ''));
  if (!clave) return '';
  const todos = consumosDe(leerCache('tarjetas-todo')?.datos?.tarjetas || leerCache('tarjetas')?.datos?.tarjetas || [], () => true);
  const cuenta = new Map();
  for (const c of todos) {
    const d = normalizarTexto(limpiarComercio(c.descripcion || ''));
    if (d && c.concepto && (d === clave || d.includes(clave) || clave.includes(d))) cuenta.set(c.concepto, (cuenta.get(c.concepto) || 0) + 1);
  }
  const porHistorial = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (porHistorial) return porHistorial;
  // Sin historial: por el nombre del comercio (solo si existe un concepto parecido en la lista).
  const lista = leerCache('config')?.datos?.conceptos || [];
  const buscar = (pista) => lista.find((c) => normalizarTexto(c).includes(pista)) || '';
  const PISTAS = [
    [/^lemon a /, 'pasaje'], // los envíos chicos por Lemon son pasajes
    [/netflix|spotify|disney|hbo|max|youtube|prime|apple|google|claro video|movistar play/, 'suscrip'],
    [/rappi|pedidosya|didi ?food|uber ?eats|glovo/, 'delivery'],
    [/plaza vea|wong|metro|tottus|vivanda|makro|mass|tambo|oxxo|listo/, 'supermercado'],
    [/uber|cabify|didi|taxi|indrive|beat|movil bus|metropolitano/, 'pasaje'],
    [/farmacia|inkafarma|mifarma|boticas|clinica|salud/, 'salud'],
    [/kfc|bembos|pizza|burger|chifa|restaurant|starbucks|cafe|pollo|norkys|rokys|papa john|dominos|mcdonald|popeyes/, 'restaurante'],
    [/saga|falabella|ripley|oechsle|zara|h&m|adidas|nike|marathon/, 'ropa'],
    [/cineplanet|cinemark|teatro|concierto|joinnus|teleticket/, 'entreten'],
    [/sodimac|promart|maestro|ikea|casaideas/, 'hogar'],
    [/petshop|veterinaria|mascota|superpet/, 'mascota'],
    [/claro|movistar|entel|bitel|wow|internet/, 'internet'],
  ];
  for (const [re, pista] of PISTAS) if (re.test(clave)) { const c = buscar(pista); if (c) return c; }
  return '';
}
function normalizarTexto(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// Avisos del motor 1.3: cada uno se prende o apaga y se guarda en el motor.
function panelAvisos(correo, mesPasado) {
  const cuerpo = h('div', {}, h('p', { class: 'suave' }, 'Cargando…'));
  const caja = panel('revelar', 'Avisos', null, cuerpo);
  let ajustes = { vencimiento: true, presupuesto: true, gastoGrande: 300, resumenSemanal: true, calendario: true };
  let reloj = null;
  const guardar = () => {
    clearTimeout(reloj);
    reloj = setTimeout(async () => {
      try {
        const r = await llamarApi('guardarAjustesAvisos', ajustes, { email: emailSesion() });
        const dev = r?.ajustes || r;
        if (dev && typeof dev === 'object') ajustes = { ...ajustes, ...dev };
        avisar('Avisos guardados', 'ok');
      } catch (e) { avisar(mensajeError(e, 'No se pudieron guardar los avisos.'), 'error'); }
    }, 500);
  };
  const pintar = () => {
    const inGrande = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Monto desde el que avisa', value: ajustes.gastoGrande ? String(ajustes.gastoGrande) : '' , placeholder: 'Apagado' });
    inGrande.addEventListener('change', () => { const n = Number(String(inGrande.value).replace(/[^\d]/g, '')) || 0; ajustes.gastoGrande = n; inGrande.value = n ? String(n) : ''; guardar(); });
    cuerpo.replaceChildren(
      filaConfig('Correo antes del vencimiento', `Tres días antes de que venza una tarjeta llega un correo a ${correo || 'tu cuenta'}.`,
        interruptor(ajustes.vencimiento, 'Correo antes del vencimiento', (v) => { ajustes.vencimiento = v; guardar(); })),
      filaConfig('Vencimientos en el calendario', 'Cada vencimiento aparece en tu Google Calendar con recordatorio 3 días y 1 día antes. Así te avisa el celular.',
        interruptor(ajustes.calendario, 'Vencimientos en el calendario', (v) => { ajustes.calendario = v; guardar(); })),
      filaConfig('Presupuesto al límite', 'Correo cuando una línea del presupuesto llega al 80 % y cuando se pasa.',
        interruptor(ajustes.presupuesto, 'Presupuesto al límite', (v) => { ajustes.presupuesto = v; guardar(); })),
      filaConfig('Resumen de la semana', 'Los lunes: qué se gastó, los gastos chicos y qué vence pronto. El día de cobro: cómo cerró el mes.',
        interruptor(ajustes.resumenSemanal, 'Resumen de la semana', (v) => { ajustes.resumenSemanal = v; guardar(); })),
      h('div', { class: 'config-fila apilada' },
        h('div', { class: 'config-texto' }, h('strong', {}, 'Gasto grande'), h('span', { class: 'suave' }, 'Correo al instante cuando un gasto llega a este monto en soles. Vacío = apagado.')),
        h('div', { class: 'campo campo-select' }, h('div', { class: 'campo-soles' }, h('span', {}, 'S/'), inGrande))),
      filaConfig('Consumos desde Gmail', 'El motor lee los correos de BCP, Interbank, Ripley y Oh! cada 10 minutos y los deja en "Por confirmar" en Inicio.', h('span', { class: 'pill ok' }, 'Activo')),
      motorReenvio() ? filaReenvio() : null,
      motorWhatsapp() ? filaWhatsapp() : null,
      filaConfig('Cierre de mes', `Cómo terminó ${nombreMesClave(mesPasado) || 'el mes pasado'}.`, h('button', { type: 'button', class: 'boton chico', onclick: () => abrirCierre(mesPasado) }, 'Ver')));
  };
  cargarRapido('ajustesAvisos', {}, 'ajustes-avisos').then((r) => { ajustes = { ...ajustes, ...(r?.datos?.ajustes || r?.datos || {}) }; pintar(); }).catch(() => pintar());
  return caja;
}

// ---------- Administración (motor 1.4): tipos de gasto, personas y tarjetas ----------

async function accionAdmin(accion, datos, exito) {
  const r = await llamarApi(accion, datos, { email: emailSesion() });
  await cargar('config', {}, 'config');
  if (exito) avisar(exito, 'ok');
  return r;
}

function panelConceptos() {
  const lista = h('div', { class: 'config-lista' });
  const caja = panel('revelar config-conceptos', 'Tipos de gasto',
    h('button', { type: 'button', class: 'boton chico', onclick: () => dialogoConcepto(null, pintar) }, '+ Agregar'),
    lista);
  const pintar = () => {
    const conceptos = leerCache('config')?.datos?.conceptos || [];
    lista.replaceChildren(...conceptos.map((c) => h('button', { type: 'button', class: 'config-fila toca', onclick: () => dialogoConcepto(c, pintar) },
      catIco(c), h('div', { class: 'config-texto' }, h('strong', {}, c)), icono('adelante'))));
    if (!conceptos.length) lista.append(h('p', { class: 'suave' }, 'Todavía no hay tipos de gasto.'));
  };
  pintar();
  return caja;
}

// Ventanita de un tipo de gasto: nombre, ícono y quitar. Sirve también para agregar.
function dialogoConcepto(c, alTerminar) {
  const nuevo = !c;
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': nuevo ? 'Nuevo tipo de gasto' : 'Editar tipo de gasto' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const inNombre = h('input', { id: 'cg-nombre', type: 'text', maxlength: '40', placeholder: 'Ej. Gimnasio', value: c || '' });
  let icono_ = nuevo ? '' : iconoDe(c);
  const opciones = Object.keys(CATEGORIAS).filter((k) => CATEGORIAS[k][1] && CATEGORIAS[k][1].includes('<'));
  const botones = opciones.map((k) => h('button', { type: 'button', class: 'elige-icono', 'aria-pressed': String(k === icono_), title: k, onclick: () => { icono_ = k; botones.forEach((b) => b.setAttribute('aria-pressed', String(b.title === k))); } }, catIco(k)));
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const zona = h('div', { class: 'zona-confirmar' });
  const btn = h('button', { type: 'submit', class: 'boton primario' }, nuevo ? 'Agregar' : 'Guardar');
  const btnQuitar = nuevo ? null : h('button', { type: 'button', class: 'boton enlace peligro', onclick: () => {
    const intentar = async (forzar) => {
      try {
        const r = await llamarApi('quitarConcepto', { nombre: c, forzar: !!forzar }, { email: emailSesion() });
        if (r && r.quitado === false) {
          zona.replaceChildren();
          confirmarEnLinea(zona, `"${c}" está en ${r.usos} gasto${r.usos === 1 ? '' : 's'}; esos gastos lo conservan pero ya no se podrá elegir. ¿Quitarlo igual?`, 'Quitar igual', () => intentar(true));
          return;
        }
        await cargar('config', {}, 'config'); avisar('Tipo de gasto quitado', 'ok'); cerrar(); alTerminar();
      } catch (e) { msg.textContent = mensajeError(e, 'No se pudo quitar.'); msg.hidden = false; zona.replaceChildren(); }
    };
    confirmarEnLinea(zona, `¿Quitar "${c}" de la lista?`, 'Quitar', () => intentar(false));
  } }, 'Quitar este tipo de gasto');
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    const nombre = inNombre.value.trim();
    if (nombre.length < 2) { msg.textContent = 'Escribe el nombre.'; msg.hidden = false; inNombre.focus(); return; }
    ocuparBoton(btn, 'Guardando…');
    try {
      if (nuevo) await llamarApi('agregarConcepto', { nombre }, { email: emailSesion() });
      else if (nombre !== c) await llamarApi('renombrarConcepto', { de: c, a: nombre }, { email: emailSesion() });
      if (icono_ && icono_ !== (nuevo ? '' : iconoDe(c)) || (nuevo && icono_)) {
        if (motorIconos()) await llamarApi('guardarIconoConcepto', { concepto: nombre, icono: claveAIcono(icono_) }, { email: emailSesion() });
        else { const m = iconosElegidos(); m[nombre] = icono_; try { localStorage.setItem('ff:iconos', JSON.stringify(m)); } catch { /* nada */ } }
      }
      await cargar('config', {}, 'config');
      cerrar(); avisar(nuevo ? `Agregado: ${nombre}` : 'Guardado', 'ok'); alTerminar(); navegar({ silencioso: true });
    } catch (e) { liberarBoton(btn, nuevo ? 'Agregar' : 'Guardar'); msg.textContent = mensajeError(e, 'No se pudo guardar.'); msg.hidden = false; }
  } },
    h('p', { class: 'cierre-etq' }, nuevo ? 'Nuevo tipo de gasto' : c),
    h('div', { class: 'campo' }, h('label', { for: 'cg-nombre' }, 'Nombre'), inNombre),
    h('p', { class: 'etq' }, 'Ícono'),
    h('div', { class: 'elige-iconos' }, botones),
    msg, zona,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar'), btnQuitar));
  dlg.append(form); document.body.append(dlg); dlg.showModal(); if (nuevo) inNombre.focus();
}

function panelPersonasAdmin() {
  const lista = h('div', { class: 'config-lista' });
  const inNombre = h('input', { type: 'text', maxlength: '40', placeholder: 'Nombre', 'aria-label': 'Nombre de la persona' });
  const inCorreo = h('input', { type: 'email', maxlength: '80', placeholder: 'correo@gmail.com', 'aria-label': 'Correo de Google de la persona' });
  const btn = h('button', { type: 'button', class: 'boton chico primario' }, 'Agregar');
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const caja = panel('revelar config-personas', 'Personas', null,
    h('p', { class: 'suave' }, 'Entran con su cuenta de Google; los gastos se anotan a su nombre.'),
    lista, h('p', { class: 'etq' }, 'Agregar persona'), h('div', { class: 'config-agregar dos' }, inNombre, inCorreo, btn), msg);
  const error = (e, txt) => { msg.textContent = mensajeError(e, txt); msg.hidden = false; };
  let usuarios = [];
  const yo = emailSesion();
  const pintar = () => {
    lista.replaceChildren(...usuarios.map((u, i) => h('div', { class: 'config-fila persona-adm', style: `--i: ${i}` },
      avatar(u.nombre, 'grande'),
      h('div', { class: 'config-texto' }, h('strong', {}, u.nombre), h('span', { class: 'suave' }, u.correo)),
      u.correo === yo ? h('span', { class: 'pill ok' }, 'Tú') : h('button', { type: 'button', class: 'boton chico enlace peligro', onclick: (ev) => {
        const fila = ev.currentTarget.closest('.config-fila');
        confirmarEnLinea(fila, `${u.nombre} ya no podrá entrar a la app. ¿Quitar?`, 'Quitar', async () => {
          try { const r = await accionAdmin('quitarUsuario', { correo: u.correo }, 'Persona quitada'); usuarios = r?.usuarios || usuarios.filter((x) => x.correo !== u.correo); } catch (e) { error(e, 'No se pudo quitar.'); }
          pintar();
        });
      } }, 'Quitar'))));
  };
  btn.addEventListener('click', async () => {
    const nombre = inNombre.value.trim(), correo = inCorreo.value.trim().toLowerCase();
    if (nombre.length < 2) { inNombre.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { inCorreo.focus(); error(null, 'Escribe un correo válido.'); return; }
    ocuparBoton(btn, '…');
    try { const r = await accionAdmin('agregarUsuario', { nombre, correo }, `${nombre} ya puede entrar`); usuarios = r?.usuarios || usuarios; inNombre.value = ''; inCorreo.value = ''; msg.hidden = true; } catch (e) { error(e, 'No se pudo agregar.'); }
    liberarBoton(btn, 'Agregar');
    pintar();
  });
  llamarApi('usuarios', {}, { email: yo }).then((r) => { usuarios = r?.usuarios || []; pintar(); }).catch(() => { lista.replaceChildren(h('p', { class: 'suave' }, 'No se pudo leer la lista de personas.')); });
  return caja;
}

// ---------------------------------------------------------------------------
// Tarjetas de débito (motor 1.21): la plata de la cuenta de cada uno. Al pagar con una, la app pregunta si sale
// del presupuesto (fondo común) o del sobrante. Se anotan en Gastos Hormiga.
// ---------------------------------------------------------------------------
function motorDebitos() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 21); }
const BANCOS_DEBITO = ['BCP', 'Interbank', 'Sip', 'BBVA', 'Scotiabank', 'Banco de la Nación'];
function panelDebitos() {
  const cuerpo = h('div', { class: 'config-lista' });
  const caja = panel('revelar config-debitos', 'Tarjetas de débito', h('button', { type: 'button', class: 'boton chico', onclick: () => dialogoDebito(null, pintar) }, '+ Agregar'), cuerpo);
  function pintar(lista) {
    const activas = (lista || []).filter((d) => d.activa !== false);
    cuerpo.replaceChildren(...(activas.length ? activas.map((d) => h('div', { class: 'config-fila tc' },
      h('span', { class: `chip-tc mini tc-${claseDebito(d.banco)}`, 'aria-hidden': 'true' }),
      h('div', { class: 'config-texto' }, h('strong', {}, `Débito ${d.banco}`), h('span', { class: 'suave' }, d.titular ? nombreCorto(d.titular) : 'De la casa')),
      h('button', { type: 'button', class: 'boton chico', onclick: () => dialogoDebito(d, pintar) }, 'Editar')))
      : [h('p', { class: 'suave' }, 'Agrega las tarjetas de débito para elegirlas al registrar un gasto.')]));
  }
  const enCache = leerCache('config')?.datos?.debitos;
  if (enCache) pintar(enCache); else cuerpo.append(h('p', { class: 'suave' }, 'Cargando…'));
  cargarRapido('config', {}, 'config').then((r) => pintar(r?.datos?.debitos || [])).catch(() => { if (!enCache) cuerpo.replaceChildren(h('p', { class: 'suave' }, 'No se pudo cargar. Intenta en un momento.')); });
  return caja;
}
function dialogoDebito(d, alTerminar) {
  const v = ventanita('meta-dlg debito-dlg', d ? 'Editar tarjeta de débito' : 'Nueva tarjeta de débito');
  const personas = responsables();
  let banco = d?.banco || '';
  let titular = d?.titular || (usuarioActual()?.nombre || '');
  const inBanco = h('input', { type: 'text', maxlength: '20', autocomplete: 'off', placeholder: 'Banco', value: banco, 'aria-label': 'Banco' });
  const chipsBanco = h('div', { class: 'opciones antojos-chips' });
  const chipsTitular = h('div', { class: 'opciones' });
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const zona = h('div', { class: 'zona-confirmar' });
  const pintar = () => {
    chipsBanco.replaceChildren(...BANCOS_DEBITO.map((b) => h('button', { type: 'button', class: 'opcion chica', 'aria-pressed': String(normalizar(b) === normalizar(banco)), onclick: () => { banco = b; inBanco.value = b; pintar(); } }, b)));
    chipsTitular.replaceChildren(...personas.map((p) => h('button', { type: 'button', class: 'opcion quien', 'aria-pressed': String(mismoNombre(p, titular)), onclick: () => { titular = p; pintar(); } }, avatar(p, 'mini'), h('span', { class: 'opcion-texto' }, nombreCorto(p)))));
  };
  inBanco.addEventListener('input', () => { banco = inBanco.value; pintar(); });
  const enviar = async (datos, btn, texto) => {
    msg.hidden = true;
    ocuparBoton(btn, 'Guardando…');
    try {
      const r = await llamarApi('guardarDebito', datos, { email: emailSesion() });
      await cargar('config', {}, 'config').catch(() => null);
      v.cerrar(); alTerminar?.(r?.debitos || []);
      avisar(datos.quitar ? 'Tarjeta de débito quitada' : `Débito ${datos.banco} listo`, 'ok');
    } catch (e) { liberarBoton(btn, texto); msg.textContent = mensajeError(e, 'No se pudo guardar.'); msg.hidden = false; }
  };
  const btn = h('button', { type: 'button', class: 'boton primario' }, d ? 'Guardar' : 'Agregar');
  btn.onclick = () => {
    if (inBanco.value.trim().length < 2) { msg.textContent = 'Escribe o elige el banco.'; msg.hidden = false; inBanco.focus(); return; }
    enviar({ id: d?.id, banco: inBanco.value.trim(), titular }, btn, d ? 'Guardar' : 'Agregar');
  };
  const btnQuitar = d ? h('button', { type: 'button', class: 'boton enlace peligro', onclick: () => confirmarEnLinea(zona, 'Deja de salir al registrar gastos. Lo ya anotado queda igual. ¿Quitar?', 'Quitar', () => enviar({ id: d.id, quitar: true }, btnQuitar, 'Quitar esta tarjeta')) }, 'Quitar esta tarjeta') : null;
  v.caja.append(
    h('span', { class: 'conectar-ico' }, icono('tarjetas')),
    h('p', { class: 'cierre-etq' }, d ? `Débito ${d.banco}` : 'Tarjeta de débito'),
    h('div', { class: 'campo' }, h('label', {}, 'Banco'), chipsBanco, inBanco),
    personas.length ? h('div', { class: 'campo' }, h('label', {}, 'De quién es'), chipsTitular) : null,
    msg, zona,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: v.cerrar }, 'Cancelar'), btnQuitar));
  pintar();
  v.abrir();
}

// Agregar o editar una tarjeta del catálogo: nombre, titular, fechas, color y los datos impresos.
function dialogoTarjeta(t) {
  const nueva = !t;
  const d = nueva ? {} : datosTC(t.id);
  const personas = responsables();
  const dlg = h('dialog', { class: 'hoja-modal tarjeta-dlg', 'aria-label': nueva ? 'Nueva tarjeta' : 'Editar tarjeta' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const inNombre = h('input', { id: 'tj-nombre', type: 'text', maxlength: '30', placeholder: 'Ej. BBVA, Diners', value: t?.nombre || '' });
  const opcionesTitular = (lista) => [h('option', { value: '' }, 'De la casa'), ...lista.map((p) => h('option', { value: p, selected: t && t.titular && nombreCorto(p) === nombreCorto(t.titular) ? true : null }, nombreCorto(p)))];
  const selTitular = h('select', { id: 'tj-titular' }, opcionesTitular(personas));
  // Si este equipo aún no tiene la lista de personas, se trae del Sheets y se completan las opciones.
  if (!personas.length) {
    cargarRapido('config', {}, 'config').then(() => {
      const lista = responsables();
      if (lista.length && dlg.isConnected) { const antes = selTitular.value; selTitular.replaceChildren(...opcionesTitular(lista)); if (antes) selTitular.value = antes; }
    }).catch(() => { /* queda "De la casa" */ });
  }
  const inCierre = h('input', { id: 'tj-cierre', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: '—', value: t?.cierre || '' });
  const inVence = h('input', { id: 'tj-vence', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: '—', value: t?.vence || '' });
  [inCierre, inVence].forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 2); }));
  let color = t?.color || 'azul';
  const muestras = Object.keys(COLORES_TC).map((k) => h('button', { type: 'button', class: 'color-op', 'data-k': k, title: k, 'aria-label': `Color ${k}`, 'aria-pressed': String(k === color), style: `--op: ${COLORES_TC[k][0]}`, onclick: () => { color = k; muestras.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k))); previa(); } }));
  const inDig = h('input', { id: 'tj-dig', type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '1234', value: d.digitos || '' });
  inDig.addEventListener('input', () => { inDig.value = inDig.value.replace(/\D/g, '').slice(0, 4); });
  const selRed = h('select', { id: 'tj-red' }, h('option', { value: 'visa' }, 'Visa'), h('option', { value: 'mastercard' }, 'Mastercard'), h('option', { value: '' }, 'Sin marca'));
  selRed.value = t ? redTC(t) : 'visa';
  const cajaPrevia = h('div', { class: 'tj-previa' });
  // Diseño: el real de cada banco (como el plástico de verdad) o los colores propios de la app.
  const bancos = [...new Set(Object.values(DISENOS_TC).map((x) => x.banco))];
  const selDiseno = h('select', { id: 'tj-diseno' },
    h('option', { value: '' }, 'Según el banco'),
    bancos.map((b) => h('optgroup', { label: b }, Object.entries(DISENOS_TC).filter(([, x]) => x.banco === b).map(([k, x]) => h('option', { value: k }, `${b} · ${x.nombre}`)))),
    h('option', { value: 'propio' }, 'Colores de la app'));
  selDiseno.value = (d.diseno && (DISENOS_TC[d.diseno] || d.diseno === 'propio')) ? d.diseno : '';
  const campoColor = h('div', { class: 'campo campo-chico tj-campo-color' });
  const verColor = () => { const dis = disenoTC({ id: t?.id || 'NUEVA', nombre: inNombre.value }, selDiseno.value || null); campoColor.hidden = !!dis; };
  selDiseno.addEventListener('change', () => { verColor(); previa(); });
  inNombre.addEventListener('input', verColor);
  const previa = () => {
    const id = t?.id || 'NUEVA';
    const c = COLORES_TC[color];
    cajaPrevia.style.cssText = `--c1:${c[0]};--c2:${c[1]};--acento:${c[2]}`;
    const falsa = { id, nombre: inNombre.value.trim() || 'Tarjeta', titular: selTitular.value, pendiente: 0, proximoVence: null };
    const anterior = NOMBRE_TC[id]; NOMBRE_TC[id] = falsa.nombre; const dAnt = DUENIO_TC[id]; if (selTitular.value) DUENIO_TC[id] = nombreCorto(selTitular.value); else delete DUENIO_TC[id];
    const vis = tarjetaVisual(falsa, false, { diseno: selDiseno.value || null });
    if (anterior !== undefined) NOMBRE_TC[id] = anterior; else delete NOMBRE_TC[id];
    if (dAnt !== undefined) DUENIO_TC[id] = dAnt; else delete DUENIO_TC[id];
    vis.classList.add('tj-mini');
    const num = vis.querySelector('.plastico-numero b.real, .plastico-numero b:last-of-type'); if (num && /^\d{4}$/.test(inDig.value)) num.textContent = inDig.value;
    const red = vis.querySelector('.plastico-red'); if (red) red.remove(); const m = marcaRed(selRed.value); if (m) vis.querySelector('.plastico-pie').append(m);
    cajaPrevia.replaceChildren(vis);
  };
  [inNombre, selTitular, inDig, selRed].forEach((el) => el.addEventListener('input', previa));
  selTitular.addEventListener('change', previa); selRed.addEventListener('change', previa);
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const zona = h('div', { class: 'zona-confirmar' });
  const btn = h('button', { type: 'submit', class: 'boton primario' }, nueva ? 'Crear tarjeta' : 'Guardar');
  const btnQuitar = nueva ? null : h('button', { type: 'button', class: 'boton enlace peligro', onclick: () => {
    confirmarEnLinea(zona, `La tarjeta deja de verse en la app. Sus gastos quedan en la hoja "${t.hoja}". ¿Quitar?`, 'Quitar', async () => {
      try {
        const r = await llamarApi('quitarTarjeta', { id: t.id }, { email: emailSesion() });
        if (r && r.quitada === false) {
          zona.replaceChildren();
          confirmarEnLinea(zona, `Tiene ${r.pendientes} consumo${r.pendientes === 1 ? '' : 's'} por pagar. ¿Quitarla igual?`, 'Quitar igual', async () => {
            await accionAdmin('quitarTarjeta', { id: t.id, forzar: true }, 'Tarjeta quitada'); cerrar(); navegar({ silencioso: true });
          });
          return;
        }
        await cargar('config', {}, 'config'); avisar('Tarjeta quitada', 'ok'); cerrar(); navegar({ silencioso: true });
      } catch (e) { msg.textContent = mensajeError(e, 'No se pudo quitar.'); msg.hidden = false; }
    });
  } }, 'Quitar esta tarjeta');
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    const nombre = inNombre.value.trim();
    if (nombre.length < 2) { msg.textContent = 'Escribe el nombre del banco o la tarjeta.'; msg.hidden = false; inNombre.focus(); return; }
    const cierre = inCierre.value ? Number(inCierre.value) : null, vence = inVence.value ? Number(inVence.value) : null;
    if ((cierre !== null && (cierre < 1 || cierre > 31)) || (vence !== null && (vence < 1 || vence > 31))) { msg.textContent = 'Los días van del 1 al 31.'; msg.hidden = false; return; }
    if ((cierre === null) !== (vence === null)) { msg.textContent = 'Pon los dos días (cierre y vencimiento) o ninguno.'; msg.hidden = false; return; }
    const dig = inDig.value.trim();
    if (dig && !/^\d{4}$/.test(dig)) { msg.textContent = 'Los últimos dígitos son 4 números.'; msg.hidden = false; inDig.focus(); return; }
    msg.hidden = true;
    ocuparBoton(btn, 'Guardando…');
    try {
      const datos = { nombre, titular: selTitular.value, cierre, vence, color };
      let id = t?.id;
      if (nueva) { const r = await llamarApi('agregarTarjeta', { idCliente: uuid(), ...datos }, { email: emailSesion() }); id = r?.id || (r?.tarjetas || []).find((x) => x.nombre === nombre && !CATALOGO_LOCAL.some((y) => y.id === x.id))?.id; }
      else await llamarApi('editarTarjeta', { id, ...datos }, { email: emailSesion() });
      if (id) {
        const nuevos = { digitos: dig, nombre: d.nombre || '', red: selRed.value, diseno: selDiseno.value };
        guardarDatosTC(id, nuevos);
        llamarApi('guardarDatosTarjeta', { id, ...nuevos }, { email: emailSesion() }).catch(() => { /* quedó en este equipo */ });
      }
      await cargar('config', {}, 'config');
      estado.cambioDesde = Date.now();
      cerrar();
      avisar(nueva ? `Tarjeta ${nombre} creada` : 'Tarjeta actualizada', 'ok');
      navegar({ silencioso: true });
    } catch (e) {
      liberarBoton(btn, nueva ? 'Crear tarjeta' : 'Guardar');
      msg.textContent = mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'); msg.hidden = false;
    }
  } },
    h('p', { class: 'cierre-etq' }, nueva ? 'Nueva tarjeta' : `Editar ${nombreCortoTC(t)}`),
    // En computadora: la tarjeta y la nota a la izquierda, los datos a la derecha (sin scroll).
    h('div', { class: 'tj-lado' },
      nueva ? h('p', { class: 'suave' }, 'Se crea una hoja nueva "TC <nombre>" en tu Sheets, con las mismas columnas que las demás.') : null,
      cajaPrevia,
      h('p', { class: 'suave tj-nota' }, 'Cierre: hasta qué día del mes entran las compras. Vencimiento: qué día del mes siguiente se paga. Si la tarjeta no tiene fechas (como Ripley), déjalos vacíos.')),
    h('div', { class: 'tj-campos' },
    h('div', { class: 'modal-cuerpo' },
      h('div', { class: 'campo' }, h('label', { for: 'tj-nombre' }, 'Banco o nombre'), inNombre),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-titular' }, 'Titular'), selTitular),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-diseno' }, 'Diseño'), selDiseno),
      (campoColor.append(h('label', {}, 'Color'), h('div', { class: 'colores tj-colores' }, muestras)), campoColor),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-cierre' }, 'Día de cierre'), inCierre),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-vence' }, 'Día de vencimiento'), inVence),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-dig' }, 'Últimos 4 dígitos'), inDig),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'tj-red' }, 'Marca'), selRed)),
    msg, zona,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar'), btnQuitar)));
  dlg.append(form);
  document.body.append(dlg);
  verColor();
  previa();
  dlg.showModal();
  inNombre.focus();
}

// ---------- Configuración por secciones ----------

function motorPresupuesto() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 5); }

const SECCIONES_CONFIG = [
  ['general', 'General', ['Tu cuenta', 'Apariencia', 'Privacidad']],
  ['presupuesto', 'Presupuesto', ['Presupuesto']],
  ['gastos', 'Gastos', ['Tipos de gasto', 'Registro de gastos']],
  ['tarjetas', 'Tarjetas', ['Tus tarjetas', 'Tarjetas de débito']],
  ['personas', 'Personas', ['Personas']],
  ['avisos', 'Avisos', ['Avisos']],
  ['datos', 'Datos y app', ['Datos y conexión', 'La app']],
];

// Reparte los paneles en pestañas (se recuerda la última abierta en este equipo).
function armarPestanasConfig(raiz, rejilla) {
  const paneles = [...rejilla.children];
  const deSeccion = (p) => {
    const t = p.querySelector('.panel-cab h2')?.textContent.trim() || '';
    return (SECCIONES_CONFIG.find(([, , titulos]) => titulos.some((x) => t.startsWith(x))) || SECCIONES_CONFIG[0])[0];
  };
  paneles.forEach((p) => { p.dataset.seccion = deSeccion(p); });
  let actual = 'general';
  try { actual = localStorage.getItem('ff:config-tab') || 'general'; } catch { /* nada */ }
  if (!SECCIONES_CONFIG.some(([id]) => id === actual)) actual = 'general';
  const botones = SECCIONES_CONFIG.filter(([id]) => paneles.some((p) => p.dataset.seccion === id)).map(([id, texto]) =>
    h('button', { type: 'button', class: 'pest', role: 'tab', 'data-sec': id, 'aria-selected': String(id === actual), onclick: () => elegir(id) }, texto));
  const barra = h('div', { class: 'config-pestanas', role: 'tablist' }, h('div', { class: 'pestanas' }, botones));
  const elegir = (id) => {
    actual = id;
    try { localStorage.setItem('ff:config-tab', id); } catch { /* nada */ }
    botones.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sec === id)));
    paneles.forEach((p, i) => {
      const ver = p.dataset.seccion === id;
      p.hidden = !ver;
      if (ver) { p.classList.add('visible'); p.style.setProperty('--i', String(i % 4)); p.classList.remove('entra'); void p.offsetWidth; p.classList.add('entra'); }
    });
    rejilla.classList.toggle('una', paneles.filter((p) => !p.hidden).length === 1);
  };
  raiz.insertBefore(barra, rejilla);
  elegir(actual);
}

// Líneas del presupuesto (motor 1.5): ingresos, gastos y ahorros; agregar, renombrar, quitar, monto y conceptos que cuentan.
function panelPresupuestoAdmin() {
  const cuerpo = h('div', { class: 'pres-admin' }, h('p', { class: 'suave' }, 'Cargando…'));
  const mes = mesActual();
  const caja = panel('revelar config-presupuesto', 'Presupuesto', null, cuerpo);
  let lineas = [];
  const recargar = async () => {
    const r = await llamarApi('lineasPresupuesto', { mes }, { email: emailSesion() });
    lineas = r?.lineas || [];
    guardarCache('lineas:' + mes, { lineas });
    estado.cambioDesde = Date.now();
    pintar();
  };
  // v149: se entiende de un vistazo. Arriba qué es y cómo se reparte lo que entra; a la izquierda ingresos y ahorros;
  // a la derecha las tarjetas (las calcula la hoja, no se tocan) y las líneas de gasto con los tipos que cuentan en cada una.
  const editable = motorPresupuesto();
  const fila = (l, mostrarTipos) => {
    const tipos = mostrarTipos ? (l.conceptos || []) : [];
    return h('button', { type: 'button', class: 'pa-fila' + (l.sugerido ? ' sugerido' : ''), disabled: !editable, onclick: () => dialogoLineaEdit(l, mes, recargar),
      title: mostrarTipos ? (tipos.length ? `Cuentan aquí: ${tipos.join(', ')}${l.sugerido ? ' (sugerido; tócalo para confirmarlo)' : ''}` : 'Pago fijo: aquí no se anotan gastos, se marca pagado a fin de mes. Tócalo si quieres que algún tipo de gasto cuente aquí.') : 'Cambiar monto o nombre' },
      h('span', { class: 'pa-nombre' }, h('strong', {}, nombreLinea(l.concepto)),
        mostrarTipos ? h('small', { class: tipos.length ? '' : 'fijo-pago' }, tipos.length ? tipos.join(' · ') : 'Pago fijo · se marca pagado') : null),
      h('b', { class: 'pa-monto' }, soles(l.monto || 0)),
      editable ? h('span', { class: 'pa-lapiz', 'aria-hidden': 'true' }, icono('lapiz')) : null);
  };
  const grupo = (seccion, titulo, ico, contenido, total) => h('section', { class: `pa-grupo pa-${seccion}` },
    h('div', { class: 'pa-cab' }, h('span', { class: 'pa-ico' }, icono(ico)), h('strong', {}, titulo), h('span', { class: 'pa-total' }, soles(total)),
      editable ? h('button', { type: 'button', class: 'boton chico enlace pa-mas', title: `Agregar a ${titulo}`, 'aria-label': `Agregar a ${titulo}`, onclick: () => dialogoLinea(seccion, recargar) }, icono('mas')) : null),
    contenido);
  const pintar = () => {
    const de = (sec) => lineas.filter((l) => l.seccion === sec);
    const suma = (ls) => ls.reduce((t, l) => t + Math.max(0, Number(l.monto) || 0), 0);
    const ingresos = de('ingresos'), ahorros = de('ahorros'), gastos = de('gastos');
    const tcs = gastos.filter((l) => /^tc\s/i.test(l.concepto)), otros = gastos.filter((l) => !/^tc\s/i.test(l.concepto));
    const tIng = suma(ingresos), tTc = suma(tcs), tOtros = suma(otros), tAho = suma(ahorros);
    const libre = tIng - tTc - tOtros - tAho;
    const partes = [
      { etiqueta: 'Tarjetas', valor: tTc, clase: 'pf-tc' },
      { etiqueta: 'Gastos', valor: tOtros, clase: 'pf-gasto' },
      { etiqueta: 'Ahorros', valor: tAho, clase: 'pf-ahorro' },
      { etiqueta: libre >= 0 ? 'Libre' : 'Falta', valor: Math.abs(libre), clase: libre >= 0 ? 'pf-sobra' : 'pf-falta' },
    ];
    const resumen = h('div', { class: 'pa-resumen' },
      h('p', { class: 'pa-guia' }, h('strong', {}, `Cada mes entran ${soles(tIng)}`), ' y así los repartes. Toca una línea para cambiar su monto o qué gastos cuentan en ella.'),
      h('div', { class: 'pres-flujo' }, barraPartes(partes.filter((x) => x.clase !== 'pf-falta')),
        h('ul', { class: 'pf-leyenda' }, partes.filter((x) => x.valor > 0).map((x) => h('li', { class: x.clase === 'pf-falta' ? 'falta' : '' },
          h('i', { class: `pf-punto ${x.clase}`, 'aria-hidden': 'true' }), h('span', {}, x.etiqueta), h('strong', {}, soles(x.valor)))))));
    cuerpo.replaceChildren(resumen,
      h('div', { class: 'pa-izq' },
        grupo('ingresos', 'Lo que entra', 'sube', h('div', { class: 'pa-lista' }, ingresos.map((l) => fila(l, false))), tIng),
        grupo('ahorros', 'Ahorros', 'billetera', h('div', { class: 'pa-lista' }, ahorros.length ? ahorros.map((l) => fila(l, false)) : h('p', { class: 'suave' }, 'Sin ahorros.')), tAho)),
      grupo('gastos', 'Gastos', 'baja', h('div', { class: 'pa-cuerpo-gastos' },
        tcs.length ? h('div', { class: 'pa-tcs', title: 'Lo que se paga de cada tarjeta lo calcula la hoja con los consumos: no se cambia aquí.' },
          h('span', { class: 'pa-tcs-etq' }, icono('tarjetas'), 'Tarjetas · automático'),
          tcs.map((l) => h('span', { class: 'pa-tc' }, nombreLinea(l.concepto).replace(/^TC\s+/i, ''), h('b', {}, soles(l.monto || 0))))) : null,
        h('div', { class: 'pa-lista pa-lista-gastos' }, otros.map((l) => fila(l, true)))), tTc + tOtros));
    if (!editable) cuerpo.prepend(h('p', { class: 'suave' }, 'Para cambiar las líneas desde aquí hace falta el motor 1.5.'));
    animarVista(cuerpo);
  };
  // Lo último guardado en el equipo se pinta al instante; el Sheets (que puede tardar) lo actualiza después.
  const guardadas = motorPresupuesto() ? leerCache('lineas:' + mes)?.datos?.lineas : null;
  if (guardadas?.length) { lineas = guardadas; setTimeout(pintar, 0); }
  (motorPresupuesto()
    ? llamarApi('lineasPresupuesto', { mes }, { email: emailSesion() }).then((r) => { lineas = r?.lineas || []; guardarCache('lineas:' + mes, { lineas }); })
    : cargarRapido('presupuesto', { mes }, 'presupuesto:' + mes).then((r) => { lineas = (r?.datos?.filas || []).map((f) => ({ ...f, conceptos: f.conceptos || [] })); })
  ).then(pintar).catch(() => { cuerpo.replaceChildren(h('p', { class: 'suave' }, 'No se pudo leer el presupuesto. Intenta en un momento.')); });
  return caja;
}

// Ventanita de una línea del presupuesto: nombre, monto desde este mes, qué tipos de gasto cuentan, y quitar.
function dialogoLineaEdit(l, mes, alTerminar) {
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': 'Editar línea del presupuesto' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const inNombre = h('input', { id: 'le-nombre', type: 'text', maxlength: '40', value: l.concepto });
  const inMonto = h('input', { id: 'le-monto', type: 'text', inputmode: 'decimal', value: String(l.monto || 0) });
  const marcados = new Set(l.conceptos || []);
  const todos = leerCache('config')?.datos?.conceptos || [];
  const cajas = l.seccion === 'gastos' ? h('div', { class: 'elige-conceptos' }, todos.map((c) => h('label', { class: 'elige-concepto' },
    h('input', { type: 'checkbox', checked: marcados.has(c) || null, onchange: (ev) => { if (ev.target.checked) marcados.add(c); else marcados.delete(c); } }),
    catIco(c), h('span', {}, c)))) : null;
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const zona = h('div', { class: 'zona-confirmar' });
  const btn = h('button', { type: 'submit', class: 'boton primario' }, 'Guardar');
  const btnQuitar = h('button', { type: 'button', class: 'boton enlace peligro', onclick: () => {
    const intentar = async (forzar) => {
      try {
        const r = await llamarApi('quitarLinea', { fila: l.fila, nombre: l.concepto, forzar: !!forzar }, { email: emailSesion() });
        if (r && r.quitada === false) {
          zona.replaceChildren();
          confirmarEnLinea(zona, `Tiene montos en ${r.mesesConMonto} mes${r.mesesConMonto === 1 ? '' : 'es'}; se borra la fila completa de la hoja. ¿Quitarla igual?`, 'Quitar igual', () => intentar(true));
          return;
        }
        avisar('Línea quitada', 'ok'); cerrar(); await alTerminar();
      } catch (e) { msg.textContent = mensajeError(e, 'No se pudo quitar.'); msg.hidden = false; zona.replaceChildren(); }
    };
    confirmarEnLinea(zona, `¿Quitar "${nombreLinea(l.concepto)}" del presupuesto?`, 'Quitar', () => intentar(false));
  } }, 'Quitar esta línea');
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    const nombre = inNombre.value.trim();
    const monto = leerMonto(inMonto.value);
    if (nombre.length < 2) { msg.textContent = 'Escribe el nombre.'; msg.hidden = false; inNombre.focus(); return; }
    if (monto === null || monto === undefined || monto < 0) { msg.textContent = 'Escribe un monto válido.'; msg.hidden = false; inMonto.focus(); return; }
    ocuparBoton(btn, 'Guardando…');
    try {
      const correo = emailSesion();
      if (nombre !== l.concepto) await llamarApi('renombrarLinea', { fila: l.fila, nombre }, { email: correo });
      if (monto !== (l.monto || 0)) await llamarApi('editarLineaMeses', { fila: l.fila, monto, desdeMes: mes }, { email: correo });
      const antes = JSON.stringify((l.sugerido ? [] : (l.conceptos || [])).slice().sort());
      if (l.seccion === 'gastos' && JSON.stringify([...marcados].sort()) !== antes) await llamarApi('asignarConceptos', { linea: nombre, conceptos: [...marcados] }, { email: correo });
      cerrar(); avisar('Guardado', 'ok'); await alTerminar();
    } catch (e) { liberarBoton(btn, 'Guardar'); msg.textContent = mensajeError(e, 'No se pudo guardar.'); msg.hidden = false; }
  } },
    h('p', { class: 'cierre-etq' }, nombreLinea(l.concepto)),
    h('div', { class: 'modal-cuerpo' },
      h('div', { class: 'campo' }, h('label', { for: 'le-nombre' }, 'Nombre'), inNombre),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'le-monto' }, `Monto mensual desde ${nombreMesClave(mes) || 'este mes'} (S/)`), inMonto)),
    cajas ? h('p', { class: 'etq' }, 'Qué tipos de gasto cuentan aquí') : null,
    cajas,
    msg, zona,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar'), btnQuitar));
  dlg.append(form); document.body.append(dlg); dlg.showModal();
}

function dialogoLinea(seccion, alGuardar) {
  const mes = mesActual();
  const meses = leerCache('presupuesto:' + mes)?.datos?.meses || [];
  const dlg = h('dialog', { class: 'hoja-modal', 'aria-label': 'Nueva línea del presupuesto' });
  const cerrar = () => { if (dlg.classList.contains('cerrando')) return; dlg.classList.add('cerrando'); setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190); };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const titulos = { ingresos: 'Nuevo ingreso', gastos: 'Nueva línea de gasto', ahorros: 'Nuevo ahorro' };
  const inNombre = h('input', { id: 'ln-nombre', type: 'text', maxlength: '40', placeholder: seccion === 'ingresos' ? 'Ej. Ingresos - Bono' : seccion === 'ahorros' ? 'Ej. Ahorro Auto' : 'Ej. Gimnasio' });
  const inMonto = h('input', { id: 'ln-monto', type: 'text', inputmode: 'decimal', placeholder: '0.00' });
  const selMes = h('select', { id: 'ln-mes' }, (meses.length ? meses : [{ clave: mes, etiqueta: nombreMesClave(mes) || mes }]).filter((m) => m.clave >= mes).map((m) => h('option', { value: m.clave }, nombreMesClave(m.clave) || m.etiqueta)));
  const msg = h('p', { class: 'mensaje error', hidden: true });
  const btn = h('button', { type: 'submit', class: 'boton primario' }, 'Agregar');
  const form = h('form', { class: 'cierre-caja', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    const nombre = inNombre.value.trim();
    const monto = inMonto.value.trim() === '' ? 0 : leerMonto(inMonto.value);
    if (nombre.length < 2) { msg.textContent = 'Escribe el nombre de la línea.'; msg.hidden = false; inNombre.focus(); return; }
    if (monto === null || monto === undefined || monto < 0) { msg.textContent = 'Escribe un monto válido.'; msg.hidden = false; inMonto.focus(); return; }
    ocuparBoton(btn, 'Agregando…');
    try {
      await llamarApi('agregarLinea', { idCliente: uuid(), nombre, seccion, monto, desdeMes: selMes.value }, { email: emailSesion() });
      estado.cambioDesde = Date.now();
      cerrar(); avisar(`Agregado: ${nombre}`, 'ok');
      await alGuardar();
    } catch (e) { liberarBoton(btn, 'Agregar'); msg.textContent = mensajeError(e, 'No se pudo agregar.'); msg.hidden = false; }
  } },
    h('p', { class: 'cierre-etq' }, titulos[seccion] || 'Nueva línea'),
    h('p', { class: 'suave' }, 'Se agrega una fila en tu hoja de presupuesto, dentro de su bloque, y el monto se repite en los meses siguientes.'),
    h('div', { class: 'modal-cuerpo' },
      h('div', { class: 'campo' }, h('label', { for: 'ln-nombre' }, 'Nombre'), inNombre),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'ln-monto' }, 'Monto mensual (S/)'), inMonto),
      h('div', { class: 'campo campo-chico' }, h('label', { for: 'ln-mes' }, 'Desde'), selMes)),
    msg,
    h('div', { class: 'acciones modal-acciones' }, btn, h('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cancelar')));
  dlg.append(form); document.body.append(dlg); dlg.showModal(); inNombre.focus();
}

// Configuración como los ajustes del celular: una lista corta y, al tocar, una pantalla con solo eso.
const MENU_CONFIG = [
  ['cuenta', 'Tu cuenta', 'personas', ['Tu cuenta']],
  ['apariencia', 'Apariencia', 'sol', ['Apariencia']],
  ['tarjetas', 'Tarjetas', 'tarjetas', ['Tus tarjetas', 'Tarjetas de débito']],
  ['gastos', 'Tipos de gasto', 'lista', ['Tipos de gasto']],
  ['presupuesto', 'Presupuesto', 'presupuesto', ['Presupuesto']],
  ['personas', 'Personas', 'personas', ['Personas']],
  ['avisos', 'Avisos', 'alerta', ['Avisos']],
  ['datos', 'Privacidad, datos y app', 'ajustes', ['Privacidad', 'Registro de gastos', 'Datos y conexión', 'La app']],
];
function resumenMenuConfig(id) {
  const cfg = leerCache('config')?.datos || {};
  switch (id) {
    case 'cuenta': return api.emailGuardado() || '';
    case 'apariencia': { const m = modoElegido(); return `${m === 'auto' ? 'Como el sistema' : m === 'oscuro' ? 'Oscuro' : 'Claro'} · ${(COLORES.find(([k]) => k === document.documentElement.dataset.color) || [])[1] || ''}`; }
    case 'tarjetas': { const n = catalogoTC().length; return `${n} tarjeta${n === 1 ? '' : 's'}`; }
    case 'gastos': { const n = (cfg.conceptos || []).length; return n ? `${n} tipos · toca para cambiar nombre o ícono` : 'Lo que eliges al registrar'; }
    case 'presupuesto': return 'Líneas de tu hoja: montos y qué cuenta en cada una';
    case 'personas': return (cfg.responsables || []).map(nombreCorto).join(' y ') || 'Quiénes entran a la app';
    case 'avisos': return 'Correos, calendario y gasto grande';
    case 'datos': return 'Ocultar montos, actualizar datos, instalar la app';
    default: return '';
  }
}
function armarMenuConfig(raiz, rejilla, seccion) {
  const paneles = [...rejilla.children];
  const deSeccion = (p) => {
    const t = p.querySelector('.panel-cab h2')?.textContent.trim() || '';
    return (MENU_CONFIG.find(([, , , titulos]) => titulos.some((x) => t.startsWith(x))) || MENU_CONFIG[MENU_CONFIG.length - 1])[0];
  };
  paneles.forEach((p) => { p.dataset.seccion = deSeccion(p); });
  const cab = raiz.querySelector('.config-cab');
  if (!seccion || !MENU_CONFIG.some(([id]) => id === seccion)) {
    // Menú
    rejilla.hidden = true;
    const lista = h('nav', { class: 'config-menu', 'aria-label': 'Secciones de configuración' },
      MENU_CONFIG.filter(([id]) => paneles.some((p) => p.dataset.seccion === id)).map(([id, titulo, ico], i) =>
        h('a', { class: 'config-item revelar', href: `#configuracion-${id}`, style: `--i:${i}` },
          h('span', { class: 'config-item-ico' }, icono(ico)),
          h('span', { class: 'config-item-texto' }, h('strong', {}, titulo), h('span', { class: 'suave' }, resumenMenuConfig(id))),
          icono('adelante'))));
    cab.after(lista);
    return;
  }
  // Una sola sección
  const [, titulo] = MENU_CONFIG.find(([id]) => id === seccion);
  cab.replaceChildren(h('a', { class: 'volver', href: '#configuracion' }, icono('atras'), 'Configuración'), h('h1', {}, titulo));
  rejilla.classList.add('una');
  rejilla.dataset.seccion = seccion;
  paneles.forEach((p, i) => {
    const ver = p.dataset.seccion === seccion;
    p.hidden = !ver;
    if (ver) { p.classList.add('visible'); p.style.setProperty('--i', String(i % 4)); if (paneles.filter((x) => x.dataset.seccion === seccion).length === 1) p.querySelector('.panel-cab h2')?.classList.add('solo-lector'); }
  });
}

// ---------- Pantalla: Configuración ----------
// Todo lo que se ajusta de la app, en un solo lugar: cuenta, apariencia, privacidad, tarjetas, registro, avisos y datos.

function modoElegido() {
  try { return localStorage.getItem('ff:modo') || 'auto'; } catch { return 'auto'; }
}
function elegirModo(id) {
  if (id === 'auto') {
    try { localStorage.removeItem('ff:modo'); } catch { /* nada */ }
    document.documentElement.classList.add('cambiando');
    setTimeout(() => document.documentElement.classList.remove('cambiando'), 520);
    aplicarApariencia();
  } else {
    elegirApariencia('ff:modo', id);
  }
  document.querySelectorAll('[data-modo-cfg]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modoCfg === id)));
}

// v169: listas desplegables con el diseño de la app (nunca la lista del navegador). Cada <select> queda escondido
// (sigue guardando el valor y avisando con 'change') y en su lugar va un botón que abre un menú propio.
const SEL_VALOR = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const SEL_INDICE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
const conPopover = typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
let selAbierto = null;
function selectPropio(sel) {
  if (!sel || sel.dataset.propio || sel.multiple || sel.size > 1) return;
  sel.dataset.propio = '1';
  const texto = h('span', { class: 'sel-texto' });
  const boton = h('button', { type: 'button', class: 'sel-boton', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, texto, h('span', { class: 'sel-flecha', 'aria-hidden': 'true' }, icono('abajo')));
  const lista = h('div', { class: 'sel-lista', role: 'listbox', tabindex: '-1' });
  if (conPopover) lista.setAttribute('popover', 'manual');
  const caja = h('span', { class: 'sel-propio' });
  sel.replaceWith(caja);
  caja.append(sel, boton);
  sel.classList.add('sel-nativo');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  const etiqueta = sel.getAttribute('aria-label') || (sel.id && document.querySelector(`label[for="${sel.id}"]`)?.textContent) || '';
  if (etiqueta) boton.setAttribute('aria-label', etiqueta);
  const sincronizar = () => {
    const o = sel.options[SEL_INDICE.get.call(sel)];
    texto.textContent = o ? o.textContent : '';
    boton.disabled = sel.disabled;
    if (sel.getAttribute('aria-invalid') === 'true') boton.setAttribute('aria-invalid', 'true'); else boton.removeAttribute('aria-invalid');
    if (o && sel.getAttribute('aria-label')) boton.setAttribute('aria-label', `${sel.getAttribute('aria-label')}: ${o.textContent}`);
  };
  Object.defineProperty(sel, 'value', { configurable: true, get() { return SEL_VALOR.get.call(sel); }, set(v) { SEL_VALOR.set.call(sel, v); sincronizar(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return SEL_INDICE.get.call(sel); }, set(v) { SEL_INDICE.set.call(sel, v); sincronizar(); } });
  new MutationObserver(sincronizar).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'aria-invalid', 'label'] });
  sel.addEventListener('change', sincronizar);
  sel.addEventListener('focus', () => boton.focus());
  let filas = [];
  let activo = -1;
  const marcar = (i) => {
    activo = i;
    filas.forEach((f, k) => f.classList.toggle('activo', k === i));
    filas[i]?.scrollIntoView({ block: 'nearest' });
  };
  const elegir = (i) => {
    const antes = SEL_INDICE.get.call(sel);
    cerrar();
    boton.focus();
    if (i < 0 || i === antes || sel.options[i]?.disabled) return;
    SEL_INDICE.set.call(sel, i);
    sincronizar();
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const colocar = () => {
    const r = boton.getBoundingClientRect();
    const abajo = innerHeight - r.bottom - 12, arriba = r.top - 12;
    const alto = Math.min(320, Math.max(abajo, arriba));
    lista.style.minWidth = `${Math.round(r.width)}px`;
    lista.style.maxHeight = `${Math.round(alto)}px`;
    lista.style.left = `${Math.round(Math.min(r.left, innerWidth - Math.max(r.width, lista.offsetWidth) - 8))}px`;
    const h2 = Math.min(lista.scrollHeight, alto);
    lista.style.top = `${Math.round(abajo >= h2 || abajo >= arriba ? r.bottom + 6 : r.top - h2 - 6)}px`;
  };
  const fuera = (ev) => { if (!lista.contains(ev.target) && !boton.contains(ev.target)) cerrar(); };
  const alMover = (ev) => { if (!lista.contains(ev.target)) cerrar(); };
  function cerrar() {
    if (selAbierto !== cerrar) return;
    selAbierto = null;
    boton.setAttribute('aria-expanded', 'false');
    caja.classList.remove('abierto');
    document.removeEventListener('pointerdown', fuera, true);
    removeEventListener('scroll', alMover, true);
    removeEventListener('resize', cerrar);
    try { if (conPopover) lista.hidePopover(); } catch { /* ya cerrado */ }
    lista.remove();
  }
  const abrir = () => {
    if (boton.disabled) return;
    if (selAbierto) selAbierto();
    filas = [];
    const nodos = [];
    const fila = (o) => {
      const i = filas.length;
      const f = h('div', { class: 'sel-op' + (o.selected ? ' elegido' : ''), role: 'option', 'aria-selected': String(o.selected), 'aria-disabled': o.disabled ? 'true' : null },
        h('span', {}, o.textContent), o.selected ? h('span', { class: 'sel-check', 'aria-hidden': 'true' }, icono('check')) : null);
      f.addEventListener('pointerdown', (ev) => ev.preventDefault());
      f.addEventListener('click', () => elegir([...sel.options].indexOf(o)));
      f.addEventListener('pointermove', () => { if (activo !== i) marcar(i); });
      filas.push(f);
      return f;
    };
    for (const n of sel.children) {
      if (n.tagName === 'OPTGROUP') { nodos.push(h('div', { class: 'sel-grupo', role: 'presentation' }, n.label)); [...n.children].forEach((o) => nodos.push(fila(o))); }
      else if (n.tagName === 'OPTION' && !n.hidden) nodos.push(fila(n));
    }
    lista.replaceChildren(...nodos);
    (boton.closest('dialog[open]') || document.body).append(lista);
    if (conPopover) { try { lista.showPopover(); } catch { /* sin popover */ } }
    colocar();
    selAbierto = cerrar;
    boton.setAttribute('aria-expanded', 'true');
    caja.classList.add('abierto');
    const i = filas.findIndex((f) => f.classList.contains('elegido'));
    marcar(i >= 0 ? i : 0);
    document.addEventListener('pointerdown', fuera, true);
    addEventListener('scroll', alMover, true);
    addEventListener('resize', cerrar);
  };
  boton.addEventListener('click', () => (selAbierto === cerrar ? cerrar() : abrir()));
  let buscado = '', reloj = 0;
  boton.addEventListener('keydown', (ev) => {
    const abierto = selAbierto === cerrar;
    if (!abierto && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(ev.key)) { ev.preventDefault(); abrir(); return; }
    if (!abierto) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(); }
    else if (ev.key === 'Tab') cerrar();
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); marcar(Math.min(filas.length - 1, activo + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); marcar(Math.max(0, activo - 1)); }
    else if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); marcar(ev.key === 'Home' ? 0 : filas.length - 1); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); filas[activo]?.click(); }
    else if (ev.key.length === 1) {
      clearTimeout(reloj); buscado += normalizar(ev.key); reloj = setTimeout(() => { buscado = ''; }, 700);
      const k = filas.findIndex((f) => normalizar(f.textContent).startsWith(buscado));
      if (k >= 0) marcar(k);
    }
  });
  sincronizar();
}
function selectsPropios(raiz) {
  if (!raiz || raiz.nodeType !== 1) return;
  if (raiz.tagName === 'SELECT') selectPropio(raiz);
  else raiz.querySelectorAll?.('select:not([data-propio])').forEach(selectPropio);
}
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver((cambios) => { for (const m of cambios) m.addedNodes.forEach(selectsPropios); })
    .observe(document.documentElement, { childList: true, subtree: true });
}

function interruptor(activo, etiqueta, alCambiar) {
  const b = h('button', { type: 'button', class: 'interruptor', role: 'switch', 'aria-checked': String(!!activo), 'aria-label': etiqueta }, h('i'));
  b.addEventListener('click', () => {
    const nuevo = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(nuevo));
    alCambiar(nuevo);
  });
  return b;
}

// ---------------------------------------------------------------------------
// Conectar los avisos del banco (v122, motor 1.10): quien no es dueño del Gmail del lector hace que SU Gmail
// reenvíe solo los avisos de consumo. Tres pasos: agregar el correo, pegar el código (aparece solo) y
// cargar un filtro ya armado. Nunca se reenvían correos con códigos o claves.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Compras en cuotas (v123, motor 1.11): una compra con tarjeta se reparte en N cuotas, cada una en su mes.
// ---------------------------------------------------------------------------
// Motor 1.12: pasar a cuotas un gasto ya anotado entero.
function motorPasarCuotas() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 12); }
const esCuota = (descripcion) => /·\s*cuota\s+\d{1,2}\/\d{1,2}\s*$/i.test(String(descripcion || ''));
function motorCuotas() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 11); }
const OPCIONES_CUOTAS = [1, 2, 3, 4, 6, 10, 12, 18, 24, 36];
// Igual que el motor: partes iguales (los centavos que sobran van en la primera) o todas de la cuota fija.
function montosDeCuotas(total, n, fija) {
  const cent = Math.round(Number(total) * 100);
  if (!(cent > 0) || !(n >= 1)) return [];
  if (n === 1) return [cent / 100];
  if (fija > 0) {
    const cf = Math.round(fija * 100);
    if (cf * n < cent - n || cf * n > cent * 2) return [];
    return Array(n).fill(cf / 100);
  }
  const parte = Math.floor(cent / n);
  return Array.from({ length: n }, (_, i) => (parte + (i === 0 ? cent - parte * n : 0)) / 100);
}
const mesCorto = (clave) => { const m = /^(\d{4})-(\d{2})$/.exec(clave || ''); return m ? `${ABREV[+m[2] - 1]} ${m[1].slice(2)}` : ''; };
// Ventanita "¿En cuántas cuotas?". Resuelve {cuotas, montoCuota} o null si se cierra sin cambiar.
function elegirCuotas({ total, cuotas = 1, montoCuota = 0, mesInicio = '' }) {
  return new Promise((resolver) => {
    let n = cuotas > 1 ? cuotas : 1;
    let terminado = false;
    const dlg = h('dialog', { class: 'hoja-modal cuotas-dlg', 'aria-label': 'Compra en cuotas' });
    const salir = (valor) => {
      if (terminado) return; terminado = true;
      dlg.classList.add('cerrando');
      setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190);
      resolver(valor);
    };
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); salir(null); });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) salir(null); });
    const inFija = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Cuota al mes' });
    if (montoCuota > 0) inFija.value = String(montoCuota);
    const resumen = h('div', { class: 'cuotas-resumen', 'aria-live': 'polite' });
    const btnListo = h('button', { type: 'button', class: 'boton primario' }, 'Listo');
    const botones = OPCIONES_CUOTAS.map((x) => h('button', { type: 'button', class: 'opcion chica cuotas-op', 'data-n': String(x), onclick: () => { n = x; pintar(); if (x === 1) salir({ cuotas: 1, montoCuota: 0 }); } },
      x === 1 ? 'Sin cuotas' : String(x)));
    const fija = () => leerMonto(inFija.value) || 0;
    const pintar = () => {
      botones.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)));
      inFija.placeholder = n > 1 ? String(montosDeCuotas(total, n, 0)[n - 1] || '') : '';
      cajaFija.hidden = n <= 1;
      const lista = n > 1 ? montosDeCuotas(total, n, fija()) : [];
      const mal = n > 1 && !lista.length;
      btnListo.disabled = mal;
      if (n <= 1) { resumen.replaceChildren(h('strong', {}, soles(total)), h('small', { class: 'suave' }, 'Se paga entero en un solo mes.')); return; }
      if (mal) { resumen.replaceChildren(h('strong', { class: 'mal' }, 'Esa cuota no cuadra'), h('small', { class: 'suave' }, `${n} × ${soles(fija())} no cubre ${soles(total)}.`)); return; }
      const totalCuotas = lista.reduce((x, y) => x + y, 0);
      const desde = mesInicio ? mesCorto(mesInicio) : '';
      const hasta = mesInicio ? mesCorto(sumarMes(mesInicio, n - 1)) : '';
      resumen.replaceChildren(
        h('strong', {}, `${n} × ${soles(lista[n - 1])}`),
        h('small', { class: 'suave' }, [desde ? `De ${desde} a ${hasta}` : '', Math.abs(totalCuotas - total) >= 0.01 ? `total ${soles(totalCuotas)}` : ''].filter(Boolean).join(' · ') || 'Una cuota por mes'));
    };
    inFija.addEventListener('input', pintar);
    inFija.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); btnListo.click(); } });
    btnListo.onclick = () => { if (!btnListo.disabled) salir({ cuotas: n, montoCuota: n > 1 ? fija() : 0 }); };
    const cajaFija = h('label', { class: 'cuotas-fija' }, h('span', {}, 'Cuota al mes'),
      h('span', { class: 'campo-soles' }, h('span', {}, 'S/'), inFija),
      h('small', { class: 'suave' }, 'Cámbiala solo si tu banco cobra intereses.'));
    dlg.append(h('div', { class: 'cierre-caja cuotas-caja' },
      h('p', { class: 'cierre-etq' }, '¿En cuántas cuotas?'),
      h('p', { class: 'suave' }, `Compra de ${soles(total)}`),
      h('div', { class: 'cuotas-opciones' }, botones),
      resumen, cajaFija,
      h('div', { class: 'acciones modal-acciones' }, btnListo)));
    pintar();
    document.body.append(dlg);
    dlg.showModal();
    animarVista(dlg);
    (botones.find((b) => Number(b.dataset.n) === n) || botones[0]).focus({ preventScroll: true });
  });
}

function motorReenvio() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 10); }
const CLAVE_REENVIO = 'ff:reenvio';
const GMAIL_REENVIO = 'https://mail.google.com/mail/u/0/#settings/fwdandpop';
const GMAIL_FILTROS = 'https://mail.google.com/mail/u/0/#settings/filters';
function reenvioGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_REENVIO) || 'null');
    return g && g.email === emailSesion() ? g : null;
  } catch { return null; }
}
async function consultarReenvio() {
  const d = await api.llamar('reenvio', {});
  if (!d || typeof d !== 'object' || !d.destino) return null;
  try { localStorage.setItem(CLAVE_REENVIO, JSON.stringify({ t: Date.now(), email: emailSesion(), d })); } catch { /* nada */ }
  return d;
}
const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Filtro de Gmail listo para importar: de los bancos, con palabras de consumo en el asunto y nunca códigos ni claves.
function filtroGmail(d) {
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const palabras = [...new Set((d.palabras || []).flatMap((p) => [p, sinTildes(p)]))];
  const nunca = ['código', 'codigo', 'clave', 'token', 'contraseña', 'contrasena', 'verificación', 'verificacion'];
  const consulta = `subject:{${palabras.join(' ')}} ${nunca.map((x) => '-subject:' + x).join(' ')}`;
  return "<?xml version='1.0' encoding='UTF-8'?>\n"
    + "<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>\n"
    + '<title>Mail Filters</title>\n<entry>\n'
    + "<category term='filter'></category>\n<title>Mail Filter</title>\n<content></content>\n"
    + `<apps:property name='from' value='${xml('{' + (d.dominios || []).join(' ') + '}')}'/>\n`
    + `<apps:property name='hasTheWord' value='${xml(consulta)}'/>\n`
    + `<apps:property name='forwardTo' value='${xml(d.destino)}'/>\n`
    + "<apps:property name='sizeOperator' value='s_sl'/>\n<apps:property name='sizeUnit' value='s_smb'/>\n"
    + '</entry>\n</feed>\n';
}
function descargarTexto(nombre, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
async function copiarTexto(texto, boton) {
  try { await navigator.clipboard.writeText(texto); } catch {
    const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = texto; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { /* nada */ } t.remove();
  }
  if (boton) { boton.classList.add('copiado'); setTimeout(() => boton.classList.remove('copiado'), 1400); }
  avisar('Copiado', 'ok');
}
function chipCopiar(texto, etiqueta) {
  const b = h('button', { type: 'button', class: 'conectar-chip', title: 'Copiar', onclick: () => copiarTexto(texto, b) },
    h('code', {}, texto), h('span', { class: 'conectar-chip-acc' }, etiqueta || 'Copiar'));
  return b;
}

function abrirConectarAvisos(inicial) {
  let d = inicial || reenvioGuardado()?.d || null;
  let vivo = true;
  let reloj = null;
  let vueltas = 0;
  let bajado = false;
  const dlg = h('dialog', { class: 'hoja-modal conectar-avisos', 'aria-label': 'Conecta los avisos de tu banco' });
  const cerrar = () => {
    vivo = false; clearTimeout(reloj);
    if (dlg.classList.contains('cerrando')) return;
    dlg.classList.add('cerrando');
    setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, sinMovimiento() ? 0 : 190);
  };
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) cerrar(); });
  const caja = h('div', { class: 'cierre-caja conectar-caja entra' });
  setTimeout(() => caja.classList.remove('entra'), 900);
  dlg.append(caja);
  const enlace = (texto, url) => h('a', { class: 'boton chico', href: url, target: '_blank', rel: 'noopener' }, texto, icono('adelante'));
  const paso = (n, hecho, activo, titulo, ayuda, ...controles) => h('li', { class: 'conectar-paso' + (hecho ? ' hecho' : '') + (activo ? ' activo' : ''), style: `--i: ${n}` },
    h('span', { class: 'conectar-num' }, hecho ? icono('check') : String(n)),
    h('div', { class: 'conectar-txt' }, h('strong', {}, titulo), h('small', { class: 'suave' }, ayuda),
      controles.filter(Boolean).length ? h('div', { class: 'conectar-ctrl' }, controles) : null));
  const pintar = () => {
    const listo = !!d?.ultimoAviso;
    const conCodigo = !!d?.codigo;
    caja.replaceChildren(...[
      h('span', { class: 'conectar-ico' + (listo ? ' ok' : '') }, icono(listo ? 'check' : 'tarjetas')),
      h('p', { class: 'cierre-etq' }, listo ? '¡Avisos conectados!' : 'Conecta los avisos de tu banco'),
      h('p', { class: 'suave' }, listo
        ? `El último llegó el ${fechaCorta(String(d.ultimoAviso).slice(0, 10))}. Tus consumos aparecen solos en «Por confirmar».`
        : 'Una sola vez y desde una computadora. Luego tus consumos llegan solos.'),
      !d ? h('p', { class: 'suave' }, 'Cargando…')
        : d.propio ? h('p', {}, 'Este es el Gmail que lee los avisos: no hay nada que conectar.')
        : listo ? null
        : h('ol', { class: 'conectar-pasos' },
          paso(1, conCodigo, !conCodigo, 'Agrega este correo', 'En Gmail: «Añadir una dirección de reenvío», pégalo y acepta.',
            chipCopiar(d.destino), enlace('Abrir Gmail', GMAIL_REENVIO)),
          paso(2, conCodigo && bajado, conCodigo && !bajado, 'Pega este código y verifica', conCodigo
            ? 'Deja marcado «Inhabilitar reenvío»: solo pasan los avisos del banco.'
            : 'Llega en unos segundos y aparece aquí solo.',
          conCodigo ? chipCopiar(d.codigo) : h('span', { class: 'conectar-espera' }, h('i', {}), 'Esperando el código…')),
          paso(3, false, conCodigo && bajado, 'Carga el filtro', 'En «Filtros»: «Importar filtros», elige el archivo y «Crear filtros».',
            h('button', { type: 'button', class: 'boton chico' + (conCodigo && !bajado ? ' primario' : ''), onclick: () => {
              descargarTexto('filtro-finfamily.xml', filtroGmail(d), 'application/xml'); bajado = true; pintar();
            } }, icono('descargar'), 'Descargar filtro'),
            enlace('Abrir filtros', GMAIL_FILTROS))),
      !listo && d && !d.propio && bajado ? h('p', { class: 'suave conectar-pie' }, 'Listo. Con tu próximo consumo esta ventana se pone en verde.') : null,
      h('div', { class: 'acciones modal-acciones' }, h('button', { type: 'button', class: 'boton primario', onclick: cerrar }, listo ? 'Listo' : 'Cerrar'))].filter(Boolean));
  };
  // Mientras la ventana está abierta se pregunta cada 8 s (el código y el primer aviso llegan solos).
  const refrescar = async () => {
    if (!vivo) return;
    try {
      const n = await consultarReenvio();
      if (n && vivo && JSON.stringify(n) !== JSON.stringify(d)) { d = n; pintar(); }
    } catch { /* sin conexión: se reintenta */ }
    if (vivo && !d?.propio && !d?.ultimoAviso && ++vueltas < 75) reloj = setTimeout(refrescar, 8000);
  };
  pintar();
  document.body.append(dlg);
  dlg.showModal();
  animarVista(dlg);
  refrescar();
}

// Aviso de Inicio para quien todavía no conecta sus avisos.
function avisoConectar() {
  const sitio = h('section', { class: 'avisos-inicio aviso-conectar' });
  const pintarCon = (d) => {
    if (!d || d.propio || d.ultimoAviso) { sitio.replaceChildren(); return; }
    sitio.replaceChildren(h('button', { type: 'button', class: 'aviso-fila', onclick: () => abrirConectarAvisos(d) },
      icono('tarjetas'),
      h('span', {}, h('strong', {}, 'Conecta los avisos de tu banco'), h('small', {}, 'Tus consumos llegarán solos · 2 minutos')),
      icono('adelante')));
  };
  const g = reenvioGuardado();
  pintarCon(g?.d);
  const espera = !g ? 0 : (g.d?.propio || g.d?.ultimoAviso) ? 7 * 86400000 : 30 * 60000;
  if (!g || Date.now() - g.t > espera) consultarReenvio().then(pintarCon).catch(() => { /* nada */ });
  return sitio;
}

// Fila de Ajustes › Avisos.
function filaReenvio() {
  const control = h('span', {});
  const fila = filaConfig('Avisos de tu banco', 'Tus consumos con tarjeta y Yape llegan solos a «Por confirmar».', control);
  const pintarCon = (d) => {
    if (!d) { fila.remove(); return; }
    if (d.propio) { control.replaceChildren(h('span', { class: 'pill ok' }, 'Este Gmail')); return; }
    control.replaceChildren(d.ultimoAviso
      ? h('button', { type: 'button', class: 'pill ok', onclick: () => abrirConectarAvisos(d) }, 'Conectado')
      : h('button', { type: 'button', class: 'boton chico primario', onclick: () => abrirConectarAvisos(d) }, 'Conectar'));
  };
  const g = reenvioGuardado();
  if (g) pintarCon(g.d); else control.append(h('span', { class: 'suave' }, '…'));
  consultarReenvio().then(pintarCon).catch(() => { if (!g) fila.remove(); });
  return fila;
}

function filaConfig(titulo, detalle, control) {
  return h('div', { class: 'config-fila' },
    h('div', { class: 'config-texto' }, h('strong', {}, titulo), detalle ? h('span', { class: 'suave' }, detalle) : null),
    control || null);
}

async function versionApp() {
  try {
    const claves = await caches.keys();
    const v = claves.map((k) => (k.match(/^finfamily-v(\d+)$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => b - a)[0];
    return v ? `v${v}` : '';
  } catch { return ''; }
}

async function vistaConfiguracion(seccion) {
  const nombre = (usuarioActual()?.nombre || '').split(' ')[0];
  const correo = api.emailGuardado() || '';
  const raiz = h('div', { class: 'pantalla configuracion' },
    h('header', { class: 'cabecera config-cab' }, h('h1', {}, 'Configuración')));
  const rejilla = h('div', { class: 'rejilla-config' });
  raiz.append(rejilla);

  // Cuenta
  rejilla.append(panel('revelar config-cuenta', 'Tu cuenta', null,
    h('div', { class: 'cuenta-quien' }, avatar(nombre || correo, 'grande'),
      h('div', {}, h('strong', {}, nombre || 'Tu cuenta'), h('span', { class: 'suave correo', title: correo }, correo))),
    zonaSesion()));

  // Apariencia
  const modo = modoElegido();
  const color = document.documentElement.dataset.color;
  rejilla.append(panel('revelar', 'Apariencia', null,
    h('p', { class: 'etq' }, 'Modo'),
    h('div', { class: 'opciones opciones-modo' },
      [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['auto', 'Como el sistema', 'ajustes']].map(([id, texto, ico]) =>
        h('button', { type: 'button', class: 'opcion', 'data-modo-cfg': id, 'aria-pressed': String(modo === id), onclick: () => elegirModo(id) }, icono(ico), h('span', { class: 'opcion-texto' }, texto)))),
    h('p', { class: 'etq' }, 'Color'),
    h('div', { class: 'muestras-color', role: 'group', 'aria-label': 'Color de la app' },
      COLORES.map(([id, nom]) => h('button', { type: 'button', class: `muestra op-${id}`, 'data-op-color': id, 'aria-pressed': String(color === id), onclick: () => elegirApariencia('ff:color', id) },
        h('i', { class: `color-op op-${id}`, 'aria-hidden': 'true' }), h('span', {}, nom))))));

  // Privacidad
  const oculto = document.body.classList.contains('montos-ocultos');
  rejilla.append(panel('revelar', 'Privacidad', null,
    filaConfig('Ocultar montos', 'Los montos se ven como S/ ••••, igual que el número de una tarjeta. Útil si alguien mira tu pantalla.',
      interruptor(oculto, 'Ocultar montos', (v) => {
        document.body.classList.toggle('montos-ocultos', v);
        try { localStorage.setItem('ff:ocultar', v ? '1' : ''); } catch { /* nada */ }
        alCambiarOcultos();
      })),
    ));

  // Tipos de gasto y personas (motor 1.4: se administran desde aquí)
  if (motorAdmin()) rejilla.append(panelConceptos());
  if (motorAdmin()) rejilla.append(panelPersonasAdmin());
  // Tarjetas
  const panelTC = motorAdmin()
    ? panel('revelar config-tarjetas', 'Tus tarjetas', h('button', { type: 'button', class: 'boton chico', onclick: () => dialogoTarjeta(null) }, '+ Agregar'), h('p', { class: 'suave' }, 'Cargando…'))
    : panel('revelar config-tarjetas', 'Tus tarjetas', null, h('p', { class: 'suave' }, 'Cargando…'));
  rejilla.append(panelTC);
  if (motorDebitos() && motorAdmin()) rejilla.append(panelDebitos());
  obtenerTarjetas().then((r) => {
    const lista = (r.datos.tarjetas || []).filter((t) => t.id !== 'HORMIGA');
    const cat = catalogoTC();
    const base = motorAdmin() ? cat.map((c) => lista.find((t) => t.id === c.id) || { id: c.id, nombre: c.nombre, titular: c.titular, pendiente: 0 }) : lista;
    const filas = base.map((t) => {
      const d = datosTC(t.id);
      const red = redTC(t);
      const c = cat.find((x) => x.id === t.id);
      const ciclo = c && c.cierre && c.vence ? `Cierra el ${c.cierre} · vence el ${c.vence}` : (c ? 'Sin fechas de pago' : '');
      const partes = [ciclo, d.digitos ? `•••• ${d.digitos}` : 'Sin número', red === 'visa' ? 'Visa' : red === 'mastercard' ? 'Mastercard' : 'Sin marca'].filter(Boolean);
      return h('div', { class: 'config-fila tc' },
        chipTC(t.id, 'mini'),
        h('div', { class: 'config-texto' }, h('strong', {}, nombreCortoTC(t)), h('span', { class: 'suave' }, partes.join(' · '))),
        h('button', { type: 'button', class: 'boton chico', onclick: () => (motorAdmin() && c ? dialogoTarjeta(c) : editarDatosTC(t)) }, 'Editar'));
    });
    panelTC.querySelector('.suave').replaceWith(filas.length ? h('div', { class: 'config-lista' }, filas) : h('p', { class: 'suave' }, 'No hay tarjetas.'));
  }).catch(() => {
    panelTC.querySelector('.suave').textContent = 'No se pudieron cargar las tarjetas. Intenta en un momento.';
  });

  // Registro de gastos
  const medios = leerCache('config')?.datos?.medios || MEDIOS_LOCAL;
  let medioPref = '';
  try { medioPref = localStorage.getItem('ff:medio') || ''; } catch { /* nada */ }
  const selMedio = h('select', { 'aria-label': 'Medio de pago que sale marcado' },
    h('option', { value: '' }, 'El último que usaste'),
    medios.map((m) => h('option', { value: m.id, selected: m.id === medioPref || null }, m.etiqueta)));
  selMedio.addEventListener('change', () => { try { if (selMedio.value) localStorage.setItem('ff:medio', selMedio.value); else localStorage.removeItem('ff:medio'); } catch { /* nada */ } avisar('Listo', 'ok'); });
  let hayBorrador = false;
  try { hayBorrador = !!localStorage.getItem('ff:borrador'); } catch { /* nada */ }
  rejilla.append(panel('revelar', 'Registro de gastos', null,
    h('div', { class: 'config-fila apilada' }, h('div', { class: 'config-texto' }, h('strong', {}, 'Medio de pago marcado'), h('span', { class: 'suave' }, 'Con cuál se abre "Nuevo gasto".')), h('div', { class: 'campo campo-select' }, selMedio)),
    hayBorrador ? filaConfig('Gasto a medio escribir', 'Hay un gasto empezado que se recupera al abrir "Nuevo gasto".',
      h('button', { type: 'button', class: 'boton chico', onclick: (ev) => { try { localStorage.removeItem('ff:borrador'); } catch { /* nada */ } ev.currentTarget.closest('.config-fila').remove(); avisar('Borrador descartado', 'ok'); } }, 'Descartar')) : null));

  // Avisos
  const mesPasado = mesCerrado();
  if (motorLector()) rejilla.append(panelAvisos(correo, mesPasado));
  else rejilla.append(panel('revelar', 'Avisos', null,
    filaConfig('Correo antes del vencimiento', motorNuevo()
      ? `Cuando a una tarjeta le faltan 3 días para vencer, llega un correo a ${correo || 'tu cuenta'}.`
      : 'Disponible cuando el motor de la hoja se actualice a la versión 1.2.', motorNuevo() ? h('span', { class: 'pill ok' }, 'Activo') : null),
    filaConfig('Cierre de mes', `Cómo terminó ${nombreMesClave(mesPasado) || 'el mes pasado'}. Se abre solo los primeros días de cada mes.`,
      h('button', { type: 'button', class: 'boton chico', onclick: () => abrirCierre(mesPasado) }, 'Ver'))));

  // Datos y conexión
  const enEspera = estado.cola.length;
  const vApp = h('span', { class: 'suave' }, '…');
  versionApp().then((v) => { vApp.textContent = v || 'sin datos'; });
  let vMotor = leerCache('inicio')?.datos?.version || leerCache('config')?.datos?.version || '';
  vMotor = versionMotor().texto || vMotor;
  const zonaBorrar = h('div', { class: 'config-fila' });
  zonaBorrar.append(
    h('div', { class: 'config-texto' }, h('strong', {}, 'Borrar lo guardado en este equipo'), h('span', { class: 'suave' }, 'Copias de la hoja, apariencia, borrador y datos de tarjetas. No cierra la sesión ni toca la hoja.')),
    h('button', { type: 'button', class: 'boton chico', onclick: () => confirmarEnLinea(zonaBorrar, '¿Borrar lo guardado en este equipo?', 'Borrar', () => {
      borrarCaches();
      try { for (const k of ['ff:modo', 'ff:color', 'ff:ocultar', 'ff:medio', 'ff:borrador', 'ff:tc-datos', 'ff:cierre', 'ff:pres-vista', 'ff:menu']) localStorage.removeItem(k); } catch { /* nada */ }
      document.body.classList.remove('montos-ocultos');
      aplicarApariencia();
      avisar('Listo, este equipo quedó limpio', 'ok');
      navegar();
    }) }, 'Borrar'));
  rejilla.append(panel('revelar', 'Datos y conexión', null,
    filaConfig('Gastos sin enviar', enEspera ? `${enEspera} ${enEspera === 1 ? 'gasto espera' : 'gastos esperan'} señal; se envían solos.` : 'Todo está en la hoja.', h('span', { class: `pill ${enEspera ? 'aviso' : 'ok'}` }, enEspera ? String(enEspera) : 'Al día')),
    filaConfig('Actualizar datos', 'Vuelve a leer la hoja ahora mismo.', h('button', { type: 'button', class: 'boton chico', onclick: () => { borrarCaches(); avisar('Leyendo la hoja…'); navegar(); } }, 'Actualizar')),
    filaConfig('Versiones', null, h('span', { class: 'suave versiones' }, 'App ', vApp, ' · Motor ', vMotor ? `v${vMotor}` : 'anterior a 1.2')),
    zonaBorrar));

  // La app
  const atajos = [['N', 'Nuevo gasto'], ['1', 'Inicio'], ['2', 'Tarjetas'], ['3', 'Presupuesto'], ['M', 'Movimientos'], ['/', 'Buscar']];
  rejilla.append(panel('revelar config-app', 'La app', null,
    document.body.classList.contains('instalable')
      ? filaConfig('Instalar en este equipo', 'Se abre como una app, con su ícono, sin barra del navegador.', h('button', { type: 'button', class: 'boton chico', onclick: instalarApp }, 'Instalar'))
      : filaConfig('Instalar en este equipo', matchMedia('(display-mode: standalone)').matches ? 'Ya está instalada: se abre como una app, con su ícono.'
        : esIphoneSinInstalar() ? 'En iPhone: toca Compartir y luego "Agregar a inicio". Se abre como una app, sin barra del navegador.'
        : 'Se abre como una app, con su ícono, sin barra del navegador. Está en el menú del navegador, en "Instalar" o "Agregar a la pantalla de inicio".', null),
    filaConfig('App solo para gastos', 'Una pantalla más chica, solo para anotar rápido.', h('a', { class: 'boton chico', href: 'gasto.html' }, 'Abrir')),
    matchMedia('(pointer: fine)').matches ? h('div', { class: 'config-atajos' }, h('p', { class: 'etq' }, 'Atajos de teclado'),
      h('ul', {}, atajos.map(([k, t]) => h('li', {}, h('kbd', {}, k), h('span', {}, t))))) : null,
     h('p', { class: 'suave config-pie' }, 'FinFamily · presupuesto de tu hogar.')));
  rejilla.append(panelPresupuestoAdmin());
  armarMenuConfig(raiz, rejilla, seccion || '');
  return raiz;
}

// ---------- Pantalla: Registrar ----------

function idCicloDeMedio(medio, usuario) {
  if (!medio || medio.tipo !== 'tarjeta') return null;
  const ts = catalogoTC().filter((t) => t.medio === medio.id);
  if (!ts.length) return null;
  if (ts.length === 1) return ts[0].id;
  // Varias tarjetas con el mismo medio (Interbank): la de quien gastó.
  const quien = nombreCorto(usuario?.nombre || '').toLowerCase();
  const mia = ts.find((t) => nombreTitular(t).toLowerCase() === quien);
  return (mia || ts[0]).id;
}
// Motor 1.6: se puede gastar con la tarjeta de otra persona (quién gastó y con qué tarjeta van por separado).
function motorPrestada() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 6); }
// Motor 1.7: cada gasto dice de dónde sale (fondo común, sobrante de una persona o un ahorro) y hay "bolsas".
function motorBolsas() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 7); }
// Motor 1.9: al editar se puede cambiar "Pagué con" (también de tarjeta a efectivo: el gasto cambia de hoja).
function motorPagadoCon() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 9); }

// Palabras de una fecha para el buscador: "sábado 7 de noviembre nov 07/11 7/11 07/11/2026 2026-11-07".
function palabrasFecha(f) {
  const d = f ? deISO(f) : null;
  if (!d || isNaN(d)) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  const dia = d.getDate(), mes = d.getMonth() + 1;
  return normalizar(`${d.toLocaleDateString('es-PE', { weekday: 'long' })} ${dia} de ${d.toLocaleDateString('es-PE', { month: 'long' })} `
    + `${d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '')} ${p2(dia)}/${p2(mes)} ${dia}/${mes} ${p2(dia)}/${p2(mes)}/${d.getFullYear()} ${f}`);
}
// ¿El texto de un gasto cumple la búsqueda? Cada palabra debe estar; los números van completos
// ("7" encuentra el día 7, no el 17 ni el 27).
function cumpleBusqueda(texto, q) {
  if (!q) return true;
  const fichas = texto.split(' ');
  return q.split(' ').filter(Boolean).every((w) => (/^\d+$/.test(w)
    ? fichas.some((x) => x === w || x.startsWith(w + '/'))
    : texto.includes(w)));
}
function bolsasGuardadas() { return leerCache('inicio')?.datos?.bolsas || leerCache('bolsas')?.datos || null; }
function textoOrigen(o) {
  const t = String(o || '');
  if (t.startsWith('P:')) return `Sobrante de ${nombreCorto(t.slice(2))}`;
  if (t.startsWith('A:')) return nombreLinea(t.slice(2));
  return '';
}
// Opciones de "De dónde sale" para un gasto de `quien` (nombre de la persona que gastó).
// El ingreso del mes se cobra a fin de mes: lo que se paga HOY en directo (Yape, Plin, efectivo) solo puede salir
// de lo que ya se tiene (sobrantes de meses cobrados o ahorros). La tarjeta sí va al fondo común: se paga al cobrar.
function enMano(b) { return (b?.personas || []).reduce((s, x) => s + (Number(x.disponible) || 0), 0); }
// La plata en mano por separado: la de quien usa la app ("mio") y la de los demás. Sumarlas confundía:
// cada uno compara con su propia cuenta.
function enManoPorPersona(b) {
  const yo = nombreCorto(usuarioActual()?.nombre || '');
  const personas = (b?.personas || []).map((x) => ({ nombre: nombreCorto(x.nombre), monto: Number(x.disponible) || 0 }));
  const mio = yo ? personas.find((x) => x.nombre === yo) || null : null;
  return { mio, otros: personas.filter((x) => x !== mio) };
}
// Billeteras donde se carga el presupuesto de una línea: lo que se paga con ellas sale de esa línea (fondo
// común), no del sobrante de nadie. Lemon guarda el presupuesto de Pasajes.
const BILLETERA_LINEA = { LEMON: 'Pasajes' };
function lineaDeBilletera(medioId) { return BILLETERA_LINEA[String(medioId || '').toUpperCase()] || null; }
// Lo que queda en la billetera en el ciclo de cobro de esa fecha: el plan de su línea menos lo pagado con ella.
function saldoBilletera(medioId, fecha) {
  const linea = lineaDeBilletera(medioId);
  if (!linea) return null;
  const mes = mesDelCiclo(fecha || hoyISO());
  const filas = leerCache('presupuesto:' + mes)?.datos?.filas;
  const tarjetas = leerCache('tarjetas-todo')?.datos?.tarjetas || leerCache('tarjetas')?.datos?.tarjetas;
  if (!filas || !tarjetas) return null;
  const k = normalizar(linea);
  const fila = filas.find((x) => x.seccion === 'gastos' && normalizar(nombreLinea(x.concepto)) === k);
  if (!fila) return null;
  const { desde, hasta } = cicloDelMes(mes);
  const usado = consumosDe(tarjetas, (t) => t.id === 'HORMIGA')
    .filter((c) => c.fecha >= desde && c.fecha <= hasta && normalizar(c.medio || '') === normalizar(medioId))
    .reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const plan = Math.abs(Number(fila.monto) || 0);
  return { linea: nombreLinea(fila.concepto), medio: String(medioId).toUpperCase(), plan, usado: Math.round(usado * 100) / 100, queda: Math.round((plan - usado) * 100) / 100, mes };
}
function nombreBilletera(medioId) { const m = String(medioId || '').toLowerCase(); return m.charAt(0).toUpperCase() + m.slice(1); }

// Cuánto tiene la persona para pagar con su sobrante: en directo, lo de hoy; con tarjeta, lo que le quedará
// del mes en que se paga (lo que llega ese cobro menos otras tarjetas suyas de ese mes). null = no se sabe.
function sobranteParaPagar(b, quien, mesPago) {
  const persona = (b?.personas || []).find((x) => nombreCorto(x.nombre) === nombreCorto(quien));
  if (!persona) return null;
  if (!mesPago || mesPago < (b.mes || '')) return { tiene: Number(persona.disponible) || 0, mes: null };
  const prox = (b.proximos || []).find((p) => p.mes === mesPago);
  const suyo = prox?.personas?.find((x) => nombreCorto(x.nombre) === nombreCorto(quien));
  return suyo ? { tiene: Number(suyo.queda) || 0, mes: mesPago } : null;
}
function opcionesOrigen(quien, soloEnMano = false, mesPago = '', billetera = null) {
  const b = bolsasGuardadas();
  const persona = (b?.personas || []).find((x) => nombreCorto(x.nombre) === nombreCorto(quien));
  const ops = billetera
    ? [{ valor: '', etiqueta: `${lineaDeBilletera(billetera)} (${nombreBilletera(billetera)})`, ico: 'billetera',
      disponible: saldoBilletera(billetera)?.queda ?? null, nota: 'presupuesto del mes' }]
    : soloEnMano ? [] : [{ valor: '', etiqueta: 'Fondo común', ico: 'inicio', disponible: null, nota: 'al cobrar' }];
  // Con tarjeta, el sobrante que se usa es el del mes en que se paga (aún no llega).
  const para = sobranteParaPagar(b, quien, soloEnMano ? '' : mesPago);
  if (quien) ops.push({ valor: `P:${persona?.nombre || quien}`, etiqueta: `Sobrante de ${nombreCorto(quien)}`, ico: 'personas',
    disponible: para ? para.tiene : null, deMes: para?.mes || null, nota: para ? undefined : (soloEnMano ? undefined : 'del mes que se paga') });
  for (const a of (b?.ahorros || []).filter((x) => x.disponible > 0)) ops.push({ valor: `A:${a.meta}`, etiqueta: nombreLinea(a.meta), ico: 'billetera', disponible: a.disponible });
  return ops;
}
function motorAdmin() { const v = versionMotor(); return v.a > 1 || (v.a === 1 && v.b >= 4); }

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
  const medioVisible = (id) => {
    const m = medios.find((x) => x.id === id);
    if (!m || MEDIOS_OCULTOS_REGISTRO.includes(id)) return null;
    const b = billeteraDeDebito(m);
    return b ? (medios.some((x) => x.id === b) ? b : null) : id;
  };
  const f = estado.form || (estado.form = {
    monto: '', medio: medioVisible(medioRecordado),
    descripcion: '', concepto: null, conceptoManual: false, nota: '', fecha: hoyISO(), fechaManual: false, responsable: null,
  });
  // Quién gastó: por defecto quien tiene la sesión; con el motor 1.3 se puede registrar a nombre de la otra persona.
  const personas = motorLector() ? responsables() : [];
  if (!f.responsable || !personas.some((p) => p === f.responsable)) f.responsable = usuario?.nombre || personas[0] || null;
  // La PWA puede quedar abierta de un día para otro: si el usuario no eligió la fecha, es la de hoy.
  if (!f.fechaManual) f.fecha = hoyISO();

  let manana = iso(new Date(Date.now() + 86400000));
  const msg = h('div', { class: 'mensaje', role: 'status', 'aria-live': 'polite' });
  const vistaPrevia = h('p', { class: 'vista-previa' });
  // Semáforo en vivo: mientras escribes el monto dice si te alcanza (verde), justo (ámbar) o no (rojo).
  const semaforo = h('div', { class: 'semaforo', role: 'status', 'aria-live': 'polite', hidden: true });
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
  // En computadora ancha (con mouse) el teclado de pantalla se oculta: el monto se escribe con el teclado físico.
  if (!document.body.classList.contains('solo-gasto') && matchMedia('(min-width: 1280px) and (pointer: fine)').matches) {
    setTimeout(() => { if (!document.querySelector('dialog[open]') && inMonto.isConnected) inMonto.focus({ preventScroll: true }); }, 350);
  }
  let cajaMonto = null;
  const plegar = () => cajaMonto?.classList.add('plegado');

  const quien = () => (f.responsable ? { nombre: f.responsable } : usuario);
  const colorMedio = (m) => (m.tipo === 'tarjeta' ? (idCicloDeMedio(m, quien()) || 'HORMIGA') : m.tipo === 'debito' ? claseDebito(m.banco) : CUENTA_DE_MEDIO[m.id] ? claseDebito(CUENTA_DE_MEDIO[m.id]) : m.id === 'LEMON' ? 'TD-lemon' : (COLOR_MEDIO[m.id] || 'HORMIGA'));
  // Tarjetas de débito (motor 1.21): se muestran las de quien gastó (y la que ya esté elegida).
  const debitoAjeno = (m) => m.tipo === 'debito' && !!m.titular && !mismoNombre(m.titular, quien().nombre || '') && f.medio !== m.id;
  const tarjetasDe = (m) => catalogoTC().filter((t) => t.medio === m.id);
  // Tarjeta con la que se paga: la elegida a mano o, si no, la de quien gastó.
  const tarjetaDe = (m) => (f.tarjeta && tarjetasDe(m).some((t) => t.id === f.tarjeta) ? f.tarjeta : idCicloDeMedio(m, quien()));
  const opcionesMedio = [];
  for (const m of medios) {
    if ((MEDIOS_OCULTOS_REGISTRO.includes(m.id) || billeteraDeDebito(m)) && f.medio !== m.id) continue;
    const ts = m.tipo === 'tarjeta' ? tarjetasDe(m) : [];
    if (motorPrestada() && ts.length > 1) ts.forEach((t) => opcionesMedio.push({ m, t }));
    else opcionesMedio.push({ m, t: null });
  }
  const elegida = (o) => f.medio === o.m.id && (!o.t || tarjetaDe(o.m) === o.t.id);
  const pintarMedios = () => botonesMedio.forEach((b, i) => { b.setAttribute('aria-pressed', String(elegida(opcionesMedio[i]))); b.hidden = debitoAjeno(opcionesMedio[i].m); });
  const botonesMedio = opcionesMedio.map((o) => {
    const m = o.m;
    const c = o.t ? o.t.id : colorMedio(m);
    return h('button', { type: 'button', class: `opcion medio tc-${c}`, 'data-id': m.id, 'data-tarjeta': o.t ? o.t.id : null,
      'aria-pressed': String(elegida(o)), onclick: () => {
        f.medio = m.id;
        f.tarjeta = o.t ? o.t.id : null;
        f.medioManual = true;
        try { localStorage.setItem('ff:medio', m.id); } catch { /* nada */ }
        pintarMedios();
        pintarOrigen();
        actualizarPrevia();
        plegar();
        limpiarError(campoMedio);
        try { alElegirMedio(); } catch { /* aún no está listo */ }
      } }, h('span', { class: `chip-tc mini tc-${c}`, 'aria-hidden': 'true' }),
      o.t ? `${m.etiqueta} · ${nombreTitular(o.t) || o.t.nombre}` : m.tipo === 'debito' ? m.etiqueta.split(' · ')[0] : CUENTA_DE_MEDIO[m.id] ? `${m.etiqueta} · ${CUENTA_DE_MEDIO[m.id]}` : (medioCompartido(m) ? `${m.etiqueta} · ${DUENIO_TC[colorMedio(m)] || ''}`.trim() : m.etiqueta));
  });
  botonesMedio.forEach((b, i) => { b.hidden = debitoAjeno(opcionesMedio[i].m); });
  function medioCompartido(m) { return catalogoTC().filter((t) => t.medio === m.id).length > 1; }

  const inDesc = h('input', { id: 'descripcion', type: 'text', maxlength: '120', autocomplete: 'off',
    placeholder: 'Ej. Plaza Vea, almuerzo, taxi', value: f.descripcion, enterkeyhint: 'done' });

  // Con qué se pagó un consumo: {medio, tarjeta} con los ids de esta pantalla, o null.
  const medioDeConsumo = (c) => {
    if (!c) return null;
    if (c.tarjeta && c.tarjeta.id && c.tarjeta.id !== 'HORMIGA') {
      const tc = catalogoTC().find((x) => x.id === c.tarjeta.id);
      return tc && medios.some((m) => m.id === tc.medio) ? { medio: tc.medio, tarjeta: tc.id } : null;
    }
    const k = normalizar(c.medio || '');
    const m = k ? medios.find((x) => x.tipo !== 'tarjeta' && (normalizar(x.etiqueta) === k || normalizar(x.id) === k)) : null;
    return m ? { medio: m.id, tarjeta: null } : null;
  };
  // Costumbre: el medio con que más se pagó cada concepto en los últimos 90 días.
  const habitoMedio = (() => {
    const t = leerCache('tarjetas-todo')?.datos?.tarjetas || leerCache('tarjetas')?.datos?.tarjetas || [];
    const desde = iso(new Date(Date.now() - 90 * 86400000));
    const cuenta = new Map();
    for (const c of consumosDe(t, () => true)) {
      if (!c.concepto || String(c.fecha || '') < desde) continue;
      const md = medioDeConsumo(c);
      if (!md) continue;
      const k = normalizar(c.concepto);
      if (!cuenta.has(k)) cuenta.set(k, new Map());
      const clave = md.medio + '|' + (md.tarjeta || '');
      const e = cuenta.get(k).get(clave) || { n: 0, ...md };
      e.n++;
      cuenta.get(k).set(clave, e);
    }
    const salida = new Map();
    for (const [k, mm] of cuenta) salida.set(k, [...mm.values()].sort((x, y) => y.n - x.n)[0]);
    return salida;
  })();
  const ponerMedio = (md) => {
    if (!md) return;
    const visible = medioVisible(md.medio);
    if (!visible) return;
    f.medio = visible; f.tarjeta = visible === md.medio ? (md.tarjeta || null) : null;
    pintarMedios(); pintarOrigen(); actualizarPrevia(); limpiarError(campoMedio);
  };

  // Los conceptos que más usas van primero.
  const usos = new Map();
  for (const x of indiceHistorial()) usos.set(x.c, (usos.get(x.c) || 0) + 1);
  const conceptosOrden = [...conceptos].sort((a, b) => (usos.get(b) || 0) - (usos.get(a) || 0));
  const botonesConcepto = conceptosOrden.map((c) => h('button', { type: 'button', class: 'opcion chica', 'data-c': c,
    'aria-pressed': String(f.concepto === c), onclick: () => {
      f.concepto = c; f.conceptoManual = true; pintarConceptos(); sugerencia.textContent = '';
      // Si no eligió a mano con qué pagó, se pone el de costumbre para ese concepto.
      const costumbre = !f.medioManual ? habitoMedio.get(normalizar(c)) : null;
      if (costumbre) ponerMedio(costumbre);
      try { alElegirConcepto(!!costumbre); } catch { /* aún no está listo */ }
      plegar();
      limpiarError(campoConcepto);
    } }, catIco(c), h('span', { class: 'opcion-texto' }, c)));
  function pintarConceptos() {
    botonesConcepto.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === f.concepto)));
    // En celular se ven los 8 más usados; si el elegido está más abajo, se muestran todos.
    try { if (botonesConcepto.findIndex((b) => b.dataset.c === f.concepto) >= 8) campoConcepto.classList.add('todos'); } catch { /* aún no está listo */ }
    try { pintarSemaforo(); } catch { /* aún no está listo */ }
    try { pintarResumen(); } catch { /* aún no está listo */ }
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
    const idc = tarjetaDe(m);
    const { pago, vence } = calcularCiclo(idc, f.fecha, ciclos);
    const propia = idCicloDeMedio(m, quien());
    const prestada = idc && propia && idc !== propia ? ` · tarjeta de ${DUENIO_TC[idc] || NOMBRE_TC[idc] || idc}` : '';
    vistaPrevia.textContent = (vence
      ? `Se paga el ${fechaLarga(pago)} · vence el ${fechaLarga(vence)}`
      : 'Sin fecha de pago') + prestada;
  }

  const btnGuardar = h('button', { type: 'submit', class: 'boton primario grande' }, 'Guardar gasto');

  const campoMedio = h('fieldset', { class: 'f-medios' }, h('legend', {}, 'Pagué con'), h('div', { class: 'opciones' }, botonesMedio));
  // Al cambiar de persona, el botón de Interbank cambia de dueño (color y nombre).
  const repintarInterbank = () => botonesMedio.forEach((b) => {
    if (b.dataset.tarjeta) return; // con un botón por tarjeta no hay nada que cambiar de dueño
    const m = medios.find((x) => x.id === b.dataset.id);
    if (!m || !medioCompartido(m)) return;
    const c = colorMedio(m);
    b.className = `opcion medio tc-${c}`;
    b.querySelector('.chip-tc').className = `chip-tc mini tc-${c}`;
    b.lastChild.textContent = `${m.etiqueta} · ${DUENIO_TC[c] || nombreCorto(f.responsable)}`;
  });
  const botonesQuien = personas.length > 1 ? personas.map((p) => h('button', { type: 'button', class: 'opcion quien', 'data-p': p, 'aria-pressed': String(f.responsable === p), onclick: () => {
    f.responsable = p;
    f.tarjeta = null; // al cambiar de persona, la tarjeta vuelve a ser la suya (se puede elegir otra después)
    botonesQuien.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p)));
    pintarOrigen();
    repintarInterbank();
    pintarMedios();
    actualizarPrevia();
  } }, avatar(p, 'mini'), h('span', { class: 'opcion-texto' }, nombreCorto(p)))) : [];
  const campoQuien = botonesQuien.length ? h('fieldset', { class: 'f-quien' }, h('legend', {}, '¿Quién gastó?'), h('div', { class: 'opciones' }, botonesQuien)) : null;
  // De dónde sale la plata: fondo común (lo normal), el sobrante de quien gastó o un ahorro.
  const cajaOrigen = h('div', { class: 'opciones opciones-origen' });
  const campoOrigen = motorBolsas() ? h('fieldset', { class: 'f-origen' }, h('legend', {}, '¿De dónde sale?'), cajaOrigen) : null;
  const origenElegido = () => (f.origen === 'P' ? `P:${f.responsable || usuario?.nombre || ''}` : (f.origen || '')); // 'P' = formato viejo
  const notaOrigen = h('p', { class: 'suave nota-origen' });
  const pintarOrigen = () => {
    if (!campoOrigen) return;
    const medioAhora = medios.find((x) => x.id === f.medio);
    const directo = !!medioAhora && medioAhora.tipo !== 'tarjeta';
    const faltaElegir = comoDebito(medioAhora) && !f.origenManual; // con débito (y Yape o Plin, que salen de una cuenta) se pregunta cada vez
    campoOrigen.classList.toggle('pide', faltaElegir);
    const mesPago = medioAhora && !directo ? (calcularCiclo(tarjetaDe(medioAhora), f.fecha, ciclos).pago || f.fecha || '').slice(0, 7) : '';
    const billetera = lineaDeBilletera(f.medio) ? f.medio : null;
    // Solo cuatro tipos de origen (v115): Fondo común (o la billetera, p. ej. Pasajes con Lemon), cada persona
    // (su sobrante) y cada ahorro que exista. Cada uno con lo que tiene.
    const b = bolsasGuardadas();
    const nombresP = (b?.personas || []).length ? b.personas.map((p) => p.nombre) : (personas.length ? personas : [f.responsable || usuario?.nombre || ''].filter(Boolean));
    const ops = [billetera
      ? { valor: '', etiqueta: `${lineaDeBilletera(billetera)} (${nombreBilletera(billetera)})`, ico: 'billetera', disponible: saldoBilletera(billetera, f.fecha)?.queda ?? null }
      : { valor: '', etiqueta: 'Fondo común', ico: 'inicio', disponible: null, nota: 'al cobrar' }];
    for (const n of nombresP) {
      const para = sobranteParaPagar(b, n, directo ? '' : mesPago);
      ops.push({ valor: `P:${n}`, etiqueta: nombreCorto(n), persona: n, disponible: para ? para.tiene : null, deMes: para?.mes || null });
    }
    // Ahorros: los que tienen plata (o el ya elegido).
    for (const x of (b?.ahorros || [])) if (Number(x.disponible) > 0 || f.origen === `A:${x.meta}`) ops.push({ valor: `A:${x.meta}`, etiqueta: nombreLinea(x.meta), ico: 'billetera', disponible: Number(x.disponible) || 0 });
    const claveDe = (o) => o.valor;
    // Sin elección a mano: tarjeta va al fondo común (se paga al cobrar); Lemon, a su presupuesto (Pasajes);
    // los demás pagos directos, al sobrante de quien gastó.
    const resp = f.responsable || usuario?.nombre || '';
    const pResp = nombresP.find((n) => nombreCorto(n) === nombreCorto(resp)) || resp;
    if (f.origen === 'P') f.origen = `P:${pResp}`;
    const porDefecto = directo && !billetera ? `P:${pResp}` : '';
    if (!f.origenManual) f.origen = porDefecto;
    if (!ops.some((o) => claveDe(o) === (f.origen || ''))) f.origen = porDefecto;
    const monto = leerMonto(f.monto || '') || 0;
    cajaOrigen.replaceChildren(...ops.map((o) => {
      const clave = claveDe(o);
      const corto = o.disponible !== null && o.disponible !== undefined && monto > 0 && monto > o.disponible;
      return h('button', { type: 'button', class: 'opcion origen', 'aria-pressed': String(!faltaElegir && (f.origen || '') === clave), onclick: () => { f.origen = clave; f.origenManual = true; limpiarError(campoOrigen); pintarOrigen(); } },
        h('span', { class: 'origen-ico' }, o.persona ? avatar(o.persona, 'mini') : icono(o.ico)),
        h('span', { class: 'origen-texto' }, h('span', {}, o.etiqueta),
          o.disponible === null || o.disponible === undefined ? (o.nota ? h('small', {}, o.nota) : null)
            : h('small', { class: corto || o.disponible < 0 ? 'mal' : '' }, corto ? `No alcanza · tiene ${soles(Math.max(0, o.disponible))}`
              : `${o.disponible < 0 ? '−' : ''}${soles(Math.abs(o.disponible))}${o.deMes ? ' de ' + mesMinuscula(o.deMes) : ''}`)));
    }), notaOrigen);
    // Antes de guardar: si lo pagas con tu sobrante, dice si te alcanza y cuánto te quedaría (o cuánto falta).
    const elegida = ops.find((o) => claveDe(o) === (f.origen || ''));
    const conSobrante = String(f.origen || '').startsWith('P:') && elegida && elegida.disponible !== null && elegida.disponible !== undefined && monto > 0;
    const quedaria = conSobrante ? Math.round((elegida.disponible - monto) * 100) / 100 : 0;
    const deDonde = elegida?.deMes ? ` de ${mesMinuscula(elegida.deMes)}` : '';
    notaOrigen.classList.toggle('alcanza', conSobrante && quedaria >= 0);
    const noAlcanzaAhora = conSobrante && quedaria < 0;
    // Cuando pasa a "no alcanza", la opción elegida tiembla para que se note.
    if (noAlcanzaAhora && !notaOrigen.classList.contains('no-alcanza')) {
      const elegido = cajaOrigen.querySelector('.opcion.origen[aria-pressed="true"]');
      if (elegido && !sinMovimiento()) { elegido.classList.remove('tiembla'); void elegido.offsetWidth; elegido.classList.add('tiembla'); }
    }
    notaOrigen.classList.toggle('no-alcanza', noAlcanzaAhora);
    pintarSemaforo();
    try { pintarResumen(); } catch { /* aún no está listo */ }
    notaOrigen.textContent = faltaElegir ? `Pagaste con ${medioAhora?.tipo === 'debito' ? 'débito' : `${medioAhora.etiqueta} (cuenta ${CUENTA_DE_MEDIO[medioAhora.id]})`}: elige si sale del presupuesto (Fondo común) o del sobrante de alguien.`
      : conSobrante
      ? (quedaria >= 0 ? `Te alcanza: te quedarían ${soles(quedaria)}${deDonde}.` : `No te alcanza: te faltarían ${soles(-quedaria)}${deDonde}.`)
      : !medioAhora ? '' : billetera && !f.origen
        ? `${nombreBilletera(billetera)} tiene el presupuesto de ${lineaDeBilletera(billetera)}: sale de ahí, no de tu sobrante.`
      : directo
        ? 'Lo de este mes llega al cobrar a fin de mes. Con Yape, Plin o efectivo se gasta de lo que ya tienes.'
        : String(f.origen || '').startsWith('P:') ? 'Sale de lo que te sobre el mes en que se paga la tarjeta, no de lo que tienes hoy.'
          : 'La tarjeta se paga a fin de mes, con el ingreso de este mes.';
  };
  inMonto.addEventListener('input', () => pintarOrigen());
  inFecha.addEventListener('change', () => pintarOrigen()); // la fecha cambia el mes en que se paga la tarjeta
  // ¿Hay que frenar este gasto? Con sobrante o ahorro: si no alcanza o deja menos del 15 %; del fondo común:
  // si pasa (o casi) el presupuesto de su línea. Devuelve los datos de la ventana o null.
  // ¿Alcanza este gasto? Con sobrante o ahorro: lo que hay ahí. Del fondo común: lo que sobra del mes en que se
  // paga (después de lo planeado) y el tope de su línea del presupuesto. nivel: 'ok' | 'ojo' (queda <15 %) | 'alto'.
  // Cuotas (v123): solo con tarjeta de crédito y motor 1.11.
  const conTarjeta = () => medios.find((x) => x.id === f.medio)?.tipo === 'tarjeta';
  const enCuotas = () => motorCuotas() && conTarjeta() && f.cuotas > 1;
  const listaCuotas = () => (enCuotas() ? montosDeCuotas(leerMonto(f.monto || '') || 0, f.cuotas, f.montoCuota) : []);
  const ofrecerCuotas = () => (motorCuotas() && conTarjeta() && !(f.cuotas > 1) ? 'Mejor en cuotas' : '');
  // Lo que pesa este mes: la primera cuota si es en cuotas (para el semáforo y el freno).
  const montoDelMes = () => (enCuotas() && listaCuotas().length ? listaCuotas()[0] : leerMonto(f.monto || '') || 0);
  const estadoGasto = (monto) => {
    if (!motorBolsas() || !(monto > 0)) return null;
    const b = bolsasGuardadas();
    const medioAhora = medios.find((x) => x.id === f.medio);
    if (!medioAhora) return null;
    const directo = medioAhora.tipo !== 'tarjeta';
    const mesPago = directo ? '' : (calcularCiclo(tarjetaDe(medioAhora), f.fecha, ciclos).pago || f.fecha || '').slice(0, 7);
    const nivelDe = (tiene) => { const q = tiene - monto; return q < 0 ? 'alto' : q < Math.max(30, tiene * 0.15) ? 'ojo' : 'ok'; };
    const armar = (nivel, tiene, etqTiene, titulos, sub) => ({ nivel, tiene, monto, etqTiene, sub, titulo: titulos[nivel], queda: Math.round((tiene - monto) * 100) / 100 });
    if (String(f.origen || '').startsWith('P:') || f.origen === 'P') {
      const quienSale = f.origen === 'P' ? (f.responsable || usuario?.nombre || '') : f.origen.slice(2);
      const para = sobranteParaPagar(b, quienSale, mesPago);
      if (!para) return null;
      const propio = nombreCorto(quienSale) === nombreCorto(usuario?.nombre || '');
      const dueno = propio ? 'Tu sobrante' : `Sobrante de ${nombreCorto(quienSale)}`;
      return armar(nivelDe(para.tiene), para.tiene, para.mes ? `${dueno} de ${mesMinuscula(para.mes)}` : (propio ? 'Tu plata hoy' : `Plata de ${nombreCorto(quienSale)} hoy`),
        { alto: 'Alto: no te alcanza', ojo: 'Ojo: te quedaría poco', ok: 'Te alcanza' },
        para.mes ? `Con tarjeta lo pagas con lo que te sobre de ${mesMinuscula(para.mes)}.` : 'Sale de lo que ya tienes en la mano.');
    }
    if (f.origen && f.origen.startsWith('A:')) {
      const ah = (b?.ahorros || []).find((x) => normalizar(x.meta) === normalizar(f.origen.slice(2)));
      if (!ah) return null;
      const n = nombreLinea(ah.meta);
      return armar(nivelDe(Number(ah.disponible) || 0), Number(ah.disponible) || 0, n,
        { alto: `Alto: ${n} no alcanza`, ojo: `Ojo: ${n} quedaría casi vacío`, ok: 'Te alcanza' }, 'Sale de lo que tienen guardado.');
    }
    // Billetera con presupuesto (Lemon = Pasajes): se compara con lo que queda en ella.
    if (!f.origen && lineaDeBilletera(f.medio)) {
      const s = saldoBilletera(f.medio, f.fecha);
      if (!s) return null;
      return armar(nivelDe(s.queda), s.queda, `En ${nombreBilletera(s.medio)} (${s.linea})`,
        { alto: `No alcanza lo que hay en ${nombreBilletera(s.medio)}`, ojo: `Ojo: ${nombreBilletera(s.medio)} casi vacío`, ok: 'Te alcanza' },
        `Cargaste ${soles(s.plan)} de ${s.linea} y ya usaste ${soles(s.usado)}.`);
    }
    // Fondo común (v116): el gasto se resta de lo que sobra ENTRE LOS DOS en el mes en que se paga, y lo que
    // quede se reparte mitad y mitad. Se muestra el total y cuánto le toca a cada uno.
    const mesFondo = mesPago || b?.mes || '';
    const nPersonas = Math.max(1, (b?.personas || []).length);
    const proxFondo = (b?.proximos || []).find((p) => p.mes === mesFondo);
    const total = !b ? null : mesFondo === b.mes ? Number(b.comun?.saldo) : proxFondo ? Math.round(Number(proxFondo.porPersona) * nPersonas * 100) / 100 : null;
    // En pantalla solo se ve lo que le queda a quien gastó: su parte de lo que sobre DESPUÉS del gasto
    // ((total − gasto) / personas) menos lo que ya tiene apartado para sus tarjetas de ese mes.
    const conFondo = total === null || !isFinite(total) ? null : (() => {
      const quienFondo = f.responsable || usuario?.nombre || '';
      const apartado = Number(proxFondo?.personas?.find((x) => nombreCorto(x.nombre) === nombreCorto(quienFondo))?.apartado) || 0;
      const tiene = Math.round((total / nPersonas - apartado) * 100) / 100;
      const queda = Math.round(((total - monto) / nPersonas - apartado) * 100) / 100;
      const nivel = queda < 0 ? 'alto' : queda < Math.max(30, tiene * 0.15) ? 'ojo' : 'ok';
      const titulos = { alto: `No te alcanza lo que te sobra de ${mesMinuscula(mesFondo)}`, ojo: `Ojo: casi no te sobra nada de ${mesMinuscula(mesFondo)}`, ok: 'Te alcanza' };
      return { nivel, tiene, monto, queda, costo: Math.round((tiene - queda) * 100) / 100, etqTiene: `Te sobra de ${mesMinuscula(mesFondo)}`, titulo: titulos[nivel],
        sub: mesPago ? `La tarjeta se paga con el sueldo de ${mesMinuscula(mesFondo)}.` : 'Sale del fondo común de este mes.' };
    })();
    const pres = mesPago ? null : restoDelPresupuesto(f.concepto, f.fecha); // con tarjeta de crédito no toca la línea
    const conPres = !pres ? null : (() => {
      const nivel = pres.queda - monto < 0 ? 'alto' : (pres.gastado + monto) / pres.plan >= 0.9 ? 'ojo' : 'ok';
      return armar(nivel, Math.max(0, pres.queda), `Queda en ${pres.nombre}`,
        { alto: `Te pasas del presupuesto de ${pres.nombre}`, ojo: `Casi llegas al tope de ${pres.nombre}`, ok: 'Te alcanza' },
        `Llevas ${soles(pres.gastado)} de ${soles(pres.plan)} este mes.`);
    })();
    const orden = ['alto', 'ojo', 'ok'];
    for (const nivel of orden) {
      if (conFondo?.nivel === nivel) return conFondo;
      if (conPres?.nivel === nivel) return conPres;
    }
    return null;
  };
  const revisarFreno = (monto) => { const e = estadoGasto(monto); return e && e.nivel !== 'ok' ? e : null; };
  // Pinta el semáforo de la caja del monto; si pasa a rojo, tiembla, la caja se pone en rojo y, al dejar de
  // escribir, se abre sola la ventana "Alto" (una vez por cada combinación de monto, origen, tarjeta y concepto).
  let nivelAntes = null;
  let frenoVisto = '';
  let frenoAceptado = '';
  let timerFreno = 0;
  const claveFreno = (e) => [e.monto, f.origen || '', f.medio || '', e.etqTiene || '', f.fecha || ''].join('|'); // mismo motivo = no se repite
  const pintarSemaforo = () => {
    const e = estadoGasto(montoDelMes());
    semaforo.hidden = !e;
    cajaMonto?.classList.toggle('en-rojo', e?.nivel === 'alto');
    clearTimeout(timerFreno);
    if (!e) { nivelAntes = null; return; }
    const pct = e.tiene > 0 ? Math.min(100, (e.monto / e.tiene) * 100) : 100;
    semaforo.className = `semaforo ${e.nivel}`;
    semaforo.replaceChildren(
      h('span', { class: 'semaforo-ico', 'aria-hidden': 'true' }, icono(e.nivel === 'ok' ? 'check' : 'alerta')),
      h('span', { class: 'semaforo-texto' },
        h('strong', {}, e.nivel === 'alto' ? 'No te alcanza' : e.nivel === 'ojo' ? 'Justo: te quedaría poco' : 'Te alcanza'),
        h('em', {}, e.nivel === 'alto' ? `Faltan ${soles(-e.queda)}` : `Quedarían ${soles(e.queda)}`),
        h('small', {}, `${e.etqTiene}: ${soles(e.tiene)}`)),
      h('span', { class: 'semaforo-barra', 'aria-hidden': 'true' }, h('b', { style: `width: ${pct}%` })));
    if (e.nivel === 'alto' && nivelAntes !== 'alto' && !sinMovimiento()) { semaforo.classList.add('sacude'); }
    nivelAntes = e.nivel;
    if (e.nivel !== 'alto') return;
    const clave = claveFreno(e);
    if (clave === frenoVisto) return;
    timerFreno = setTimeout(async () => {
      const ahora = estadoGasto(montoDelMes());
      if (!ahora || ahora.nivel !== 'alto' || claveFreno(ahora) !== clave || document.querySelector('dialog[open]')) return;
      frenoVisto = clave;
      const seguir = await frenoGasto({ ...ahora, textoNo: 'Mejor no lo gasto', textoSi: 'Seguir igual', textoCuotas: ofrecerCuotas() });
      if (seguir === 'cuotas') { btnCuotas.click(); return; }
      if (seguir) { frenoAceptado = clave; return; }
      // Desistió: se borra el monto para empezar de nuevo.
      f.monto = ''; inMonto.value = ''; cajaMonto?.classList.remove('plegado');
      pintarOrigen();
      msg.className = 'mensaje';
      msg.replaceChildren('Bien pensado: no se anotó nada.');
      inMonto.focus({ preventScroll: true });
    }, 1100);
  };
  pintarOrigen();
  if (campoOrigen && !bolsasGuardadas()) cargarRapido('bolsas', {}, 'bolsas').then(pintarOrigen).catch(() => { /* quedan las opciones sin montos */ });
  // Para el freno del presupuesto: el presupuesto del ciclo de hoy y lo ya gastado, en segundo plano.
  if (motorBolsas() && emailSesion()) {
    const mc = mesDelCiclo(hoyISO());
    cargarRapido('presupuesto', { mes: mc }, 'presupuesto:' + mc).then(() => pintarSemaforo()).catch(() => null);
    cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo').then(() => pintarSemaforo()).catch(() => null);
  }
  const campoConcepto = h('fieldset', { class: 'f-conceptos' }, h('legend', {}, '¿En qué gastaste?'), h('div', { class: 'opciones chicas' }, botonesConcepto));
  const cajaFecha = selectorFecha(inFecha);
  const campoFecha = h('div', { class: 'campo' }, h('label', { for: 'fecha' }, '¿Cuándo?'), cajaFecha);
  inFecha.addEventListener('change', () => limpiarError(campoFecha));
  // Últimos gastos: primero los registrados en esta visita, luego los más recientes que ya están en el Sheets.
  const listaRecientes = h('ul', { class: 'rec-lista' });
  const pintarRecientes = () => {
    const guardados = consumosDe(leerCache('tarjetas')?.datos?.tarjetas || [], () => true)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const items = [...(estado.recienRegistrados || []), ...guardados].slice(0, 4);
    listaRecientes.replaceChildren(...items.map((c) => h('li', { class: 'rec repetible' + (c.nuevo ? ' nuevo' : ''), title: 'Repetir: ' + (c.descripcion || c.concepto || ''),
      role: 'button', tabindex: '0', onclick: () => repetir(c), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); repetir(c); } } },
      catIco(c.concepto),
      h('span', { class: 'rec-texto' }, h('span', {}, limpiarComercio(c.descripcion || c.concepto || 'Gasto')), h('span', { class: 'suave' }, fechaCorta(c.fecha))),
      h('strong', {}, soles(c.monto)),
      c.nuevo ? h('span', { class: 'rec-ok', 'aria-label': 'Recién registrado' }, icono('check')) : null)));
  };
  // ======================= Registro en una sola pantalla (v113) =======================
  // Todo a la vista y sin bajar: monto (con el aviso de si alcanza) y "Lo de siempre" a la izquierda;
  // concepto, pago, quién, de dónde sale, fecha, descripción y Guardar a la derecha, en fichas chicas.
  // Con teclado: escribir el monto, luego letras del concepto (filtra) y Enter guarda cuando está completo.
  const montoActual = () => leerMonto(f.monto || '') || 0;
  // Lleva la vista al dato que falta (lo usa el guardado cuando algo está incompleto).
  function irA(p) {
    const destino = { monto: cajaMonto, concepto: campoConcepto, medio: campoMedio, listo: btnGuardar }[p];
    if (p === 'monto') { cajaMonto.classList.remove('plegado'); inMonto.focus({ preventScroll: true }); }
    destino?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  // "Lo de siempre": los gastos que más repites (60 días). Un toque llena todo; solo falta Guardar.
  const atajos = (() => {
    const t = leerCache('tarjetas-todo')?.datos?.tarjetas || leerCache('tarjetas')?.datos?.tarjetas || [];
    const desde = iso(new Date(Date.now() - 60 * 86400000));
    const grupos = new Map();
    for (const c of consumosDe(t, () => true)) {
      if (!c.concepto || !(Number(c.monto) > 0) || String(c.fecha || '') < desde) continue;
      const md = medioDeConsumo(c);
      const desc = limpiarComercio(c.descripcion || '') || c.concepto;
      const k = [normalizar(desc), normalizar(c.concepto), md ? md.medio + (md.tarjeta || '') : ''].join('|');
      const g = grupos.get(k) || { n: 0, c, fecha: '' };
      g.n++;
      if (String(c.fecha) >= g.fecha) { g.fecha = String(c.fecha); g.c = c; }
      grupos.set(k, g);
    }
    return [...grupos.values()].sort((x, y) => (y.n - x.n) || y.fecha.localeCompare(x.fecha)).slice(0, 6).map((g) => g.c);
  })();
  // "Lo de siempre" se quitó a pedido del usuario (v114); repetir() queda para uso futuro.
  const cajaAtajos = false && atajos.length ? h('div', { class: 'atajos' }, h('span', { class: 'atajos-etq' }, 'Lo de siempre'),
    h('div', { class: 'atajos-lista' }, atajos.map((c) => {
      const md = medioDeConsumo(c);
      return h('button', { type: 'button', class: 'atajo', title: 'Llenar con este gasto', onclick: () => repetir(c) },
        catIco(c.concepto),
        h('span', { class: 'atajo-texto' }, h('strong', {}, limpiarComercio(c.descripcion || '') || c.concepto),
          h('small', {}, [soles(c.monto), md ? (medios.find((m) => m.id === md.medio)?.etiqueta || '') : ''].filter(Boolean).join(' · '))));
    }))) : null;
  function repetir(c) {
    f.monto = String(Number(c.monto) || ''); inMonto.value = f.monto;
    f.concepto = c.concepto || f.concepto; f.conceptoManual = true;
    f.descripcion = limpiarComercio(c.descripcion || '') || ''; inDesc.value = f.descripcion; sugerencia.textContent = '';
    const md = medioDeConsumo(c);
    if (md) { f.medioManual = true; ponerMedio(md); }
    pintarConceptos(); pintarOrigen(); actualizarPrevia();
    cajaMonto.classList.add('plegado');
    btnGuardar.focus({ preventScroll: true });
    btnGuardar.classList.remove('late'); void btnGuardar.offsetWidth; btnGuardar.classList.add('late');
  }
  pintarRecientes();

  // Filtro de conceptos al teclear letras (desde el monto o con el foco en la pantalla).
  let filtroConcepto = '';
  const filtroVisible = h('span', { class: 'filtro-concepto', 'aria-live': 'polite' });
  function filtrarConceptos() {
    const k = normalizar(filtroConcepto);
    botonesConcepto.forEach((b) => b.classList.toggle('apagado', !!k && !normalizar(b.dataset.c).includes(k)));
    filtroVisible.textContent = filtroConcepto ? `“${filtroConcepto}” · Enter elige` : '';
  }
  const alElegirConcepto = () => { filtroConcepto = ''; filtrarConceptos(); plegar(); };
  const alElegirMedio = () => {};

  const btnCuotas = h('button', { type: 'button', class: 'r-cuotas', title: 'Pagar en cuotas', onclick: async () => {
    const m = montoActual();
    if (!(m > 0)) { inMonto.focus(); return; }
    const md = medios.find((x) => x.id === f.medio);
    const mesInicio = md ? (calcularCiclo(tarjetaDe(md), f.fecha, ciclos).pago || '').slice(0, 7) : '';
    const r = await elegirCuotas({ total: m, cuotas: f.cuotas || 1, montoCuota: f.montoCuota || 0, mesInicio });
    if (r) { f.cuotas = r.cuotas > 1 ? r.cuotas : 0; f.montoCuota = r.montoCuota || 0; }
    pintarGuardar(); try { pintarSemaforo(); } catch { /* aún no está listo */ }
  } });
  const pintarCuotas = () => {
    const visible = motorCuotas() && conTarjeta();
    btnCuotas.hidden = !visible;
    if (!visible && f.cuotas) { f.cuotas = 0; f.montoCuota = 0; }
    const lista = listaCuotas();
    btnCuotas.classList.toggle('activo', lista.length > 1);
    btnCuotas.replaceChildren(icono('calendario'), h('span', {}, lista.length > 1 ? `${f.cuotas} cuotas` : 'En cuotas'));
  };
  const pintarGuardar = () => {
    pintarCuotas();
    if (btnGuardar.classList.contains('ocupado')) return;
    const m = montoActual();
    const lista = listaCuotas();
    const cuanto = lista.length > 1 ? `${f.cuotas} × ${soles(lista[lista.length - 1])}` : soles(m);
    btnGuardar.textContent = m > 0 && f.concepto ? `Guardar ${cuanto} · ${f.concepto}` : 'Guardar gasto';
  };
  const pintarResumen = () => { pintarGuardar(); pintarFecha(); }; // lo llaman pintarOrigen y pintarConceptos
  inMonto.addEventListener('input', pintarGuardar);

  // Fecha en un toque: Hoy, Ayer u otra (calendario).
  const fechaHoy = h('button', { type: 'button', class: 'ficha', onclick: () => fechaRapida(0) }, 'Hoy');
  const fechaAyer = h('button', { type: 'button', class: 'ficha', onclick: () => fechaRapida(1) }, 'Ayer');
  function fechaRapida(dias) { const d = new Date(); d.setDate(d.getDate() - dias); inFecha.value = iso(d); inFecha.dispatchEvent(new Event('change', { bubbles: true })); cajaFecha.refrescar?.(); pintarFecha(); }
  function pintarFecha() {
    fechaHoy.setAttribute('aria-pressed', String(f.fecha === hoyISO()));
    fechaAyer.setAttribute('aria-pressed', String(f.fecha === iso(new Date(Date.now() - 86400000))));
  }
  inFecha.addEventListener('change', pintarFecha);
  let conNota = false;
  const cajaNota = h('div', { class: 'campo r-nota', hidden: true }, inNota);
  const botonNota = h('button', { type: 'button', class: 'boton enlace r-mas', onclick: () => { cajaNota.hidden = false; botonNota.hidden = true; inNota.focus(); } }, '+ Nota');

  // Teclado: en el monto, las letras filtran conceptos; Enter elige el primero o, si ya está completo, guarda.
  inMonto.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key.length === 1 && /[\p{L}]/u.test(ev.key)) { ev.preventDefault(); filtroConcepto += ev.key; filtrarConceptos(); return; }
    if (ev.key === 'Backspace' && filtroConcepto) { ev.preventDefault(); filtroConcepto = filtroConcepto.slice(0, -1); filtrarConceptos(); return; }
    if (ev.key === 'Escape' && filtroConcepto) { ev.preventDefault(); filtroConcepto = ''; filtrarConceptos(); return; }
    if (ev.key === 'Enter') {
      ev.preventDefault(); ev.stopPropagation();
      if (filtroConcepto) { const b = botonesConcepto.find((x) => !x.classList.contains('apagado')); if (b) b.click(); return; }
      if (montoActual() > 0 && f.concepto && f.medio) btnGuardar.click();
    }
  });
  inDesc.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); btnGuardar.click(); } });

  // ---- Armado ----
  campoConcepto.prepend(filtroVisible);
  const form = h('form', { class: 'formulario registro-uno', novalidate: true },
    h('div', { class: 'r-izq' },
      (cajaMonto = h('div', { class: 'hero monto-caja' + (conTeclado ? ' con-teclado' : '') }, heroFondo(),
        h('label', { class: 'campo-monto-caja', for: 'monto', onclick: () => cajaMonto.classList.remove('plegado') }, h('span', { class: 'moneda' }, 'S/'), inMonto),
        semaforo,
        conTeclado ? tecladoMonto(inMonto) : null))),
    h('div', { class: 'r-der' },
      campoOrigen,
      campoMedio,
      vistaPrevia,
      campoConcepto,
      h('div', { class: 'r-fila r-fila-quien' }, campoQuien,
        h('fieldset', { class: 'r-fecha-campo' }, h('legend', {}, '¿Cuándo?'),
          h('div', { class: 'r-fecha', role: 'group', 'aria-label': 'Fecha' }, fechaHoy, fechaAyer, cajaFecha))),
      h('div', { class: 'r-fila r-fila-textos' },
        h('div', { class: 'campo r-desc' }, inDesc, sugerencia),
        h('div', { class: 'campo r-nota' }, inNota)),
      h('div', { class: 'f-cierre' }, msg, h('div', { class: 'r-guardar' }, btnCuotas, btnGuardar))));
  inNota.placeholder = 'Nota (opcional)';
  inDesc.placeholder = 'Descripción (opcional)';
  pintarFecha(); pintarGuardar();

  // Muestra en 'msg' lo que pasó con el envío de un gasto (también tras 'Guardar igual').
  function mostrarResultado(datos, res) {
    const r = res?.resultados?.[datos.idCliente];
    if (r?.tipo === 'enviado') {
      if (!r.datos?.duplicadoId) celebrar(datos.monto); // la celebración sale cuando de verdad quedó guardado
      msg.className = 'mensaje ok';
      msg.replaceChildren(r.datos?.duplicadoId
        ? `Ya estaba guardado en ${r.datos.hoja}.`
        : `Guardado en ${r.datos?.hoja || 'tu hoja'}: ${datos.descripcion}, ${soles(datos.monto)}${datos.cuotas > 1 ? ` en ${datos.cuotas} cuotas` : ''}.`);
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
    else if (campoOrigen && comoDebito(medios.find((x) => x.id === f.medio)) && !f.origenManual) fallos.push([campoOrigen, 'Elige de dónde sale.']);
    if (!f.concepto) fallos.push([campoConcepto, 'Elige un concepto.']);
    if (!deISO(f.fecha)) fallos.push([campoFecha, 'Revisa la fecha.']);
    else if (f.fecha > manana) fallos.push([campoFecha, 'La fecha no puede ser futura.']);
    if (fallos.length || !email) {
      // Lleva al paso de lo que falta.
      if (fallos.length) irA(!monto ? 'monto' : !f.concepto ? 'concepto' : !f.medio ? 'medio' : 'listo');
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
    // Freno: antes de guardar, si no alcanza (o deja muy poco) se avisa en grande y se puede desistir.
    const freno = revisarFreno(montoDelMes());
    clearTimeout(timerFreno);
    // Si ya dijo "Seguir igual" en la ventana que salió sola para este mismo gasto, no se pregunta otra vez.
    const decision = freno && !(freno.nivel === 'alto' && claveFreno(freno) === frenoAceptado) ? await frenoGasto({ ...freno, textoCuotas: ofrecerCuotas() }) : true;
    if (decision === 'cuotas') { btnCuotas.click(); return; }
    if (!decision) {
      msg.className = 'mensaje';
      msg.replaceChildren('No se guardó. Bien pensado.');
      inMonto.focus({ preventScroll: true });
      return;
    }
    ocuparBoton(btnGuardar, 'Guardando…');
    const datos = {
      idCliente: uuid(), monto, medio: f.medio, concepto: f.concepto,
      descripcion: (f.descripcion.trim() || f.concepto || '').slice(0, 120), nota: f.nota.trim().slice(0, 200),
      fecha: f.fecha, confirmarDuplicado: false,
    };
    if (personas.length > 1 && f.responsable && f.responsable !== usuario?.nombre) datos.responsable = f.responsable;
    // Tarjeta de otra persona (prestada): se manda aparte de quién gastó.
    const mElegido = medios.find((x) => x.id === f.medio);
    if (motorPrestada() && mElegido?.tipo === 'tarjeta' && tarjetaDe(mElegido) !== idCicloDeMedio(mElegido, quien())) datos.tarjeta = tarjetaDe(mElegido);
    if (motorBolsas() && origenElegido()) datos.origen = origenElegido();
    if (enCuotas() && listaCuotas().length > 1) { datos.cuotas = f.cuotas; if (f.montoCuota > 0) datos.montoCuota = f.montoCuota; }
    try {
      await cola.encolar('registrar', datos, email);
    } catch {
      msg.className = 'mensaje error';
      msg.replaceChildren('No se pudo guardar. Intenta de nuevo.');
      liberarBoton(btnGuardar, 'Guardar gasto');
      return;
    }
    // Ya está en la cola: se puede registrar el siguiente mientras se envía.
    Object.assign(f, { monto: '', descripcion: '', concepto: null, conceptoManual: false, nota: '', medioManual: false, cuotas: 0, montoCuota: 0 });
    // la nota queda visible siempre
    cajaMonto?.classList.remove('plegado');
    inMonto.value = ''; inDesc.value = ''; inNota.value = ''; sugerencia.textContent = ''; pintarConceptos();
    liberarBoton(btnGuardar, 'Guardar gasto');
    irA('monto');
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
  // Las cuentas de débito salen de la configuración: si aún no está en el equipo, se trae junto con las tarjetas.
  const [r] = await Promise.all([obtenerTarjetas(), leerCache('config') ? null : cargar('config', {}, 'config').catch(() => null)]);
  marcarDatos(r);
  const lista = r.datos.tarjetas || [];
  const deCredito = lista.filter((t) => t.id !== 'HORMIGA');
  const hormiga = lista.find((t) => t.id === 'HORMIGA');
  const total = deCredito.reduce((s, t) => s + (t.pendiente || 0), 0);
  const conDeuda = deCredito.filter((t) => t.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
  const porFecha = conDeuda.filter((t) => t.proximoVence).sort((a, b) => String(fechaPagoTC(a)).localeCompare(String(fechaPagoTC(b))));
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
      heroDato('calendario', 'Próximo pago', proxima ? fechaCorta(fechaPagoTC(proxima)) : 'Ninguno'),
      heroDato('tarjetas', 'La más alta', conDeuda[0] ? nombreCortoTC(conDeuda[0]) : 'Ninguna'),
      heroDato('billetera', 'Con débito', soles(hormiga?.pendiente || 0))));

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
          const e = estadoVence(t.proximoVence, t.pendiente, pagoDeTC(t));
          return paso(`tc-${t.id}${e.clase ? ` ruta-${e.clase}` : ''}`, deISO(fechaPagoTC(t)), nombreCortoTC(t), e.texto, t.pendiente, `#tarjeta-${t.id}`, i + 1);
        })));
  }

  // Billetera: las tarjetas van encimadas, como en una billetera. La que vence primero queda adelante, completa;
  // de las demás se ve la franja de arriba con el nombre y lo que falta pagar.
  const peso = (t) => (t.id === 'HORMIGA' || t.cuenta ? 0 : t.pendiente > 0 && t.proximoVence ? 2 : 1);
  const enPila = tarjetasVista(lista).sort((a, b) => peso(a) - peso(b) || String(b.proximoVence || '').localeCompare(String(a.proximoVence || '')));
  // v160: --n = cuántas tarjetas hay; el CSS achica la pila para que entre en el alto de la ventana.
  const billetera = h('div', { class: 'billetera', style: `--n:${enPila.length}` }, enPila.map((t, i) => {
    const el = tarjetaVisual(t);
    el.style.setProperty('--i', String(i));
    // v162: la franja que se ve de cada tarjeta es igual en todas (antes Sip y Ripley no mostraban su nombre).
    el.append(h('span', { class: 'pila-franja', 'aria-hidden': 'true' },
      h('span', { class: 'franja-nombre' }, nombreCortoTC(t)), h('strong', { class: 'franja-monto' }, soles(t.pendiente || 0))));
    return el;
  }));
  // A un lado la billetera; al otro, el resumen y el calendario de pagos.
  raiz.append(h('div', { class: 'rejilla-billetera' },
    h('div', { class: 'col-pila' }, heroTarjetas, panelRuta),
    h('section', { class: 'billetera-caja' }, h('div', { class: 'seccion-cab' }, tituloSeccion('Tus tarjetas')), billetera)));
  return raiz;
}

async function vistaTarjeta(id) {
  const [r] = await Promise.all([obtenerTarjetas(), leerCache('config') ? null : cargar('config', {}, 'config').catch(() => null)]);
  marcarDatos(r);
  const t = tarjetasVista(r.datos.tarjetas).find((x) => x.id === id) || (r.datos.tarjetas || []).find((x) => x.id === id);
  const volver = h('a', { class: 'volver', href: '#tarjetas' }, icono('atras'), 'Tarjetas');
  if (!t) return h('div', { class: 'pantalla' }, volver, vacio('No encontramos esta tarjeta.'));

  if (estado.selTarjeta !== id) { estado.selTarjeta = id; estado.seleccion = new Set(); }
  const esHormiga = t.id === 'HORMIGA' || !!t.cuenta;
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
      esHormiga ? null : h('button', { type: 'button', class: 'boton datos-tc', onclick: () => editarDatosTC(t) }, 'Editar datos de la tarjeta'),
      h('section', { class: 'panel resumen-tc' },
        esHormiga ? null : h('div', { class: 'linea' }, h('span', { class: 'suave' }, 'Próximo pago'), estadoPill(t.proximoVence, t.pendiente, pagoDeTC(t))),
        h('div', { class: 'linea' }, h('span', { class: 'suave' }, esHormiga ? 'Gastos del mes' : 'Consumos por pagar'), h('strong', {}, String(porPagar))),
        (t.cuenta ? nombreCorto(t.cuenta.titular) : duenioTC(t)) ? h('div', { class: 'linea' }, h('span', { class: 'suave' }, 'Titular'),
          h('span', { class: 'titular' }, avatar(t.cuenta ? nombreCorto(t.cuenta.titular) : duenioTC(t), 'chico'), t.cuenta ? nombreCorto(t.cuenta.titular) : duenioTC(t))) : null,
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
    col.append(vacio(t.cuenta ? 'Sin gastos con esta cuenta este mes.' : esHormiga ? 'Sin gastos hormiga este mes.' : 'No hay consumos pendientes.'));
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
      const aLaVista = () => pendientes.filter((c) => { const li = zona.closest('.grupo')?.querySelector(`li[data-fila="${c.fila}"]`); return !li?.hidden && !li?.classList.contains('yendose'); });
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
    const diasPago = !esHormiga && g.pago ? diasEntre(hoyISO(), g.pago) : null;
    const pill = dias == null ? null
      : dias < 0 ? h('span', { class: 'estado-pill vencido' }, `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`)
        : diasPago != null && diasPago >= 0
          ? h('span', { class: `estado-pill ${diasPago <= 7 ? 'pronto' : 'al-dia'}` }, diasPago === 0 ? 'Pagas hoy' : diasPago === 1 ? 'Pagas mañana' : diasPago <= 7 ? `Pagas en ${diasPago} días` : `Faltan ${diasPago} días`)
          : diasPago != null && pendientes.length ? h('span', { class: 'estado-pill pronto' }, dias === 0 ? 'Vence hoy' : `Pago atrasado · vence en ${dias} día${dias === 1 ? '' : 's'}`)
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
          !esHormiga && g.total !== g.pendiente ? h('p', { class: 'suave' }, `de ${soles(g.total)}`) : null, zona)),
      h('ul', { class: 'lista consumos dias-plegables' }, consumos.flatMap((c, k) => {
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
          'data-texto': normalizar(`${c.descripcion} ${limpiarComercio(c.descripcion)} ${c.concepto || ''} ${esHormiga ? c.medio || '' : ''}`) + ' ' + palabrasFecha(c.fecha) },
          h('label', { class: 'consumo' + (puede ? '' : ' inactivo'), title: c.descripcion,
            style: `--p: ${Math.round(Math.sqrt(Math.abs(c.monto || 0) / montoMax) * 100)}%` }, // raíz: un consumo muy grande no aplasta a los demás
          esHormiga ? null : caja,
          // El ícono del concepto lleva, en la esquina, la inicial de quien hizo el gasto.
          c.responsable ? h('span', { class: 'ico-quien' }, catIco(c.concepto), avatar(c.responsable, 'mini quien')) : catIco(c.concepto),
          h('div', { class: 'consumo-texto', onclick: (ev) => {
            // En pantallas táctiles no hay lápiz: tocar el nombre abre la edición.
            if (enEspera(c) || !matchMedia('(hover: none)').matches) return;
            ev.preventDefault(); editarConsumo(t.base || t, c);
          } }, h('span', {}, limpiarComercio(c.descripcion)), h('span', { class: 'suave' }, sub, c.origen ? h('em', { class: 'de-donde' }, textoOrigen(c.origen)) : null)),
          enEspera(c) ? null : h('button', { type: 'button', class: 'boton-editar', title: 'Editar', 'aria-label': `Editar ${limpiarComercio(c.descripcion)}`,
            onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); editarConsumo(t.base || t, c); } }, icono('lapiz')),
          h('div', { class: 'derecha' }, h('strong', {}, soles(c.monto)),
            etiquetaEstado ? h('span', { class: 'etiqueta-estado' }, etiquetaEstado) : null)));
        return franja ? [franja, fila] : [fila];
      }))));
  }
  // Días plegados: se abre solo el que quieras ver. Un estado con pocos consumos (3 o menos) ya sale abierto.
  col.querySelectorAll('ul.dias-plegables').forEach((ul) => {
    const n = ul.querySelectorAll('li[data-fila]').length;
    plegarDias(ul, new Set(n <= 3 ? [...ul.querySelectorAll('li.dia')].map((d) => d.dataset.dia || '') : []));
  });
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
          const ok = cumpleBusqueda(li.dataset.texto, q) && (!conceptoElegido || li.dataset.concepto === conceptoElegido);
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
      col.querySelectorAll('ul.dias-plegables').forEach((ul) => ul.classList.toggle('buscando', !!(q || conceptoElegido)));
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
    pintando = { valor: !caja.checked, tocadas: new Set(), id: ev.pointerId, y: ev.clientY };
    aplicar(caja, pintando.valor);
    try { col.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
  });
  col.addEventListener('pointermove', (ev) => {
    if (!pintando) return;
    // Se marcan todas las filas entre la posición anterior y la actual: si el puntero salta, ninguna se queda sin marcar.
    const arriba = Math.min(pintando.y, ev.clientY), abajo = Math.max(pintando.y, ev.clientY);
    col.querySelectorAll('li[data-fila] input[type="checkbox"]:not(:disabled)').forEach((c) => {
      const r = c.closest('li').getBoundingClientRect();
      if (r.bottom >= arriba && r.top <= abajo) aplicar(c, pintando.valor);
    });
    pintando.y = ev.clientY;
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
    const ordenadas = filas; // en el orden de la hoja (Excel); los controles pueden reordenar
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
        const li = h('li', { class: [f.monto ? '' : 'cero', f.pagado && marcable ? 'pagado' : ''].join(' ').trim(), 'data-nombre': normalizar(nombreLinea(f.concepto)), 'data-marcable': marcable ? '1' : null, 'data-linea': clave === 'gastos' && !f.esTarjeta ? normalizar(nombreLinea(f.concepto)) : null, 'data-plan': String(Math.abs(f.monto || 0)), 'data-fila': String(f.fila || 0), 'data-conceptos': f.conceptos && f.conceptos.length ? JSON.stringify(f.conceptos) : null },
          h('div', { class: 'fila-pres-top' },
            h('span', { class: 'fila-pres-nombre' },
              marcable ? botonFijo(f, d.mes, (x) => { li.classList.toggle('pagado', !!x.pagado); nota.textContent = x.pagado ? (x.pagadoNota || '') : ''; pintarResumenFijos(); }) : null,
              h('span', { title: f.concepto }, nombreLinea(f.concepto), marcable ? nota : null)),
            h('span', {}, f.monto && total && clave !== 'gastos' ? h('small', { class: 'pct' }, `${Math.round((f.monto / total) * 100)}%`) : null,
              motorNuevo() && clave !== 'ingresos' && f.fila && !f.esTarjeta && !(f.monto < 0) && emailSesion()
                ? h('button', { type: 'button', class: 'monto-editable', title: 'Clic para cambiar el monto', 'aria-label': `Cambiar monto de ${nombreLinea(f.concepto)}, ahora ${soles(f.monto)}`,
                  onclick: (ev) => editarEnLinea(ev.currentTarget, d.mes, f) }, soles(f.monto))
                : soles(f.monto))),
          h('div', { class: 'barra-pres', 'aria-hidden': 'true' }, clave === 'gastos' ? null : h('i', { 'data-w': `${Math.round((Math.abs(f.monto || 0) / max) * 100)}%` })));
        return li;
      })));
  };

  // Lo gastado de verdad en el mes, por concepto: se cruza con cada línea del plan que tenga el mismo nombre.
  const pintarLlevas = (raizPres) => cargarRapido('tarjetas', { hoy: hoyISO(), incluirPagados: true }, 'tarjetas-todo').then((rt) => {
    const real = gastadoEnCiclo(rt?.datos?.tarjetas, d.mes);
    const ciclo = cicloDelMes(d.mes);
    if (!raizPres.querySelector('.nota-ciclo')) {
      const textoCiclo = `Lo gastado cuenta del ${fechaCorta(ciclo.desde)} al ${fechaCorta(ciclo.hasta)}: se paga con el sueldo de ${(nombreMesClave(d.mes) || '').split(' ')[0].toLowerCase()}. Lo que sale del sobrante o de un ahorro no cuenta aquí.`;
      raizPres.querySelector('.pres-controles, .panel-cab')?.after(h('p', { class: 'suave nota-ciclo' }, textoCiclo));
      raizPres.querySelector('.seccion-gastos .panel-cab h2')?.setAttribute('title', textoCiclo);
    }
    raizPres.querySelectorAll('li[data-linea]').forEach((li) => {
      const linea = li.dataset.linea; const plan = Number(li.dataset.plan) || 0;
      if (!linea || !plan || li.querySelector('.llevas')) return;
      // Con conceptos asignados a la línea (Configuración › Presupuesto) se suman esos; si no, por nombre parecido.
      let gastado = null;
      if (li.dataset.conceptos) {
        try { gastado = JSON.parse(li.dataset.conceptos).reduce((s, c) => s + (real.get(normalizar(c)) || 0), 0); } catch { gastado = null; }
      }
      if (gastado === null) {
        const clave = [...real.keys()].find((k) => k === linea || (linea.length >= 5 && k.startsWith(linea)) || (k.length >= 5 && linea.startsWith(k)));
        if (!clave) return;
        gastado = real.get(clave);
      }
      const pct = (gastado / plan) * 100;
      const tono = pct > 100 ? 'pasado' : pct >= 80 ? 'justo' : 'bien';
      // La barra es lo usado de lo planeado (llena = se gastó todo). Sin gasto, no se escribe nada.
      li.querySelector('.fila-pres-nombre > span:last-child')?.append(gastado > 0
        ? h('small', { class: `llevas ${tono}` }, pct > 100 ? `Te pasaste: ${soles(gastado)} de ${soles(plan)}` : `Usado ${soles(gastado)} · quedan ${soles(plan - gastado)}`)
        : h('small', { class: 'llevas vacio', hidden: true }));
      li.title = `${nombreLinea(li.querySelector('.fila-pres-nombre [title]')?.title || '')}: usado ${soles(gastado)} de ${soles(plan)}`;
      const barra = li.querySelector('.barra-pres');
      if (barra && gastado > 0) { const b = h('b', { class: `real ${tono}` }); barra.append(b); requestAnimationFrame(() => requestAnimationFrame(() => { b.style.width = `${Math.min(100, pct)}%`; })); }
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
    { etiqueta: 'Sobra', valor: libre, clase: 'r-libre' },
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
  const totTarjetas = (d.filas || []).filter((f) => f.seccion === 'gastos' && f.esTarjeta).reduce((sum, f) => sum + Math.max(0, Number(f.monto) || 0), 0);
  const partesFlujo = [
    { etiqueta: 'Tarjetas', valor: totTarjetas, clase: 'pf-tc' },
    { etiqueta: 'Gastos', valor: Math.max(0, (tot.gastos || 0) - totTarjetas), clase: 'pf-gasto' },
    { etiqueta: 'Ahorros', valor: Math.max(0, tot.ahorros || 0), clase: 'pf-ahorro' },
    { etiqueta: 'Sobra', valor: Math.max(0, tot.saldo || 0), clase: 'pf-sobra' },
  ];
  const flujo = sinIngresos ? null : h('div', { class: 'pres-flujo' },
    h('p', { class: 'pf-titulo' }, `Así se reparten los ${soles(tot.ingresos)} que entran`),
    barraPartes(partesFlujo),
    h('ul', { class: 'pf-leyenda' }, partesFlujo.filter((x) => x.valor > 0).map((x) => h('li', {},
      h('i', { class: `pf-punto ${x.clase}`, 'aria-hidden': 'true' }), h('span', {}, x.etiqueta), h('strong', {}, soles(x.valor)),
      h('small', {}, `${Math.round((x.valor / tot.ingresos) * 100)}%`)))));
  const hero = h('section', { class: 'hero hero-meses' }, heroFondo(),
    sinIngresos
      ? h('div', { class: 'hero-principal' },
        h('p', { class: 'hero-etq' }, `Sobra en ${mesNombre}`),
        h('p', { class: 'hero-vacio' }, `${nombreMesClave(d.mes) || 'Este mes'} aún no tiene ingresos cargados.`))
      : h('div', { class: 'hero-principal' },
        h('p', { class: 'hero-etq' }, `Sobra en ${mesNombre}`),
        h('p', { class: 'hero-monto', 'data-rico': '', 'data-contar': String(tot.saldo || 0) }, soles(0)),
         h('p', { class: 'hero-personal' }, h('span', { class: 'avatares' }, responsables().map((nombre) => avatar(nombre))),
          h('span', {}, h('strong', {}, soles(tot.saldoPersonal)), ' para cada uno'))),
    h('div', { class: 'meses-barras', role: 'group', 'aria-label': 'Lo que sobra o falta cada mes' },
      h('div', { class: 'mb-cab' }, h('span', { class: 'mb-titulo' }, 'Lo que sobra o falta cada mes'), leyendaMeses),
      plano),
    h('ul', { class: 'hero-datos' },
      heroDato('sube', 'Lo que entra', soles(tot.ingresos), deltas.ingresos),
      heroDato('baja', 'Gastos', soles(tot.gastos), deltas.gastos),
      heroDato('billetera', 'Ahorros', soles(tot.ahorros), deltas.ahorros),
      heroDato('check', 'Sobra', soles(libre), deltas.saldo)),
    flujo);

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
    seccion('ingresos', 'Lo que entra', 'Total que entra', tot.ingresos),
    seccion('ahorros', 'Ahorros', 'Total ahorros', tot.ahorros),
    seccion('gastos', 'Gastos', 'Total gastos', tot.gastos),
  ];
  secciones.forEach((el, i) => { if (el) { el.classList.add('revelar'); el.style.setProperty('--i', String(i)); } });

  if (secciones[2]) { pintarLlevas(secciones[2]); controlesGastos(secciones[2]); }
  // Ahorros: una sola lista por meta. De cada una se ve cuánto lleva guardado en total, cuánto se puso este mes
  // (se cambia con un clic) y en cuántos meses se aportó. Arriba, lo ahorrado este mes y el total guardado.
  if (secciones[1] && motorNuevo()) {
    if (motorV120() && emailSesion() && !leerCache('antojos')) cargarRapido('antojos', {}, 'antojos').catch(() => null);
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
      // Lo que ya se sacó de cada ahorro (gastos anotados con "De dónde sale: <ahorro>"): se resta de lo guardado.
      const bolsasAh = motorBolsas() ? (bolsasGuardadas()?.ahorros || []) : [];
      const usadoPor = new Map(bolsasAh.map((x) => [normalizar(nombreLinea(x.meta)), Number(x.retirado) || 0]));
      const usadoDe = ({ f, m }) => usadoPor.get(normalizar(nombreLinea(f?.concepto || m.concepto))) || 0;
      const usadoTotal = metas.reduce((x, y) => x + usadoDe(y), 0);
      const queda = total - usadoTotal;
      const mayor = Math.max(...metas.map((y) => y.m.acumulado || 0), 1);
      const editable = emailSesion();
      // Se quita lo anterior (lista del mes, estado vacío y etiquetas sueltas) y queda solo la cabecera.
      [...sec.children].forEach((el) => { if (!el.classList.contains('panel-cab')) el.remove(); });
      sec.classList.remove('sin-ahorro');
      sec.append(
        h('div', { class: 'ahorro-resumen' },
          h('div', {}, h('span', { class: 'suave' }, 'Este mes'), h('strong', { 'data-contar': String(delMes) }, soles(0))),
          h('div', {}, h('span', { class: 'suave' }, usadoTotal > 0 ? 'Queda guardado' : 'Guardado en total'),
            h('strong', { class: 'ahorro-total' + (queda < 0 ? ' mal' : ''), 'data-contar': String(Math.abs(queda)) }, soles(0)),
            usadoTotal > 0 ? h('small', { class: 'suave ahorro-usado' }, `${soles(total)} guardado · ${soles(usadoTotal)} usado`) : null)),
        h('ul', { class: 'metas' }, metas.sort((a, b) => (b.m.acumulado || 0) - (a.m.acumulado || 0)).map(({ f, m }, k) => {
          const aportes = (m.meses || []).filter((x) => x.monto > 0);
          const nombre = nombreLinea(f?.concepto || m.concepto);
          const vacia = !(m.acumulado > 0);
          const usado = usadoDe({ f, m });
          const plan = m.meta || null;
          const aporte = f ? (f.monto || 0) : (m.delMes || 0);
          const tMeta = plan ? textoMeta(plan, aporte) : null;
          const botonMeta = motorMetas() && editable ? h('button', { type: 'button', class: 'chip-meta' + (plan ? ' con-meta' : ''), title: plan ? 'Cambiar la meta' : 'Ponerle una meta con fecha',
            onclick: () => abrirMeta({ concepto: f?.concepto || m.concepto, disponible: Number(m.disponible ?? m.acumulado) || 0, aporteMes: aporte, mes: d.mes,
              actual: plan ? { objetivo: plan.objetivo, fecha: plan.fecha } : null }, () => navegar({ silencioso: true })) },
            icono('meta'), plan ? `${soles(plan.objetivo)} · ${mesCorto(plan.fecha)}` : 'Ponle meta') : null;
          // v168: todas iguales: nombre arriba, monto grande, barra y abajo "Este mes" a la izquierda y la meta a la derecha.
          return h('li', { class: vacia ? 'meta aho vacia' : 'meta aho', style: `--i: ${k}`, title: aportes.map((x) => `${x.etiqueta}: ${soles(x.monto)}`).join('\n') },
            h('div', { class: 'aho-cab' }, h('span', { class: 'aho-ico', 'aria-hidden': 'true' }, icono('billetera')), h('span', { class: 'aho-nombre', title: nombre }, nombre)),
            h('strong', { class: 'aho-monto', 'data-contar': String(Math.max(0, (m.acumulado || 0) - usado)) }, soles(0)),
            usado > 0 ? h('small', { class: 'suave meta-usado' }, `Guardado ${soles(m.acumulado || 0)} · usado ${soles(usado)}`) : null,
            h('div', { class: 'gp-barra' + (plan ? ' hacia-meta' : '') }, h('i', { 'data-w': `${Math.round(plan ? plan.pct : ((m.acumulado || 0) / mayor) * 100)}%` })),
            plan ? h('div', { class: 'meta-avance' }, h('span', { class: 'suave' }, `${Math.floor(plan.pct)} % · faltan ${soles(plan.faltan)}`), h('span', { class: `meta-estado ${tMeta.clase}` }, tMeta.texto)) : null,
            (() => {
              const an = motorV120() ? leerCache('antojos')?.datos : null;
              if (!plan || !(plan.faltan > 0) || !(an?.promedioMensual > 0)) return null;
              const extra = Math.round(an.promedioMensual * 0.2);
              const con = Math.ceil(plan.faltan / (aporte + extra));
              const sin = aporte > 0 ? Math.ceil(plan.faltan / aporte) : null;
              if (sin !== null && con >= sin) return null;
              return h('small', { class: 'meta-antojos' }, icono('meta'), sin !== null
                ? ` Si bajan los antojos 20 % (+${soles(extra)} al mes), llegan en ${con} ${con === 1 ? 'mes' : 'meses'} en vez de ${sin}.`
                : ` Con el 20 % de los antojos (${soles(extra)} al mes) llegan en ${con} ${con === 1 ? 'mes' : 'meses'}.`);
            })(),
            h('div', { class: 'aho-pie' },
              h('span', { class: 'aho-este' }, h('small', {}, 'Este mes'),
                f && editable && !(f.monto < 0)
                  ? h('button', { type: 'button', class: 'monto-editable', title: 'Clic para cambiar lo de este mes', 'aria-label': `Cambiar el ahorro de este mes en ${nombre}`, onclick: (ev) => editarEnLinea(ev.currentTarget, d.mes, f) }, soles(f.monto || 0))
                  : h('b', {}, soles(m.delMes || 0))),
              botonMeta));
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
  if (ahora === 'movimientos' || ahora === 'confirmar') return 'adelante';
  if (antes === 'movimientos' || antes === 'confirmar') return 'atras';
  if (ahora.startsWith('configuracion-')) return antes.startsWith('configuracion') ? 'adelante' : 'adelante';
  if (antes.startsWith('configuracion-')) return 'atras';
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

const RUTAS = { movimientos: vistaMovimientos, inicio: vistaInicio, registrar: vistaRegistrar, tarjetas: vistaTarjetas, presupuesto: vistaPresupuesto, configuracion: vistaConfiguracion };

function marcarNav(ruta) {
  const base = ruta.startsWith('tarjeta') ? 'tarjetas' : (ruta === 'movimientos' || ruta === 'confirmar') ? 'inicio' : ruta.startsWith('configuracion') ? 'configuracion' : ruta;
  document.querySelectorAll('.barra-nav a').forEach((a) => {
    if (a.dataset.ruta === base) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.ruta = base;
  const titulos = { inicio: 'Inicio', tarjetas: 'Tarjetas', registrar: 'Nuevo gasto', presupuesto: 'Presupuesto', movimientos: 'Movimientos', configuracion: 'Configuración', confirmar: 'Por confirmar' };
  document.title = SOLO_GASTO ? 'FinFamily Gasto' : `${titulos[ruta] || titulos[base] || 'Inicio'} · FinFamily`;
  moverIndicador();
}

async function navegar(opciones) {
  const silencioso = opciones?.silencioso === true; // (los eventos del navegador también llegan aquí como argumento)
  estado.silencioso = silencioso; // las pantallas lo consultan mientras se arman (p. ej. para no repetir entradas animadas)
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
  if (ruta.startsWith('configuracion-')) { fn = vistaConfiguracion; arg = ruta.slice('configuracion-'.length); }
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
    if (!nodo && !vista.querySelector('.arranque')) mostrar(cargando(ruta));
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
  animarTextoCarga(vista.querySelector('.arranque-texto'), ['Abriendo FinFamily…', ...textosCarga(location.hash.slice(1) || 'inicio')]);
  aplicarApariencia();
  try { aplicarCatalogo(); } catch { /* sin catálogo todavía */ }
  aplicarMenu();
  // Gasto rápido (gasto.html): en el celular, su diseño propio de una columna; en computadora, el mismo diseño
  // de dos columnas de "Nuevo gasto" de la app, sin menú (v146).
  const mqPc = matchMedia('(min-width: 900px)');
  const ponerModoGasto = () => {
    const pc = SOLO_GASTO && mqPc.matches;
    document.body.classList.toggle('solo-gasto', SOLO_GASTO && !pc);
    document.body.classList.toggle('gasto-pc', pc);
  };
  ponerModoGasto();
  if (SOLO_GASTO) mqPc.addEventListener?.('change', ponerModoGasto);
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
  // Al abrir: si lo publicado es más nuevo que esta copia (GitHub tardó y se abrió la guardada), se recarga sola una vez.
  setTimeout(async () => {
    try {
      const txt = await fetch(`./sw.js?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
      const publicada = (txt.match(/finfamily-v\d+/) || [])[0];
      if (!publicada || publicada === VERSION_APP) return;
      let ya = false;
      try { ya = Date.now() - Number(sessionStorage.getItem('ff:recargo') || 0) < 120000; } catch { /* nada */ }
      if (ya || hayEdicionAbierta() || document.querySelector('dialog[open]')) return;
      try { sessionStorage.setItem('ff:recargo', String(Date.now())); } catch { /* nada */ }
      await estado.registroSW?.update?.().catch(() => {});
      setTimeout(() => location.reload(), 1500); // deja que el service worker nuevo guarde los archivos
    } catch { /* sin red: se queda la que hay */ }
  }, 2500);
  if ('serviceWorker' in navigator) {
    // Si la app ya estaba abierta cuando se publicó una versión nueva, se avisa con un botón para actualizar.
    const habiaVersion = !!navigator.serviceWorker.controller;
    const abiertaDesde = Date.now();
    navigator.serviceWorker.register('./sw.js').then((reg) => { estado.registroSW = reg; }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaVersion) return;
      // Recién abierta: pudo cargar la versión anterior guardada (si GitHub tardó). Se recarga sola una vez, si no hay nada a medio editar.
      if (Date.now() - abiertaDesde < 60000) {
        let ya = false;
        try { ya = Date.now() - Number(sessionStorage.getItem('ff:recargo') || 0) < 120000; sessionStorage.setItem('ff:recargo', String(Date.now())); } catch { /* nada */ }
        if (!ya && !hayEdicionAbierta() && !document.querySelector('dialog[open]')) { location.reload(); return; }
      }
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
      const versionAntes = versionMotor().texto;
      try { localStorage.setItem('ff:motor', r?.version || ''); } catch { /* nada */ }
      // Motor recién actualizado: la pantalla se vuelve a pintar para mostrar lo nuevo sin salir y volver.
      if ((r?.version || '') && r.version !== versionAntes) setTimeout(() => navegar({ silencioso: true }), 300);
      if (motorLector() && emailSesion()) {
        llamarApi('datosTarjetas', {}, { email: emailSesion() }).then((d) => {
          const t = d?.tarjetas || {};
          let cambio = false;
          for (const id of Object.keys(t)) {
            const local = datosTC(id);
            const delMotor = Object.fromEntries(Object.entries(t[id] || {}).filter(([, v]) => v !== '' && v != null));
            const nuevo = { ...local, ...delMotor };
            if (JSON.stringify(nuevo) !== JSON.stringify(local)) { guardarDatosTC(id, nuevo); cambio = true; }
          }
          if (cambio) navegar({ silencioso: true });
        }).catch(() => { /* se queda lo local */ });
      }
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
