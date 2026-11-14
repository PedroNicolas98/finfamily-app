// Pruebas automáticas de apps-script/Logica.gs (funciones puras).
// Se ejecutan con: npm test   (o: node --test tests/)
// Todos los datos son SINTÉTICOS: imitan la estructura de las hojas reales
// (títulos, encabezados, columnas extra, filas vacías con formato), pero los
// montos, descripciones y notas son inventados.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Logica.gs termina con module.exports; Node lo carga como JavaScript CommonJS.
const L = require(path.join(__dirname, '..', 'apps-script', 'Logica.gs'));

// ---------- Ayudas para armar datos sintéticos ----------

// Fecha a medianoche local (mes en base 1, como se lee normalmente).
function fecha(anio, mes, dia) {
  return new Date(anio, mes - 1, dia);
}

// Fecha local -> 'YYYY-MM-DD' (independiente de Logica.gs, para comparar).
function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ENCABEZADOS_TC = [
  'Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto',
  'Fecha de pago', 'Fecha de vencimiento', 'Estado', 'Nota / Observación',
  '_ID_FORM', '_HUELLA_FORM', '' // columna extra vacía a la derecha
];

const ENCABEZADOS_HORMIGA = [
  'Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto',
  'Medio de Pago', 'Estado', 'Nota / Observación', '_ID_FORM', '_HUELLA_FORM'
];

function filaVacia(ancho) {
  return new Array(ancho).fill('');
}

function titulo(texto, ancho) {
  const f = filaVacia(ancho);
  f[0] = texto;
  return f;
}

// Hoja 'TC IBK' sintética: título en fila 1, fila 2 vacía, encabezados en fila 3.
// Datos desde la fila 4. Contiene consumos de las dos tarjetas (PersonaA y PersonaB).
function hojaTcIbk() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - INTERBANK', ancho),                // fila 1
    filaVacia(ancho),                                                // fila 2
    ENCABEZADOS_TC.slice(),                                          // fila 3
    // fila 4: PersonaA, todo como Date y número
    ['PersonaA', 'Octubre', fecha(2026, 10, 24), 'Supermercado', 'Compra sintética A', 100,
      fecha(2026, 11, 30), fecha(2026, 12, 15), 'Pendiente', '', 'APP:prueba-1', 'x', ''],
    // fila 5: PersonaB, fecha y monto como texto
    ['PersonaB', 'Octubre', '05/10/2026', 'Delivery', 'Pedido sintético B', 'S/.145.00',
      '31/10/2026', '20/11/2026', 'Pendiente', 'nota de prueba', 'WEB:0000-aaaa', 'abc123', ''],
    // fila 6: PersonaA, ya pagado
    ['PersonaA', 'Octubre', fecha(2026, 10, 2), 'Salud y Farmacia', 'Farmacia sintética', 30,
      fecha(2026, 10, 31), fecha(2026, 11, 15), 'Pagado', '', '', '', ''],
    // filas 7 y 8: vacías con formato (sin monto) -> se ignoran
    filaVacia(ancho),
    ['', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
}

// Hoja 'Gastos Hormiga' sintética: título y encabezados en fila 2.
function hojaHormiga() {
  const ancho = ENCABEZADOS_HORMIGA.length;
  return [
    titulo('GASTOS HORMIGA', ancho),                                  // fila 1
    ENCABEZADOS_HORMIGA.slice(),                                      // fila 2
    ['PersonaB', 'Noviembre', fecha(2026, 11, 2), 'Chucherías', 'Golosina sintética', 4.5,
      'Yape', 'Pagado', '', 'APP:h-1', ''],                           // fila 3
    ['PersonaA', 'Noviembre', fecha(2026, 11, 3), 'Pasajes y Transporte', 'Pasaje sintético', 3,
      'Efectivo', 'Pagado', '', '', ''],                              // fila 4
    ['PersonaA', 'Octubre', fecha(2026, 10, 28), 'Desayuno', 'Desayuno sintético', 12,
      'Plin', 'Pagado', '', '', '']                                   // fila 5 (otro mes)
  ];
}

// Hoja 'TC SIP' sintética: título en fila 1, encabezados en fila 2.
function hojaTcSip() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - SIP', ancho),
    ENCABEZADOS_TC.slice(),
    ['PersonaB', 'Octubre', fecha(2026, 10, 8), 'Limpieza', 'Limpieza sintética', 20,
      fecha(2026, 10, 31), fecha(2026, 11, 3), 'Pendiente', '', '', '', ''],      // fila 3, vencida al 04/11
    ['PersonaB', 'Octubre', fecha(2026, 10, 12), 'Mascotas', 'Mascota sintética', 40,
      fecha(2026, 11, 30), fecha(2026, 12, 3), 'Pendiente', '', '', '', '']       // fila 4
  ];
}

// Hoja 'TC Ripley' sintética: consumos sin fecha de pago ni vencimiento.
function hojaTcRipley() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - RIPLEY', ancho),
    ENCABEZADOS_TC.slice(),
    ['PersonaA', 'Octubre', fecha(2026, 10, 15), 'Ropa y Calzado', 'Ropa sintética', 80,
      '', '', 'Pendiente', '', '', '', '']
  ];
}

function todosLosConsumos() {
  return [].concat(
    L.leerConsumos(hojaTcSip(), 'TC SIP'),
    L.leerConsumos(hojaTcIbk(), 'TC IBK'),
    L.leerConsumos(hojaTcRipley(), 'TC Ripley'),
    L.leerConsumos(hojaHormiga(), 'Gastos Hormiga')
  );
}

// ---------- Constantes ----------

test('constantes CICLOS, MESES_ES y ABREV_MES', () => {
  assert.deepEqual(L.CICLOS.SIP, { cierre: 10, vence: 3 });
  assert.deepEqual(L.CICLOS.IBK_P, { cierre: 20, vence: 15 });
  assert.deepEqual(L.CICLOS.IBK_B, { cierre: 20, vence: 20 });
  assert.deepEqual(L.CICLOS.BCP, { cierre: 20, vence: 20 });
  assert.deepEqual(L.CICLOS.RIPLEY, { cierre: null, vence: null });
  assert.equal(L.MESES_ES.length, 12);
  assert.equal(L.MESES_ES[0], 'Enero');
  assert.equal(L.MESES_ES[10], 'Noviembre');
  assert.deepEqual(L.ABREV_MES,
    ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']);
});

// ---------- normalizar / neutralizarTexto ----------

test('normalizar: minúsculas, sin tildes, espacios colapsados', () => {
  assert.equal(L.normalizar('  Configuración   GENERAL  '), 'configuracion general');
  assert.equal(L.normalizar('Descripción'), 'descripcion');
  assert.equal(L.normalizar('Nota / Observación'), 'nota / observacion');
});

test('neutralizarTexto: antepone apóstrofo a = + - @', () => {
  assert.equal(L.neutralizarTexto('=SUMA(A1:A3)'), "'=SUMA(A1:A3)");
  assert.equal(L.neutralizarTexto('+51 999'), "'+51 999");
  assert.equal(L.neutralizarTexto('-5 soles'), "'-5 soles");
  assert.equal(L.neutralizarTexto('@usuario'), "'@usuario");
  assert.equal(L.neutralizarTexto('Menú del día'), 'Menú del día');
});

// ---------- calcularCiclo ----------

test('calcularCiclo SIP (cierre 10, vence 3): ejemplos del contrato', () => {
  assert.deepEqual(L.calcularCiclo('SIP', '2026-10-12'), { pago: '2026-11-30', vence: '2026-12-03' });
  assert.deepEqual(L.calcularCiclo('SIP', '2026-10-08'), { pago: '2026-10-31', vence: '2026-11-03' });
});

test('calcularCiclo SIP: día igual al cierre queda en el mismo mes', () => {
  assert.deepEqual(L.calcularCiclo('SIP', '2026-10-10'), { pago: '2026-10-31', vence: '2026-11-03' });
  assert.deepEqual(L.calcularCiclo('SIP', '2026-10-11'), { pago: '2026-11-30', vence: '2026-12-03' });
});

test('calcularCiclo SIP: cambio de año con compras de diciembre', () => {
  assert.deepEqual(L.calcularCiclo('SIP', '2026-12-05'), { pago: '2026-12-31', vence: '2027-01-03' });
  assert.deepEqual(L.calcularCiclo('SIP', '2026-12-15'), { pago: '2027-01-31', vence: '2027-02-03' });
});

test('calcularCiclo SIP: febrero (último día del mes)', () => {
  assert.deepEqual(L.calcularCiclo('SIP', '2027-01-20'), { pago: '2027-02-28', vence: '2027-03-03' });
});

test('calcularCiclo IBK_P (cierre 20, vence 15)', () => {
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-10-24'), { pago: '2026-11-30', vence: '2026-12-15' });
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-10-20'), { pago: '2026-10-31', vence: '2026-11-15' });
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-12-21'), { pago: '2027-01-31', vence: '2027-02-15' });
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-12-01'), { pago: '2026-12-31', vence: '2027-01-15' });
});

test('calcularCiclo IBK_B (cierre 20, vence 20)', () => {
  assert.deepEqual(L.calcularCiclo('IBK_B', '2026-10-24'), { pago: '2026-11-30', vence: '2026-12-20' });
  assert.deepEqual(L.calcularCiclo('IBK_B', '2026-12-10'), { pago: '2026-12-31', vence: '2027-01-20' });
  assert.deepEqual(L.calcularCiclo('IBK_B', '2026-12-28'), { pago: '2027-01-31', vence: '2027-02-20' });
});

test('calcularCiclo BCP (cierre 20, vence 20)', () => {
  assert.deepEqual(L.calcularCiclo('BCP', '2026-10-16'), { pago: '2026-10-31', vence: '2026-11-20' });
  assert.deepEqual(L.calcularCiclo('BCP', '2026-11-20'), { pago: '2026-11-30', vence: '2026-12-20' });
  assert.deepEqual(L.calcularCiclo('BCP', '2026-11-21'), { pago: '2026-12-31', vence: '2027-01-20' });
  assert.deepEqual(L.calcularCiclo('BCP', '2026-12-25'), { pago: '2027-01-31', vence: '2027-02-20' });
});

test('calcularCiclo RIPLEY: sin ciclo, pago y vence vacíos', () => {
  assert.deepEqual(L.calcularCiclo('RIPLEY', '2026-10-15'), { pago: '', vence: '' });
  assert.deepEqual(L.calcularCiclo('RIPLEY', '2026-12-31'), { pago: '', vence: '' });
});

// ---------- buscarFilaEncabezado / mapearColumnas ----------

test('buscarFilaEncabezado: salta la fila de título y filas vacías', () => {
  assert.equal(L.buscarFilaEncabezado(hojaTcIbk(), 'responsable'), 2);
  assert.equal(L.buscarFilaEncabezado(hojaTcSip(), 'Responsable'), 1);
  assert.equal(L.buscarFilaEncabezado(hojaHormiga(), 'RESPONSABLE'), 1);
});

test('buscarFilaEncabezado: acepta celdas que empiezan con la clave', () => {
  const tabla = [
    ['PRESUPUESTO FAMILIAR', '', ''],
    ['Concepto / Categoría', 'oct-26', 'nov-26']
  ];
  assert.equal(L.buscarFilaEncabezado(tabla, 'concepto'), 1);
});

test('buscarFilaEncabezado: -1 si no está en las primeras 8 filas', () => {
  const tabla = [];
  for (let i = 0; i < 8; i++) tabla.push(['', '', '']);
  tabla.push(['Responsable', 'Mes', 'Fecha']); // índice 8: ya fuera de rango
  assert.equal(L.buscarFilaEncabezado(tabla, 'responsable'), -1);
  assert.equal(L.buscarFilaEncabezado([['a', 'b'], ['c', 'd']], 'responsable'), -1);
});

test('mapearColumnas: hoja TC (con tildes y mayúsculas distintas)', () => {
  const enc = ['RESPONSABLE', 'mes', 'FECHA', 'concepto', 'DESCRIPCION', 'Monto',
    'Fecha de Pago', 'FECHA DE VENCIMIENTO', 'estado', 'Nota / observacion',
    '_id_form', '_HUELLA_FORM', ''];
  const c = L.mapearColumnas(enc);
  assert.deepEqual(c, {
    responsable: 0, mes: 1, fecha: 2, concepto: 3, descripcion: 4, monto: 5,
    fechaPago: 6, fechaVencimiento: 7, estado: 8, nota: 9, medio: -1,
    idForm: 10, huella: 11
  });
});

test('mapearColumnas: hoja Gastos Hormiga (Medio de Pago, sin fechas de tarjeta)', () => {
  const enc = ['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'MONTO',
    'Medio de pago', 'Estado', 'NOTA / OBSERVACIÓN', '_ID_FORM', '_Huella_Form'];
  const c = L.mapearColumnas(enc);
  assert.deepEqual(c, {
    responsable: 0, mes: 1, fecha: 2, concepto: 3, descripcion: 4, monto: 5,
    fechaPago: -1, fechaVencimiento: -1, estado: 7, nota: 8, medio: 6,
    idForm: 9, huella: 10
  });
});

// ---------- parsearMonto / parsearFecha / fechaISO ----------

test('parsearMonto: formatos de moneda y vacíos', () => {
  assert.equal(L.parsearMonto('S/.1,234.50'), 1234.5);
  assert.equal(L.parsearMonto('S/ 1,234.50'), 1234.5);
  assert.equal(L.parsearMonto('-S/.12.00'), -12);
  assert.equal(L.parsearMonto('S/.145.00'), 145);
  assert.equal(L.parsearMonto(45), 45);
  assert.equal(L.parsearMonto(12.75), 12.75);
  assert.equal(L.parsearMonto(''), null);
  assert.equal(L.parsearMonto(null), null);
  assert.equal(L.parsearMonto(undefined), null);
  assert.equal(L.parsearMonto('sin monto'), null);
});

test('parsearFecha: Date, dd/mm/yyyy, yyyy-mm-dd y basura', () => {
  const d1 = L.parsearFecha(fecha(2026, 10, 5));
  assert.ok(d1 instanceof Date);
  assert.equal(iso(d1), '2026-10-05');

  const conHora = L.parsearFecha(new Date(2026, 9, 5, 15, 30));
  assert.equal(iso(conHora), '2026-10-05');
  assert.equal(conHora.getHours(), 0, 'debe quedar a medianoche local');

  const d2 = L.parsearFecha('05/10/2026'); // 5 de octubre (día/mes/año)
  assert.equal(iso(d2), '2026-10-05');
  assert.equal(d2.getHours(), 0);

  const d3 = L.parsearFecha('2026-10-05');
  assert.equal(iso(d3), '2026-10-05');
  assert.equal(d3.getHours(), 0);

  assert.equal(L.parsearFecha('basura'), null);
  assert.equal(L.parsearFecha(''), null);
  assert.equal(L.parsearFecha(null), null);
  assert.equal(L.parsearFecha('32/13/2026'), null);
});

test('fechaISO: Date -> YYYY-MM-DD, vacío si no hay fecha', () => {
  assert.equal(L.fechaISO(fecha(2026, 1, 9)), '2026-01-09');
  assert.equal(L.fechaISO(null), '');
});

// ---------- Meses y etiquetas ----------

test('nombreMes, claveAEtiqueta y etiquetaAClave', () => {
  assert.equal(L.nombreMes('2026-11-04'), 'Noviembre');
  assert.equal(L.nombreMes('2027-01-31'), 'Enero');
  assert.equal(L.claveAEtiqueta('2026-11'), 'nov-26');
  assert.equal(L.claveAEtiqueta('2027-01'), 'ene-27');
  assert.equal(L.etiquetaAClave('nov-26'), '2026-11');
  assert.equal(L.etiquetaAClave('dic-27'), '2027-12');
  assert.equal(L.etiquetaAClave('xyz'), null);
  assert.equal(L.etiquetaAClave(''), null);
});

// ---------- idTarjeta / leerConsumos ----------

test('idTarjeta: separa TC IBK por responsable', () => {
  assert.equal(L.idTarjeta('TC IBK', 'PersonaA'), 'IBK_P');
  assert.equal(L.idTarjeta('TC IBK', 'PersonaB'), 'IBK_B');
  assert.equal(L.idTarjeta('TC IBK', ''), 'IBK_P');
  assert.equal(L.idTarjeta('TC SIP', 'PersonaB'), 'SIP');
  assert.equal(L.idTarjeta('TC BCP', 'PersonaA'), 'BCP');
  assert.equal(L.idTarjeta('TC Ripley', 'PersonaA'), 'RIPLEY');
  assert.equal(L.idTarjeta('Gastos Hormiga', 'PersonaB'), 'HORMIGA');
  assert.equal(L.idTarjeta('Configuración', 'PersonaB'), null);
});

test('leerConsumos TC IBK: fila real, fechas, montos y tarjeta por responsable', () => {
  const cs = L.leerConsumos(hojaTcIbk(), 'TC IBK');
  assert.equal(cs.length, 3, 'las filas vacías con formato se ignoran');

  const [a, b, c] = cs;
  assert.equal(a.fila, 4);
  assert.equal(a.responsable, 'PersonaA');
  assert.equal(a.mes, 'Octubre');
  assert.equal(a.fecha, '2026-10-24');
  assert.equal(a.concepto, 'Supermercado');
  assert.equal(a.descripcion, 'Compra sintética A');
  assert.equal(a.monto, 100);
  assert.equal(a.pago, '2026-11-30');
  assert.equal(a.vence, '2026-12-15');
  assert.equal(a.estado, 'Pendiente');
  assert.equal(a.idForm, 'APP:prueba-1');
  assert.equal(a.tarjeta, 'IBK_P');

  assert.equal(b.fila, 5);
  assert.equal(b.responsable, 'PersonaB');
  assert.equal(b.fecha, '2026-10-05');
  assert.equal(b.monto, 145);
  assert.equal(b.pago, '2026-10-31');
  assert.equal(b.vence, '2026-11-20');
  assert.equal(b.nota, 'nota de prueba');
  assert.equal(b.idForm, 'WEB:0000-aaaa');
  assert.equal(b.huella, 'abc123');
  assert.equal(b.tarjeta, 'IBK_B');

  assert.equal(c.fila, 6);
  assert.equal(c.estado, 'Pagado');
  assert.equal(c.tarjeta, 'IBK_P');
});

test('leerConsumos TC Ripley: sin fecha de pago ni vencimiento', () => {
  const cs = L.leerConsumos(hojaTcRipley(), 'TC Ripley');
  assert.equal(cs.length, 1);
  assert.equal(cs[0].fila, 3);
  assert.equal(cs[0].pago, '');
  assert.equal(cs[0].vence, '');
  assert.equal(cs[0].tarjeta, 'RIPLEY');
});

test('leerConsumos Gastos Hormiga: lee medio de pago', () => {
  const cs = L.leerConsumos(hojaHormiga(), 'Gastos Hormiga');
  assert.equal(cs.length, 3);
  assert.equal(cs[0].fila, 3);
  assert.equal(cs[0].medio, 'Yape');
  assert.equal(cs[0].monto, 4.5);
  assert.equal(cs[0].tarjeta, 'HORMIGA');
  assert.equal(cs[1].medio, 'Efectivo');
  assert.equal(cs[2].medio, 'Plin');
});

// ---------- resumenTarjetas ----------

test('resumenTarjetas: orden fijo, pendientes y próximo vencimiento', () => {
  const r = L.resumenTarjetas(todosLosConsumos(), '2026-11-04', true);
  const ORDEN = ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'HORMIGA'];
  const ids = r.map((t) => t.id);
  for (const id of ['SIP', 'IBK_P', 'IBK_B', 'RIPLEY', 'HORMIGA']) {
    assert.ok(ids.includes(id), `falta la tarjeta ${id}`);
  }
  const posiciones = ids.map((id) => ORDEN.indexOf(id));
  assert.ok(posiciones.every((p) => p >= 0), 'id desconocido en el resumen');
  assert.deepEqual(posiciones, posiciones.slice().sort((x, y) => x - y), 'orden incorrecto');

  const por = Object.fromEntries(r.map((t) => [t.id, t]));

  // Nombres y hojas
  assert.equal(por.SIP.nombre, 'TC SIP');
  assert.equal(por.IBK_P.nombre, 'TC IBK · PersonaA');
  assert.equal(por.IBK_B.nombre, 'TC IBK · PersonaB');
  assert.equal(por.RIPLEY.nombre, 'TC Ripley');
  assert.equal(por.HORMIGA.nombre, 'Gastos hormiga');
  assert.equal(por.IBK_P.hoja, 'TC IBK');
  assert.equal(por.IBK_B.hoja, 'TC IBK');
  assert.equal(por.HORMIGA.hoja, 'Gastos Hormiga');
  assert.equal(por.IBK_P.responsable, 'PersonaA');
  assert.equal(por.IBK_B.responsable, 'PersonaB');
  assert.equal(por.HORMIGA.responsable, '');

  // Pendientes: solo suma estado 'Pendiente'
  assert.equal(por.SIP.pendiente, 60);
  assert.equal(por.IBK_P.pendiente, 100); // el de 30 ya está Pagado
  assert.equal(por.IBK_B.pendiente, 145);
  assert.equal(por.RIPLEY.pendiente, 80);

  // Próximo vencimiento: menor vencimiento pendiente
  assert.equal(por.SIP.proximoVence, '2026-11-03');
  assert.equal(por.IBK_P.proximoVence, '2026-12-15');
  assert.equal(por.IBK_B.proximoVence, '2026-11-20');
  assert.equal(por.RIPLEY.proximoVence, null);

  // HORMIGA: total del mes de hoy (noviembre), sin el consumo de octubre
  assert.equal(por.HORMIGA.pendiente, 7.5);
  assert.equal(por.HORMIGA.estados.length, 1);
  assert.equal(por.HORMIGA.estados[0].consumos.length, 2);
  assert.deepEqual(por.HORMIGA.estados[0].consumos.map((c) => c.fila).sort(), [3, 4]);
});

test('resumenTarjetas: estados agrupados por vencimiento, ordenados y con consumos', () => {
  const r = L.resumenTarjetas(todosLosConsumos(), '2026-11-04', true);
  const por = Object.fromEntries(r.map((t) => [t.id, t]));

  // SIP: dos grupos, ordenados por vence ascendente
  assert.deepEqual(por.SIP.estados.map((e) => e.vence), ['2026-11-03', '2026-12-03']);
  assert.equal(por.SIP.estados[0].pago, '2026-10-31');
  assert.equal(por.SIP.estados[0].total, 20);
  assert.equal(por.SIP.estados[0].pendiente, 20);

  const consumo = por.SIP.estados[1].consumos[0];
  assert.equal(consumo.fila, 4);
  assert.equal(consumo.fecha, '2026-10-12');
  assert.equal(consumo.concepto, 'Mascotas');
  assert.equal(consumo.descripcion, 'Mascota sintética');
  assert.equal(consumo.monto, 40);
  assert.equal(consumo.estado, 'Pendiente');
  for (const campo of ['idForm', 'nota', 'medio']) {
    assert.ok(campo in consumo, `al consumo le falta el campo ${campo}`);
  }

  // IBK_P con pagados incluidos: grupo 15/11 (pagado) y 15/12 (pendiente)
  assert.deepEqual(por.IBK_P.estados.map((e) => e.vence), ['2026-11-15', '2026-12-15']);
  assert.equal(por.IBK_P.estados[0].pendiente, 0);
  assert.equal(por.IBK_P.estados[0].total, 30);

  // RIPLEY: grupo sin fecha
  assert.equal(por.RIPLEY.estados.length, 1);
  assert.equal(por.RIPLEY.estados[0].vence, '');
  assert.equal(por.RIPLEY.estados[0].pago, '');
});

test('resumenTarjetas: grupos sin fecha van al final', () => {
  const cs = [
    { fila: 3, responsable: 'PersonaA', mes: 'Octubre', fecha: '2026-10-15', concepto: 'Ropa y Calzado',
      descripcion: 'Sin fecha', monto: 10, pago: '', vence: '', estado: 'Pendiente', nota: '', medio: '',
      idForm: '', huella: '', tarjeta: 'RIPLEY' },
    { fila: 4, responsable: 'PersonaA', mes: 'Octubre', fecha: '2026-10-16', concepto: 'Ropa y Calzado',
      descripcion: 'Con fecha', monto: 20, pago: '2026-11-30', vence: '2026-12-10', estado: 'Pendiente', nota: '',
      medio: '', idForm: '', huella: '', tarjeta: 'RIPLEY' }
  ];
  const r = L.resumenTarjetas(cs, '2026-11-04', true);
  const rip = r.find((t) => t.id === 'RIPLEY');
  assert.deepEqual(rip.estados.map((e) => e.vence), ['2026-12-10', '']);
  assert.equal(rip.proximoVence, '2026-12-10');
  assert.equal(rip.pendiente, 30);
});

test('resumenTarjetas sin pagados: no muestra consumos Pagado de tarjetas', () => {
  const r = L.resumenTarjetas(todosLosConsumos(), '2026-11-04', false);
  const por = Object.fromEntries(r.map((t) => [t.id, t]));
  for (const t of r) {
    if (t.id === 'HORMIGA') continue; // en hormiga todo es 'Pagado' y se muestra el mes
    for (const e of t.estados) {
      for (const c of e.consumos) {
        assert.notEqual(c.estado, 'Pagado', `${t.id} muestra un consumo pagado (fila ${c.fila})`);
      }
    }
  }
  assert.equal(por.IBK_P.pendiente, 100);
  assert.equal(por.HORMIGA.pendiente, 7.5);
});

// ---------- alertas ----------

function tarjetaResumen(id, nombre, estados) {
  return {
    id, nombre, hoja: '', responsable: '',
    pendiente: estados.reduce((s, e) => s + e.pendiente, 0),
    proximoVence: null, estados
  };
}

test('alertas: vencida, por vencer dentro de 3 días y sin fecha', () => {
  const resumen = [
    tarjetaResumen('SIP', 'TC SIP', [{ vence: '2026-11-03', pago: '2026-10-31', total: 20, pendiente: 20, consumos: [] }]),
    tarjetaResumen('IBK_P', 'TC IBK · PersonaA', [{ vence: '2026-11-07', pago: '2026-10-31', total: 50, pendiente: 50, consumos: [] }]),
    tarjetaResumen('IBK_B', 'TC IBK · PersonaB', [{ vence: '2026-11-04', pago: '2026-10-31', total: 15, pendiente: 15, consumos: [] }]),
    tarjetaResumen('BCP', 'TC BCP', [{ vence: '2026-11-08', pago: '2026-10-31', total: 70, pendiente: 70, consumos: [] }]),
    tarjetaResumen('RIPLEY', 'TC Ripley', [{ vence: '', pago: '', total: 80, pendiente: 80, consumos: [] }])
  ];
  const al = L.alertas(resumen, '2026-11-04', 3);
  const por = Object.fromEntries(al.map((a) => [a.tarjeta, a]));

  assert.deepEqual(por.SIP, { tipo: 'vencida', tarjeta: 'SIP', nombre: 'TC SIP', vence: '2026-11-03', monto: 20 });
  assert.deepEqual(por.IBK_P, { tipo: 'por_vencer', tarjeta: 'IBK_P', nombre: 'TC IBK · PersonaA', vence: '2026-11-07', monto: 50 });
  assert.equal(por.IBK_B.tipo, 'por_vencer', 'vence hoy (0 días) también avisa');
  assert.equal(por.BCP, undefined, 'a 4 días no avisa');
  assert.equal(por.RIPLEY, undefined, 'sin fecha no genera alerta');
  assert.equal(al.length, 3);
});

test('alertas: un estado ya pagado (pendiente 0) no genera alerta', () => {
  const resumen = [
    tarjetaResumen('SIP', 'TC SIP', [{ vence: '2026-11-01', pago: '2026-10-31', total: 20, pendiente: 0, consumos: [] }])
  ];
  assert.deepEqual(L.alertas(resumen, '2026-11-04', 3), []);
});

test('alertas: diasAviso por defecto es 3', () => {
  const resumen = [
    tarjetaResumen('BCP', 'TC BCP', [{ vence: '2026-11-07', pago: '2026-10-31', total: 9, pendiente: 9, consumos: [] }]),
    tarjetaResumen('SIP', 'TC SIP', [{ vence: '2026-11-08', pago: '2026-10-31', total: 9, pendiente: 9, consumos: [] }])
  ];
  const al = L.alertas(resumen, '2026-11-04');
  assert.deepEqual(al.map((a) => a.tarjeta), ['BCP']);
});

test('alertas a partir de hojas sintéticas: SIP vencida el 03/11', () => {
  const r = L.resumenTarjetas(todosLosConsumos(), '2026-11-04', false);
  const al = L.alertas(r, '2026-11-04', 3);
  const sip = al.find((a) => a.tarjeta === 'SIP');
  assert.ok(sip, 'debe alertar la SIP vencida');
  assert.equal(sip.tipo, 'vencida');
  assert.equal(sip.vence, '2026-11-03');
  assert.equal(sip.monto, 20);
  assert.ok(!al.some((a) => a.tarjeta === 'RIPLEY'));
  assert.ok(!al.some((a) => a.tarjeta === 'HORMIGA'));
});

// ---------- leerPresupuesto ----------

// Hoja 'PRESUPUESTO FAMILIAR' sintética. Columnas: concepto, oct-26, nov-26,
// dic-26, (sin título: total trimestral), ene-27, feb-27, columna extra.
// Los totales del Sheets NO coinciden a propósito con la suma de filas,
// para comprobar que se leen y no se recalculan.
function hojaPresupuesto() {
  const enc = ['Concepto / Categoría', 'oct-26', 'nov-26', 'dic-26', '', 'ene-27', 'feb-27', 'Comentario'];
  const filas = [
    ['Ingresos - PersonaA (S/ 1,000)', 1000, 1000, 1000, 3000, 1000, 1000, ''],
    ['Ingresos - PersonaB (S/ 500)', 500, 500, 500, 1500, 500, 500, ''],
    ['Otros Ingresos / Adicionales', 0, 50, 0, 50, 0, 0, ''],
    ['TOTAL INGRESOS', 1500, 1551.11, 1500, 4551.11, 1500, 1500, ''],
    ['TC Interbank', 200, 210, 220, 630, 0, 0, ''],
    ['TC BCP', 100, 110, 120, 330, 0, 0, ''],
    ['Alimentación (BCP-DEB-PE)', 300, 300, 300, 900, 300, 300, ''],
    ['Servicios', 80, 80, 80, 240, 80, 80, ''],
    ['Ahorro Casa', 50, 60, 50, 160, 50, 50, ''],
    ['Ahorro Viaje', 0, 0, 0, 0, 0, 0, ''],
    ['Fondo de Emergencia', 20, 20, 20, 60, 20, 20, ''],
    ['TOTAL GASTOS', 680, 702.22, 720, 2102.22, 380, 380, ''],
    ['TOTAL AHORROS', 70, 80, 70, 220, 70, 70, ''],
    ['SALDO / SUPERÁVIT FINAL', 750, 768.89, 710, 2228.89, 1050, 1050, ''],
    ['Saldo Personal', 375, 384.44, 355, 1114.44, 525, 525, '']
  ];
  const valores = [titulo('PRESUPUESTO FAMILIAR', enc.length), enc.slice()].concat(filas.map((f) => f.slice()));
  const fmt = (v) => (typeof v === 'number'
    ? 'S/ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(v));
  const display = valores.map((f) => f.map(fmt));
  return { display, valores };
}

test('leerPresupuesto: encuentra nov-26 y lee los totales del Sheets', () => {
  const { display, valores } = hojaPresupuesto();
  const p = L.leerPresupuesto(display, valores, '2026-11');
  assert.ok(p, 'debe encontrar el mes');
  assert.equal(p.mes, '2026-11');
  assert.equal(p.etiquetaMes, 'nov-26');
  assert.deepEqual(p.totales, {
    ingresos: 1551.11,
    gastos: 702.22,
    ahorros: 80,
    saldo: 768.89,
    saldoPersonal: 384.44
  });
});

test('leerPresupuesto: lista de meses sin la columna sin título ni extras', () => {
  const { display, valores } = hojaPresupuesto();
  const p = L.leerPresupuesto(display, valores, '2026-11');
  assert.deepEqual(p.meses, [
    { clave: '2026-10', etiqueta: 'oct-26' },
    { clave: '2026-11', etiqueta: 'nov-26' },
    { clave: '2026-12', etiqueta: 'dic-26' },
    { clave: '2027-01', etiqueta: 'ene-27' },
    { clave: '2027-02', etiqueta: 'feb-27' }
  ]);
});

test('leerPresupuesto: clasifica filas en ingresos, gastos y ahorros', () => {
  const { display, valores } = hojaPresupuesto();
  const p = L.leerPresupuesto(display, valores, '2026-11');
  const por = Object.fromEntries(p.filas.map((f) => [f.concepto, f]));

  assert.equal(por['Ingresos - PersonaA (S/ 1,000)'].seccion, 'ingresos');
  assert.equal(por['Ingresos - PersonaA (S/ 1,000)'].monto, 1000);
  assert.equal(por['Otros Ingresos / Adicionales'].seccion, 'ingresos');
  assert.equal(por['Otros Ingresos / Adicionales'].monto, 50);
  assert.equal(por['TC Interbank'].seccion, 'gastos');
  assert.equal(por['TC Interbank'].monto, 210);
  assert.equal(por['Alimentación (BCP-DEB-PE)'].seccion, 'gastos');
  assert.equal(por['Servicios'].seccion, 'gastos');
  assert.equal(por['Ahorro Casa'].seccion, 'ahorros');
  assert.equal(por['Ahorro Casa'].monto, 60);
  assert.equal(por['Fondo de Emergencia'].seccion, 'ahorros');

  for (const f of p.filas) {
    assert.ok(['ingresos', 'gastos', 'ahorros'].includes(f.seccion), `sección inválida en ${f.concepto}`);
  }
});

test('leerPresupuesto: otro mes (dic-26) y mes inexistente', () => {
  const { display, valores } = hojaPresupuesto();
  const d = L.leerPresupuesto(display, valores, '2026-12');
  assert.equal(d.etiquetaMes, 'dic-26');
  assert.equal(d.totales.ingresos, 1500);
  assert.equal(d.totales.saldoPersonal, 355);
  assert.equal(L.leerPresupuesto(display, valores, '2025-01'), null);
});

// ---------- firmaGasto ----------

test('firmaGasto: formato fecha|monto|descripción normalizada', () => {
  assert.equal(
    L.firmaGasto({ fecha: '2026-11-04', monto: 145, descripcion: '  Pollo  a la BRASA ' }),
    '2026-11-04|145.00|pollo a la brasa'
  );
  assert.equal(
    L.firmaGasto({ fecha: '2026-11-04', monto: 12.5, descripcion: 'Menú' }),
    '2026-11-04|12.50|menu'
  );
});

test('firmaGasto: detecta duplicados con variaciones de forma', () => {
  const a = L.firmaGasto({ fecha: '2026-10-05', monto: 145, descripcion: 'Pedido Sintético B' });
  const b = L.firmaGasto({ fecha: '2026-10-05', monto: 145.0, descripcion: '  pedido   sintetico b' });
  assert.equal(a, b);
  const otroMonto = L.firmaGasto({ fecha: '2026-10-05', monto: 145.01, descripcion: 'Pedido Sintético B' });
  const otraFecha = L.firmaGasto({ fecha: '2026-10-06', monto: 145, descripcion: 'Pedido Sintético B' });
  assert.notEqual(a, otroMonto);
  assert.notEqual(a, otraFecha);
});

// ---------- construirFila ----------

test('construirFila TC IBK (PersonaB): columnas según encabezado y Estado Pendiente', () => {
  const columnas = L.mapearColumnas(ENCABEZADOS_TC);
  const ancho = ENCABEZADOS_TC.length;
  const datos = {
    idCliente: '11111111-2222-3333-4444-555555555555',
    monto: 59.9,
    medio: 'TC_IBK',
    concepto: 'Suscripciones',
    descripcion: '=HIPERVINCULO("x")',
    nota: 'nota sintética',
    fecha: '2026-10-24'
  };
  const ciclo = L.calcularCiclo('IBK_B', datos.fecha);
  const fila = L.construirFila(columnas, ancho, datos, 'PersonaB', 'TC IBK', ciclo);

  assert.equal(fila.length, ancho);
  assert.equal(fila[columnas.responsable], 'PersonaB');
  assert.equal(fila[columnas.mes], 'Octubre');
  assert.ok(fila[columnas.fecha] instanceof Date);
  assert.equal(iso(fila[columnas.fecha]), '2026-10-24');
  assert.equal(fila[columnas.concepto], 'Suscripciones');
  assert.equal(fila[columnas.descripcion], '\'=HIPERVINCULO("x")', 'descripción neutralizada');
  assert.equal(typeof fila[columnas.monto], 'number');
  assert.equal(fila[columnas.monto], 59.9);
  assert.ok(fila[columnas.fechaPago] instanceof Date);
  assert.equal(iso(fila[columnas.fechaPago]), '2026-11-30');
  assert.ok(fila[columnas.fechaVencimiento] instanceof Date);
  assert.equal(iso(fila[columnas.fechaVencimiento]), '2026-12-20');
  assert.equal(fila[columnas.estado], 'Pendiente');
  assert.equal(fila[columnas.nota], 'nota sintética');
  assert.equal(fila[columnas.idForm], 'APP:11111111-2222-3333-4444-555555555555');
  assert.equal(fila[columnas.huella],
    L.firmaGasto({ fecha: '2026-10-24', monto: 59.9, descripcion: datos.descripcion }));
  assert.equal(fila[ancho - 1], '', 'la columna extra queda vacía');
});

test('construirFila TC Ripley: fechas de pago y vencimiento vacías', () => {
  const columnas = L.mapearColumnas(ENCABEZADOS_TC);
  const datos = {
    idCliente: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', monto: 80, medio: 'TC_RIPLEY',
    concepto: 'Ropa y Calzado', descripcion: 'Polo sintético', nota: '', fecha: '2026-11-02'
  };
  const fila = L.construirFila(columnas, ENCABEZADOS_TC.length, datos, 'PersonaA', 'TC Ripley',
    L.calcularCiclo('RIPLEY', datos.fecha));
  assert.equal(fila[columnas.responsable], 'PersonaA');
  assert.equal(fila[columnas.mes], 'Noviembre');
  assert.equal(fila[columnas.fechaPago], '');
  assert.equal(fila[columnas.fechaVencimiento], '');
  assert.equal(fila[columnas.estado], 'Pendiente');
  assert.equal(fila[columnas.idForm], 'APP:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

test('construirFila Gastos Hormiga: orden de columnas, medio Yape y Estado Pagado', () => {
  // Orden de columnas distinto al habitual para comprobar que se respeta el encabezado
  const enc = ['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Medio de Pago', 'Monto',
    'Estado', 'Nota / Observación', '_ID_FORM', '_HUELLA_FORM', ''];
  const columnas = L.mapearColumnas(enc);
  assert.equal(columnas.medio, 5);
  assert.equal(columnas.monto, 6);

  const datos = {
    idCliente: '99999999-8888-7777-6666-555555555555', monto: 4.5, medio: 'YAPE',
    concepto: 'Chucherías', descripcion: 'Golosina sintética', nota: '', fecha: '2026-11-03'
  };
  const fila = L.construirFila(columnas, enc.length, datos, 'PersonaA', 'Gastos Hormiga',
    { pago: '', vence: '' });

  assert.equal(fila.length, enc.length);
  assert.deepEqual(
    [fila[0], fila[1], fila[3], fila[4], fila[5], fila[6], fila[7], fila[8], fila[9]],
    ['PersonaA', 'Noviembre', 'Chucherías', 'Golosina sintética', 'Yape', 4.5, 'Pagado', '',
      'APP:99999999-8888-7777-6666-555555555555']
  );
  assert.ok(fila[2] instanceof Date);
  assert.equal(iso(fila[2]), '2026-11-03');
  assert.equal(fila[10], '2026-11-03|4.50|golosina sintetica');
  assert.equal(fila[11], '');
});

test('construirFila Gastos Hormiga: Plin y Efectivo', () => {
  const columnas = L.mapearColumnas(ENCABEZADOS_HORMIGA);
  const base = { idCliente: 'id-x', monto: 2, concepto: 'Desayuno', descripcion: 'Pan', nota: '', fecha: '2026-11-04' };
  const plin = L.construirFila(columnas, ENCABEZADOS_HORMIGA.length, Object.assign({}, base, { medio: 'PLIN' }),
    'PersonaB', 'Gastos Hormiga', { pago: '', vence: '' });
  const efectivo = L.construirFila(columnas, ENCABEZADOS_HORMIGA.length, Object.assign({}, base, { medio: 'EFECTIVO' }),
    'PersonaB', 'Gastos Hormiga', { pago: '', vence: '' });
  assert.equal(plin[columnas.medio], 'Plin');
  assert.equal(efectivo[columnas.medio], 'Efectivo');
  assert.equal(plin[columnas.estado], 'Pagado');
});

// ---------- Gastos fijos pagados y gasto por persona ----------

test('notaPagado, ponerNotaPagado y quitarNotaPagado conservan lo demás de la nota', () => {
  assert.equal(L.notaPagado(''), '');
  assert.equal(L.notaPagado('Recordar factura'), '');
  assert.equal(L.notaPagado('Recordar factura\nPagado el 05/11/2026 · PersonaA'), 'Pagado el 05/11/2026 · PersonaA');
  assert.equal(L.ponerNotaPagado('', 'Pagado el 05/11/2026 · PersonaA'), 'Pagado el 05/11/2026 · PersonaA');
  assert.equal(L.ponerNotaPagado('Recordar factura', 'Pagado el 05/11/2026 · PersonaA'),
    'Pagado el 05/11/2026 · PersonaA\nRecordar factura');
  // Volver a marcar no duplica el renglón.
  assert.equal(L.ponerNotaPagado('Pagado el 01/11/2026 · PersonaB\nRecordar factura', 'Pagado el 05/11/2026 · PersonaA'),
    'Pagado el 05/11/2026 · PersonaA\nRecordar factura');
  assert.equal(L.quitarNotaPagado('Pagado el 05/11/2026 · PersonaA\nRecordar factura'), 'Recordar factura');
  assert.equal(L.quitarNotaPagado('Pagado el 05/11/2026 · PersonaA'), '');
});

test('leerPresupuesto marca como pagadas las líneas de gastos con nota "Pagado"', () => {
  const display = [
    ['PRESUPUESTO', '', ''],
    ['Concepto / Categoría', 'oct-26', 'nov-26'],
    ['Ingresos - Uno', '1000', '1000'],
    ['TOTAL INGRESOS', '1000', '1000'],
    ['Luz', '80', '90'],
    ['TC Interbank', '300', '310'],
    ['Internet', '100', '100'],
    ['TOTAL GASTOS', '480', '500'],
    ['SALDO / SUPERÁVIT FINAL', '520', '500'],
  ];
  const valores = display.map((f) => f.map((v) => (/^\d+$/.test(v) ? Number(v) : v)));
  const notas = display.map((f) => f.map(() => ''));
  notas[4][2] = 'Pagado el 05/11/2026 · PersonaA';
  notas[6][1] = 'Pagado el 03/10/2026 · PersonaB'; // otro mes: no cuenta para noviembre
  const p = L.leerPresupuesto(display, valores, '2026-11', notas);
  assert.equal(p.columna, 3);
  const luz = p.filas.find((f) => f.concepto === 'Luz');
  assert.deepEqual({ fila: luz.fila, pagado: luz.pagado, nota: luz.pagadoNota, tc: luz.esTarjeta },
    { fila: 5, pagado: true, nota: 'Pagado el 05/11/2026 · PersonaA', tc: false });
  const internet = p.filas.find((f) => f.concepto === 'Internet');
  assert.equal(internet.pagado, false);
  assert.equal(p.filas.find((f) => f.concepto === 'TC Interbank').esTarjeta, true);
  // Sin notas (llamadas antiguas) nada queda como pagado.
  assert.equal(L.leerPresupuesto(display, valores, '2026-11').filas.find((f) => f.concepto === 'Luz').pagado, false);
});

test('gastoPorPersona suma por responsable solo los consumos del mes', () => {
  const consumos = [
    { responsable: 'Ana', fecha: '2026-11-02', monto: 50, concepto: 'Supermercado', tarjeta: 'SIP' },
    { responsable: 'Ana', fecha: '2026-11-10', monto: 20.5, concepto: 'Delivery', tarjeta: 'HORMIGA' },
    { responsable: 'Ana', fecha: '2026-11-11', monto: 30, concepto: 'Supermercado', tarjeta: 'SIP' },
    { responsable: 'Luis', fecha: '2026-11-03', monto: 200, concepto: 'Ropa y Calzado', tarjeta: 'BCP' },
    { responsable: 'Luis', fecha: '2026-10-30', monto: 999, concepto: 'Otro mes', tarjeta: 'BCP' },
    { responsable: '', fecha: '', monto: 5, concepto: 'Sin fecha', tarjeta: 'HORMIGA' },
  ];
  const r = L.gastoPorPersona(consumos, '2026-11');
  assert.deepEqual(r.map((x) => [x.nombre, x.total, x.consumos]), [['Luis', 200, 1], ['Ana', 100.5, 3]]);
  const ana = r.find((x) => x.nombre === 'Ana');
  assert.deepEqual(ana.conceptos, [{ monto: 80, concepto: 'Supermercado' }, { monto: 20.5, concepto: 'Delivery' }]);
  assert.deepEqual(ana.medios.map((m) => m.medio), ['TC SIP', 'Gastos hormiga']);
  assert.deepEqual(L.gastoPorPersona(consumos, '2026-09'), []);
});

// ---------- Motor 1.2.0: monto del presupuesto, ahorros y avisos ----------

test('validarMontoPresupuesto: acepta números razonables y rechaza el resto', () => {
  assert.deepEqual(L.validarMontoPresupuesto(120.456), { monto: 120.46 });
  assert.deepEqual(L.validarMontoPresupuesto(0), { monto: 0 });
  assert.deepEqual(L.validarMontoPresupuesto('S/ 1,234.50'), { monto: 1234.5 });
  assert.deepEqual(L.validarMontoPresupuesto(1000000), { monto: 1000000 });
  assert.equal(L.validarMontoPresupuesto(-0.01).error, 'El monto no puede ser negativo.');
  assert.equal(L.validarMontoPresupuesto(1000001).error, 'El monto es demasiado grande (máximo 1,000,000).');
  for (const malo of ['', 'abc', null, undefined, NaN, Infinity, {}, [], true]) {
    assert.equal(L.validarMontoPresupuesto(malo).error, 'El monto debe ser un número.');
  }
});

test('ahorrosAcumulados: suma cada meta desde el primer mes hasta el pedido', () => {
  const { display, valores } = hojaPresupuesto();
  const r = L.ahorrosAcumulados(display, valores, '2026-12');
  assert.equal(r.mes, '2026-12');
  assert.equal(r.desde, '2026-10');
  assert.deepEqual(r.metas.map((m) => [m.concepto, m.acumulado, m.delMes]),
    [['Ahorro Casa', 160, 50], ['Ahorro Viaje', 0, 0], ['Fondo de Emergencia', 60, 20]]);
  assert.deepEqual(r.metas[0].meses, [
    { mes: '2026-10', etiqueta: 'oct-26', monto: 50 },
    { mes: '2026-11', etiqueta: 'nov-26', monto: 60 },
    { mes: '2026-12', etiqueta: 'dic-26', monto: 50 }
  ]);
  assert.equal(r.total, 220);
  assert.equal(r.totalDelMes, 70);
  // La columna sin título (total trimestral) no se cuenta como mes.
  assert.equal(L.ahorrosAcumulados(display, valores, '2027-01').metas[0].acumulado, 210);
  // Primer mes: acumulado igual a lo del mes. Mes que no existe: null.
  assert.deepEqual(L.ahorrosAcumulados(display, valores, '2026-10').metas.map((m) => m.acumulado), [50, 0, 20]);
  assert.equal(L.ahorrosAcumulados(display, valores, '2025-01'), null);
});

test('avisosDelDia: avisa a 3 días, mañana y hoy; no a 2 días, ni vencidas, ni pagadas, ni hormiga', () => {
  const e = (vence, pendiente) => ({ vence, pago: '', total: pendiente, pendiente, consumos: [] });
  const resumen = [
    tarjetaResumen('SIP', 'TC SIP', [e('2026-11-09', 120)]),             // en 3 días
    tarjetaResumen('IBK_P', 'TC IBK · PersonaA', [e('2026-11-07', 50.5)]),  // mañana
    tarjetaResumen('IBK_B', 'TC IBK · PersonaB', [e('2026-11-06', 15), e('2026-11-08', 99)]), // hoy / en 2 días
    tarjetaResumen('BCP', 'TC BCP', [e('2026-11-05', 70), e('2026-11-09', 0)]), // vencida / sin deuda
    tarjetaResumen('RIPLEY', 'TC Ripley', [e('', 80)]),                  // sin fecha
    tarjetaResumen('HORMIGA', 'Gastos hormiga', [e('2026-11-06', 9)])
  ];
  const av = L.avisosDelDia(resumen, '2026-11-06', []);
  assert.deepEqual(av, [
    { clave: '2026-11-06|IBK_B|2026-11-06', tarjeta: 'IBK_B', nombre: 'TC IBK · PersonaB', vence: '2026-11-06', monto: 15, dias: 0, cuando: 'hoy' },
    { clave: '2026-11-06|IBK_P|2026-11-07', tarjeta: 'IBK_P', nombre: 'TC IBK · PersonaA', vence: '2026-11-07', monto: 50.5, dias: 1, cuando: 'manana' },
    { clave: '2026-11-06|SIP|2026-11-09', tarjeta: 'SIP', nombre: 'TC SIP', vence: '2026-11-09', monto: 120, dias: 3, cuando: 'en_3_dias' }
  ]);
  // Lo ya avisado hoy se salta; lo avisado otro día (otra clave) no cuenta.
  const resto = L.avisosDelDia(resumen, '2026-11-06', ['2026-11-06|SIP|2026-11-09', '2026-11-05|IBK_P|2026-11-07']);
  assert.deepEqual(resto.map((a) => a.tarjeta), ['IBK_B', 'IBK_P']);
  assert.deepEqual(L.avisosDelDia(resumen, '2026-11-06', av.map((a) => a.clave)), []);
  assert.deepEqual(L.avisosDelDia(resumen, 'no es fecha', []), []);
  assert.deepEqual(L.avisosDelDia(null, '2026-11-06'), []);
});

test('avisosDelDia con hojas sintéticas y textoAvisos: asunto y cuerpo del correo', () => {
  // TC SIP sintética: 40 pendientes que vencen el 03/12/2026.
  const resumen = L.resumenTarjetas(todosLosConsumos(), '2026-11-30', false);
  const av = L.avisosDelDia(resumen, '2026-11-30', []);
  assert.deepEqual(av.map((a) => [a.tarjeta, a.monto, a.cuando]), [['SIP', 40, 'en_3_dias']]);
  const uno = L.textoAvisos(av);
  assert.equal(uno.asunto, 'FinFamily: TC SIP vence en 3 días (S/ 40)');
  assert.ok(uno.cuerpo.includes('• TC SIP: S/ 40 — vence en 3 días (03/12/2026)'));
  assert.ok(!uno.cuerpo.includes('Total:'));

  const varios = L.textoAvisos([
    { nombre: 'TC BCP', monto: 1234.5, cuando: 'hoy', vence: '2026-11-20' },
    { nombre: 'TC SIP', monto: 20, cuando: 'manana', vence: '2026-11-21' }
  ]);
  assert.equal(varios.asunto, 'FinFamily: 2 pagos de tarjeta por vencer');
  assert.ok(varios.cuerpo.includes('• TC BCP: S/ 1,234.50 — vence HOY (20/11/2026)'));
  assert.ok(varios.cuerpo.includes('• TC SIP: S/ 20 — vence mañana (21/11/2026)'));
  assert.ok(varios.cuerpo.includes('Total: S/ 1,254.50'));
  assert.equal(L.textoAvisos([]), null);
});

// ===========================================================================
// Motor 1.3: ajustes, datos de tarjetas, textos de alertas y calendario
// ===========================================================================

test('ajustesAvisosDesde y validarAjustesAvisos: defectos, mezcla y validación', () => {
  const defecto = { vencimiento: true, presupuesto: true, gastoGrande: 300, resumenSemanal: true, calendario: true, recordatorio: true, subidas: true };
  assert.deepEqual(L.AJUSTES_AVISOS_DEFECTO, defecto);
  assert.deepEqual(L.ajustesAvisosDesde(null), defecto);
  assert.deepEqual(L.ajustesAvisosDesde('no es json'), defecto);
  assert.deepEqual(L.ajustesAvisosDesde(JSON.stringify({ gastoGrande: 'x', vencimiento: 'no', calendario: false })),
    Object.assign({}, defecto, { calendario: false }), 'los valores inválidos guardados se ignoran');
  assert.deepEqual(L.ajustesAvisosDesde(JSON.stringify({ gastoGrande: 500000 })), defecto, 'fuera de rango: se ignora');

  assert.deepEqual(L.validarAjustesAvisos({}, defecto), { ajustes: defecto });
  assert.deepEqual(L.validarAjustesAvisos({ gastoGrande: 150.555, presupuesto: false }, defecto),
    { ajustes: Object.assign({}, defecto, { gastoGrande: 150.56, presupuesto: false }) });
  assert.deepEqual(L.validarAjustesAvisos({ gastoGrande: 'S/ 1,000' }, null).ajustes.gastoGrande, 1000);
  assert.deepEqual(L.validarAjustesAvisos({ gastoGrande: 0 }, defecto).ajustes.gastoGrande, 0);
  assert.equal(L.validarAjustesAvisos({ gastoGrande: -5 }, defecto).error, 'El monto de gasto grande no puede ser negativo.');
  assert.equal(L.validarAjustesAvisos({ gastoGrande: 100001 }, defecto).error, 'El monto de gasto grande es demasiado alto (máximo 100,000).');
  assert.equal(L.validarAjustesAvisos({ gastoGrande: null }, defecto).error, 'El monto de gasto grande debe ser un número.');
  assert.equal(L.validarAjustesAvisos({ calendario: 'true' }, defecto).error, 'El ajuste "calendario" debe ser sí o no.');
});

test('datosTarjetasDesde y validarDatosTarjeta: siempre 5 tarjetas limpias', () => {
  const vacia = { digitos: '', red: '', nombre: '' };
  assert.deepEqual(Object.keys(L.datosTarjetasDesde(null)), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.deepEqual(L.datosTarjetasDesde('{roto').SIP, vacia);
  const d = L.datosTarjetasDesde(JSON.stringify({ SIP: { digitos: '12', red: 'amex', nombre: 'x'.repeat(40) }, BCP: { digitos: 4821, red: 'visa', nombre: 'BCP  Visa' }, OTRA: {} }));
  assert.deepEqual(d.SIP, { digitos: '', red: '', nombre: 'x'.repeat(26) });
  assert.deepEqual(d.BCP, { digitos: '4821', red: 'visa', nombre: 'BCP Visa' });
  assert.equal(d.OTRA, undefined);

  assert.deepEqual(L.validarDatosTarjeta({ id: 'IBK_P', digitos: ' 9034 ', red: 'MasterCard', nombre: 'Interbank PersonaA' }),
    { tarjeta: { id: 'IBK_P', digitos: '9034', red: 'mastercard', nombre: 'Interbank PersonaA' } });
  assert.deepEqual(L.validarDatosTarjeta({ id: 'RIPLEY' }), { tarjeta: { id: 'RIPLEY', digitos: '', red: '', nombre: '' } });
  assert.equal(L.validarDatosTarjeta({ id: 'VISA' }).error, 'La tarjeta no es válida (SIP, IBK_P, IBK_B, BCP, RIPLEY).');
  assert.equal(L.validarDatosTarjeta({ id: 'SIP', digitos: '123' }).error, 'Los últimos dígitos deben ser 4 números.');
  assert.equal(L.validarDatosTarjeta({ id: 'SIP', red: 'diners' }).error, 'La red debe ser visa o mastercard.');
  assert.equal(L.validarDatosTarjeta({ id: 'SIP', nombre: 'a'.repeat(27) }).error, 'El nombre de la tarjeta es muy largo (máximo 26 caracteres).');
  assert.equal(L.validarDatosTarjeta(null).error, 'La tarjeta no es válida (SIP, IBK_P, IBK_B, BCP, RIPLEY).');
});

test('textoGastoGrande: frase corta con el primer nombre, el monto y el medio', () => {
  const t = L.textoGastoGrande({ responsable: 'PersonaA', monto: 450, descripcion: 'Saga Falabella', medio: 'TC BCP', concepto: 'Ropa y Calzado', fecha: '2026-11-06' });
  assert.equal(t.asunto, 'FinFamily: PersonaA registró S/ 450 en Saga Falabella (TC BCP)');
  assert.ok(t.cuerpo.includes('PersonaA registró S/ 450 en Saga Falabella (TC BCP).'));
  assert.ok(t.cuerpo.includes('Concepto: Ropa y Calzado.'));
  assert.ok(t.cuerpo.includes('Fecha: 06/11/2026.'));
  assert.ok(t.cuerpo.includes('Si fue un error'));
  const minimo = L.textoGastoGrande({ responsable: 'PersonaB', monto: 1234.5 });
  assert.equal(minimo.asunto, 'FinFamily: PersonaB registró S/ 1,234.50 en un gasto');
  assert.ok(!minimo.cuerpo.includes('Concepto:'));
});

test('alertasPresupuesto: umbrales 80 y 100 por línea de gastos, una vez cada uno', () => {
  const presupuesto = {
    etiquetaMes: 'nov-26',
    filas: [
      { concepto: 'Ingresos - Uno', seccion: 'ingresos', monto: 1000 },
      { concepto: 'Luz', seccion: 'gastos', monto: 90 },
      { concepto: 'Internet', seccion: 'gastos', monto: 100 },
      { concepto: 'Alquiler', seccion: 'gastos', monto: 500 },
      { concepto: 'TC BCP', seccion: 'gastos', monto: 300 },
      { concepto: 'Ahorro Casa', seccion: 'ahorros', monto: 60 },
      { concepto: 'Agua', seccion: 'gastos', monto: 0 }
    ]
  };
  const consumos = [
    { fecha: '2026-11-03', concepto: 'luz', monto: 50 },        // 50 + 25 = 75 -> 83 %
    { fecha: '2026-11-05', concepto: 'Luz', monto: 25 },
    { fecha: '2026-11-04', concepto: 'Internet', monto: 120 },  // 120 %
    { fecha: '2026-10-04', concepto: 'Alquiler', monto: 500 },  // otro mes
    { fecha: '2026-11-02', concepto: 'Alquiler', monto: 100 },  // 20 %
    { fecha: '2026-11-02', concepto: 'Agua', monto: 30 },       // planeado 0: se ignora
    { fecha: '', concepto: 'Internet', monto: 999 }             // sin fecha: se ignora
  ];
  const a = L.alertasPresupuesto(presupuesto, consumos, '2026-11', []);
  assert.deepEqual(a, [
    { clave: '2026-11|internet|100', concepto: 'Internet', planeado: 100, real: 120, porcentaje: 120, umbral: 100 },
    { clave: '2026-11|luz|80', concepto: 'Luz', planeado: 90, real: 75, porcentaje: 83, umbral: 80 }
  ]);
  assert.deepEqual(L.clavesCubiertas(a).sort(), ['2026-11|internet|100', '2026-11|internet|80', '2026-11|luz|80']);
  assert.deepEqual(L.alertasPresupuesto(presupuesto, consumos, '2026-11', L.clavesCubiertas(a)), []);
  // Avisado el 80 de Luz, al llegar al 100 avisa de nuevo (solo ese).
  const mas = consumos.concat([{ fecha: '2026-11-06', concepto: 'Luz', monto: 15 }]);
  assert.deepEqual(L.alertasPresupuesto(presupuesto, mas, '2026-11', L.clavesCubiertas(a)).map((x) => x.clave), ['2026-11|luz|100']);
  assert.deepEqual(L.alertasPresupuesto(null, consumos, '2026-11', []), []);

  const t = L.textoAlertasPresupuesto(a, 'nov-26');
  assert.equal(t.asunto, 'FinFamily: 2 líneas del presupuesto están por agotarse');
  assert.ok(t.cuerpo.includes('para nov-26'));
  assert.ok(t.cuerpo.includes('• Internet: llevan S/ 120 de S/ 100 (120 %), ya se pasó.'));
  assert.ok(t.cuerpo.includes('• Luz: llevan S/ 75 de S/ 90 (83 %), está cerca del límite.'));
  assert.equal(L.textoAlertasPresupuesto([a[1]]).asunto, 'FinFamily: Luz va en 83 % del presupuesto');
  assert.equal(L.textoAlertasPresupuesto([]), null);
});

test('esLunes y resumenSemanal: semana anterior (lunes a domingo), por persona y top 3 conceptos', () => {
  assert.equal(L.esLunes('2026-11-09'), true);
  assert.equal(L.esLunes('2026-11-10'), false);
  assert.equal(L.esLunes('no'), false);
  const consumos = [
    { fecha: '2026-11-01', responsable: 'PersonaB', concepto: 'Delivery', monto: 99 },        // domingo anterior: fuera
    { fecha: '2026-11-02', responsable: 'PersonaA', concepto: 'Supermercado', monto: 100 },
    { fecha: '2026-11-04', responsable: 'PersonaB', concepto: 'Delivery', monto: 40 },
    { fecha: '2026-11-06', responsable: 'PersonaB', concepto: 'Mascotas', monto: 30.5 },
    { fecha: '2026-11-08', responsable: 'PersonaA', concepto: 'Pasajes', monto: 10 },   // domingo: dentro
    { fecha: '2026-11-08', responsable: '', concepto: '', monto: 5 },
    { fecha: '2026-11-09', responsable: 'PersonaA', concepto: 'Desayuno', monto: 12 }   // hoy lunes: fuera
  ];
  // Da igual si se corre el lunes o el miércoles: siempre es la semana anterior completa.
  for (const hoy of ['2026-11-09', '2026-11-11']) {
    const s = L.resumenSemanal(consumos, hoy);
    assert.equal(s.desde, '2026-11-02');
    assert.equal(s.hasta, '2026-11-08');
    assert.equal(s.total, 185.5);
    assert.equal(s.consumos, 5);
    assert.deepEqual(s.porPersona, [{ nombre: 'PersonaA', total: 110 }, { nombre: 'PersonaB', total: 70.5 }, { nombre: 'Sin responsable', total: 5 }]);
    assert.deepEqual(s.conceptos, [{ concepto: 'Supermercado', monto: 100 }, { concepto: 'Delivery', monto: 40 }, { concepto: 'Mascotas', monto: 30.5 }]);
  }
  assert.equal(L.resumenSemanal(consumos, 'x'), null);
  assert.deepEqual(L.resumenSemanal([], '2026-11-09').porPersona, []);
});

test('textoResumenSemanal: cuerpo claro con presupuesto y vencimientos; semana sin gastos', () => {
  const semana = L.resumenSemanal([
    { fecha: '2026-11-03', responsable: 'PersonaA', concepto: 'Luz', monto: 75 },
    { fecha: '2026-11-04', responsable: 'PersonaB', concepto: 'Delivery', monto: 25 }
  ], '2026-11-09');
  const t = L.textoResumenSemanal(semana, { etiquetaMes: 'nov-26', planeado: 775.5, gastado: 800 },
    [{ nombre: 'TC SIP', vence: '2026-11-09', monto: 40.5 }]);
  assert.equal(t.asunto, 'FinFamily: resumen de la semana (S/ 100)');
  assert.ok(t.cuerpo.includes('(del 02/11/2026 al 08/11/2026)'));
  assert.ok(t.cuerpo.includes('Gastaron en total S/ 100 en 2 gastos.'));
  assert.ok(t.cuerpo.includes('• PersonaA: S/ 75'));
  assert.ok(t.cuerpo.includes('• Luz: S/ 75'));
  assert.ok(t.cuerpo.includes('Presupuesto de nov-26: llevan S/ 800 de S/ 775.50. Se pasaron en S/ 24.50.'));
  assert.ok(t.cuerpo.includes('• TC SIP: S/ 40.50 vence el 09/11/2026'));

  const vacio = L.textoResumenSemanal(L.resumenSemanal([], '2026-11-09'), null, []);
  assert.equal(vacio.asunto, 'FinFamily: resumen de la semana (S/ 0)');
  assert.ok(vacio.cuerpo.includes('La semana pasada no registraron gastos.'));
  assert.ok(!vacio.cuerpo.includes('Presupuesto'));
  assert.ok(!vacio.cuerpo.includes('Próximos pagos'));
});

test('proximosVencimientos, eventosDeVencimiento y planCalendario', () => {
  const resumen = L.resumenTarjetas(todosLosConsumos(), '2026-11-04', false);
  const prox = L.proximosVencimientos(resumen);
  assert.deepEqual(prox.map((p) => [p.tarjeta, p.vence, p.monto]), [
    ['SIP', '2026-11-03', 20], ['IBK_B', '2026-11-20', 145], ['IBK_P', '2026-12-15', 100]
  ]);
  const eventos = L.eventosDeVencimiento(resumen);
  assert.deepEqual(eventos[0], {
    clave: 'SIP|2026-11-03', tarjeta: 'SIP', vence: '2026-11-03', monto: 20,
    titulo: 'Vence TC SIP: S/ 20',
    descripcion: 'Pago de TC SIP por S/ 20. Cuando paguen, márquenlo en FinFamily.'
  });
  assert.equal(eventos.length, 3, 'Ripley (sin fecha) y hormiga no generan evento');

  const plan = L.planCalendario(eventos, { 'SIP|2026-11-03': 'ev1', 'BCP|2026-10-20': 'ev9' });
  assert.deepEqual(plan.crear.map((e) => e.clave), ['IBK_B|2026-11-20', 'IBK_P|2026-12-15']);
  assert.deepEqual(plan.actualizar.map((a) => [a.evento.clave, a.idEvento]), [['SIP|2026-11-03', 'ev1']]);
  assert.deepEqual(plan.borrar, [{ clave: 'BCP|2026-10-20', idEvento: 'ev9' }]);
  assert.deepEqual(L.planCalendario([], {}), { crear: [], actualizar: [], borrar: [] });
  assert.deepEqual(L.RECORDATORIOS_CALENDARIO, [3780, 900]);
});

// ===========================================================================
// Motor 1.5: líneas del presupuesto (posición, nombres, conceptos por línea)
// ===========================================================================

// Presupuesto sintético con la forma de la hoja real: ingresos, TOTAL INGRESOS, gastos, ahorros, totales.
function presupuestoReal() {
  const display = [
    ['PRESUPUESTO FAMILIAR', '', '', '', '', ''],
    ['Concepto / Categoría', 'oct-26', 'nov-26', 'dic-26', '', 'ene-27'],
    ['Ingresos - PersonaA', '3500', '3500', '3500', '', '3500'],
    ['Ingresos - PersonaB', '1500', '1500', '1500', '', '1500'],
    ['Otros Ingresos / Adicionales', '0', '0', '0', '', '0'],
    ['TOTAL INGRESOS', '5000', '5000', '5000', '', '5000'],
    ['TC Interbank', '0', '0', '0', '', '0'],
    ['Alimentación (BCP-DEB-PE)', '800', '800', '800', '', '800'],
    ['Internet (IBK)', '100', '100', '100', '', '100'],
    ['Suscripciones (IBK/BCP/IBK)', '50', '50', '50', '', '50'],
    ['Remodelación (IBK-DEB-PE)', '0', '0', '0', '', '0'],
    ['Ahorro Casa', '300', '300', '300', '', '300'],
    ['Fondo de Emergencia', '100', '100', '100', '', '100'],
    ['TOTAL GASTOS', '1350', '1350', '1350', '', '1350'],
    ['TOTAL AHORROS', '400', '400', '400', '', '400'],
    ['SALDO / SUPERÁVIT FINAL', '3650', '3650', '3650', '', '3650'],
    ['Saldo Personal', '0', '0', '0', '', '0']
  ];
  const valores = display.map((f) => f.map((v, j) => (j > 0 && v !== '' ? Number(v) : v)));
  return { display, valores };
}

test('leerPresupuesto 1.5: informa las columnas de cada mes, la columna del concepto y las filas de totales', () => {
  const { display, valores } = presupuestoReal();
  const p = L.leerPresupuesto(display, valores, '2026-11');
  assert.deepEqual(p.columnas, { '2026-10': 2, '2026-11': 3, '2026-12': 4, '2027-01': 6 }, 'la columna vacía entre dic y ene no es un mes');
  assert.equal(p.colConcepto, 1);
  assert.deepEqual(p.filasTotales, { ingresos: 6, gastos: 14, ahorros: 15, saldo: 16, saldoPersonal: 17 });
  assert.deepEqual(p.filas.map((f) => [f.fila, f.seccion]), [[3, 'ingresos'], [4, 'ingresos'], [5, 'ingresos'], [7, 'gastos'], [8, 'gastos'],
    [9, 'gastos'], [10, 'gastos'], [11, 'gastos'], [12, 'ahorros'], [13, 'ahorros']]);
});

test('nombreLineaParaSeccion: en ahorros antepone "Ahorro " salvo que ya empiece con Ahorro o Fondo', () => {
  assert.equal(L.nombreLineaParaSeccion('Moto', 'ahorros'), 'Ahorro Moto');
  assert.equal(L.nombreLineaParaSeccion('  ahorro  viaje ', 'ahorros'), 'ahorro viaje');
  assert.equal(L.nombreLineaParaSeccion('Fondo Universidad', 'ahorros'), 'Fondo Universidad');
  assert.equal(L.nombreLineaParaSeccion('Moto', 'gastos'), 'Moto');
  assert.deepEqual(L.SECCIONES_PRESUPUESTO, ['ingresos', 'gastos', 'ahorros']);
});

test('posicionNuevaLinea: antes de la última línea del bloque, y con bloque vacío antes del total o del siguiente bloque', () => {
  const { display, valores } = presupuestoReal();
  const p = L.leerPresupuesto(display, valores, '2026-11');
  assert.equal(L.posicionNuevaLinea(p, 'ingresos'), 5, 'antes de "Otros Ingresos"');
  assert.equal(L.posicionNuevaLinea(p, 'gastos'), 11, 'antes de "Remodelación"');
  assert.equal(L.posicionNuevaLinea(p, 'ahorros'), 13, 'antes de "Fondo de Emergencia"');
  // Sin ahorros: la nueva de gastos va antes de la última de gastos; una de ahorros, antes de TOTAL GASTOS.
  const sinAhorros = { filas: p.filas.filter((f) => f.seccion !== 'ahorros'), filasTotales: p.filasTotales };
  assert.equal(L.posicionNuevaLinea(sinAhorros, 'gastos'), 11);
  assert.equal(L.posicionNuevaLinea(sinAhorros, 'ahorros'), 14);
  // Sin gastos: antes de la primera de ahorros.
  const sinGastos = { filas: p.filas.filter((f) => f.seccion !== 'gastos'), filasTotales: p.filasTotales };
  assert.equal(L.posicionNuevaLinea(sinGastos, 'gastos'), 12);
  assert.equal(L.posicionNuevaLinea({ filas: [], filasTotales: { ingresos: 6 } }, 'ingresos'), 6);
  assert.equal(L.posicionNuevaLinea(null, 'gastos'), 0);
});

test('mapaLineasDesde: sanea el JSON guardado (claves normalizadas, listas limpias)', () => {
  assert.deepEqual(L.mapaLineasDesde(null), {});
  assert.deepEqual(L.mapaLineasDesde('{roto'), {});
  assert.deepEqual(L.mapaLineasDesde('[1,2]'), {});
  assert.deepEqual(L.mapaLineasDesde(JSON.stringify({ 'Alimentación (BCP-DEB-PE)': ['Supermercado', ' Desayuno ', '', 'Supermercado'], 'Servicios': 'no', '': ['x'] })),
    { 'alimentacion (bcp-deb-pe)': ['Supermercado', 'Desayuno'] });
  assert.equal(L.claveLinea('  Alimentación  (BCP-DEB-PE) '), 'alimentacion (bcp-deb-pe)');
});

test('conceptosDeLinea: lo guardado manda; si no hay, la sugerencia inicial filtrada por Configuración', () => {
  const config = ['Supermercado', 'Desayuno', 'Limpieza', 'Salud y Farmacia', 'Delivery'];
  assert.deepEqual(L.conceptosDeLinea({}, 'Alimentación (BCP-DEB-PE)', config), { conceptos: ['Supermercado', 'Desayuno'], sugerido: true });
  assert.deepEqual(L.conceptosDeLinea({}, 'Alacena (SIP)', config), { conceptos: [], sugerido: false }, 'Chucherías y Matanza no están en Configuración');
  assert.deepEqual(L.conceptosDeLinea({}, 'Alacena (SIP)', null), { conceptos: ['Chucherías', 'Matanza'], sugerido: true }, 'sin lista no filtra');
  assert.deepEqual(L.conceptosDeLinea({}, 'Suscripciones (IBK/BCP/IBK)', null).conceptos, ['Suscripciones']);
  assert.deepEqual(L.conceptosDeLinea({}, 'Suscripciones…', null).conceptos, ['Suscripciones']);
  assert.deepEqual(L.conceptosDeLinea({}, 'Salud', config), { conceptos: ['Salud y Farmacia'], sugerido: true });
  assert.deepEqual(L.conceptosDeLinea({}, 'Servicios', config), { conceptos: [], sugerido: false });
  assert.deepEqual(L.conceptosDeLinea({}, 'TC BCP', config), { conceptos: [], sugerido: false });
  const mapa = { 'alimentacion (bcp-deb-pe)': ['Delivery'], 'salud': [] };
  assert.deepEqual(L.conceptosDeLinea(mapa, 'Alimentación (BCP-DEB-PE)', config), { conceptos: ['Delivery'], sugerido: false });
  assert.deepEqual(L.conceptosDeLinea(mapa, 'Salud', config), { conceptos: [], sugerido: false }, 'guardado vacío gana a la sugerencia');
  for (const k of Object.keys(L.ASIGNACION_INICIAL)) assert.ok(L.ASIGNACION_INICIAL[k].length > 0, k);
});

test('asignarConceptosEnMapa, renombrarLineaEnMapa y quitarLineaDeMapa: un concepto vive en una sola línea', () => {
  let mapa = L.asignarConceptosEnMapa({}, 'Alimentación (BCP-DEB-PE)', ['Supermercado', 'Desayuno', 'Delivery', 'Supermercado']);
  assert.deepEqual(mapa, { 'alimentacion (bcp-deb-pe)': ['Supermercado', 'Desayuno', 'Delivery'] });
  mapa = L.asignarConceptosEnMapa(mapa, 'Alacena (SIP)', ['delivery', 'Chucherías']);
  assert.deepEqual(mapa, { 'alimentacion (bcp-deb-pe)': ['Supermercado', 'Desayuno'], 'alacena (sip)': ['delivery', 'Chucherías'] }, 'Delivery se movió');
  mapa = L.asignarConceptosEnMapa(mapa, 'Alacena (SIP)', []);
  assert.deepEqual(mapa['alacena (sip)'], []);
  const renombrado = L.renombrarLineaEnMapa(mapa, 'Alimentación (BCP-DEB-PE)', 'Alimentación');
  assert.deepEqual(Object.keys(renombrado).sort(), ['alacena (sip)', 'alimentacion']);
  assert.deepEqual(renombrado.alimentacion, ['Supermercado', 'Desayuno']);
  assert.deepEqual(L.renombrarLineaEnMapa(mapa, 'No existe', 'Otra'), mapa);
  assert.deepEqual(L.quitarLineaDeMapa(renombrado, 'ALIMENTACIÓN'), { 'alacena (sip)': [] });
  assert.deepEqual(L.quitarLineaDeMapa(null, 'x'), {});
});

test('gastoRealDeLinea: guardado = solo los asignados; sugerido o sin asignar = asignados + nombre de la línea', () => {
  const consumos = [
    { fecha: '2026-11-03', concepto: 'Supermercado', monto: 100 },
    { fecha: '2026-11-04', concepto: 'Desayuno', monto: 20 },
    { fecha: '2026-11-05', concepto: 'Alimentación (BCP-DEB-PE)', monto: 7 },
    { fecha: '2026-11-06', concepto: 'Delivery', monto: 30 },
    { fecha: '2026-10-06', concepto: 'Supermercado', monto: 999 },
    { fecha: '2026-11-07', concepto: 'Servicios', monto: 55 }
  ];
  const linea = { concepto: 'Alimentación (BCP-DEB-PE)', seccion: 'gastos', monto: 800 };
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', {}, null), 127, 'sugerido: Supermercado + Desayuno + el propio nombre');
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', { 'alimentacion (bcp-deb-pe)': ['Supermercado'] }, null), 100, 'guardado: solo Supermercado');
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', { 'alimentacion (bcp-deb-pe)': ['Supermercado', 'Delivery'] }, null), 130);
  assert.equal(L.gastoRealDeLinea({ concepto: 'Servicios' }, consumos, '2026-11', {}, null), 55, 'sin asignación: nombre igual al concepto');
  assert.equal(L.gastoRealDeLinea({ concepto: 'Pasajes' }, consumos, '2026-11', {}, null), 0);
});

test('gastoRealDeLinea: lo pagado con tarjeta de crédito no descuenta de la línea (ya cuenta en la línea TC)', () => {
  const consumos = [
    { fecha: '2026-11-03', concepto: 'Supermercado', monto: 100, deTarjeta: true },
    { fecha: '2026-11-04', concepto: 'Supermercado', monto: 40, deTarjeta: false },
    { fecha: '2026-11-05', concepto: 'Supermercado', monto: 25, deTarjeta: false, origen: 'P:Pedro' }
  ];
  const linea = { concepto: 'Alacena (SIP)', seccion: 'gastos', monto: 365 };
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', { 'alacena (sip)': ['Supermercado'] }, null), 40);
});

test('alertasPresupuesto con mapa: el gasto real de la línea sale de sus conceptos asignados', () => {
  const presupuesto = { filas: [
    { concepto: 'Alimentación (BCP-DEB-PE)', seccion: 'gastos', monto: 800 },
    { concepto: 'Salud', seccion: 'gastos', monto: 100 }
  ] };
  const consumos = [
    { fecha: '2026-11-03', concepto: 'Supermercado', monto: 600 },
    { fecha: '2026-11-04', concepto: 'Desayuno', monto: 100 },
    { fecha: '2026-11-04', concepto: 'Salud y Farmacia', monto: 85 }
  ];
  const a = L.alertasPresupuesto(presupuesto, consumos, '2026-11', [], {}, null);
  assert.deepEqual(a.map((x) => [x.concepto, x.real, x.porcentaje, x.umbral]), [['Alimentación (BCP-DEB-PE)', 700, 87, 80], ['Salud', 85, 85, 80]]);
  const guardado = { 'alimentacion (bcp-deb-pe)': ['Supermercado'], 'salud': [] };
  const b = L.alertasPresupuesto(presupuesto, consumos, '2026-11', [], guardado, null);
  assert.deepEqual(b, [], 'Alimentación 600/800 = 75 % no avisa; Salud con lista guardada vacía solo cuenta su propio nombre (0)');
  const c = L.alertasPresupuesto(presupuesto, consumos, '2026-11', [], { 'salud': ['Salud y Farmacia'] }, null);
  assert.deepEqual(c.map((x) => [x.concepto, x.real]), [['Alimentación (BCP-DEB-PE)', 700], ['Salud', 85]]);
});

// ===========================================================================
// Motor 1.5.1: íconos de los tipos de gasto
// ===========================================================================

test('iconoValido: 1 a 30 caracteres a-z 0-9 - _', () => {
  for (const ok of ['carrito', 'a', 'moto-2_x', 'x'.repeat(30), '0']) assert.equal(L.iconoValido(ok), true, ok);
  for (const mal of ['', 'Carrito', 'con espacio', 'ñ', 'x'.repeat(31), 'a.b', null, undefined, 5]) assert.equal(L.iconoValido(mal), false, String(mal));
});

test('iconosDesde e iconosConNombres: sanean lo guardado y lo devuelven con los nombres de Configuración', () => {
  assert.deepEqual(L.iconosDesde(null), {});
  assert.deepEqual(L.iconosDesde('{roto'), {});
  assert.deepEqual(L.iconosDesde('[1]'), {});
  const mapa = L.iconosDesde(JSON.stringify({ 'Supermercado': ' Carrito ', 'Salud y Farmacia': 'cruz', 'Luz': 'mal icono', '': 'x', 'Delivery': '' }));
  assert.deepEqual(mapa, { supermercado: 'carrito', 'salud y farmacia': 'cruz' });
  assert.deepEqual(L.iconosConNombres(mapa, ['Supermercado', 'Salud y Farmacia', 'Luz']), { Supermercado: 'carrito', 'Salud y Farmacia': 'cruz' });
  assert.deepEqual(L.iconosConNombres(mapa, ['Luz']), {});
  assert.deepEqual(L.iconosConNombres(null, ['Luz']), {});
  assert.deepEqual(L.iconosConNombres(mapa, null), {});
});

test('el lector normaliza destinatarios sintéticos sin nombres personales incorporados', () => {
  assert.equal(L.medioSugerido('DEBITO_BCP', 'PLIN-CONTACTO FICTICIO'), 'PLIN');
  assert.equal(L.comercioLegible('PLIN-CONTACTO FICTICIO'), 'Plin a Contacto Ficticio');
  assert.equal(L.comercioLegible('YAPE-CUENTA DEMO'), 'Yape a Cuenta Demo');
});


// ---------- 1.9.1: una línea con sufijo entre paréntesis cuenta el concepto con su nombre corto ----------

test('1.9.1: "Remodelación (IBK-DEB-PE)" suma los gastos del concepto "Remodelación" y avisa al 80 %', () => {
  const linea = { concepto: 'Remodelación (IBK-DEB-PE)', seccion: 'gastos', monto: 1200 };
  const consumos = [
    { fecha: '2026-12-03', concepto: 'Remodelación', monto: 700 },
    { fecha: '2026-12-10', concepto: 'remodelacion', monto: 300 },
    { fecha: '2026-11-28', concepto: 'Remodelación', monto: 500 }, // otro mes: no cuenta
    { fecha: '2026-12-05', concepto: 'Supermercado', monto: 80 }
  ];
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-12', {}, ['Remodelación', 'Supermercado']), 1000);
  const avisos = L.alertasPresupuesto({ filas: [linea] }, consumos, '2026-12', [], {}, ['Remodelación', 'Supermercado']);
  assert.deepEqual(avisos.map((a) => [a.concepto, a.porcentaje, a.umbral]), [['Remodelación (IBK-DEB-PE)', 83, 80]]);
  // Si se asignan otros conceptos a mano a la línea, mandan solo esos.
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-12', { 'remodelacion (ibk-deb-pe)': ['Supermercado'] }, ['Remodelación', 'Supermercado']), 80);
});


// ---------- 1.9.3: el presupuesto de un mes se gasta desde el día de cobro (fin de mes) ----------

test('1.9.3: cicloDelMes y mesDelCiclo siguen el cobro de fin de mes', () => {
  assert.deepEqual(L.cicloDelMes('2026-11'), { desde: '2026-11-30', hasta: '2026-12-30' });
  assert.deepEqual(L.cicloDelMes('2026-10'), { desde: '2026-10-31', hasta: '2026-11-29' });
  assert.deepEqual(L.cicloDelMes('2026-12'), { desde: '2026-12-31', hasta: '2027-01-30' });
  assert.deepEqual(L.cicloDelMes('2027-01'), { desde: '2027-01-31', hasta: '2027-02-27' });
  assert.equal(L.mesDelCiclo('2026-11-10'), '2026-10');
  assert.equal(L.mesDelCiclo('2026-11-29'), '2026-10');
  assert.equal(L.mesDelCiclo('2026-11-30'), '2026-11');
  assert.equal(L.mesDelCiclo('2027-01-05'), '2026-12');
});

test('1.9.3: con el ciclo, lo gastado del 1 al 29 de noviembre cuenta para el presupuesto de octubre', () => {
  const linea = { concepto: 'Alacena (SIP)', seccion: 'gastos', monto: 100 };
  const consumos = [
    { fecha: '2026-11-05', concepto: 'Alacena', monto: 50 },
    { fecha: '2026-11-30', concepto: 'Alacena', monto: 30 },
    { fecha: '2026-10-31', concepto: 'Alacena', monto: 40 }
  ];
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-10', {}, ['Alacena'], L.cicloDelMes('2026-10')), 90);
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', {}, ['Alacena'], L.cicloDelMes('2026-11')), 30);
  // Sin rango sigue contando por mes calendario.
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', {}, ['Alacena']), 80);
});

test('validarDatosTarjeta y datosTarjetasDesde guardan el diseño del plástico (1.20.1)', () => {
  assert.deepEqual(L.validarDatosTarjeta({ id: 'SIP', red: 'visa', diseno: 'sip-negra' }), { tarjeta: { id: 'SIP', digitos: '', red: 'visa', nombre: '', diseno: 'sip-negra' } });
  assert.deepEqual(L.validarDatosTarjeta({ id: 'BCP', diseno: 'propio' }).tarjeta.diseno, 'propio');
  assert.equal(L.validarDatosTarjeta({ id: 'BCP', diseno: '<script>' }).error, 'El diseño de la tarjeta no es válido.');
  assert.equal('diseno' in L.validarDatosTarjeta({ id: 'BCP', diseno: '' }).tarjeta, false);
  const d = L.datosTarjetasDesde(JSON.stringify({ IBK_P: { digitos: '1234', diseno: 'ibk-oro' }, BCP: { diseno: 'MAL DISEÑO' } }));
  assert.equal(d.IBK_P.diseno, 'ibk-oro');
  assert.equal('diseno' in d.BCP, false);
});

test('tarjetas de débito (1.21): medios, lector BCP y líneas solo con fondo común', () => {
  const deb = L.debitosDesde(JSON.stringify([{ id: 'BCP_P', banco: 'BCP', titular: 'Pedro Nicolás' }, { id: 'SIP_B', banco: 'Sip', titular: 'Britney', activa: false }, { id: 'malo id', banco: 'X' }]));
  assert.equal(deb.length, 2);
  const medios = L.mediosDesde(null, deb);
  const td = medios.find((m) => m.id === 'TD_BCP_P');
  assert.equal(td.etiqueta, 'Débito BCP · Pedro');
  assert.equal(td.hoja, 'Gastos Hormiga');
  assert.equal(td.tipo, 'debito');
  assert.equal(medios.some((m) => m.id === 'TD_SIP_B'), false);
  const cat = []; cat.debitos = deb;
  assert.equal(L.medioSugerido('DEBITO_BCP', 'PLAZA VEA', cat, 'Pedro'), 'TD_BCP_P');
  assert.equal(L.medioSugerido('DEBITO_BCP', 'PLAZA VEA', cat, 'Britney'), 'EFECTIVO');
  assert.equal(L.idDebito('Interbank', 'Britney', deb), 'INTERBANK_B');
  assert.equal(L.idDebito('BCP', 'Pedro', deb), 'BCP_P2');
  assert.equal(L.validarDebito({ banco: 'B' }).error, 'Escribe el banco (2 a 20 letras).');
  const linea = { concepto: 'Alimentación (BCP-DEB-PE)' };
  const consumos = [
    { fecha: '2026-11-05', concepto: 'Alimentación', monto: 100, origen: '' },
    { fecha: '2026-11-06', concepto: 'Alimentación', monto: 40, origen: 'P:Pedro' },
    { fecha: '2026-11-07', concepto: 'Alimentación', monto: 7, origen: 'A:Ahorro Casa' },
  ];
  assert.equal(L.gastoRealDeLinea(linea, consumos, '2026-11', {}, ['Alimentación']), 100);
});

test('recordatoriosAnotar: 3 días sin anotar, solo a quien ya anotó alguna vez y una vez por racha', () => {
  const usuarios = { 'a@x.test': { nombre: 'Ana Pérez' }, 'b@x.test': { nombre: 'Beto' }, 'c@x.test': { nombre: 'Caro' } };
  const consumos = [
    { responsable: 'Ana', fecha: '2026-11-01' }, { responsable: 'Ana', fecha: '2026-11-07' },
    { responsable: 'Beto', fecha: '2026-11-09' }, { responsable: 'Beto', fecha: '2026-11-20' } // futuro: no cuenta
  ];
  assert.deepEqual(L.recordatoriosAnotar(consumos, usuarios, '2026-11-10', {}),
    [{ correo: 'a@x.test', nombre: 'Ana', ultima: '2026-11-07', dias: 3 }]);
  assert.deepEqual(L.recordatoriosAnotar(consumos, usuarios, '2026-11-09', {}), []);
  assert.deepEqual(L.recordatoriosAnotar(consumos, usuarios, '2026-11-12', { 'a@x.test': '2026-11-07' }).map((r) => r.correo), ['b@x.test']);
  const t = L.textoRecordatorioAnotar({ nombre: 'Ana', ultima: '2026-11-07', dias: 3 });
  assert.equal(t.asunto, 'FinFamily: Ana, ¿anotamos tus gastos?');
  assert.match(t.cuerpo, /^Hola Ana, hace 3 días que no anotas ningún gasto \(el último fue el 07\/11\/2026\)\./);
  assert.match(t.cuerpo, /https:\/\/pedronicolas98\.github\.io\/finfamily-app\/gasto\.html/);
});

test('1.23.0: pagos de servicios: qué correo cuenta, a qué línea va y sin contar dos veces', () => {
  assert.deepEqual(L.palabrasValidas('Luz del Sur, ENEL ,enel, a'), ['luz del sur', 'enel']);
  assert.deepEqual(L.palabrasDeFijo('Plan móvil (BCP/IBK)', {}), ['entel', 'claro', 'movistar', 'bitel']);
  assert.deepEqual(L.palabrasDeFijo('Servicios', {}), ['luz del sur', 'enel', 'sedapal', 'calidda']);
  assert.deepEqual(L.palabrasDeFijo('Alacena (SIP)', {}), []);
  assert.deepEqual(L.palabrasDeFijo('Internet', { internet: { concepto: 'Internet', dia: 0, palabras: [] } }), [], 'el usuario lo apagó');

  const entel = L.pagoDeServicioDeCorreo({ remitente: 'atencionclientes@entel.example', asunto: 'Hola, Te enviamos el detalle de tu solicitud',
    cuerpo: 'Se realizó con éxito el cobro de tu recibo a través del Débito Automático Fecha de cobro Cuenta afiliada 13/10/2026 1.00 Importe debitado Número de tarjeta S/ 41.30 4000******1111',
    fechaISO: '2026-10-13' });
  assert.equal(entel.monto, 41.30);
  assert.equal(entel.fecha, '2026-10-13');
  assert.equal(L.pagoDeServicioDeCorreo({ asunto: 'Tu recibo digital Entel', cuerpo: 'Total a pagar S/ 28.40', fechaISO: '2026-11-05' }), null, 'un recibo por pagar no cuenta');
  assert.equal(L.pagoDeServicioDeCorreo({ asunto: 'Detalle', cuerpo: '¡La modificación de tarjeta para el Débito Automático se realizó con éxito!', fechaISO: '2026-10-31' }), null);
  assert.equal(L.pagoDeServicioDeCorreo({ asunto: 'Constancia de pago', cuerpo: 'Tarjeta de crédito Visa Moneda y monto S/ 114.00', fechaISO: '2026-11-08' }), null, 'pagar la tarjeta no es un servicio');

  const lineas = [{ clave: 'plan movil', palabras: ['entel', 'claro'] }, { clave: 'internet', palabras: ['wow', 'claro hogar'] }];
  assert.deepEqual(L.lineaDePago(entel.texto, lineas), { clave: 'plan movil', palabra: 'entel' });
  assert.deepEqual(L.lineaDePago('pago claro hogar s/ 80', lineas), { clave: 'internet', palabra: 'claro hogar' }, 'gana la palabra más larga');
  assert.equal(L.lineaDePago('pago en dentelandia', lineas), null, 'solo palabras completas');
  assert.equal(L.sumaPagosFijo([{ fecha: '2026-11-13', monto: 41.30 }, { fecha: '2026-11-13', monto: 41.30 }, { fecha: '2026-11-14', monto: 28.40 }]), 69.7);
  assert.equal(L.textoPagadoPorCorreo('2026-11-13'), 'Pagado el 13/11/2026 · automático (correo)');
});

test('1.25.0: cobros aprendidos (dos recibos de Entel son dos cobros) y subidas de precio', () => {
  const reg = { meses: {
    '2026-09': { 'plan movil': [{ fecha: '2026-10-13', monto: 41.30, de: 'entel' }, { fecha: '2026-10-13', monto: 41.30, de: 'entel' }, { fecha: '2026-10-05', monto: 28.40, de: 'entel' }] },
    '2026-10': { 'plan movil': [{ fecha: '2026-11-12', monto: 38.5, de: 'entel' }] }
  } };
  // 1.27.0: un recibo visto una sola vez (el de S/ 28.40) todavía no es un cobro que se repite.
  assert.deepEqual(L.cobrosAprendidos(reg).map((c) => [c.de, c.dia, c.monto, c.veces]), [['entel', 12, 38.5, 2]]);
  // 1.25.2: si no se ve hace más de 45 días, ya no se espera.
  assert.deepEqual(L.cobrosAprendidos(reg, '2027-01-15').map((c) => c.dia), []);
  const antes = reg.meses['2026-09']['plan movil'];
  assert.equal(L.subidaDePrecio(antes, { fecha: '2026-11-12', monto: 38.5 }), null, 'S/ 0.56 es menos del 3 %');
  assert.deepEqual(JSON.parse(JSON.stringify(L.subidaDePrecio(antes, { fecha: '2026-11-12', monto: 49.30 }))), { antes: 41.30, fechaAntes: '2026-10-13', ahora: 49.30, dif: 8 });
  assert.equal(L.subidaDePrecio(antes, { fecha: '2026-11-05', monto: 28.40 }), null, 'el otro recibo no subió');
  assert.equal(L.subidaDePrecio(antes, { fecha: '2026-10-20', monto: 50 }), null, 'muy cerca del anterior: no se compara');
  const t = L.textoSubidaPrecio({ de: 'entel', linea: 'Plan móvil', antes: 41.30, fechaAntes: '2026-10-13', ahora: 49.30, dif: 8 });
  assert.equal(t.asunto, 'FinFamily: Entel subió S/ 8');
  assert.match(t.cuerpo, /Entel cobró S\/ 49\.30\. La vez anterior \(13\/10\/2026\) fueron S\/ 41\.30\./);
  assert.equal(L.textoCobrosProximos([{ de: 'entel', monto: 41.30, fecha: '2026-12-13', linea: 'Plan móvil' }]).asunto, 'FinFamily: en 2 días toca Entel');
});

test('1.25.1: un recibo por pagar que invita al débito automático no cuenta; el pie con "YouTube" no confunde la empresa', () => {
  assert.equal(L.pagoDeServicioDeCorreo({ remitente: 'Recibo Claro <recibo@claro.example>', asunto: 'Recibo Claro - Octubre 90010',
    cuerpo: 'Revisa el detalle en tu recibo adjunto. El monto es S/ 37.45. Afíliate al débito automático.', fechaISO: '2026-09-22' }), null);
  assert.equal(L.pagoDeServicioDeCorreo({ remitente: 'WOW <noreply@wow.example>', asunto: '¡Tu Boleta WOW del mes!',
    cuerpo: 'Se realizó un débito automático S/ 800', fechaISO: '2026-09-23' }), null);
  assert.equal(L.pagoDeServicioDeCorreo({ remitente: 'iO <n@io.example>', asunto: 'Pagaste con éxito tu Tarjeta iO',
    cuerpo: 'Pagaste con éxito tu Tarjeta iO Pago exitoso S/ 300.00', fechaISO: '2026-09-30' }), null);
  const entel = L.pagoDeServicioDeCorreo({ remitente: 'atencionclientes@entel.example', asunto: 'Hola, Te enviamos el detalle de tu solicitud',
    cuerpo: 'Se realizó con éxito el cobro de tu recibo a través del Débito Automático Importe debitado S/ 41.30. Encuéntranos en Facebook Twitter Instagram YouTube',
    fechaISO: '2026-10-13' });
  const lineas = [{ clave: 'plan movil', palabras: ['entel'] }, { clave: 'suscripciones', palabras: ['youtube', 'netflix'] }];
  assert.deepEqual(L.lineaDePago(entel.texto, lineas), { clave: 'plan movil', palabra: 'entel' });
  assert.ok(!/youtube/.test(entel.textoCuerpo), 'el pie se corta');
  const yape = L.pagoDeServicioDeCorreo({ remitente: 'YAPE <notificaciones@yape.example>', asunto: 'Tu yapeo de servicio ha sido confirmado',
    cuerpo: '¡Tu servicio fue yapeado con éxito! Monto total S/ 120.00 Empresa: Luz del Sur', fechaISO: '2026-11-02' });
  assert.equal(L.lineaDePago(yape.texto, [{ clave: 'servicios', palabras: ['luz del sur'] }]), null);
  assert.deepEqual(L.lineaDePago(yape.textoCuerpo, [{ clave: 'servicios', palabras: ['luz del sur'] }]), { clave: 'servicios', palabra: 'luz del sur' });
});

test('1.26.0: apartados por línea: entra lo planeado de los meses pagados, sale lo gastado del fondo común; se acumula', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(L.cuentaDeLinea('Alimentación (BCP-DEB-PE)'))), { codigo: 'BCP-DEB-PE', banco: 'BCP', etiqueta: 'Débito BCP' });
  assert.equal(L.cuentaDeLinea('Alacena (SIP)').etiqueta, 'Sip');
  assert.equal(L.cuentaDeLinea('Suscripciones (IBK/BCP/IBK)'), null, 'varias cuentas: no');
  assert.equal(L.cuentaDeLinea('Pasajes'), null);
  const fila = (concepto, monto, pagado, conceptos) => ({ seccion: 'gastos', concepto, monto, pagado, conceptos, fila: 1 });
  const meses = [
    { mes: '2026-10', filas: [fila('Alacena (SIP)', 250, true, ['Supermercado']), fila('Internet (IBK)', 80, true, ['Internet y Telefonía']), fila('Pasajes', 276, true, ['Pasajes'])] },
    { mes: '2026-11', filas: [fila('Alacena (SIP)', 400, true, ['Supermercado'])] }
  ];
  const consumos = [
    { fecha: '2026-11-11', concepto: 'Supermercado', monto: 174, origen: '', deTarjeta: false },
    { fecha: '2026-11-12', concepto: 'Supermercado', monto: 50, origen: '', deTarjeta: true }, // con tarjeta de crédito: no
    { fecha: '2026-11-13', concepto: 'Supermercado', monto: 20, origen: 'P:PersonaA', deTarjeta: false }, // de su sobrante: no
    { fecha: '2026-10-20', concepto: 'Supermercado', monto: 99, origen: '', deTarjeta: false }, // antes del primer mes: no
    { fecha: '2026-12-05', concepto: 'Supermercado', monto: 30, origen: '', deTarjeta: false }
  ];
  const r = L.apartadosDeLineas(meses, consumos, { fijos: {}, ajustes: { 'alacena (sip)': { ajuste: 10 } } }, '2026-12-10');
  assert.equal(r.length, 1, 'Internet tiene empresas (es un recibo) y Pasajes no tiene cuenta');
  assert.deepEqual(JSON.parse(JSON.stringify(r[0])), { clave: 'alacena (sip)', linea: 'Alacena (SIP)', cuenta: 'Sip', conceptos: ['Supermercado'],
    depositado: 650, gastado: 204, ajuste: 10, saldo: 456, desde: '2026-10-31', meses: 2, sinMarcar: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(L.apartadosAjustesDesde('{"x":{"ajuste":"5.5"},"y":{"ajuste":"no"}}'))), { x: { ajuste: 5.5 } });
});

test('1.27.0: empresas por defecto con palabras completas, luz/agua/gas separadas, y una recarga no es una subida', () => {
  assert.deepEqual(L.palabrasDeFijo('Movilidad (BCP-DEB-PE)', {}), [], 'movilidad no es móvil');
  assert.deepEqual(L.palabrasDeFijo('Servicio de limpieza', {}), []);
  assert.deepEqual(L.palabrasDeFijo('Luz', {}), ['luz del sur', 'enel']);
  assert.deepEqual(L.palabrasDeFijo('Agua', {}), ['sedapal']);
  assert.deepEqual(L.palabrasDeFijo('Celulares', {}), ['entel', 'claro', 'movistar', 'bitel']);
  assert.equal(L.cuentaDeLinea('Compras (RIPLEY)'), null, 'tarjeta de crédito: no guarda plata');
  assert.equal(L.cuentaDeLinea('Compras (OH)'), null);
  assert.equal(L.cuentaDeLinea('Compras (RIPLEY-DEB)').etiqueta, 'Débito Ripley');
  assert.equal(L.subidaDePrecio([{ fecha: '2026-10-01', monto: 5 }], { fecha: '2026-11-01', monto: 39.9 }), null, 'una recarga y luego el recibo');
});

test('1.27.0: apartados avisan los meses sin marcar y se reconocen por tipo de gasto', () => {
  const fila = (concepto, monto, pagado, conceptos) => ({ seccion: 'gastos', concepto, monto, pagado, conceptos, fila: 1 });
  const meses = [
    { mes: '2026-09', filas: [fila('Alacena (SIP)', 100, true, ['Supermercado'])] },
    { mes: '2026-10', filas: [fila('Alacena (SIP)', 100, false, ['Supermercado'])] },
    { mes: '2026-11', filas: [fila('Alacena (SIP)', 100, false, ['Supermercado'])] }
  ];
  const r = L.apartadosDeLineas(meses, [{ fecha: '2026-10-20', concepto: 'Supermercado', monto: 70, origen: '', deTarjeta: false }], { fijos: {}, ajustes: {} }, '2026-12-10');
  assert.deepEqual(JSON.parse(JSON.stringify(r[0].sinMarcar)), ['2026-10'], 'octubre ya terminó y no se marcó; noviembre es el ciclo en curso');
  assert.equal(r[0].saldo, 30);
  const filas = meses[2].filas;
  assert.equal(L.lineaConApartadoDeConcepto(filas, 'supermercado', {}), 'Alacena (SIP)');
  assert.equal(L.lineaConApartadoDeConcepto(filas, 'Delivery', {}), null);
  assert.equal(L.lineaConApartadoDeConcepto([fila('Internet (IBK)', 80, true, ['Internet y Telefonía'])], 'Internet y Telefonía', {}), null, 'un recibo no es apartado');
});

test('1.27.0: el registro de pagos se poda a 8 días y a 100 ids', () => {
  const ids = {};
  for (let i = 0; i < 150; i++) ids['m:' + i] = '2026-11-' + String(10 + (i % 3)).padStart(2, '0');
  ids['m:viejo'] = '2026-10-01';
  const r = L.podarPagosFijos({ ids, meses: {} }, '2026-11-14');
  assert.ok(!('m:viejo' in r.ids));
  assert.equal(Object.keys(r.ids).length, 100);
});
