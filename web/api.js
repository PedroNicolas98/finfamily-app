// Comunicación con la aplicación web de Apps Script y sesión con Google Identity Services.
import { API_URL, CLIENT_ID } from './config.js';

const CLAVE_EMAIL = 'ff:email';
const CLAVE_TOKEN = 'ff:token';
// Llave de sesión del motor (1.9.8): dura meses y se renueva sola; solo se borra con "Cerrar sesión".
const CLAVE_SESION = 'ff:sesion';
const URL_GIS = 'https://accounts.google.com/gsi/client';
const LIMITE_ENVIO_MS = 15000;

// El token se guarda mientras esté vigente; el email se recuerda para el inicio automático.
let token = null;
let expira = 0;
let emailToken = ''; // email del token que está en memoria (sale del JWT)

let gisPromesa = null;
let cargasGis = 0;
let alCambiarSesion = () => {};
let esperando = [];
let renovando = false;
let sesion = null; // {llave, email, expira}
let abriendoSesion = null;

function leerSesionGuardada() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
    if (s && typeof s.llave === 'string' && /^ffs1\.[0-9a-f]{64}$/.test(s.llave) && s.email) return s;
  } catch { /* nada */ }
  return null;
}
function sesionVigente() { return !!sesion && !!sesion.llave; }
function guardarSesion(s) {
  sesion = s;
  try { s ? localStorage.setItem(CLAVE_SESION, JSON.stringify(s)) : localStorage.removeItem(CLAVE_SESION); } catch { /* nada */ }
}
if (typeof window !== 'undefined') sesion = leerSesionGuardada();

export class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

export function configurado() {
  const valido = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('PEGAR_AQUI');
  return valido(API_URL) && valido(CLIENT_ID);
}

export function emailGuardado() {
  try { return localStorage.getItem(CLAVE_EMAIL) || ''; } catch { return ''; }
}

const normalizarEmail = (e) => String(e || '').trim().toLowerCase();

// Email de la sesión (llave del motor o pase de Google vigente); '' si no hay sesión activa.
export function emailActual() {
  if (sesionVigente()) return normalizarEmail(sesion.email);
  return googleVigente() ? emailToken : '';
}

// Foto de perfil de Google de quien inició sesión. Viene dentro del mismo pase (token) que trae el correo;
// se guarda solo en este equipo y solo se acepta si es una dirección de imágenes de Google.
const CLAVE_FOTO = 'ff:foto';
function fotoValida(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(x.hostname) ? x.href : '';
  } catch { return ''; }
}
export function fotoGuardada() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_FOTO) || 'null');
    return v && v.email === emailGuardado() ? fotoValida(v.foto) : '';
  } catch { return ''; }
}
function guardarFoto(email, foto) {
  const antes = fotoGuardada();
  try { localStorage.setItem(CLAVE_FOTO, JSON.stringify({ email, foto })); } catch { return; }
  if (antes !== foto) { try { window.dispatchEvent(new Event('foto-cambio')); } catch { /* nada */ } }
}

function guardarEmail(email) {
  try { localStorage.setItem(CLAVE_EMAIL, email); } catch { /* sin almacenamiento */ }
}

function decodificarJwt(t) {
  try {
    const parte = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = parte + '='.repeat((4 - (parte.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(relleno), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function fijarToken(t) {
  const datos = decodificarJwt(t);
  if (!datos) return null;
  token = t;
  expira = (Number(datos.exp) || 0) * 1000;
  emailToken = normalizarEmail(datos.email);
  if (emailToken) guardarEmail(emailToken);
  const foto = fotoValida(datos.picture);
  if (emailToken && foto) guardarFoto(emailToken, foto);
  // Se guarda mientras siga vigente (máx. 1 hora) para no pedir sesión en cada recarga.
  try { localStorage.setItem(CLAVE_TOKEN, t); } catch { /* sin almacenamiento */ }
  return datos;
}

// Recupera el token guardado si todavía no venció.
function restaurarToken() {
  try {
    const t = localStorage.getItem(CLAVE_TOKEN);
    const datos = t && decodificarJwt(t);
    if (datos && Date.now() < (Number(datos.exp) || 0) * 1000 - 60 * 1000) fijarToken(t);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch { /* nada */ }
}

function googleVigente() {
  return !!token && Date.now() < expira - 60 * 1000;
}
// Hay sesión: la llave del motor o, si aún no hay llave, el pase de Google vigente.
export function tokenVigente() {
  return sesionVigente() || googleVigente();
}

export function cerrarSesion() {
  // Borra la llave también en el motor (si no hay señal, igual se borra aquí).
  const llave = sesion?.llave;
  if (llave && configurado()) {
    try { fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'cerrarSesion', sesion: llave, datos: {} }), keepalive: true }).catch(() => {}); } catch { /* nada */ }
  }
  guardarSesion(null);
  token = null;
  expira = 0;
  emailToken = '';
  try { localStorage.removeItem(CLAVE_EMAIL); localStorage.removeItem(CLAVE_TOKEN); localStorage.removeItem(CLAVE_FOTO); } catch { /* nada */ }
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* nada */ }
}

function resolverEsperando(error) {
  const lista = esperando;
  esperando = [];
  renovando = false;
  for (const p of lista) error ? p.rej(error) : p.res(token);
}

function recibirCredencial(respuesta) {
  if (!respuesta?.credential || !fijarToken(respuesta.credential)) {
    resolverEsperando(new ErrorApi('no_autorizado', 'No se pudo iniciar sesión.'));
    alCambiarSesion(false);
    return;
  }
  // Si nadie esperaba (renovar), la credencial vino del botón de Google.
  const desdeBoton = !renovando && esperando.length === 0;
  resolverEsperando(null);
  alCambiarSesion(true, desdeBoton);
  abrirSesionDelMotor();
}

// Con el pase de Google recién obtenido, pide al motor una llave de sesión larga (motor 1.9.8+).
// Si el motor es viejo o falla, no pasa nada: se sigue con el pase de Google.
export function abrirSesionDelMotor() {
  if (sesionVigente() || !googleVigente() || !configurado()) return Promise.resolve(false);
  if (abriendoSesion) return abriendoSesion;
  abriendoSesion = enviar('abrirSesion', {}, true).then((r) => {
    if (r?.ok && r.datos?.sesion && normalizarEmail(r.datos.email) === emailToken) {
      guardarSesion({ llave: r.datos.sesion, email: normalizarEmail(r.datos.email), expira: r.datos.expira });
      return true;
    }
    return false;
  }).catch(() => false).finally(() => { abriendoSesion = null; });
  return abriendoSesion;
}

// Vuelve a pedir el script de Google (si falló al abrir la app, el <script> de index.html no se repite).
function inyectarGis() {
  try {
    const sc = document.createElement('script');
    sc.src = URL_GIS;
    sc.async = true;
    document.head.append(sc);
  } catch { /* nada */ }
}

// Carga Google Identity Services (el script se incluye en index.html).
// Si no carga (sin señal o señal débil) no se guarda el fallo: el siguiente intento lo vuelve a pedir.
export function iniciarGoogle(callbackCambio) {
  if (callbackCambio) alCambiarSesion = callbackCambio;
  if (gisPromesa) return gisPromesa;
  if (!configurado()) return Promise.resolve(false);
  const yaCargado = !!window.google?.accounts?.id;
  if (!yaCargado && typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);
  if (!yaCargado && cargasGis++ > 0) inyectarGis();
  const promesa = new Promise((resolve) => {
    let intentos = 0;
    const intentar = () => {
      if (window.google?.accounts?.id) {
        const email = emailGuardado();
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: recibirCredencial,
          auto_select: true,
          cancel_on_tap_outside: false,
          itp_support: true,
          use_fedcm_for_prompt: true,
          ...(email ? { login_hint: email } : {}),
        });
        resolve(true);
      } else if (++intentos > 50) {
        if (gisPromesa === promesa) gisPromesa = null; // se reintenta en la próxima llamada
        resolve(false); // sin conexión o script bloqueado
      } else {
        setTimeout(intentar, 200);
      }
    };
    intentar();
  });
  gisPromesa = promesa;
  return promesa;
}

if (typeof window !== 'undefined') restaurarToken();

// Al volver la señal, intenta otra vez cargar Google si no había cargado.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (configurado() && !window.google?.accounts?.id && !gisPromesa) iniciarGoogle();
  });
}

// Pide un token nuevo con One Tap / selección automática.
export async function renovar() {
  const listo = await iniciarGoogle();
  // Si Google no cargó es un problema de red, no de sesión.
  if (!listo) throw new ErrorApi('sin_conexion', 'No se pudo conectar con Google. Revisa tu conexión.');
  return new Promise((res, rej) => {
    esperando.push({ res, rej });
    if (renovando) return;
    renovando = true;
    const limite = setTimeout(() => {
      if (renovando) resolverEsperando(new ErrorApi('no_autorizado', 'Inicia sesión con Google.'));
    }, 20000);
    try {
      window.google.accounts.id.prompt((n) => {
        const noMostrado = n?.isNotDisplayed?.() || n?.isSkippedMoment?.();
        if (noMostrado && renovando) {
          clearTimeout(limite);
          resolverEsperando(new ErrorApi('no_autorizado', 'Inicia sesión con Google.'));
          alCambiarSesion(false);
        }
      });
    } catch {
      clearTimeout(limite);
      resolverEsperando(new ErrorApi('no_autorizado', 'Inicia sesión con Google.'));
    }
  });
}

export async function renderBoton(elemento, ancho = 280) {
  const listo = await iniciarGoogle();
  if (!listo || !elemento) return false;
  window.google.accounts.id.renderButton(elemento, {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    locale: 'es',
    width: ancho,
  });
  return true;
}

async function enviar(accion, datos, soloGoogle = false) {
  // Con señal débil fetch() puede quedarse colgado: se corta a los 15 s y se trata como sin conexión.
  const control = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const limite = setTimeout(() => control?.abort(), LIMITE_ENVIO_MS);
  try {
    let resp;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(!soloGoogle && sesionVigente() ? { accion, sesion: sesion.llave, datos } : { accion, token, datos }),
        redirect: 'follow',
        ...(control ? { signal: control.signal } : {}),
      });
    } catch {
      throw new ErrorApi('sin_conexion', 'Sin conexión.');
    }
    if (!resp.ok) throw new ErrorApi('servidor', 'El servidor no respondió. Intenta en un momento.');
    try {
      return await resp.json();
    } catch {
      if (control?.signal.aborted) throw new ErrorApi('sin_conexion', 'Sin conexión.');
      throw new ErrorApi('error_interno', 'La respuesta del servidor no es válida.');
    }
  } finally {
    clearTimeout(limite);
  }
}

// Error que viene del servidor: conserva su código y su mensaje (en español).
function errorServidor(r) {
  const e = new ErrorApi(r?.codigo || 'error_interno', r?.error || 'Ocurrió un error. Intenta de nuevo.');
  e.delServidor = true;
  return e;
}

// Llama a una acción de la API y devuelve r.datos, o lanza ErrorApi.
// opciones.email: si viene, solo se envía con un token de ese mismo correo (si no, 'otro_usuario').
export async function llamar(accion, datos = {}, opciones = {}) {
  if (!configurado()) throw new ErrorApi('sin_configurar', 'Falta configurar la app (config.js).');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApi('sin_conexion', 'Sin conexión.');
  }
  const esperado = normalizarEmail(opciones.email);
  const comprobarCuenta = () => {
    if (esperado && emailActual() !== esperado) {
      throw new ErrorApi('otro_usuario', 'La sesión abierta es de otra cuenta.');
    }
  };
  if (!tokenVigente()) await renovar();
  comprobarCuenta();
  const conLlave = sesionVigente();
  let r = await enviar(accion, datos);
  if (!r?.ok && r?.codigo === 'no_autorizado') {
    const primero = r;
    // La llave ya no sirve (se cerró en otro lado o venció): se borra y se pide Google una vez.
    if (conLlave) guardarSesion(null);
    token = null;
    try {
      await renovar();
    } catch (e) {
      if (e?.codigo === 'sin_conexion') throw e;
      throw errorServidor(primero); // conserva el mensaje del servidor
    }
    comprobarCuenta();
    r = await enviar(accion, datos);
    if (!r?.ok && r?.codigo === 'no_autorizado') {
      // Con un token nuevo el servidor vuelve a rechazar: la cuenta no tiene acceso.
      const e = errorServidor(r);
      e.rechazada = true;
      throw e;
    }
  }
  if (!r?.ok) throw errorServidor(r);
  // Si entró con el pase de Google y todavía no tiene llave larga, la pide (una sola vez, por detrás).
  if (!sesionVigente() && googleVigente()) abrirSesionDelMotor();
  return r.datos;
}
