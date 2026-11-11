// Pruebas de apps-script/Codigo.gs (las acciones que llegan por doPost y los avisos).
// Se ejecutan con: npm test
// Codigo.gs usa servicios de Google (SpreadsheetApp, MailApp, etc.). Aquí se cargan
// Logica.gs y Codigo.gs dentro de un contexto de vm con IMITACIONES de esos servicios,
// guardadas en memoria. Nada sale a internet y todos los datos son SINTÉTICOS.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CARPETA = path.join(__dirname, '..', 'apps-script');
const FUENTE_LOGICA = fs.readFileSync(path.join(CARPETA, 'Logica.gs'), 'utf8');
const FUENTE_CODIGO = fs.readFileSync(path.join(CARPETA, 'Codigo.gs'), 'utf8');

const CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
const USUARIOS = {
  'persona-a@example.test': { nombre: 'PersonaA', clave: 'P' },
  'persona-b@example.test': { nombre: 'PersonaB', clave: 'B' }
};
const TOKEN_PERSONA_A = 'token-PersonaA';
const TOKEN_GREEN_PRUEBA = 'd75b3a66374942c5b3c019c698abc2067e151558acbd412345';
const TOKEN_META_PRUEBA = 'EAAprueba0123456789abcdefghijklmnopqrstuvwxyz';
const ID = 'prueba-0001';

// ---------- Imitación de una hoja del Sheets ----------

function fecha(anio, mes, dia) {
  return new Date(anio, mes - 1, dia);
}

class HojaFalsa {
  constructor(nombre, valores, opciones) {
    const o = opciones || {};
    this.nombre = nombre;
    this.valores = valores.map((f) => f.slice());
    this.formulas = this.valores.map((f) => f.map(() => ''));
    this.notas = this.valores.map((f) => f.map(() => ''));
    this.combinadas = {};
    this.escrituras = []; // todo lo que el motor escribió: {fila, col, valor} o {fila, col, nota}
    this.filasBorradas = 0;
    Object.entries(o.formulas || {}).forEach(([k, v]) => { const [f, c] = k.split(',').map(Number); this.formulas[f - 1][c - 1] = v; });
    Object.entries(o.notas || {}).forEach(([k, v]) => { const [f, c] = k.split(',').map(Number); this.notas[f - 1][c - 1] = v; });
    (o.combinadas || []).forEach((k) => { this.combinadas[k] = true; });
  }
  getName() { return this.nombre; }
  getMaxRows() { return this.valores.length; }
  getLastRow() {
    for (let i = this.valores.length - 1; i >= 0; i--) if (this.valores[i].some((v) => v !== '' && v !== null)) return i + 1;
    return 0;
  }
  getDataRange() { return this.getRange(1, 1, this.valores.length, this.valores[0].length); }
  // Como Sheets: al insertar o borrar una fila, los rangos de las fórmulas (=SUM(B7:B27)) se ajustan.
  ajustarFormulas_(fila, delta) {
    const mover = (n) => {
      const num = Number(n);
      if (delta > 0) return num >= fila ? num + 1 : num;
      return num > fila ? num - 1 : num;
    };
    this.formulas = this.formulas.map((f) => f.map((formula) => formula.replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, (x, c1, f1, c2, f2) => {
      const ini = Number(f1), fin = Number(f2);
      let nuevoIni = mover(ini), nuevoFin = mover(fin);
      // Insertar dentro del rango (ini < fila <= fin) lo amplía; borrar dentro lo achica.
      if (delta > 0 && fila > ini && fila <= fin) { nuevoIni = ini; nuevoFin = fin + 1; }
      if (delta < 0 && fila >= ini && fila <= fin) { nuevoIni = ini; nuevoFin = fin - 1; }
      return c1 + nuevoIni + ':' + c2 + nuevoFin;
    })));
  }
  insertRowBefore(fila) {
    const ancho = this.valores[0].length;
    this.valores.splice(fila - 1, 0, new Array(ancho).fill(''));
    this.formulas.splice(fila - 1, 0, new Array(ancho).fill(''));
    this.notas.splice(fila - 1, 0, new Array(ancho).fill(''));
    this.ajustarFormulas_(fila, 1);
  }
  deleteRow(fila) {
    this.filasBorradas++;
    if (!fila) return;
    this.valores.splice(fila - 1, 1);
    this.formulas.splice(fila - 1, 1);
    this.notas.splice(fila - 1, 1);
    this.ajustarFormulas_(fila, -1);
  }
  // Evalúa una fórmula =SUM(B7:B27) sobre los valores actuales (para comprobar los totales en las pruebas).
  evaluarSuma(fila, col) {
    const m = this.formulas[fila - 1][col - 1].match(/=SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/);
    if (!m) return null;
    let total = 0;
    for (let f = Number(m[2]); f <= Number(m[4]); f++) { const v = this.valores[f - 1][col - 1]; if (typeof v === 'number') total += v; }
    return Math.round(total * 100) / 100;
  }
  setFrozenRows() {}
  insertRowsAfter(fila, n) {
    const ancho = this.valores[0].length;
    for (let i = 0; i < n; i++) {
      this.valores.splice(fila + i, 0, new Array(ancho).fill(''));
      this.formulas.splice(fila + i, 0, new Array(ancho).fill(''));
      this.notas.splice(fila + i, 0, new Array(ancho).fill(''));
    }
  }
  getRange(fila, col, nFilas, nCols) {
    const hoja = this;
    const nf = nFilas || 1, nc = nCols || 1;
    const recorte = (m) => m.slice(fila - 1, fila - 1 + nf).map((f) => f.slice(col - 1, col - 1 + nc));
    return {
      getValues: () => recorte(hoja.valores),
      getDisplayValues: () => recorte(hoja.valores).map((f) => f.map((v) => (v instanceof Date ? v.toISOString() : String(v)))),
      getFormulas: () => recorte(hoja.formulas),
      getNotes: () => recorte(hoja.notas),
      getValue: () => hoja.valores[fila - 1][col - 1],
      getFormula: () => hoja.formulas[fila - 1][col - 1],
      getNote: () => hoja.notas[fila - 1][col - 1],
      isPartOfMerge: () => !!hoja.combinadas[fila + ',' + col],
      // Igual que en el Sheets real: setValue cambia el valor y deja la nota como estaba.
      setValue: (v) => { hoja.valores[fila - 1][col - 1] = v; hoja.formulas[fila - 1][col - 1] = ''; hoja.escrituras.push({ fila, col, valor: v }); },
      setNote: (n) => { hoja.notas[fila - 1][col - 1] = n; hoja.escrituras.push({ fila, col, nota: n }); },
      setValues: (matriz) => {
        matriz.forEach((f, i) => f.forEach((v, j) => {
          while (hoja.valores.length < fila + i) hoja.insertRowsAfter(hoja.valores.length, 1);
          hoja.valores[fila - 1 + i][col - 1 + j] = v;
          hoja.escrituras.push({ fila: fila + i, col: col + j, valor: v });
        }));
      },
      copyFormatToRange() {}
    };
  }
}

// ---------- Datos sintéticos ----------

const ENC_TC = ['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto',
  'Fecha de pago', 'Fecha de vencimiento', 'Estado', 'Nota / Observación', '_ID_FORM', '_HUELLA_FORM'];
const COL_ESTADO = 9; // columna (base 1) de 'Estado' en las hojas TC

function hojaTc(nombre, filas, opciones) {
  const ancho = ENC_TC.length;
  const tituloFila = new Array(ancho).fill('');
  tituloFila[0] = 'TARJETA SINTÉTICA';
  return new HojaFalsa(nombre, [tituloFila, ENC_TC.slice()].concat(filas), opciones);
}

// 'TC SIP': encabezado en la fila 2, datos desde la fila 3.
function hojaSip(opciones) {
  return hojaTc('TC SIP', [
    ['PersonaB', 'Octubre', fecha(2026, 10, 8), 'Limpieza', 'Limpieza sintética', 20,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pagado', '', '', ''],            // fila 3
    ['PersonaB', 'Octubre', fecha(2026, 10, 9), 'Mascotas', 'Mascota sintética', 40.5,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pendiente', '', '', ''],          // fila 4
    ['PersonaB', 'Octubre', fecha(2026, 10, 10), 'Ropa y Calzado', 'Ropa sintética', 99,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pagado', 'nota', '', ''],         // fila 5
    ['PersonaB', 'Octubre', fecha(2026, 10, 10), 'Delivery', 'Pedido sintético', 15,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pagado', '', '', '']              // fila 6 (Estado con fórmula en una prueba)
  ], opciones);
}

// 'PRESUPUESTO FAMILIAR': encabezado en la fila 2. Columnas: concepto, oct-26, nov-26, dic-26.
function hojaPresupuesto(opciones) {
  return new HojaFalsa('PRESUPUESTO FAMILIAR', [
    ['PRESUPUESTO FAMILIAR', '', '', ''],        // 1
    ['Concepto / Categoría', 'oct-26', 'nov-26', 'dic-26'], // 2
    ['Ingresos - Uno', 1000, 1000, 1000],        // 3
    ['TOTAL INGRESOS', 1000, 1000, 1000],        // 4
    ['Luz', 80, 90, 95],                         // 5
    ['Internet', 100, 100, 100],                 // 6
    ['Alquiler', 500, 500, 500],                 // 7
    ['Ahorro Casa', 50, 60, 70],                 // 8
    ['Ahorro Viaje', 0, 25.5, 30],               // 9
    ['Fondo de Emergencia', 20, '', 20],         // 10 (noviembre vacío)
    ['TOTAL GASTOS', 750, 775.5, 815],           // 11
    ['TOTAL AHORROS', 70, 85.5, 120],            // 12
    ['SALDO / SUPERÁVIT FINAL', 250, 224.5, 185] // 13
  ], opciones);
}

// ---------- Contexto con los servicios de Google imitados ----------

function crearMotor(config) {
  const c = config || {};
  const hojas = c.hojas || [];
  const propiedades = Object.assign({ CLIENT_ID, USUARIOS: JSON.stringify(USUARIOS), SHEET_ID: 'id-hoja-ficticio' }, c.propiedades || {});
  const correos = [];
  const whatsapps = [];
  const metaLlamadas = [];
  const greenLlamadas = [];
  const activadores = (c.activadores || []).map((nombre) => ({ nombre }));
  const cache = {};
  const estado = { hoy: c.hoy || '2026-11-06', cuotaCorreo: c.cuotaCorreo === undefined ? 100 : c.cuotaCorreo, idsHojaAbiertos: [] };
  const avisosConsola = [];

  // Gmail imitado: c.hilos = [{ mensajes: [{ id, de, asunto, cuerpo, fecha }] }]
  const etiquetasGmail = {};
  const hilos = (c.hilos || []).map((h) => {
    const hilo = { etiquetas: [], mensajes: h.mensajes };
    hilo.obj = {
      getLabels: () => hilo.etiquetas,
      addLabel: (e) => { if (!hilo.etiquetas.includes(e)) hilo.etiquetas.push(e); },
      getMessages: () => hilo.mensajes.map((m) => ({
        getId: () => m.id, getFrom: () => m.de, getSubject: () => m.asunto,
        getPlainBody: () => { if (m.falla) throw new Error('cuerpo ilegible simulado'); return m.cuerpo; },
        getDate: () => m.fecha || new Date(2026, 10, 9, 20, 15),
        getTo: () => m.para || ''
      }))
    };
    return hilo;
  });
  const consultasGmail = [];

  // Calendario imitado: eventos en memoria.
  const eventos = {};
  let contadorEventos = 0;
  const calendario = {
    createAllDayEvent: (titulo, fecha, opciones) => {
      const id = 'ev' + (++contadorEventos);
      const e = { id, titulo, fecha, descripcion: (opciones || {}).description, recordatorios: [], borrado: false };
      eventos[id] = e;
      return envolverEvento(e);
    },
    getEventById: (id) => (eventos[id] && !eventos[id].borrado ? envolverEvento(eventos[id]) : null)
  };
  function envolverEvento(e) {
    return {
      getId: () => e.id, getTitle: () => e.titulo,
      setTitle: (t) => { e.titulo = t; }, setDescription: (d) => { e.descripcion = d; },
      removeAllReminders: () => { e.recordatorios = []; }, addPopupReminder: (min) => { e.recordatorios.push(min); },
      deleteEvent: () => { e.borrado = true; }
    };
  }

  const servicios = {
    console: { log() {}, warn(m) { avisosConsola.push(String(m)); }, error() {} },
    SpreadsheetApp: {
      openById: (id) => {
        estado.idsHojaAbiertos.push(id);
        return ({
        getSpreadsheetTimeZone: () => c.zonaHoja || 'America/Lima',
        getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
        getSheets: () => hojas,
        insertSheet: (n) => { const h = new HojaFalsa(n, [new Array(12).fill('')]); hojas.push(h); return h; }
        });
      },
      flush() {}
    },
    GmailApp: {
      getUserLabelByName: (n) => etiquetasGmail[n] || null,
      createLabel: (n) => { etiquetasGmail[n] = { getName: () => n }; return etiquetasGmail[n]; },
      search: (q) => { consultasGmail.push(q); return hilos.map((h) => h.obj); }
    },
    CalendarApp: { getDefaultCalendar: () => calendario },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propiedades ? propiedades[k] : null),
        setProperty: (k, v) => { propiedades[k] = String(v); },
        deleteProperty: (k) => { delete propiedades[k]; }
      })
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => 'uuid-' + Math.random().toString(16).slice(2, 10),
      parseDate: (texto, zona, patron) => {
        const [a, mm, dd] = String(texto).split('-').map(Number);
        const desfase = zona === 'GMT-8' ? 8 : zona === 'GMT' ? 0 : null;
        return desfase === null ? new Date(a, mm - 1, dd) : new Date(Date.UTC(a, mm - 1, dd, desfase));
      },
      computeDigest: (alg, texto) => Array.from(crypto.createHash('sha256').update(texto, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, zona, patron) => {
        if (zona === 'GMT' || zona === 'GMT-8') {
          const p = (n) => String(n).padStart(2, '0');
          const u = new Date(d.getTime() - (zona === 'GMT-8' ? 8 * 3600000 : 0));
          if (patron === 'HH:mm') return `${p(u.getUTCHours())}:${p(u.getUTCMinutes())}`;
          if (patron === 'yyyy-MM-dd') return `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())}`;
        }
        if (patron && patron.indexOf('HH') !== -1) {
          const p = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        }
        return estado.hoy;
      }
    },
    UrlFetchApp: {
      // Imita la respuesta de Google al verificar el inicio de sesión (y CallMeBot, motor 1.17.0).
      fetch: (url, opciones) => {
        if (/^https:\/\/[a-z0-9.-]*greenapi\.com\/waInstance/.test(String(url))) {
          const m = String(url).match(/waInstance(\d+)\/(\w+)\/(\w+)/);
          const cuerpo = opciones && opciones.payload ? JSON.parse(opciones.payload) : null;
          greenLlamadas.push({ metodo: m[2], cuerpo });
          const resp = (codigo, obj) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(obj) });
          if (m[3] !== TOKEN_GREEN_PRUEBA) return resp(401, { message: 'Unauthorized' });
          if (m[1] === '1100000002') return m[2] === 'getStateInstance' ? resp(200, { stateInstance: 'notAuthorized' }) : resp(200, {});
          if (m[2] === 'getStateInstance') return resp(200, { stateInstance: 'authorized' });
          if (m[2] === 'getWaSettings') return resp(200, { phone: '51987654321', stateInstance: 'authorized' });
          if (m[2] === 'sendMessage') return resp(200, { idMessage: '3EB0C767D097B7C7C030' });
          if (m[2] === 'setSettings') return resp(200, { saveSettings: true });
          return resp(404, { message: 'not found' });
        }
        if (String(url).indexOf('https://graph.facebook.com/') === 0) {
          const auth = ((opciones || {}).headers || {}).Authorization || '';
          const cuerpo = opciones && opciones.payload ? JSON.parse(opciones.payload) : null;
          metaLlamadas.push({ url: String(url), cuerpo });
          const resp = (codigo, obj) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(obj) });
          if (!auth.endsWith(TOKEN_META_PRUEBA)) return resp(401, { error: { message: 'Invalid OAuth access token.', code: 190 } });
          if (!cuerpo) return resp(200, { display_phone_number: '+1 555 010 0000', verified_name: 'Test Number', id: '123456789012345' });
          if (cuerpo.to === '51900000999') return resp(400, { error: { message: '(#131030) Recipient phone number not in allowed list', code: 131030 } });
          if (cuerpo.template.name === 'no_aprobada') return resp(404, { error: { message: '(#132001) Template name does not exist in the translation', code: 132001 } });
          return resp(200, { messages: [{ id: 'wamid.prueba' }] });
        }
        if (String(url).indexOf('https://api.callmebot.com/whatsapp.php?') === 0) {
          const q = new URLSearchParams(String(url).split('?')[1]);
          whatsapps.push({ phone: q.get('phone'), text: q.get('text'), apikey: q.get('apikey') });
          const mala = q.get('apikey') === '0000';
          return { getResponseCode: () => 200, getContentText: () => (mala ? '<p>APIKey is invalid. Please check</p>' : '<p>Message queued. You will receive it in a few seconds.</p>') };
        }
        const token = decodeURIComponent(String(url).split('id_token=')[1] || '');
        const email = token === TOKEN_PERSONA_A ? 'persona-a@example.test' : (token === 'token-extrano' ? 'otro@example.com' : null);
        if (!email) return { getResponseCode: () => 400, getContentText: () => '{}' };
        const info = {
          aud: CLIENT_ID, email, email_verified: 'true', iss: 'https://accounts.google.com',
          exp: String(Math.floor(Date.now() / 1000) + 3600)
        };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(info) };
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (texto) => ({ setMimeType() { return this; }, getContent: () => texto })
    },
    MailApp: {
      getRemainingDailyQuota: () => estado.cuotaCorreo,
      sendEmail: (m) => {
        if (c.correoFalla) throw new Error('fallo de correo simulado');
        correos.push(m);
      }
    },
    ScriptApp: {
      getProjectTriggers: () => activadores.map((a) => ({ getHandlerFunction: () => a.nombre, _a: a })),
      deleteTrigger: (t) => { activadores.splice(activadores.indexOf(t._a), 1); },
      newTrigger: (nombre) => {
        const a = { nombre, pasos: [] };
        const b = {
          timeBased() { a.pasos.push('tiempo'); return b; },
          everyDays(n) { a.cadaDias = n; return b; },
          everyMinutes(n) { a.cadaMinutos = n; return b; },
          atHour(h) { a.hora = h; return b; },
          inTimezone(z) { a.zona = z; return b; },
          create() { activadores.push(a); return a; }
        };
        return b;
      }
    }
  };

  const contexto = vm.createContext(servicios);
  vm.runInContext(FUENTE_LOGICA, contexto, { filename: 'Logica.gs' });
  vm.runInContext(FUENTE_CODIGO, contexto, { filename: 'Codigo.gs' });

  return {
    contexto, propiedades, correos, whatsapps, metaLlamadas, greenLlamadas, activadores, estado, hojas, hilos, etiquetasGmail, consultasGmail, eventos, avisosConsola,
    // Llama al motor igual que la web: POST con {accion, token, datos}.
    llamar(accion, datos, token) {
      const cuerpo = JSON.stringify({ accion, token: token === undefined ? TOKEN_PERSONA_A : token, datos });
      return JSON.parse(contexto.doPost({ postData: { contents: cuerpo } }).getContent());
    }
  };
}

function hojasDeConsumos(sip) {
  const vacia = (n) => hojaTc(n, []);
  return [sip || hojaSip(), vacia('TC IBK'), vacia('TC BCP'), vacia('TC Ripley'),
    new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado']])];
}

// ---------- Versión y acciones desconocidas ----------

test('version: informa 1.7.1 y la lista de acciones; inicio y config traen el campo version', () => {
  const m = crearMotor({ hojas: hojasDeConsumos().concat([hojaPresupuesto(),
    new HojaFalsa('Configuración', [['Conceptos de Gasto', 'Responsable'], ['Limpieza', 'PersonaB']])]) });
  const r = m.llamar('version', {});
  assert.equal(r.ok, true);
  assert.equal(r.datos.version, '1.23.0');
  for (const a of ['desmarcarPagado', 'editarPresupuesto', 'ahorros', 'version', 'marcarPagado', 'inicio',
    'pendientes', 'confirmarPendiente', 'descartarPendiente', 'ajustesAvisos', 'guardarAjustesAvisos', 'datosTarjetas', 'guardarDatosTarjeta']) {
    assert.ok(r.datos.acciones.includes(a), 'falta la acción ' + a);
  }
  assert.equal(m.llamar('inicio', {}).datos.version, '1.23.0');
  assert.equal(m.llamar('config', {}).datos.version, '1.23.0');
});

test('la lista ACCIONES coincide con las acciones que atiende doPost', () => {
  const m = crearMotor({});
  const enDoPost = [...FUENTE_CODIGO.matchAll(/case '([A-Za-z]+)': resultado =/g)].map((x) => x[1]).sort();
  assert.deepEqual(Array.from(m.contexto.ACCIONES).sort(), enDoPost);
});

test('acción desconocida y sesión inválida: errores de siempre', () => {
  const m = crearMotor({});
  assert.deepEqual(m.llamar('noExiste', {}), { ok: false, codigo: 'datos_invalidos', error: 'Acción no reconocida.' });
  assert.equal(m.llamar('ahorros', {}, 'token-malo').codigo, 'no_autorizado');
  assert.equal(m.llamar('desmarcarPagado', {}, 'token-extrano').codigo, 'no_autorizado');
  assert.equal(m.llamar('editarPresupuesto', {}, '').codigo, 'no_autorizado');
});

test('abrirLibro requiere SHEET_ID privado y usa solo ese valor', () => {
  const configurado = crearMotor({ propiedades: { SHEET_ID: 'id-hoja-privado-de-prueba' } });
  configurado.contexto.abrirLibro_();
  assert.deepEqual(configurado.estado.idsHojaAbiertos, ['id-hoja-privado-de-prueba']);

  const ausente = crearMotor({ propiedades: { SHEET_ID: '' } });
  assert.throws(() => ausente.contexto.abrirLibro_(), /SHEET_ID/);
  assert.deepEqual(ausente.estado.idsHojaAbiertos, []);
});

test('el responsable se resuelve desde los usuarios privados configurados', () => {
  const usuarios = {
    'persona.uno@example.test': { nombre: 'PersonaA', clave: 'P' },
    'persona.dos@example.test': { nombre: 'PersonaB', clave: 'B' }
  };
  const m = crearMotor({ propiedades: { USUARIOS: JSON.stringify(usuarios) } });
  assert.equal(m.contexto.resolverResponsable_({ nombre: 'PersonaA' }, 'PersonaB'), 'PersonaB');
  assert.equal(m.contexto.leerCatalogo_().find((t) => t.id === 'IBK_P').titular, 'PersonaA');
  assert.equal(m.contexto.leerCatalogo_().find((t) => t.id === 'IBK_B').titular, 'PersonaB');
});

test('el titular predeterminado de tarjeta sigue la clave aunque cambie el orden de USUARIOS', () => {
  const usuarios = {
    'persona-b@example.test': { nombre: 'PersonaB', clave: 'B' },
    'persona-a@example.test': { nombre: 'PersonaA', clave: 'P' }
  };
  const m = crearMotor({ propiedades: { USUARIOS: JSON.stringify(usuarios) } });
  const catalogo = m.contexto.leerCatalogo_();
  assert.equal(catalogo.find((t) => t.id === 'IBK_P').titular, 'PersonaA');
  assert.equal(catalogo.find((t) => t.id === 'IBK_B').titular, 'PersonaB');
});

// ---------- marcarPagado (sin cambios) y desmarcarPagado ----------

test('marcarPagado sigue igual: marca la pendiente y omite la ya pagada', () => {
  const sip = hojaSip();
  const m = crearMotor({ hojas: hojasDeConsumos(sip) });
  const r = m.llamar('marcarPagado', {
    idCliente: ID, hoja: 'TC SIP', filas: [3, 4],
    verificar: [{ fila: 3, monto: 20, descripcion: 'Limpieza sintética' }, { fila: 4, monto: 40.5, descripcion: 'Mascota sintética' }]
  });
  assert.deepEqual(r, { ok: true, datos: { actualizadas: 1, omitidas: [{ fila: 3, motivo: 'ya estaba pagado' }] } });
  assert.deepEqual(sip.escrituras, [{ fila: 4, col: COL_ESTADO, valor: 'Pagado' }]);
});

test('desmarcarPagado: devuelve a Pendiente solo las filas pagadas que siguen iguales', () => {
  const sip = hojaSip({ formulas: { '6,9': '=SI(A6="";"";"Pagado")' } });
  const m = crearMotor({ hojas: hojasDeConsumos(sip) });
  const r = m.llamar('desmarcarPagado', {
    idCliente: ID, hoja: 'tc sip',
    filas: [3, 4, 5, 6, 2, 99, 3, 7.5],
    verificar: [
      { fila: 3, monto: 20, descripcion: 'limpieza SINTETICA' },   // coincide (sin tildes ni mayúsculas)
      { fila: 4, monto: 40.5, descripcion: 'Mascota sintética' },  // está pendiente
      { fila: 5, monto: 98, descripcion: 'Ropa sintética' },       // el monto ya no es el mismo
      { fila: 6, monto: '15.00', descripcion: 'Pedido sintético' } // el estado tiene fórmula
    ]
  });
  assert.equal(r.ok, true);
  assert.equal(r.datos.actualizadas, 1);
  assert.deepEqual(r.datos.omitidas, [
    { fila: 4, motivo: 'no estaba pagado' },
    { fila: 5, motivo: 'la fila cambió' },
    { fila: 2, motivo: 'fila no válida' },
    { fila: 99, motivo: 'fila no válida' },
    { fila: 7.5, motivo: 'fila no válida' },
    { fila: 6, motivo: 'el estado tiene fórmula' }
  ]);
  // Solo se escribió una celda: el Estado de la fila 3.
  assert.deepEqual(sip.escrituras, [{ fila: 3, col: COL_ESTADO, valor: 'Pendiente' }]);
  assert.equal(sip.formulas[5][8], '=SI(A6="";"";"Pagado")', 'la fórmula no se toca');
  assert.equal(sip.filasBorradas, 0);
});

test('desmarcarPagado: sin datos para verificar no escribe; y luego marcarPagado lo revierte', () => {
  const sip = hojaSip();
  const m = crearMotor({ hojas: hojasDeConsumos(sip) });
  const sinVerificar = m.llamar('desmarcarPagado', { idCliente: ID, hoja: 'TC SIP', filas: [3] });
  assert.deepEqual(sinVerificar.datos, { actualizadas: 0, omitidas: [{ fila: 3, motivo: 'sin datos para verificar' }] });
  assert.deepEqual(sip.escrituras, []);

  const v = [{ fila: 5, monto: 99, descripcion: 'Ropa sintética' }];
  assert.equal(m.llamar('desmarcarPagado', { idCliente: ID, hoja: 'TC SIP', filas: [5], verificar: v }).datos.actualizadas, 1);
  assert.equal(sip.valores[4][8], 'Pendiente');
  assert.equal(m.llamar('marcarPagado', { idCliente: ID, hoja: 'TC SIP', filas: [5], verificar: v }).datos.actualizadas, 1);
  assert.equal(sip.valores[4][8], 'Pagado');
});

test('desmarcarPagado: errores de entrada', () => {
  const m = crearMotor({ hojas: hojasDeConsumos().concat([hojaPresupuesto()]) });
  const base = { idCliente: ID, hoja: 'TC SIP', filas: [3], verificar: [] };
  const error = (cambios) => m.llamar('desmarcarPagado', Object.assign({}, base, cambios));
  assert.deepEqual(error({ idCliente: 'x' }), { ok: false, codigo: 'datos_invalidos', error: 'Falta el identificador del registro.' });
  assert.deepEqual(error({ hoja: 'PRESUPUESTO FAMILIAR' }), { ok: false, codigo: 'datos_invalidos', error: 'Esa hoja no admite marcar pagos.' });
  assert.deepEqual(error({ filas: [] }), { ok: false, codigo: 'datos_invalidos', error: 'No se indicaron filas para desmarcar.' });
  assert.equal(error({ filas: 'todas' }).codigo, 'datos_invalidos');
});

// ---------- editarPresupuesto ----------

function pedirEdicion(m, cambios) {
  return m.llamar('editarPresupuesto', Object.assign(
    { idCliente: ID, mes: '2026-11', fila: 5, concepto: 'Luz', montoAnterior: 90, monto: 120.456 }, cambios || {}));
}

test('editarPresupuesto: cambia solo esa celda y conserva la nota de Pagado', () => {
  const pres = hojaPresupuesto({ notas: { '5,3': 'Pagado el 05/11/2026 · PersonaA\nRecordar factura' } });
  const m = crearMotor({ hojas: [pres] });
  const r = pedirEdicion(m);
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    actualizado: true, mes: '2026-11', fila: 5, concepto: 'Luz', seccion: 'gastos',
    montoAnterior: 90, monto: 120.46, pagadoNota: 'Pagado el 05/11/2026 · PersonaA',
    totales: { ingresos: 1000, gastos: 775.5, ahorros: 85.5, saldo: 224.5, saldoPersonal: 0 }
  });
  assert.deepEqual(pres.escrituras, [{ fila: 5, col: 3, valor: 120.46 }]);
  assert.equal(pres.notas[4][2], 'Pagado el 05/11/2026 · PersonaA\nRecordar factura', 'la nota queda intacta');
  assert.equal(pres.valores[4][1], 80, 'octubre no cambia');
  assert.equal(pres.valores[4][3], 95, 'diciembre no cambia');
});

test('editarPresupuesto: acepta texto con formato, el cero y celdas vacías', () => {
  const pres = hojaPresupuesto();
  const m = crearMotor({ hojas: [pres] });
  assert.equal(pedirEdicion(m, { monto: 'S/ 1,234.50' }).datos.monto, 1234.5);
  assert.equal(pedirEdicion(m, { montoAnterior: 1234.5, monto: 0 }).datos.monto, 0);
  assert.equal(pres.valores[4][2], 0);
  // Fila 10 (Fondo de Emergencia) está vacía en noviembre: la app mostraba 0.
  const r = pedirEdicion(m, { fila: 10, concepto: 'Fondo de Emergencia', montoAnterior: 0, monto: 35 });
  assert.equal(r.datos.actualizado, true);
  assert.equal(r.datos.seccion, 'ahorros');
  assert.equal(pres.valores[9][2], 35);
});

test('editarPresupuesto: mismo monto no escribe nada', () => {
  const pres = hojaPresupuesto();
  const m = crearMotor({ hojas: [pres] });
  const r = pedirEdicion(m, { monto: 90 });
  assert.equal(r.ok, true);
  assert.equal(r.datos.actualizado, false);
  assert.deepEqual(pres.escrituras, []);
});

test('editarPresupuesto: se niega si la celda cambió, tiene fórmula, está combinada o no es número', () => {
  const casos = [
    [{}, { montoAnterior: 91 }, 'El monto de esa línea cambió en el Sheets. Actualiza y vuelve a intentar.'],
    [{ formulas: { '5,3': '=B5*1.1' } }, {}, 'Ese monto se calcula con una fórmula y no se cambia desde la app. Edítalo en el Sheets.'],
    [{ combinadas: ['5,3'] }, {}, 'Esa celda está combinada con otras y no se cambia desde la app. Edítala en el Sheets.'],
    [{}, { concepto: 'Agua' }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{}, { fila: 6 }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{}, { fila: 11, concepto: 'TOTAL GASTOS', montoAnterior: 775.5 }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{}, { fila: 2, concepto: 'Concepto / Categoría' }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{}, { fila: 500 }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{}, { mes: '2030-01' }, 'Ese mes no está en el presupuesto.']
  ];
  for (const [opciones, cambios, mensaje] of casos) {
    const pres = hojaPresupuesto(opciones);
    const m = crearMotor({ hojas: [pres] });
    assert.deepEqual(pedirEdicion(m, cambios), { ok: false, codigo: 'datos_invalidos', error: mensaje });
    assert.deepEqual(pres.escrituras, [], 'no debe escribir: ' + mensaje);
  }

  // Celda con texto en vez de número.
  const pres = hojaPresupuesto();
  pres.valores[4][2] = '90 aprox';
  const m = crearMotor({ hojas: [pres] });
  const r = pedirEdicion(m, { montoAnterior: 0 });
  assert.equal(r.error, 'Esa celda no contiene un número simple y no se cambia desde la app. Edítala en el Sheets.');
  assert.deepEqual(pres.escrituras, []);
});

test('editarPresupuesto: rechaza montos no razonables y datos incompletos sin leer ni escribir', () => {
  const pres = hojaPresupuesto();
  const m = crearMotor({ hojas: [pres] });
  const casos = [
    [{ monto: -1 }, 'El monto no puede ser negativo.'],
    [{ monto: '-5' }, 'El monto no puede ser negativo.'],
    [{ monto: 1000000.01 }, 'El monto es demasiado grande (máximo 1,000,000).'],
    [{ monto: 'abc' }, 'El monto debe ser un número.'],
    [{ monto: null }, 'El monto debe ser un número.'],
    [{ monto: undefined }, 'El monto debe ser un número.'],
    [{ monto: true }, 'El monto debe ser un número.'],
    [{ monto: [5] }, 'El monto debe ser un número.'],
    [{ montoAnterior: undefined }, 'Falta el monto que mostraba la app (montoAnterior).'],
    [{ montoAnterior: 'x' }, 'Falta el monto que mostraba la app (montoAnterior).'],
    [{ mes: undefined }, 'Falta el mes.'],
    [{ mes: '2026-13' }, 'El mes no es válido.'],
    [{ fila: '5' }, 'No se indicó la línea del presupuesto.'],
    [{ fila: 0 }, 'No se indicó la línea del presupuesto.'],
    [{ concepto: '' }, 'Falta el concepto.'],
    [{ idCliente: undefined }, 'Falta el identificador del registro.']
  ];
  for (const [cambios, mensaje] of casos) {
    assert.deepEqual(pedirEdicion(m, cambios), { ok: false, codigo: 'datos_invalidos', error: mensaje });
  }
  assert.equal(pedirEdicion(m, { monto: 1000000 }).datos.monto, 1000000, 'el máximo exacto sí vale');
  assert.deepEqual(pres.escrituras, [{ fila: 5, col: 3, valor: 1000000 }]);
});

test('editarPresupuesto y marcarFijo conviven: la marca de pagado sobrevive al cambio de monto', () => {
  const pres = hojaPresupuesto();
  const m = crearMotor({ hojas: [pres], hoy: '2026-11-06' });
  const fijo = m.llamar('marcarFijo', { idCliente: ID, mes: '2026-11', fila: 6, concepto: 'Internet', pagado: true });
  assert.equal(fijo.datos.pagadoNota, 'Pagado el 06/11/2026 · PersonaA');
  const r = pedirEdicion(m, { fila: 6, concepto: 'Internet', montoAnterior: 100, monto: 110 });
  assert.equal(r.datos.pagadoNota, 'Pagado el 06/11/2026 · PersonaA');
  const linea = m.llamar('presupuesto', { mes: '2026-11' }).datos.filas.find((f) => f.fila === 6);
  assert.deepEqual({ monto: linea.monto, pagado: linea.pagado }, { monto: 110, pagado: true });
});

// ---------- ahorros ----------

test('ahorros: acumulado por meta hasta el mes pedido', () => {
  const m = crearMotor({ hojas: [hojaPresupuesto()] });
  const r = m.llamar('ahorros', { mes: '2026-11' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    mes: '2026-11', etiquetaMes: 'nov-26', desde: '2026-10',
    metas: [
      { concepto: 'Ahorro Casa', fila: 8, acumulado: 110, delMes: 60, retirado: 0, disponible: 110,
        meses: [{ mes: '2026-10', etiqueta: 'oct-26', monto: 50 }, { mes: '2026-11', etiqueta: 'nov-26', monto: 60 }] },
      { concepto: 'Ahorro Viaje', fila: 9, acumulado: 25.5, delMes: 25.5, retirado: 0, disponible: 25.5,
        meses: [{ mes: '2026-10', etiqueta: 'oct-26', monto: 0 }, { mes: '2026-11', etiqueta: 'nov-26', monto: 25.5 }] },
      { concepto: 'Fondo de Emergencia', fila: 10, acumulado: 20, delMes: 0, retirado: 0, disponible: 20,
        meses: [{ mes: '2026-10', etiqueta: 'oct-26', monto: 20 }, { mes: '2026-11', etiqueta: 'nov-26', monto: 0 }] }
    ],
    total: 155.5, totalDelMes: 85.5
  });
  assert.deepEqual(m.llamar('ahorros', { mes: '2031-05' }),
    { ok: false, codigo: 'datos_invalidos', error: 'Ese mes no está en el presupuesto.' });
  assert.equal(m.llamar('ahorros', { mes: 'noviembre' }).error, 'El mes no es válido.');
  // Sin mes usa el mes actual del servidor (igual que 'presupuesto').
  assert.equal(m.llamar('ahorros', {}).datos.mes, '2026-11');
});

// ---------- Avisos de vencimiento ----------

// TC SIP sintética: las filas 4 (40.50) y la 3 si se desmarca vencen el 09/11/2026.
function motorDeAvisos(config) {
  return crearMotor(Object.assign({ hojas: hojasDeConsumos() }, config || {}));
}

test('avisosDeVencimiento: manda un solo correo a los usuarios y no lo repite el mismo día', () => {
  const m = motorDeAvisos({ hoy: '2026-11-06' }); // faltan 3 días para el 09/11
  const r = m.contexto.avisosDeVencimiento();
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { enviado: true, avisos: 1, destinatarios: 2 });
  assert.equal(m.correos.length, 1);
  assert.equal(m.correos[0].to, 'persona-a@example.test,persona-b@example.test');
  assert.equal(m.correos[0].subject, 'FinFamily: TC SIP vence en 3 días (S/ 40.50)');
  assert.match(m.correos[0].body, /TC SIP: S\/ 40\.50 — vence en 3 días \(09\/11\/2026\)/);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_AVISOS), { fecha: '2026-11-06', claves: ['2026-11-06|SIP|2026-11-09'] });

  // Segunda pasada el mismo día: nada.
  assert.equal(m.contexto.avisosDeVencimiento().enviado, false);
  assert.equal(m.correos.length, 1);

  // A 2 días no se avisa; la víspera y el mismo día sí, una vez cada día.
  m.estado.hoy = '2026-11-07';
  assert.equal(m.contexto.avisosDeVencimiento().enviado, false);
  m.estado.hoy = '2026-11-08';
  assert.equal(m.contexto.avisosDeVencimiento().enviado, true);
  assert.equal(m.correos[1].subject, 'FinFamily: TC SIP vence mañana (S/ 40.50)');
  m.estado.hoy = '2026-11-09';
  assert.equal(m.contexto.avisosDeVencimiento().enviado, true);
  assert.equal(m.contexto.avisosDeVencimiento().enviado, false);
  assert.equal(m.correos[2].subject, 'FinFamily: TC SIP vence HOY (S/ 40.50)');
  // Ya vencida: este aviso no insiste.
  m.estado.hoy = '2026-11-10';
  assert.equal(m.contexto.avisosDeVencimiento().enviado, false);
  assert.equal(m.correos.length, 3);
});

test('avisosDeVencimiento: sin deuda no manda nada y nunca escribe en las hojas', () => {
  const sip = hojaSip();
  sip.valores[3][8] = 'Pagado'; // la única pendiente pasa a pagada
  const hojas = hojasDeConsumos(sip);
  const m = crearMotor({ hojas, hoy: '2026-11-09' });
  assert.equal(m.contexto.avisosDeVencimiento().enviado, false);
  assert.equal(m.correos.length, 0);
  assert.equal(m.propiedades.FINFAMILY_AVISOS, undefined);

  const conDeuda = motorDeAvisos({ hoy: '2026-11-09' });
  conDeuda.contexto.avisosDeVencimiento();
  assert.equal(conDeuda.correos.length, 1);
  hojas.forEach((h) => assert.deepEqual(h.escrituras, []));
});

test('avisosDeVencimiento: si el correo falla o no hay cuota, no lo da por avisado', () => {
  const sinCuota = motorDeAvisos({ hoy: '2026-11-09', cuotaCorreo: 1 });
  assert.equal(sinCuota.contexto.avisosDeVencimiento().motivo, 'sin cuota de correo');
  assert.equal(sinCuota.propiedades.FINFAMILY_AVISOS, undefined);
  sinCuota.estado.cuotaCorreo = 50;
  assert.equal(sinCuota.contexto.avisosDeVencimiento().enviado, true);

  const falla = motorDeAvisos({ hoy: '2026-11-09', correoFalla: true });
  assert.throws(() => falla.contexto.avisosDeVencimiento(), /fallo de correo simulado/);
  assert.equal(falla.propiedades.FINFAMILY_AVISOS, undefined);

  // Una propiedad dañada o de otro día no impide avisar.
  const danada = motorDeAvisos({ hoy: '2026-11-09', propiedades: { FINFAMILY_AVISOS: '{no es json' } });
  assert.equal(danada.contexto.avisosDeVencimiento().enviado, true);
  const deAyer = motorDeAvisos({ hoy: '2026-11-09',
    propiedades: { FINFAMILY_AVISOS: JSON.stringify({ fecha: '2026-11-08', claves: ['2026-11-09|SIP|2026-11-09'] }) } });
  assert.equal(deAyer.contexto.avisosDeVencimiento().enviado, true);
});

test('instalarAvisos y quitarAvisos: un solo activador diario y no tocan activadores ajenos', () => {
  const m = motorDeAvisos({ activadores: ['otraFuncionDelDueno', 'avisosDeVencimiento'] });
  m.contexto.instalarAvisos();
  m.contexto.instalarAvisos(); // ejecutarlo dos veces no duplica
  const propios = m.activadores.filter((a) => a.nombre === 'avisosDeVencimiento');
  assert.equal(propios.length, 1);
  assert.deepEqual({ dias: propios[0].cadaDias, hora: propios[0].hora, zona: propios[0].zona },
    { dias: 1, hora: 8, zona: 'America/Lima' });
  assert.equal(m.activadores.filter((a) => a.nombre === 'otraFuncionDelDueno').length, 1);

  m.propiedades.FINFAMILY_AVISOS = '{}';
  m.contexto.quitarAvisos();
  assert.deepEqual(m.activadores.map((a) => a.nombre), ['otraFuncionDelDueno']);
  assert.equal(m.propiedades.FINFAMILY_AVISOS, undefined);
  assert.equal(m.propiedades.USUARIOS, JSON.stringify(USUARIOS), 'las demás propiedades no se tocan');
});

// ===========================================================================
// Motor 1.3: registrar con responsable, gasto grande, ajustes, tarjetas,
// lector de Gmail, bandeja "Por confirmar", alertas y calendario
// ===========================================================================

function hojaConfig() {
  return new HojaFalsa('Configuración', [
    ['Conceptos de Gasto', 'Responsable'], ['Supermercado', 'PersonaA'], ['Delivery', 'PersonaB'],
    ['Luz', ''], ['Ropa y Calzado', '']
  ]);
}

// TC BCP sintética con un consumo de noviembre (concepto Luz, 75) que vence el 20/12/2026.
function hojaBcpConLuz() {
  return hojaTc('TC BCP', [
    ['PersonaA', 'Noviembre', fecha(2026, 11, 3), 'Luz', 'Recibo luz sintético', 75,
      fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', '', '']
  ]);
}

/** Motor con todas las hojas (consumos, presupuesto y configuración). */
function motorCompleto(config) {
  const c = config || {};
  const hojas = [hojaSip(), hojaTc('TC IBK', []), c.bcp || hojaTc('TC BCP', []), hojaTc('TC Ripley', []),
    c.hormiga || new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado']]),
    hojaPresupuesto(), hojaConfig()];
  return crearMotor(Object.assign({ hojas }, c));
}

function hojaDe(m, nombre) {
  return m.hojas.find((h) => h.nombre === nombre);
}

const GASTO = { idCliente: ID, monto: 45, medio: 'TC_IBK', concepto: 'delivery', descripcion: 'Pedido de prueba', fecha: '2026-11-05' };

// ---------- registrar con responsable ----------

test('registrar: sin responsable usa al de la sesión; con responsable válido lo respeta (y cambia la tarjeta IBK)', () => {
  const m = motorCompleto();
  const ibk = hojaDe(m, 'TC IBK');
  const r1 = m.llamar('registrar', GASTO);
  assert.deepEqual(r1, { ok: true, datos: { guardado: true, hoja: 'TC IBK', fila: 3, duplicadoId: false } });
  assert.equal(ibk.valores[2][0], 'PersonaA');
  assert.equal(ibk.valores[2][3], 'Delivery', 'el concepto se guarda como está en Configuración');
  assert.equal(ibk.valores[2][7].getDate(), 15, 'vence el 15: ciclo IBK_P');

  // PersonaB (en minúsculas) como responsable: fila a su nombre y ciclo IBK_B (vence el 20).
  const r2 = m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', monto: 46, responsable: 'PersonaB' }));
  assert.equal(r2.datos.guardado, true);
  assert.equal(r2.datos.fila, 4);
  assert.equal(ibk.valores[3][0], 'PersonaB');
  assert.equal(ibk.valores[3][7].getDate(), 20);
  assert.equal(ibk.valores[3][6].getDate(), 30);
});

test('registrar: un responsable que no está en USUARIOS se rechaza sin escribir', () => {
  const m = motorCompleto();
  const r = m.llamar('registrar', Object.assign({}, GASTO, { responsable: 'PersonaC' }));
  assert.deepEqual(r, { ok: false, codigo: 'datos_invalidos', error: 'Ese responsable no está en la lista de usuarios.' });
  assert.deepEqual(hojaDe(m, 'TC IBK').escrituras, []);
  // Vacío o solo espacios cuenta como "no vino".
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { responsable: '  ' })).datos.guardado, true);
});

// ---------- gasto grande ----------

test('gasto grande: desde S/ 300 (por defecto) manda un correo inmediato a los usuarios', () => {
  const m = motorCompleto();
  const chico = m.llamar('registrar', Object.assign({}, GASTO, { monto: 299.99, medio: 'TC_BCP' }));
  assert.equal(chico.datos.guardado, true);
  assert.equal(m.correos.length, 0);

  const grande = m.llamar('registrar', { idCliente: 'prueba-0003', monto: 450, medio: 'TC_BCP', concepto: 'Ropa y Calzado',
    descripcion: 'Saga Falabella', fecha: '2026-11-06' });
  assert.equal(grande.datos.guardado, true);
  assert.equal(m.correos.length, 1);
  assert.equal(m.correos[0].to, 'persona-a@example.test,persona-b@example.test');
  assert.equal(m.correos[0].name, 'FinFamily');
  assert.equal(m.correos[0].subject, 'FinFamily: PersonaA registró S/ 450 en Saga Falabella (TC BCP)');
  assert.match(m.correos[0].body, /Concepto: Ropa y Calzado\./);
  assert.match(m.correos[0].body, /Fecha: 06\/11\/2026\./);
  // Reintento del mismo idCliente: no se guarda de nuevo ni se vuelve a avisar.
  assert.equal(m.llamar('registrar', { idCliente: 'prueba-0003', monto: 450, medio: 'TC_BCP', concepto: 'Ropa y Calzado',
    descripcion: 'Saga Falabella', fecha: '2026-11-06' }).datos.duplicadoId, true);
  assert.equal(m.correos.length, 1);
});

test('gasto grande: si el correo falla el registro se guarda igual; con gastoGrande 0 no avisa', () => {
  const falla = motorCompleto({ correoFalla: true });
  const r = falla.llamar('registrar', Object.assign({}, GASTO, { monto: 900 }));
  assert.equal(r.datos.guardado, true);
  assert.equal(hojaDe(falla, 'TC IBK').valores[2][5], 900);
  assert.ok(falla.avisosConsola.some((t) => /gasto grande/.test(t)), 'queda anotado en el registro');

  const apagado = motorCompleto({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ gastoGrande: 0 }) } });
  assert.equal(apagado.llamar('registrar', Object.assign({}, GASTO, { monto: 5000 })).datos.guardado, true);
  assert.equal(apagado.correos.length, 0);

  const umbral = motorCompleto({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ gastoGrande: 40 }) } });
  umbral.llamar('registrar', GASTO); // 45 >= 40
  assert.equal(umbral.correos.length, 1);
});

// ---------- ajustesAvisos / guardarAjustesAvisos ----------

test('ajustesAvisos: valores por defecto; guardarAjustesAvisos mezcla y valida', () => {
  const m = motorCompleto();
  const defecto = { vencimiento: true, presupuesto: true, gastoGrande: 300, resumenSemanal: true, calendario: true, recordatorio: true };
  assert.deepEqual(m.llamar('ajustesAvisos', {}), { ok: true, datos: { ajustes: defecto } });

  const r = m.llamar('guardarAjustesAvisos', { gastoGrande: 500, calendario: false });
  assert.deepEqual(r.datos.ajustes, Object.assign({}, defecto, { gastoGrande: 500, calendario: false }));
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_AJUSTES_AVISOS), r.datos.ajustes);
  assert.deepEqual(m.llamar('ajustesAvisos', {}).datos.ajustes, r.datos.ajustes);
  // 0 apaga el aviso de gasto grande; 100000 es el máximo.
  assert.equal(m.llamar('guardarAjustesAvisos', { gastoGrande: 0 }).datos.ajustes.gastoGrande, 0);
  assert.equal(m.llamar('guardarAjustesAvisos', { gastoGrande: '100,000' }).datos.ajustes.gastoGrande, 100000);

  const errores = [
    [{ gastoGrande: -1 }, 'El monto de gasto grande no puede ser negativo.'],
    [{ gastoGrande: 100000.5 }, 'El monto de gasto grande es demasiado alto (máximo 100,000).'],
    [{ gastoGrande: 'mucho' }, 'El monto de gasto grande debe ser un número.'],
    [{ vencimiento: 'si' }, 'El ajuste "vencimiento" debe ser sí o no.'],
    [{ resumenSemanal: 1 }, 'El ajuste "resumenSemanal" debe ser sí o no.']
  ];
  for (const [datos, error] of errores) {
    assert.deepEqual(m.llamar('guardarAjustesAvisos', datos), { ok: false, codigo: 'datos_invalidos', error });
  }
  // Una propiedad dañada vuelve a los valores por defecto.
  const danado = motorCompleto({ propiedades: { FINFAMILY_AJUSTES_AVISOS: '{roto' } });
  assert.deepEqual(danado.llamar('ajustesAvisos', {}).datos.ajustes, defecto);
});

// ---------- datosTarjetas / guardarDatosTarjeta ----------

test('datosTarjetas: siempre las 5 tarjetas; guardarDatosTarjeta valida y guarda una', () => {
  const m = motorCompleto();
  const vacia = { digitos: '', red: '', nombre: '' };
  assert.deepEqual(m.llamar('datosTarjetas', {}).datos, { tarjetas: { SIP: vacia, IBK_P: vacia, IBK_B: vacia, BCP: vacia, RIPLEY: vacia } });

  const r = m.llamar('guardarDatosTarjeta', { id: 'IBK_B', digitos: '5566', red: 'Visa', nombre: '  Interbank  PersonaB ' });
  assert.deepEqual(r.datos.tarjetas.IBK_B, { digitos: '5566', red: 'visa', nombre: 'Interbank PersonaB' });
  assert.deepEqual(r.datos.tarjetas.SIP, vacia);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_TARJETAS).IBK_B, { digitos: '5566', red: 'visa', nombre: 'Interbank PersonaB' });
  assert.equal(m.llamar('guardarDatosTarjeta', { id: 'BCP', digitos: 4821, red: 'mastercard', nombre: 'BCP' }).datos.tarjetas.BCP.digitos, '4821');
  assert.deepEqual(m.llamar('guardarDatosTarjeta', { id: 'IBK_B' }).datos.tarjetas.IBK_B, vacia, 'sin campos deja la tarjeta vacía');

  const errores = [
    [{ id: 'HORMIGA', digitos: '1234' }, 'La tarjeta no es válida (SIP, IBK_P, IBK_B, BCP, RIPLEY).'],
    [{ id: 'SIP', digitos: '12a4' }, 'Los últimos dígitos deben ser 4 números.'],
    [{ id: 'SIP', digitos: '12345' }, 'Los últimos dígitos deben ser 4 números.'],
    [{ id: 'SIP', red: 'amex' }, 'La red debe ser visa o mastercard.'],
    [{ id: 'SIP', nombre: 'x'.repeat(27) }, 'El nombre de la tarjeta es muy largo (máximo 26 caracteres).']
  ];
  for (const [datos, error] of errores) {
    assert.deepEqual(m.llamar('guardarDatosTarjeta', datos), { ok: false, codigo: 'datos_invalidos', error });
  }
});

// ---------- lector de Gmail ----------

const HILOS_BANCOS = [
  { mensajes: [{ id: 'msg-bcp-1', de: 'BCP <notificaciones@bcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Crédito BCP',
    cuerpo: 'Realizaste un consumo de S/ 85.90 en PLAZA VEA con tu Tarjeta de Crédito terminada en 4821 el 08/11/2026 a las 20:15.',
    fecha: new Date(2026, 10, 8, 20, 15) }] },
  { mensajes: [{ id: 'msg-ibk-1', de: 'Interbank <alertas@interbank.pe>', asunto: 'Compra con tu Tarjeta Interbank',
    cuerpo: 'Hola PersonaB, realizaste una compra por S/. 45 en TOTTUS LA MARINA con tu tarjeta Visa **** 5566 el 09-11-2026 a las 13:40.',
    fecha: new Date(2026, 10, 9, 13, 40) }] },
  { mensajes: [{ id: 'msg-bcp-pago', de: 'notificaciones@bcp.com.pe', asunto: 'Pago recibido de tu Tarjeta de Crédito',
    cuerpo: 'Recibimos tu pago de S/ 1,500. Gracias.', fecha: new Date(2026, 10, 9, 9, 0) }] },
  { mensajes: [{ id: 'msg-roto', de: 'alertas@interbank.pe', asunto: 'Consumo', cuerpo: '', falla: true, fecha: new Date(2026, 10, 9, 9, 5) }] },
  { mensajes: [{ id: 'msg-ibk-usd', de: 'notificaciones@interbank.com.pe', asunto: 'Consumo realizado',
    cuerpo: 'Realizaste un consumo de US$ 20.00 en NETFLIX.COM con tu Tarjeta de Crédito terminada en 9034 el 09/11/2026.',
    fecha: new Date(2026, 10, 9, 7, 0) }] }
];

function motorConCorreos(config) {
  return motorCompleto(Object.assign({
    hilos: HILOS_BANCOS.map((h) => ({ mensajes: h.mensajes.map((x) => Object.assign({}, x)) })),
    hoy: '2026-11-09',
    propiedades: { FINFAMILY_TARJETAS: JSON.stringify({ IBK_B: { digitos: '5566', red: 'visa', nombre: '' } }) }
  }, config || {}));
}

test('leerCorreosDeBancos: crea "Por confirmar", agrega solo los consumos, etiqueta los hilos y sigue si un correo falla', () => {
  const m = motorConCorreos();
  assert.equal(hojaDe(m, 'Por confirmar'), undefined);
  const r = m.contexto.leerCorreosDeBancos();
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { revisados: 5, agregados: 3 });

  const q = m.consultasGmail[0];
  assert.match(q, /newer_than:3d/);
  assert.doesNotMatch(q, /-label:/, '1.9.7: la etiqueta es del hilo; lo ya leído se salta por el Id del correo');
  assert.match(q, /from:bcp\.com\.pe/);
  assert.match(q, /from:interbank\.pe/);
  assert.match(q, /from:tarjetaoh\.pe/);
  assert.match(q, /subject:consumo/);
  assert.ok(m.etiquetasGmail['FinFamily/Leído'], 'la etiqueta se creó');
  m.hilos.forEach((h) => assert.equal(h.etiquetas.length, 1, 'todos los hilos quedan etiquetados'));
  assert.ok(m.avisosConsola.some((t) => /cuerpo ilegible simulado/.test(t)));

  const hoja = hojaDe(m, 'Por confirmar');
  assert.deepEqual(hoja.valores[0], ['Id', 'Fecha', 'Banco', 'Tarjeta', 'Comercio', 'Monto', 'Moneda', 'Últimos 4',
    'Responsable sugerido', 'Estado', 'Fecha correo', 'Asunto']);
  assert.deepEqual(hoja.valores[1], ['msg-bcp-1', '2026-11-08', 'BCP', 'BCP', 'PLAZA VEA', 85.9, 'PEN', '4821', '', 'Pendiente',
    '2026-11-08 20:15', 'Realizaste un consumo con tu Tarjeta de Crédito BCP']);
  assert.deepEqual(hoja.valores[2].slice(0, 10), ['msg-ibk-1', '2026-11-09', 'IBK', 'IBK_B', 'TOTTUS LA MARINA', 45, 'PEN', '5566', 'PersonaB', 'Pendiente']);
  assert.deepEqual(hoja.valores[3].slice(0, 10), ['msg-ibk-usd', '2026-11-09', 'IBK', 'IBK_P', 'NETFLIX.COM', 20, 'USD', '9034', '', 'Pendiente']);
  assert.equal(hoja.valores.length, 4);
  // Las hojas de tarjetas no se tocan.
  assert.deepEqual(hojaDe(m, 'TC BCP').escrituras, []);
});

test('leerCorreosDeBancos: una segunda pasada no duplica (ni por etiqueta ni por Id)', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 0);
  // Si alguien quita la etiqueta a mano, el Id del mensaje sigue protegiendo.
  m.hilos.forEach((h) => { h.etiquetas = []; });
  const r = m.contexto.leerCorreosDeBancos();
  assert.equal(r.agregados, 0);
  assert.equal(hojaDe(m, 'Por confirmar').valores.length, 4);
  // Sin correos nuevos no crea la hoja ni toca nada.
  const vacio = motorCompleto({ hilos: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(vacio.contexto.leerCorreosDeBancos())), { revisados: 0, agregados: 0 });
  assert.equal(hojaDe(vacio, 'Por confirmar'), undefined);
});

// ---------- pendientes / confirmarPendiente / descartarPendiente ----------

test('pendientes e inicio.pendientes: solo los pendientes, más recientes primero; sin hoja, lista vacía', () => {
  const sinHoja = motorCompleto();
  assert.deepEqual(sinHoja.llamar('pendientes', {}).datos, { pendientes: [], total: 0 });
  assert.equal(sinHoja.llamar('inicio', {}).datos.pendientes, 0);

  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('pendientes', {});
  assert.equal(r.datos.total, 3);
  assert.deepEqual(r.datos.pendientes.map((p) => p.id), ['msg-ibk-1', 'msg-ibk-usd', 'msg-bcp-1']);
  assert.deepEqual(r.datos.pendientes[0], {
    id: 'msg-ibk-1', fecha: '2026-11-09', banco: 'IBK', tarjeta: 'IBK_B', comercio: 'TOTTUS LA MARINA', monto: 45, moneda: 'PEN',
    ultimos4: '5566', responsable: 'PersonaB', fechaCorreo: '2026-11-09 13:40', medioSugerido: 'TC_IBK'
  });
  assert.equal(m.llamar('inicio', {}).datos.pendientes, 3);
});

test('confirmarPendiente: registra el gasto como "registrar" y marca la fila como Confirmado', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado' });
  assert.deepEqual(r, { ok: true, datos: { confirmado: true, hoja: 'TC BCP', fila: 3 } });
  const bcp = hojaDe(m, 'TC BCP');
  assert.equal(bcp.valores[2][0], 'PersonaA', 'sin responsable: el de la sesión');
  assert.equal(bcp.valores[2][3], 'Supermercado');
  assert.equal(bcp.valores[2][4], 'PLAZA VEA', 'la descripción por defecto es el comercio');
  assert.equal(bcp.valores[2][5], 85.9);
  assert.equal(bcp.valores[2][2].getDate(), 8, 'la fecha es la del consumo');
  assert.equal(bcp.valores[2][8], 'Pendiente');
  assert.equal(bcp.valores[2][10], 'APP:' + ID);
  assert.equal(hojaDe(m, 'Por confirmar').valores[1][9], 'Confirmado');
  assert.equal(m.llamar('pendientes', {}).datos.total, 2);

  // Ya confirmado: no se registra dos veces.
  assert.deepEqual(m.llamar('confirmarPendiente', { idCliente: 'prueba-0002', id: 'msg-bcp-1', concepto: 'Supermercado' }).datos,
    { confirmado: false, yaEstaba: true });
  assert.equal(bcp.valores.length, 3);

  // Con responsable, descripción, nota y medio propios.
  const r2 = m.llamar('confirmarPendiente', { idCliente: 'prueba-0003', id: 'msg-ibk-1', concepto: 'Delivery',
    responsable: 'PersonaB', descripcion: 'Compras Tottus', nota: 'del correo', medio: 'TC_IBK' });
  assert.deepEqual(r2.datos, { confirmado: true, hoja: 'TC IBK', fila: 3 });
  const ibk = hojaDe(m, 'TC IBK');
  assert.deepEqual([ibk.valores[2][0], ibk.valores[2][4], ibk.valores[2][9], ibk.valores[2][7].getDate()], ['PersonaB', 'Compras Tottus', 'del correo', 20]);
  assert.equal(m.correos.length, 0, 'ninguno llega al umbral de gasto grande');
});

test('confirmarPendiente: dólares, concepto desconocido, medio que no es tarjeta e id inexistente se rechazan', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  const usd = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-ibk-usd', concepto: 'Supermercado' });
  assert.equal(usd.codigo, 'datos_invalidos');
  assert.match(usd.error, /dólares \(US\$ 20\.00\)/);
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Viajes' }).error,
    'El concepto no está en la lista de Configuración.');
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado', medio: 'TARJETA' }).error,
    'El medio de pago no es válido.');
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado', responsable: 'PersonaC' }).error,
    'Ese responsable no está en la lista de usuarios.');
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, id: 'no-existe', concepto: 'Supermercado' }).error,
    'Ese consumo ya no está en la bandeja "Por confirmar".');
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, concepto: 'Supermercado' }).error, 'Falta el identificador del consumo.');
  assert.equal(m.llamar('confirmarPendiente', { id: 'msg-bcp-1', concepto: 'Supermercado' }).error, 'Falta el identificador del registro.');
  // Nada de eso escribió en las hojas ni cambió estados.
  assert.deepEqual(hojaDe(m, 'TC BCP').escrituras, []);
  assert.ok(hojaDe(m, 'Por confirmar').valores.slice(1).every((f) => f[9] === 'Pendiente'));
  assert.equal(m.llamar('pendientes', {}).datos.total, 3);
});

test('confirmarPendiente: un gasto grande confirmado avisa por correo; un posible duplicado pregunta antes', () => {
  const m = motorConCorreos({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ gastoGrande: 50 }),
    FINFAMILY_TARJETAS: JSON.stringify({ IBK_B: { digitos: '5566' } }) } });
  m.contexto.leerCorreosDeBancos();
  m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado' });
  assert.equal(m.correos.length, 1);
  assert.equal(m.correos[0].subject, 'FinFamily: PersonaA registró S/ 85.90 en PLAZA VEA (TC BCP)');

  // El mismo gasto registrado antes a mano: parece repetido y la fila sigue Pendiente.
  m.llamar('registrar', { idCliente: 'prueba-0010', monto: 45, medio: 'TC_IBK', concepto: 'Delivery', descripcion: 'TOTTUS LA MARINA', fecha: '2026-11-09' });
  const dup = m.llamar('confirmarPendiente', { idCliente: 'prueba-0011', id: 'msg-ibk-1', concepto: 'Delivery' });
  assert.equal(dup.datos.confirmado, false);
  assert.equal(dup.datos.posibleDuplicado, true);
  assert.equal(dup.datos.coincidencia.monto, 45);
  assert.equal(hojaDe(m, 'Por confirmar').valores[2][9], 'Pendiente');
  const forzado = m.llamar('confirmarPendiente', { idCliente: 'prueba-0011', id: 'msg-ibk-1', concepto: 'Delivery', confirmarDuplicado: true });
  assert.equal(forzado.datos.confirmado, true);
  assert.equal(hojaDe(m, 'Por confirmar').valores[2][9], 'Confirmado');
});

test('descartarPendiente: marca Descartado sin registrar nada; un confirmado no se descarta', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  assert.deepEqual(m.llamar('descartarPendiente', { id: 'msg-ibk-usd' }), { ok: true, datos: { descartado: true } });
  assert.equal(hojaDe(m, 'Por confirmar').valores[3][9], 'Descartado');
  assert.equal(m.llamar('pendientes', {}).datos.total, 2);
  assert.deepEqual(m.llamar('descartarPendiente', { id: 'msg-ibk-usd' }).datos, { descartado: true }, 'descartar dos veces no molesta');
  m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado' });
  assert.deepEqual(m.llamar('descartarPendiente', { id: 'msg-bcp-1' }).datos, { descartado: false, yaEstaba: true });
  assert.equal(m.llamar('descartarPendiente', { id: 'otro' }).codigo, 'datos_invalidos');
  assert.equal(m.llamar('descartarPendiente', {}).error, 'Falta el identificador del consumo.');
  ['TC IBK', 'TC SIP', 'TC Ripley', 'Gastos Hormiga'].forEach((n) => assert.deepEqual(hojaDe(m, n).escrituras, []));
});

// ---------- lector 1.7.0: correos reales de BCP (débito y Plin) y confirmar con medio PLIN ----------

const BCP_DEBITO = (comercio) => ({
  id: 'msg-bcp-' + comercio.replace(/\W+/g, '').toLowerCase(),
  de: '"BCP Notificaciones" <notificaciones@notificacionesbcp.com.pe>',
  asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP',
  cuerpo: 'Hola PersonaA, Realizaste un consumo de S/ 26.40 con tu Tarjeta de Débito BCP en ' + comercio + '. ' +
    'Por tu seguridad, te enviamos los datos de tu operación. Monto Total del consumo S/ 26.40 Datos de la operación ' +
    'Operación realizada Consumo Tarjeta de Débito Fecha y hora 07 de noviembre de 2026 - 05:47 PM ' +
    'Número de Tarjeta de Débito ************4826 Empresa ' + comercio + ' Número de operación 123456 Descargar ¿No reconoces esta operación? ...',
  fecha: new Date(2026, 10, 7, 17, 48)
});

test('lector con correos reales: débito BCP va como efectivo (de la cuenta de quien recibe el correo) y "PLIN-…" queda legible con medio sugerido PLIN', () => {
  const m = motorCompleto({ hoy: '2026-11-09', hilos: [
    { mensajes: [BCP_DEBITO('MERCADO DE PRUEBA')] },
    { mensajes: [BCP_DEBITO('PLIN-PersonaB')] },
    { mensajes: [{ id: 'msg-ripley-orden', de: 'Ripley.com <no-reply@ripley.com>', asunto: '¡Confirmamos tu compra!',
      cuerpo: 'Confirmamos tu compra N° 1 por S/ 259.90.', fecha: new Date(2026, 10, 8) }] }
  ] });
  assert.match(m.contexto.consultaGmail_(), /from:notificacionesbcp\.com\.pe/);
  assert.match(m.contexto.consultaGmail_(), /from:operaciones\.agora\.pe/);
  assert.match(m.contexto.consultaGmail_(), /subject:realizaste/);
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 2);
  const hoja = hojaDe(m, 'Por confirmar');
  assert.deepEqual(hoja.valores[1].slice(0, 9), ['msg-bcp-mercadodeprueba', '2026-11-07', 'BCP', 'DEBITO_BCP', 'MERCADO DE PRUEBA', 26.4, 'PEN', '4826', 'PersonaA']);
  assert.equal(hoja.valores[2][4], 'Plin a Personab');
  const p = m.llamar('pendientes', {}).datos.pendientes;
  assert.deepEqual(p.map((x) => [x.comercio, x.medioSugerido]), [['Plin a Personab', 'PLIN'], ['MERCADO DE PRUEBA', 'EFECTIVO']]);
  assert.equal(p[0].fechaCorreo, '2026-11-07 17:48');

  // Confirmar el Plin sin indicar medio: va a Gastos Hormiga como Pagado, con medio "Plin".
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-plinpersonab', concepto: 'Delivery' });
  assert.deepEqual(r.datos, { confirmado: true, hoja: 'Gastos Hormiga', fila: 2 });
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.deepEqual(hormiga.valores[1], ['PersonaA', 'Noviembre', hormiga.valores[1][2], 'Delivery', 'Plin a Personab', 26.4, 'Plin', 'Pagado']);
  assert.equal(hormiga.valores[1][2].getDate(), 7);
  assert.deepEqual(hojaDe(m, 'TC BCP').escrituras, []);
  // El de OXXO con medio explícito YAPE también va a hormiga; con EFECTIVO igual se acepta.
  const r2 = m.llamar('confirmarPendiente', { idCliente: 'prueba-0002', id: 'msg-bcp-mercadodeprueba', concepto: 'Supermercado', medio: 'YAPE' });
  assert.deepEqual(r2.datos, { confirmado: true, hoja: 'Gastos Hormiga', fila: 3 });
  assert.equal(hormiga.valores[2][6], 'Yape');
  assert.equal(m.llamar('pendientes', {}).datos.total, 0);
});

// ---------- revisarAlertas: presupuesto ----------

test('revisarAlertas (presupuesto): avisa al 80 % una vez y al 100 % otra, y lo recuerda en Properties', () => {
  // Viernes 6 nov: sin resumen semanal. Cobran a fin de mes: el 6 de noviembre se gasta el presupuesto de octubre
  // (Luz S/ 80, del 31 oct al 29 nov).
  // Con tarjeta de crédito la Luz no descuenta de la línea (ya cuenta en TC BCP): aquí se pagó en efectivo (1.21.1).
  const m = motorCompleto({ hormiga: new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado'],
    ['PersonaA', 'Noviembre', fecha(2026, 11, 3), 'Luz', 'Recibo luz sintético', 75, 'Efectivo', '']]), hoy: '2026-11-06',
    propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ recordatorio: false }) } });
  const r = m.contexto.revisarAlertas();
  assert.equal(r.presupuesto.enviado, true);
  assert.equal(r.presupuesto.avisos, 1);
  assert.equal(r.resumenSemanal.motivo, 'no es lunes');
  assert.equal(m.correos.length, 1);
  assert.equal(m.correos[0].subject, 'FinFamily: Luz va en 93 % del presupuesto');
  assert.match(m.correos[0].body, /• Luz: llevan S\/ 75 de S\/ 80 \(93 %\), está cerca del límite\./);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ALERTAS_PRESUPUESTO), { mes: '2026-10', claves: ['2026-10|luz|80'] });

  // Segunda pasada: nada nuevo.
  assert.equal(m.contexto.revisarAlertas().presupuesto.motivo, 'nada que avisar');
  assert.equal(m.correos.length, 1);

  // Otro consumo de Luz: se pasa del 100 %, aviso nuevo (y único).
  m.llamar('registrar', { idCliente: 'prueba-0020', monto: 20, medio: 'YAPE', concepto: 'Luz', descripcion: 'Reconexión', fecha: '2026-11-06' });
  assert.equal(m.contexto.revisarAlertas().presupuesto.enviado, true);
  assert.equal(m.correos[1].subject, 'FinFamily: Luz va en 118 % del presupuesto');
  assert.match(m.correos[1].body, /ya se pasó/);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ALERTAS_PRESUPUESTO).claves.sort(), ['2026-10|luz|100', '2026-10|luz|80']);
  assert.equal(m.contexto.revisarAlertas().presupuesto.motivo, 'nada que avisar');
  assert.equal(m.correos.length, 2);

  // Con el ajuste apagado no revisa el presupuesto.
  const apagado = motorCompleto({ bcp: hojaBcpConLuz(), hoy: '2026-11-06',
    propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, calendario: false, recordatorio: false }) } });
  const ra = apagado.contexto.revisarAlertas();
  assert.equal(ra.presupuesto, undefined);
  assert.equal(ra.calendario, undefined);
  assert.equal(apagado.correos.length, 0);
});

// ---------- revisarAlertas: recordatorio de anotar (1.22.0) ----------

test('revisarAlertas (recordatorio): a quien lleva 3 días sin anotar le escribe solo a esa persona, una vez por racha', () => {
  const hormiga = () => new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado'],
    ['PersonaA', 'Noviembre', fecha(2026, 11, 3), 'Luz', 'Recibo sintético', 20, 'Efectivo', ''],
    ['PersonaB', 'Noviembre', fecha(2026, 11, 5), 'Luz', 'Recibo sintético', 20, 'Efectivo', '']]);
  const sinOtros = { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, calendario: false, resumenSemanal: false, vencimiento: false }) };
  const m = motorCompleto({ hormiga: hormiga(), hoy: '2026-11-06', propiedades: Object.assign({}, sinOtros) });
  const r = m.contexto.revisarAlertas();
  assert.equal(r.recordatorio.enviados, 1);
  const aviso = m.correos.filter((c) => /anotamos/.test(c.subject));
  assert.equal(aviso.length, 1);
  assert.equal(aviso[0].to, 'persona-a@example.test', 'solo a quien no anota');
  assert.equal(aviso[0].subject, 'FinFamily: PersonaA, ¿anotamos tus gastos?');
  assert.match(aviso[0].body, /hace 3 días que no anotas ningún gasto \(el último fue el 03\/11\/2026\)/);
  assert.match(aviso[0].body, /gasto\.html/);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_RECORDATORIO_ANOTAR), { 'persona-a@example.test': '2026-11-03' });
  // Al día siguiente no se repite (misma racha).
  assert.equal(m.contexto.revisarAlertas().recordatorio.motivo, 'nada que recordar');
  // Apagado: no revisa.
  const apagado = motorCompleto({ hormiga: hormiga(), hoy: '2026-11-06',
    propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, calendario: false, resumenSemanal: false, recordatorio: false }) } });
  assert.equal(apagado.contexto.revisarAlertas().recordatorio, undefined);
});

// ---------- revisarAlertas: resumen semanal ----------

test('revisarAlertas (resumen semanal): los lunes manda la semana anterior, una sola vez', () => {
  const m = motorCompleto({ bcp: hojaBcpConLuz(), hoy: '2026-11-09',
    propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, calendario: false, recordatorio: false }) } });
  const r = m.contexto.revisarAlertas();
  assert.equal(r.resumenSemanal.enviado, true);
  assert.equal(m.correos.length, 1);
  const c = m.correos[0];
  assert.equal(c.subject, 'FinFamily: resumen de la semana (S/ 75)');
  assert.match(c.body, /del 02\/11\/2026 al 08\/11\/2026/);
  assert.match(c.body, /Gastaron en total S\/ 75 en 1 gasto\./);
  assert.match(c.body, /• PersonaA: S\/ 75/);
  assert.match(c.body, /• Luz: S\/ 75/);
  assert.match(c.body, /Presupuesto de nov-26: llevan S\/ 75 de S\/ 775\.50\. Les quedan S\/ 700\.50\./);
  assert.match(c.body, /• TC SIP: S\/ 40\.50 vence el 09\/11\/2026/);
  assert.match(c.body, /• TC BCP: S\/ 75 vence el 20\/12\/2026/);
  assert.equal(m.propiedades.FINFAMILY_RESUMEN_SEMANAL, '2026-11-09');
  assert.equal(m.contexto.revisarAlertas().resumenSemanal.motivo, 'ya enviado');
  m.estado.hoy = '2026-11-10';
  assert.equal(m.contexto.revisarAlertas().resumenSemanal.motivo, 'no es lunes');
  assert.equal(m.correos.length, 1);
});

// ---------- calendario ----------

test('sincronizarCalendario: un evento por tarjeta con deuda, con recordatorios; actualiza, borra y nunca duplica', () => {
  const m = motorCompleto({ bcp: hojaBcpConLuz(), hoy: '2026-11-06',
    propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, resumenSemanal: false }) } });
  const r = m.contexto.revisarAlertas();
  assert.deepEqual(JSON.parse(JSON.stringify(r.calendario)), { creados: 2, actualizados: 0, borrados: 0, eventos: 2 });
  const lista = Object.values(m.eventos);
  assert.deepEqual(lista.map((e) => e.titulo), ['Vence TC SIP: S/ 40.50', 'Vence TC BCP: S/ 75']);
  assert.deepEqual(lista[0].recordatorios, [3780, 900], '3 días y 1 día antes, a las 9:00');
  assert.equal(lista[0].fecha.getDate(), 9);
  assert.equal(lista[1].fecha.getMonth(), 11);
  assert.match(lista[1].descripcion, /Pago de TC BCP por S\/ 75/);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_CALENDARIO), { 'SIP|2026-11-09': 'ev1', 'BCP|2026-12-20': 'ev2' });

  // Segunda pasada: sin cambios y sin duplicar.
  assert.deepEqual(JSON.parse(JSON.stringify(m.contexto.sincronizarCalendario())), { creados: 0, actualizados: 0, borrados: 0, eventos: 2 });
  assert.equal(Object.keys(m.eventos).length, 2);

  // Sube la deuda del BCP: se actualiza el título. Se paga la SIP: se borra su evento.
  m.llamar('registrar', { idCliente: 'prueba-0030', monto: 25, medio: 'TC_BCP', concepto: 'Luz', descripcion: 'Otro recibo', fecha: '2026-11-06' });
  hojaDe(m, 'TC SIP').valores[3][8] = 'Pagado';
  const r2 = m.contexto.sincronizarCalendario();
  assert.deepEqual(JSON.parse(JSON.stringify(r2)), { creados: 0, actualizados: 1, borrados: 1, eventos: 1 });
  assert.equal(m.eventos.ev1.borrado, true);
  assert.equal(m.eventos.ev2.titulo, 'Vence TC BCP: S/ 100');
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_CALENDARIO), { 'BCP|2026-12-20': 'ev2' });

  // Si borran el evento a mano, se vuelve a crear (sin duplicar el registro).
  m.eventos.ev2.borrado = true;
  const r3 = m.contexto.sincronizarCalendario();
  assert.deepEqual(JSON.parse(JSON.stringify(r3)), { creados: 1, actualizados: 0, borrados: 0, eventos: 1 });
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_CALENDARIO), { 'BCP|2026-12-20': 'ev3' });
});

// ---------- avisos de vencimiento respetan el ajuste ----------

test('avisosDeVencimiento: con el ajuste "vencimiento" apagado no manda nada', () => {
  const m = motorDeAvisos({ hoy: '2026-11-09', propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ vencimiento: false }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(m.contexto.avisosDeVencimiento())), { enviado: false, avisos: 0, motivo: 'apagado' });
  assert.equal(m.correos.length, 0);
  m.propiedades.FINFAMILY_AJUSTES_AVISOS = JSON.stringify({ vencimiento: true });
  assert.equal(m.contexto.avisosDeVencimiento().enviado, true);
});

// ---------- instalarTodo / quitarTodo ----------

test('instalarTodo y quitarTodo: tres activadores propios, sin duplicar y sin tocar ajenos', () => {
  const m = motorCompleto({ activadores: ['otraFuncionDelDueno'] });
  m.contexto.instalarTodo();
  m.contexto.instalarTodo();
  const propios = m.activadores.filter((a) => a.nombre !== 'otraFuncionDelDueno');
  assert.deepEqual(propios.map((a) => a.nombre).sort(), ['avisosDeVencimiento', 'leerCorreosDeBancos', 'revisarAlertas']);
  const lector = propios.find((a) => a.nombre === 'leerCorreosDeBancos');
  assert.equal(lector.cadaMinutos, 10);
  const alertas = propios.find((a) => a.nombre === 'revisarAlertas');
  assert.deepEqual({ dias: alertas.cadaDias, hora: alertas.hora, zona: alertas.zona }, { dias: 1, hora: 8, zona: 'America/Lima' });

  m.propiedades.FINFAMILY_CALENDARIO = JSON.stringify({ 'SIP|2026-11-09': 'ev-fantasma' });
  m.contexto.quitarTodo();
  assert.deepEqual(m.activadores.map((a) => a.nombre), ['otraFuncionDelDueno']);
  assert.equal(m.propiedades.FINFAMILY_CALENDARIO, undefined);
  assert.equal(m.propiedades.FINFAMILY_AJUSTES_AVISOS, undefined, 'los ajustes del usuario no estaban y siguen sin estar');
  assert.equal(m.propiedades.USUARIOS, JSON.stringify(USUARIOS));
});

// ===========================================================================
// Motor 1.4: administrar desde la app (catálogo de tarjetas, tipos de gasto, personas)
// ===========================================================================

const TARJETA_NUEVA = { idCliente: ID, nombre: 'Diners', titular: 'PersonaA', cierre: 5, vence: 25, color: 'dorado' };

test('config 1.4: medios y ciclos siguen iguales a los de siempre y llega el catálogo de tarjetas activas', () => {
  const m = motorCompleto();
  const r = m.llamar('config', {}).datos;
  assert.deepEqual(r.medios, JSON.parse(JSON.stringify(m.contexto.MEDIOS)));
  assert.deepEqual(r.ciclos, JSON.parse(JSON.stringify(m.contexto.CICLOS)));
  assert.deepEqual(r.tarjetas.map((t) => [t.id, t.nombre, t.titular, t.hoja, t.medio, t.cierre, t.vence, t.color, t.activa, t.orden]), [
    ['SIP', 'SIP · Oh!', '', 'TC SIP', 'TC_SIP', 10, 3, 'rojo', true, 1],
    ['IBK_P', 'Interbank', 'PersonaA', 'TC IBK', 'TC_IBK', 20, 15, 'verde', true, 2],
    ['IBK_B', 'Interbank', 'PersonaB', 'TC IBK', 'TC_IBK', 20, 20, 'turquesa', true, 3],
    ['BCP', 'BCP', '', 'TC BCP', 'TC_BCP', 20, 20, 'azul', true, 4],
    ['RIPLEY', 'Ripley', '', 'TC Ripley', 'TC_RIPLEY', null, null, 'gris', true, 5]
  ]);
  assert.equal(m.propiedades.FINFAMILY_CATALOGO, undefined, 'leer no guarda nada');
  const version = m.llamar('version', {}).datos;
  for (const a of ['agregarTarjeta', 'editarTarjeta', 'quitarTarjeta', 'restaurarTarjeta', 'agregarConcepto', 'renombrarConcepto',
    'quitarConcepto', 'usuarios', 'agregarUsuario', 'quitarUsuario']) {
    assert.ok(version.acciones.includes(a), 'falta ' + a);
  }
});

test('agregarTarjeta: crea la hoja con solo la fila de encabezados, genera id y medio, y la app ya puede usarla', () => {
  const m = motorCompleto();
  const r = m.llamar('agregarTarjeta', TARJETA_NUEVA);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual({ id: r.datos.id, hoja: r.datos.hoja, hojaCreada: r.datos.hojaCreada }, { id: 'DINERS', hoja: 'TC Diners', hojaCreada: true });
  const nueva = r.datos.tarjetas.find((t) => t.id === 'DINERS');
  assert.deepEqual(nueva, { id: 'DINERS', nombre: 'Diners', titular: 'PersonaA', hoja: 'TC Diners', medio: 'TC_DINERS',
    cierre: 5, vence: 25, color: 'dorado', activa: true, orden: 6, etiqueta: 'TC Diners · PersonaA' });
  assert.equal(r.datos.tarjetas.length, 6);
  assert.equal(JSON.parse(m.propiedades.FINFAMILY_CATALOGO).length, 6);

  // La hoja nueva: encabezados en la misma fila que en TC BCP (fila 2) y nada más.
  const hoja = hojaDe(m, 'TC Diners');
  assert.ok(hoja, 'se creó la hoja');
  assert.deepEqual(hoja.valores[1], ENC_TC);
  assert.ok(hoja.valores[0].every((v) => v === ''));
  assert.equal(hoja.valores.length, 2);
  assert.deepEqual(hojaDe(m, 'TC BCP').escrituras, [], 'la hoja modelo no se toca');

  // config, registrar e inicio la conocen.
  const conf = m.llamar('config', {}).datos;
  assert.ok(conf.medios.some((x) => x.id === 'TC_DINERS' && x.etiqueta === 'TC Diners' && x.hoja === 'TC Diners'));
  assert.deepEqual(conf.ciclos.DINERS, { cierre: 5, vence: 25 });
  const g = m.llamar('registrar', { idCliente: 'prueba-0040', monto: 120, medio: 'TC_DINERS', concepto: 'Delivery', descripcion: 'Cena', fecha: '2026-11-04' });
  assert.deepEqual(g.datos, { guardado: true, hoja: 'TC Diners', fila: 3, duplicadoId: false });
  assert.equal(hoja.valores[2][7].getDate(), 25, 'vence el 25 según el ciclo nuevo');
  assert.equal(hoja.valores[2][7].getMonth(), 11);
  const inicio = m.llamar('inicio', {}).datos;
  const enInicio = inicio.tarjetas.find((t) => t.id === 'DINERS');
  assert.deepEqual({ nombre: enInicio.nombre, pendiente: enInicio.pendiente, proximoVence: enInicio.proximoVence }, { nombre: 'TC Diners · PersonaA', pendiente: 120, proximoVence: '2026-12-25' });
  assert.equal(inicio.totalPorPagar, 160.5);
});

test('agregarTarjeta: validaciones, nombre repetido con sufijo, hoja ya existente se reutiliza', () => {
  const m = motorCompleto();
  const casos = [
    [{ nombre: 'D' }, 'El nombre de la tarjeta debe tener entre 2 y 30 letras.'],
    [{ color: 'fucsia' }, /El color no es válido/],
    [{ titular: 'PersonaC' }, 'El titular debe ser una de las personas con acceso (o quedar vacío).'],
    [{ vence: null }, 'Pon el día de cierre y el de vencimiento juntos, o deja los dos vacíos (tarjeta sin ciclo).'],
    [{ cierre: 40 }, 'El cierre y el vencimiento deben ser un día del mes (1 a 31) o quedar vacíos.'],
    [{ idCliente: undefined }, 'Falta el identificador del registro.']
  ];
  for (const [cambios, esperado] of casos) {
    const r = m.llamar('agregarTarjeta', Object.assign({}, TARJETA_NUEVA, cambios));
    assert.equal(r.codigo, 'datos_invalidos', JSON.stringify(cambios));
    if (esperado instanceof RegExp) assert.match(r.error, esperado); else assert.equal(r.error, esperado);
  }
  assert.equal(m.propiedades.FINFAMILY_CATALOGO, undefined);
  assert.equal(hojaDe(m, 'TC Diners'), undefined);

  // Sin ciclo (como Ripley) y sin titular.
  const sinCiclo = m.llamar('agregarTarjeta', { idCliente: ID, nombre: 'Cencosud', color: 'vino' });
  assert.deepEqual([sinCiclo.datos.id, sinCiclo.datos.tarjetas[5].cierre, sinCiclo.datos.tarjetas[5].vence, sinCiclo.datos.tarjetas[5].etiqueta], ['CENCOSUD', null, null, 'TC Cencosud']);
  // Mismo nombre otra vez: id con sufijo y la hoja "TC Cencosud" se reutiliza (no se crea otra).
  const repetida = m.llamar('agregarTarjeta', { idCliente: ID, nombre: 'Cencosud', titular: 'PersonaB', color: 'lima' });
  assert.equal(repetida.datos.id, 'CENCOSUD_2');
  assert.equal(repetida.datos.hojaCreada, false);
  assert.equal(m.hojas.filter((h) => h.nombre === 'TC Cencosud').length, 1);
  // Las dos comparten hoja y medio: se separan por titular, como Interbank.
  assert.equal(m.contexto.idTarjeta('TC Cencosud', 'PersonaB', m.contexto.leerCatalogo_()), 'CENCOSUD_2');
  assert.equal(m.contexto.idTarjeta('TC Cencosud', 'PersonaA', m.contexto.leerCatalogo_()), 'CENCOSUD');
  assert.equal(m.llamar('config', {}).datos.medios.filter((x) => x.id === 'TC_CENCOSUD').length, 1);
});

test('editarTarjeta: cambia ciclo, color, nombre y orden; el catálogo guardado manda en los gastos nuevos', () => {
  const m = motorCompleto();
  const r = m.llamar('editarTarjeta', { id: 'IBK_P', cierre: 25, vence: 10, color: 'marino' });
  const ibkP = r.datos.tarjetas.find((t) => t.id === 'IBK_P');
  assert.deepEqual([ibkP.cierre, ibkP.vence, ibkP.color, ibkP.etiqueta], [25, 10, 'marino', 'TC IBK · PersonaA']);
  assert.deepEqual(m.llamar('config', {}).datos.ciclos.IBK_P, { cierre: 25, vence: 10 });
  m.llamar('registrar', Object.assign({}, GASTO, { fecha: '2026-11-04' }));
  const ibk = hojaDe(m, 'TC IBK');
  assert.equal(ibk.valores[2][7].getDate(), 10, 'ya vence el 10');
  assert.equal(ibk.valores[2][7].getMonth(), 11);
  assert.equal(ibk.valores[2][6].getDate(), 30, 'y el pago sigue en noviembre porque el 4 no pasa el cierre 25');

  // Cambiar el nombre rearma la etiqueta; el orden reordena; la hoja NO se renombra.
  const r2 = m.llamar('editarTarjeta', { id: 'RIPLEY', nombre: 'Ripley Gold', orden: 1 });
  const ripley = r2.datos.tarjetas[0];
  assert.deepEqual([ripley.id, ripley.nombre, ripley.etiqueta, ripley.hoja], ['RIPLEY', 'Ripley Gold', 'TC Ripley Gold', 'TC Ripley']);
  assert.equal(m.llamar('inicio', {}).datos.tarjetas[0].nombre, 'TC Ripley Gold');

  assert.equal(m.llamar('editarTarjeta', { id: 'NO', color: 'rojo' }).error, 'Esa tarjeta no está en el catálogo.');
  assert.equal(m.llamar('editarTarjeta', { id: 'BCP' }).error, 'No hay cambios para guardar.');
  assert.equal(m.llamar('editarTarjeta', { id: 'BCP', orden: '2' }).error, 'El orden debe ser un número entero.');
  assert.equal(m.llamar('editarTarjeta', { id: 'BCP', cierre: null }).error, 'Pon el día de cierre y el de vencimiento juntos, o deja los dos vacíos (tarjeta sin ciclo).');
  assert.equal(m.llamar('editarTarjeta', { id: 'BCP', titular: 'Nadie' }).error, 'El titular debe ser una de las personas con acceso (o quedar vacío).');
});

test('quitarTarjeta y restaurarTarjeta: con pendientes pide forzar; desactivada desaparece de la app y del calendario', () => {
  const m = motorCompleto({ bcp: hojaBcpConLuz(), propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, resumenSemanal: false }) } });
  assert.deepEqual(m.llamar('quitarTarjeta', { id: 'SIP' }).datos, { quitada: false, pendientes: 1 });
  assert.equal(m.propiedades.FINFAMILY_CATALOGO, undefined, 'no se guardó nada');
  const r = m.llamar('quitarTarjeta', { id: 'SIP', forzar: true });
  assert.equal(r.datos.quitada, true);
  assert.equal(r.datos.pendientes, 1);
  assert.equal(r.datos.tarjetas.find((t) => t.id === 'SIP').activa, false);
  const conf = m.llamar('config', {}).datos;
  assert.deepEqual(conf.tarjetas.map((t) => t.id), ['IBK_P', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.ok(!conf.medios.some((x) => x.id === 'TC_SIP'));
  assert.deepEqual(conf.ciclos.SIP, { cierre: 10, vence: 3 }, 'el ciclo se conserva para los gastos viejos');
  assert.deepEqual(m.llamar('inicio', {}).datos.tarjetas.map((t) => t.id), ['IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'HORMIGA']);
  assert.equal(m.llamar('inicio', {}).datos.totalPorPagar, 75, 'la deuda de la SIP ya no cuenta');
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { medio: 'TC_SIP' })).error, 'El medio de pago no es válido.');
  // Calendario: solo BCP.
  const cal = m.contexto.sincronizarCalendario();
  assert.equal(cal.eventos, 1);
  assert.deepEqual(Object.keys(JSON.parse(m.propiedades.FINFAMILY_CALENDARIO)), ['BCP|2026-12-20']);
  assert.deepEqual(hojaDe(m, 'TC SIP').escrituras, [], 'la hoja y sus datos quedan');

  assert.deepEqual(m.llamar('quitarTarjeta', { id: 'SIP' }).datos.yaEstaba, true);
  const rest = m.llamar('restaurarTarjeta', { id: 'SIP' });
  assert.equal(rest.datos.restaurada, true);
  assert.deepEqual(m.llamar('config', {}).datos.tarjetas.map((t) => t.id), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.equal(m.contexto.sincronizarCalendario().eventos, 2);
  // Sin pendientes se quita directo.
  assert.deepEqual(m.llamar('quitarTarjeta', { id: 'RIPLEY' }).datos.quitada, true);
  assert.equal(m.llamar('quitarTarjeta', { id: 'ZZZ' }).error, 'Esa tarjeta no está en el catálogo.');
});

test('con el catálogo guardado, Interbank sigue compartiendo hoja y el lector asigna por catálogo', () => {
  const m = motorConCorreos();
  m.llamar('editarTarjeta', { id: 'BCP', color: 'grafito' }); // fuerza a guardar el catálogo
  assert.ok(m.propiedades.FINFAMILY_CATALOGO);
  m.llamar('registrar', Object.assign({}, GASTO, { responsable: 'PersonaB' }));
  assert.equal(hojaDe(m, 'TC IBK').valores[2][7].getDate(), 20, 'IBK_B vence el 20');
  m.contexto.leerCorreosDeBancos();
  const p = m.llamar('pendientes', {}).datos.pendientes.find((x) => x.id === 'msg-ibk-1');
  assert.deepEqual([p.tarjeta, p.responsable, p.medioSugerido], ['IBK_B', 'PersonaB', 'TC_IBK']);
  // Si se quita la Interbank de PersonaB, el mismo correo va a la de PersonaA.
  const m2 = motorConCorreos();
  m2.llamar('quitarTarjeta', { id: 'IBK_B', forzar: true });
  m2.contexto.leerCorreosDeBancos();
  const q = m2.llamar('pendientes', {}).datos.pendientes.find((x) => x.id === 'msg-ibk-1');
  // Sin la tarjeta de PersonaB, el correo igual la saluda a ella: queda a su nombre (con la tarjeta de PersonaA).
  assert.deepEqual([q.tarjeta, q.responsable], ['IBK_P', 'PersonaB']);
});

// ---------- tipos de gasto ----------

test('agregarConcepto: escribe en la primera celda libre debajo de la lista; rechaza repetidos y cortos', () => {
  const m = motorCompleto();
  const r = m.llamar('agregarConcepto', { nombre: '  Educación ' });
  assert.deepEqual(r.datos, { conceptos: ['Supermercado', 'Delivery', 'Luz', 'Ropa y Calzado', 'Educación'] });
  const conf = hojaDe(m, 'Configuración');
  assert.deepEqual(conf.escrituras, [{ fila: 6, col: 1, valor: 'Educación' }]);
  assert.equal(conf.valores[5][1], '', 'la columna Responsable no se toca');
  assert.deepEqual(m.llamar('agregarConcepto', { nombre: 'educacion' }), { ok: false, codigo: 'datos_invalidos', error: 'Ese tipo de gasto ya existe.' });
  assert.equal(m.llamar('agregarConcepto', { nombre: 'X' }).error, 'El tipo de gasto debe tener al menos 2 letras.');
  assert.equal(m.llamar('agregarConcepto', { nombre: '' }).error, 'Falta el tipo de gasto.');
  assert.equal(m.llamar('agregarConcepto', { nombre: 'x'.repeat(41) }).codigo, 'datos_invalidos');
  // Un '=' al inicio se neutraliza y una celda libre con fórmula no se pisa.
  m.llamar('agregarConcepto', { nombre: '=Trampa' });
  assert.equal(conf.valores[6][0], "'=Trampa");
  const conFormula = motorCompleto();
  hojaDe(conFormula, 'Configuración').insertRowsAfter(5, 1);
  hojaDe(conFormula, 'Configuración').formulas[5][0] = '=A5';
  assert.match(conFormula.llamar('agregarConcepto', { nombre: 'Agua' }).error, /tiene una fórmula/);
  assert.ok(m.llamar('config', {}).datos.conceptos.includes('Educación'));
});

test('renombrarConcepto: cambia la lista y todas las filas de consumos que lo usan', () => {
  const m = motorCompleto({ bcp: hojaBcpConLuz() });
  m.llamar('registrar', { idCliente: 'prueba-0050', monto: 9, medio: 'YAPE', concepto: 'luz', descripcion: 'Recarga luz', fecha: '2026-11-05' });
  const r = m.llamar('renombrarConcepto', { de: 'luz', a: 'Electricidad' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.datos.renombrado, r.datos.filas, r.datos.conceptos], [true, 2, ['Supermercado', 'Delivery', 'Electricidad', 'Ropa y Calzado']]);
  assert.equal(hojaDe(m, 'Configuración').valores[3][0], 'Electricidad');
  assert.equal(hojaDe(m, 'TC BCP').valores[2][3], 'Electricidad');
  assert.equal(hojaDe(m, 'Gastos Hormiga').valores[1][3], 'Electricidad');
  assert.equal(hojaDe(m, 'TC BCP').valores[2][5], 75, 'lo demás de la fila no cambia');
  // Un consumo con fórmula en el concepto no se toca.
  const conFormula = motorCompleto({ bcp: hojaBcpConLuz() });
  hojaDe(conFormula, 'TC BCP').formulas[2][3] = '=X1';
  assert.equal(conFormula.llamar('renombrarConcepto', { de: 'Luz', a: 'Electricidad' }).datos.filas, 0);
  assert.equal(hojaDe(conFormula, 'TC BCP').valores[2][3], 'Luz');

  assert.equal(m.llamar('renombrarConcepto', { de: 'Agua', a: 'Agua potable' }).error, 'Ese tipo de gasto no está en la lista.');
  assert.equal(m.llamar('renombrarConcepto', { de: 'Delivery', a: 'supermercado' }).error, 'Ya existe un tipo de gasto con el nuevo nombre.');
  assert.equal(m.llamar('renombrarConcepto', { de: 'Delivery', a: 'DELIVERY' }).error, 'El nuevo nombre es igual al actual.');
  assert.equal(m.llamar('renombrarConcepto', { de: 'Delivery' }).error, 'Falta el nuevo nombre.');
});

test('quitarConcepto: con usos pide forzar; al quitar corre la lista hacia arriba sin dejar hueco', () => {
  const m = motorCompleto({ bcp: hojaBcpConLuz() });
  assert.deepEqual(m.llamar('quitarConcepto', { nombre: 'Luz' }).datos, { quitado: false, usos: 1, conceptos: ['Supermercado', 'Delivery', 'Luz', 'Ropa y Calzado'] });
  assert.deepEqual(hojaDe(m, 'Configuración').escrituras, []);
  const r = m.llamar('quitarConcepto', { nombre: 'Luz', forzar: true });
  assert.deepEqual(r.datos, { quitado: true, usos: 1, conceptos: ['Supermercado', 'Delivery', 'Ropa y Calzado'] });
  const conf = hojaDe(m, 'Configuración');
  assert.deepEqual(conf.valores.map((f) => f[0]), ['Conceptos de Gasto', 'Supermercado', 'Delivery', 'Ropa y Calzado', '']);
  assert.deepEqual(conf.valores.map((f) => f[1]), ['Responsable', 'PersonaA', 'PersonaB', '', ''], 'la otra columna no se mueve');
  assert.equal(hojaDe(m, 'TC BCP').valores[2][3], 'Luz', 'los gastos viejos conservan su concepto');
  // Sin usos se quita directo (el primero de la lista: todo sube un lugar).
  assert.deepEqual(m.llamar('quitarConcepto', { nombre: 'supermercado' }).datos, { quitado: true, usos: 0, conceptos: ['Delivery', 'Ropa y Calzado'] });
  assert.deepEqual(conf.valores.map((f) => f[0]), ['Conceptos de Gasto', 'Delivery', 'Ropa y Calzado', '', '']);
  // "Ropa y Calzado" sí tiene un consumo en TC SIP: pide forzar.
  assert.equal(m.llamar('quitarConcepto', { nombre: 'Ropa y Calzado' }).datos.usos, 1);
  assert.equal(m.llamar('quitarConcepto', { nombre: 'Agua' }).error, 'Ese tipo de gasto no está en la lista.');
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { concepto: 'Luz' })).error, 'El concepto no está en la lista de Configuración.');
});

// ---------- personas ----------

test('usuarios, agregarUsuario y quitarUsuario: claves únicas, lista Responsable y protecciones', () => {
  const m = motorCompleto();
  assert.deepEqual(m.llamar('usuarios', {}).datos, { usuarios: [
    { nombre: 'PersonaA', correo: 'persona-a@example.test', clave: 'P' },
    { nombre: 'PersonaB', correo: 'persona-b@example.test', clave: 'B' }
  ] });
  const r = m.llamar('agregarUsuario', { nombre: ' PersonaC ', correo: 'persona-c@example.test' });
  assert.deepEqual(r.datos.usuarios[2], { nombre: 'PersonaC', correo: 'persona-c@example.test', clave: 'PE' });
  assert.deepEqual(JSON.parse(m.propiedades.USUARIOS)['persona-c@example.test'], { nombre: 'PersonaC', clave: 'PE' });
  // Clave que choca: dos letras. Y queda en la lista Responsable de Configuración.
  const r2 = m.llamar('agregarUsuario', { nombre: 'PersonaD', correo: 'persona-d@example.test' });
  assert.equal(r2.datos.usuarios[3].clave, 'PER');
  const conf = hojaDe(m, 'Configuración');
  assert.deepEqual(conf.valores.map((f) => f[1]), ['Responsable', 'PersonaA', 'PersonaB', 'PersonaC', 'PersonaD']);
  assert.equal(m.llamar('agregarUsuario', { nombre: 'PersonaA', correo: 'otro@example.com' }).error, 'Ya hay una persona con ese nombre.');
  assert.equal(m.llamar('agregarUsuario', { nombre: 'Otra', correo: 'persona-d@example.test' }).error, 'Ese correo ya tiene acceso.');
  assert.equal(m.llamar('agregarUsuario', { nombre: 'Otra', correo: 'no-es-correo' }).error, 'El correo no es válido.');
  assert.equal(m.llamar('agregarUsuario', { nombre: 'O', correo: 'o@example.com' }).error, 'El nombre debe tener al menos 2 letras.');
  // El nuevo ya puede ser responsable de un gasto.
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { responsable: 'PersonaC', medio: 'TC_BCP' })).datos.guardado, true);
  assert.equal(hojaDe(m, 'TC BCP').valores[2][0], 'PersonaC');

  assert.equal(m.llamar('quitarUsuario', { correo: 'persona-a@example.test' }).error, 'No puedes quitarte a ti mismo.');
  assert.equal(m.llamar('quitarUsuario', { correo: 'nadie@example.com' }).error, 'Ese correo no está en la lista.');
  const q = m.llamar('quitarUsuario', { correo: 'persona-d@example.test' });
  assert.deepEqual(q.datos.usuarios.map((u) => u.correo), ['persona-a@example.test', 'persona-b@example.test', 'persona-c@example.test']);
  assert.deepEqual(conf.valores.map((f) => f[1]), ['Responsable', 'PersonaA', 'PersonaB', 'PersonaC', 'PersonaD'], 'la hoja no se toca al quitar');
  const solo = crearMotor({ propiedades: { USUARIOS: JSON.stringify({ 'persona-a@example.test': { nombre: 'PersonaA', clave: 'P' } }) } });
  assert.equal(solo.llamar('quitarUsuario', { correo: 'persona-a@example.test' }).error, 'No puedes quitarte a ti mismo.');
});

// ---------- más casos del catálogo en el motor ----------

test('datosTarjetas y personas conocen la tarjeta nueva del catálogo', () => {
  const m = motorCompleto();
  m.llamar('agregarTarjeta', TARJETA_NUEVA);
  const d = m.llamar('datosTarjetas', {}).datos.tarjetas;
  assert.deepEqual(Object.keys(d), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'DINERS']);
  assert.equal(m.llamar('guardarDatosTarjeta', { id: 'DINERS', digitos: '7777', red: 'visa', nombre: 'Diners PersonaA' }).datos.tarjetas.DINERS.digitos, '7777');
  assert.equal(m.llamar('guardarDatosTarjeta', { id: 'OTRA', digitos: '7777' }).error, 'La tarjeta no es válida (SIP, IBK_P, IBK_B, BCP, RIPLEY, DINERS).');
  m.llamar('registrar', { idCliente: 'prueba-0060', monto: 120, medio: 'TC_DINERS', concepto: 'Delivery', descripcion: 'Cena', fecha: '2026-11-04' });
  const personas = m.llamar('personas', { mes: '2026-11' }).datos.personas;
  assert.deepEqual(personas[0].medios, [{ medio: 'TC Diners · PersonaA', monto: 120 }]);
});

test('editarGasto recalcula el ciclo con el catálogo editado', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO); // TC IBK, PersonaA, 05/11 -> vence 15/12 con el ciclo de siempre
  const ibk = hojaDe(m, 'TC IBK');
  assert.equal(ibk.valores[2][7].getDate(), 15);
  m.llamar('editarTarjeta', { id: 'IBK_P', cierre: 20, vence: 28 });
  const r = m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' }, cambios: { fecha: '2026-11-04' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(ibk.valores[2][7].getDate(), 28, 'la fecha de vencimiento sale del catálogo editado');
});

test('avisosDeVencimiento y confirmarPendiente con una tarjeta nueva del catálogo', () => {
  const m = motorConCorreos({ hoy: '2026-12-22' });
  m.llamar('agregarTarjeta', TARJETA_NUEVA);
  m.estado.hoy = '2026-11-04';
  m.llamar('registrar', { idCliente: 'prueba-0070', monto: 300, medio: 'TC_DINERS', concepto: 'Delivery', descripcion: 'Viaje', fecha: '2026-11-04' });
  m.estado.hoy = '2026-12-22';
  const av = m.contexto.avisosDeVencimiento();
  assert.equal(av.enviado, true);
  assert.equal(m.correos[m.correos.length - 1].subject, 'FinFamily: TC Diners · PersonaA vence en 3 días (S/ 300)');
  // Un consumo del correo (BCP) confirmado con medio TC_DINERS va a la hoja nueva.
  m.estado.hoy = '2026-11-09';
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('confirmarPendiente', { idCliente: 'prueba-0071', id: 'msg-bcp-1', concepto: 'Supermercado', medio: 'TC_DINERS' });
  assert.deepEqual(r.datos, { confirmado: true, hoja: 'TC Diners', fila: 4 });
});

test('un catálogo dañado en Properties vuelve al inicial sin romper la app', () => {
  const m = motorCompleto({ propiedades: { FINFAMILY_CATALOGO: '{no es json' } });
  assert.deepEqual(m.llamar('config', {}).datos.tarjetas.map((t) => t.id), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.equal(m.llamar('inicio', {}).datos.tarjetas.length, 6);
  const vacio = motorCompleto({ propiedades: { FINFAMILY_CATALOGO: '[]' } });
  assert.equal(vacio.llamar('config', {}).datos.medios.length, 8);
});

test('con la Interbank de PersonaB desactivada, su gasto en TC IBK pasa a la tarjeta de PersonaA (misma hoja)', () => {
  const m = motorCompleto();
  m.llamar('quitarTarjeta', { id: 'IBK_B' });
  const r = m.llamar('registrar', Object.assign({}, GASTO, { responsable: 'PersonaB' }));
  assert.equal(r.datos.guardado, true);
  const ibk = hojaDe(m, 'TC IBK');
  assert.equal(ibk.valores[2][0], 'PersonaB', 'la fila sigue a su nombre');
  assert.equal(ibk.valores[2][7].getDate(), 15, 'pero el ciclo es el de IBK_P');
  assert.deepEqual(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_P').estados[0].consumos.length, 1);
});

test('quitarTarjeta de una tarjeta compartida no quita la hoja ni los medios del resto', () => {
  const m = motorCompleto();
  m.llamar('quitarTarjeta', { id: 'IBK_P' });
  const conf = m.llamar('config', {}).datos;
  assert.ok(conf.medios.some((x) => x.id === 'TC_IBK'), 'TC_IBK sigue por la tarjeta de PersonaB');
  assert.deepEqual(conf.tarjetas.map((t) => t.id), ['SIP', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { fecha: '2026-11-05' })).datos.guardado, true);
  assert.equal(hojaDe(m, 'TC IBK').valores[2][7].getDate(), 20, 'PersonaA cae en la única activa de la hoja (ciclo de PersonaB)');
});

test('agregarUsuario sin columna Responsable en Configuración no falla; el usuario queda igual', () => {
  const m = crearMotor({ hojas: hojasDeConsumos().concat([hojaPresupuesto(),
    new HojaFalsa('Configuración', [['Conceptos de Gasto'], ['Limpieza']])]) });
  const r = m.llamar('agregarUsuario', { nombre: 'PersonaC', correo: 'persona-c@example.test' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.usuarios.length, 3);
  assert.ok(m.avisosConsola.some((t) => /lista Responsable/.test(t)));
  // Y la clave con tres letras cuando chocan una y dos.
  m.llamar('agregarUsuario', { nombre: 'PersonaD', correo: 'persona-d@example.test' });
  const r3 = m.llamar('agregarUsuario', { nombre: 'PersonaE', correo: 'persona-e@example.test' });
  assert.equal(r3.datos.usuarios[4].clave, 'PERS');
});

// ===========================================================================
// Motor 1.5: líneas del presupuesto desde la app
// ===========================================================================

// 'PRESUPUESTO FAMILIAR' con la forma de la hoja real: fila 2 encabezados (col E vacía entre dic-26 y ene-27),
// totales con fórmulas =SUM(...) que el mock ajusta al insertar o borrar filas, como hace Sheets.
const LINEAS_REALES = [
  ['Ingresos - PersonaA', 3500], ['Ingresos - PersonaB', 1500], ['Otros Ingresos / Adicionales', 0], // 3-5
  ['TOTAL INGRESOS', null],                                                                   // 6
  ['TC Interbank', 0], ['TC BCP', 0], ['TC Sip / Oh!', 0], ['TC Ripley', 0],                  // 7-10
  ['Alimentación (BCP-DEB-PE)', 800], ['Alacena (SIP)', 100], ['Limpieza (SIP)', 60], ['Mascotas (SIP)', 80], // 11-14
  ['Paseo Mascotas', 40], ['Servicios', 200], ['Internet (IBK)', 100], ['Suscripciones (IBK/BCP/IBK)', 50],  // 15-18
  ['Plan móvil (BCP/IBK)', 70], ['Compras a cuotas', 0], ['Salud', 50], ['Cuidado Personal', 40],            // 19-22
  ['Pasajes', 60], ['Remodelación (IBK-DEB-PE)', 0],                                                          // 23-24
  ['Ahorro Casa', 300], ['Ahorro Viaje', 100], ['Fondo de Emergencia', 100],                                  // 25-27
  ['TOTAL GASTOS', null], ['TOTAL AHORROS', null], ['SALDO / SUPERÁVIT FINAL', null], ['Saldo Personal', 0]   // 28-31
];
const COLS_MESES_REAL = [2, 3, 4, 6]; // B, C, D, F
const TOTAL_GASTOS_REAL = 2150;

function hojaPresupuestoReal(opciones) {
  const filas = [['PRESUPUESTO FAMILIAR', '', '', '', '', ''], ['Concepto / Categoría', 'oct-26', 'nov-26', 'dic-26', '', 'ene-27']];
  const formulas = {};
  LINEAS_REALES.forEach(([concepto, monto], i) => {
    const fila = i + 3;
    const f = [concepto, '', '', '', '', ''];
    COLS_MESES_REAL.forEach((c) => {
      const letra = String.fromCharCode(64 + c);
      if (monto !== null) f[c - 1] = monto;
      else if (concepto === 'TOTAL INGRESOS') { f[c - 1] = 5000; formulas[fila + ',' + c] = `=SUM(${letra}3:${letra}5)`; }
      else if (concepto === 'TOTAL GASTOS') { f[c - 1] = TOTAL_GASTOS_REAL; formulas[fila + ',' + c] = `=SUM(${letra}7:${letra}27)`; }
      else if (concepto === 'TOTAL AHORROS') { f[c - 1] = 500; formulas[fila + ',' + c] = `=SUM(${letra}25:${letra}27)`; }
      else { f[c - 1] = 2850; formulas[fila + ',' + c] = `=${letra}6-${letra}28`; }
    });
    filas.push(f);
  });
  return new HojaFalsa('PRESUPUESTO FAMILIAR', filas, Object.assign({ formulas }, opciones || {}));
}

function hojaConfigReal() {
  return new HojaFalsa('Configuración', [
    ['Conceptos de Gasto', 'Responsable'], ['Supermercado', 'PersonaA'], ['Desayuno', 'PersonaB'], ['Limpieza', ''],
    ['Mascotas', ''], ['Salud y Farmacia', ''], ['Pasajes y Transporte', ''], ['Internet y Telefonía', ''], ['Delivery', ''], ['Luz', '']
  ]);
}

/** Motor con el presupuesto "real" y la configuración completa. */
function motorPresupuestoReal(config) {
  const c = config || {};
  const hojas = [hojaSip(), hojaTc('TC IBK', []), hojaTc('TC BCP', []), hojaTc('TC Ripley', []),
    new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado']]),
    c.presupuesto || hojaPresupuestoReal(), hojaConfigReal()];
  return crearMotor(Object.assign({ hojas, hoy: '2026-11-06' }, c));
}

function lineaDe(r, nombre) {
  return r.datos.lineas.find((l) => l.concepto === nombre);
}

// ---------- lineasPresupuesto y presupuesto ----------

test('lineasPresupuesto: líneas del mes con sección, conceptos sugeridos y "Llevas X de Y"', () => {
  const m = motorPresupuestoReal();
  m.llamar('registrar', { idCliente: 'prueba-0100', monto: 120, medio: 'YAPE', concepto: 'Supermercado', descripcion: 'Compra', fecha: '2026-11-05' });
  m.llamar('registrar', { idCliente: 'prueba-0101', monto: 15, medio: 'YAPE', concepto: 'Desayuno', descripcion: 'Pan', fecha: '2026-11-06' });
  const r = m.llamar('lineasPresupuesto', { mes: '2026-11' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.mes, '2026-11');
  assert.equal(r.datos.etiquetaMes, 'nov-26');
  assert.deepEqual(r.datos.meses.map((x) => x.clave), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(r.datos.lineas.length, 24);
  assert.deepEqual(r.datos.lineas.filter((l) => l.seccion === 'ingresos').map((l) => l.fila), [3, 4, 5]);
  assert.deepEqual(r.datos.lineas.filter((l) => l.seccion === 'ahorros').map((l) => [l.fila, l.concepto]), [[25, 'Ahorro Casa'], [26, 'Ahorro Viaje'], [27, 'Fondo de Emergencia']]);
  assert.deepEqual(lineaDe(r, 'Alimentación (BCP-DEB-PE)'), {
    fila: 11, concepto: 'Alimentación (BCP-DEB-PE)', seccion: 'gastos', monto: 800, pagado: false, pagadoNota: '', esTarjeta: false,
    conceptos: ['Supermercado', 'Desayuno'], sugerido: true, gastado: 135
  });
  assert.deepEqual([lineaDe(r, 'Alacena (SIP)').conceptos, lineaDe(r, 'Alacena (SIP)').sugerido], [[], false], 'Chucherías/Matanza no están en Configuración');
  assert.deepEqual(lineaDe(r, 'Salud').conceptos, ['Salud y Farmacia']);
  assert.deepEqual([lineaDe(r, 'Ingresos - PersonaA').conceptos, lineaDe(r, 'Ingresos - PersonaA').gastado], [[], 0]);
  assert.equal(lineaDe(r, 'TC BCP').esTarjeta, true);
  assert.deepEqual(r.datos.totales, { ingresos: 5000, gastos: 2150, ahorros: 500, saldo: 2850, saldoPersonal: 0 });
  assert.equal(m.llamar('lineasPresupuesto', {}).datos.mes, '2026-11', 'sin mes usa el actual');
  assert.equal(m.llamar('lineasPresupuesto', { mes: '2030-01' }).error, 'Ese mes no está en el presupuesto.');
});

test('presupuesto (acción de siempre) ahora trae conceptos y sugerido en cada fila; sin hoja Configuración no falla', () => {
  const m = motorPresupuestoReal();
  const filas = m.llamar('presupuesto', { mes: '2026-11' }).datos.filas;
  assert.deepEqual(filas.find((f) => f.concepto === 'Pasajes').conceptos, ['Pasajes y Transporte']);
  assert.equal(filas.find((f) => f.concepto === 'Pasajes').sugerido, true);
  assert.deepEqual(filas.find((f) => f.concepto === 'Ingresos - PersonaA').conceptos, []);
  const sinConfig = crearMotor({ hojas: [hojaPresupuestoReal()] });
  const r = sinConfig.llamar('presupuesto', { mes: '2026-11' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos.filas.find((f) => f.concepto === 'Alacena (SIP)').conceptos, ['Chucherías', 'Matanza'], 'sin lista no se filtra la sugerencia');
});

// ---------- agregarLinea ----------

test('agregarLinea (gastos): se inserta antes de la última línea de gastos y los SUM de los totales la cubren', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('agregarLinea', { idCliente: ID, nombre: ' Educación ', seccion: 'gastos', monto: 150, desdeMes: '2026-11' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.fila, 24);
  assert.equal(r.datos.nombre, 'Educación');
  assert.deepEqual(pres.valores[23], ['Educación', 0, 150, 150, '', 150], 'octubre en 0, de noviembre en adelante 150');
  assert.equal(pres.valores[24][0], 'Remodelación (IBK-DEB-PE)', 'la que era última bajó un lugar');
  assert.equal(pres.valores.length, 32);
  // Las fórmulas de total se ampliaron (TOTAL GASTOS ahora en la fila 29).
  assert.equal(pres.valores[28][0], 'TOTAL GASTOS');
  assert.equal(pres.formulas[28][2], '=SUM(C7:C28)');
  assert.equal(pres.evaluarSuma(29, 3), TOTAL_GASTOS_REAL + 150);
  assert.equal(pres.evaluarSuma(29, 2), TOTAL_GASTOS_REAL, 'octubre no cambia');
  assert.equal(pres.formulas[29][2], '=SUM(C26:C28)', 'TOTAL AHORROS se corrió completo');
  assert.equal(pres.evaluarSuma(30, 3), 500);
  // (La fórmula del saldo "=C6-C28" usa celdas sueltas: el mock solo ajusta rangos A1:B2; en Sheets también se corre sola.)
  // Lo devuelto ya trae la línea nueva en su sitio.
  const nueva = lineaDe(r, 'Educación');
  assert.deepEqual([nueva.fila, nueva.seccion, nueva.monto, nueva.conceptos], [24, 'gastos', 150, []]);
  assert.equal(lineaDe(r, 'Remodelación (IBK-DEB-PE)').fila, 25);
  assert.equal(lineaDe(r, 'Ahorro Casa').fila, 26);
});

test('agregarLinea (ahorros): antepone "Ahorro " y queda dentro del SUM de TOTAL AHORROS', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('agregarLinea', { idCliente: ID, nombre: 'Moto', seccion: 'ahorros', monto: 200, desdeMes: '2026-12' });
  assert.equal(r.datos.nombre, 'Ahorro Moto');
  assert.equal(r.datos.fila, 27, 'antes de Fondo de Emergencia');
  assert.deepEqual(pres.valores[26], ['Ahorro Moto', 0, 0, 200, '', 200]);
  assert.equal(pres.formulas[29][2], '=SUM(C25:C28)');
  assert.equal(pres.evaluarSuma(30, 4), 700);
  assert.equal(pres.evaluarSuma(30, 3), 500, 'en noviembre todavía 0');
  assert.equal(pres.formulas[28][3], '=SUM(D7:D28)');
  assert.equal(pres.evaluarSuma(29, 4), TOTAL_GASTOS_REAL + 200);
  assert.equal(lineaDe(r, 'Ahorro Moto').seccion, 'ahorros');
  // "Fondo Universidad" se respeta tal cual.
  assert.equal(m.llamar('agregarLinea', { idCliente: ID, nombre: 'Fondo Universidad', seccion: 'ahorros', monto: 0 }).datos.nombre, 'Fondo Universidad');
});

test('agregarLinea (ingresos): antes de la última de ingresos; todo lo de abajo se corre y los totales siguen bien', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('agregarLinea', { idCliente: ID, nombre: 'Bonos', seccion: 'ingresos', monto: 500, desdeMes: '2026-10' });
  assert.equal(r.datos.fila, 5);
  assert.deepEqual(pres.valores[4], ['Bonos', 500, 500, 500, '', 500]);
  assert.equal(pres.formulas[6][2], '=SUM(C3:C6)');
  assert.equal(pres.evaluarSuma(7, 3), 5500);
  assert.equal(pres.formulas[28][2], '=SUM(C8:C28)');
  assert.equal(pres.evaluarSuma(29, 3), TOTAL_GASTOS_REAL);
  assert.equal(lineaDe(r, 'Alimentación (BCP-DEB-PE)').fila, 12);
  assert.equal(lineaDe(r, 'Bonos').seccion, 'ingresos');
});

test('agregarLinea: sin desdeMes usa el mes actual; validaciones no insertan nada', () => {
  const m = motorPresupuestoReal({ hoy: '2026-12-02' });
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('agregarLinea', { idCliente: ID, nombre: 'Gimnasio', seccion: 'gastos', monto: 'S/ 99.90' });
  assert.deepEqual(pres.valores[23], ['Gimnasio', 0, 0, 99.9, '', 99.9]);
  assert.equal(r.datos.mes, '2026-12');

  const base = { idCliente: ID, nombre: 'Nueva', seccion: 'gastos', monto: 10, desdeMes: '2026-11' };
  const casos = [
    [{ nombre: 'alimentación (bcp-deb-pe)' }, 'Ya hay una línea con ese nombre.'],
    [{ seccion: 'otros' }, 'La sección debe ser ingresos, gastos o ahorros.'],
    [{ monto: -5 }, 'El monto no puede ser negativo.'],
    [{ monto: 'abc' }, 'El monto debe ser un número.'],
    [{ desdeMes: '2030-01' }, 'Ese mes no está en el presupuesto.'],
    [{ desdeMes: 'noviembre' }, 'El mes no es válido.'],
    [{ nombre: 'X' }, 'El nombre de la línea debe tener al menos 2 letras.'],
    [{ nombre: '' }, 'Falta el nombre de la línea.'],
    [{ idCliente: undefined }, 'Falta el identificador del registro.']
  ];
  const antes = pres.valores.length;
  for (const [cambios, error] of casos) {
    assert.deepEqual(m.llamar('agregarLinea', Object.assign({}, base, cambios)), { ok: false, codigo: 'datos_invalidos', error }, JSON.stringify(cambios));
  }
  assert.equal(pres.valores.length, antes);
});

// ---------- renombrarLinea ----------

test('renombrarLinea: cambia la celda A, conserva los conceptos asignados y aplica el prefijo de ahorros', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  m.llamar('asignarConceptos', { linea: 'Limpieza (SIP)', conceptos: ['Limpieza'] });
  const r = m.llamar('renombrarLinea', { fila: 13, nombre: 'Limpieza hogar' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.datos.renombrada, r.datos.fila, r.datos.nombre], [true, 13, 'Limpieza hogar']);
  assert.equal(pres.valores[12][0], 'Limpieza hogar');
  assert.equal(pres.valores[12][2], 60, 'los montos no cambian');
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_LINEAS), { 'limpieza hogar': ['Limpieza'] });
  assert.deepEqual([lineaDe(r, 'Limpieza hogar').conceptos, lineaDe(r, 'Limpieza hogar').sugerido], [['Limpieza'], false]);
  // Ahorros: prefijo automático.
  const r2 = m.llamar('renombrarLinea', { fila: 26, nombre: 'Viaje Europa' });
  assert.equal(r2.datos.nombre, 'Ahorro Viaje Europa');
  assert.equal(pres.valores[25][0], 'Ahorro Viaje Europa');
  assert.equal(lineaDe(r2, 'Ahorro Viaje Europa').seccion, 'ahorros');
  assert.equal(pres.formulas[27][2], '=SUM(C7:C27)', 'las fórmulas no se tocan');
});

test('renombrarLinea: no acepta totales, encabezados, nombres repetidos ni iguales', () => {
  const m = motorPresupuestoReal();
  const casos = [
    [{ fila: 28, nombre: 'Total' }, 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.'],
    [{ fila: 2, nombre: 'Encabezado' }, 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.'],
    [{ fila: 99, nombre: 'Nada' }, 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.'],
    [{ fila: 13, nombre: 'salud' }, 'Ya hay una línea con ese nombre.'],
    [{ fila: 13, nombre: 'LIMPIEZA (sip)' }, 'El nuevo nombre es igual al actual.'],
    [{ fila: 13, nombre: '' }, 'Falta el nombre de la línea.'],
    [{ fila: '13', nombre: 'Algo' }, 'No se indicó la línea del presupuesto.']
  ];
  for (const [datos, error] of casos) assert.deepEqual(m.llamar('renombrarLinea', datos), { ok: false, codigo: 'datos_invalidos', error }, JSON.stringify(datos));
  assert.deepEqual(hojaDe(m, 'PRESUPUESTO FAMILIAR').escrituras, []);
  const conFormula = motorPresupuestoReal({ presupuesto: hojaPresupuestoReal({ formulas: { '13,1': '=A12' } }) });
  assert.equal(conFormula.llamar('renombrarLinea', { fila: 13, nombre: 'Otro' }).error, 'El nombre de esa línea es una fórmula; cámbialo en el Sheets.');
});

// ---------- quitarLinea ----------

test('quitarLinea: una línea en cero se borra y los SUM se achican; con montos pide forzar', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('quitarLinea', { fila: 20, nombre: 'Compras a cuotas' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.datos.quitada, r.datos.mesesConMonto], [true, 0]);
  assert.equal(pres.valores.length, 30);
  assert.equal(pres.valores[19][0], 'Salud');
  assert.equal(pres.formulas[26][2], '=SUM(C7:C26)');
  assert.equal(pres.evaluarSuma(27, 3), TOTAL_GASTOS_REAL);
  assert.equal(pres.formulas[27][2], '=SUM(C24:C26)');
  assert.equal(pres.evaluarSuma(28, 3), 500);
  assert.equal(r.datos.lineas.length, 23);
  assert.equal(lineaDe(r, 'Salud').fila, 20);

  // Con montos: 4 meses con monto > 0.
  assert.deepEqual(m.llamar('quitarLinea', { fila: 15, nombre: 'Paseo Mascotas' }).datos, { quitada: false, mesesConMonto: 4 });
  assert.equal(pres.valores.length, 30, 'no borró');
  const f = m.llamar('quitarLinea', { fila: 15, nombre: 'Paseo Mascotas', forzar: true });
  assert.equal(f.datos.quitada, true);
  assert.equal(pres.evaluarSuma(26, 3), TOTAL_GASTOS_REAL - 40);
  assert.equal(pres.formulas[25][2], '=SUM(C7:C25)');
});

test('quitarLinea: una nota "Pagado" también cuenta; verifica el nombre y rechaza totales; limpia el mapa', () => {
  const m = motorPresupuestoReal({ presupuesto: hojaPresupuestoReal({ notas: { '20,3': 'Pagado el 05/11/2026 · PersonaA' } }) });
  assert.deepEqual(m.llamar('quitarLinea', { fila: 20, nombre: 'Compras a cuotas' }).datos, { quitada: false, mesesConMonto: 1 });
  assert.equal(m.llamar('quitarLinea', { fila: 20, nombre: 'Otra cosa' }).error, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.');
  assert.equal(m.llamar('quitarLinea', { fila: 28, nombre: 'TOTAL GASTOS' }).error, 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.');
  assert.equal(m.llamar('quitarLinea', { fila: 0, nombre: 'x' }).error, 'No se indicó la línea del presupuesto.');
  m.llamar('asignarConceptos', { linea: 'Remodelación (IBK-DEB-PE)', conceptos: ['Luz'] });
  m.llamar('asignarConceptos', { linea: 'Salud', conceptos: ['Salud y Farmacia'] });
  const r = m.llamar('quitarLinea', { fila: 24, nombre: 'Remodelación (IBK-DEB-PE)' });
  assert.equal(r.datos.quitada, true);
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_LINEAS), { 'salud': ['Salud y Farmacia'] });
  assert.equal(hojaDe(m, 'PRESUPUESTO FAMILIAR').filasBorradas, 1);
});

// ---------- asignarConceptos ----------

test('asignarConceptos: guarda el mapa con nombres canónicos, mueve conceptos entre líneas y cambia "Llevas X de Y"', () => {
  const m = motorPresupuestoReal();
  m.llamar('registrar', { idCliente: 'prueba-0110', monto: 100, medio: 'YAPE', concepto: 'Supermercado', descripcion: 'Compra', fecha: '2026-11-05' });
  m.llamar('registrar', { idCliente: 'prueba-0111', monto: 30, medio: 'YAPE', concepto: 'Delivery', descripcion: 'Pollo', fecha: '2026-11-05' });
  const r = m.llamar('asignarConceptos', { linea: 'alimentación (bcp-deb-pe)', conceptos: ['supermercado', 'DELIVERY', 'Supermercado'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_LINEAS), { 'alimentacion (bcp-deb-pe)': ['Supermercado', 'Delivery'] });
  const alim = lineaDe(r, 'Alimentación (BCP-DEB-PE)');
  assert.deepEqual([alim.conceptos, alim.sugerido, alim.gastado], [['Supermercado', 'Delivery'], false, 130]);
  // Delivery pasa a Alacena: Alimentación lo pierde.
  const r2 = m.llamar('asignarConceptos', { linea: 'Alacena (SIP)', conceptos: ['Delivery'] });
  assert.deepEqual(lineaDe(r2, 'Alimentación (BCP-DEB-PE)').conceptos, ['Supermercado']);
  assert.deepEqual([lineaDe(r2, 'Alacena (SIP)').conceptos, lineaDe(r2, 'Alacena (SIP)').gastado], [['Delivery'], 30]);
  assert.equal(lineaDe(r2, 'Alimentación (BCP-DEB-PE)').gastado, 100);
  // La acción presupuesto refleja lo guardado.
  assert.deepEqual(m.llamar('presupuesto', { mes: '2026-11' }).datos.filas.find((f) => f.concepto === 'Alacena (SIP)').conceptos, ['Delivery']);
  // Vaciar una línea también se guarda (y gana a la sugerencia).
  const r3 = m.llamar('asignarConceptos', { linea: 'Salud', conceptos: [] });
  assert.deepEqual([lineaDe(r3, 'Salud').conceptos, lineaDe(r3, 'Salud').sugerido], [[], false]);
});

test('asignarConceptos: valida conceptos, línea y sección', () => {
  const m = motorPresupuestoReal();
  const casos = [
    [{ linea: 'Salud', conceptos: ['Viajes'] }, 'El concepto "Viajes" no está en la lista de Configuración.'],
    [{ linea: 'No existe', conceptos: ['Luz'] }, 'Esa línea no está en el presupuesto.'],
    [{ linea: 'Ingresos - PersonaA', conceptos: ['Luz'] }, 'Las líneas de ingresos no llevan conceptos de gasto.'],
    [{ linea: 'Salud', conceptos: 'Luz' }, 'La lista de conceptos no es válida.'],
    [{ conceptos: ['Luz'] }, 'Falta la línea.']
  ];
  for (const [datos, error] of casos) assert.deepEqual(m.llamar('asignarConceptos', datos), { ok: false, codigo: 'datos_invalidos', error }, JSON.stringify(datos));
  assert.equal(m.propiedades.FINFAMILY_LINEAS, undefined);
});

// ---------- editarLineaMeses ----------

test('editarLineaMeses: escribe el monto desde ese mes en adelante y deja los anteriores', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('editarLineaMeses', { fila: 16, nombre: 'Servicios', monto: 250, desdeMes: '2026-12' });
  assert.deepEqual(r.datos, { actualizados: 2, omitidos: 0, fila: 16, monto: 250, desdeMes: '2026-12' });
  assert.deepEqual(pres.valores[15], ['Servicios', 200, 200, 250, '', 250]);
  assert.deepEqual(pres.escrituras, [{ fila: 16, col: 4, valor: 250 }, { fila: 16, col: 6, valor: 250 }]);
  assert.equal(pres.evaluarSuma(28, 4), TOTAL_GASTOS_REAL + 50);
  assert.equal(pres.evaluarSuma(28, 3), TOTAL_GASTOS_REAL);
  assert.equal(m.llamar('editarLineaMeses', { fila: 16, monto: '0', desdeMes: '2026-10' }).datos.actualizados, 4);
  assert.deepEqual(pres.valores[15].slice(1), [0, 0, 0, '', 0]);
});

test('editarLineaMeses: nunca pisa fórmulas y valida fila, mes y monto', () => {
  const m = motorPresupuestoReal({ presupuesto: hojaPresupuestoReal({ formulas: { '16,4': '=C16*1.1' } }) });
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  const r = m.llamar('editarLineaMeses', { fila: 16, monto: 300, desdeMes: '2026-11' });
  assert.deepEqual([r.datos.actualizados, r.datos.omitidos], [2, 1]);
  assert.equal(pres.formulas[15][3], '=C16*1.1', 'la celda con fórmula sigue igual');
  assert.equal(pres.valores[15][2], 300);
  const casos = [
    [{ fila: 28, monto: 1, desdeMes: '2026-11' }, 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.'],
    [{ fila: 16, monto: 1 }, 'Falta el mes.'],
    [{ fila: 16, monto: -1, desdeMes: '2026-11' }, 'El monto no puede ser negativo.'],
    [{ fila: 16, monto: 1, desdeMes: '2030-01' }, 'Ese mes no está en el presupuesto.'],
    [{ fila: 16, nombre: 'Otra', monto: 1, desdeMes: '2026-11' }, 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.'],
    [{ monto: 1, desdeMes: '2026-11' }, 'No se indicó la línea del presupuesto.']
  ];
  for (const [datos, error] of casos) assert.deepEqual(m.llamar('editarLineaMeses', datos), { ok: false, codigo: 'datos_invalidos', error }, JSON.stringify(datos));
});

// ---------- alertas con el mapa ----------

test('revisarAlertas (presupuesto) usa los conceptos asignados a cada línea', () => {
  const m = motorPresupuestoReal({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ resumenSemanal: false, calendario: false, gastoGrande: 0 }) } });
  m.llamar('registrar', { idCliente: 'prueba-0120', monto: 700, medio: 'YAPE', concepto: 'Supermercado', descripcion: 'Mercado', fecha: '2026-11-03' });
  // Sugerido: Supermercado cuenta para Alimentación (700/800 = 87 %).
  const r = m.contexto.revisarAlertas();
  assert.equal(r.presupuesto.enviado, true);
  assert.equal(m.correos[0].subject, 'FinFamily: Alimentación (BCP-DEB-PE) va en 87 % del presupuesto');
  // Guardado distinto: Supermercado ya no cuenta para Alimentación, sino para Alacena (100) -> 700 %.
  const m2 = motorPresupuestoReal({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ resumenSemanal: false, calendario: false, gastoGrande: 0 }) } });
  m2.llamar('registrar', { idCliente: 'prueba-0121', monto: 700, medio: 'YAPE', concepto: 'Supermercado', descripcion: 'Mercado', fecha: '2026-11-03' });
  m2.llamar('asignarConceptos', { linea: 'Alacena (SIP)', conceptos: ['Supermercado'] });
  m2.llamar('asignarConceptos', { linea: 'Alimentación (BCP-DEB-PE)', conceptos: ['Desayuno'] });
  const r2 = m2.contexto.revisarAlertas();
  assert.equal(r2.presupuesto.avisos, 1);
  assert.equal(m2.correos[0].subject, 'FinFamily: Alacena (SIP) va en 700 % del presupuesto');
});

test('líneas: agregar dos veces y quitar una deja los totales cuadrados y las filas corridas', () => {
  const m = motorPresupuestoReal();
  const pres = hojaDe(m, 'PRESUPUESTO FAMILIAR');
  m.llamar('agregarLinea', { idCliente: ID, nombre: 'Educación', seccion: 'gastos', monto: 150, desdeMes: '2026-11' });
  const r2 = m.llamar('agregarLinea', { idCliente: 'prueba-0002', nombre: 'Gimnasio', seccion: 'gastos', monto: 90, desdeMes: '2026-11' });
  assert.equal(r2.datos.fila, 25, 'otra vez antes de Remodelación, que ya estaba en la 25');
  assert.deepEqual(pres.valores.slice(23, 26).map((f) => f[0]), ['Educación', 'Gimnasio', 'Remodelación (IBK-DEB-PE)']);
  assert.equal(pres.formulas[29][2], '=SUM(C7:C29)');
  assert.equal(pres.evaluarSuma(30, 3), TOTAL_GASTOS_REAL + 240);
  assert.equal(pres.evaluarSuma(31, 3), 500, 'TOTAL AHORROS intacto');
  const q = m.llamar('quitarLinea', { fila: 24, nombre: 'Educación', forzar: true });
  assert.equal(q.datos.quitada, true);
  assert.equal(pres.evaluarSuma(29, 3), TOTAL_GASTOS_REAL + 90);
  assert.equal(pres.formulas[28][2], '=SUM(C7:C28)');
  assert.deepEqual(q.datos.lineas.filter((l) => l.seccion === 'gastos').slice(-2).map((l) => [l.fila, l.concepto]), [[24, 'Gimnasio'], [25, 'Remodelación (IBK-DEB-PE)']]);
  assert.equal(m.llamar('lineasPresupuesto', { mes: '2026-11' }).datos.totales.gastos, TOTAL_GASTOS_REAL, 'el total leído es el valor guardado en la celda (en Sheets lo recalcula la fórmula)');
});

test('agregarLinea sin bloque de ahorros: gastos va antes de la última de gastos; ahorros, antes de TOTAL GASTOS', () => {
  // Hoja sin las tres filas de ahorros (los totales quedan en 25-28).
  const pres = hojaPresupuestoReal();
  pres.deleteRow(27); pres.deleteRow(26); pres.deleteRow(25);
  assert.equal(pres.formulas[24][2], '=SUM(C7:C24)');
  const m = motorPresupuestoReal({ presupuesto: pres });
  const g = m.llamar('agregarLinea', { idCliente: ID, nombre: 'Educación', seccion: 'gastos', monto: 10, desdeMes: '2026-11' });
  assert.equal(g.datos.fila, 24);
  assert.equal(pres.formulas[25][2], '=SUM(C7:C25)');
  const a = m.llamar('agregarLinea', { idCliente: ID, nombre: 'Moto', seccion: 'ahorros', monto: 50, desdeMes: '2026-11' });
  assert.equal(a.datos.fila, 26, 'justo antes de TOTAL GASTOS (caso raro documentado en el LEEME)');
  assert.equal(pres.valores[25][0], 'Ahorro Moto');
  assert.equal(pres.valores[26][0], 'TOTAL GASTOS');
  assert.equal(lineaDe(a, 'Ahorro Moto').seccion, 'ahorros');
});

test('editarLineaMeses se refleja en lineasPresupuesto y en presupuesto del mes editado', () => {
  const m = motorPresupuestoReal();
  m.llamar('editarLineaMeses', { fila: 21, monto: 120, desdeMes: '2026-12' });
  assert.equal(lineaDe(m.llamar('lineasPresupuesto', { mes: '2026-12' }), 'Salud').monto, 120);
  assert.equal(lineaDe(m.llamar('lineasPresupuesto', { mes: '2026-11' }), 'Salud').monto, 50);
  assert.equal(m.llamar('presupuesto', { mes: '2027-01' }).datos.filas.find((f) => f.fila === 21).monto, 120);
  // marcarFijo (nota "Pagado") sigue funcionando sobre la línea y la nota se ve en lineasPresupuesto.
  m.llamar('marcarFijo', { idCliente: ID, mes: '2026-11', fila: 16, concepto: 'Servicios', pagado: true });
  const l = lineaDe(m.llamar('lineasPresupuesto', { mes: '2026-11' }), 'Servicios');
  assert.deepEqual([l.pagado, l.pagadoNota], [true, 'Pagado el 06/11/2026 · PersonaA']);
});

// ===========================================================================
// Motor 1.7.0: íconos de los tipos de gasto
// ===========================================================================

test('guardarIconoConcepto: guarda, cambia y borra el ícono; config lo devuelve con el nombre canónico', () => {
  const m = motorCompleto();
  assert.deepEqual(m.llamar('config', {}).datos.iconos, {});
  const r = m.llamar('guardarIconoConcepto', { concepto: 'supermercado', icono: ' Carrito ' });
  assert.deepEqual(r, { ok: true, datos: { iconos: { Supermercado: 'carrito' } } });
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ICONOS), { supermercado: 'carrito' });
  m.llamar('guardarIconoConcepto', { concepto: 'Delivery', icono: 'moto-2_x' });
  assert.deepEqual(m.llamar('config', {}).datos.iconos, { Supermercado: 'carrito', Delivery: 'moto-2_x' });
  assert.deepEqual(m.llamar('guardarIconoConcepto', { concepto: 'Supermercado', icono: 'bolsa' }).datos.iconos, { Supermercado: 'bolsa', Delivery: 'moto-2_x' });
  assert.deepEqual(m.llamar('guardarIconoConcepto', { concepto: 'Supermercado', icono: '' }).datos.iconos, { Delivery: 'moto-2_x' });
  assert.deepEqual(m.llamar('guardarIconoConcepto', { concepto: 'Delivery' }).datos.iconos, {}, 'sin icono también borra');
});

test('guardarIconoConcepto: rechaza conceptos desconocidos e íconos mal formados', () => {
  const m = motorCompleto();
  assert.deepEqual(m.llamar('guardarIconoConcepto', { concepto: 'Viajes', icono: 'avion' }),
    { ok: false, codigo: 'datos_invalidos', error: 'El concepto no está en la lista de Configuración.' });
  for (const icono of ['con espacio', 'ñandu', 'x'.repeat(31), 'emoji😀', 'a/b']) {
    const r = m.llamar('guardarIconoConcepto', { concepto: 'Luz', icono });
    assert.equal(r.error, 'El nombre del ícono debe tener de 1 a 30 letras minúsculas, números, guion o guion bajo.', icono);
  }
  assert.equal(m.llamar('guardarIconoConcepto', { concepto: 'Luz', icono: 'x'.repeat(30) }).ok, true, 'el máximo exacto vale');
  assert.equal(m.propiedades.FINFAMILY_ICONOS !== undefined, true);
});

test('renombrarConcepto y quitarConcepto mueven o quitan el ícono', () => {
  const m = motorCompleto();
  m.llamar('guardarIconoConcepto', { concepto: 'Luz', icono: 'foco' });
  m.llamar('guardarIconoConcepto', { concepto: 'Delivery', icono: 'moto' });
  m.llamar('renombrarConcepto', { de: 'Luz', a: 'Electricidad' });
  assert.deepEqual(m.llamar('config', {}).datos.iconos, { Delivery: 'moto', Electricidad: 'foco' });
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ICONOS), { delivery: 'moto', electricidad: 'foco' });
  m.llamar('quitarConcepto', { nombre: 'Delivery', forzar: true });
  assert.deepEqual(m.llamar('config', {}).datos.iconos, { Electricidad: 'foco' });
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ICONOS), { electricidad: 'foco' });
  // Quitar un concepto sin ícono no toca el mapa.
  m.llamar('quitarConcepto', { nombre: 'Supermercado' });
  assert.deepEqual(JSON.parse(m.propiedades.FINFAMILY_ICONOS), { electricidad: 'foco' });
});

test('config: un ícono guardado para un concepto que ya no existe en Configuración no se devuelve; propiedad dañada no rompe', () => {
  const m = motorCompleto({ propiedades: { FINFAMILY_ICONOS: JSON.stringify({ supermercado: 'carrito', 'ya no existe': 'x', luz: 'Mal Icono' }) } });
  assert.deepEqual(m.llamar('config', {}).datos.iconos, { Supermercado: 'carrito' });
  const danado = motorCompleto({ propiedades: { FINFAMILY_ICONOS: '{roto' } });
  assert.deepEqual(danado.llamar('config', {}).datos.iconos, {});
  assert.equal(danado.llamar('version', {}).datos.version, '1.23.0');
  assert.ok(danado.llamar('version', {}).datos.acciones.includes('guardarIconoConcepto'));
});

// ===========================================================================
// Motor 1.6: quién gastó vs. con qué tarjeta (tarjeta prestada, sufijo en _id_form)
// ===========================================================================

const GASTO_PRESTADO = Object.assign({}, GASTO, { tarjeta: 'IBK_B' }); // PersonaA (sesión) con la Interbank de PersonaB
const COL_ID_FORM = 10; // índice (base 0) de _ID_FORM en las hojas TC

test('registrar con tarjeta prestada: fila en TC IBK, Responsable PersonaA, ciclo de PersonaB y sufijo en _id_form', () => {
  const m = motorCompleto();
  const r = m.llamar('registrar', GASTO_PRESTADO);
  assert.deepEqual(r, { ok: true, datos: { guardado: true, hoja: 'TC IBK', fila: 3, duplicadoId: false, tarjeta: 'IBK_B', prestada: true } });
  const f = hojaDe(m, 'TC IBK').valores[2];
  assert.equal(f[0], 'PersonaA', 'quien gastó');
  assert.equal(f[7].getDate(), 20, 'vence el 20: ciclo de la tarjeta de PersonaB');
  assert.equal(f[6].getDate(), 30);
  assert.equal(f[COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B');
  assert.equal(f[8], 'Pendiente');
});

test('tarjeta prestada: la deuda suma en la tarjeta de PersonaB, el gasto cuenta para PersonaA y la app recibe tarjetaId/prestada', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO_PRESTADO);
  const tarjetas = m.llamar('tarjetas', {}).datos.tarjetas;
  const ibkB = tarjetas.find((t) => t.id === 'IBK_B'), ibkP = tarjetas.find((t) => t.id === 'IBK_P');
  assert.equal(ibkB.pendiente, 45);
  assert.equal(ibkB.proximoVence, '2026-12-20');
  assert.equal(ibkP.pendiente, 0);
  assert.deepEqual(ibkP.estados, []);
  assert.deepEqual(ibkB.estados[0].consumos, [{
    fila: 3, idForm: 'APP:' + ID, fecha: '2026-11-05', concepto: 'Delivery', descripcion: 'Pedido de prueba', monto: 45,
    estado: 'Pendiente', nota: '', medio: '', responsable: 'PersonaA', tarjetaId: 'IBK_B', prestada: true, origen: ''
  }]);
  const inicio = m.llamar('inicio', {}).datos;
  assert.equal(inicio.tarjetas.find((t) => t.id === 'IBK_B').pendiente, 45);
  assert.equal(inicio.totalPorPagar, 85.5);
  const personas = m.llamar('personas', { mes: '2026-11' }).datos.personas;
  assert.deepEqual(personas, [{ nombre: 'PersonaA', total: 45, consumos: 1,
    conceptos: [{ concepto: 'Delivery', monto: 45 }], medios: [{ medio: 'TC IBK · PersonaB', monto: 45 }] }]);
});

test('registrar sin tarjeta queda igual que antes; con la tarjeta de la regla no se anota sufijo', () => {
  const m = motorCompleto();
  assert.deepEqual(m.llamar('registrar', GASTO).datos, { guardado: true, hoja: 'TC IBK', fila: 3, duplicadoId: false });
  const ibk = hojaDe(m, 'TC IBK');
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID);
  // PersonaA eligiendo su propia tarjeta: misma fila de siempre, sin sufijo.
  const propia = m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', monto: 46, tarjeta: 'IBK_P' }));
  assert.deepEqual(propia.datos, { guardado: true, hoja: 'TC IBK', fila: 4, duplicadoId: false, tarjeta: 'IBK_P', prestada: false });
  assert.equal(ibk.valores[3][COL_ID_FORM], 'APP:prueba-0002');
  assert.equal(ibk.valores[3][7].getDate(), 15);
  // PersonaB con la suya: tampoco.
  m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0003', monto: 47, responsable: 'PersonaB', tarjeta: 'IBK_B' }));
  assert.equal(ibk.valores[4][COL_ID_FORM], 'APP:prueba-0003');
  // PersonaB con la de PersonaA: sí (prestada al revés).
  const alReves = m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0004', monto: 48, responsable: 'PersonaB', tarjeta: 'IBK_P' }));
  assert.equal(alReves.datos.prestada, true);
  assert.deepEqual([ibk.valores[5][0], ibk.valores[5][COL_ID_FORM], ibk.valores[5][7].getDate()], ['PersonaB', 'APP:prueba-0004|TC:IBK_P', 15]);
  // Una tarjeta única en su hoja (BCP) nunca necesita sufijo.
  m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0005', medio: 'TC_BCP', tarjeta: 'BCP' }));
  assert.equal(hojaDe(m, 'TC BCP').valores[2][COL_ID_FORM], 'APP:prueba-0005');
});

test('registrar: tarjeta de otro medio, inactiva o inexistente se rechaza sin escribir', () => {
  const m = motorCompleto();
  const casos = [
    [{ tarjeta: 'BCP' }, 'Esa tarjeta no corresponde al medio de pago.'],
    [{ tarjeta: 'IBK_B', medio: 'TC_BCP' }, 'Esa tarjeta no corresponde al medio de pago.'],
    [{ tarjeta: 'IBK_B', medio: 'YAPE' }, 'Esa tarjeta no corresponde al medio de pago.'],
    [{ tarjeta: 'NO_EXISTE' }, 'Esa tarjeta no está activa en el catálogo.']
  ];
  for (const [cambios, error] of casos) {
    assert.deepEqual(m.llamar('registrar', Object.assign({}, GASTO, cambios)), { ok: false, codigo: 'datos_invalidos', error }, JSON.stringify(cambios));
  }
  m.llamar('quitarTarjeta', { id: 'IBK_B' });
  assert.equal(m.llamar('registrar', GASTO_PRESTADO).error, 'Esa tarjeta no está activa en el catálogo.');
  ['TC IBK', 'TC BCP', 'Gastos Hormiga'].forEach((n) => assert.deepEqual(hojaDe(m, n).escrituras, []));
  // Vacío o null cuenta como "no vino".
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { tarjeta: '' })).datos.guardado, true);
});

test('reintento con el mismo idCliente no duplica aunque la fila tenga sufijo de tarjeta', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO_PRESTADO);
  const ibk = hojaDe(m, 'TC IBK');
  const otraVez = m.llamar('registrar', GASTO_PRESTADO);
  assert.deepEqual(otraVez.datos, { guardado: false, duplicadoId: true, hoja: 'TC IBK', fila: 3 });
  // También si el reintento llega sin la tarjeta (cola vieja de la app).
  assert.equal(m.llamar('registrar', GASTO).datos.duplicadoId, true);
  assert.equal(ibk.valores.length, 3);
  assert.equal(m.correos.length, 0);
});

test('confirmarPendiente hereda la tarjeta que identificó el lector: correo de la tarjeta de PersonaB confirmado por PersonaA', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos(); // msg-ibk-1: **** 5566 = Interbank de PersonaB
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-ibk-1', concepto: 'Delivery' }); // responsable: PersonaA (sesión)
  assert.deepEqual(r.datos, { confirmado: true, hoja: 'TC IBK', fila: 3, tarjeta: 'IBK_B', prestada: true });
  const f = hojaDe(m, 'TC IBK').valores[2];
  assert.deepEqual([f[0], f[COL_ID_FORM], f[7].getDate()], ['PersonaA', 'APP:' + ID + '|TC:IBK_B', 20]);
  const ibkB = m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B');
  assert.equal(ibkB.pendiente, 45);
  assert.equal(ibkB.estados[0].consumos[0].prestada, true);
});

test('confirmarPendiente: si el lector solo adivinó la tarjeta (dígitos desconocidos) se aplica la regla de siempre; y acepta tarjeta explícita', () => {
  const extra = { mensajes: [{ id: 'msg-ibk-x', de: 'alertas@interbank.pe', asunto: 'Compra con tu Tarjeta Interbank',
    cuerpo: 'Realizaste una compra por S/ 33 en METRO con tu tarjeta Visa **** 0000 el 09-11-2026.', fecha: new Date(2026, 10, 9, 15, 0) }] };
  const m = motorConCorreos({ hilos: HILOS_BANCOS.concat([extra]).map((h) => ({ mensajes: h.mensajes.map((x) => Object.assign({}, x)) })) });
  m.contexto.leerCorreosDeBancos();
  const adivinado = m.llamar('pendientes', {}).datos.pendientes.find((p) => p.id === 'msg-ibk-x');
  assert.deepEqual([adivinado.tarjeta, adivinado.responsable], ['IBK_P', '']);
  // Confirmado por PersonaB: va a SU tarjeta (regla), sin sufijo y con la respuesta de siempre.
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-ibk-x', concepto: 'Delivery', responsable: 'PersonaB' });
  assert.deepEqual(r.datos, { confirmado: true, hoja: 'TC IBK', fila: 3 });
  const ibk = hojaDe(m, 'TC IBK');
  assert.deepEqual([ibk.valores[2][0], ibk.valores[2][COL_ID_FORM], ibk.valores[2][7].getDate()], ['PersonaB', 'APP:' + ID, 20]);
  // Tarjeta explícita al confirmar: PersonaB con la tarjeta de PersonaA.
  const r2 = m.llamar('confirmarPendiente', { idCliente: 'prueba-0002', id: 'msg-ibk-1', concepto: 'Delivery', responsable: 'PersonaB', tarjeta: 'IBK_P' });
  assert.deepEqual(r2.datos, { confirmado: true, hoja: 'TC IBK', fila: 4, tarjeta: 'IBK_P', prestada: true });
  assert.deepEqual([ibk.valores[3][0], ibk.valores[3][COL_ID_FORM], ibk.valores[3][7].getDate()], ['PersonaB', 'APP:prueba-0002|TC:IBK_P', 15]);
  // Tarjeta que no es del medio: error y el pendiente sigue pendiente.
  assert.equal(m.llamar('confirmarPendiente', { idCliente: 'prueba-0003', id: 'msg-bcp-1', concepto: 'Supermercado', tarjeta: 'IBK_B' }).error,
    'Esa tarjeta no corresponde al medio de pago.');
  assert.equal(m.llamar('pendientes', {}).datos.pendientes.some((p) => p.id === 'msg-bcp-1'), true);
});

test('editarGasto sin tarjeta conserva la que tenía: al cambiar la fecha usa el ciclo de la tarjeta prestada', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO_PRESTADO);
  const ibk = hojaDe(m, 'TC IBK');
  const r = m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' },
    cambios: { fecha: '2026-10-25', monto: 50 } });
  assert.deepEqual(r.datos, { actualizado: true, hoja: 'TC IBK', fila: 3 });
  const f = ibk.valores[2];
  assert.equal(f[5], 50);
  assert.equal(f[COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B', 'el sufijo no se toca');
  assert.deepEqual([f[6].getMonth(), f[6].getDate(), f[7].getMonth(), f[7].getDate()], [10, 30, 11, 20], 'ciclo de IBK_B (cierre 20, vence 20)');
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').pendiente, 50);
});

test('editarGasto con tarjeta: la cambia dentro de la misma hoja, recalcula fechas y pone o quita el sufijo', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO); // PersonaA con su tarjeta (vence 15, sin sufijo)
  const ibk = hojaDe(m, 'TC IBK');
  const v = { monto: 45, descripcion: 'Pedido de prueba' };
  const r = m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v, tarjeta: 'IBK_B' });
  assert.deepEqual(r.datos, { actualizado: true, hoja: 'TC IBK', fila: 3, tarjeta: 'IBK_B', prestada: true });
  assert.deepEqual([ibk.valores[2][0], ibk.valores[2][COL_ID_FORM], ibk.valores[2][7].getDate()], ['PersonaA', 'APP:' + ID + '|TC:IBK_B', 20]);
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').pendiente, 45);
  // De vuelta a la suya (también vale dentro de `cambios`): sufijo fuera y vence el 15.
  const r2 = m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v, cambios: { tarjeta: 'IBK_P', nota: 'corregido' } });
  assert.deepEqual(r2.datos, { actualizado: true, hoja: 'TC IBK', fila: 3, tarjeta: 'IBK_P', prestada: false });
  assert.deepEqual([ibk.valores[2][COL_ID_FORM], ibk.valores[2][7].getDate(), ibk.valores[2][9]], ['APP:' + ID, 15, 'corregido']);
  // A una tarjeta de otra hoja, inexistente o sin cambios: errores claros y nada se escribe.
  const antes = ibk.escrituras.length;
  assert.equal(m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v, tarjeta: 'BCP' }).error,
    'Para pasarlo a otra tarjeta, bórralo y regístralo de nuevo.');
  assert.equal(m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v, tarjeta: 'NADA' }).error,
    'Esa tarjeta no está activa en el catálogo.');
  assert.equal(m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v }).error, 'No hay cambios para guardar.');
  assert.equal(ibk.escrituras.length, antes);
});

test('marcarPagado, desmarcarPagado y borrarGasto funcionan igual con una fila que tiene sufijo de tarjeta', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO_PRESTADO);
  const ibk = hojaDe(m, 'TC IBK');
  const base = { idCliente: ID, hoja: 'TC IBK', filas: [3], verificar: [{ fila: 3, monto: 45, descripcion: 'Pedido de prueba' }] };
  assert.deepEqual(m.llamar('marcarPagado', base).datos, { actualizadas: 1, omitidas: [] });
  assert.equal(ibk.valores[2][8], 'Pagado');
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B', 'el sufijo sigue ahí');
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').pendiente, 0);
  const pagados = m.llamar('tarjetas', { incluirPagados: true }).datos.tarjetas.find((t) => t.id === 'IBK_B');
  assert.equal(pagados.estados[0].consumos[0].tarjetaId, 'IBK_B');
  assert.deepEqual(m.llamar('desmarcarPagado', base).datos, { actualizadas: 1, omitidas: [] });
  assert.equal(ibk.valores[2][8], 'Pendiente');
  const b = m.llamar('borrarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' } });
  assert.deepEqual(b.datos, { borrado: true, hoja: 'TC IBK' });
  assert.equal(ibk.valores.length, 2);
});

test('hoja sin columna _id_form: pedir una tarjeta distinta a la de la regla avisa en vez de fallar en silencio', () => {
  const ibkSinId = new HojaFalsa('TC IBK', [new Array(10).fill(''), ENC_TC.slice(0, 10)]);
  const m = crearMotor({ hojas: [hojaSip(), ibkSinId, hojaTc('TC BCP', []), hojaTc('TC Ripley', []),
    new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado']]),
    hojaPresupuesto(), hojaConfig()] });
  assert.deepEqual(m.llamar('registrar', GASTO_PRESTADO),
    { ok: false, codigo: 'datos_invalidos', error: 'Esa hoja no permite elegir la tarjeta; agrega la columna _id_form.' });
  assert.deepEqual(ibkSinId.escrituras, []);
  // La tarjeta de la regla sí se puede (no necesita sufijo).
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { tarjeta: 'IBK_P' })).datos.guardado, true);
  assert.equal(ibkSinId.valores[2][0], 'PersonaA');
  // Y al editar, lo mismo.
  const e = m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' }, tarjeta: 'IBK_B' });
  assert.equal(e.error, 'Esa hoja no permite elegir la tarjeta; agrega la columna _id_form.');
  assert.equal(m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' }, tarjeta: 'IBK_P' }).datos.actualizado, true);
});

test('sufijo con tarjeta desactivada o inexistente: el consumo vuelve a la regla de siempre; quitarTarjeta cuenta los prestados', () => {
  const m = motorCompleto();
  m.llamar('registrar', GASTO_PRESTADO);
  // La Interbank de PersonaB tiene un pendiente (el prestado a PersonaA): pide forzar.
  assert.deepEqual(m.llamar('quitarTarjeta', { id: 'IBK_B' }).datos, { quitada: false, pendientes: 1 });
  assert.equal(m.llamar('quitarTarjeta', { id: 'IBK_P' }).datos.quitada, true, 'la de PersonaA no tiene pendientes: se quita directo');
  m.llamar('restaurarTarjeta', { id: 'IBK_P' });
  m.llamar('quitarTarjeta', { id: 'IBK_B', forzar: true });
  const tarjetas = m.llamar('tarjetas', {}).datos.tarjetas;
  assert.equal(tarjetas.find((t) => t.id === 'IBK_B'), undefined);
  const c = tarjetas.find((t) => t.id === 'IBK_P').estados[0].consumos[0];
  assert.deepEqual([c.tarjetaId, c.responsable, c.prestada], ['IBK_P', 'PersonaA', undefined]);
  // Sufijo escrito a mano con un id que no existe.
  m.llamar('restaurarTarjeta', { id: 'IBK_B' });
  hojaDe(m, 'TC IBK').valores[2][COL_ID_FORM] = 'APP:' + ID + '|TC:FANTASMA';
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_P').pendiente, 45);
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').pendiente, 0);
});

test('avisos y calendario siguen a la tarjeta usada: el evento y el aviso son de la tarjeta de PersonaB', () => {
  const m = motorCompleto({ propiedades: { FINFAMILY_AJUSTES_AVISOS: JSON.stringify({ presupuesto: false, resumenSemanal: false }) } });
  m.llamar('registrar', GASTO_PRESTADO);
  hojaDe(m, 'TC SIP').valores[3][8] = 'Pagado'; // sin deuda en la SIP para aislar el caso
  const cal = m.contexto.sincronizarCalendario();
  assert.equal(cal.creados, 1);
  assert.equal(Object.values(m.eventos)[0].titulo, 'Vence TC IBK · PersonaB: S/ 45');
  assert.deepEqual(Object.keys(JSON.parse(m.propiedades.FINFAMILY_CALENDARIO)), ['IBK_B|2026-12-20']);
  m.estado.hoy = '2026-12-17';
  assert.equal(m.contexto.avisosDeVencimiento().enviado, true);
  assert.equal(m.correos[0].subject, 'FinFamily: TC IBK · PersonaB vence en 3 días (S/ 45)');
});

test('gasto grande con tarjeta prestada: el correo dice quién gastó; versión 1.7.0', () => {
  const m = motorCompleto();
  m.llamar('registrar', Object.assign({}, GASTO_PRESTADO, { monto: 450, descripcion: 'Saga Falabella' }));
  assert.equal(m.correos[0].subject, 'FinFamily: PersonaA registró S/ 450 en Saga Falabella (TC Interbank)');
  assert.equal(m.llamar('version', {}).datos.version, '1.23.0');
});

// ===========================================================================
// Motor 1.7: de dónde sale cada gasto (origen en _id_form) y bolsas
// ===========================================================================

const OR_PERSONA_A = '|OR:P%3APersonaA';
const OR_PERSONA_B = '|OR:P%3APersonaB';
const OR_VIAJE = '|OR:A%3AAhorro%20Viaje';
const COL_ID_HORMIGA = 9;

function hojaHormigaConId() {
  return new HojaFalsa('Gastos Hormiga', [['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado',
    'Nota / Observación', '_ID_FORM', '_HUELLA_FORM']]);
}

// Presupuesto sintético con los saldos del ejemplo: octubre 558.81, noviembre 985.57 (diciembre 185).
function presupuestoBolsas() {
  const p = hojaPresupuesto();
  p.valores[12] = ['SALDO / SUPERÁVIT FINAL', 558.81, 985.57, 185];
  return p;
}

/** Motor con todas las hojas de tarjeta vacías, hormiga con _ID_FORM y el presupuesto del ejemplo. Hoy: 06/11/2026. */
function motorBolsas(config) {
  const c = config || {};
  const hojas = [hojaTc('TC SIP', []), hojaTc('TC IBK', []), hojaTc('TC BCP', []), hojaTc('TC Ripley', []),
    hojaHormigaConId(), c.presupuesto || presupuestoBolsas(), hojaConfig()];
  return crearMotor(Object.assign({ hojas, hoy: '2026-11-06' }, c));
}

const AHORROS_NOV = [
  { meta: 'Ahorro Casa', acumulado: 110, retirado: 0, retiradoMes: 0, disponible: 110 },
  { meta: 'Ahorro Viaje', acumulado: 25.5, retirado: 0, retiradoMes: 0, disponible: 25.5 },
  { meta: 'Fondo de Emergencia', acumulado: 20, retirado: 0, retiradoMes: 0, disponible: 20 }
];
const GASTO_119 = Object.assign({}, GASTO, { monto: 119 }); // TC IBK, 05/11 -> fecha de pago 30/11

test('registrar con origen personal: se anota como sufijo |OR: y la respuesta lo confirma con el nombre completo', () => {
  const m = motorBolsas();
  const r = m.llamar('registrar', Object.assign({}, GASTO_119, { origen: 'P:PersonaA' }));
  assert.deepEqual(r, { ok: true, datos: { guardado: true, hoja: 'TC IBK', fila: 3, duplicadoId: false, origen: 'P:PersonaA' } });
  const f = hojaDe(m, 'TC IBK').valores[2];
  assert.equal(f[COL_ID_FORM], 'APP:' + ID + OR_PERSONA_A);
  assert.equal(f[0], 'PersonaA');
  assert.equal(f[6].getDate(), 30, 'las fechas de siempre');
  // Sin origen (o vacío) no se anota nada y la respuesta es la de siempre.
  const comun = m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', origen: '' }));
  assert.deepEqual(comun.datos, { guardado: true, hoja: 'TC IBK', fila: 4, duplicadoId: false });
  assert.equal(hojaDe(m, 'TC IBK').valores[3][COL_ID_FORM], 'APP:prueba-0002');
  // Reintento del primero: no duplica aunque la fila tenga sufijo de origen.
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO_119, { origen: 'P:PersonaA' })).datos.duplicadoId, true);
  assert.equal(hojaDe(m, 'TC IBK').valores.length, 4);
});

test('registrar con tarjeta prestada y origen ahorro: los dos sufijos conviven y la app los recibe por separado', () => {
  const m = motorBolsas();
  const r = m.llamar('registrar', Object.assign({}, GASTO_PRESTADO, { origen: 'A:ahorro viaje' }));
  assert.deepEqual(r.datos, { guardado: true, hoja: 'TC IBK', fila: 3, duplicadoId: false, tarjeta: 'IBK_B', prestada: true, origen: 'A:Ahorro Viaje' });
  assert.equal(hojaDe(m, 'TC IBK').valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B' + OR_VIAJE);
  const c = m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').estados[0].consumos[0];
  assert.deepEqual([c.idForm, c.tarjetaId, c.prestada, c.origen, c.responsable], ['APP:' + ID, 'IBK_B', true, 'A:Ahorro Viaje', 'PersonaA']);
  // El consumo del fondo común trae origen ''.
  m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', monto: 10 }));
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_P').estados[0].consumos[0].origen, '');
});

test('registrar: orígenes que no valen se rechazan sin escribir', () => {
  const m = motorBolsas();
  const casos = [
    ['P:PersonaC', 'Esa persona no está en la lista.'],
    ['A:Ahorro Moto', 'Ese ahorro no está en el presupuesto.'],
    ['A:Luz', 'Ese ahorro no está en el presupuesto.'],      // Luz es una línea de gastos, no de ahorros
    ['X:algo', 'El origen no es válido.'],
    ['sobrante', 'El origen no es válido.'],
    ['P:', 'El origen no es válido.'],
    [123, 'El origen no es válido.'],
    ['P:' + 'x'.repeat(200), 'El origen no es válido.']
  ];
  for (const [origen, error] of casos) {
    assert.deepEqual(m.llamar('registrar', Object.assign({}, GASTO, { origen })), { ok: false, codigo: 'datos_invalidos', error }, String(origen));
  }
  assert.deepEqual(hojaDe(m, 'TC IBK').escrituras, []);
  // Con hoy en un mes que no está en el presupuesto no hay ahorros que elegir, pero las personas sí.
  const fuera = motorBolsas({ hoy: '2027-03-02' });
  assert.equal(fuera.llamar('registrar', Object.assign({}, GASTO, { fecha: '2027-03-01', origen: 'A:Ahorro Viaje' })).error, 'Ese ahorro no está en el presupuesto.');
  assert.equal(fuera.llamar('registrar', Object.assign({}, GASTO, { fecha: '2027-03-01', origen: 'P:PersonaB' })).datos.origen, 'P:PersonaB');
});

test('origen en Gastos Hormiga (Yape): se anota igual; si la hoja no tiene _id_form avisa', () => {
  const m = motorBolsas();
  const yape = { idCliente: ID, monto: 20, medio: 'YAPE', concepto: 'Delivery', descripcion: 'Antojo', fecha: '2026-11-03', responsable: 'PersonaB', origen: 'P:PersonaB' };
  const r = m.llamar('registrar', yape);
  assert.deepEqual(r.datos, { guardado: true, hoja: 'Gastos Hormiga', fila: 2, duplicadoId: false, origen: 'P:PersonaB' });
  const f = hojaDe(m, 'Gastos Hormiga').valores[1];
  assert.deepEqual([f[0], f[6], f[7], f[COL_ID_HORMIGA]], ['PersonaB', 'Yape', 'Pagado', 'APP:' + ID + OR_PERSONA_B]);
  const b = m.llamar('bolsas', {}).datos;
  assert.deepEqual(b.comun, { saldoHoja: 985.57, fuera: 0, saldo: 985.57 }, 'un hormiga no cambia el saldo de la hoja');
  assert.deepEqual(b.personas[1], { nombre: 'PersonaB', acumulado: 279.41, gastado: 20, gastadoMes: 20, disponible: 259.41, comprometido: 0 });
  // Hoja de hormiga sin la columna (la de las pruebas viejas).
  const sinId = motorCompleto();
  assert.deepEqual(sinId.llamar('registrar', yape),
    { ok: false, codigo: 'datos_invalidos', error: 'Esa hoja no permite anotar de dónde sale el gasto; agrega la columna _id_form.' });
  assert.deepEqual(hojaDe(sinId, 'Gastos Hormiga').escrituras, []);
  assert.equal(sinId.llamar('registrar', Object.assign({}, yape, { origen: '' })).datos.guardado, true, 'del fondo común sí se puede');
});

test('confirmarPendiente con origen: el consumo del correo queda anotado como del sobrante de quien lo confirma', () => {
  const m = motorConCorreos();
  m.contexto.leerCorreosDeBancos();
  assert.equal(m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado', origen: 'P:Nadie' }).error, 'Esa persona no está en la lista.');
  assert.equal(m.llamar('pendientes', {}).datos.pendientes.some((p) => p.id === 'msg-bcp-1'), true, 'sigue pendiente');
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-bcp-1', concepto: 'Supermercado', origen: 'P:PersonaA' });
  assert.deepEqual(r.datos, { confirmado: true, hoja: 'TC BCP', fila: 3, origen: 'P:PersonaA' });
  assert.equal(hojaDe(m, 'TC BCP').valores[2][COL_ID_FORM], 'APP:' + ID + OR_PERSONA_A);
  // Tarjeta heredada del lector + origen ahorro en el mismo consumo.
  const r2 = m.llamar('confirmarPendiente', { idCliente: 'prueba-0002', id: 'msg-ibk-1', concepto: 'Delivery', origen: 'A:Fondo de emergencia' });
  assert.deepEqual(r2.datos, { confirmado: true, hoja: 'TC IBK', fila: 3, tarjeta: 'IBK_B', prestada: true, origen: 'A:Fondo de Emergencia' });
  assert.equal(hojaDe(m, 'TC IBK').valores[2][COL_ID_FORM], 'APP:prueba-0002|TC:IBK_B|OR:A%3AFondo%20de%20Emergencia');
});

test('editarGasto con origen: ida y vuelta, vale como único cambio y conserva el sufijo de tarjeta', () => {
  const m = motorBolsas();
  m.llamar('registrar', GASTO);
  const ibk = hojaDe(m, 'TC IBK');
  const v = { monto: 45, descripcion: 'Pedido de prueba' };
  const base = { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: v };
  const r = m.llamar('editarGasto', Object.assign({}, base, { origen: 'P:PersonaB' }));
  assert.deepEqual(r.datos, { actualizado: true, hoja: 'TC IBK', fila: 3, origen: 'P:PersonaB' });
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + OR_PERSONA_B);
  // Solo se tocaron _id_form y la huella de control (que se rehace igual en cada edición).
  assert.deepEqual(ibk.escrituras.slice(-2), [{ fila: 3, col: COL_ID_FORM + 1, valor: 'APP:' + ID + OR_PERSONA_B },
    { fila: 3, col: COL_ID_FORM + 2, valor: sha256Hex('2026-11-05|45.00|pedido de prueba') }]);
  assert.equal(ibk.valores[2][7].getDate(), 15, 'las fechas no cambian');
  // Cambiar la tarjeta conserva el origen.
  m.llamar('editarGasto', Object.assign({}, base, { tarjeta: 'IBK_B' }));
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B' + OR_PERSONA_B);
  // Cambiar el origen (dentro de `cambios`) conserva la tarjeta.
  const r3 = m.llamar('editarGasto', Object.assign({}, base, { cambios: { origen: 'A:Ahorro Casa' } }));
  assert.equal(r3.datos.origen, 'A:Ahorro Casa');
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B|OR:A%3AAhorro%20Casa');
  // Otros cambios no tocan los sufijos.
  m.llamar('editarGasto', Object.assign({}, base, { cambios: { nota: 'ok' } }));
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B|OR:A%3AAhorro%20Casa');
  // '' lo devuelve al fondo común.
  const r5 = m.llamar('editarGasto', Object.assign({}, base, { origen: '' }));
  assert.deepEqual(r5.datos, { actualizado: true, hoja: 'TC IBK', fila: 3, origen: '' });
  assert.equal(ibk.valores[2][COL_ID_FORM], 'APP:' + ID + '|TC:IBK_B');
  assert.equal(m.llamar('tarjetas', {}).datos.tarjetas.find((t) => t.id === 'IBK_B').estados[0].consumos[0].origen, '');
});

test('editarGasto con origen: validaciones y hoja sin _id_form', () => {
  const m = motorBolsas();
  m.llamar('registrar', GASTO);
  const base = { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' } };
  assert.equal(m.llamar('editarGasto', Object.assign({}, base, { origen: 'P:PersonaC' })).error, 'Esa persona no está en la lista.');
  assert.equal(m.llamar('editarGasto', Object.assign({}, base, { origen: 'A:Nada' })).error, 'Ese ahorro no está en el presupuesto.');
  assert.equal(m.llamar('editarGasto', Object.assign({}, base, { cambios: { origen: 'zzz' } })).error, 'El origen no es válido.');
  assert.equal(m.llamar('editarGasto', base).error, 'No hay cambios para guardar.');
  assert.equal(hojaDe(m, 'TC IBK').valores[2][COL_ID_FORM], 'APP:' + ID);
  // En Gastos Hormiga sin la columna: avisa; quitar un origen que no tiene no es error.
  const sinId = motorCompleto();
  sinId.llamar('registrar', { idCliente: ID, monto: 20, medio: 'YAPE', concepto: 'Delivery', descripcion: 'Antojo', fecha: '2026-11-03' });
  const h = { idCliente: ID, hoja: 'Gastos Hormiga', fila: 2, verificar: { monto: 20, descripcion: 'Antojo' } };
  assert.equal(sinId.llamar('editarGasto', Object.assign({}, h, { origen: 'P:PersonaB' })).error,
    'Esa hoja no permite anotar de dónde sale el gasto; agrega la columna _id_form.');
  assert.deepEqual(sinId.llamar('editarGasto', Object.assign({}, h, { origen: '' })).datos, { actualizado: true, hoja: 'Gastos Hormiga', fila: 2, origen: '' });
});

test('bolsas: el ejemplo completo por la acción (PersonaA gasta 119 de su sobrante con tarjeta, se paga en noviembre: sale del sobrante de noviembre) e inicio trae lo mismo', () => {
  const m = motorBolsas();
  m.llamar('registrar', Object.assign({}, GASTO_119, { origen: 'P:PersonaA' }));
  const esperado = {
    mes: '2026-11',
    comun: { saldoHoja: 985.57, fuera: 119, saldo: 1104.57 },
    personas: [
      { nombre: 'PersonaA', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 119 },
      { nombre: 'PersonaB', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 0 }
    ],
    ahorros: AHORROS_NOV,
    otros: 0,
    disponible: 1663.39,
    meses: [
      { clave: '2026-10', saldoHoja: 558.81, fuera: 0, saldo: 558.81, porPersona: 279.41 },
      { clave: '2026-11', saldoHoja: 985.57, fuera: 119, saldo: 1104.57, porPersona: 552.29 }
    ],
    proximos: [
      { mes: '2026-11', porPersona: 552.29, personas: [
        { nombre: 'PersonaA', apartado: 119, queda: 433.29 }, { nombre: 'PersonaB', apartado: 0, queda: 552.29 }] },
      { mes: '2026-12', porPersona: 92.5, personas: [
        { nombre: 'PersonaA', apartado: 0, queda: 92.5 }, { nombre: 'PersonaB', apartado: 0, queda: 92.5 }] }
    ]
  };
  assert.deepEqual(m.llamar('bolsas', { mes: '2026-11' }), { ok: true, datos: esperado });
  assert.deepEqual(m.llamar('bolsas', {}).datos, esperado, 'sin mes usa el actual');
  assert.deepEqual(m.llamar('inicio', {}).datos.bolsas, esperado);
  // El mismo gasto del fondo común no mueve nada.
  const comun = motorBolsas();
  comun.llamar('registrar', GASTO_119);
  const b = comun.llamar('bolsas', {}).datos;
  assert.deepEqual(b.comun, { saldoHoja: 985.57, fuera: 0, saldo: 985.57 });
  assert.equal(b.disponible, 1544.39, '985.57 + 279.41 + 279.41');
});

test('bolsas: sacar de un ahorro baja ese ahorro y devuelve el monto al fondo común si fue con tarjeta; la acción ahorros lo muestra', () => {
  const m = motorBolsas();
  m.llamar('registrar', Object.assign({}, GASTO, { monto: 20, medio: 'TC_BCP', origen: 'A:Ahorro Casa' }));               // tarjeta, pago 30/11
  m.llamar('registrar', { idCliente: 'prueba-0002', monto: 10, medio: 'PLIN', concepto: 'Delivery', descripcion: 'Plin', fecha: '2026-11-04', origen: 'A:Ahorro Casa' });
  const b = m.llamar('bolsas', {}).datos;
  assert.deepEqual(b.ahorros[0], { meta: 'Ahorro Casa', acumulado: 110, retirado: 30, retiradoMes: 30, disponible: 80 });
  assert.deepEqual(b.comun, { saldoHoja: 985.57, fuera: 20, saldo: 1005.57 }, 'solo el de tarjeta entra a "fuera"');
  assert.deepEqual(b.personas.map((p) => p.disponible), [279.41, 279.41]);
  const a = m.llamar('ahorros', { mes: '2026-11' }).datos;
  assert.deepEqual(a.metas.map((x) => [x.concepto, x.acumulado, x.retirado, x.disponible]),
    [['Ahorro Casa', 110, 30, 80], ['Ahorro Viaje', 25.5, 0, 25.5], ['Fondo de Emergencia', 20, 0, 20]]);
  assert.equal(m.llamar('ahorros', { mes: '2026-10' }).datos.metas[0].retirado, 0, 'en octubre todavía no se había sacado');
  assert.equal(a.total, 155.5, 'los totales de siempre no cambian');
});

test('bolsas: una tarjeta sin fecha de pago (Ripley) no entra a "fuera"; queda apartada del sobrante de su mes', () => {
  const m = motorBolsas();
  const r = m.llamar('registrar', Object.assign({}, GASTO, { monto: 80, medio: 'TC_RIPLEY', origen: 'P:PersonaA' }));
  assert.equal(r.datos.guardado, true);
  assert.equal(hojaDe(m, 'TC Ripley').valores[2][6], '', 'Ripley no tiene fecha de pago');
  const b = m.llamar('bolsas', {}).datos;
  assert.equal(b.comun.fuera, 0);
  assert.deepEqual(b.personas[0], { nombre: 'PersonaA', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 80 });
});

test('bolsas: meses futuros no se acumulan; mes que no está o no es válido da error; inicio no se rompe', () => {
  const m = motorBolsas(); // hoy: noviembre
  const dic = m.llamar('bolsas', { mes: '2026-12' }).datos;
  assert.equal(dic.personas[0].acumulado, 772.2, 'octubre (279.41) + noviembre (492.79)');
  assert.deepEqual(dic.comun, { saldoHoja: 185, fuera: 0, saldo: 185 });
  assert.deepEqual(dic.meses.map((x) => x.clave), ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(dic.ahorros.map((x) => x.acumulado), [180, 55.5, 40], 'los ahorros sí van hasta el mes pedido');
  const oct = m.llamar('bolsas', { mes: '2026-10' }).datos;
  assert.deepEqual(oct.personas.map((p) => p.acumulado), [0, 0]);
  assert.deepEqual(m.llamar('bolsas', { mes: '2030-01' }), { ok: false, codigo: 'datos_invalidos', error: 'Ese mes no está en el presupuesto.' });
  assert.equal(m.llamar('bolsas', { mes: 'noviembre' }).error, 'El mes no es válido.');
  // Hoy en un mes que no está en la hoja: inicio responde con bolsas en null.
  const fuera = motorBolsas({ hoy: '2027-03-02' });
  const inicio = fuera.llamar('inicio', {});
  assert.equal(inicio.ok, true);
  assert.equal(inicio.datos.bolsas, null);
  assert.equal(inicio.datos.presupuesto, null);
  assert.ok(fuera.avisosConsola.some((t) => /bolsas/.test(t)));
});

test('bolsas: si quitan a la persona o renombran el ahorro, esos gastos pasan a "otros" sin romper nada', () => {
  const m = motorBolsas();
  m.llamar('registrar', { idCliente: ID, monto: 20, medio: 'YAPE', concepto: 'Delivery', descripcion: 'De PersonaB', fecha: '2026-11-03', responsable: 'PersonaB', origen: 'P:PersonaB' });
  m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', monto: 15, medio: 'TC_BCP', origen: 'A:Ahorro Viaje' }));
  assert.equal(m.llamar('bolsas', {}).datos.otros, 0);
  m.llamar('renombrarLinea', { fila: 9, nombre: 'Ahorro Europa' });
  const b = m.llamar('bolsas', {}).datos;
  assert.equal(b.otros, 15);
  assert.deepEqual(b.ahorros[1], { meta: 'Ahorro Europa', acumulado: 25.5, retirado: 0, retiradoMes: 0, disponible: 25.5 });
  assert.equal(b.comun.fuera, 15, 'igual se devuelve al fondo común: la hoja lo restó');
  m.llamar('quitarUsuario', { correo: 'persona-b@example.test' });
  const b2 = m.llamar('bolsas', {}).datos;
  assert.equal(b2.otros, 35);
  assert.deepEqual(b2.personas.map((p) => p.nombre), ['PersonaA']);
  assert.equal(m.llamar('inicio', {}).datos.bolsas.otros, 35);
});

test('bolsas con un solo usuario (N = 1): todo el saldo de los meses anteriores es suyo', () => {
  const m = motorBolsas({ propiedades: { USUARIOS: JSON.stringify({ 'persona-a@example.test': { nombre: 'PersonaA', clave: 'P' } }) } });
  m.llamar('registrar', Object.assign({}, GASTO_119, { origen: 'P:PersonaA' }));
  const b = m.llamar('bolsas', {}).datos;
  assert.deepEqual(b.personas, [{ nombre: 'PersonaA', acumulado: 558.81, gastado: 0, gastadoMes: 0, disponible: 558.81, comprometido: 119 }]);
  assert.deepEqual(b.meses.map((x) => x.porPersona), [558.81, 1104.57]);
  assert.equal(b.disponible, 1663.38);
  assert.equal(m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0002', origen: 'P:PersonaB' })).error, 'Esa persona no está en la lista.');
});

test('versión 1.7.0: la acción bolsas está en la lista y presupuesto no cambió', () => {
  const m = motorBolsas();
  const v = m.llamar('version', {}).datos;
  assert.equal(v.version, '1.23.0');
  assert.ok(v.acciones.includes('bolsas'));
  const p = m.llamar('presupuesto', { mes: '2026-11' }).datos;
  assert.equal(p.totales.saldo, 985.57);
  assert.equal(p.bolsas, undefined);
});


// ---------- 1.7.1: la huella va cifrada (el formulario B&P exige SHA-256 de 64 caracteres) ----------

function sha256Hex(texto) { return require('node:crypto').createHash('sha256').update(texto, 'utf8').digest('hex'); }

test('1.7.1: registrar escribe la huella como SHA-256 de 64 caracteres (la firma del gasto, cifrada)', () => {
  const m = motorCompleto();
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', GASTO);
  const huella = ibk.valores[2][COL_ID_FORM + 1];
  assert.match(huella, /^[0-9a-f]{64}$/);
  assert.equal(huella, sha256Hex('2026-11-05|45.00|pedido de prueba'));
  // El duplicado por contenido sigue funcionando (no depende de la huella).
  const r = m.llamar('registrar', Object.assign({}, GASTO, { idCliente: 'prueba-0009' }));
  assert.equal(r.datos.posibleDuplicado, true);
});

test('1.7.1: editarGasto rehace la huella cifrada con los datos nuevos', () => {
  const m = motorCompleto();
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', GASTO);
  m.llamar('editarGasto', { idCliente: ID, hoja: 'TC IBK', fila: 3, verificar: { monto: 45, descripcion: 'Pedido de prueba' }, cambios: { monto: 50 } });
  assert.equal(ibk.valores[2][COL_ID_FORM + 1], sha256Hex('2026-11-05|50.00|pedido de prueba'));
});

test('1.7.1: repararHuellas corrige solo las filas de FinFamily con huella en texto, una vez, sin tocar las del formulario', () => {
  const m = motorCompleto();
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', GASTO);
  // Simula una fila escrita por la versión anterior (huella en texto) y una del formulario B&P.
  ibk.valores[2][COL_ID_FORM + 1] = '2026-11-05|45.00|pedido de prueba';
  const filaForm = ibk.valores[2].slice();
  filaForm[COL_ID_FORM] = 'BPWEB:1234'; filaForm[COL_ID_FORM + 1] = 'texto-del-formulario';
  ibk.valores.push(filaForm);
  const r = m.contexto.repararHuellas();
  assert.equal(r.reparadas, 1);
  assert.equal(JSON.stringify(r.porHoja), JSON.stringify({ 'TC IBK': 1 }));
  assert.equal(ibk.valores[2][COL_ID_FORM + 1], sha256Hex('2026-11-05|45.00|pedido de prueba'));
  assert.equal(ibk.valores[3][COL_ID_FORM + 1], 'texto-del-formulario', 'la fila del formulario no se toca');
  // Ya cifrada: no hay nada más que corregir.
  assert.equal(m.contexto.repararHuellas().reparadas, 0);
  // Una sola vez automática: la segunda llamada no hace nada.
  ibk.valores[2][COL_ID_FORM + 1] = 'otra|vez|texto';
  assert.equal(m.contexto.repararHuellasUnaVez_().reparadas, 1);
  ibk.valores[2][COL_ID_FORM + 1] = 'otra|vez|texto';
  assert.equal(m.contexto.repararHuellasUnaVez_(), null);
});

test('1.7.1: una fila de FinFamily sin huella recibe la huella cifrada calculada con sus datos', () => {
  const m = motorCompleto();
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', GASTO);
  ibk.valores[2][COL_ID_FORM + 1] = '';
  assert.equal(m.contexto.repararHuellas().reparadas, 1);
  assert.equal(ibk.valores[2][COL_ID_FORM + 1], sha256Hex('2026-11-05|45.00|pedido de prueba'));
});

// ---------- 1.8.0: el lector también lee Yape y Lemon ----------

const CORREO_YAPE = (id, beneficiario, celular, monto) => ({
  id, de: 'YAPE Notificaciones <notificaciones@yape.pe>', asunto: 'Por tu seguridad, te notificaremos por cada yapeo que realices',
  cuerpo: '¡Hola, PersonaA Test! ¡Acabas de yapear exitosamente! Monto de yapeo* S/ ' + monto + ' Yapero PersonaA Test ' +
    'Tu número de celular XXXXXXXXX101 Fecha y Hora de la operación 02 noviembre 2026 - 09:52 p. m. Celular del Beneficiario XXXXXXXXX' + celular +
    ' Nombre del Beneficiario ' + beneficiario + ' Nº de operación 700004 *Por tu seguridad...',
  fecha: new Date(2026, 10, 2, 21, 53)
});
// Los identificadores y CCI son sintéticos; los ID externos conservan la fecha de prueba.
const CORREO_LEMON = (id, destino, monto) => ({
  id, de: 'Lemon <notificaciones@lemoncash.com.ar>', asunto: 'Enviaste S/ ' + monto,
  cuerpo: 'Realizaste un envío de soles Descargar PersonaA Prueba Prueba, ¡realizaste un envío exitoso de S/ ' + monto + '.0000!: ' +
    'Datos del destinatario: Nombre: ' + destino + ' N° de teléfono: N/A CCI: 00000000000000000000 Entidad: BCP Mensaje: Otros detalles: ID externo: 2026110500000001',
  fecha: new Date(2026, 10, 5, 19, 48)
});

test('1.8.0: la primera pasada trae Yape y Lemon desde el día 1 del mes; los envíos a uno mismo no entran', () => {
  const m = motorCompleto({ hoy: '2026-11-09', hilos: [
    { mensajes: [CORREO_YAPE('msg-yape-1', 'PersonaB PRUEBA C.', '222', '9.00')] },
    { mensajes: [CORREO_YAPE('msg-yape-propio', 'PersonaA', '111', '126.00')] },
    { mensajes: [CORREO_LEMON('msg-lemon-1', 'Persona De Prueba', '5')] },
    { mensajes: [CORREO_LEMON('msg-lemon-propio', 'PersonaA', '51')] }
  ] });
  assert.match(m.contexto.consultaGmail_(), /from:yape\.pe/);
  assert.match(m.contexto.consultaGmail_(), /subject:yapeo/);
  const r = m.contexto.leerCorreosDeBancos();
  assert.equal(r.agregados, 2);
  assert.equal(m.consultasGmail.length, 3, 'bancos, la primera pasada de billeteras y los pagos de servicios (1.23.0)');
  assert.match(m.consultasGmail[1], /^newer_than:9d \(from:yape\.pe OR from:lemoncash\.com\.ar/);
  assert.match(m.consultasGmail[2], /débito automático/);
  assert.ok(m.propiedades.FINFAMILY_BILLETERAS_V3, 'queda anotado que ya se hizo la primera pasada');

  const hoja = hojaDe(m, 'Por confirmar');
  assert.deepEqual(hoja.valores[1].slice(0, 10), ['msg-yape-1', '2026-11-02', 'YAPE', 'YAPE', 'Yape a Personab Prueba C', 9, 'PEN', '', 'PersonaA', 'Pendiente']);
  assert.deepEqual(hoja.valores[2].slice(0, 10), ['msg-lemon-1', '2026-11-05', 'LEMON', 'LEMON', 'Lemon a Persona De Prueba', 5, 'PEN', '', 'PersonaA', 'Pendiente']);
  const p = m.llamar('pendientes', {}).datos.pendientes;
  assert.deepEqual(p.map((x) => [x.comercio, x.medioSugerido]).sort(), [['Lemon a Persona De Prueba', 'LEMON'], ['Yape a Personab Prueba C', 'YAPE']]);

  // Confirmar el de Lemon: va a Gastos Hormiga con medio "Lemon".
  const c = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-lemon-1', concepto: 'Luz' });
  assert.deepEqual(c.datos, { confirmado: true, hoja: 'Gastos Hormiga', fila: 2 }, JSON.stringify(c));
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.deepEqual(hormiga.valores[1].slice(0, 8), ['PersonaA', 'Noviembre', hormiga.valores[1][2], 'Luz', 'Lemon a Persona De Prueba', 5, 'Lemon', 'Pagado']);
  assert.equal(hormiga.valores[1][2].getDate(), 5);
  const y = m.llamar('confirmarPendiente', { idCliente: 'prueba-0002', id: 'msg-yape-1', concepto: 'Delivery' });
  assert.equal(y.datos.confirmado, true);
  assert.equal(hormiga.valores[2][6], 'Yape');

  // Segunda pasada: ya no busca desde el día 1 (solo bancos y pagos de servicios).
  m.contexto.leerCorreosDeBancos();
  assert.equal(m.consultasGmail.length, 5);
  assert.ok(!/from:yape\.pe OR from:lemoncash/.test(m.consultasGmail[3]) || /subject:/.test(m.consultasGmail[3]));
});

test('1.8.0: Lemon aparece como medio directo en config', () => {
  const m = motorCompleto();
  const medios = m.llamar('config', {}).datos.medios;
  assert.deepEqual(medios.find((x) => x.id === 'LEMON'), { id: 'LEMON', etiqueta: 'Lemon', hoja: 'Gastos Hormiga', tipo: 'directo' });
});

test('1.8.1: con el texto tal como lo entrega Gmail (asteriscos y saltos) y limpia una sola vez lo mal leído', () => {
  const yapeGmail = { id: 'msg-yape-g', de: 'YAPE Notificaciones <notificaciones@yape.pe>', asunto: 'Por tu seguridad, te notificaremos por cada yapeo que realices',
    cuerpo: '*¡Hola, PersonaA Test!*\r\n\r\n*¡Acabas de yapear exitosamente!*\r\n\r\n*Monto de yapeo**\r\n\r\nS/ 3.90\r\n\r\nYapero PersonaA Test Tu número de celular XXXXXXXXX101 Fecha y Hora de la operación 08 noviembre 2026 - 12:13 p. m. Celular del Beneficiario XXXXXXXXX202 Nombre del Beneficiario PersonaB PRUEBA C. Nº de operación 700002\r\n\r\n*Por tu seguridad, te notificaremos por cada\r\nyapeo que realices.',
    fecha: new Date(2026, 10, 8, 12, 14) };
  const lemonGmail = (id, destino, monto) => ({ id, de: 'Lemon <notificaciones@lemoncash.com.ar>', asunto: 'Enviaste S/ ' + monto,
    cuerpo: '*Realizaste un envío de soles*\n\nPersonaA Prueba Prueba, ¡realizaste un envío exitoso de S/ ' + monto + '.0000!: A continuación, los detalles de la operación:\n\n*Datos del destinatario:\u00a0*\n\n   - Nombre: ' + destino + '\n   - N° de teléfono: N/A\n   - CCI: 00000000000000000000\n   - Entidad: TARJETA OH\n   - Mensaje:\n\n*Otros detalles:*\n*ID externo:* 2026110500000002',
    fecha: new Date(2026, 10, 5, 19, 48) });
  // Lo que dejó la 1.8.0: un Lemon mal leído, pendiente, y uno ya confirmado (ese no se toca).
  const m = motorCompleto({ hoy: '2026-11-09', propiedades: { FINFAMILY_BILLETERAS_V1: 'x' }, hilos: [
    { mensajes: [yapeGmail] }, { mensajes: [lemonGmail('msg-lemon-g', 'Persona De Prueba', '5')] },
    { mensajes: [lemonGmail('msg-lemon-propio', 'PersonaA Prueba Prueba', '51')] }
  ] });
  m.contexto.leerCorreosDeBancos();
  const hoja = hojaDe(m, 'Por confirmar');
  hoja.valores = [hoja.valores[0],
    ['msg-lemon-g', '2026-11-05', 'LEMON', 'LEMON', 'Lemon a Alguien', 5, 'PEN', '', 'mal', 'Pendiente', '2026-11-05 19:48', ''],
    ['msg-lemon-propio', '2026-11-01', 'LEMON', 'LEMON', 'Lemon a Alguien', 51, 'PEN', '', 'mal', 'Pendiente', '2026-11-01 11:58', ''],
    ['msg-viejo', '2026-11-02', 'LEMON', 'LEMON', 'Lemon a Alguien', 3, 'PEN', '', 'PersonaA', 'Confirmado', '2026-11-02 10:00', '']];
  delete m.propiedades.FINFAMILY_BILLETERAS_V3;
  const r = m.contexto.leerCorreosDeBancos();
  assert.equal(r.agregados, 2);
  const filas = hoja.valores.slice(1).map((f) => [f[0], f[4], f[5], f[8], f[9]]);
  assert.deepEqual(filas, [
    ['msg-viejo', 'Lemon a Alguien', 3, 'PersonaA', 'Confirmado'],
    ['msg-yape-g', 'Yape a Personab Prueba C', 3.9, 'PersonaA', 'Pendiente'],
    ['msg-lemon-g', 'Lemon a Persona De Prueba', 5, 'PersonaA', 'Pendiente']
  ]);
  assert.equal(hoja.valores[2][1], '2026-11-08');
  // Ya hecha la limpieza: otra pasada no borra ni repite nada.
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 0);
  assert.equal(hoja.valores.length, 4);
});

// ---------- 1.8.3: los débitos BCP ya confirmados como tarjeta pasan a efectivo, una sola vez ----------

test('1.8.3: un débito BCP confirmado como tarjeta se pasa a Gastos Hormiga como efectivo y sale de la tarjeta', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  const bcp = hojaDe(m, 'TC BCP');
  const filasAntes = bcp.valores.length;
  // Lo que dejó la versión anterior: el débito anotado en la tarjeta BCP, y otro gasto de tarjeta que no se toca.
  m.llamar('registrar', { idCliente: 'debito-0001', monto: 26.4, medio: 'TC_BCP', concepto: 'Supermercado', descripcion: 'Mercado de prueba', fecha: '2026-11-06' });
  m.llamar('registrar', { idCliente: 'tarjeta-0002', monto: 26.4, medio: 'TC_BCP', concepto: 'Supermercado', descripcion: 'Wong', fecha: '2026-11-06' });
  assert.equal(bcp.valores.length, filasAntes + 2);
  const pc = new HojaFalsa('Por confirmar', [
    ['Id', 'Fecha', 'Banco', 'Tarjeta', 'Comercio', 'Monto', 'Moneda', 'Últimos 4', 'Responsable sugerido', 'Estado', 'Fecha correo', 'Asunto'],
    ['msg-1', '2026-11-07', 'BCP', 'BCP', 'MERCADO DE PRUEBA', 26.4, 'PEN', '4826', '', 'Confirmado', '2026-11-07 17:48', 'Realizaste un consumo con tu Tarjeta de Débito BCP'],
    ['msg-2', '2026-11-06', 'SIP', 'SIP', 'WONG', 26.4, 'PEN', '', '', 'Confirmado', '2026-11-06 10:00', 'Sip, realizaste un consumo con tu Tarjeta de Crédito Sip']
  ]);
  m.hojas.push(pc);

  m.contexto.leerCorreosDeBancos();
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.equal(hormiga.valores.length, 2);
  assert.deepEqual(hormiga.valores[1].slice(0, 8), ['PersonaA', 'Noviembre', hormiga.valores[1][2], 'Supermercado', 'Mercado de prueba', 26.4, 'Efectivo', 'Pagado']);
  assert.equal(hormiga.valores[1][2].getDate(), 6);
  assert.equal(bcp.valores.length, filasAntes + 1, 'el débito sale de la tarjeta');
  assert.ok(bcp.valores.some((f) => f.includes('Wong')), 'el gasto de tarjeta de verdad se queda');
  assert.ok(!bcp.valores.some((f) => f.includes('Mercado de prueba')));
  assert.ok(m.propiedades.FINFAMILY_DEBITOS_V1);

  // Una sola vez: otra pasada no mueve nada más.
  m.llamar('registrar', { idCliente: 'debito-0003', monto: 26.4, medio: 'TC_BCP', concepto: 'Supermercado', descripcion: 'Mercado de prueba', fecha: '2026-11-07' });
  m.contexto.leerCorreosDeBancos();
  assert.equal(hormiga.valores.length, 2);
});

// ---------- 1.8.4: fechas de "Por confirmar" con la zona del libro, y corrección de las corridas un día ----------

function hojaPorConfirmarConFechas(filas) {
  return new HojaFalsa('Por confirmar', [
    ['Id', 'Fecha', 'Banco', 'Tarjeta', 'Comercio', 'Monto', 'Moneda', 'Últimos 4', 'Responsable sugerido', 'Estado', 'Fecha correo', 'Asunto']
  ].concat(filas));
}

test('1.8.4: una fecha de "Por confirmar" guardada a medianoche en otra zona no se corre un día', () => {
  // Sheets convirtió '2026-11-07' en fecha a medianoche de Londres (GMT); en Lima eso es el 6 a las 7 p. m.
  const m = motorCompleto({ hoy: '2026-11-09', zonaHoja: 'GMT' });
  m.hojas.push(hojaPorConfirmarConFechas([
    ['msg-1', new Date(Date.UTC(2026, 10, 7)), 'BCP', 'DEBITO_BCP', 'MERCADO DE PRUEBA', 26.4, 'PEN', '4826', 'PersonaA', 'Pendiente',
      new Date(Date.UTC(2026, 10, 7, 17, 47)), 'Realizaste un consumo con tu Tarjeta de Débito BCP']
  ]));
  const p = m.llamar('pendientes', {}).datos.pendientes;
  assert.equal(p[0].fecha, '2026-11-07');
  assert.equal(p[0].fechaCorreo, '2026-11-07 17:47');
  const r = m.llamar('confirmarPendiente', { idCliente: ID, id: 'msg-1', concepto: 'Supermercado' });
  assert.equal(r.datos.confirmado, true);
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.equal(hormiga.valores[1][2].getTime(), Date.UTC(2026, 10, 7), 'el gasto queda con su fecha real (medianoche en la zona del libro)');
});

test('1.8.5: el motor escribe las fechas a la medianoche de la zona del libro (California)', () => {
  const m = motorCompleto({ hoy: '2026-11-09', zonaHoja: 'GMT-8' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'zona-0001', monto: 30, medio: 'TC_IBK', concepto: 'Supermercado', descripcion: 'Desayuno', fecha: '2026-11-07' });
  const fila = ibk.valores.find((f) => String(f[10]).indexOf('APP:zona-0001') === 0);
  assert.equal(fila[2].getTime(), Date.UTC(2026, 10, 7, 8), 'fecha: medianoche del 7 en GMT-8');
  assert.equal(fila[6].getTime(), Date.UTC(2026, 10, 30, 8), 'fecha de pago: medianoche del 30');
  // Al editar la fecha también.
  m.llamar('editarGasto', { idCliente: 'zona-0002', hoja: 'TC IBK', fila: ibk.valores.indexOf(fila) + 1, verificar: { monto: 30, descripcion: 'Desayuno' }, cambios: { fecha: '2026-11-08' } });
  assert.equal(fila[2].getTime(), Date.UTC(2026, 10, 8, 8));
});

test('1.8.5: las fechas que la app escribió antes (con hora) se corrigen una sola vez; las del formulario no', () => {
  const m = motorCompleto({ hoy: '2026-11-09', zonaHoja: 'GMT-8' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'vieja-0001', monto: 30, medio: 'TC_IBK', concepto: 'Supermercado', descripcion: 'Desayuno', fecha: '2026-11-07' });
  const fila = ibk.valores.find((f) => String(f[10]).indexOf('APP:vieja-0001') === 0);
  // Como la dejaba la versión anterior: medianoche de Lima (5 a. m. GMT) = 9 p. m. del día anterior en California.
  fila[2] = new Date(Date.UTC(2026, 10, 7, 5)); fila[6] = new Date(Date.UTC(2026, 10, 30, 5)); fila[7] = new Date(Date.UTC(2026, 11, 15, 5));
  const form = fila.slice(); form[10] = ''; form[2] = new Date(Date.UTC(2026, 10, 3, 5));
  ibk.valores.push(form);
  m.contexto.leerCorreosDeBancos();
  assert.equal(fila[2].getTime(), Date.UTC(2026, 10, 7, 8));
  assert.equal(fila[6].getTime(), Date.UTC(2026, 10, 30, 8));
  assert.equal(fila[7].getTime(), Date.UTC(2026, 11, 15, 8));
  assert.equal(ibk.valores[ibk.valores.length - 1][2].getTime(), Date.UTC(2026, 10, 3, 5), 'la fila del formulario no se toca');
  assert.ok(m.propiedades.FINFAMILY_FECHAS_V2);
});

// ---------- 1.9.0: cambiar "Pagué con" al editar ----------

test('1.9.0: un gasto de tarjeta pasado a efectivo se anota en Gastos Hormiga y sale de la tarjeta', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  const bcp = hojaDe(m, 'TC BCP');
  const antes = bcp.valores.length;
  m.llamar('registrar', { idCliente: 'mover-0001', monto: 26.4, medio: 'TC_BCP', concepto: 'Supermercado', descripcion: 'Mercado de prueba', fecha: '2026-11-07', nota: 'del sábado' });
  const fila = bcp.valores.findIndex((f) => String(f[10]).indexOf('APP:mover-0001') === 0) + 1;
  const r = m.llamar('editarGasto', { idCliente: 'edicion-0001', hoja: 'TC BCP', fila, verificar: { monto: 26.4, descripcion: 'Mercado de prueba' }, cambios: { medio: 'EFECTIVO', concepto: 'Luz' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.datos.movido, r.datos.hoja], [true, 'Gastos Hormiga']);
  assert.equal(bcp.valores.length, antes, 'ya no está en la tarjeta');
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.deepEqual(hormiga.valores[1].slice(0, 8), ['PersonaA', 'Noviembre', hormiga.valores[1][2], 'Luz', 'Mercado de prueba', 26.4, 'Efectivo', 'Pagado']);
  assert.equal(hormiga.valores[1][2].getDate(), 7);
});

test('1.9.0: de Yape a Efectivo en la misma hoja solo cambia el medio', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  m.llamar('registrar', { idCliente: 'yape-0001', monto: 9, medio: 'YAPE', concepto: 'Luz', descripcion: 'Pan', fecha: '2026-11-08' });
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  const r = m.llamar('editarGasto', { idCliente: 'edicion-0002', hoja: 'Gastos Hormiga', fila: 2, verificar: { monto: 9, descripcion: 'Pan' }, cambios: { medio: 'EFECTIVO' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.movido, undefined);
  assert.equal(hormiga.valores.length, 2);
  assert.equal(hormiga.valores[1][6], 'Efectivo');
});

test('1.9.0: de una tarjeta a otra (otra hoja) con fecha nueva; la tarjeta elegida se respeta', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  const sip = hojaDe(m, 'TC SIP');
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'mover-0003', monto: 50, medio: 'TC_SIP', concepto: 'Supermercado', descripcion: 'Wong', fecha: '2026-11-05' });
  const fila = sip.valores.findIndex((f) => String(f[10]).indexOf('APP:mover-0003') === 0) + 1;
  const r = m.llamar('editarGasto', { idCliente: 'edicion-0003', hoja: 'TC SIP', fila, verificar: { monto: 50, descripcion: 'Wong' }, tarjeta: 'IBK_B', cambios: { medio: 'TC_IBK', fecha: '2026-11-06' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.hoja, 'TC IBK');
  assert.ok(!sip.valores.some((f) => String(f[10]).indexOf('APP:mover-0003') === 0));
  const nueva = ibk.valores.find((f) => String(f[10]).indexOf('APP:mover-0003') === 0);
  assert.equal(nueva[2].getDate(), 6);
  assert.match(String(nueva[10]), /\|TC:IBK_B/, 'la tarjeta prestada queda anotada');
});

test('1.9.0: medio que no existe o fila que cambió: no se toca nada', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  m.llamar('registrar', { idCliente: 'mover-0004', monto: 10, medio: 'TC_BCP', concepto: 'Luz', descripcion: 'Algo', fecha: '2026-11-05' });
  const bcp = hojaDe(m, 'TC BCP');
  const fila = bcp.valores.findIndex((f) => String(f[10]).indexOf('APP:mover-0004') === 0) + 1;
  assert.equal(m.llamar('editarGasto', { idCliente: 'edicion-0004', hoja: 'TC BCP', fila, verificar: { monto: 10, descripcion: 'Algo' }, cambios: { medio: 'BITCOIN' } }).error, 'El medio de pago no es válido.');
  assert.equal(m.llamar('editarGasto', { idCliente: 'edicion-0005', hoja: 'TC BCP', fila, verificar: { monto: 11, descripcion: 'Algo' }, cambios: { medio: 'EFECTIVO' } }).codigo, 'datos_invalidos');
  assert.ok(bcp.valores.some((f) => String(f[10]).indexOf('APP:mover-0004') === 0));
  assert.equal(hojaDe(m, 'Gastos Hormiga').valores.length, 1);
});

test('1.9.0: un gasto del formulario (sin Id de la app) también se puede pasar a efectivo', () => {
  const m = motorCompleto({ hoy: '2026-11-09' });
  m.llamar('registrar', { idCliente: 'form-0001', monto: 12, medio: 'TC_BCP', concepto: 'Luz', descripcion: 'Del formulario', fecha: '2026-11-04' });
  const bcp = hojaDe(m, 'TC BCP');
  const i = bcp.valores.findIndex((f) => String(f[10]).indexOf('APP:form-0001') === 0);
  bcp.valores[i][10] = ''; bcp.valores[i][11] = '';
  const r = m.llamar('editarGasto', { idCliente: 'edicion-0006', hoja: 'TC BCP', fila: i + 1, verificar: { monto: 12, descripcion: 'Del formulario' }, cambios: { medio: 'EFECTIVO' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const hormiga = hojaDe(m, 'Gastos Hormiga');
  assert.equal(hormiga.valores[1][4], 'Del formulario');
  assert.ok(!bcp.valores.some((f) => f[4] === 'Del formulario'));
});


// ---------- 1.9.2: el saludo del correo dice de quién es el consumo ----------

test('1.9.2: un aviso de la TC BCP que saluda a PersonaB (reenviado desde su Gmail) queda a su nombre', () => {
  const m = motorCompleto({ hoy: '2026-11-09', hilos: [
    { mensajes: [{ id: 'msg-bcp-personab', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Crédito BCP',
      cuerpo: 'Hola PersonaB, Realizaste un consumo de S/ 45.90 con tu Tarjeta de Crédito BCP en TAMBO MIRAFLORES. Fecha y hora 08 de noviembre de 2026 - 09:12 PM Número de Tarjeta ************1234 Empresa TAMBO MIRAFLORES',
      fecha: new Date(2026, 10, 8, 21, 13) }] },
    { mensajes: [{ id: 'msg-bcp-desconocido', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Crédito BCP',
      cuerpo: 'Hola Carlos, Realizaste un consumo de S/ 10 con tu Tarjeta de Crédito BCP en OXXO. Empresa OXXO',
      fecha: new Date(2026, 10, 8, 10, 0) }] }
  ] });
  m.contexto.leerCorreosDeBancos();
  const hoja = hojaDe(m, 'Por confirmar');
  const fila = (id) => hoja.valores.find((f) => f[0] === id);
  assert.equal(fila('msg-bcp-personab')[8], 'PersonaB');
  assert.equal(fila('msg-bcp-desconocido')[8], '', 'un nombre que no es de los usuarios no se usa');
});

// ---------- 1.9.5: aviso cuando el sobrante no alcanza ----------

test('1.9.5: un gasto con el sobrante que no alcanza manda un correo solo a esa persona; si alcanza, nada', () => {
  const m = motorBolsas();
  // PersonaB tiene 279.41 en la mano: S/ 20 en Yape alcanza.
  m.llamar('registrar', { idCliente: ID, monto: 20, medio: 'YAPE', concepto: 'Delivery', descripcion: 'Antojo', fecha: '2026-11-03', responsable: 'PersonaB', origen: 'P:PersonaB' });
  assert.equal(m.correos.filter((c) => /sobrante/.test(c.subject)).length, 0);
  // S/ 280 más ya no alcanza (le faltan 20.59).
  m.llamar('registrar', { idCliente: 'prueba-0002', monto: 280, medio: 'YAPE', concepto: 'Delivery', descripcion: 'Cena', fecha: '2026-11-03', responsable: 'PersonaB', origen: 'P:PersonaB' });
  const avisos = m.correos.filter((c) => /sobrante/.test(c.subject));
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].to, 'persona-b@example.test');
  assert.match(avisos[0].body, /faltan S\/ 20\.59/);
  // Con tarjeta mira lo que quedará del mes en que se paga: el 119 del 5 nov se paga el 30 nov y alcanza.
  m.llamar('registrar', Object.assign({}, GASTO_119, { idCliente: 'prueba-0003', origen: 'P:PersonaA' }));
  assert.equal(m.correos.filter((c) => /sobrante/.test(c.subject)).length, 1);
});


// ---------- 1.9.7: un aviso nuevo en un hilo ya etiquetado también se lee ----------

test('1.9.7: el BCP agrupa los avisos en un hilo: el segundo aviso (hilo ya etiquetado) llega a "Por confirmar"', () => {
  const debito = (id, monto, comercio, hora) => ({ id, de: 'BCP <notificaciones@notificacionesbcp.com.pe>',
    asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP',
    cuerpo: `Hola PersonaA, Realizaste un consumo de S/ ${monto} con tu Tarjeta de Débito BCP en ${comercio}. Fecha y hora 10 de noviembre de 2026 - ${hora} Empresa ${comercio}`,
    fecha: new Date(2026, 10, 10, Number(hora.slice(0, 2)), 0) });
  const hilo = { mensajes: [debito('msg-oxxo', '11.00', 'OXXO MORE', '13:43')] };
  const m = motorCompleto({ hoy: '2026-11-10', hilos: [hilo] });
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 1);
  assert.equal(m.hilos[0].etiquetas.length, 1, 'el hilo quedó etiquetado');
  // Llega otro aviso al MISMO hilo (ya etiquetado).
  m.hilos[0].mensajes.push(debito('msg-tambo', '32.40', 'TAMBO M-BASTIDAS', '20:50'));
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 1);
  const filas = hojaDe(m, 'Por confirmar').valores.slice(1);
  assert.deepEqual(filas.map((f) => [f[0], f[5]]), [['msg-oxxo', 11], ['msg-tambo', 32.4]]);
  // Y una tercera pasada no repite nada.
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 0);
});

test('1.9.7: los correos viejos de un hilo largo (más de 3 días) no entran', () => {
  const viejo = { id: 'msg-viejo', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP',
    cuerpo: 'Hola PersonaA, Realizaste un consumo de S/ 50.00 con tu Tarjeta de Débito BCP en PLAZA VEA. Empresa PLAZA VEA', fecha: new Date(2026, 9, 20, 10, 0) };
  const nuevo = Object.assign({}, viejo, { id: 'msg-nuevo', fecha: new Date(2026, 10, 9, 10, 0) });
  const m = motorCompleto({ hoy: '2026-11-10', hilos: [{ mensajes: [viejo, nuevo] }] });
  assert.equal(m.contexto.leerCorreosDeBancos().agregados, 1);
  assert.deepEqual(hojaDe(m, 'Por confirmar').valores.slice(1).map((f) => f[0]), ['msg-nuevo']);
});


// ---------- 1.9.8: sesión propia que no vence cada hora ----------

test('1.9.8: con el pase de Google se abre una sesión; con la llave se entra sin Google; cerrar la borra', () => {
  const m = motorCompleto();
  const conLlave = (accion, sesion, datos) => JSON.parse(m.contexto.doPost({ postData: { contents: JSON.stringify({ accion, sesion, datos: datos || {} }) } }).getContent());
  const r = m.llamar('abrirSesion', {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.datos.sesion, /^ffs1\.[0-9a-f]{64}$/);
  assert.equal(r.datos.email, 'persona-a@example.test');
  // La llave no se guarda tal cual: solo su huella.
  assert.ok(!String(m.propiedades.FINFAMILY_SESIONES).includes(r.datos.sesion));
  // Con la llave (sin pase de Google) funciona.
  const v = conLlave('version', r.datos.sesion);
  assert.equal(v.ok, true, JSON.stringify(v));
  // Una llave inventada o mal formada no sirve.
  assert.equal(conLlave('version', 'ffs1.' + '0'.repeat(64)).codigo, 'no_autorizado');
  assert.equal(conLlave('version', 'cualquier-cosa').codigo, 'no_autorizado');
  // No se puede abrir otra sesión usando una llave.
  assert.equal(conLlave('abrirSesion', r.datos.sesion).ok, false);
  // Cerrar sesión la borra: después ya no sirve.
  assert.equal(conLlave('cerrarSesion', r.datos.sesion).datos.cerrada, true);
  assert.equal(conLlave('version', r.datos.sesion).codigo, 'no_autorizado');
});

test('1.9.8: la llave deja de servir si quitan a la persona de USUARIOS o si venció', () => {
  const m = motorCompleto();
  const conLlave = (accion, sesion) => JSON.parse(m.contexto.doPost({ postData: { contents: JSON.stringify({ accion, sesion, datos: {} }) } }).getContent());
  const llave = m.llamar('abrirSesion', {}).datos.sesion;
  const sesiones = JSON.parse(m.propiedades.FINFAMILY_SESIONES);
  const huella = Object.keys(sesiones)[0];
  sesiones[huella].expira = Date.now() - 1000;
  m.propiedades.FINFAMILY_SESIONES = JSON.stringify(sesiones);
  assert.equal(conLlave('version', llave).codigo, 'no_autorizado', 'vencida');
  const otra = m.llamar('abrirSesion', {}).datos.sesion;
  assert.equal(conLlave('version', otra).ok, true);
  m.propiedades.USUARIOS = JSON.stringify({ 'persona-b@example.test': { nombre: 'PersonaB', clave: 'B' } });
  assert.equal(conLlave('version', otra).codigo, 'no_autorizado', 'ya no está en USUARIOS');
});


// ---------- 1.9.9: posible repetido al confirmar (mismo monto, fecha ±1 día) ----------

test('1.9.9: confirmar un consumo del correo avisa si ya hay uno a mano con el mismo monto y fecha cercana', () => {
  const correo = { id: 'msg-oxxo', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP',
    cuerpo: 'Hola PersonaA, Realizaste un consumo de S/ 11.00 con tu Tarjeta de Débito BCP en OXXO MORE. Fecha y hora 10 de noviembre de 2026 - 13:43 Empresa OXXO MORE',
    fecha: new Date(2026, 10, 10, 13, 43) };
  const m = motorCompleto({ hoy: '2026-11-10', hilos: [{ mensajes: [correo] }] });
  // A mano, el día anterior, con otra descripción.
  const manual = m.llamar('registrar', { idCliente: 'prueba-0101', monto: 11, medio: 'EFECTIVO', concepto: 'Luz', descripcion: 'Oxxo', fecha: '2026-11-09' });
  assert.equal(manual.datos.guardado, true, JSON.stringify(manual));
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('confirmarPendiente', { idCliente: 'prueba-0102', id: 'msg-oxxo', concepto: 'Luz' });
  assert.equal(r.datos.posibleDuplicado, true, JSON.stringify(r));
  assert.equal(r.datos.coincidencia.descripcion, 'Oxxo');
  assert.equal(r.datos.coincidencia.fecha, '2026-11-09');
  // Si de verdad son dos gastos, se confirma otra vez y se guarda.
  const r2 = m.llamar('confirmarPendiente', { idCliente: 'prueba-0102', id: 'msg-oxxo', concepto: 'Luz', confirmarDuplicado: true });
  assert.equal(r2.datos.confirmado, true, JSON.stringify(r2));
});

test('1.9.9: a mano no avisa por montos iguales con otra descripción (dos pasajes de S/ 3 el mismo día)', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const a = m.llamar('registrar', { idCliente: 'prueba-0201', monto: 3, medio: 'EFECTIVO', concepto: 'Luz', descripcion: 'Pasaje ida', fecha: '2026-11-10' });
  const b = m.llamar('registrar', { idCliente: 'prueba-0202', monto: 3, medio: 'EFECTIVO', concepto: 'Luz', descripcion: 'Pasaje vuelta', fecha: '2026-11-10' });
  assert.equal(a.datos.guardado, true);
  assert.equal(b.datos.guardado, true, JSON.stringify(b));
});


// ---------- 1.10.0: conectar los avisos del banco de otra persona ----------

test('1.10.0: reenvio dice a dónde reenviar, muestra el código de Gmail solo a quien lo pidió y si ya llegan sus avisos', () => {
  const confirmacion = (para, codigo) => ({ id: 'msg-fwd-' + codigo, de: 'Equipo de Gmail <forwarding-noreply@google.com>',
    asunto: `(#${codigo}) Confirmación de reenvío de Gmail: recibir correo de ${para}`,
    cuerpo: `${para} ha pedido reenviar su correo a tu dirección. Código de confirmación: ${codigo}`, fecha: new Date(2026, 10, 10, 9, 0) });
  const m = motorCompleto({ hoy: '2026-11-10', propiedades: { CORREO_LECTOR: 'duenio@example.test' },
    hilos: [{ mensajes: [confirmacion('persona-a@example.test', '123456789')] }, { mensajes: [confirmacion('otra@example.test', '999999999')] }] });
  const r = m.llamar('reenvio', {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.destino, 'duenio@example.test');
  assert.equal(r.datos.propio, false);
  assert.equal(r.datos.codigo, '123456789', 'el suyo, no el de otra persona');
  assert.ok(r.datos.dominios.includes('yape.pe'));
  assert.ok(r.datos.palabras.includes('consumo'));
  // Para el dueño del Gmail no hay nada que conectar.
  const d = motorCompleto({ propiedades: { CORREO_LECTOR: 'persona-a@example.test' } });
  const r2 = d.llamar('reenvio', {});
  assert.equal(r2.datos.propio, true);
  assert.equal(r2.datos.codigo, '');
});

test('1.10.0: un aviso reenviado sin saludo con nombre queda a nombre de quien lo recibió', () => {
  const correo = { id: 'msg-fwd-tc', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Débito BCP',
    cuerpo: 'Estimado cliente, Realizaste un consumo de S/ 25.00 con tu Tarjeta de Débito BCP en TAMBO. Fecha y hora 10 de noviembre de 2026 - 10:00 Empresa TAMBO',
    para: 'PersonaB <persona-b@example.test>', fecha: new Date(2026, 10, 10, 10, 0) };
  const m = motorCompleto({ hoy: '2026-11-10', propiedades: { CORREO_LECTOR: 'persona-a@example.test' }, hilos: [{ mensajes: [correo] }] });
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('pendientes', {});
  const p = (r.datos.pendientes || r.datos).find((x) => x.id === 'msg-fwd-tc');
  assert.ok(p, JSON.stringify(r));
  assert.equal(p.responsable, 'PersonaB');
});


// ---------- 1.11.0: compras en cuotas ----------

const fechaDe = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v));

test('1.11.0: una compra en 6 cuotas deja 6 filas, una por mes de pago, con la fecha real de la compra', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const ibk = hojaDe(m, 'TC IBK');
  const r = m.llamar('registrar', { idCliente: 'cuotas-0001', monto: 1200, medio: 'TC_IBK', concepto: 'Ropa y Calzado',
    descripcion: 'Televisor', fecha: '2026-11-05', cuotas: 6 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.guardado, true);
  assert.equal(r.datos.cuotas, 6);
  assert.equal(r.datos.montoCuota, 200);
  const filas = ibk.valores.slice(2).filter((f) => f[4]);
  assert.equal(filas.length, 6);
  filas.forEach((f, i) => {
    assert.equal(f[5], 200);
    assert.equal(f[4], `Televisor · cuota ${i + 1}/6`);
    assert.equal(fechaDe(f[2]), '2026-11-05', 'la fecha de compra es la real');
    assert.equal(f[9], 'Compra de S/ 1,200 en 6 cuotas');
    assert.equal(String(f[10]).split('|')[0], i === 0 ? 'APP:cuotas-0001' : `APP:cuotas-0001-c${i + 1}`);
  });
  // Cada cuota se paga un mes después de la anterior (y cruza el año).
  const pagos = filas.map((f) => fechaDe(f[6]).slice(0, 7));
  assert.deepEqual(pagos, ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  // Reintento de la cola: no duplica.
  const otra = m.llamar('registrar', { idCliente: 'cuotas-0001', monto: 1200, medio: 'TC_IBK', concepto: 'Ropa y Calzado',
    descripcion: 'Televisor', fecha: '2026-11-05', cuotas: 6 });
  assert.equal(otra.datos.duplicadoId, true);
  assert.equal(ibk.valores.slice(2).filter((f) => f[4]).length, 6);
});

test('1.11.0: los centavos que sobran van en la primera cuota; con cuota fija (intereses) todas iguales', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'cuotas-0002', monto: 100, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Zapatos', fecha: '2026-11-05', cuotas: 3 });
  assert.deepEqual(ibk.valores.slice(2).filter((f) => f[4]).map((f) => f[5]), [33.34, 33.33, 33.33]);
  const r = m.llamar('registrar', { idCliente: 'cuotas-0003', monto: 1200, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Laptop', fecha: '2026-11-05', cuotas: 6, montoCuota: 215.5 });
  assert.equal(r.datos.montoCuota, 215.5);
  assert.deepEqual(ibk.valores.slice(2).filter((f) => /Laptop/.test(f[4])).map((f) => f[5]), [215.5, 215.5, 215.5, 215.5, 215.5, 215.5]);
  // Una cuota que no cubre el total no se acepta.
  const mal = m.llamar('registrar', { idCliente: 'cuotas-0004', monto: 1200, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'X', fecha: '2026-11-05', cuotas: 6, montoCuota: 10 });
  assert.equal(mal.ok, false);
});

test('1.11.0: las cuotas son solo para tarjetas de crédito y de 2 a 36', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const yape = m.llamar('registrar', { idCliente: 'cuotas-0005', monto: 90, medio: 'YAPE', concepto: 'Ropa y Calzado', descripcion: 'X', fecha: '2026-11-05', cuotas: 3 });
  assert.equal(yape.ok, false);
  assert.match(yape.mensaje || JSON.stringify(yape), /tarjetas de crédito/);
  const muchas = m.llamar('registrar', { idCliente: 'cuotas-0006', monto: 90, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'X', fecha: '2026-11-05', cuotas: 48 });
  assert.equal(muchas.ok, false);
  // Sin cuotas responde igual que siempre (sin campos nuevos).
  const una = m.llamar('registrar', { idCliente: 'cuotas-0007', monto: 90, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'X', fecha: '2026-11-05', cuotas: 1 });
  assert.deepEqual(Object.keys(una.datos).sort(), ['duplicadoId', 'fila', 'guardado', 'hoja']);
});

test('1.11.0: confirmar un consumo del correo en cuotas', () => {
  const correo = { id: 'msg-cuotas', de: 'BCP <notificaciones@notificacionesbcp.com.pe>', asunto: 'Realizaste un consumo con tu Tarjeta de Crédito BCP',
    cuerpo: 'Hola PersonaA, Realizaste un consumo de S/ 600.00 con tu Tarjeta de Crédito BCP en SAGA FALABELLA. Fecha y hora 10 de noviembre de 2026 - 13:43 Empresa SAGA FALABELLA',
    fecha: new Date(2026, 10, 10, 13, 43) };
  const m = motorCompleto({ hoy: '2026-11-10', hilos: [{ mensajes: [correo] }] });
  m.contexto.leerCorreosDeBancos();
  const r = m.llamar('confirmarPendiente', { idCliente: 'cuotas-0008', id: 'msg-cuotas', concepto: 'Ropa y Calzado', medio: 'TC_BCP', cuotas: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.confirmado, true, JSON.stringify(r));
  assert.equal(r.datos.cuotas, 3);
  const filas = hojaDe(m, 'TC BCP').valores.slice(2).filter((f) => /cuota/.test(f[4]));
  assert.equal(filas.length, 3);
  assert.deepEqual(filas.map((f) => f[5]), [200, 200, 200]);
});

test('1.11.0: editar la fecha de una cuota deja su pago en el mes de esa cuota', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'cuotas-0009', monto: 300, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Silla', fecha: '2026-11-05', cuotas: 3 });
  const antes = ibk.valores.slice(2).filter((f) => f[4]).map((f) => fechaDe(f[6]).slice(0, 7));
  const r = m.llamar('editarGasto', { idCliente: 'cuotas-0010', hoja: 'TC IBK', fila: 5, verificar: { descripcion: 'Silla · cuota 3/3', monto: 100 }, cambios: { fecha: '2026-11-06' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(fechaDe(ibk.valores[4][6]).slice(0, 7), antes[2]);
});


// ---------- 1.12.0: pasar a cuotas un gasto ya anotado ----------

test('1.12.0: pasarACuotas convierte la fila en la cuota 1 y agrega las demás, cada una en su mes', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'pasar-0001', monto: 1200, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Televisor', fecha: '2026-11-05' });
  const pagoOriginal = fechaDe(ibk.valores[2][6]);
  const r = m.llamar('pasarACuotas', { idCliente: 'pasar-0002', hoja: 'TC IBK', fila: 3, verificar: { monto: 1200, descripcion: 'Televisor' }, cuotas: 6 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.convertido, true);
  assert.equal(r.datos.montoCuota, 200);
  const filas = ibk.valores.slice(2).filter((f) => f[4]);
  assert.equal(filas.length, 6);
  assert.deepEqual(filas.map((f) => f[4]), [1, 2, 3, 4, 5, 6].map((k) => `Televisor · cuota ${k}/6`));
  assert.deepEqual(filas.map((f) => f[5]), [200, 200, 200, 200, 200, 200]);
  assert.equal(fechaDe(filas[0][6]), pagoOriginal, 'la cuota 1 se queda con su mes de pago');
  assert.deepEqual(filas.map((f) => fechaDe(f[6]).slice(0, 7)), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  assert.ok(filas.every((f) => fechaDe(f[2]) === '2026-11-05'));
  assert.equal(filas[0][9], 'Compra de S/ 1,200 en 6 cuotas');
  // Reintento: no duplica.
  const otra = m.llamar('pasarACuotas', { idCliente: 'pasar-0002', hoja: 'TC IBK', fila: 3, verificar: { monto: 1200, descripcion: 'Televisor' }, cuotas: 6 });
  assert.equal(otra.datos.duplicadoId, true, JSON.stringify(otra));
  assert.equal(ibk.valores.slice(2).filter((f) => f[4]).length, 6);
  // Ya está en cuotas: no se vuelve a partir.
  const de_nuevo = m.llamar('pasarACuotas', { idCliente: 'pasar-0003', hoja: 'TC IBK', fila: 3, verificar: { monto: 200, descripcion: 'Televisor · cuota 1/6' }, cuotas: 3 });
  assert.equal(de_nuevo.ok, false);
  assert.match(de_nuevo.error, /ya está en cuotas/);
});

test('1.12.0: pasarACuotas no acepta gastos pagados, de Gastos Hormiga ni filas que cambiaron', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const ibk = hojaDe(m, 'TC IBK');
  m.llamar('registrar', { idCliente: 'pasar-0004', monto: 300, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Silla', fecha: '2026-11-05' });
  const cambio = m.llamar('pasarACuotas', { idCliente: 'pasar-0005', hoja: 'TC IBK', fila: 3, verificar: { monto: 299, descripcion: 'Silla' }, cuotas: 3 });
  assert.equal(cambio.ok, false);
  ibk.valores[2][8] = 'Pagado';
  const pagado = m.llamar('pasarACuotas', { idCliente: 'pasar-0006', hoja: 'TC IBK', fila: 3, verificar: { monto: 300, descripcion: 'Silla' }, cuotas: 3 });
  assert.equal(pagado.ok, false);
  assert.match(pagado.error, /pagado/);
  const hormiga = m.llamar('pasarACuotas', { idCliente: 'pasar-0007', hoja: 'Gastos Hormiga', fila: 4, verificar: { monto: 10, descripcion: 'X' }, cuotas: 3 });
  assert.equal(hormiga.ok, false);
  assert.match(hormiga.error, /tarjetas de crédito/);
  assert.equal(ibk.valores.slice(2).filter((f) => f[4]).length, 1, 'no se agregó nada');
});

// ---------- 1.13.0: gastos fijos automáticos ----------

test('1.13.0: guardarFijoAuto guarda el día solo para líneas de gasto del presupuesto y se puede quitar', () => {
  const m = crearMotor({ hojas: [hojaPresupuesto()], hoy: '2026-11-06' });
  const r = m.llamar('guardarFijoAuto', { concepto: 'internet', dia: 5, auto: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos.fijos, [{ concepto: 'Internet', dia: 5, auto: true }]);
  assert.equal(m.llamar('guardarFijoAuto', { concepto: 'Ahorro Casa', dia: 5 }).ok, false, 'un ahorro no es un gasto fijo');
  assert.equal(m.llamar('guardarFijoAuto', { concepto: 'Luz', dia: 40 }).ok, false);
  m.llamar('guardarFijoAuto', { concepto: 'Luz', dia: 31 });
  assert.deepEqual(m.llamar('fijosAuto', {}).datos.fijos.map((f) => [f.concepto, f.dia, f.auto]), [['Internet', 5, true], ['Luz', 31, false]]);
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 0 });
  assert.deepEqual(m.llamar('fijosAuto', {}).datos.fijos.map((f) => f.concepto), ['Luz']);
});

test('1.13.0: el débito automático se marca pagado solo una vez; los demás mandan correo el día que vencen', () => {
  const pres = hojaPresupuesto();
  const m = crearMotor({ hojas: [pres], hoy: '2026-11-06' });
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 5, auto: true });
  m.llamar('guardarFijoAuto', { concepto: 'Luz', dia: 6 });
  m.llamar('guardarFijoAuto', { concepto: 'Alquiler', dia: 20, auto: true });
  const r = m.contexto.revisarFijos_('2026-11-06', true);
  assert.equal(r.marcados, 1, JSON.stringify(r));
  assert.equal(r.porRecordar, 1);
  // El 5 y el 6 de noviembre se pagan con el presupuesto de octubre (ciclo del 30 oct al 29 nov).
  const oct = m.llamar('presupuesto', { mes: '2026-10' }).datos.filas;
  const internet = oct.find((f) => f.concepto === 'Internet');
  assert.deepEqual([internet.pagado, internet.pagadoNota], [true, 'Pagado el 05/11/2026 · automático']);
  assert.equal(oct.find((f) => f.concepto === 'Alquiler').pagado, false, 'su día aún no llega');
  assert.equal(m.correos.length, 1);
  assert.equal(m.correos[0].subject, 'Hoy vence: Luz');
  assert.match(m.correos[0].body, /Luz: S\/ 80/);
  // Otra corrida el mismo día: nada nuevo.
  const r2 = m.contexto.revisarFijos_('2026-11-06', true);
  assert.deepEqual([r2.marcados, r2.porRecordar, m.correos.length], [0, 0, 1]);
  // Si alguien lo desmarca, no se vuelve a marcar solo ese mes.
  m.llamar('marcarFijo', { idCliente: ID, mes: '2026-10', fila: 6, concepto: 'Internet', pagado: false });
  m.contexto.revisarFijos_('2026-11-07', true);
  assert.equal(m.llamar('presupuesto', { mes: '2026-10' }).datos.filas.find((f) => f.concepto === 'Internet').pagado, false);
});

test('1.13.0: renombrar o quitar la línea mueve o borra su día', () => {
  const m = motorCompleto({ hoy: '2026-11-06' });
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 5, auto: true });
  const r = m.llamar('renombrarLinea', { mes: '2026-11', fila: 6, concepto: 'Internet', nombre: 'Internet y cable' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(m.llamar('fijosAuto', {}).datos.fijos, [{ concepto: 'Internet y cable', dia: 5, auto: true }]);
});

test('1.13.0: fechaDelFijo y fijosVencidos', () => {
  const m = crearMotor({});
  const L = m.contexto;
  assert.equal(L.fechaDelFijo(31, '2026-11'), '2026-11-30');
  assert.equal(L.fechaDelFijo(31, '2027-02'), '2027-02-28');
  const v = L.fijosVencidos({ luz: { concepto: 'Luz', dia: 30, auto: false }, agua: { concepto: 'Agua', dia: 2, auto: true } }, '2026-11-30');
  assert.deepEqual(JSON.parse(JSON.stringify(v)).map((x) => [x.concepto, x.fecha, x.mes]), [['Agua', '2026-11-02', '2026-10'], ['Luz', '2026-11-30', '2026-11']]);
});


// ---------- 1.14.0: cuentas entre ustedes ----------

test('1.14.0: quien paga con lo suyo un gasto que sale del otro queda como acreedor; el fondo común no genera deudas', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const vacio = m.llamar('cuentas', {});
  assert.equal(vacio.ok, true, JSON.stringify(vacio));
  assert.equal(vacio.datos.desde, '2026-11-10');
  assert.deepEqual(vacio.datos.saldos, []);
  const base = { concepto: 'Ropa y Calzado', fecha: '2026-11-10' };
  // PersonaA paga con su tarjeta (IBK_P) algo que sale de PersonaB: PersonaB le debe 120.
  m.llamar('registrar', { ...base, idCliente: 'cuentas-0001', monto: 120, medio: 'TC_IBK', descripcion: 'Zapatillas', origen: 'P:PersonaB' });
  // Lo suyo con lo suyo y el fondo común: nada.
  m.llamar('registrar', { ...base, idCliente: 'cuentas-0002', monto: 40, medio: 'TC_IBK', descripcion: 'Polo', origen: 'P:PersonaA' });
  m.llamar('registrar', { ...base, idCliente: 'cuentas-0003', monto: 300, medio: 'TC_IBK', descripcion: 'Mercado' });
  const r = m.llamar('cuentas', {});
  assert.deepEqual(r.datos.saldos, [{ deudor: 'PersonaB', acreedor: 'PersonaA', monto: 120 }]);
  assert.deepEqual(r.datos.movimientos.map((x) => [x.tipo, x.paga, x.para, x.monto]), [['gasto', 'PersonaA', 'PersonaB', 120]]);
  // PersonaB paga con su Yape (Gastos Hormiga: paga quien gastó) algo que sale de PersonaA: PersonaA le debe 20.
  const yape = { tarjeta: 'HORMIGA', responsable: 'PersonaB', origen: 'P:PersonaA', fecha: '2026-11-10', monto: 20, descripcion: 'Taxi' };
  const antes = { tarjeta: 'HORMIGA', responsable: 'PersonaB', origen: 'P:PersonaA', fecha: '2026-11-09', monto: 99, descripcion: 'Antes de empezar' };
  const c = m.contexto.cuentasEntre([yape, antes, { tarjeta: 'IBK_P', responsable: 'PersonaA', origen: 'P:PersonaB', fecha: '2026-11-10', monto: 120 }],
    { desde: '2026-11-10', movimientos: [] }, ['PersonaA', 'PersonaB'], m.contexto.CATALOGO_DEFECTO);
  assert.deepEqual(JSON.parse(JSON.stringify(c.saldos)), [{ deudor: 'PersonaB', acreedor: 'PersonaA', monto: 100 }]);
});

test('1.14.0: préstamos y devoluciones a mano, saldar y borrar', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  const p = m.llamar('anotarCuenta', { idCliente: 'cuentas-0101', de: 'PersonaA', a: 'personab', monto: 50, nota: 'Para el cine' });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.deepEqual(p.datos.saldos, [{ deudor: 'PersonaB', acreedor: 'PersonaA', monto: 50 }]);
  assert.equal(p.datos.movimientos[0].texto, 'Para el cine');
  assert.equal(p.datos.movimientos[0].por, 'PersonaA');
  // Reintento: no duplica.
  m.llamar('anotarCuenta', { idCliente: 'cuentas-0101', de: 'PersonaA', a: 'PersonaB', monto: 50 });
  // Devuelve 20 y luego salda.
  m.llamar('anotarCuenta', { idCliente: 'cuentas-0102', de: 'PersonaB', a: 'PersonaA', monto: 20 });
  assert.equal(m.llamar('cuentas', {}).datos.saldos[0].monto, 30);
  const s = m.llamar('anotarCuenta', { idCliente: 'cuentas-0103', de: 'PersonaB', a: 'PersonaA', monto: 30, nota: 'Saldado' });
  assert.deepEqual(s.datos.saldos, [], 'quedan a mano');
  // Borrar el saldado vuelve a dejar la deuda.
  const b = m.llamar('borrarCuenta', { id: 'cuentas-0103' });
  assert.equal(b.datos.saldos[0].monto, 30);
  assert.equal(m.llamar('anotarCuenta', { idCliente: 'cuentas-0104', de: 'PersonaA', a: 'PersonaA', monto: 5 }).ok, false);
  assert.equal(m.llamar('anotarCuenta', { idCliente: 'cuentas-0105', de: 'PersonaA', a: 'Nadie', monto: 5 }).ok, false);
});

test('1.14.0: compactarCuentas junta lo viejo en "Saldo anterior" sin cambiar el saldo', () => {
  const m = crearMotor({});
  const L = m.contexto;
  const movs = Array.from({ length: 320 }, (_, i) => ({ id: 'm' + i, fecha: `2026-${String(1 + Math.floor(i / 40)).padStart(2, '0')}-10`,
    de: i % 3 ? 'PersonaA' : 'PersonaB', a: i % 3 ? 'PersonaB' : 'PersonaA', monto: 10, nota: '', por: '' }));
  const antes = L.cuentasEntre([], { desde: '2026-01-01', movimientos: movs }, ['PersonaA', 'PersonaB'], []);
  const c = L.compactarCuentas({ desde: '2026-01-01', movimientos: movs });
  assert.ok(c.movimientos.length < 300);
  const despues = L.cuentasEntre([], c, ['PersonaA', 'PersonaB'], []);
  assert.deepEqual(JSON.parse(JSON.stringify(despues.saldos)), JSON.parse(JSON.stringify(antes.saldos)));
});


// ---------- 1.15.0: metas de ahorro con fecha ----------

test('1.15.0: guardarMeta pone objetivo y mes a un ahorro y ahorros dice cuánto falta y si se llega', () => {
  const m = motorCompleto({ hoy: '2026-11-10' }); // ciclo de octubre
  const antes = m.llamar('ahorros', { mes: '2026-10' }).datos.metas.find((x) => x.concepto === 'Ahorro Viaje');
  assert.equal(antes.meta, undefined, 'sin meta no cambia la respuesta');
  const r = m.llamar('guardarMeta', { concepto: 'ahorro viaje', objetivo: 300, fecha: '2027-01', mes: '2026-10' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const viaje = r.datos.metas.find((x) => x.concepto === 'Ahorro Viaje');
  // Octubre: 0 guardado; faltan 300 en 3 meses (nov, dic, ene) → 100 al mes; este mes pone 0 → atrasada.
  assert.deepEqual(JSON.parse(JSON.stringify(viaje.meta)), { objetivo: 300, fecha: '2027-01', faltan: 300, mesesRestantes: 3, porMes: 100, estado: 'atrasada', pct: 0 });
  // Ahorro Casa ya tiene 50: con objetivo 50 queda lista.
  const casa = m.llamar('guardarMeta', { concepto: 'Ahorro Casa', objetivo: 50, fecha: '2026-12', mes: '2026-10' }).datos.metas.find((x) => x.concepto === 'Ahorro Casa');
  assert.equal(casa.meta.estado, 'lista');
  assert.equal(casa.meta.pct, 100);
  // Validaciones: no es ahorro, mes pasado, sin mes.
  assert.equal(m.llamar('guardarMeta', { concepto: 'Luz', objetivo: 100, fecha: '2027-01' }).ok, false);
  assert.equal(m.llamar('guardarMeta', { concepto: 'Ahorro Viaje', objetivo: 100, fecha: '2026-01' }).ok, false);
  assert.equal(m.llamar('guardarMeta', { concepto: 'Ahorro Viaje', objetivo: 100 }).ok, false);
  // Quitar.
  const q = m.llamar('guardarMeta', { concepto: 'Ahorro Viaje', objetivo: 0, mes: '2026-10' });
  assert.equal(q.datos.metas.find((x) => x.concepto === 'Ahorro Viaje').meta, undefined);
});

test('1.15.0: planDeMeta: bien, atrasada, vencida y lista', () => {
  const L = crearMotor({}).contexto;
  const p = (o, f, d, a, mes) => JSON.parse(JSON.stringify(L.planDeMeta(o, f, d, a, mes)));
  assert.equal(p(1000, '2027-04', 400, 120, '2026-11').estado, 'bien'); // faltan 600 en 5 meses = 120
  assert.equal(p(1000, '2027-04', 400, 119.99, '2026-11').estado, 'atrasada');
  assert.equal(p(1000, '2026-11', 400, 120, '2026-11').estado, 'vencida');
  assert.equal(p(1000, '2026-11', 1000, 0, '2026-11').estado, 'lista');
  assert.equal(p(1000, '2027-02', 0, 0, '2026-11').porMes, 333.34);
});


// ---------- 1.16.0: cuadre de saldos ----------

test('1.16.0: guardarCuadre guarda el último cuadre por cuenta y valida la clave', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.deepEqual(m.llamar('cuadres', {}).datos.cuadres, {});
  const r = m.llamar('guardarCuadre', { clave: 'debito|PersonaA', saldo: '1,250.50', base: 300, medios: ['YAPE', 'plin', 'TC_BCP'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(JSON.parse(JSON.stringify(r.datos.cuadres['debito|PersonaA'])), { saldo: 1250.5, base: 300, fecha: '2026-11-10', medios: ['YAPE', 'PLIN'], por: 'PersonaA' });
  m.llamar('guardarCuadre', { clave: 'tc|IBK_P|2026-12-15', saldo: 480 });
  m.llamar('guardarCuadre', { clave: 'lemon|PersonaA', saldo: 52, base: 10, medios: ['LEMON'] });
  assert.deepEqual(Object.keys(m.llamar('cuadres', {}).datos.cuadres).sort(), ['debito|PersonaA', 'lemon|PersonaA', 'tc|IBK_P|2026-12-15']);
  assert.equal(m.llamar('guardarCuadre', { clave: 'otra|cosa', saldo: 1 }).ok, false);
  assert.equal(m.llamar('guardarCuadre', { clave: 'debito|PersonaA', saldo: 'abc' }).ok, false);
});


// ---------- 1.17.0: avisos por WhatsApp (CallMeBot) ----------

test('1.17.0: conectar WhatsApp prueba la clave, la guarda en privado y nunca la devuelve', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.deepEqual(m.llamar('whatsapp', {}).datos, { conectado: false, meta: { configurado: false }, green: { configurado: false } });
  const mal = m.llamar('guardarWhatsapp', { telefono: '+51 987 654 321', apikey: '0000' });
  assert.equal(mal.ok, false, 'clave rechazada por CallMeBot');
  assert.equal(m.llamar('guardarWhatsapp', { telefono: '123', apikey: '1234567' }).ok, false);
  const r = m.llamar('guardarWhatsapp', { telefono: '+51 987 654 321', apikey: '1234567' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos, { conectado: true, telefono: '+51 ••• ••• 321', desde: '2026-11-10', via: 'callmebot', meta: { configurado: false }, green: { configurado: false } });
  assert.ok(!JSON.stringify(r).includes('1234567'), 'la clave no vuelve a la app');
  assert.equal(m.whatsapps.at(-1).phone, '+51987654321');
  const p = m.llamar('probarWhatsapp', {});
  assert.equal(p.datos.enviado, true);
  // Quitar.
  assert.deepEqual(m.llamar('guardarWhatsapp', { quitar: true }).datos, { conectado: false });
});

test('1.17.0: los avisos por correo también salen por WhatsApp a quien lo tenga conectado', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  m.llamar('guardarWhatsapp', { telefono: '51987654321', apikey: 'abc1234' });
  const antes = m.whatsapps.length;
  const r = m.contexto.enviarCorreoAUsuarios_({ asunto: 'Hoy vence: Luz', cuerpo: 'Hoy toca pagar:\n\n• Luz: S/ 80' }, 'prueba');
  assert.equal(r.enviado, true);
  assert.equal(r.whatsapp, 1);
  const w = m.whatsapps.at(-1);
  assert.equal(m.whatsapps.length, antes + 1);
  assert.equal(w.apikey, 'abc1234');
  assert.equal(w.text, '*Hoy vence: Luz*\n\nHoy toca pagar:\n\n• Luz: S/ 80');
});


// ---------- 1.18.0: WhatsApp oficial de Meta ----------

test('1.18.0: guardar los datos de Meta los comprueba y nunca devuelve el token', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.equal(m.llamar('guardarWhatsappMeta', { token: 'EAAmalo0123456789abcdefghijklmnopqrstuvwxyz', phoneId: '123456789012345' }).ok, false);
  assert.equal(m.llamar('guardarWhatsappMeta', { token: TOKEN_META_PRUEBA, phoneId: 'abc' }).ok, false);
  const r = m.llamar('guardarWhatsappMeta', { token: TOKEN_META_PRUEBA, phoneId: '123456789012345' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos.meta, { configurado: true, plantilla: 'aviso_finfamily', numero: '+1 555 010 0000' });
  assert.ok(!JSON.stringify(r).includes(TOKEN_META_PRUEBA));
  assert.ok(m.metaLlamadas[0].url.startsWith('https://graph.facebook.com/v25.0/123456789012345?'));
});

test('1.18.0: conectar un número por Meta manda hello_world; si no está en la lista de Meta, lo dice', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.equal(m.llamar('guardarWhatsapp', { via: 'meta', telefono: '+51 987 654 321' }).ok, false, 'sin datos de Meta');
  m.llamar('guardarWhatsappMeta', { token: TOKEN_META_PRUEBA, phoneId: '123456789012345' });
  const fuera = m.llamar('guardarWhatsapp', { via: 'meta', telefono: '+51 900 000 999' });
  assert.equal(fuera.ok, false);
  assert.match(fuera.error, /lista de destinatarios/);
  const r = m.llamar('guardarWhatsapp', { via: 'meta', telefono: '+51 987 654 321' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.via, 'meta');
  const hola = m.metaLlamadas.at(-1).cuerpo;
  assert.deepEqual(hola, { messaging_product: 'whatsapp', to: '51987654321', type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } });
});

test('1.18.0: los avisos por Meta van en la plantilla con el texto en una sola línea', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  m.llamar('guardarWhatsappMeta', { token: TOKEN_META_PRUEBA, phoneId: '123456789012345' });
  m.llamar('guardarWhatsapp', { via: 'meta', telefono: '+51 987 654 321' });
  const r = m.contexto.enviarCorreoAUsuarios_({ asunto: 'Hoy vence: Luz', cuerpo: 'Hoy toca pagar:\n\n• Luz: S/ 80\n• Agua:    S/ 30' }, 'prueba');
  assert.equal(r.whatsapp, 1);
  const t = m.metaLlamadas.at(-1).cuerpo.template;
  assert.equal(t.name, 'aviso_finfamily');
  assert.equal(t.language.code, 'es');
  assert.equal(t.components[0].parameters[0].text, 'Hoy vence: Luz: Hoy toca pagar: · Luz: S/ 80 · Agua: S/ 30');
  // Probar con una plantilla que Meta aún no aprueba: lo explica.
  m.llamar('guardarWhatsappMeta', { plantilla: 'no_aprobada' });
  const p = m.llamar('probarWhatsapp', {});
  assert.equal(p.datos.enviado, false);
  assert.match(p.datos.motivo, /todavía no aprueba la plantilla «no_aprobada»/);
});


test('1.18.1: guardarFijoAuto con todos pone fin de mes a todas las líneas fijas (soloSinDia respeta las que ya tienen día)', () => {
  const m = crearMotor({ hojas: [hojaPresupuesto()], hoy: '2026-11-06' });
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 5, auto: true });
  const r = m.llamar('guardarFijoAuto', { todos: true, dia: 31, soloSinDia: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos.fijos.map((f) => [f.concepto, f.dia, f.auto]), [['Internet', 5, true], ['Alquiler', 31, false], ['Luz', 31, false]]);
  const t = m.llamar('guardarFijoAuto', { todos: true, dia: 31 });
  assert.deepEqual(t.datos.fijos.map((f) => f.dia), [31, 31, 31]);
  // A fin de mes (30 nov) avisa todos juntos en un correo, con el presupuesto de noviembre.
  m.contexto.revisarFijos_('2026-11-30', true);
  assert.equal(m.correos.length, 1);
  assert.match(m.correos[0].subject, /^Hoy vence: /);
  assert.match(m.correos[0].body, /Total: S\/ 690/);
});


// ---------- 1.19.0: WhatsApp con Green API ----------

test('1.19.0: guardar Green API comprueba que la instancia está vinculada y nunca devuelve el token', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.equal(m.llamar('guardarWhatsappGreen', { idInstance: '1100000001', apiToken: 'x'.repeat(30) }).ok, false, 'token malo');
  assert.equal(m.llamar('guardarWhatsappGreen', { apiUrl: 'https://otro.com', idInstance: '1100000001', apiToken: TOKEN_GREEN_PRUEBA }).ok, false, 'host ajeno');
  const sinQr = m.llamar('guardarWhatsappGreen', { idInstance: '1100000002', apiToken: TOKEN_GREEN_PRUEBA });
  assert.equal(sinQr.ok, false);
  assert.match(sinQr.error, /Get QR/);
  const r = m.llamar('guardarWhatsappGreen', { apiUrl: 'https://7103.api.greenapi.com/', idInstance: '1100000001', apiToken: TOKEN_GREEN_PRUEBA });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos.green, { configurado: true, numero: '+51 ••• ••• 321', registro: false });
  assert.ok(!JSON.stringify(r).includes(TOKEN_GREEN_PRUEBA));
});

test('1.19.0: conectar por Green API manda la bienvenida y los avisos salen con su texto completo', () => {
  const m = motorCompleto({ hoy: '2026-11-10' });
  assert.equal(m.llamar('guardarWhatsapp', { via: 'green', telefono: '+51 987 654 321' }).ok, false, 'sin datos de Green API');
  m.llamar('guardarWhatsappGreen', { idInstance: '1100000001', apiToken: TOKEN_GREEN_PRUEBA });
  const r = m.llamar('guardarWhatsapp', { via: 'green', telefono: '+51 987 654 321' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.datos.via, 'green');
  assert.equal(m.greenLlamadas.at(-1).cuerpo.chatId, '51987654321@c.us');
  const e = m.contexto.enviarCorreoAUsuarios_({ asunto: 'Hoy vence: Luz', cuerpo: 'Hoy toca pagar:\n\n• Luz: S/ 80' }, 'prueba');
  assert.equal(e.whatsapp, 1);
  assert.equal(m.greenLlamadas.at(-1).cuerpo.message, '*Hoy vence: Luz*\n\nHoy toca pagar:\n\n• Luz: S/ 80');
  assert.equal(m.llamar('probarWhatsapp', {}).datos.enviado, true);
});

// ---------- 1.20.0: antojos, gastos chicos, cierre del mes y gastos por WhatsApp ----------

test('1.20.0: resumen semanal con gastos chicos', () => {
  const L = crearMotor({}).contexto;
  const c = (fecha, monto, descripcion) => ({ fecha, monto, descripcion, concepto: 'Chucherías', responsable: 'PersonaA' });
  const s = L.resumenSemanal([c('2026-11-03', 5, 'Tambo Lima'), c('2026-11-04', 7.5, 'Tambo Lima'), c('2026-11-05', 12, 'Café'), c('2026-11-06', 80, 'Cena')], '2026-11-09');
  assert.deepEqual(JSON.parse(JSON.stringify(s.hormiga)), { cantidad: 3, total: 24.5, top: { descripcion: 'Tambo Lima', veces: 2, monto: 12.5 } });
  const t = L.textoResumenSemanal(s, null, []);
  assert.ok(t.cuerpo.includes('Gastos chicos (hasta S/ 15): 3 por S/ 24.50. El que más se repite: Tambo Lima (2 veces, S/ 12.50).'), t.cuerpo);
});

test('1.20.0: tope de antojos avisa al 80 % y al 100 % una vez por semana', () => {
  const m = motorCompleto({ hoy: '2026-11-11' });
  const r = m.llamar('guardarAntojos', { conceptos: ['ropa y calzado', 'No existe'], tope: 100 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.datos.conceptos, ['Ropa y Calzado']);
  assert.equal(r.datos.semana.desde, '2026-11-09');
  const g = (id, monto) => m.llamar('registrar', { idCliente: 'antojo-' + id, monto, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Polo ' + id, fecha: '2026-11-10' });
  g('0001', 50);
  assert.equal(m.correos.length, 0);
  g('0002', 35); // 85 %
  assert.equal(m.correos.length, 1);
  assert.match(m.correos[0].subject, /ya van S\/ 85 de S\/ 100/);
  g('0003', 5); // 90 %: ya avisado
  assert.equal(m.correos.length, 1);
  g('0004', 20); // 110 %
  assert.equal(m.correos.length, 2);
  assert.match(m.correos[1].subject, /se pasaron del tope/);
  assert.equal(m.llamar('antojos', {}).datos.semana.gastado, 110);
});

test('1.20.0: el día de cobro llega una vez el cierre del ciclo que terminó', () => {
  const m = motorCompleto({ hoy: '2026-11-30' });
  m.llamar('registrar', { idCliente: 'cierre-0001', monto: 60, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Zapatos', fecha: '2026-11-15' });
  const r = m.contexto.revisarCierreMes_('2026-11-30', m.contexto.leerTodosLosConsumos_());
  assert.equal(r.enviado, true, JSON.stringify(r));
  assert.match(m.correos.at(-1).subject, /^Así cerró .*: S\/ 60 gastados$/);
  assert.match(m.correos.at(-1).body, /Ropa y Calzado: S\/ 60/);
  assert.equal(m.contexto.revisarCierreMes_('2026-11-30', []).motivo, 'ya enviado');
  assert.equal(m.contexto.revisarCierreMes_('2026-11-29', []).motivo, 'no es día de cobro');
});

test('1.20.0: gastoDeMensaje entiende "25 tambo", "+12.50 taxi yape" y deja pasar conversación', () => {
  const L = crearMotor({}).contexto;
  const p = (t) => JSON.parse(JSON.stringify(L.gastoDeMensaje(t)));
  assert.deepEqual(p('25 tambo'), { monto: 25, descripcion: 'tambo', medio: '' });
  assert.deepEqual(p('+12,50 taxi al trabajo yape'), { monto: 12.5, descripcion: 'taxi al trabajo', medio: 'YAPE' });
  assert.deepEqual(p('S/ 8 café'), { monto: 8, descripcion: 'café', medio: '' });
  assert.equal(L.gastoDeMensaje('hola amor'), null);
  assert.equal(L.gastoDeMensaje('25'), null);
});

test('1.20.0: un mensaje en tu chat «Tú» se anota con el tipo y el medio de gastos anteriores y responde', () => {
  const m = motorCompleto({ hoy: '2026-11-11' });
  m.llamar('guardarWhatsappGreen', { idInstance: '1100000001', apiToken: TOKEN_GREEN_PRUEBA });
  m.llamar('guardarWhatsapp', { via: 'green', telefono: '+51 987 654 321' });
  assert.equal(m.llamar('registroWhatsapp', { activar: true, urlMotor: 'https://otro.com/x' }).ok, false);
  const act = m.llamar('registroWhatsapp', { activar: true, urlMotor: 'https://script.google.com/macros/s/ABC123/exec' });
  assert.equal(act.ok, true, JSON.stringify(act));
  const ajuste = m.greenLlamadas.find((x) => x.metodo === 'setSettings').cuerpo;
  assert.match(ajuste.webhookUrl, /^https:\/\/script\.google\.com\/macros\/s\/ABC123\/exec\?wh=\w{8,}$/);
  const secreto = ajuste.webhookUrl.split('wh=')[1];
  // Un gasto anterior le enseña el tipo y la tarjeta.
  m.llamar('registrar', { idCliente: 'wa-previo-01', monto: 30, medio: 'TC_IBK', concepto: 'Ropa y Calzado', descripcion: 'Tambo Larco', fecha: '2026-11-10' });
  const enviar = (wh, cuerpo) => JSON.parse(m.contexto.doPost({ parameter: { wh }, postData: { contents: JSON.stringify(cuerpo) } }).getContent());
  const msg = (id, texto, extra = {}) => Object.assign({ typeWebhook: 'outgoingMessageReceived', idMessage: id, instanceData: { wid: '51987654321@c.us' },
    senderData: { chatId: '51987654321@c.us', sender: '51987654321@c.us' }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: texto } } }, extra);
  assert.equal(enviar('malo', msg('A1', '25 tambo')).ignorado, 'secreto');
  const r = enviar(secreto, msg('A2', '25 tambo'));
  assert.equal(r.guardado, true, JSON.stringify(r));
  const fila = hojaDe(m, 'TC IBK').valores.find((f) => f[4] === 'Tambo' && f[5] === 25);
  assert.ok(fila, 'quedó en la hoja de la tarjeta de costumbre');
  assert.equal(fila[3], 'Ropa y Calzado');
  assert.match(m.greenLlamadas.at(-1).cuerpo.message, /^✅ Anotado: S\/ 25 · Tambo · Ropa y Calzado/);
  // Repetido (reintento de Green API): no se anota dos veces.
  assert.equal(enviar(secreto, msg('A2', '25 tambo')).ignorado, 'repetido');
  // Sin historial ni tipo en el texto: pregunta.
  const q = enviar(secreto, msg('A3', '40 ferreteria'));
  assert.equal(q.pendiente, 'concepto');
  assert.match(m.greenLlamadas.at(-1).cuerpo.message, /No sé de qué tipo es «ferreteria»/);
  // Conversación con otra persona: se ignora.
  assert.equal(enviar(secreto, msg('A4', '25 tambo', { senderData: { chatId: '51900000000@c.us' } })).ignorado, 'otro chat');
});

// ---------- 1.23.0: pagos fijos que se marcan solos con el correo ----------

const CORREO_PAGO = (id, de, asunto, cuerpo, dia) => ({ id, de, asunto, cuerpo, fecha: new Date(2026, 10, dia, 9, 0) });

test('1.23.0: los pagos de servicios del correo suman a su línea y la marcan pagada al llegar a lo planeado (sin contar dos veces)', () => {
  const hilos = [
    { mensajes: [CORREO_PAGO('pay-1', 'Notificaciones Pay-me <payments@pagos.example>', 'Se realizó un débito automático en "WOW PERU"',
      'Hola PERSONA, Te notificamos que se ha procesado un débito automático en el comercio WOW PERU : Pago exitoso S/. 60.00 Fecha 13/11/2026', 13)] },
    { mensajes: [CORREO_PAGO('wow-1', 'WOW Perú <noreply@wow.example>', 'Hola, te enviamos el detalle',
      'Se realizó con éxito el cobro de tu recibo a través del Débito Automático Fecha de cobro 13/11/2026 Importe debitado S/ 60.00', 13)] },
    { mensajes: [CORREO_PAGO('wow-boleta', 'WOW Perú <noreply@wow.example>', 'Tu boleta WOW del mes', 'Total a pagar S/ 40.00 Último día de pago 20/11', 12)] }
  ];
  const m = motorCompleto({ hoy: '2026-11-14', hilos });
  m.contexto.leerCorreosDeBancos();
  // 13 nov se paga con el presupuesto de octubre (cobro a fin de mes). S/ 60 de S/ 100: todavía no.
  let oct = m.llamar('presupuesto', { mes: '2026-10' }).datos.filas.find((f) => f.concepto === 'Internet');
  assert.equal(oct.pagado, false);
  const f1 = m.llamar('fijosAuto', {}).datos;
  assert.deepEqual(JSON.parse(JSON.stringify(f1.pagos)), { '2026-10': { internet: { total: 60, de: ['Wow'] } } });
  assert.deepEqual(JSON.parse(JSON.stringify(f1.palabras.Internet)), ['wow', 'win internet', 'fiberpro', 'mi fibra']);

  // Llega el yapeo de los S/ 40 que faltaban: ahora sí se marca, con su nota.
  hilos.push({ mensajes: [CORREO_PAGO('yape-wow', 'Correo de servicios <avisos@servicios.example>', 'Tu yapeo de servicio ha sido confirmado',
    '¡Tu servicio fue yapeado con éxito! Monto total S/ 40.00 Empresa: WOW Servicio: Internet', 14)] });
  const m2 = motorCompleto({ hoy: '2026-11-14', hilos, propiedades: { FINFAMILY_PAGOS_FIJOS: m.propiedades.FINFAMILY_PAGOS_FIJOS } });
  m2.contexto.leerCorreosDeBancos();
  oct = m2.llamar('presupuesto', { mes: '2026-10' }).datos.filas.find((f) => f.concepto === 'Internet');
  assert.equal(oct.pagado, true);
  assert.equal(oct.pagadoNota, 'Pagado el 14/11/2026 · automático (correo)');
  // Otra pasada no repite nada; y si alguien lo desmarca, no se vuelve a marcar.
  m2.contexto.leerCorreosDeBancos();
  m2.llamar('marcarFijo', { idCliente: ID, mes: '2026-10', fila: 6, concepto: 'Internet', pagado: false });
  m2.contexto.leerCorreosDeBancos();
  assert.equal(m2.llamar('presupuesto', { mes: '2026-10' }).datos.filas.find((f) => f.concepto === 'Internet').pagado, false);
});

test('1.23.0: guardarFijoAuto con empresas solo cambia las empresas; el día las conserva', () => {
  const m = motorCompleto({ hoy: '2026-11-14' });
  const r = m.llamar('guardarFijoAuto', { concepto: 'Internet', palabras: 'Movistar, WOW, wow, x' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(JSON.parse(JSON.stringify(m.llamar('fijosAuto', {}).datos.palabras.Internet)), ['movistar', 'wow']);
  assert.deepEqual(m.llamar('fijosAuto', {}).datos.fijos.map((f) => [f.concepto, f.dia]), [['Internet', 0]]);
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 5, auto: true });
  assert.deepEqual(JSON.parse(JSON.stringify(m.llamar('fijosAuto', {}).datos.fijos)), [{ concepto: 'Internet', dia: 5, auto: true, palabras: ['movistar', 'wow'] }]);
  m.llamar('guardarFijoAuto', { concepto: 'Internet', dia: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(m.llamar('fijosAuto', {}).datos.fijos)), [{ concepto: 'Internet', dia: 0, auto: false, palabras: ['movistar', 'wow'] }]);
  // Sin día no recuerda nada ni se marca solo por fecha.
  assert.equal(m.contexto.revisarFijos_('2026-11-30', true).motivo, 'nada para hoy');
  assert.equal(m.llamar('guardarFijoAuto', { concepto: 'Ahorro Casa', palabras: ['x y'] }).ok, false);
});
