// Pruebas del motor 1.7 (apps-script/Logica.gs): de dónde sale cada gasto y cálculo de las bolsas.
// Funciones puras. Se ejecutan con: npm test. Datos SINTÉTICOS.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'apps-script', 'Logica.gs'));

function fecha(a, m, d) { return new Date(a, m - 1, d); }

const ENC = ['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Fecha de pago', 'Fecha de vencimiento', 'Estado', 'Nota / Observación', '_ID_FORM', '_HUELLA_FORM'];
function hojaTc(filas) { return [['TÍTULO', '', '', '', '', '', '', '', '', '', '', ''], ENC.slice()].concat(filas); }

const PERSONAS = ['PersonaA', 'PersonaB'];
const SALDOS = [{ clave: '2026-10', saldoHoja: 558.81 }, { clave: '2026-11', saldoHoja: 985.57 }, { clave: '2026-12', saldoHoja: 300 }, { clave: '2027-01', saldoHoja: 400 }];
const METAS = [{ concepto: 'Ahorro Viaje', acumulado: 600 }, { concepto: 'Fondo de Emergencia', acumulado: 150 }];

// Consumo mínimo como lo entrega leerConsumos.
function tc(tarjeta, fechaGasto, pago, monto, origen) { return { tarjeta, fecha: fechaGasto, pago, monto, origen: origen || '' }; }
function hormiga(fechaGasto, monto, origen) { return { tarjeta: 'HORMIGA', fecha: fechaGasto, pago: '', monto, origen: origen || '' }; }

// ---------- sufijos de _id_form ----------

test('partesIdForm: tarjeta y origen en cualquier orden, cada uno opcional', () => {
  const o = encodeURIComponent('P:PersonaA');
  assert.equal(o, 'P%3APersonaA');
  assert.deepEqual(L.partesIdForm('APP:abc|TC:IBK_B|OR:' + o), { base: 'APP:abc', tarjeta: 'IBK_B', origen: 'P:PersonaA' });
  assert.deepEqual(L.partesIdForm('APP:abc|OR:' + o + '|TC:IBK_B'), { base: 'APP:abc', tarjeta: 'IBK_B', origen: 'P:PersonaA' });
  assert.deepEqual(L.partesIdForm('APP:abc|OR:' + o), { base: 'APP:abc', tarjeta: '', origen: 'P:PersonaA' });
  assert.deepEqual(L.partesIdForm('APP:abc|TC:IBK_B'), { base: 'APP:abc', tarjeta: 'IBK_B', origen: '' });
  assert.deepEqual(L.partesIdForm('APP:abc'), { base: 'APP:abc', tarjeta: '', origen: '' });
  assert.deepEqual(L.partesIdForm('  APP:abc | OR:A%3AAhorro%20Viaje | TC:BCP  '), { base: 'APP:abc', tarjeta: 'BCP', origen: 'A:Ahorro Viaje' });
  assert.deepEqual(L.partesIdForm('WEB:0000|otra-cosa|OR:'), { base: 'WEB:0000', tarjeta: '', origen: '' });
  // Un sufijo mal codificado no rompe la lectura: queda como fondo común.
  assert.deepEqual(L.partesIdForm('APP:abc|OR:%E0%A4%A|TC:SIP'), { base: 'APP:abc', tarjeta: 'SIP', origen: '' });
});

test('armarIdForm: codifica el origen para que "|", ":" o "%" en un nombre no rompan el parseo (ida y vuelta)', () => {
  assert.equal(L.armarIdForm('APP:abc', 'IBK_B', 'P:PersonaA'), 'APP:abc|TC:IBK_B|OR:P%3APersonaA');
  assert.equal(L.armarIdForm('APP:abc', '', 'A:Ahorro Viaje'), 'APP:abc|OR:A%3AAhorro%20Viaje');
  assert.equal(L.armarIdForm('APP:abc', 'IBK_B', ''), 'APP:abc|TC:IBK_B');
  assert.equal(L.armarIdForm('APP:abc', '', ''), 'APP:abc');
  assert.equal(L.armarIdForm('APP:abc'), 'APP:abc');
  for (const raro of ['A:Ahorro | Casa: 50% (2ª etapa)', 'P:María José Ñáñez|TC:FALSA', 'A:Fondo "emergencia" / salud & más', 'P:O\'Brien = +51']) {
    const idForm = L.armarIdForm('APP:x-1', 'BCP', raro);
    assert.equal(idForm.split('|').length, 3, 'sigue teniendo tres trozos: ' + idForm);
    assert.deepEqual(L.partesIdForm(idForm), { base: 'APP:x-1', tarjeta: 'BCP', origen: raro });
  }
});

test('partesOrigen: fondo común, persona, ahorro y formatos que no valen', () => {
  assert.deepEqual(L.partesOrigen(''), { tipo: '', nombre: '' });
  assert.deepEqual(L.partesOrigen(null), { tipo: '', nombre: '' });
  assert.deepEqual(L.partesOrigen('  '), { tipo: '', nombre: '' });
  assert.deepEqual(L.partesOrigen('P:PersonaA'), { tipo: 'P', nombre: 'PersonaA' });
  assert.deepEqual(L.partesOrigen(' A: Ahorro Viaje '), { tipo: 'A', nombre: 'Ahorro Viaje' });
  assert.deepEqual(L.partesOrigen('A:Ahorro: casa'), { tipo: 'A', nombre: 'Ahorro: casa' });
  assert.equal(L.partesOrigen('X:algo').tipo, '?');
  assert.equal(L.partesOrigen('P:').tipo, '?');
  assert.equal(L.partesOrigen('comun').tipo, '?');
});

test('mesDeGasto: tarjeta = mes de la fecha de pago (o de la fecha si no tiene); hormiga = mes de la fecha', () => {
  assert.equal(L.mesDeGasto(tc('IBK_P', '2026-10-24', '2026-11-30', 10)), '2026-11');
  assert.equal(L.mesDeGasto(tc('RIPLEY', '2026-10-24', '', 10)), '2026-10');
  assert.equal(L.mesDeGasto(hormiga('2026-11-03', 5)), '2026-11');
  assert.equal(L.mesDeGasto({ tarjeta: 'HORMIGA', fecha: '2026-11-03', pago: '2026-12-31' }), '2026-11', 'en hormiga la fecha de pago no cuenta');
  assert.equal(L.mesDeGasto({ tarjeta: 'BCP', fecha: '', pago: '' }), '');
  assert.equal(L.mesDeGasto(null), '');
});

test('leerConsumos y el consumo público exponen el origen ya decodificado; idForm público sin sufijos', () => {
  const consumos = L.leerConsumos(hojaTc([
    ['PersonaA', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Con su sobrante', 119, fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', 'APP:uno|TC:IBK_B|OR:P%3APersonaA', ''],
    ['PersonaB', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Del ahorro', 50, fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', 'APP:dos|OR:A%3AAhorro%20Viaje', ''],
    ['PersonaB', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Común', 7, fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', 'APP:tres', '']
  ]), 'TC IBK');
  assert.deepEqual(consumos.map((c) => [c.tarjeta, c.origen]), [['IBK_B', 'P:PersonaA'], ['IBK_B', 'A:Ahorro Viaje'], ['IBK_B', '']]);
  const publicos = L.resumenTarjetas(consumos, '2026-11-06', false).find((t) => t.id === 'IBK_B').estados[0].consumos;
  assert.deepEqual(publicos[0], {
    fila: 3, idForm: 'APP:uno', fecha: '2026-11-05', concepto: 'Delivery', descripcion: 'Con su sobrante', monto: 119,
    estado: 'Pendiente', nota: '', medio: '', responsable: 'PersonaA', tarjetaId: 'IBK_B', origen: 'P:PersonaA', prestada: true
  });
  assert.deepEqual(publicos.map((c) => [c.idForm, c.origen]), [['APP:uno', 'P:PersonaA'], ['APP:dos', 'A:Ahorro Viaje'], ['APP:tres', '']]);
});

test('construirFila: escribe el origen como sufijo y convive con el de tarjeta', () => {
  const cols = L.mapearColumnas(ENC);
  const datos = { idCliente: 'abc-12345', monto: 45, medio: 'TC_IBK', concepto: 'Delivery', descripcion: 'Algo', fecha: '2026-11-05' };
  const ciclo = L.calcularCiclo('IBK_B', '2026-11-05');
  assert.equal(L.construirFila(cols, 12, Object.assign({ origen: 'A:Ahorro Viaje' }, datos), 'PersonaB', 'TC IBK', ciclo)[10], 'APP:abc-12345|OR:A%3AAhorro%20Viaje');
  assert.equal(L.construirFila(cols, 12, Object.assign({ origen: 'P:PersonaB', tarjetaExplicita: 'IBK_P' }, datos), 'PersonaB', 'TC IBK', ciclo)[10], 'APP:abc-12345|TC:IBK_P|OR:P%3APersonaB');
  assert.equal(L.construirFila(cols, 12, Object.assign({ origen: '' }, datos), 'PersonaB', 'TC IBK', ciclo)[10], 'APP:abc-12345', 'fondo común: no se anota nada');
});

// ---------- saldos de la hoja ----------

test('saldosPorMes: lee el saldo de cada mes del presupuesto, en orden y sin la columna vacía', () => {
  const display = [
    ['PRESUPUESTO FAMILIAR', '', '', '', '', ''],
    ['Concepto / Categoría', 'oct-26', 'nov-26', 'dic-26', '', 'ene-27'],
    ['Ingresos - Uno', '5000', '5000', '5000', '', '5000'],
    ['TOTAL INGRESOS', '5000', '5000', '5000', '', '5000'],
    ['Servicios', '200', '200', '200', '', '200'],
    ['Ahorro Viaje', '100', '100', '100', '', '100'],
    ['TOTAL GASTOS', '300', '300', '300', '', '300'],
    ['TOTAL AHORROS', '100', '100', '100', '', '100'],
    ['SALDO / SUPERÁVIT FINAL', '558.81', '985.57', '300', '', '400.005'],
    ['Saldo Personal', '279.4', '492.8', '150', '', '200']
  ];
  const valores = display.map((f) => f.map((v, j) => (j > 0 && v !== '' && !isNaN(Number(v)) ? Number(v) : v)));
  assert.deepEqual(L.saldosPorMes(display, valores), [
    { clave: '2026-10', saldoHoja: 558.81 }, { clave: '2026-11', saldoHoja: 985.57 }, { clave: '2026-12', saldoHoja: 300 }, { clave: '2027-01', saldoHoja: 400.01 }
  ]);
  assert.deepEqual(L.saldosPorMes([], []), []);
  assert.deepEqual(L.saldosPorMes([['sin', 'encabezado']], [['sin', 'encabezado']]), []);
});

// ---------- bolsas ----------

test('calcularBolsas: el ejemplo del encargo (octubre 558.81, noviembre 985.57, PersonaA gasta 119 de su sobrante con tarjeta)', () => {
  const consumos = [
    tc('IBK_P', '2026-11-05', '2026-11-30', 119, 'P:PersonaA'),
    tc('BCP', '2026-11-04', '2026-11-30', 300, ''),          // fondo común: no cambia nada
    hormiga('2026-11-02', 15, '')                             // hormiga del fondo común
  ];
  const b = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-11', '2026-11');
  assert.deepEqual(b, {
    mes: '2026-11',
    comun: { saldoHoja: 985.57, fuera: 119, saldo: 1104.57 },
    personas: [
      { nombre: 'PersonaA', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 119 },
      { nombre: 'PersonaB', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 0 }
    ],
    ahorros: [
      { meta: 'Ahorro Viaje', acumulado: 600, retirado: 0, retiradoMes: 0, disponible: 600 },
      { meta: 'Fondo de Emergencia', acumulado: 150, retirado: 0, retiradoMes: 0, disponible: 150 }
    ],
    otros: 0,
    disponible: 1663.39,
    meses: [
      { clave: '2026-10', saldoHoja: 558.81, fuera: 0, saldo: 558.81, porPersona: 279.41 },
      { clave: '2026-11', saldoHoja: 985.57, fuera: 119, saldo: 1104.57, porPersona: 552.29 }
    ],
    proximos: [
      { mes: '2026-11', porPersona: 552.29, personas: [
        { nombre: 'PersonaA', apartado: 119, queda: 433.29 }, { nombre: 'PersonaB', apartado: 0, queda: 552.29 }] },
      { mes: '2026-12', porPersona: 150, personas: [
        { nombre: 'PersonaA', apartado: 0, queda: 150 }, { nombre: 'PersonaB', apartado: 0, queda: 150 }] }
    ]
  });
});

test('calcularBolsas: un hormiga con origen personal baja la bolsa de la persona pero no cambia "fuera"', () => {
  const b = L.calcularBolsas(SALDOS, [hormiga('2026-11-03', 20, 'P:PersonaB')], PERSONAS, METAS, '2026-11', '2026-11');
  assert.deepEqual(b.comun, { saldoHoja: 985.57, fuera: 0, saldo: 985.57 });
  assert.deepEqual(b.personas[1], { nombre: 'PersonaB', acumulado: 279.41, gastado: 20, gastadoMes: 20, disponible: 259.41, comprometido: 0 });
  assert.equal(b.personas[0].disponible, 279.41);
  assert.equal(b.disponible, 1524.39);
});

test('calcularBolsas: origen ahorro baja lo disponible del ahorro y sube "fuera" solo si es tarjeta con fecha de pago', () => {
  const conTarjeta = L.calcularBolsas(SALDOS, [tc('BCP', '2026-11-02', '2026-11-30', 200, 'A:ahorro viaje')], PERSONAS, METAS, '2026-11', '2026-11');
  assert.deepEqual(conTarjeta.ahorros[0], { meta: 'Ahorro Viaje', acumulado: 600, retirado: 200, retiradoMes: 200, disponible: 400 });
  assert.deepEqual(conTarjeta.comun, { saldoHoja: 985.57, fuera: 200, saldo: 1185.57 });
  assert.equal(conTarjeta.ahorros[1].disponible, 150);
  assert.equal(conTarjeta.disponible, 1744.39, 'el total no incluye los ahorros: 1185.57 + 279.41 + 279.41');
  const conYape = L.calcularBolsas(SALDOS, [hormiga('2026-11-02', 200, 'A:Ahorro Viaje')], PERSONAS, METAS, '2026-11', '2026-11');
  assert.equal(conYape.ahorros[0].disponible, 400);
  assert.equal(conYape.comun.fuera, 0);
});

test('calcularBolsas: una tarjeta sin fecha de pago (Ripley) no entra a "fuera"; sale del sobrante del mes de su fecha', () => {
  const b = L.calcularBolsas(SALDOS, [tc('RIPLEY', '2026-11-04', '', 80, 'P:PersonaA')], PERSONAS, METAS, '2026-11', '2026-11');
  assert.equal(b.comun.fuera, 0);
  assert.equal(b.comun.saldo, 985.57);
  assert.deepEqual(b.personas[0], { nombre: 'PersonaA', acumulado: 279.41, gastado: 0, gastadoMes: 0, disponible: 279.41, comprometido: 80 });
  const dic = L.calcularBolsas(SALDOS, [tc('RIPLEY', '2026-11-04', '', 80, 'P:PersonaA')], PERSONAS, METAS, '2026-12', '2026-12');
  assert.deepEqual(dic.personas[0], { nombre: 'PersonaA', acumulado: 772.2, gastado: 80, gastadoMes: 80, disponible: 692.2, comprometido: 0 });
});

test('calcularBolsas: los gastos de meses anteriores suben el saldo de ese mes y se acumulan; los posteriores al mes pedido no cuentan', () => {
  const consumos = [
    tc('IBK_P', '2026-10-05', '2026-10-31', 100, 'P:PersonaA'),   // octubre
    tc('IBK_P', '2026-11-25', '2026-12-31', 60, 'P:PersonaA'),    // se paga en diciembre
    hormiga('2026-12-02', 9, 'P:PersonaB')                              // diciembre
  ];
  const nov = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-11', '2026-12');
  assert.deepEqual(nov.meses[0], { clave: '2026-10', saldoHoja: 558.81, fuera: 100, saldo: 658.81, porPersona: 329.41 });
  // El de octubre se pagó el 31 oct: sale del sobrante de octubre, que ya está en la mano en noviembre.
  assert.deepEqual(nov.personas[0], { nombre: 'PersonaA', acumulado: 329.41, gastado: 100, gastadoMes: 100, disponible: 229.41, comprometido: 60 });
  assert.deepEqual(nov.personas[1], { nombre: 'PersonaB', acumulado: 329.41, gastado: 0, gastadoMes: 0, disponible: 329.41, comprometido: 0 });
  assert.equal(nov.comun.fuera, 0, 'el de 60 se paga en diciembre');
  const dic = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-12', '2026-12');
  assert.deepEqual(dic.comun, { saldoHoja: 300, fuera: 60, saldo: 360 });
  // El de 60 se paga el 31 dic: sale del sobrante de diciembre (cuenta desde enero); queda apartado.
  assert.deepEqual(dic.personas[0], { nombre: 'PersonaA', acumulado: 822.2, gastado: 100, gastadoMes: 0, disponible: 722.2, comprometido: 60 });
  assert.deepEqual(dic.personas[1], { nombre: 'PersonaB', acumulado: 822.2, gastado: 9, gastadoMes: 9, disponible: 813.2, comprometido: 0 });
  const ene = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2027-01', '2027-01');
  assert.equal(ene.personas[0].gastado, 160);
  assert.equal(ene.personas[0].comprometido, 0);
  assert.deepEqual(dic.meses.map((m) => m.clave), ['2026-10', '2026-11', '2026-12']);
});

test('calcularBolsas: los meses futuros no se acumulan en el sobrante de las personas', () => {
  // Hoy es noviembre: aunque se pida enero, solo se reparten octubre y noviembre.
  const ene = L.calcularBolsas(SALDOS, [], PERSONAS, METAS, '2027-01', '2026-11');
  assert.equal(ene.personas[0].acumulado, 772.2, '279.41 + 492.79; diciembre (futuro) no entra');
  assert.deepEqual(ene.comun, { saldoHoja: 400, fuera: 0, saldo: 400 });
  assert.equal(ene.meses.length, 4);
  // Con hoy en enero sí entra diciembre (150 por persona).
  assert.equal(L.calcularBolsas(SALDOS, [], PERSONAS, METAS, '2027-01', '2027-01').personas[0].acumulado, 922.2);
  // El primer mes de la hoja no tiene nada acumulado.
  const oct = L.calcularBolsas(SALDOS, [], PERSONAS, METAS, '2026-10', '2026-11');
  assert.deepEqual(oct.personas.map((p) => p.acumulado), [0, 0]);
  assert.equal(oct.disponible, 558.81);
  assert.equal(oct.meses.length, 1);
});

test('calcularBolsas: orígenes que ya no existen (persona quitada, ahorro renombrado, formato raro) van a "otros"', () => {
  const consumos = [
    tc('BCP', '2026-11-02', '2026-11-30', 40, 'P:PersonaC'),
    hormiga('2026-11-03', 10, 'A:Ahorro Moto'),
    hormiga('2026-11-03', 5, 'X:raro'),
    hormiga('2026-12-03', 99, 'P:PersonaC'),           // posterior al mes pedido: no cuenta
    tc('BCP', '2026-11-02', '2026-11-30', 7, 'P:PersonaB')  // sí existe (sin mayúsculas)
  ];
  const b = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-11', '2026-11');
  assert.equal(b.otros, 55);
  assert.equal(b.comun.fuera, 47, 'los de tarjeta con fecha de pago igual se devuelven al saldo');
  assert.equal(b.personas[1].gastado, 0, 'la tarjeta de 7 se paga el 30 nov: sale del sobrante de noviembre');
  assert.equal(b.personas[1].comprometido, 7);
  assert.deepEqual(b.ahorros.map((a) => a.retirado), [0, 0]);
});

test('calcularBolsas: con una sola persona (N = 1) todo el saldo es suyo; sin personas no divide entre cero', () => {
  const uno = L.calcularBolsas(SALDOS, [tc('BCP', '2026-11-02', '2026-11-30', 50, 'P:PersonaA')], ['PersonaA'], METAS, '2026-11', '2026-11');
  assert.deepEqual(uno.personas, [{ nombre: 'PersonaA', acumulado: 558.81, gastado: 0, gastadoMes: 0, disponible: 558.81, comprometido: 50 }]);
  assert.equal(uno.meses[1].porPersona, 1035.57);
  assert.equal(uno.disponible, 1594.38);
  const nadie = L.calcularBolsas(SALDOS, [], [], [], '2026-11', '2026-11');
  assert.deepEqual(nadie.personas, []);
  assert.deepEqual(nadie.ahorros, []);
  assert.equal(nadie.disponible, 985.57);
  assert.equal(nadie.meses[0].porPersona, 558.81);
  // Tres personas: el centavo se redondea.
  const tres = L.calcularBolsas([{ clave: '2026-10', saldoHoja: 100 }, { clave: '2026-11', saldoHoja: 0 }], [], ['A', 'B', 'C'], [], '2026-11', '2026-11');
  assert.deepEqual(tres.personas.map((p) => p.acumulado), [33.33, 33.33, 33.33]);
});

test('calcularBolsas: mes que no está en la hoja devuelve null; saldos negativos y centavos se manejan bien', () => {
  assert.equal(L.calcularBolsas(SALDOS, [], PERSONAS, METAS, '2030-01', '2026-11'), null);
  assert.equal(L.calcularBolsas([], [], PERSONAS, METAS, '2026-11', '2026-11'), null);
  assert.equal(L.calcularBolsas(null, null, null, null, '2026-11'), null);
  const negativo = L.calcularBolsas([{ clave: '2026-10', saldoHoja: -100.01 }, { clave: '2026-11', saldoHoja: 0.1 }],
    [tc('BCP', '2026-11-01', '2026-11-30', 0.2, 'P:PersonaB')], PERSONAS, [], '2026-11', '2026-11');
  assert.deepEqual(negativo.comun, { saldoHoja: 0.1, fuera: 0.2, saldo: 0.3 });
  assert.equal(negativo.personas[0].acumulado, -50);
  assert.deepEqual(negativo.personas[1], { nombre: 'PersonaB', acumulado: -50, gastado: 0, gastadoMes: 0, disponible: -50, comprometido: 0.2 });
  assert.equal(negativo.disponible, -99.7);
});

test('retirosPorMeta: lo sacado de cada ahorro hasta el mes pedido', () => {
  const consumos = [
    tc('BCP', '2026-10-02', '2026-10-31', 100, 'A:Ahorro Viaje'),
    hormiga('2026-11-03', 25.5, 'A:ahorro viaje'),
    hormiga('2026-12-03', 10, 'A:Ahorro Viaje'),
    hormiga('2026-11-03', 5, 'A:Fondo de Emergencia'),
    hormiga('2026-11-03', 99, 'P:PersonaB'),
    hormiga('2026-11-03', 99, '')
  ];
  assert.deepEqual(L.retirosPorMeta(consumos, '2026-11'), {
    'ahorro viaje': { retirado: 125.5, retiradoMes: 25.5 }, 'fondo de emergencia': { retirado: 5, retiradoMes: 5 }
  });
  assert.deepEqual(L.retirosPorMeta(consumos, '2026-09'), {});
  assert.deepEqual(L.retirosPorMeta(null, '2026-11'), {});
});


// ---------- 1.9.4: la tarjeta con el sobrante de una persona sale del sobrante del mes en que se paga ----------

test('1.9.4: el 119 con TC SIP que se paga el 30 nov no baja lo que se tiene hoy; baja el sobrante de noviembre', () => {
  const consumos = [
    tc('SIP', '2026-11-06', '2026-11-30', 119, 'P:PersonaA'),
    hormiga('2026-11-09', 35, 'P:PersonaA')  // Yape/efectivo: sí sale de lo que ya tiene
  ];
  const nov = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-11', '2026-11');
  assert.equal(nov.personas[0].disponible, 244.41, '279.41 − 35');
  assert.equal(nov.personas[0].comprometido, 119);
  const dic = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-12', '2026-12');
  // Noviembre: 985.57 + 119 (la tarjeta no era del fondo común) = 1104.57 → 552.29 cada uno.
  assert.equal(dic.personas[0].acumulado, 831.7);
  assert.equal(dic.personas[0].disponible, Math.round((279.41 + 552.29 - 119 - 35) * 100) / 100);
  assert.equal(dic.personas[0].comprometido, 0);
  assert.equal(dic.personas[0].gastadoMes, 119);
});


// ---------- 1.9.5: ¿le alcanza el sobrante? ----------

test('1.9.5: alcanceSobrante: en directo mira lo de hoy; con tarjeta, lo que quedará del mes en que se paga', () => {
  const consumos = [
    tc('SIP', '2026-11-06', '2026-11-30', 119, 'P:PersonaA'),
    hormiga('2026-11-09', 300, 'P:PersonaB')
  ];
  const b = L.calcularBolsas(SALDOS, consumos, PERSONAS, METAS, '2026-11', '2026-11');
  // PersonaB gastó 300 en efectivo y tenía 279.41: le faltan 20.59.
  assert.deepEqual(L.alcanceSobrante(b, 'PersonaB', { monto: 300, tarjeta: false, fecha: '2026-11-09' }),
    { nombre: 'PersonaB', de: 'hoy', queda: -20.59, alcanza: false, falta: 20.59 });
  // PersonaA: la tarjeta se paga el 30 nov; de noviembre le quedan 552.29 − 119.
  assert.deepEqual(L.alcanceSobrante(b, 'personaa', { monto: 119, tarjeta: true, pago: '2026-11-30', fecha: '2026-11-06' }),
    { nombre: 'PersonaA', de: '2026-11', queda: 433.29, alcanza: true, falta: 0 });
  // Una tarjeta de diciembre mira lo que llega en diciembre (150).
  assert.equal(L.alcanceSobrante(b, 'PersonaA', { monto: 10, tarjeta: true, pago: '2026-12-31' }).queda, 150);
  // Un mes que no está en la hoja o una persona que no existe: no se sabe.
  assert.equal(L.alcanceSobrante(b, 'PersonaA', { monto: 10, tarjeta: true, pago: '2027-03-31' }), null);
  assert.equal(L.alcanceSobrante(b, 'Nadie', { monto: 10, tarjeta: false }), null);
  assert.equal(L.alcanceSobrante(null, 'PersonaA', {}), null);
});

test('1.9.5: textoSobranteNoAlcanza dice de dónde sale y cuánto falta', () => {
  const t = L.textoSobranteNoAlcanza({ nombre: 'PersonaA Apellido', de: '2026-11', falta: 20.5, monto: 140, descripcion: 'Zapatillas' });
  assert.match(t.asunto, /no alcanza/);
  assert.match(t.cuerpo, /PersonaA, anotaste Zapatillas/);
  assert.match(t.cuerpo, /noviembre/);
  assert.match(t.cuerpo, /20\.50/);
  assert.match(L.textoSobranteNoAlcanza({ nombre: 'PersonaB', de: 'hoy', falta: 1, monto: 5 }).cuerpo, /lo que tienes hoy/);
});
