// Pruebas del catálogo de tarjetas (apps-script/Logica.gs, motor 1.4): funciones puras.
// Se ejecutan con: npm test. Datos SINTÉTICOS.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'apps-script', 'Logica.gs'));

const DEFECTO = [
  { id: 'SIP', nombre: 'SIP · Oh!', titular: '', hoja: 'TC SIP', medio: 'TC_SIP', cierre: 10, vence: 3, color: 'rojo', activa: true, orden: 1, etiqueta: 'TC SIP' },
  { id: 'IBK_P', nombre: 'Interbank', titular: 'PersonaA', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 15, color: 'verde', activa: true, orden: 2, etiqueta: 'TC IBK · PersonaA' },
  { id: 'IBK_B', nombre: 'Interbank', titular: 'PersonaB', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 20, color: 'turquesa', activa: true, orden: 3, etiqueta: 'TC IBK · PersonaB' },
  { id: 'BCP', nombre: 'BCP', titular: '', hoja: 'TC BCP', medio: 'TC_BCP', cierre: 20, vence: 20, color: 'azul', activa: true, orden: 4, etiqueta: 'TC BCP' },
  { id: 'RIPLEY', nombre: 'Ripley', titular: '', hoja: 'TC Ripley', medio: 'TC_RIPLEY', cierre: null, vence: null, color: 'gris', activa: true, orden: 5, etiqueta: 'TC Ripley' }
];

const DINERS = { id: 'DINERS', nombre: 'Diners', titular: 'PersonaA', hoja: 'TC Diners', medio: 'TC_DINERS', cierre: 5, vence: 25, color: 'dorado', activa: true, orden: 6 };

function conDiners(extra) {
  return L.catalogoDesde(JSON.stringify(DEFECTO.concat([Object.assign({}, DINERS, extra || {})])));
}

function fecha(a, m, d) { return new Date(a, m - 1, d); }

const ENC = ['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Fecha de pago', 'Fecha de vencimiento', 'Estado', 'Nota / Observación', '_ID_FORM', '_HUELLA_FORM'];
function hojaTc(filas) { return [['TÍTULO', '', '', '', '', '', '', '', '', '', '', ''], ENC.slice()].concat(filas); }

test('CATALOGO_DEFECTO: es el de siempre y catalogoDesde(null) devuelve una copia', () => {
  assert.deepEqual(L.CATALOGO_DEFECTO, DEFECTO);
  const c = L.catalogoDesde(null);
  assert.deepEqual(c, DEFECTO);
  c[0].nombre = 'cambiado';
  assert.equal(L.CATALOGO_DEFECTO[0].nombre, 'SIP · Oh!', 'no se modifica el original');
  assert.deepEqual(L.catalogoDesde('{roto'), DEFECTO);
  assert.deepEqual(L.catalogoDesde('[]'), DEFECTO);
  assert.deepEqual(L.COLORES_TARJETA, ['rojo', 'verde', 'turquesa', 'azul', 'gris', 'naranja', 'vino', 'lima', 'celeste', 'marino', 'dorado', 'grafito']);
});

test('catalogoDesde: sanea lo guardado (colores, días, duplicados, orden)', () => {
  const c = L.catalogoDesde(JSON.stringify([
    { id: 'B', nombre: 'Dos', hoja: 'TC Dos', medio: 'TC_DOS', cierre: '35', vence: 7, color: 'fucsia', orden: 2 },
    { id: 'A', nombre: 'Uno', hoja: 'TC Uno', medio: 'TC_UNO', cierre: 10, vence: 3, color: 'azul', orden: 1, activa: false },
    { id: 'A', nombre: 'repetida', hoja: 'x', medio: 'y' },
    { id: 'C', nombre: 'sin hoja', medio: 'TC_C' },
    'basura'
  ]));
  assert.deepEqual(c.map((t) => t.id), ['A', 'B']);
  assert.equal(c[1].color, 'gris');
  assert.equal(c[1].cierre, null, 'un día imposible queda vacío');
  assert.equal(c[1].vence, 7);
  assert.equal(c[0].activa, false);
  assert.equal(c[1].activa, true);
  assert.deepEqual(L.tarjetasActivas(c).map((t) => t.id), ['B']);
});

test('mediosDesde, ciclosDesde y hojasDesde: con el catálogo inicial dan lo mismo que las constantes viejas', () => {
  assert.deepEqual(L.mediosDesde(L.CATALOGO_DEFECTO), L.MEDIOS);
  assert.deepEqual(L.mediosDesde(null), L.MEDIOS);
  assert.deepEqual(L.ciclosDesde(L.CATALOGO_DEFECTO), L.CICLOS);
  assert.deepEqual(L.hojasDesde(L.CATALOGO_DEFECTO), ['TC SIP', 'TC IBK', 'TC BCP', 'TC Ripley']);

  const c = conDiners();
  assert.deepEqual(L.mediosDesde(c).map((m) => m.id), ['TC_SIP', 'TC_IBK', 'TC_BCP', 'TC_RIPLEY', 'TC_DINERS', 'YAPE', 'PLIN', 'EFECTIVO', 'LEMON']);
  assert.deepEqual(L.mediosDesde(c)[4], { id: 'TC_DINERS', etiqueta: 'TC Diners', hoja: 'TC Diners', tipo: 'tarjeta' });
  assert.deepEqual(L.ciclosDesde(c).DINERS, { cierre: 5, vence: 25 });
  assert.ok(L.hojasDesde(c).includes('TC Diners'));

  // Una tarjeta desactivada sale de medios y hojas, pero conserva su ciclo (por los gastos viejos).
  const sinSip = c.map((t) => (t.id === 'SIP' ? Object.assign({}, t, { activa: false }) : t));
  assert.ok(!L.mediosDesde(sinSip).some((m) => m.id === 'TC_SIP'));
  assert.ok(!L.hojasDesde(sinSip).includes('TC SIP'));
  assert.deepEqual(L.ciclosDesde(sinSip).SIP, { cierre: 10, vence: 3 });
});

test('etiquetaTarjeta: fija para las de siempre y "TC <nombre> · <titular>" para las nuevas', () => {
  assert.equal(L.etiquetaTarjeta(DEFECTO[1]), 'TC IBK · PersonaA');
  assert.equal(L.etiquetaTarjeta(DINERS), 'TC Diners · PersonaA');
  assert.equal(L.etiquetaTarjeta(Object.assign({}, DINERS, { titular: '' })), 'TC Diners');
  assert.equal(L.etiquetaTarjeta(Object.assign({}, DINERS, { nombre: 'Diners · Club', titular: '' })), 'TC Diners');
  assert.equal(L.etiquetaTarjeta(null), 'Otros');
});

test('idTarjeta con catálogo: Interbank comparte hoja y se separa por titular; tarjeta nueva con hoja propia', () => {
  const c = conDiners();
  assert.equal(L.idTarjeta('TC IBK', 'PersonaA', c), 'IBK_P');
  assert.equal(L.idTarjeta('TC IBK', 'PersonaB', c), 'IBK_B');
  assert.equal(L.idTarjeta('TC IBK', '', c), 'IBK_P', 'sin responsable: la primera de la hoja');
  assert.equal(L.idTarjeta('TC IBK', 'PersonaC', c), 'IBK_P');
  assert.equal(L.idTarjeta('tc diners', 'PersonaB', c), 'DINERS');
  assert.equal(L.idTarjeta('TC Otra', 'PersonaA', c), null);
  assert.equal(L.idTarjeta('Gastos Hormiga', '', c), 'HORMIGA');
  // Sin catálogo se comporta como siempre.
  assert.equal(L.idTarjeta('TC IBK', 'PersonaB'), 'IBK_B');
  assert.equal(L.idTarjeta('TC SIP', 'PersonaB'), 'SIP');
  // Si la que coincide por titular está inactiva, se usa la activa de la hoja.
  const sinB = c.map((t) => (t.id === 'IBK_B' ? Object.assign({}, t, { activa: false }) : t));
  assert.equal(L.idTarjeta('TC IBK', 'PersonaB', sinB), 'IBK_P');
  // Tres tarjetas en una hoja: la sin titular es la de respaldo.
  const tres = L.catalogoDesde(JSON.stringify(DEFECTO.concat([{ id: 'IBK_X', nombre: 'Interbank', titular: '', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 10, color: 'lima', orden: 0 }])));
  assert.equal(L.idTarjeta('TC IBK', 'PersonaC', tres), 'IBK_X');
  assert.equal(L.idTarjeta('TC IBK', 'PersonaA', tres), 'IBK_P');
});

test('calcularCiclo con catálogo: usa cierre y vence de la tarjeta (nueva o editada)', () => {
  const c = conDiners();
  assert.deepEqual(L.calcularCiclo('DINERS', '2026-11-04', c), { pago: '2026-11-30', vence: '2026-12-25' });
  assert.deepEqual(L.calcularCiclo('DINERS', '2026-11-06', c), { pago: '2026-12-31', vence: '2027-01-25' });
  const editado = c.map((t) => (t.id === 'IBK_P' ? Object.assign({}, t, { cierre: 25, vence: 10 }) : t));
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-10-24', editado), { pago: '2026-10-31', vence: '2026-11-10' });
  assert.deepEqual(L.calcularCiclo('IBK_P', '2026-10-24', c), { pago: '2026-11-30', vence: '2026-12-15' }, 'sin editar, igual que antes');
  assert.deepEqual(L.calcularCiclo('RIPLEY', '2026-10-24', c), { pago: '', vence: '' });
  assert.deepEqual(L.calcularCiclo('NO_EXISTE', '2026-10-24', c), { pago: '', vence: '' });
  assert.deepEqual(L.calcularCiclo('SIP', '2026-10-12'), { pago: '2026-11-30', vence: '2026-12-03' }, 'sin catálogo usa el inicial');
});

test('validarTarjetaCatalogo y generarIdTarjeta', () => {
  assert.deepEqual(L.validarTarjetaCatalogo({ nombre: '  Diners  Club ', titular: 'PersonaA', cierre: '5', vence: 25, color: 'Dorado' }, true),
    { campos: { nombre: 'Diners Club', titular: 'PersonaA', cierre: 5, vence: 25, color: 'dorado' } });
  assert.deepEqual(L.validarTarjetaCatalogo({ cierre: null, vence: '' }, false), { campos: { cierre: null, vence: null } });
  assert.deepEqual(L.validarTarjetaCatalogo({ orden: 3 }, false), { campos: { orden: 3 } });
  assert.deepEqual(L.validarTarjetaCatalogo({}, false), { campos: {} });
  assert.equal(L.validarTarjetaCatalogo({ nombre: 'D', color: 'rojo' }, true).error, 'El nombre de la tarjeta debe tener entre 2 y 30 letras.');
  assert.equal(L.validarTarjetaCatalogo({ nombre: 'x'.repeat(31), color: 'rojo' }, true).error, 'El nombre de la tarjeta debe tener entre 2 y 30 letras.');
  assert.match(L.validarTarjetaCatalogo({ nombre: 'Diners', color: 'fucsia' }, true).error, /El color no es válido/);
  assert.equal(L.validarTarjetaCatalogo({ nombre: 'Diners' }, true).error.indexOf('El color'), 0, 'completo exige color');
  assert.equal(L.validarTarjetaCatalogo({ cierre: 0 }, false).error, 'El cierre y el vencimiento deben ser un día del mes (1 a 31) o quedar vacíos.');
  assert.equal(L.validarTarjetaCatalogo({ vence: 32 }, false).error, 'El cierre y el vencimiento deben ser un día del mes (1 a 31) o quedar vacíos.');
  assert.equal(L.validarTarjetaCatalogo({ cierre: 'x' }, false).error, 'El cierre y el vencimiento deben ser un día del mes (1 a 31) o quedar vacíos.');
  assert.equal(L.validarTarjetaCatalogo({ orden: '3' }, false).error, 'El orden debe ser un número entero.');

  assert.equal(L.generarIdTarjeta('Diners Club', ['SIP']), 'DINERS_CLUB');
  assert.equal(L.generarIdTarjeta('Crédito Óh!', []), 'CREDITO_OH');
  assert.equal(L.generarIdTarjeta('BCP', ['BCP', 'BCP_2']), 'BCP_3');
  assert.equal(L.generarIdTarjeta('Interbank · PersonaA', []), 'INTERBANK');
  assert.equal(L.generarIdTarjeta('***', []), 'TARJETA');
});

test('resumenTarjetas con catálogo: una tarjeta nueva aparece y una desactivada desaparece', () => {
  const c = conDiners();
  const consumos = [].concat(
    L.leerConsumos(hojaTc([['PersonaB', 'Octubre', fecha(2026, 10, 9), 'Mascotas', 'Mascota', 40, fecha(2026, 10, 31), fecha(2026, 11, 3), 'Pendiente', '', '', '']]), 'TC SIP', c),
    L.leerConsumos(hojaTc([['PersonaA', 'Noviembre', fecha(2026, 11, 4), 'Viajes', 'Pasaje', 300, fecha(2026, 11, 30), fecha(2026, 12, 25), 'Pendiente', '', '', '']]), 'TC Diners', c)
  );
  assert.equal(consumos[1].tarjeta, 'DINERS');
  const r = L.resumenTarjetas(consumos, '2026-11-06', false, c);
  assert.deepEqual(r.map((t) => t.id), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'DINERS', 'HORMIGA']);
  const diners = r.find((t) => t.id === 'DINERS');
  assert.deepEqual({ nombre: diners.nombre, hoja: diners.hoja, pendiente: diners.pendiente, proximoVence: diners.proximoVence, responsable: diners.responsable },
    { nombre: 'TC Diners · PersonaA', hoja: 'TC Diners', pendiente: 300, proximoVence: '2026-12-25', responsable: 'PersonaA' });
  assert.equal(r.find((t) => t.id === 'IBK_B').responsable, 'PersonaB', 'sin consumos, el titular del catálogo');

  const sinSip = c.map((t) => (t.id === 'SIP' ? Object.assign({}, t, { activa: false }) : t));
  const r2 = L.resumenTarjetas(consumos, '2026-11-06', false, sinSip);
  assert.deepEqual(r2.map((t) => t.id), ['IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'DINERS', 'HORMIGA']);
  // El orden del catálogo manda.
  const reordenado = c.map((t) => (t.id === 'DINERS' ? Object.assign({}, t, { orden: 1 }) : Object.assign({}, t, { orden: t.orden + 1 })));
  assert.equal(L.resumenTarjetas([], '2026-11-06', false, L.catalogoDesde(JSON.stringify(reordenado)))[0].id, 'DINERS');
  // Sin catálogo, igual que siempre.
  assert.deepEqual(L.resumenTarjetas([], '2026-11-06', false).map((t) => t.nombre), ['TC SIP', 'TC IBK · PersonaA', 'TC IBK · PersonaB', 'TC BCP', 'TC Ripley', 'Gastos hormiga']);
});

test('lector y datos de tarjetas con catálogo: tarjetaDeConsumo, medioSugerido y datosTarjetas', () => {
  const c = conDiners();
  const datos = { IBK_P: { digitos: '9034' }, IBK_B: { digitos: '5566' } };
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '5566', datos, c), { tarjeta: 'IBK_B', responsable: 'PersonaB' });
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '0000', datos, c), { tarjeta: 'IBK_P', responsable: '' });
  assert.deepEqual(L.tarjetaDeConsumo('BCP', '', datos, c), { tarjeta: 'BCP', responsable: '' });
  // Con Interbank de PersonaB desactivada, solo queda la de PersonaA aunque los dígitos sean los de ella.
  const sinB = c.map((t) => (t.id === 'IBK_B' ? Object.assign({}, t, { activa: false }) : t));
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '5566', datos, sinB), { tarjeta: 'IBK_P', responsable: '' });
  // Con BCP desactivada, el consumo igual se asigna a BCP (inactiva) para no perderlo.
  const sinBcp = c.map((t) => (t.id === 'BCP' ? Object.assign({}, t, { activa: false }) : t));
  assert.equal(L.tarjetaDeConsumo('BCP', '', datos, sinBcp).tarjeta, 'BCP');
  assert.equal(L.medioSugerido('DINERS', 'TIENDA', c), 'TC_DINERS');
  assert.equal(L.medioSugerido('BCP', 'PLIN-ALGUIEN', c), 'PLIN');
  assert.equal(L.medioSugerido('SIP', 'OECHSLE', null), 'TC_SIP');

  assert.deepEqual(Object.keys(L.datosTarjetasDesde(null, c)), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY', 'DINERS']);
  assert.deepEqual(L.validarDatosTarjeta({ id: 'DINERS', digitos: '1234' }, c).tarjeta.id, 'DINERS');
  assert.equal(L.validarDatosTarjeta({ id: 'DINERS' }, null).error, 'La tarjeta no es válida (SIP, IBK_P, IBK_B, BCP, RIPLEY).');

  const consumos = L.leerConsumos(hojaTc([['PersonaA', 'Noviembre', fecha(2026, 11, 4), 'Viajes', 'Pasaje', 300, '', '', 'Pendiente', '', '', '']]), 'TC Diners', c);
  assert.deepEqual(L.gastoPorPersona(consumos, '2026-11', c)[0].medios, [{ medio: 'TC Diners · PersonaA', monto: 300 }]);
});

test('tarjetasActivas: respeta el orden y deja fuera las inactivas', () => {
  const c = L.catalogoDesde(JSON.stringify([
    { id: 'Z', nombre: 'Zeta', hoja: 'TC Zeta', medio: 'TC_ZETA', color: 'gris', orden: 3 },
    { id: 'X', nombre: 'Equis', hoja: 'TC Equis', medio: 'TC_EQUIS', color: 'gris', orden: 1, activa: false },
    { id: 'Y', nombre: 'Ye', hoja: 'TC Ye', medio: 'TC_YE', color: 'gris', orden: 2 }
  ]));
  assert.deepEqual(c.map((t) => t.id), ['X', 'Y', 'Z']);
  assert.deepEqual(L.tarjetasActivas(c).map((t) => t.id), ['Y', 'Z']);
  assert.deepEqual(L.tarjetasActivas(null).map((t) => t.id), ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY']);
  assert.deepEqual(L.buscarTarjetaCatalogo(c, 'Y').hoja, 'TC Ye');
  assert.equal(L.buscarTarjetaCatalogo(c, 'NO'), null);
});

test('leerConsumos con catálogo: los gastos de una tarjeta desactivada conservan su id (hoja propia)', () => {
  const c = conDiners({ activa: false });
  const consumos = L.leerConsumos(hojaTc([['PersonaA', 'Noviembre', fecha(2026, 11, 4), 'Viajes', 'Pasaje', 300, '', '', 'Pendiente', '', '', '']]), 'TC Diners', c);
  assert.equal(consumos[0].tarjeta, 'DINERS');
  // Pero el resumen ya no la lista.
  assert.ok(!L.resumenTarjetas(consumos, '2026-11-06', false, c).some((t) => t.id === 'DINERS'));
});

test('eventosDeVencimiento y proximosVencimientos con catálogo: la tarjeta nueva entra con su etiqueta', () => {
  const c = conDiners();
  const consumos = L.leerConsumos(hojaTc([['PersonaA', 'Noviembre', fecha(2026, 11, 4), 'Viajes', 'Pasaje', 300, fecha(2026, 11, 30), fecha(2026, 12, 25), 'Pendiente', '', '', '']]), 'TC Diners', c);
  const resumen = L.resumenTarjetas(consumos, '2026-11-06', false, c);
  assert.deepEqual(L.proximosVencimientos(resumen), [{ tarjeta: 'DINERS', nombre: 'TC Diners · PersonaA', vence: '2026-12-25', monto: 300 }]);
  const ev = L.eventosDeVencimiento(resumen);
  assert.equal(ev[0].clave, 'DINERS|2026-12-25');
  assert.equal(ev[0].titulo, 'Vence TC Diners · PersonaA: S/ 300');
  const sinDiners = c.map((t) => (t.id === 'DINERS' ? Object.assign({}, t, { activa: false }) : t));
  assert.deepEqual(L.eventosDeVencimiento(L.resumenTarjetas(consumos, '2026-11-06', false, sinDiners)), []);
});

test('avisosDelDia y textoAvisos con catálogo: avisa de la tarjeta nueva por su nombre', () => {
  const c = conDiners();
  const consumos = L.leerConsumos(hojaTc([['PersonaA', 'Noviembre', fecha(2026, 11, 4), 'Viajes', 'Pasaje', 300, fecha(2026, 11, 30), fecha(2026, 12, 25), 'Pendiente', '', '', '']]), 'TC Diners', c);
  const av = L.avisosDelDia(L.resumenTarjetas(consumos, '2026-12-22', false, c), '2026-12-22', []);
  assert.deepEqual(av.map((a) => [a.tarjeta, a.cuando, a.monto]), [['DINERS', 'en_3_dias', 300]]);
  assert.equal(L.textoAvisos(av).asunto, 'FinFamily: TC Diners · PersonaA vence en 3 días (S/ 300)');
});

test('validarTarjetaCatalogo: edición parcial solo devuelve lo que vino', () => {
  assert.deepEqual(L.validarTarjetaCatalogo({ color: 'LIMA' }, false), { campos: { color: 'lima' } });
  assert.deepEqual(L.validarTarjetaCatalogo({ titular: '' }, false), { campos: { titular: '' } });
  assert.deepEqual(L.validarTarjetaCatalogo({ titular: null }, false), { campos: { titular: '' } });
  assert.deepEqual(L.validarTarjetaCatalogo({ nombre: 'Ok' }, false), { campos: { nombre: 'Ok' } });
  assert.equal(L.validarTarjetaCatalogo({ titular: 'x'.repeat(41) }, false).error, 'El titular es muy largo.');
  assert.equal(L.validarTarjetaCatalogo({ orden: 0 }, false).error, 'El orden debe ser un número entero.');
  assert.equal(L.validarTarjetaCatalogo(null, true).error, 'El nombre de la tarjeta debe tener entre 2 y 30 letras.');
});

test('construirFila con catálogo: el medio directo se etiqueta igual y las tarjetas no llevan medio', () => {
  const c = conDiners();
  const cols = L.mapearColumnas(['Responsable', 'Mes', 'Fecha', 'Concepto', 'Descripción', 'Monto', 'Medio de Pago', 'Estado']);
  const fila = L.construirFila(cols, 8, { idCliente: 'x', monto: 5, medio: 'PLIN', concepto: 'Delivery', descripcion: 'Algo', fecha: '2026-11-04' }, 'PersonaB', 'Gastos Hormiga', null, c);
  assert.equal(fila[6], 'Plin');
  assert.equal(fila[7], 'Pagado');
  const colsTc = L.mapearColumnas(ENC);
  const filaTc = L.construirFila(colsTc, 12, { idCliente: 'x', monto: 5, medio: 'TC_DINERS', concepto: 'Delivery', descripcion: 'Algo', fecha: '2026-11-04' }, 'PersonaA', 'TC Diners', L.calcularCiclo('DINERS', '2026-11-04', c), c);
  assert.equal(filaTc[8], 'Pendiente');
  assert.equal(filaTc[7].getDate(), 25);
});

// ===========================================================================
// Motor 1.6: tarjeta explícita en _id_form (quién gastó vs. con qué tarjeta)
// ===========================================================================

test('partesIdForm y armarIdForm: el sufijo |TC:<ID> va después de la base', () => {
  assert.deepEqual(L.partesIdForm('APP:abc-123'), { base: 'APP:abc-123', tarjeta: '', origen: '' });
  assert.deepEqual(L.partesIdForm('APP:abc-123|TC:IBK_B'), { base: 'APP:abc-123', tarjeta: 'IBK_B', origen: '' });
  assert.deepEqual(L.partesIdForm('  APP:abc|TC:DINERS_2|otro  '), { base: 'APP:abc', tarjeta: 'DINERS_2', origen: '' });
  assert.deepEqual(L.partesIdForm('WEB:0000-aaaa'), { base: 'WEB:0000-aaaa', tarjeta: '', origen: '' });
  assert.deepEqual(L.partesIdForm('|TC:IBK_B'), { base: '', tarjeta: 'IBK_B', origen: '' });
  assert.deepEqual(L.partesIdForm(''), { base: '', tarjeta: '', origen: '' });
  assert.deepEqual(L.partesIdForm(null), { base: '', tarjeta: '', origen: '' });
  assert.equal(L.armarIdForm('APP:abc', 'IBK_B'), 'APP:abc|TC:IBK_B');
  assert.equal(L.armarIdForm('APP:abc', ''), 'APP:abc');
  assert.equal(L.armarIdForm('', 'IBK_B'), '|TC:IBK_B');
  assert.deepEqual(L.partesIdForm(L.armarIdForm('APP:x', 'BCP')), { base: 'APP:x', tarjeta: 'BCP', origen: '' });
});

test('tarjetaDeFila: el sufijo manda solo si la tarjeta existe, está activa y es de esa hoja', () => {
  const c = L.catalogoDesde(null);
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x|TC:IBK_B', c), { tarjeta: 'IBK_B', explicita: true });
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaB', 'APP:x|TC:IBK_P', c), { tarjeta: 'IBK_P', explicita: true });
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x', c), { tarjeta: 'IBK_P', explicita: false });
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x|TC:NO_EXISTE', c), { tarjeta: 'IBK_P', explicita: false });
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x|TC:BCP', c), { tarjeta: 'IBK_P', explicita: false }, 'BCP es de otra hoja');
  const sinB = c.map((t) => (t.id === 'IBK_B' ? Object.assign({}, t, { activa: false }) : t));
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x|TC:IBK_B', sinB), { tarjeta: 'IBK_P', explicita: false }, 'inactiva: regla de siempre');
  assert.deepEqual(L.tarjetaDeFila('Gastos Hormiga', 'PersonaA', 'APP:x|TC:IBK_B', c), { tarjeta: 'HORMIGA', explicita: false });
  assert.deepEqual(L.tarjetaDeFila('TC IBK', 'PersonaA', 'APP:x|TC:IBK_B'), { tarjeta: 'IBK_B', explicita: true }, 'sin catálogo usa el inicial');
});

test('esPrestada: solo cuando la tarjeta tiene titular y gastó otra persona', () => {
  const c = L.catalogoDesde(null);
  assert.equal(L.esPrestada('IBK_B', 'PersonaA', c), true);
  assert.equal(L.esPrestada('IBK_B', 'PersonaB', c), false);
  assert.equal(L.esPrestada('IBK_P', 'PersonaA', c), false, 'el titular "PersonaA" coincide con "PersonaA"');
  assert.equal(L.esPrestada('BCP', 'PersonaB', c), false, 'tarjeta sin titular');
  assert.equal(L.esPrestada('IBK_B', '', c), false, 'sin responsable no se sabe');
  assert.equal(L.esPrestada('HORMIGA', 'PersonaB', c), false);
});

test('leerConsumos con sufijo: el consumo es de la tarjeta de PersonaB aunque gastó PersonaA; el resumen y las personas lo reflejan', () => {
  const c = L.catalogoDesde(null);
  const consumos = L.leerConsumos(hojaTc([
    ['PersonaA', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Con la tarjeta de PersonaB', 45, fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', 'APP:uno|TC:IBK_B', ''],
    ['PersonaA', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Con la suya', 10, fecha(2026, 11, 30), fecha(2026, 12, 15), 'Pendiente', '', 'APP:dos', ''],
    ['PersonaB', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'PersonaB con la suya', 7, fecha(2026, 11, 30), fecha(2026, 12, 20), 'Pendiente', '', 'APP:tres', '']
  ]), 'TC IBK', c);
  assert.deepEqual(consumos.map((x) => [x.tarjeta, x.responsable, x.prestada, x.idForm]), [
    ['IBK_B', 'PersonaA', true, 'APP:uno|TC:IBK_B'], ['IBK_P', 'PersonaA', false, 'APP:dos'], ['IBK_B', 'PersonaB', false, 'APP:tres']
  ]);
  const r = L.resumenTarjetas(consumos, '2026-11-06', false, c);
  const ibkB = r.find((t) => t.id === 'IBK_B'), ibkP = r.find((t) => t.id === 'IBK_P');
  assert.equal(ibkB.pendiente, 52, 'la deuda suma en la tarjeta de PersonaB');
  assert.equal(ibkP.pendiente, 10);
  assert.equal(ibkB.responsable, 'PersonaB', 'con dos personas en sus consumos, manda el titular');
  assert.deepEqual(ibkB.estados[0].consumos[0], {
    fila: 3, idForm: 'APP:uno', fecha: '2026-11-05', concepto: 'Delivery', descripcion: 'Con la tarjeta de PersonaB', monto: 45,
    estado: 'Pendiente', nota: '', medio: '', responsable: 'PersonaA', tarjetaId: 'IBK_B', prestada: true, origen: ''
  });
  assert.equal(ibkB.estados[0].consumos[1].prestada, undefined, 'solo aparece cuando es prestada');
  assert.equal(ibkB.estados[0].consumos[1].tarjetaId, 'IBK_B');
  // El gasto cuenta para quien gastó (PersonaA), con el medio de la tarjeta usada.
  const personas = L.gastoPorPersona(consumos, '2026-11', c);
  assert.deepEqual(personas.map((p) => [p.nombre, p.total]), [['PersonaA', 55], ['PersonaB', 7]]);
  assert.deepEqual(personas[0].medios, [{ medio: 'TC IBK · PersonaB', monto: 45 }, { medio: 'TC IBK · PersonaA', monto: 10 }]);
});

test('leerConsumos: sufijo con tarjeta inactiva o inexistente vuelve a la regla de siempre', () => {
  const c = L.catalogoDesde(null);
  const filas = hojaTc([
    ['PersonaA', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Uno', 45, '', '', 'Pendiente', '', 'APP:uno|TC:IBK_B', ''],
    ['PersonaB', 'Noviembre', fecha(2026, 11, 5), 'Delivery', 'Dos', 5, '', '', 'Pendiente', '', 'APP:dos|TC:FANTASMA', '']
  ]);
  const sinB = c.map((t) => (t.id === 'IBK_B' ? Object.assign({}, t, { activa: false }) : t));
  assert.deepEqual(L.leerConsumos(filas, 'TC IBK', sinB).map((x) => x.tarjeta), ['IBK_P', 'IBK_P']);
  assert.deepEqual(L.leerConsumos(filas, 'TC IBK', c).map((x) => x.tarjeta), ['IBK_B', 'IBK_B']);
  assert.deepEqual(L.leerConsumos(filas, 'TC IBK').map((x) => [x.tarjeta, x.prestada]), [['IBK_B', true], ['IBK_B', false]]);
});

test('construirFila: con tarjetaExplicita escribe el sufijo; sin ella _id_form queda como siempre', () => {
  const cols = L.mapearColumnas(ENC);
  const datos = { idCliente: 'abc-12345', monto: 45, medio: 'TC_IBK', concepto: 'Delivery', descripcion: 'Algo', fecha: '2026-11-05' };
  const c = L.catalogoDesde(null);
  const normal = L.construirFila(cols, 12, datos, 'PersonaA', 'TC IBK', L.calcularCiclo('IBK_P', '2026-11-05', c), c);
  assert.equal(normal[10], 'APP:abc-12345');
  const prestada = L.construirFila(cols, 12, Object.assign({ tarjetaExplicita: 'IBK_B' }, datos), 'PersonaA', 'TC IBK', L.calcularCiclo('IBK_B', '2026-11-05', c), c);
  assert.equal(prestada[10], 'APP:abc-12345|TC:IBK_B');
  assert.equal(prestada[0], 'PersonaA', 'el Responsable es quien gastó');
  assert.equal(prestada[7].getDate(), 20, 'las fechas son las del ciclo de la tarjeta usada');
  assert.equal(prestada[11], normal[11], 'la huella de duplicados no cambia');
});
