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
// Datos desde la fila 4. Contiene consumos de las dos tarjetas (Pedro y Britney).
function hojaTcIbk() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - INTERBANK', ancho),                // fila 1
    filaVacia(ancho),                                                // fila 2
    ENCABEZADOS_TC.slice(),                                          // fila 3
    // fila 4: Pedro, todo como Date y número
    ['Pedro Nicolás', 'Octubre', fecha(2026, 10, 24), 'Supermercado', 'Compra sintética A', 100,
      fecha(2026, 11, 30), fecha(2026, 12, 15), 'Pendiente', '', 'APP:prueba-1', 'x', ''],
    // fila 5: Britney, fecha y monto como texto
    ['Britney', 'Octubre', '05/10/2026', 'Delivery', 'Pedido sintético B', 'S/.145.00',
      '31/10/2026', '20/11/2026', 'Pendiente', 'nota de prueba', 'WEB:0000-aaaa', 'abc123', ''],
    // fila 6: Pedro, ya pagado
    ['Pedro Nicolás', 'Octubre', fecha(2026, 10, 2), 'Salud y Farmacia', 'Farmacia sintética', 30,
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
    ['Britney', 'Noviembre', fecha(2026, 11, 2), 'Chucherías', 'Golosina sintética', 4.5,
      'Yape', 'Pagado', '', 'APP:h-1', ''],                           // fila 3
    ['Pedro Nicolás', 'Noviembre', fecha(2026, 11, 3), 'Pasajes y Transporte', 'Pasaje sintético', 3,
      'Efectivo', 'Pagado', '', '', ''],                              // fila 4
    ['Pedro Nicolás', 'Octubre', fecha(2026, 10, 28), 'Desayuno', 'Desayuno sintético', 12,
      'Plin', 'Pagado', '', '', '']                                   // fila 5 (otro mes)
  ];
}

// Hoja 'TC SIP' sintética: título en fila 1, encabezados en fila 2.
function hojaTcSip() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - SIP', ancho),
    ENCABEZADOS_TC.slice(),
    ['Britney', 'Octubre', fecha(2026, 10, 8), 'Limpieza', 'Limpieza sintética', 20,
      fecha(2026, 10, 31), fecha(2026, 11, 3), 'Pendiente', '', '', '', ''],      // fila 3, vencida al 04/11
    ['Britney', 'Octubre', fecha(2026, 10, 12), 'Mascotas', 'Mascota sintética', 40,
      fecha(2026, 11, 30), fecha(2026, 12, 3), 'Pendiente', '', '', '', '']       // fila 4
  ];
}

// Hoja 'TC Ripley' sintética: consumos sin fecha de pago ni vencimiento.
function hojaTcRipley() {
  const ancho = ENCABEZADOS_TC.length;
  return [
    titulo('TARJETA DE CRÉDITO - RIPLEY', ancho),
    ENCABEZADOS_TC.slice(),
    ['Pedro Nicolás', 'Octubre', fecha(2026, 10, 15), 'Ropa y Calzado', 'Ropa sintética', 80,
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
  assert.equal(L.idTarjeta('TC IBK', 'Pedro Nicolás'), 'IBK_P');
  assert.equal(L.idTarjeta('TC IBK', 'Britney'), 'IBK_B');
  assert.equal(L.idTarjeta('TC IBK', ''), 'IBK_P');
  assert.equal(L.idTarjeta('TC SIP', 'Britney'), 'SIP');
  assert.equal(L.idTarjeta('TC BCP', 'Pedro Nicolás'), 'BCP');
  assert.equal(L.idTarjeta('TC Ripley', 'Pedro Nicolás'), 'RIPLEY');
  assert.equal(L.idTarjeta('Gastos Hormiga', 'Britney'), 'HORMIGA');
  assert.equal(L.idTarjeta('Configuración', 'Britney'), null);
});

test('leerConsumos TC IBK: fila real, fechas, montos y tarjeta por responsable', () => {
  const cs = L.leerConsumos(hojaTcIbk(), 'TC IBK');
  assert.equal(cs.length, 3, 'las filas vacías con formato se ignoran');

  const [a, b, c] = cs;
  assert.equal(a.fila, 4);
  assert.equal(a.responsable, 'Pedro Nicolás');
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
  assert.equal(b.responsable, 'Britney');
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
  assert.equal(por.IBK_P.nombre, 'TC IBK · Pedro');
  assert.equal(por.IBK_B.nombre, 'TC IBK · Britney');
  assert.equal(por.RIPLEY.nombre, 'TC Ripley');
  assert.equal(por.HORMIGA.nombre, 'Gastos hormiga');
  assert.equal(por.IBK_P.hoja, 'TC IBK');
  assert.equal(por.IBK_B.hoja, 'TC IBK');
  assert.equal(por.HORMIGA.hoja, 'Gastos Hormiga');
  assert.equal(por.IBK_P.responsable, 'Pedro Nicolás');
  assert.equal(por.IBK_B.responsable, 'Britney');
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
    { fila: 3, responsable: 'Pedro Nicolás', mes: 'Octubre', fecha: '2026-10-15', concepto: 'Ropa y Calzado',
      descripcion: 'Sin fecha', monto: 10, pago: '', vence: '', estado: 'Pendiente', nota: '', medio: '',
      idForm: '', huella: '', tarjeta: 'RIPLEY' },
    { fila: 4, responsable: 'Pedro Nicolás', mes: 'Octubre', fecha: '2026-10-16', concepto: 'Ropa y Calzado',
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
    tarjetaResumen('IBK_P', 'TC IBK · Pedro', [{ vence: '2026-11-07', pago: '2026-10-31', total: 50, pendiente: 50, consumos: [] }]),
    tarjetaResumen('IBK_B', 'TC IBK · Britney', [{ vence: '2026-11-04', pago: '2026-10-31', total: 15, pendiente: 15, consumos: [] }]),
    tarjetaResumen('BCP', 'TC BCP', [{ vence: '2026-11-08', pago: '2026-10-31', total: 70, pendiente: 70, consumos: [] }]),
    tarjetaResumen('RIPLEY', 'TC Ripley', [{ vence: '', pago: '', total: 80, pendiente: 80, consumos: [] }])
  ];
  const al = L.alertas(resumen, '2026-11-04', 3);
  const por = Object.fromEntries(al.map((a) => [a.tarjeta, a]));

  assert.deepEqual(por.SIP, { tipo: 'vencida', tarjeta: 'SIP', nombre: 'TC SIP', vence: '2026-11-03', monto: 20 });
  assert.deepEqual(por.IBK_P, { tipo: 'por_vencer', tarjeta: 'IBK_P', nombre: 'TC IBK · Pedro', vence: '2026-11-07', monto: 50 });
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
    ['Ingresos - Pedro (S/ 1,000)', 1000, 1000, 1000, 3000, 1000, 1000, ''],
    ['Ingresos - Britney (S/ 500)', 500, 500, 500, 1500, 500, 500, ''],
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

  assert.equal(por['Ingresos - Pedro (S/ 1,000)'].seccion, 'ingresos');
  assert.equal(por['Ingresos - Pedro (S/ 1,000)'].monto, 1000);
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

test('construirFila TC IBK (Britney): columnas según encabezado y Estado Pendiente', () => {
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
  const fila = L.construirFila(columnas, ancho, datos, 'Britney', 'TC IBK', ciclo);

  assert.equal(fila.length, ancho);
  assert.equal(fila[columnas.responsable], 'Britney');
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
  const fila = L.construirFila(columnas, ENCABEZADOS_TC.length, datos, 'Pedro Nicolás', 'TC Ripley',
    L.calcularCiclo('RIPLEY', datos.fecha));
  assert.equal(fila[columnas.responsable], 'Pedro Nicolás');
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
  const fila = L.construirFila(columnas, enc.length, datos, 'Pedro Nicolás', 'Gastos Hormiga',
    { pago: '', vence: '' });

  assert.equal(fila.length, enc.length);
  assert.deepEqual(
    [fila[0], fila[1], fila[3], fila[4], fila[5], fila[6], fila[7], fila[8], fila[9]],
    ['Pedro Nicolás', 'Noviembre', 'Chucherías', 'Golosina sintética', 'Yape', 4.5, 'Pagado', '',
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
    'Britney', 'Gastos Hormiga', { pago: '', vence: '' });
  const efectivo = L.construirFila(columnas, ENCABEZADOS_HORMIGA.length, Object.assign({}, base, { medio: 'EFECTIVO' }),
    'Britney', 'Gastos Hormiga', { pago: '', vence: '' });
  assert.equal(plin[columnas.medio], 'Plin');
  assert.equal(efectivo[columnas.medio], 'Efectivo');
  assert.equal(plin[columnas.estado], 'Pagado');
});
