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
  'pedro@example.com': { nombre: 'Pedro Nicolás', clave: 'P' },
  'britney@example.com': { nombre: 'Britney', clave: 'B' }
};
const TOKEN_PEDRO = 'token-pedro';
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
  getLastRow() { return this.valores.length; }
  getDataRange() { return this.getRange(1, 1, this.valores.length, this.valores[0].length); }
  deleteRow() { this.filasBorradas++; }
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
      setNote: (n) => { hoja.notas[fila - 1][col - 1] = n; hoja.escrituras.push({ fila, col, nota: n }); }
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
    ['Britney', 'Octubre', fecha(2026, 10, 8), 'Limpieza', 'Limpieza sintética', 20,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pagado', '', '', ''],            // fila 3
    ['Britney', 'Octubre', fecha(2026, 10, 9), 'Mascotas', 'Mascota sintética', 40.5,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pendiente', '', '', ''],          // fila 4
    ['Britney', 'Octubre', fecha(2026, 10, 10), 'Ropa y Calzado', 'Ropa sintética', 99,
      fecha(2026, 10, 31), fecha(2026, 11, 9), 'Pagado', 'nota', '', ''],         // fila 5
    ['Britney', 'Octubre', fecha(2026, 10, 10), 'Delivery', 'Pedido sintético', 15,
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
  const propiedades = Object.assign({ CLIENT_ID, USUARIOS: JSON.stringify(USUARIOS) }, c.propiedades || {});
  const correos = [];
  const activadores = (c.activadores || []).map((nombre) => ({ nombre }));
  const cache = {};
  const estado = { hoy: c.hoy || '2026-11-06', cuotaCorreo: c.cuotaCorreo === undefined ? 100 : c.cuotaCorreo };

  const servicios = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
        getSheets: () => hojas
      }),
      flush() {}
    },
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
      computeDigest: (alg, texto) => Array.from(crypto.createHash('sha256').update(texto, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: () => estado.hoy
    },
    UrlFetchApp: {
      // Imita la respuesta de Google al verificar el inicio de sesión.
      fetch: (url) => {
        const token = decodeURIComponent(String(url).split('id_token=')[1] || '');
        const email = token === TOKEN_PEDRO ? 'pedro@example.com' : (token === 'token-extrano' ? 'otro@example.com' : null);
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
    contexto, propiedades, correos, activadores, estado,
    // Llama al motor igual que la web: POST con {accion, token, datos}.
    llamar(accion, datos, token) {
      const cuerpo = JSON.stringify({ accion, token: token === undefined ? TOKEN_PEDRO : token, datos });
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

test('version: informa 1.2.0 y la lista de acciones; inicio y config traen el campo version', () => {
  const m = crearMotor({ hojas: hojasDeConsumos().concat([hojaPresupuesto(),
    new HojaFalsa('Configuración', [['Conceptos de Gasto', 'Responsable'], ['Limpieza', 'Britney']])]) });
  const r = m.llamar('version', {});
  assert.equal(r.ok, true);
  assert.equal(r.datos.version, '1.2.0');
  for (const a of ['desmarcarPagado', 'editarPresupuesto', 'ahorros', 'version', 'marcarPagado', 'inicio']) {
    assert.ok(r.datos.acciones.includes(a), 'falta la acción ' + a);
  }
  assert.equal(m.llamar('inicio', {}).datos.version, '1.2.0');
  assert.equal(m.llamar('config', {}).datos.version, '1.2.0');
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
  const pres = hojaPresupuesto({ notas: { '5,3': 'Pagado el 05/11/2026 · Pedro\nRecordar factura' } });
  const m = crearMotor({ hojas: [pres] });
  const r = pedirEdicion(m);
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    actualizado: true, mes: '2026-11', fila: 5, concepto: 'Luz', seccion: 'gastos',
    montoAnterior: 90, monto: 120.46, pagadoNota: 'Pagado el 05/11/2026 · Pedro',
    totales: { ingresos: 1000, gastos: 775.5, ahorros: 85.5, saldo: 224.5, saldoPersonal: 0 }
  });
  assert.deepEqual(pres.escrituras, [{ fila: 5, col: 3, valor: 120.46 }]);
  assert.equal(pres.notas[4][2], 'Pagado el 05/11/2026 · Pedro\nRecordar factura', 'la nota queda intacta');
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
  assert.equal(fijo.datos.pagadoNota, 'Pagado el 06/11/2026 · Pedro');
  const r = pedirEdicion(m, { fila: 6, concepto: 'Internet', montoAnterior: 100, monto: 110 });
  assert.equal(r.datos.pagadoNota, 'Pagado el 06/11/2026 · Pedro');
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
      { concepto: 'Ahorro Casa', fila: 8, acumulado: 110, delMes: 60,
        meses: [{ mes: '2026-10', etiqueta: 'oct-26', monto: 50 }, { mes: '2026-11', etiqueta: 'nov-26', monto: 60 }] },
      { concepto: 'Ahorro Viaje', fila: 9, acumulado: 25.5, delMes: 25.5,
        meses: [{ mes: '2026-10', etiqueta: 'oct-26', monto: 0 }, { mes: '2026-11', etiqueta: 'nov-26', monto: 25.5 }] },
      { concepto: 'Fondo de Emergencia', fila: 10, acumulado: 20, delMes: 0,
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
  assert.equal(m.correos[0].to, 'pedro@example.com,britney@example.com');
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
