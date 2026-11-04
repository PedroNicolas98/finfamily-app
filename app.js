// FinFamily: pantallas, navegación por hash y sincronización.
import * as api from './api.js';
import * as cola from './cola.js';

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
  inicio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  tarjetas: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  presupuesto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  adelante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
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

// Anima un número de 0 al valor final (respeta "reducir movimiento").
function contar(el, valor) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(valor)) { el.textContent = soles(valor); return; }
  const t0 = performance.now(); const dur = 900;
  const paso = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = soles(valor * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Tras pintar una pantalla: barras que crecen y montos que cuentan.
function animarVista(raiz) {
  raiz.querySelectorAll('[data-contar]').forEach((el) => contar(el, Number(el.dataset.contar)));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    raiz.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w; });
  }));
}

function pastillaVence(vence) {
  if (!vence) return h('span', { class: 'tc-pastilla' }, 'Sin fecha');
  const dias = diasEntre(hoyISO(), vence);
  if (dias < 0) return h('span', { class: 'tc-pastilla vencida' }, `Vencida · ${fechaCorta(vence)}`);
  if (dias === 0) return h('span', { class: 'tc-pastilla pronto' }, 'Vence hoy');
  if (dias <= 7) return h('span', { class: 'tc-pastilla pronto' }, `Vence en ${dias} día${dias === 1 ? '' : 's'}`);
  return h('span', { class: 'tc-pastilla' }, `Vence ${fechaCorta(vence)}`);
}

function tarjetaVisual(t, enlace = true) {
  const esHormiga = t.id === 'HORMIGA';
  const duenio = DUENIO_TC[t.id] || (t.responsable ? String(t.responsable).split(' ')[0] : '');
  return h(enlace ? 'a' : 'div', { class: `tc tc-${t.id}`, href: enlace ? `#tarjeta-${t.id}` : null },
    h('div', { class: 'tc-arriba' },
      h('div', {}, h('div', { class: 'tc-nombre' }, NOMBRE_TC[t.id] || t.nombre),
        duenio ? h('div', { class: 'tc-duenio' }, duenio) : esHormiga ? h('div', { class: 'tc-duenio' }, 'Yape, Plin y efectivo') : null),
      esHormiga ? null : h('span', { class: 'tc-chip', 'aria-hidden': 'true' })),
    h('div', { class: 'tc-abajo' },
      h('div', {}, h('div', { class: 'tc-etq' }, esHormiga ? 'Este mes' : 'Por pagar'),
        h('div', { class: 'tc-monto' }, soles(t.pendiente))),
      esHormiga ? null : t.pendiente > 0 ? pastillaVence(t.proximoVence) : h('span', { class: 'tc-pastilla' }, 'Al día')));
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
  selTarjeta: null,
  seleccion: new Set(),
  mensajeTarjeta: null,
  form: null,
  oneTapIntentado: false,
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
    const d = await api.llamar(accion, datos);
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

// Variante rápida: usa lo guardado al instante y actualiza por detrás.
async function cargarRapido(accion, datos, clave) {
  const c = leerCache(clave);
  if (c) {
    cargar(accion, datos, clave).catch(() => {});
    return { datos: c.datos, ts: null };
  }
  return cargar(accion, datos, clave);
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
    res = await cola.procesar(api.llamar, yo);
    if (res.detenido === 'no_autorizado') estado.pideLogin = true;
  } catch { /* se reintenta luego */ }
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

function pintarAvisos() {
  const partes = [];
  if (!navigator.onLine || estado.tsDatos) {
    partes.push(h('div', { class: 'aviso', role: 'status' }, textoDatosGuardados()));
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
  if (pendientes) {
    partes.push(h('div', { class: 'aviso aviso-cola', role: 'status' },
      pendientes === 1 ? '1 movimiento en espera de envío' : `${pendientes} movimientos en espera de envío`));
  }
  if (revisar) {
    partes.push(h('a', { class: 'aviso aviso-revisar', href: '#inicio', onclick: (ev) => { ev.preventDefault(); irARevisar(); } },
      revisar === 1 ? '1 gasto por revisar' : `${revisar} gastos por revisar`));
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

function cargando() {
  return h('div', { class: 'pantalla cargando', 'aria-busy': 'true' },
    h('div', { class: 'esqueleto alto' }), h('div', { class: 'esqueleto' }), h('div', { class: 'esqueleto' }));
}

function dato(etiqueta, valor) {
  return h('div', { class: 'dato' }, h('span', { class: 'etiqueta' }, etiqueta), h('strong', {}, soles(valor)));
}

// Reemplaza una zona por una confirmación en la misma pantalla.
function confirmarEnLinea(zona, texto, etiquetaSi, alConfirmar) {
  const previo = [...zona.childNodes];
  const cancelar = () => zona.replaceChildren(...previo);
  const si = h('button', { type: 'button', class: 'boton primario', onclick: async () => {
    si.disabled = true; no.disabled = true; si.textContent = 'Procesando…';
    await alConfirmar();
  } }, etiquetaSi);
  const no = h('button', { type: 'button', class: 'boton', onclick: cancelar }, 'Cancelar');
  zona.replaceChildren(h('div', { class: 'confirmacion', role: 'alertdialog', 'aria-live': 'polite' },
    h('p', {}, texto), h('div', { class: 'acciones' }, si, no)));
  si.focus();
}

function pantallaLogin(mensaje) {
  const boton = h('div', { class: 'boton-google' });
  const raiz = h('div', { class: 'pantalla login' },
    h('img', { src: 'iconos/icono.svg', alt: '', class: 'logo', width: '72', height: '72' }),
    h('h1', {}, 'FinFamily'),
    h('p', { class: 'suave' }, mensaje || 'Ingresa con tu cuenta de Google para ver y registrar tus gastos.'),
    boton,
    h('button', { type: 'button', class: 'boton enlace', onclick: () => navegar() }, 'Volver a intentar'));
  api.renderBoton(boton).then((ok) => {
    if (!ok) boton.replaceChildren(h('p', { class: 'suave' }, 'No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'));
  });
  // Ofrece también One Tap una vez por visita a esta pantalla.
  if (!mensaje && !api.tokenVigente() && !estado.oneTapIntentado) {
    estado.oneTapIntentado = true;
    api.renovar().then(async () => { estado.pideLogin = false; await procesarCola(); navegar(); }).catch(() => {});
  }
  return raiz;
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
  const texto = e?.codigo === 'sin_conexion'
    ? 'Sin conexión y todavía no hay datos guardados en este equipo.'
    : (e?.message || 'Ocurrió un error.');
  return h('div', { class: 'pantalla' },
    h('div', { class: 'vacio' }, h('p', {}, texto),
      h('button', { type: 'button', class: 'boton', onclick: () => navegar() }, 'Reintentar')));
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
      h('span', {}, `${d.filas.length} consumo(s)`)));
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
    confirmarEnLinea(zona, 'Se descartará y no se guardará en el Sheets.', 'Sí, descartar', async () => {
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

// ---------- Pantalla: Inicio ----------

async function vistaInicio() {
  const r = await cargar('inicio', { hoy: hoyISO() }, 'inicio');
  marcarDatos(r);
  const d = r.datos;
  const p = d.presupuesto;
  const raiz = h('div', { class: 'pantalla inicio' });
  const nombre = d.usuario?.nombre || '';
  const hoy = new Date();
  const fechaHoy = hoy.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

  raiz.append(h('div', { class: 'barra-sup' },
    h('div', { class: 'marca' }, h('img', { src: 'iconos/icono.svg', alt: '' }), 'FinFamily'),
    h('span', { class: 'avatar', title: api.emailGuardado() || '' }, (nombre[0] || '?').toUpperCase())));

  raiz.append(h('header', { class: 'cabecera saludo' },
    h('p', { class: 'sobretitulo' }, fechaHoy),
    h('h1', {}, `Hola, ${nombre.split(' ')[0]}`)));

  if (p) {
    const pct = p.ingresos > 0 ? Math.min(100, Math.round((p.gastos / p.ingresos) * 100)) : 0;
    raiz.append(h('section', { class: 'hero' },
      h('p', { class: 'etiqueta' }, `Saldo de ${(nombreMesClave(d.mes) || '').split(' ')[0].toLowerCase()}`),
      h('p', { class: 'monto-grande' + (p.saldo < 0 ? ' negativo' : ''), 'data-contar': String(p.saldo) }, soles(0)),
      h('p', { class: 'hero-sub' }, `${pct}% de los ingresos ya está comprometido`),
      h('div', { class: 'hero-barra', 'aria-hidden': 'true' }, h('i', { 'data-w': `${pct}%` })),
      h('div', { class: 'hero-pie' },
        h('div', { class: 'hero-dato' }, icono('sube'), h('div', {}, h('span', {}, 'Ingresos'), h('strong', {}, soles(p.ingresos)))),
        h('div', { class: 'hero-dato' }, icono('baja'), h('div', {}, h('span', {}, 'Gastos'), h('strong', {}, soles(p.gastos))))),
      h('span', { class: 'hero-personal' }, `Saldo personal: ${soles(p.saldoPersonal)} c/u`)));
  } else {
    raiz.append(h('section', { class: 'tarjeta' },
      h('p', { class: 'suave' }, `${d.etiquetaMes || 'Este mes'} todavía no está en el presupuesto.`)));
  }

  const alertas = d.alertas || [];
  if (alertas.length) {
    raiz.append(h('section', { class: 'bloque bloque-alertas' }, h('h2', {}, 'Para revisar'),
      h('ul', { class: 'lista' }, alertas.map((a) => {
        const dias = diasEntre(hoyISO(), a.vence);
        const texto = a.tipo === 'vencida'
          ? `Venció el ${fechaLarga(a.vence)}${dias < 0 ? ` · hace ${-dias} día${dias === -1 ? '' : 's'}` : ''}`
          : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días · ${fechaLarga(a.vence)}`;
        return h('li', {}, h('a', { class: 'tarjeta alerta ' + a.tipo, href: `#tarjeta-${a.tarjeta}` },
          h('span', { class: 'alerta-ico' }, icono('alerta')),
          h('div', { class: 'alerta-txt' }, h('strong', {}, NOMBRE_TC[a.tarjeta] ? `${NOMBRE_TC[a.tarjeta]}${DUENIO_TC[a.tarjeta] ? ' · ' + DUENIO_TC[a.tarjeta] : ''}` : a.nombre),
            h('p', { class: 'suave' }, texto)),
          h('strong', {}, soles(a.monto))));
      }))));
  }

  const tarjetas = (d.tarjetas || []).filter((t) => t.id !== 'HORMIGA');
  const hormiga = (d.tarjetas || []).find((t) => t.id === 'HORMIGA');
  const ordenadas = [...tarjetas].sort((a, b) => (b.pendiente > 0) - (a.pendiente > 0)
    || String(a.proximoVence || '9').localeCompare(String(b.proximoVence || '9')));
  raiz.append(h('section', { class: 'bloque bloque-tarjetas' },
    h('div', { class: 'bloque-cab' },
      h('div', {}, h('h2', {}, 'Tus tarjetas'), h('p', { class: 'suave' }, `${soles(d.totalPorPagar)} por pagar en total`)),
      h('a', { href: '#tarjetas' }, 'Ver todas')),
    h('div', { class: 'carrusel' }, ordenadas.map((t) => tarjetaVisual(t)), hormiga ? tarjetaVisual(hormiga) : null)));

  raiz.append(h('a', { class: 'cta-registrar', href: '#registrar' },
    icono('mas'), h('span', {}, 'Registrar un gasto'), h('span', {}, 'Tarjeta, Yape o efectivo')));

  const revisar = seccionRevisar();
  if (revisar) raiz.append(revisar);

  raiz.append(h('div', { class: 'pie' },
    h('span', { class: 'suave' }, api.emailGuardado()),
    h('button', { type: 'button', class: 'boton enlace', onclick: (ev) => {
      const zona = ev.currentTarget.parentElement;
      const enEspera = estado.cola.length;
      confirmarEnLinea(zona,
        enEspera ? `Hay ${enEspera} movimiento(s) sin enviar en este equipo; se enviarán cuando vuelvas a entrar con esta misma cuenta.` : '¿Cerrar sesión en este equipo?',
        'Cerrar sesión', async () => {
          borrarCaches();
          api.cerrarSesion();
          estado.tsDatos = null;
          estado.cola = [];
          estado.filasEnEspera = new Set();
          vista.replaceChildren(pantallaLogin('Sesión cerrada.'));
          pintarAvisos();
        });
    } }, 'Cerrar sesión')));
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
  });

  const botonesMedio = medios.map((m) => h('button', { type: 'button', class: 'opcion', 'data-id': m.id,
    'aria-pressed': String(f.medio === m.id), onclick: () => {
      f.medio = m.id;
      try { localStorage.setItem('ff:medio', m.id); } catch { /* nada */ }
      botonesMedio.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === m.id)));
      actualizarPrevia();
    } }, h('span', { class: `punto tc-${m.id === 'TC_IBK' ? (idCicloDeMedio(m, usuario) || 'IBK_P') : (COLOR_MEDIO[m.id] || 'HORMIGA')}`, 'aria-hidden': 'true' }), m.etiqueta));

  const inDesc = h('input', { id: 'descripcion', type: 'text', maxlength: '120', autocomplete: 'off',
    placeholder: 'Ej. Plaza Vea, almuerzo, taxi', value: f.descripcion, enterkeyhint: 'done' });

  const botonesConcepto = conceptos.map((c) => h('button', { type: 'button', class: 'opcion chica', 'data-c': c,
    'aria-pressed': String(f.concepto === c), onclick: () => {
      f.concepto = c; f.conceptoManual = true; pintarConceptos(); sugerencia.textContent = '';
    } }, catIco(c), c));
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
    if (!m) { vistaPrevia.textContent = 'Elige el medio de pago.'; return; }
    if (m.tipo !== 'tarjeta') {
      vistaPrevia.textContent = `Va a: ${m.hoja} · ${m.etiqueta} · queda como pagado`;
      return;
    }
    const idc = idCicloDeMedio(m, usuario);
    const { pago, vence } = calcularCiclo(idc, f.fecha, ciclos);
    vistaPrevia.textContent = vence
      ? `Va a: ${m.hoja} · pago ${fechaLarga(pago)} · vence ${fechaLarga(vence)}`
      : `Va a: ${m.hoja} · sin fecha de pago`;
  }

  const btnGuardar = h('button', { type: 'submit', class: 'boton primario grande' }, 'Guardar');

  const form = h('form', { class: 'formulario', novalidate: true },
    h('label', { class: 'campo-monto-caja', for: 'monto' }, h('span', { class: 'moneda' }, 'S/'), inMonto),
    h('fieldset', {}, h('legend', {}, 'Medio de pago'), h('div', { class: 'opciones' }, botonesMedio)),
    h('div', { class: 'campo' }, h('label', { for: 'descripcion' }, 'Descripción'), inDesc, sugerencia),
    h('fieldset', { class: 'f-conceptos' }, h('legend', {}, 'Concepto'), h('div', { class: 'opciones chicas' }, botonesConcepto)),
    h('div', { class: 'fila-dos' },
      h('div', { class: 'campo' }, h('label', { for: 'fecha' }, 'Fecha'), inFecha),
      h('div', { class: 'campo' }, h('label', { for: 'nota' }, 'Nota'), inNota)),
    vistaPrevia,
    msg,
    btnGuardar);

  // Muestra en 'msg' lo que pasó con el envío de un gasto (también tras 'Guardar igual').
  function mostrarResultado(datos, res) {
    const r = res?.resultados?.[datos.idCliente];
    if (r?.tipo === 'enviado') {
      msg.className = 'mensaje ok';
      msg.replaceChildren(r.datos?.duplicadoId
        ? `Ya estaba guardado en ${r.datos.hoja}.`
        : `Guardado en ${r.datos?.hoja || 'el Sheets'}: ${datos.descripcion}, ${soles(datos.monto)}.`);
    } else if (r?.tipo === 'revisar') {
      const c = r.datos?.coincidencia || {};
      const zona = h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'boton primario', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          await cola.confirmarDuplicado(datos.idCliente);
          msg.className = 'mensaje';
          msg.replaceChildren('Enviando al Sheets…');
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
      msg.replaceChildren('No se pudo guardar en este equipo: no cierres la app hasta que vuelva la señal.');
    } else {
      msg.className = 'mensaje';
      msg.replaceChildren(
        res?.detenido === 'no_autorizado' ? 'Guardado en este equipo. Inicia sesión para enviarlo.'
          : res?.detenido === 'otro_usuario' ? 'Guardado en este equipo. Se enviará cuando entres con tu cuenta.'
            : 'Guardado en este equipo. Se enviará cuando vuelva la señal.');
    }
  }

  let ultimoEnvio = 0;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Recalcula 'hoy' y 'mañana' por si la app quedó abierta desde otro día.
    manana = iso(new Date(Date.now() + 86400000));
    inFecha.max = manana;
    if (!f.fechaManual) { f.fecha = hoyISO(); inFecha.value = f.fecha; actualizarPrevia(); }
    const monto = leerMonto(f.monto);
    const errores = [];
    if (!monto) errores.push('Escribe un monto mayor a cero.');
    if (!f.medio) errores.push('Elige el medio de pago.');
    if (!f.descripcion.trim()) errores.push('Escribe una descripción.');
    if (!f.concepto) errores.push('Elige un concepto.');
    if (!deISO(f.fecha)) errores.push('Revisa la fecha.');
    else if (f.fecha > manana) errores.push('La fecha no puede ser futura.');
    const email = emailSesion();
    if (!email) errores.push('Inicia sesión para registrar gastos.');
    if (errores.length) {
      msg.className = 'mensaje error';
      msg.replaceChildren(errores[0]);
      if (!monto) inMonto.focus(); else if (!f.descripcion.trim()) inDesc.focus();
      return;
    }
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';
    const datos = {
      idCliente: uuid(), monto, medio: f.medio, concepto: f.concepto,
      descripcion: f.descripcion.trim().slice(0, 120), nota: f.nota.trim().slice(0, 200),
      fecha: f.fecha, confirmarDuplicado: false,
    };
    try {
      await cola.encolar('registrar', datos, email);
    } catch {
      msg.className = 'mensaje error';
      msg.replaceChildren('No se pudo guardar en este equipo. Intenta de nuevo.');
      btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar';
      return;
    }
    // Ya está en la cola: se puede registrar el siguiente mientras se envía.
    Object.assign(f, { monto: '', descripcion: '', concepto: null, conceptoManual: false, nota: '' });
    inMonto.value = ''; inDesc.value = ''; inNota.value = ''; sugerencia.textContent = ''; pintarConceptos();
    btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar';
    const miEnvio = ++ultimoEnvio;
    msg.className = 'mensaje';
    msg.replaceChildren(cola.persistente() ? 'Guardado en este equipo. Enviando al Sheets…' : 'Enviando al Sheets…');
    inMonto.focus();

    const res = await procesarHasta(datos.idCliente);
    if (miEnvio !== ultimoEnvio) return; // ya hay un registro más reciente en pantalla
    mostrarResultado(datos, res);
  });

  actualizarPrevia();
  pintarConceptos();
  const raiz = h('div', { class: 'pantalla' },
    h('header', { class: 'cabecera' }, h('h1', {}, 'Nuevo gasto'),
      usuario?.nombre ? h('p', { class: 'suave' }, `Queda a nombre de ${usuario.nombre.split(' ')[0]} · automático por tu correo`) : null),
    form);
  requestAnimationFrame(() => { if (!f.monto) inMonto.focus({ preventScroll: true }); });
  return raiz;
}

// ---------- Pantalla: Tarjetas ----------

function obtenerTarjetas() {
  return cargar('tarjetas', { hoy: hoyISO(), incluirPagados: false }, 'tarjetas');
}

async function vistaTarjetas() {
  const r = await obtenerTarjetas();
  marcarDatos(r);
  const lista = r.datos.tarjetas || [];
  const total = lista.filter((t) => t.id !== 'HORMIGA').reduce((s, t) => s + (t.pendiente || 0), 0);
  return h('div', { class: 'pantalla' },
    h('header', { class: 'cabecera' }, h('h1', {}, 'Tarjetas'),
      h('p', { class: 'suave' }, `${soles(total)} por pagar entre todas`)),
    lista.length ? h('div', { class: 'lista-tc' }, lista.map((t) => tarjetaVisual(t)))
      : h('p', { class: 'vacio' }, 'No hay tarjetas para mostrar.'));
}

async function vistaTarjeta(id) {
  const r = await obtenerTarjetas();
  marcarDatos(r);
  const t = (r.datos.tarjetas || []).find((x) => x.id === id);
  const volver = h('a', { class: 'volver', href: '#tarjetas' }, icono('atras'), 'Tarjetas');
  if (!t) return h('div', { class: 'pantalla' }, volver, h('p', { class: 'vacio' }, 'No encontramos esta tarjeta.'));

  if (estado.selTarjeta !== id) { estado.selTarjeta = id; estado.seleccion = new Set(); }
  const esHormiga = t.id === 'HORMIGA';
  const enEspera = (c) => estado.filasEnEspera.has(`${t.hoja}#${c.fila}`);
  const marcable = (c) => c.estado !== 'Pagado' && !enEspera(c);

  // En computadora: tarjeta a la izquierda (fija) y consumos a la derecha.
  const col = h('div', { class: 'columna' });
  const raiz = h('div', { class: 'pantalla con-barra detalle' },
    h('aside', { class: 'lateral' }, volver, tarjetaVisual(t, false)), col);

  if (estado.mensajeTarjeta) {
    col.append(h('div', { class: 'mensaje ' + (estado.mensajeTarjeta.tipo || '') , role: 'status' }, estado.mensajeTarjeta.texto));
    estado.mensajeTarjeta = null;
  }

  const todos = [];
  const barra = h('div', { class: 'barra-seleccion', hidden: true });
  const actualizarBarra = () => {
    const sel = todos.filter((c) => estado.seleccion.has(c.fila) && marcable(c));
    if (!sel.length) { barra.hidden = true; barra.replaceChildren(); return; }
    const total = sel.reduce((s, c) => s + c.monto, 0);
    barra.hidden = false;
    barra.replaceChildren(
      h('span', {}, `${sel.length} seleccionado(s) · ${soles(total)}`),
      h('button', { type: 'button', class: 'boton primario', onclick: () => {
        confirmarEnLinea(barra, `Vas a marcar ${sel.length} consumo(s) por ${soles(total)} como pagados.`, 'Marcar pagados',
          () => marcarPagados(t, sel));
      } }, 'Marcar seleccionados'));
  };

  const grupos = t.estados || [];
  if (!grupos.length || grupos.every((g) => !(g.consumos || []).length)) {
    col.append(h('p', { class: 'vacio' }, esHormiga ? 'Sin gastos hormiga este mes.' : 'No hay consumos pendientes.'));
  }

  for (const g of grupos) {
    const consumos = g.consumos || [];
    if (!consumos.length) continue;
    todos.push(...consumos);
    const pendientes = consumos.filter(marcable);
    const titulo = esHormiga ? nombreMesClave(mesActual()) : g.vence ? `Vence ${fechaLarga(g.vence)}` : 'Sin fecha de vencimiento';
    const zona = h('div', { class: 'acciones' });
    if (pendientes.length && !esHormiga) {
      const totalPend = pendientes.reduce((s, c) => s + c.monto, 0);
      zona.append(h('button', { type: 'button', class: 'boton', onclick: () => {
        confirmarEnLinea(zona, `Vas a marcar ${pendientes.length} consumo(s) por ${soles(totalPend)} como pagados.`, 'Marcar pagado',
          () => marcarPagados(t, pendientes));
      } }, 'Marcar estado como pagado'));
    }
    const dias = !esHormiga && g.vence ? diasEntre(hoyISO(), g.vence) : null;
    const pill = dias == null ? null
      : dias < 0 ? h('span', { class: 'estado-pill vencido' }, `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`)
        : dias <= 7 ? h('span', { class: 'estado-pill pronto' }, dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`)
          : h('span', { class: 'estado-pill al-dia' }, `Faltan ${dias} días`);
    col.append(h('section', { class: 'bloque grupo' + (dias != null && dias < 0 && pendientes.length ? ' vencido' : '') },
      h('div', { class: 'grupo-cabecera' },
        h('div', {}, pill, h('h2', {}, titulo),
          !esHormiga && g.pago ? h('p', { class: 'suave' }, `Fecha de pago ${fechaLarga(g.pago)}`) : null),
        h('div', { class: 'derecha' }, h('strong', { class: 'monto-medio' }, soles(esHormiga ? g.total : g.pendiente)),
          !esHormiga && g.total !== g.pendiente ? h('p', { class: 'suave' }, `de ${soles(g.total)}`) : null)),
      h('ul', { class: 'lista consumos' }, consumos.map((c) => {
        const puede = marcable(c) && !esHormiga;
        const caja = h('input', { type: 'checkbox', checked: estado.seleccion.has(c.fila), disabled: !puede,
          'aria-label': `Seleccionar ${c.descripcion}` });
        caja.addEventListener('change', () => {
          if (caja.checked) estado.seleccion.add(c.fila); else estado.seleccion.delete(c.fila);
          actualizarBarra();
        });
        const etiquetaEstado = enEspera(c) ? 'En espera' : c.estado === 'Pagado' ? 'Pagado' : '';
        const sub = [fechaCorta(c.fecha), c.concepto, esHormiga ? c.medio : ''].filter(Boolean).join(' · ');
        return h('li', {}, h('label', { class: 'consumo' + (puede ? '' : ' inactivo'), title: c.descripcion },
          esHormiga ? null : caja,
          catIco(c.concepto),
          h('div', { class: 'consumo-texto' }, h('span', {}, limpiarComercio(c.descripcion)), h('span', { class: 'suave' }, sub)),
          h('div', { class: 'derecha' }, h('strong', {}, soles(c.monto)),
            etiquetaEstado ? h('span', { class: 'etiqueta-estado' }, etiquetaEstado) : null)));
      })),
      zona));
  }
  raiz.append(barra);
  actualizarBarra();
  return raiz;
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
    if (actualizadas || !porMotivo.size) partes.push(`Listo: ${actualizadas} consumo(s) marcados como pagados.`);
    let hayError = false;
    for (const [motivo, n] of porMotivo) {
      if (motivo === 'ya estaba pagado') {
        partes.push(n === 1 ? '1 ya estaba pagado.' : `${n} ya estaban pagados.`);
      } else {
        hayError = true;
        const texto = motivo === 'la fila cambió' ? 'la fila cambió en el Sheets; revisa y vuelve a intentar' : motivo;
        partes.push(n === 1 ? `1 no se marcó: ${texto}.` : `${n} no se marcaron: ${texto}.`);
      }
    }
    return { tipo: hayError ? 'error' : actualizadas ? 'ok' : '', texto: partes.join(' ') };
  }
  if (r?.tipo === 'error') return { tipo: 'error', texto: `${r.error.message} Quedó en "Por revisar".` };
  if (!cola.persistente()) {
    return { tipo: 'error', texto: 'No se pudo guardar en este equipo: no cierres la app hasta que vuelva la señal.' };
  }
  if (res?.detenido === 'no_autorizado') return { tipo: '', texto: 'Quedó guardado en este equipo. Inicia sesión para enviarlo.' };
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
    estado.mensajeTarjeta = { tipo: 'error', texto: 'No se pudo guardar en este equipo. Intenta de nuevo.' };
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
  estado.mensajeTarjeta = { tipo: '', texto: 'Quedó guardado en este equipo. Se está enviando al Sheets…' };
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
    const res = await Promise.allSettled(lote.map((c) => api.llamar('presupuesto', { mes: c })));
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
    r = await cargar('presupuesto', { mes }, 'presupuesto:' + mes);
  } catch (e) {
    if (e.codigo === 'no_autorizado' || e.codigo === 'sin_configurar') throw e;
    const reintentar = h('button', { type: 'button', class: 'boton', onclick: () => { estado.mesPres = mes; navegar(); } }, 'Reintentar');
    if (e.codigo === 'datos_invalidos') {
      if (!meses.length) meses = await buscarMeses(mes);
      // El mes de hoy no está: salta al mes disponible más cercano.
      if (!estado.mesPres && meses.length) {
        const cercano = meses.reduce((a, b) => (Math.abs(cmpMes(b.clave, mes)) < Math.abs(cmpMes(a.clave, mes)) ? b : a));
        if (cercano.clave !== mes) { estado.mesPres = cercano.clave; return vistaPresupuesto(); }
      }
      return h('div', { class: 'pantalla' },
        h('header', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
        selectorMes(meses, mes, nombreMesClave(mes)),
        h('div', { class: 'vacio' },
          h('p', {}, meses.length ? 'Este mes no está en el presupuesto.' : 'Este mes no está en el presupuesto y no se pudo leer la lista de meses.'),
          meses.length ? null : reintentar));
    }
    // Sin señal (u otro error) y este mes no está guardado: se muestra el selector con los meses
    // guardados y la próxima vez Presupuesto vuelve al mes actual.
    estado.mesPres = null;
    return h('div', { class: 'pantalla' },
      h('header', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
      selectorMes(meses, mes, nombreMesClave(mes)),
      h('div', { class: 'vacio' },
        h('p', {}, e.codigo === 'sin_conexion' ? 'Sin conexión: este mes no está guardado en el equipo.' : (e.message || 'Ocurrió un error.')),
        reintentar));
  }
  marcarDatos(r);
  const d = r.datos;
  if (d.meses?.length) guardarCache('meses', d.meses);
  const tot = d.totales || {};
  const seccion = (clave, titulo, totalEtiqueta, total) => {
    const filas = (d.filas || []).filter((f) => f.seccion === clave);
    if (!filas.length && !total) return null;
    const max = Math.max(...filas.map((f) => Math.abs(f.monto || 0)), 1);
    const ordenadas = clave === 'gastos' ? [...filas].sort((a, b) => (b.monto || 0) - (a.monto || 0)) : filas;
    return h('section', { class: `bloque tarjeta seccion-pres seccion-${clave}` },
      h('h2', {}, titulo),
      h('ul', { class: 'filas-pres' }, ordenadas.map((f) => h('li', { class: f.monto ? '' : 'cero' },
        h('div', { class: 'fila-pres-top' }, h('span', {}, f.concepto), h('span', {}, soles(f.monto))),
        h('div', { class: 'barra-pres', 'aria-hidden': 'true' }, h('i', { 'data-w': `${Math.round((Math.abs(f.monto || 0) / max) * 100)}%` }))))),
      h('div', { class: 'linea total' }, h('span', {}, totalEtiqueta), h('strong', {}, soles(total))));
  };
  return h('div', { class: 'pantalla presupuesto' },
    h('header', { class: 'cabecera' }, h('h1', {}, 'Presupuesto')),
    selectorMes(d.meses || meses, d.mes, nombreMesClave(d.mes) || d.etiquetaMes),
    h('section', { class: 'hero' },
      h('p', { class: 'etiqueta' }, 'Saldo / superávit final'),
      h('p', { class: 'monto-grande' + (tot.saldo < 0 ? ' negativo' : ''), 'data-contar': String(tot.saldo) }, soles(0)),
      h('div', { class: 'hero-pie' },
        h('div', { class: 'hero-dato' }, icono('sube'), h('div', {}, h('span', {}, 'Ingresos'), h('strong', {}, soles(tot.ingresos)))),
        h('div', { class: 'hero-dato' }, icono('baja'), h('div', {}, h('span', {}, 'Gastos'), h('strong', {}, soles(tot.gastos))))),
      h('span', { class: 'hero-personal' }, `Saldo personal: ${soles(tot.saldoPersonal)} c/u`)),
    seccion('ingresos', 'Ingresos', 'Total ingresos', tot.ingresos),
    seccion('gastos', 'Gastos', 'Total gastos', tot.gastos),
    seccion('ahorros', 'Ahorros', 'Total ahorros', tot.ahorros));
}

function cmpMes(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
}

function selectorMes(meses, mes, etiqueta) {
  const i = meses.findIndex((m) => m.clave === mes);
  // Si el mes mostrado no está en la lista, se ofrece el más cercano hacia atrás y hacia adelante.
  const anterior = i > 0 ? meses[i - 1] : i < 0 ? [...meses].reverse().find((m) => cmpMes(m.clave, mes) < 0) || null : null;
  const siguiente = i >= 0 ? (i < meses.length - 1 ? meses[i + 1] : null) : meses.find((m) => cmpMes(m.clave, mes) > 0) || null;
  const ir = (m) => () => { estado.mesPres = m.clave; navegar(); };
  return h('div', { class: 'selector-mes' },
    h('button', { type: 'button', class: 'boton icono-solo', disabled: !anterior, 'aria-label': 'Mes anterior',
      onclick: anterior ? ir(anterior) : null }, icono('atras')),
    h('strong', { 'aria-live': 'polite' }, etiqueta),
    h('button', { type: 'button', class: 'boton icono-solo', disabled: !siguiente, 'aria-label': 'Mes siguiente',
      onclick: siguiente ? ir(siguiente) : null }, icono('adelante')));
}

// ---------- Navegación ----------

const RUTAS = { inicio: vistaInicio, registrar: vistaRegistrar, tarjetas: vistaTarjetas, presupuesto: vistaPresupuesto };

function marcarNav(ruta) {
  const base = ruta.startsWith('tarjeta') ? 'tarjetas' : ruta;
  document.querySelectorAll('.barra-nav a').forEach((a) => {
    if (a.dataset.ruta === base) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

async function navegar() {
  const ruta = location.hash.slice(1) || 'inicio';
  const id = ++estado.navId;
  estado.tsDatos = null;
  estado.motivoDatos = null;
  marcarNav(ruta);
  if (!api.configurado()) { vista.replaceChildren(pantallaSinConfig()); return; }
  if (!api.emailGuardado() && !api.tokenVigente() && !leerCache('inicio')) {
    vista.replaceChildren(pantallaLogin());
    pintarAvisos();
    return;
  }
  let fn = RUTAS[ruta];
  let arg;
  if (ruta.startsWith('tarjeta-')) { fn = vistaTarjeta; arg = ruta.slice('tarjeta-'.length); }
  if (!fn) fn = vistaInicio;
  if (ruta !== 'registrar') vista.replaceChildren(cargando());
  let nodo;
  try {
    nodo = await fn(arg);
  } catch (e) {
    nodo = vistaError(e);
  }
  if (id !== estado.navId) return;
  vista.replaceChildren(nodo);
  animarVista(vista);
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
}

function construirNav() {
  const enlace = (ruta, texto, clase = '') => h('a', { href: `#${ruta}`, 'data-ruta': ruta, class: clase },
    icono(ruta === 'registrar' ? 'mas' : ruta), h('span', { class: clase ? 'texto-central' : '' }, texto));
  document.getElementById('nav').replaceChildren(
    enlace('inicio', 'Inicio'),
    enlace('tarjetas', 'Tarjetas'),
    enlace('registrar', 'Registrar gasto', 'central'),
    enlace('presupuesto', 'Presupuesto'));
}

// ---------- Arranque ----------

async function arrancar() {
  construirNav();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.addEventListener('hashchange', navegar);
  window.addEventListener('online', async () => { estado.tsDatos = null; estado.motivoDatos = null; await procesarCola(); navegar(); });
  window.addEventListener('offline', pintarAvisos);
  window.addEventListener('cola-cambio', () => { refrescarCola(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) procesarCola();
  });

  if (api.configurado()) {
    api.iniciarGoogle(async (conectado, desdeBoton) => {
      // Solo el botón de Google vuelve a pintar; las renovaciones las maneja quien las pidió.
      if (!conectado || !desdeBoton) return;
      estado.pideLogin = false;
      await procesarCola();
      navegar();
    });
  }
  await refrescarCola();
  navegar();
  procesarCola();
}

arrancar();
