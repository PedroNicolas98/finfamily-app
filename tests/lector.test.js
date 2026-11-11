// Pruebas del lector de correos de bancos (apps-script/Logica.gs, motor 1.3).
// Se ejecutan con: npm test
// Todos los correos son SINTÉTICOS: imitan la forma de los avisos de consumo
// de cada banco, pero los montos, comercios y dígitos son inventados.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'apps-script', 'Logica.gs'));

function correo(remitente, asunto, cuerpo, fechaISO) {
  return { remitente, asunto, cuerpo, fechaISO: fechaISO || '2026-11-09T21:00:00' };
}

// ---------- BCP ----------

test('BCP: consumo en soles con comercio, últimos 4 y fecha del cuerpo', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'BCP <notificaciones@bcp.com.pe>',
    'Realizaste un consumo con tu Tarjeta de Crédito BCP',
    'Hola PersonaA,\n\nRealizaste un consumo de S/ 85.90 en PLAZA VEA con tu Tarjeta de Crédito terminada en 4821 ' +
    'el 09/11/2026 a las 20:15.\n\nSi no reconoces esta operación, llámanos al 311-9898.'
  ));
  assert.deepEqual(r, {
    banco: 'BCP', monto: 85.9, moneda: 'PEN', comercio: 'PLAZA VEA', ultimos4: '4821', fecha: '2026-11-09', tipo: 'consumo'
  });
});

test('BCP: monto con miles "S/ 1,234.50" y comercio en formato "Comercio:"', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'bcp@bcp.com.pe',
    'Operación realizada',
    'Te informamos que se realizó una operación con tu tarjeta.\n' +
    'Comercio: SAGA FALABELLA SAN MIGUEL\nMonto: S/ 1,234.50\nFecha: 08/11/2026 19:02\nTarjeta: **** 1177\n'
  ));
  assert.equal(r.monto, 1234.5);
  assert.equal(r.moneda, 'PEN');
  assert.equal(r.comercio, 'SAGA FALABELLA SAN MIGUEL');
  assert.equal(r.ultimos4, '1177');
  assert.equal(r.fecha, '2026-11-08');
});

test('BCP: pago recibido NO es consumo', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'notificaciones@bcp.com.pe',
    'Pago recibido de tu Tarjeta de Crédito',
    'Recibimos tu pago de S/ 1,500.00 a tu Tarjeta de Crédito terminada en 4821. Gracias.'
  ));
  assert.equal(r, null);
});

test('BCP: estado de cuenta NO es consumo', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'bcp@bcp.com.pe', 'Tu estado de cuenta ya está disponible',
    'Ya puedes revisar tu estado de cuenta de noviembre. Total a pagar: S/ 2,310.00. Paga hasta el 20/11/2026.'
  )), null);
});

// ---------- Interbank ----------

test('Interbank: compra en soles "S/. 45" sin decimales, fecha con guiones', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'Interbank <alertas@interbank.pe>',
    'Compra con tu Tarjeta Interbank',
    'Hola PersonaB, realizaste una compra por S/. 45 en TOTTUS LA MARINA con tu tarjeta Visa **** 9034 el 07-11-2026 a las 13:40.'
  ));
  assert.deepEqual(r, {
    banco: 'IBK', monto: 45, moneda: 'PEN', comercio: 'TOTTUS LA MARINA', ultimos4: '9034', fecha: '2026-11-07', tipo: 'consumo'
  });
});

test('Interbank (dominio .com.pe): consumo en dólares "US$ 20.00" se guarda como USD', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'notificaciones@interbank.com.pe',
    'Consumo realizado',
    'Realizaste un consumo de US$ 20.00 en NETFLIX.COM con tu Tarjeta de Crédito terminada en 5566 el 09/11/2026.'
  ));
  assert.equal(r.banco, 'IBK');
  assert.equal(r.monto, 20);
  assert.equal(r.moneda, 'USD');
  assert.equal(r.comercio, 'NETFLIX.COM');
  assert.equal(r.ultimos4, '5566');
});

test('Interbank: "USD 20" sin símbolo también es dólares; sin fecha en el cuerpo usa la del correo', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'alertas@interbank.pe', 'Transacción con tu tarjeta',
    'Se registró una transacción por USD 20 en AMAZON MKTPLACE con tu tarjeta que termina en 2210.',
    '2026-11-05T08:30:00'
  ));
  assert.equal(r.moneda, 'USD');
  assert.equal(r.monto, 20);
  assert.equal(r.comercio, 'AMAZON MKTPLACE');
  assert.equal(r.ultimos4, '2210');
  assert.equal(r.fecha, '2026-11-05');
});

test('Interbank: código de seguridad NO es consumo', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'alertas@interbank.pe', 'Tu código de seguridad',
    'Tu código de seguridad es 482913. Vence en 5 minutos. No lo compartas.'
  )), null);
});

// ---------- Ripley ----------

test('Ripley: consumo con "S/" sin espacio y tarjeta "terminación"', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'Banco Ripley <avisos@bancoripley.com.pe>',
    'Aviso de consumo Tarjeta Ripley',
    'Estimado cliente, se realizó un consumo por S/120.00 en RIPLEY SAN ISIDRO con su Tarjeta Ripley Mastercard terminación 7788 el día 06/11/2026.'
  ));
  assert.equal(r.banco, 'RIPLEY');
  assert.equal(r.monto, 120);
  assert.equal(r.comercio, 'RIPLEY SAN ISIDRO');
  assert.equal(r.ultimos4, '7788');
  assert.equal(r.fecha, '2026-11-06');
});

test('Ripley: publicidad con montos NO es consumo', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'ofertas@bancoripley.com.pe', 'Ofertas exclusivas: hasta 50 % de descuento',
    'Aprovecha compras desde S/ 99.90 con tu Tarjeta Ripley. Solo por hoy.'
  )), null);
});

// ---------- Oh! (SIP) ----------

test('Oh!: consumo con "S/ " y tarjeta en formato "xxxx"', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'Tarjeta Oh! <notificaciones@tarjetaoh.pe>',
    'Consumo con tu Tarjeta Oh!',
    'Hola, realizaste un consumo de S/ 59.50 en PROMART con tu Tarjeta Oh! XXXXXXXXX8304 el 09/11/2026 a las 11:05.'
  ));
  assert.deepEqual(r, {
    banco: 'SIP', monto: 59.5, moneda: 'PEN', comercio: 'PROMART', ultimos4: '8304', fecha: '2026-11-09', tipo: 'consumo'
  });
});

test('Oh! (financieraoh): consumo sin últimos 4 ni comercio claro sigue valiendo', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'alertas@financieraoh.pe', 'Compra realizada',
    'Tu compra de S/ 300 fue aprobada. Gracias por preferirnos.'
  ));
  assert.equal(r.banco, 'SIP');
  assert.equal(r.monto, 300);
  assert.equal(r.ultimos4, '');
  assert.equal(r.comercio, '');
  assert.equal(r.fecha, '2026-11-09');
});

test('Oh!: pago de tarjeta NO es consumo aunque el cuerpo diga "operación"', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'notificaciones@tarjetaoh.pe', 'Gracias por tu pago',
    'Recibimos tu pago de S/ 450.00. La operación se registró el 09/11/2026.'
  )), null);
});

// ---------- Casos generales ----------

test('remitente que no es banco devuelve null aunque hable de consumo', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'tienda@ejemplo.com', 'Tu compra fue confirmada', 'Gracias por tu compra de S/ 80.00 en TIENDA EJEMPLO.'
  )), null);
  assert.equal(L.extraerConsumoDeCorreo(null), null);
  assert.equal(L.extraerConsumoDeCorreo({}), null);
});

test('un correo sin monto con moneda devuelve null', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo(
    'alertas@bcp.com.pe', 'Consumo con tu tarjeta', 'Realizaste un consumo en PLAZA VEA. Revisa tu app.'
  )), null);
});

test('banco por nombre en el asunto cuando el remitente no es del dominio (reenvío)', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'PersonaA <persona-a@example.test>', 'Fwd: Interbank: Compra con tu Tarjeta',
    'Realizaste una compra por S/ 12.50 en METRO con tu tarjeta terminada en 9034 el 01/11/2026.'
  ));
  assert.equal(r.banco, 'IBK');
  assert.equal(r.monto, 12.5);
  // Cada dominio de BANCOS_CORREO se reconoce por sí solo (sin palabras en el asunto).
  for (const b of L.BANCOS_CORREO) {
    for (const d of b.dominios) assert.equal(L.bancoDeCorreo('x@' + d, ''), b.banco, d);
    for (const d of b.dominios) assert.equal(L.bancoDeCorreo('x@correo.' + d, ''), b.banco, 'subdominio ' + d);
  }
  assert.equal(L.bancoDeCorreo('x@bcp.com.pe.falso.com', ''), null);
});

test('el comercio se recorta a 60 letras y se limpia de puntuación', () => {
  const largo = 'A'.repeat(70);
  const r = L.extraerConsumoDeCorreo(correo(
    'alertas@bcp.com.pe', 'Consumo', 'Realizaste un consumo de S/ 10.00 en ' + largo + ' con tu tarjeta terminada en 1111.'
  ));
  assert.equal(r.comercio.length, 60);
  const r2 = L.extraerConsumoDeCorreo(correo(
    'alertas@bcp.com.pe', 'Consumo', 'Realizaste un consumo de S/ 10.00 en "LA LUCHA SANGUCHERIA", con tu tarjeta.'
  ));
  assert.equal(r2.comercio, 'LA LUCHA SANGUCHERIA');
});

test('montos con formato peruano de miles con punto y coma decimal', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    'alertas@bcp.com.pe', 'Consumo', 'Realizaste un consumo de S/ 2.345,10 en TIENDA X con tu tarjeta terminada en 1111.'
  ));
  assert.equal(r.monto, 2345.1);
  const r2 = L.extraerConsumoDeCorreo(correo(
    'alertas@bcp.com.pe', 'Consumo', 'Monto: $ 15.99\nComercio: SPOTIFY'
  ));
  assert.equal(r2.moneda, 'USD');
  assert.equal(r2.monto, 15.99);
  assert.equal(r2.comercio, 'SPOTIFY');
});

// ---------- tarjetaDeConsumo ----------

test('tarjetaDeConsumo: Interbank se decide por los dígitos guardados; los demás bancos son fijos', () => {
  const datos = { IBK_P: { digitos: '9034' }, IBK_B: { digitos: '5566' } };
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '9034', datos), { tarjeta: 'IBK_P', responsable: 'PersonaA' }, 'el responsable sugerido es el titular del catálogo');
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '5566', datos), { tarjeta: 'IBK_B', responsable: 'PersonaB' });
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '0000', datos), { tarjeta: 'IBK_P', responsable: '' });
  assert.deepEqual(L.tarjetaDeConsumo('IBK', '', {}), { tarjeta: 'IBK_P', responsable: '' });
  assert.deepEqual(L.tarjetaDeConsumo('BCP', '9034', datos), { tarjeta: 'BCP', responsable: '' });
  assert.deepEqual(L.tarjetaDeConsumo('SIP', '', null), { tarjeta: 'SIP', responsable: '' });
  assert.deepEqual(L.tarjetaDeConsumo('RIPLEY', '', null), { tarjeta: 'RIPLEY', responsable: '' });
});

// ---------- leerPendientes / pendientesActivos ----------

test('leerPendientes y pendientesActivos: lee la hoja "Por confirmar" y ordena del más reciente', () => {
  const hoja = [
    L.COLUMNAS_POR_CONFIRMAR.slice(),
    ['m1', '2026-11-08', 'BCP', 'BCP', 'PLAZA VEA', 85.9, 'PEN', '4821', '', 'Pendiente', '2026-11-08 20:15', 'Consumo'],
    ['m2', '2026-11-09', 'IBK', 'IBK_B', 'TOTTUS', 'S/ 45.00', 'PEN', '5566', 'PersonaB', 'Pendiente', '2026-11-09 13:40', 'Compra'],
    ['m3', '2026-11-07', 'SIP', 'SIP', 'PROMART', 59.5, 'PEN', '3344', '', 'Confirmado', '2026-11-07 11:05', 'Consumo'],
    ['m4', '2026-11-09', 'IBK', 'IBK_P', 'NETFLIX', 20, 'USD', '9034', 'PersonaA', 'Descartado', '2026-11-09 09:00', 'Consumo'],
    ['', '', '', '', '', '', '', '', '', '', '', '']
  ];
  const todos = L.leerPendientes(hoja);
  assert.equal(todos.length, 4);
  assert.equal(todos[1].monto, 45);
  assert.equal(todos[1].fila, 3);
  const activos = L.pendientesActivos(todos);
  assert.deepEqual(activos.map((p) => p.id), ['m2', 'm1']);
  assert.deepEqual(activos[0], {
    id: 'm2', fecha: '2026-11-09', banco: 'IBK', tarjeta: 'IBK_B', comercio: 'TOTTUS', monto: 45, moneda: 'PEN',
    ultimos4: '5566', responsable: 'PersonaB', fechaCorreo: '2026-11-09 13:40', medioSugerido: 'TC_IBK'
  });
  assert.deepEqual(L.leerPendientes([]), []);
  assert.deepEqual(L.leerPendientes([['otra', 'cosa']]), []);
});

// ---------- Correos REALES observados (motor 1.3.1) ----------

const BCP_REAL_CUERPO = 'Hola PersonaA, Realizaste un consumo de S/ 26.40 con tu Tarjeta de Débito BCP en MERCADO DE PRUEBA. ' +
  'Por tu seguridad, te enviamos los datos de tu operación. Monto Total del consumo S/ 26.40 Datos de la operación ' +
  'Operación realizada Consumo Tarjeta de Débito Fecha y hora 07 de noviembre de 2026 - 05:47 PM ' +
  'Número de Tarjeta de Débito ************4826 Empresa MERCADO DE PRUEBA Número de operación 123456 Descargar ¿No reconoces esta operación? ...';
const BCP_REAL_ASUNTO = 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP';
const BCP_REAL_DE = '"BCP Notificaciones" <notificaciones@notificacionesbcp.com.pe>';

test('BCP real: débito desde notificacionesbcp.com.pe, comercio de "Empresa", fecha en letras y ****4826', () => {
  const r = L.extraerConsumoDeCorreo(correo(BCP_REAL_DE, BCP_REAL_ASUNTO, BCP_REAL_CUERPO, '2026-11-07T17:48:00'));
  assert.deepEqual(r, {
    banco: 'BCP', monto: 26.4, moneda: 'PEN', comercio: 'MERCADO DE PRUEBA', ultimos4: '4826', fecha: '2026-11-07', tipo: 'consumo',
    debito: true, titular: 'PersonaA'
  });
  // El débito sale de la cuenta (efectivo), no de la tarjeta de crédito BCP.
  assert.equal(L.medioSugerido('DEBITO_BCP', 'MERCADO DE PRUEBA'), 'EFECTIVO');
  assert.equal(L.medioSugerido('DEBITO_BCP', 'PLIN-PersonaB'), 'PLIN');
  // Otros comercios vistos con el mismo formato.
  for (const c of ['VEND HAPPYLAND ELAUT', 'IZI*LA TERRACITA', 'JPRADO C49', 'TAMBO CAMACHO', 'PAGOEFECTIVO*SafetyPay']) {
    const cuerpo = BCP_REAL_CUERPO.split('MERCADO DE PRUEBA').join(c);
    assert.equal(L.extraerConsumoDeCorreo(correo(BCP_REAL_DE, BCP_REAL_ASUNTO, cuerpo)).comercio, c, c);
  }
  // Sin la línea "Empresa", toma el comercio de "en X."
  const sinEmpresa = BCP_REAL_CUERPO.replace(' Empresa MERCADO DE PRUEBA', '');
  assert.equal(L.extraerConsumoDeCorreo(correo(BCP_REAL_DE, BCP_REAL_ASUNTO, sinEmpresa)).comercio, 'MERCADO DE PRUEBA');
  assert.equal(L.medioSugerido('BCP', 'MERCADO DE PRUEBA'), 'TC_BCP');
});

test('BCP real con PLIN-: es una transferencia; medio sugerido PLIN y comercio legible', () => {
  const cuerpo = BCP_REAL_CUERPO.split('MERCADO DE PRUEBA').join('PLIN-PersonaB');
  const r = L.extraerConsumoDeCorreo(correo(BCP_REAL_DE, BCP_REAL_ASUNTO, cuerpo));
  assert.equal(r.comercio, 'PLIN-PersonaB');
  assert.equal(r.monto, 26.4);
  assert.equal(L.medioSugerido('BCP', r.comercio), 'PLIN');
  assert.equal(L.comercioLegible(r.comercio), 'Plin a Personab');
  assert.equal(L.comercioLegible('PLIN-PersonaA NICOLA'), 'Plin a Personaa Nicola');
  assert.equal(L.medioSugerido('BCP', 'Plin a Personab'), 'PLIN', 'también sobre el texto ya limpio');
  assert.equal(L.medioSugerido('BCP', 'YAPE-PERSONA DE PRUEBA'), 'YAPE');
  assert.equal(L.comercioLegible('YAPE-PERSONA DE PRUEBA'), 'Yape a Persona De Prueba');
  assert.equal(L.comercioLegible('MERCADO DE PRUEBA'), 'MERCADO DE PRUEBA', 'los demás comercios no se tocan');
  assert.equal(L.comercioLegible(''), '');
  assert.equal(L.medioSugerido('SIP', 'OECHSLE'), 'TC_SIP');
  assert.equal(L.medioSugerido('IBK_B', 'TOTTUS'), 'TC_IBK');
  assert.equal(L.medioSugerido('RIPLEY', 'RIPLEY'), 'TC_RIPLEY');
});

test('Sip real: "Establecimiento:" hasta "Monto:", "S/. 119.00", fecha de operación y XXXXXXXXX8305', () => {
  const r = L.extraerConsumoDeCorreo(correo(
    '"Sip" <no-reply@alertas.sip.pe>',
    'Sip, realizaste un consumo con tu Tarjeta de Crédito Sip',
    'Hola, PersonaA. Has realizado una transacción con tu Tarjeta de Crédito Sip. Tarjeta Titular: XXXXXXXXX8305 ' +
    'Establecimiento: OECHSLE MALL DEL SUR Monto: S/. 119.00 Fecha de operación: 06/11/2026 a las 21:14 Si no reconoces la operación, comunícate ...'
  ));
  assert.deepEqual(r, {
    banco: 'SIP', monto: 119, moneda: 'PEN', comercio: 'OECHSLE MALL DEL SUR', ultimos4: '8305', fecha: '2026-11-06', tipo: 'consumo'
  });
  for (const c of ['CABIFY', '257 SPSA', 'PATIO PANORAMA']) {
    const r2 = L.extraerConsumoDeCorreo(correo('"Sip" <no-reply@servicioalcliente.sip.pe>', 'Sip, realizaste un consumo con tu Tarjeta de Crédito Sip',
      'Hola, PersonaA. Has realizado una transacción con tu Tarjeta de Crédito Sip. Tarjeta Titular: XXXXXXXXX8305 Establecimiento: ' + c +
      ' Monto: S/. 45.50 Fecha de operación: 08/11/2026 a las 10:00'));
    assert.equal(r2.comercio, c, c);
    assert.equal(r2.banco, 'SIP');
  }
});

test('Operaciones Sip (agora.pe): tolerante; con monto en el cuerpo lo toma, sin monto devuelve null', () => {
  const inicio = 'Realizaste una operación ( http://www.sip.pe ) Hola PersonaA Por tu seguridad, te enviamos los datos de tu operación ';
  const de = '"Operaciones Sip" <no-reply@operaciones.agora.pe>';
  const conMonto = L.extraerConsumoDeCorreo(correo(de, 'Realizaste una operación',
    inicio + 'Establecimiento: CABIFY Monto: S/. 18.50 Fecha de operación: 08/11/2026 a las 10:00 Tarjeta: XXXXXXXXX8305'));
  assert.deepEqual(conMonto, { banco: 'SIP', monto: 18.5, moneda: 'PEN', comercio: 'CABIFY', ultimos4: '8305', fecha: '2026-11-08', tipo: 'consumo' });
  const soloMonto = L.extraerConsumoDeCorreo(correo(de, 'Realizaste una operación', inicio + 'Monto S/ 32.00', '2026-11-08T12:00:00'));
  assert.equal(soloMonto.monto, 32);
  assert.equal(soloMonto.fecha, '2026-11-08');
  assert.equal(L.extraerConsumoDeCorreo(correo(de, 'Realizaste una operación', inicio + '...')), null, 'sin monto no hay consumo');
  assert.equal(L.bancoDeCorreo(de, ''), 'SIP');
});

test('Ripley.com: órdenes de compra por internet NO son consumos', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo('Ripley.com <no-reply@ripley.com>', '¡Confirmamos tu compra!',
    'Hola PersonaA, confirmamos tu compra N° 123456 por S/ 259.90. Te avisaremos cuando se despache.')), null);
  assert.equal(L.extraerConsumoDeCorreo(correo('info@postventa.ripley.com', '¡Se entregó tu compra!',
    'Tu compra N° 123456 por S/ 259.90 fue entregada.')), null);
  // Ni siquiera si el remitente fuera del banco: el asunto de orden de compra se descarta.
  assert.equal(L.extraerConsumoDeCorreo(correo('avisos@bancoripley.com.pe', '¡Confirmamos tu compra!',
    'Realizaste una compra por S/ 259.90 en RIPLEY.COM.')), null);
});

// ---------- 1.8.0: Yape y Lemon (datos inventados, mismo formato que los correos reales) ----------

const YAPE = (beneficiario, celularBenef, monto) => correo('YAPE Notificaciones <notificaciones@yape.pe>',
  'Por tu seguridad, te notificaremos por cada yapeo que realices',
  '¡Hola, PersonaA Test! ¡Acabas de yapear exitosamente! Monto de yapeo* S/ ' + monto + ' Yapero PersonaA Test ' +
  'Tu número de celular XXXXXXXXX101 Fecha y Hora de la operación 08 noviembre 2026 - 12:13 p. m. Celular del Beneficiario XXXXXXXXX' +
  celularBenef + ' Nombre del Beneficiario ' + beneficiario + ' Nº de operación 700003 *Por tu seguridad, te notificaremos por cada yapeo que realices. ' +
  'Descargar ... Banco de Crédito BCP ...');

const LEMON = (destino, monto, asunto) => correo('Lemon <notificaciones@lemoncash.com.ar>', asunto || 'Enviaste S/ ' + monto + ' ',
  'Realizaste un envío de soles Descargar PersonaA Prueba Prueba, ¡realizaste un envío exitoso de S/ ' + monto + '!: ' +
  'A continuación, los detalles de la operación: Datos del destinatario: Nombre: ' + destino + ' N° de teléfono: N/A CCI: 00000000000000000000 ' +
  'Entidad: BCP Mensaje: Otros detalles: ID de la operación: abc ID externo: 2026110600000000 Recuerda que nunca te pediremos...');

test('1.8.0: un yapeo a otra persona es un consumo de Yape con fecha, monto y a quién', () => {
  const r = L.extraerConsumoDeCorreo(YAPE('ANA MARIA PRUEBA C.', '222', '3.90'));
  assert.deepEqual(r, { banco: 'YAPE', monto: 3.9, moneda: 'PEN', comercio: 'Yape a Ana Maria Prueba C', ultimos4: '',
    fecha: '2026-11-08', tipo: 'consumo', titular: 'Personaa Test' });
  assert.equal(L.medioSugerido('YAPE', r.comercio), 'YAPE');
  assert.equal(L.extraerConsumoDeCorreo(YAPE('ANA MARIA PRUEBA C.', '222', '1,250.00')).monto, 1250);
});

test('1.8.0: un yapeo a tu propio número (pasar plata a otra app) no es gasto', () => {
  assert.equal(L.extraerConsumoDeCorreo(YAPE('PersonaA Test', '111', '126.00')), null);
  assert.equal(L.extraerConsumoDeCorreo(YAPE('PersonaA Test', '999', '20.00')), null, 'mismo nombre aunque cambie el número');
});

test('1.8.0: avisos de Yape que no son yapeos se ignoran', () => {
  assert.equal(L.extraerConsumoDeCorreo(correo('notificaciones@yape.pe', 'Ingresaste a Yape de forma segura',
    'Hola, PersonaA Esta es la información del equipo donde realizaste la verificación de tu identidad')), null);
  assert.equal(L.extraerConsumoDeCorreo(correo('notificaciones@yape.pe', '¡Listo, activaste tu biometría digital en Yape!', 'Hola')), null);
});

test('1.8.0: un envío de Lemon es un consumo de Lemon (4 decimales, fecha del ID externo)', () => {
  const r = L.extraerConsumoDeCorreo(LEMON('Persona De Prueba', '5.0000'));
  assert.deepEqual(r, { banco: 'LEMON', monto: 5, moneda: 'PEN', comercio: 'Lemon a Persona De Prueba', ultimos4: '',
    fecha: '2026-11-06', tipo: 'consumo', titular: 'Personaa Prueba Prueba' });
  assert.equal(L.medioSugerido('LEMON', r.comercio), 'LEMON');
  assert.equal(L.medioSugerido('BCP', 'Lemon a Alguien'), 'LEMON');
  assert.equal(L.extraerConsumoDeCorreo(LEMON('Persona De Prueba', '61.0200')).monto, 61.02);
  assert.equal(L.extraerConsumoDeCorreo(LEMON('Persona De Prueba', '1250.0000')).monto, 1250);
});

test('1.8.0: Lemon a uno mismo (pagar tu tarjeta) y "Recibiste" no son gastos', () => {
  assert.equal(L.extraerConsumoDeCorreo(LEMON('PersonaA Prueba Prueba', '51.0000')), null);
  assert.equal(L.extraerConsumoDeCorreo(correo('notificaciones@lemoncash.com.ar', 'Recibiste S/ 3 ',
    'Recibiste dinero en tu cuenta Descargar PersonaA Prueba Prueba, ¡recibiste S/ 3.0000!: Datos de origen: Nombre: X')), null);
  assert.equal(L.extraerConsumoDeCorreo(correo('notificaciones@lemoncash.com.ar', 'Tu estado de cuenta mensual ya está disponible', 'Hola')), null);
});

test('1.8.0: un dominio parecido no se hace pasar por Yape', () => {
  assert.equal(L.billeteraDeCorreo('x <notificaciones@yape.pe.falso.com>'), null);
  assert.equal(L.billeteraDeCorreo('x <a@mail.yape.pe>'), 'YAPE');
});


test('1.9.2: primerNombreDeSaludo lee los saludos de los bancos y billeteras', () => {
  assert.equal(L.primerNombreDeSaludo('Hola PersonaB, Realizaste un consumo'), 'PersonaB');
  assert.equal(L.primerNombreDeSaludo('*¡Hola, PERSONA A PRUEBA!*'), 'PERSONA');
  assert.equal(L.primerNombreDeSaludo('Hola PERSONA , te enviamos tu Constancia'), 'PERSONA');
  assert.equal(L.primerNombreDeSaludo('Sin saludo aquí'), '');
});
