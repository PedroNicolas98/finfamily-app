// Cola sin conexión: IndexedDB 'finfamily', almacén 'cola'.
// Cada elemento: {idCliente, accion, datos, email, estado:'pendiente'|'revisar', creado, intentos, coincidencia, error}
// Si IndexedDB no está disponible, se usa memoria (se pierde al cerrar): persistente() lo indica
// y se vuelve a intentar abrir IndexedDB más tarde; si abre, lo que estaba en memoria pasa a la base.

const NOMBRE_BD = 'finfamily';
const ALMACEN = 'cola';
const ESPERA_REINTENTO_MS = 30000;

const memoria = new Map();
let bdPromesa = null;
let ultimoFallo = 0;
let enDisco = true; // se confirma al abrir la base
let enCurso = null;

function avisar() {
  try { window.dispatchEvent(new CustomEvent('cola-cambio')); } catch { /* nada */ }
}

// true si la cola se guarda en el equipo (IndexedDB); false si solo está en memoria.
export function persistente() {
  return enDisco;
}

function abrirBd() {
  return new Promise((res, rej) => {
    const limite = setTimeout(() => rej(new Error('tiempo agotado')), 4000);
    try {
      const r = indexedDB.open(NOMBRE_BD, 1);
      r.onupgradeneeded = () => {
        const bd = r.result;
        if (!bd.objectStoreNames.contains(ALMACEN)) {
          const s = bd.createObjectStore(ALMACEN, { keyPath: 'idCliente' });
          s.createIndex('creado', 'creado');
        }
      };
      r.onsuccess = () => { clearTimeout(limite); res(r.result); };
      r.onerror = () => { clearTimeout(limite); rej(r.error); };
      r.onblocked = () => { clearTimeout(limite); rej(new Error('bloqueada')); };
    } catch (e) {
      clearTimeout(limite);
      rej(e);
    }
  });
}

// Pasa a IndexedDB lo que se guardó en memoria mientras la base no abría.
async function migrarMemoria(bd) {
  if (!memoria.size) return;
  const items = [...memoria.values()];
  await new Promise((res, rej) => {
    const t = bd.transaction(ALMACEN, 'readwrite');
    const s = t.objectStore(ALMACEN);
    for (const it of items) s.put(it);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
  for (const it of items) memoria.delete(it.idCliente);
}

function abrir() {
  if (bdPromesa) return bdPromesa;
  if (typeof indexedDB === 'undefined') { enDisco = false; return Promise.resolve(null); }
  // Tras un fallo se espera un rato antes de volver a probar (no se guarda el fallo para siempre).
  if (ultimoFallo && Date.now() - ultimoFallo < ESPERA_REINTENTO_MS) return Promise.resolve(null);
  const p = abrirBd().then(
    async (bd) => {
      enDisco = true;
      ultimoFallo = 0;
      try { await migrarMemoria(bd); } catch { /* se intenta en la próxima apertura */ }
      return bd;
    },
    () => {
      enDisco = false;
      ultimoFallo = Date.now();
      if (bdPromesa === p) bdPromesa = null;
      return null;
    },
  );
  bdPromesa = p;
  return p;
}

const porFecha = (a, b) => a.creado - b.creado;

export async function listar() {
  const bd = await abrir();
  const enMemoria = [...memoria.values()].map((i) => structuredClone(i));
  if (!bd) return enMemoria.sort(porFecha);
  const guardados = await new Promise((res, rej) => {
    const r = bd.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
  // Si quedó algo en memoria (migración pendiente) también se muestra.
  const ids = new Set(guardados.map((i) => i.idCliente));
  return [...guardados, ...enMemoria.filter((i) => !ids.has(i.idCliente))].sort(porFecha);
}

async function escribir(fn) {
  const bd = await abrir();
  if (!bd) { fn(null); avisar(); return; }
  await new Promise((res, rej) => {
    const t = bd.transaction(ALMACEN, 'readwrite');
    fn(t.objectStore(ALMACEN));
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
  avisar();
}

export async function guardar(item) {
  await escribir((s) => (s ? s.put(item) : memoria.set(item.idCliente, structuredClone(item))));
  return item;
}

export async function quitar(id) {
  memoria.delete(id);
  await escribir((s) => (s ? s.delete(id) : null));
}

export async function obtener(id) {
  return (await listar()).find((i) => i.idCliente === id) || null;
}

// email es el correo de quien registra: el elemento solo se envía con un token de ese correo.
export function encolar(accion, datos, email) {
  if (!email) return Promise.reject(new Error('sin_usuario'));
  return guardar({
    idCliente: datos.idCliente,
    accion,
    datos,
    email: String(email).trim().toLowerCase(),
    estado: 'pendiente',
    creado: Date.now(),
    intentos: 0,
    coincidencia: null,
    error: null,
  });
}

// El usuario confirma que no es duplicado: se reenvía con confirmarDuplicado:true.
export async function confirmarDuplicado(id) {
  const it = await obtener(id);
  if (!it) return;
  it.datos = { ...it.datos, confirmarDuplicado: true };
  Object.assign(it, { estado: 'pendiente', coincidencia: null, error: null, intentos: 0 });
  await guardar(it);
}

export async function reintentar(id) {
  const it = await obtener(id);
  if (!it) return;
  Object.assign(it, { estado: 'pendiente', error: null, intentos: 0 });
  await guardar(it);
}

// Envía en orden los pendientes del usuario. llamar(accion, datos, {email}) es api.llamar,
// que se niega ('otro_usuario') si el token vigente es de otro correo.
// Sin email conocido no se envía nada: así los gastos de una persona nunca salen con la sesión de otra.
// Devuelve {enviados, revisar, detenido, resultados:{[idCliente]: {tipo, datos|error}}}.
export function procesar(llamar, email) {
  const yo = String(email || '').trim().toLowerCase();
  if (!yo) return Promise.resolve({ enviados: 0, revisar: 0, detenido: 'sin_usuario', resultados: {} });
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const res = { enviados: 0, revisar: 0, detenido: null, resultados: {} };
    const vistos = new Set();
    externo: for (;;) {
      const pendientes = (await listar()).filter(
        (i) => i.estado === 'pendiente' && !vistos.has(i.idCliente) && i.email === yo,
      );
      if (!pendientes.length) break;
      for (const it of pendientes) {
        vistos.add(it.idCliente);
        try {
          const d = await llamar(it.accion, it.datos, { email: it.email });
          if (it.accion === 'registrar' && d && d.posibleDuplicado) {
            it.estado = 'revisar';
            it.coincidencia = d.coincidencia || null;
            await guardar(it);
            res.revisar++;
            res.resultados[it.idCliente] = { tipo: 'revisar', datos: d };
          } else {
            await quitar(it.idCliente);
            res.enviados++;
            res.resultados[it.idCliente] = { tipo: 'enviado', datos: d };
          }
        } catch (e) {
          const c = e?.codigo;
          if (c === 'sin_conexion' || c === 'no_autorizado' || c === 'sin_configurar' || c === 'otro_usuario') {
            res.detenido = c;
            break externo;
          }
          if (c === 'datos_invalidos' || c === 'hoja_no_encontrada') {
            it.estado = 'revisar';
            it.error = e.message;
            await guardar(it);
            res.revisar++;
            res.resultados[it.idCliente] = { tipo: 'error', error: e };
            continue;
          }
          it.intentos = (it.intentos || 0) + 1;
          if (it.intentos >= 3) {
            it.estado = 'revisar';
            it.error = e?.message || 'No se pudo enviar.';
          }
          await guardar(it);
          res.detenido = c || 'error_interno';
          break externo;
        }
      }
    }
    return res;
  })().finally(() => { enCurso = null; });
  return enCurso;
}
