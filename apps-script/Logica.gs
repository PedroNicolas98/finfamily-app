/**
 * FinFamily · Logica.gs
 *
 * Solo funciones puras: no usan SpreadsheetApp, Utilities ni ningún servicio
 * de Google. Así se pueden probar en Node (vm) con datos sintéticos.
 *
 * Las constantes se declaran con `var` para que, al cargar el archivo con
 * vm.runInContext, queden visibles también como globales del contexto.
 */

/**
 * Ciclos de facturación de cada tarjeta (editable).
 * cierre: día de corte. Si la compra es después de ese día, pasa al mes siguiente.
 * vence: día de vencimiento del mes siguiente al mes de pago.
 * RIPLEY no tiene ciclo: sus consumos van sin fecha de pago ni vencimiento.
 */
var CICLOS = {
  SIP: { cierre: 10, vence: 3 },
  IBK_P: { cierre: 20, vence: 15 },
  IBK_B: { cierre: 20, vence: 20 },
  BCP: { cierre: 20, vence: 20 },
  RIPLEY: { cierre: null, vence: null }
};

var MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

var ABREV_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Medios de pago que acepta la app (mismo orden que la acción 'config'). */
var MEDIOS = [
  { id: 'TC_SIP', etiqueta: 'TC SIP', hoja: 'TC SIP', tipo: 'tarjeta' },
  { id: 'TC_IBK', etiqueta: 'TC Interbank', hoja: 'TC IBK', tipo: 'tarjeta' },
  { id: 'TC_BCP', etiqueta: 'TC BCP', hoja: 'TC BCP', tipo: 'tarjeta' },
  { id: 'TC_RIPLEY', etiqueta: 'TC Ripley', hoja: 'TC Ripley', tipo: 'tarjeta' },
  { id: 'YAPE', etiqueta: 'Yape', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'PLIN', etiqueta: 'Plin', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'EFECTIVO', etiqueta: 'Efectivo', hoja: 'Gastos Hormiga', tipo: 'directo' }
];

/** Tarjetas en el orden en que se muestran. */
var TARJETAS = [
  { id: 'SIP', nombre: 'TC SIP', hoja: 'TC SIP', responsable: null },
  { id: 'IBK_P', nombre: 'TC IBK · Pedro', hoja: 'TC IBK', responsable: 'Pedro Nicolás' },
  { id: 'IBK_B', nombre: 'TC IBK · Britney', hoja: 'TC IBK', responsable: 'Britney' },
  { id: 'BCP', nombre: 'TC BCP', hoja: 'TC BCP', responsable: null },
  { id: 'RIPLEY', nombre: 'TC Ripley', hoja: 'TC Ripley', responsable: null },
  { id: 'HORMIGA', nombre: 'Gastos hormiga', hoja: 'Gastos Hormiga', responsable: '' }
];

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Minúsculas, sin tildes, espacios colapsados y sin espacios a los costados. */
function normalizar(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Antepone un apóstrofo si el texto empieza con = + - @ (evita fórmulas). */
function neutralizarTexto(t) {
  var s = (t === null || t === undefined) ? '' : String(t);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

/**
 * Índice 0-based de la primera fila (entre las primeras 8) que tiene una celda
 * cuyo texto normalizado es igual a la clave o empieza con ella. -1 si no hay.
 */
function buscarFilaEncabezado(valores2D, clave) {
  var c = normalizar(clave);
  if (!c || !valores2D) return -1;
  var limite = Math.min(valores2D.length, 8);
  for (var i = 0; i < limite; i++) {
    var fila = valores2D[i] || [];
    for (var j = 0; j < fila.length; j++) {
      var n = normalizar(fila[j]);
      if (n && (n === c || n.indexOf(c) === 0)) return i;
    }
  }
  return -1;
}

/** Índices 0-based de cada columna conocida (o -1 si no existe). */
function mapearColumnas(filaEncabezado) {
  var cols = {
    responsable: -1, mes: -1, fecha: -1, concepto: -1, descripcion: -1, monto: -1,
    fechaPago: -1, fechaVencimiento: -1, estado: -1, nota: -1, medio: -1,
    idForm: -1, huella: -1
  };
  var fila = filaEncabezado || [];
  for (var j = 0; j < fila.length; j++) {
    var n = normalizar(fila[j]);
    if (!n) continue;
    var clave = null;
    if (n === 'responsable') clave = 'responsable';
    else if (n === 'mes') clave = 'mes';
    else if (n === 'fecha') clave = 'fecha';
    else if (n.indexOf('concepto') === 0) clave = 'concepto';
    else if (n.indexOf('descripcion') === 0) clave = 'descripcion';
    else if (n.indexOf('monto') === 0) clave = 'monto';
    else if (n.indexOf('fecha de pago') === 0) clave = 'fechaPago';
    else if (n.indexOf('fecha de venc') === 0) clave = 'fechaVencimiento';
    else if (n === 'estado') clave = 'estado';
    else if (n.indexOf('nota') === 0) clave = 'nota';
    else if (n.indexOf('medio') === 0) clave = 'medio';
    else if (n === '_id_form') clave = 'idForm';
    else if (n === '_huella_form') clave = 'huella';
    if (clave && cols[clave] === -1) cols[clave] = j;
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Fechas y montos
// ---------------------------------------------------------------------------

function esFechaValida_(d) {
  return Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime());
}

function crearFecha_(y, m, d) {
  // m es 1-based. Valida que la fecha exista (ej. 31/02 no vale).
  if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  var f = new Date(y, m - 1, d);
  if (f.getFullYear() !== y || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
  return f;
}

/** Date a medianoche local, o null. Acepta Date, 'dd/mm/yyyy' y 'yyyy-mm-dd'. */
function parsearFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (esFechaValida_(valor)) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  if (typeof valor !== 'string') return null;
  var s = valor.trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    var anio = Number(m[3]);
    if (m[3].length === 2) anio += 2000;
    return crearFecha_(anio, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return crearFecha_(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function dosDigitos_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** 'YYYY-MM-DD' o '' si no es una fecha válida. */
function fechaISO(date) {
  var d = esFechaValida_(date) ? date : parsearFecha(date);
  if (!d) return '';
  return d.getFullYear() + '-' + dosDigitos_(d.getMonth() + 1) + '-' + dosDigitos_(d.getDate());
}

/** Número o null. Acepta 145, 'S/.1,234.50', 'S/ 1,234.50', '-S/.12.00'. */
function parsearMonto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return isFinite(valor) ? Math.round(valor * 100) / 100 : null;
  if (typeof valor !== 'string') return null;
  var s = valor.trim();
  if (!s) return null;
  var negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  s = s.replace(/\s+/g, '');
  if (s.charAt(0) === '-') { negativo = !negativo; s = s.slice(1); }
  s = s.replace(/^(S\/\.?|PEN|S\.)/i, '');
  if (s.charAt(0) === '-') { negativo = !negativo; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  var ultComa = s.lastIndexOf(',');
  var ultPunto = s.lastIndexOf('.');
  if (ultComa > -1 && ultPunto > -1) {
    if (ultComa > ultPunto) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
    else s = s.replace(/,/g, ''); // 1,234.50
  } else if (ultComa > -1) {
    // Solo comas: si son miles (1,234 o 1,234,567) se quitan; si no, es decimal (12,5).
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else return null;
  }
  if ((s.match(/\./g) || []).length > 1) return null;
  var n = Number(s);
  if (!isFinite(n)) return null;
  n = Math.round(n * 100) / 100;
  return negativo ? -n : n;
}

/** 'YYYY-MM-DD' -> 'Noviembre'. '' si no es válida. */
function nombreMes(fechaTexto) {
  var d = parsearFecha(fechaTexto);
  return d ? MESES_ES[d.getMonth()] : '';
}

/** '2026-11' -> 'nov-26'. '' si no es válida. */
function claveAEtiqueta(clave) {
  var m = String(clave || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var mes = Number(m[2]);
  if (mes < 1 || mes > 12) return '';
  return ABREV_MES[mes - 1] + '-' + m[1].slice(2);
}

/** 'nov-26' -> '2026-11'. null si no es válida. También acepta 'nov. 2026', 'set-26'. */
function etiquetaAClave(etiqueta) {
  var n = normalizar(etiqueta);
  var m = n.match(/^([a-z]{3,})\.?\s*[-\/ ]?\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  var abrev = m[1].slice(0, 3);
  if (abrev === 'set') abrev = 'sep';
  var idx = ABREV_MES.indexOf(abrev);
  if (idx === -1) return null;
  // Si viene el nombre largo, tiene que ser un mes real (ej. 'noviembre').
  if (m[1].length > 3) {
    var largo = normalizar(MESES_ES[idx]);
    if (largo.indexOf(m[1]) !== 0 && !(abrev === 'sep' && 'setiembre'.indexOf(m[1]) === 0)) return null;
  }
  var anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return anio + '-' + dosDigitos_(idx + 1);
}

function diasEntre_(desdeISO, hastaISO) {
  var a = parsearFecha(desdeISO);
  var b = parsearFecha(hastaISO);
  if (!a || !b) return null;
  var ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  var ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

// ---------------------------------------------------------------------------
// Tarjetas y ciclos
// ---------------------------------------------------------------------------

/** Identificador de tarjeta según la hoja (y el responsable en TC IBK). */
function idTarjeta(hoja, responsable) {
  var h = normalizar(hoja);
  if (h === 'tc sip') return 'SIP';
  if (h === 'tc ibk') return normalizar(responsable) === 'britney' ? 'IBK_B' : 'IBK_P';
  if (h === 'tc bcp') return 'BCP';
  if (h === 'tc ripley') return 'RIPLEY';
  if (h === 'gastos hormiga') return 'HORMIGA';
  return null;
}

/**
 * Fecha de pago y vencimiento de una compra.
 * m = mes de la compra; si el día pasa el cierre, m = m + 1.
 * Pago = último día del mes m. Vence = día 'vence' del mes m + 1.
 */
function calcularCiclo(idCiclo, fechaCompra) {
  var vacio = { pago: '', vence: '' };
  var c = CICLOS[idCiclo];
  if (!c || c.cierre === null || c.cierre === undefined || c.vence === null || c.vence === undefined) return vacio;
  var d = parsearFecha(fechaCompra);
  if (!d) return vacio;
  var y = d.getFullYear();
  var m = d.getMonth(); // 0-based
  if (d.getDate() > c.cierre) m += 1;
  var pago = new Date(y, m + 1, 0); // último día del mes m (Date maneja el cambio de año)
  var diasMesSig = new Date(y, m + 2, 0).getDate();
  var vence = new Date(y, m + 1, Math.min(c.vence, diasMesSig));
  return { pago: fechaISO(pago), vence: fechaISO(vence) };
}

function texto_(v) {
  if (v === null || v === undefined) return '';
  if (esFechaValida_(v)) return fechaISO(v);
  return String(v).trim();
}

function celda_(fila, idx) {
  return idx >= 0 && fila && idx < fila.length ? fila[idx] : '';
}

/**
 * Lee los consumos de una hoja TC o de Gastos Hormiga.
 * valores2D debe empezar en la fila 1 de la hoja (getDataRange().getValues()).
 * Ignora filas sin monto válido y filas sin responsable, fecha, concepto ni descripción.
 */
function leerConsumos(valores2D, hoja) {
  var salida = [];
  if (!valores2D || !valores2D.length) return salida;
  var idxEnc = buscarFilaEncabezado(valores2D, 'responsable');
  if (idxEnc === -1) return salida;
  var cols = mapearColumnas(valores2D[idxEnc]);
  if (cols.monto === -1) return salida;
  for (var i = idxEnc + 1; i < valores2D.length; i++) {
    var f = valores2D[i] || [];
    var monto = parsearMonto(celda_(f, cols.monto));
    if (monto === null) continue;
    var responsable = texto_(celda_(f, cols.responsable));
    var fecha = fechaISO(parsearFecha(celda_(f, cols.fecha)));
    var concepto = texto_(celda_(f, cols.concepto));
    var descripcion = texto_(celda_(f, cols.descripcion));
    if (!responsable && !fecha && !concepto && !descripcion) continue; // p. ej. filas de total
    salida.push({
      fila: i + 1,
      responsable: responsable,
      mes: texto_(celda_(f, cols.mes)),
      fecha: fecha,
      concepto: concepto,
      descripcion: descripcion,
      monto: monto,
      pago: fechaISO(parsearFecha(celda_(f, cols.fechaPago))),
      vence: fechaISO(parsearFecha(celda_(f, cols.fechaVencimiento))),
      estado: texto_(celda_(f, cols.estado)),
      nota: texto_(celda_(f, cols.nota)),
      medio: texto_(celda_(f, cols.medio)),
      idForm: texto_(celda_(f, cols.idForm)),
      huella: texto_(celda_(f, cols.huella)),
      tarjeta: idTarjeta(hoja, responsable)
    });
  }
  return salida;
}

function estaPagado_(estado) {
  return normalizar(estado) === 'pagado';
}

function redondear_(n) {
  return Math.round(n * 100) / 100;
}

function consumoPublico_(c) {
  return {
    fila: c.fila, idForm: c.idForm, fecha: c.fecha, concepto: c.concepto,
    descripcion: c.descripcion, monto: c.monto, estado: c.estado, nota: c.nota, medio: c.medio
  };
}

function compararConsumos_(a, b) {
  if (a.fecha !== b.fecha) {
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return a.fecha < b.fecha ? -1 : 1;
  }
  return a.fila - b.fila;
}

/**
 * Resumen por tarjeta en el orden SIP, IBK_P, IBK_B, BCP, RIPLEY, HORMIGA.
 * Un consumo cuenta como pendiente si su Estado no es 'Pagado'.
 * Con incluirPagados = false solo se listan consumos pendientes y se omiten
 * los estados sin nada pendiente (el total del estado sí suma todo).
 */
function resumenTarjetas(consumos, hoyISO, incluirPagados) {
  var lista = consumos || [];
  var mesHoy = String(hoyISO || '').slice(0, 7);
  var nombreMesHoy = nombreMes(hoyISO);
  var resultado = [];

  for (var t = 0; t < TARJETAS.length; t++) {
    var def = TARJETAS[t];
    var propios = lista.filter(function (c) { return c.tarjeta === def.id; });

    if (def.id === 'HORMIGA') {
      var delMes = propios.filter(function (c) {
        return c.fecha ? c.fecha.slice(0, 7) === mesHoy : normalizar(c.mes) === normalizar(nombreMesHoy);
      }).sort(compararConsumos_);
      var totalMes = 0, pendMes = 0;
      delMes.forEach(function (c) {
        totalMes += c.monto;
        if (!estaPagado_(c.estado)) pendMes += c.monto;
      });
      resultado.push({
        id: def.id, nombre: def.nombre, hoja: def.hoja, responsable: '',
        pendiente: redondear_(totalMes),
        proximoVence: null,
        estados: [{
          vence: '', pago: '', total: redondear_(totalMes), pendiente: redondear_(pendMes),
          consumos: delMes.map(consumoPublico_)
        }]
      });
      continue;
    }

    // Responsable: fijo en TC IBK; en las demás, el único que aparezca (o '').
    var responsable = def.responsable;
    if (responsable === null) {
      var vistos = {};
      propios.forEach(function (c) { if (c.responsable) vistos[c.responsable] = true; });
      var nombres = Object.keys(vistos);
      responsable = nombres.length === 1 ? nombres[0] : '';
    }

    var grupos = {};
    var ordenClaves = [];
    propios.forEach(function (c) {
      var k = c.vence || '';
      if (!grupos[k]) { grupos[k] = { vence: k, pago: c.pago || '', total: 0, pendiente: 0, consumos: [] }; ordenClaves.push(k); }
      var g = grupos[k];
      if (!g.pago && c.pago) g.pago = c.pago;
      g.total += c.monto;
      var pagado = estaPagado_(c.estado);
      if (!pagado) g.pendiente += c.monto;
      if (incluirPagados || !pagado) g.consumos.push(c);
    });

    ordenClaves.sort(function (a, b) {
      if (a === b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a < b ? -1 : 1;
    });

    var estados = [];
    var pendienteTotal = 0;
    var proximo = null;
    ordenClaves.forEach(function (k) {
      var g = grupos[k];
      g.total = redondear_(g.total);
      g.pendiente = redondear_(g.pendiente);
      pendienteTotal += g.pendiente;
      if (g.pendiente > 0 && g.vence && (proximo === null || g.vence < proximo)) proximo = g.vence;
      if (!g.consumos.length) return;
      g.consumos.sort(compararConsumos_);
      estados.push({ vence: g.vence, pago: g.pago, total: g.total, pendiente: g.pendiente, consumos: g.consumos.map(consumoPublico_) });
    });

    resultado.push({
      id: def.id, nombre: def.nombre, hoja: def.hoja, responsable: responsable,
      pendiente: redondear_(pendienteTotal),
      proximoVence: proximo,
      estados: estados
    });
  }
  return resultado;
}

/**
 * Alertas por estado de cuenta con saldo pendiente:
 * 'vencida' si vence antes de hoy; 'por_vencer' si vence entre hoy y diasAviso días.
 */
function alertas(resumen, hoyISO, diasAviso) {
  var aviso = (diasAviso === undefined || diasAviso === null) ? 3 : Number(diasAviso);
  var salida = [];
  (resumen || []).forEach(function (t) {
    if (t.id === 'HORMIGA') return;
    (t.estados || []).forEach(function (g) {
      if (!g.vence || !(g.pendiente > 0)) return;
      var dias = diasEntre_(hoyISO, g.vence);
      if (dias === null) return;
      var tipo = null;
      if (dias < 0) tipo = 'vencida';
      else if (dias <= aviso) tipo = 'por_vencer';
      if (tipo) salida.push({ tipo: tipo, tarjeta: t.id, nombre: t.nombre, vence: g.vence, monto: g.pendiente });
    });
  });
  salida.sort(function (a, b) {
    if (a.tipo !== b.tipo) return a.tipo === 'vencida' ? -1 : 1;
    return a.vence < b.vence ? -1 : (a.vence > b.vence ? 1 : 0);
  });
  return salida;
}

// ---------------------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------------------

function tipoFilaTotal_(n) {
  if (n.indexOf('total ingresos') === 0) return 'ingresos';
  if (n.indexOf('total gastos') === 0) return 'gastos';
  if (n.indexOf('total ahorros') === 0) return 'ahorros';
  if (n.indexOf('saldo personal') === 0) return 'saldoPersonal';
  if (n.indexOf('saldo') === 0 && n.indexOf('superavit') > -1) return 'saldo';
  return null;
}

/**
 * Lee la hoja PRESUPUESTO FAMILIAR para un mes ('YYYY-MM').
 * display2D (getDisplayValues) sirve para encabezados y conceptos;
 * valores2D (getValues) para los números. Los totales se leen de sus filas.
 * Devuelve null si el mes no está en los encabezados.
 */
function leerPresupuesto(display2D, valores2D, claveMes) {
  if (!display2D || !display2D.length) return null;
  var idxEnc = buscarFilaEncabezado(display2D, 'Concepto / Categoría');
  if (idxEnc === -1) idxEnc = buscarFilaEncabezado(display2D, 'Concepto');
  if (idxEnc === -1) return null;
  var enc = display2D[idxEnc] || [];

  var colConcepto = 0;
  for (var j = 0; j < enc.length; j++) {
    if (normalizar(enc[j]).indexOf('concepto') === 0) { colConcepto = j; break; }
  }

  var meses = [];
  var colPorClave = {};
  for (var k = 0; k < enc.length; k++) {
    if (k === colConcepto) continue;
    var clave = etiquetaAClave(enc[k]);
    if (clave && colPorClave[clave] === undefined) {
      colPorClave[clave] = k;
      meses.push({ clave: clave, etiqueta: claveAEtiqueta(clave) });
    }
  }
  var col = colPorClave[claveMes];
  if (col === undefined) return null;
  var colsMeses = meses.map(function (m) { return colPorClave[m.clave]; });

  var filas = [];
  var totales = { ingresos: 0, gastos: 0, ahorros: 0, saldo: 0, saldoPersonal: 0 };
  var fase = 'ingresos'; // ingresos -> gastos -> fin
  for (var i = idxEnc + 1; i < display2D.length; i++) {
    var concepto = texto_(celda_(display2D[i], colConcepto));
    if (!concepto) continue;
    var n = normalizar(concepto);
    var filaValores = (valores2D && valores2D[i]) || [];
    var total = tipoFilaTotal_(n);
    if (total) {
      var v = parsearMonto(celda_(filaValores, col));
      totales[total] = v === null ? 0 : v;
      if (total === 'ingresos' && fase === 'ingresos') fase = 'gastos';
      if (total === 'gastos') fase = 'fin';
      continue;
    }
    if (fase === 'fin') continue;
    // Filas de título de sección (sin ningún valor en los meses) no se listan.
    var tieneValor = colsMeses.some(function (c) {
      var x = celda_(filaValores, c);
      return x !== '' && x !== null && x !== undefined;
    });
    if (!tieneValor) continue;
    var seccion = fase === 'ingresos' ? 'ingresos'
      : ((n.indexOf('ahorro') === 0 || n.indexOf('fondo') === 0) ? 'ahorros' : 'gastos');
    var monto = parsearMonto(celda_(filaValores, col));
    filas.push({ concepto: concepto, seccion: seccion, monto: monto === null ? 0 : monto });
  }

  return {
    meses: meses,
    mes: claveMes,
    etiquetaMes: claveAEtiqueta(claveMes),
    filas: filas,
    totales: totales
  };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD|123.45|descripcion normalizada' para detectar duplicados. */
function firmaGasto(gasto) {
  var g = gasto || {};
  var monto = parsearMonto(g.monto);
  return fechaISO(parsearFecha(g.fecha)) + '|' +
    (monto === null ? '' : monto.toFixed(2)) + '|' +
    normalizar(g.descripcion);
}

function etiquetaMedio_(idMedio) {
  for (var i = 0; i < MEDIOS.length; i++) {
    if (MEDIOS[i].id === idMedio) return MEDIOS[i].etiqueta;
  }
  return '';
}

/**
 * Arma la fila a escribir (longitud anchoFila). Celdas sin columna quedan ''.
 * datos: {idCliente, monto, medio, concepto, descripcion, nota, fecha}
 * ciclo: {pago, vence} de calcularCiclo (solo tarjetas).
 */
function construirFila(columnas, anchoFila, datos, usuarioNombre, hoja, ciclo) {
  var fila = [];
  for (var i = 0; i < anchoFila; i++) fila.push('');
  var cols = columnas || {};
  var d = datos || {};
  var poner = function (idx, valor) {
    if (typeof idx === 'number' && idx >= 0 && idx < anchoFila) fila[idx] = valor;
  };
  var esHormiga = idTarjeta(hoja, usuarioNombre) === 'HORMIGA';
  var monto = parsearMonto(d.monto);
  var fechaTexto = fechaISO(parsearFecha(d.fecha));

  poner(cols.responsable, usuarioNombre || '');
  poner(cols.mes, nombreMes(fechaTexto));
  poner(cols.fecha, parsearFecha(fechaTexto) || '');
  poner(cols.concepto, neutralizarTexto(d.concepto));
  poner(cols.descripcion, neutralizarTexto(d.descripcion));
  poner(cols.monto, monto === null ? '' : monto);
  if (!esHormiga) {
    var c = ciclo || {};
    poner(cols.fechaPago, parsearFecha(c.pago) || '');
    poner(cols.fechaVencimiento, parsearFecha(c.vence) || '');
  } else {
    poner(cols.medio, etiquetaMedio_(d.medio));
  }
  poner(cols.estado, esHormiga ? 'Pagado' : 'Pendiente');
  poner(cols.nota, neutralizarTexto(d.nota || ''));
  poner(cols.idForm, 'APP:' + (d.idCliente || ''));
  poner(cols.huella, firmaGasto({ fecha: fechaTexto, monto: monto, descripcion: d.descripcion }));
  return fila;
}

if (typeof module !== 'undefined') {
  module.exports = {
    CICLOS: CICLOS,
    MESES_ES: MESES_ES,
    ABREV_MES: ABREV_MES,
    MEDIOS: MEDIOS,
    TARJETAS: TARJETAS,
    normalizar: normalizar,
    neutralizarTexto: neutralizarTexto,
    buscarFilaEncabezado: buscarFilaEncabezado,
    mapearColumnas: mapearColumnas,
    parsearFecha: parsearFecha,
    fechaISO: fechaISO,
    parsearMonto: parsearMonto,
    nombreMes: nombreMes,
    claveAEtiqueta: claveAEtiqueta,
    etiquetaAClave: etiquetaAClave,
    idTarjeta: idTarjeta,
    calcularCiclo: calcularCiclo,
    leerConsumos: leerConsumos,
    resumenTarjetas: resumenTarjetas,
    alertas: alertas,
    leerPresupuesto: leerPresupuesto,
    firmaGasto: firmaGasto,
    construirFila: construirFila
  };
}
