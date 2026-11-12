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
  { id: 'EFECTIVO', etiqueta: 'Efectivo', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'LEMON', etiqueta: 'Lemon', hoja: 'Gastos Hormiga', tipo: 'directo' }
];

/** Tarjetas en el orden en que se muestran. */
var TARJETAS = [
  { id: 'SIP', nombre: 'TC SIP', hoja: 'TC SIP', responsable: null },
  { id: 'IBK_P', nombre: 'TC IBK · PersonaA', hoja: 'TC IBK', responsable: 'PersonaA' },
  { id: 'IBK_B', nombre: 'TC IBK · PersonaB', hoja: 'TC IBK', responsable: 'PersonaB' },
  { id: 'BCP', nombre: 'TC BCP', hoja: 'TC BCP', responsable: null },
  { id: 'RIPLEY', nombre: 'TC Ripley', hoja: 'TC Ripley', responsable: null },
  { id: 'HORMIGA', nombre: 'Gastos hormiga', hoja: 'Gastos Hormiga', responsable: '' }
];

// ---------------------------------------------------------------------------
// Catálogo de tarjetas (motor 1.4): reemplaza a CICLOS, MEDIOS, TARJETAS y HOJAS_TC,
// que quedan solo como valor inicial. Se guarda en la propiedad FINFAMILY_CATALOGO.
// ---------------------------------------------------------------------------

/** Colores que la app sabe pintar (aquí solo se validan). */
var COLORES_TARJETA = ['rojo', 'verde', 'turquesa', 'azul', 'gris', 'naranja', 'vino', 'lima', 'celeste', 'marino', 'dorado', 'grafito'];

/** Medios de pago directos (van a Gastos Hormiga); no dependen del catálogo. */
var MEDIOS_DIRECTOS = [
  { id: 'YAPE', etiqueta: 'Yape', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'PLIN', etiqueta: 'Plin', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'EFECTIVO', etiqueta: 'Efectivo', hoja: 'Gastos Hormiga', tipo: 'directo' },
  { id: 'LEMON', etiqueta: 'Lemon', hoja: 'Gastos Hormiga', tipo: 'directo' }
];

/**
 * Catálogo inicial (el de siempre). `etiqueta` es el nombre que muestra la app en los
 * resúmenes y avisos; las tarjetas nuevas lo arman solas ("TC <nombre> · <titular>").
 */
var CATALOGO_DEFECTO = [
  { id: 'SIP', nombre: 'SIP · Oh!', titular: '', hoja: 'TC SIP', medio: 'TC_SIP', cierre: 10, vence: 3, color: 'rojo', activa: true, orden: 1, etiqueta: 'TC SIP' },
  { id: 'IBK_P', nombre: 'Interbank', titular: 'PersonaA', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 15, color: 'verde', activa: true, orden: 2, etiqueta: 'TC IBK · PersonaA' },
  { id: 'IBK_B', nombre: 'Interbank', titular: 'PersonaB', hoja: 'TC IBK', medio: 'TC_IBK', cierre: 20, vence: 20, color: 'turquesa', activa: true, orden: 3, etiqueta: 'TC IBK · PersonaB' },
  { id: 'BCP', nombre: 'BCP', titular: '', hoja: 'TC BCP', medio: 'TC_BCP', cierre: 20, vence: 20, color: 'azul', activa: true, orden: 4, etiqueta: 'TC BCP' },
  { id: 'RIPLEY', nombre: 'Ripley', titular: '', hoja: 'TC Ripley', medio: 'TC_RIPLEY', cierre: null, vence: null, color: 'gris', activa: true, orden: 5, etiqueta: 'TC Ripley' }
];

function diaValido_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,2}$/.test(v.trim()) ? Number(v) : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : NaN;
}

function copiarTarjeta_(t) {
  var c = {
    id: String(t.id), nombre: String(t.nombre || ''), titular: String(t.titular || ''), hoja: String(t.hoja || ''),
    medio: String(t.medio || ''), cierre: t.cierre, vence: t.vence, color: String(t.color || 'gris'),
    activa: t.activa !== false, orden: Number(t.orden) || 0
  };
  if (t.etiqueta) c.etiqueta = String(t.etiqueta);
  return c;
}

/**
 * Catálogo guardado (texto JSON o null), saneado y ordenado por `orden`.
 * Si no hay nada guardado (o está dañado) devuelve una copia del catálogo inicial.
 */
function catalogoDesde(crudo) {
  var lista = null;
  if (crudo) { try { lista = JSON.parse(crudo); } catch (err) { lista = null; } }
  if (!Array.isArray(lista) || !lista.length) return CATALOGO_DEFECTO.map(copiarTarjeta_);
  var salida = [];
  var vistos = {};
  lista.forEach(function (t) {
    if (!t || typeof t !== 'object' || !t.id || vistos[t.id] || !t.hoja || !t.medio) return;
    vistos[t.id] = true;
    var c = copiarTarjeta_(t);
    var cierre = diaValido_(c.cierre), vence = diaValido_(c.vence);
    c.cierre = (cierre === null || isNaN(cierre)) ? null : cierre;
    c.vence = (vence === null || isNaN(vence)) ? null : vence;
    if (COLORES_TARJETA.indexOf(c.color) === -1) c.color = 'gris';
    salida.push(c);
  });
  if (!salida.length) return CATALOGO_DEFECTO.map(copiarTarjeta_);
  salida.forEach(function (t, i) { if (!t.orden) t.orden = i + 1; });
  return ordenarCatalogo_(salida);
}

function ordenarCatalogo_(lista) {
  return lista.slice().sort(function (a, b) { return a.orden - b.orden || (a.id < b.id ? -1 : 1); });
}

/** Solo las tarjetas activas, por orden. */
function tarjetasActivas(catalogo) {
  return ordenarCatalogo_((catalogo || CATALOGO_DEFECTO).filter(function (t) { return t.activa !== false; }));
}

/** 'SIP · Oh!' -> 'SIP' (lo que va antes del separador). */
function nombreCorto_(nombre) {
  return String(nombre || '').split(' · ')[0].trim();
}

/** Nombre que se muestra: el fijo del catálogo inicial o "TC <nombre> · <titular>". */
function etiquetaTarjeta(t) {
  if (!t) return 'Otros';
  if (t.etiqueta) return t.etiqueta;
  return 'TC ' + nombreCorto_(t.nombre) + (t.titular ? ' · ' + nombreCorto_(t.titular).split(' ')[0] : '');
}

function buscarTarjetaCatalogo(catalogo, id) {
  var cat = catalogo || CATALOGO_DEFECTO;
  for (var i = 0; i < cat.length; i++) if (cat[i].id === id) return cat[i];
  return null;
}

/**
 * Medios de pago para la app: una entrada por medio de tarjeta de crédito activa (en orden), luego las tarjetas
 * de débito (motor 1.21: van a Gastos Hormiga como el efectivo, con su dueño) y al final los directos.
 * Las de débito vienen en `debitos` o, si no se pasan, en catalogo.debitos (el motor las cuelga ahí).
 */
function mediosDesde(catalogo, debitos) {
  var salida = [];
  var vistos = {};
  tarjetasActivas(catalogo).forEach(function (t) {
    if (vistos[t.medio]) return;
    vistos[t.medio] = true;
    salida.push({ id: t.medio, etiqueta: 'TC ' + nombreCorto_(t.nombre), hoja: t.hoja, tipo: 'tarjeta' });
  });
  var lista = debitos || (catalogo && catalogo.debitos) || [];
  lista.filter(function (d) { return d && d.activa !== false; }).forEach(function (d) {
    salida.push({ id: 'TD_' + d.id, etiqueta: etiquetaDebito(d), hoja: 'Gastos Hormiga', tipo: 'debito', titular: d.titular || '', banco: d.banco });
  });
  return salida.concat(MEDIOS_DIRECTOS.map(function (m) { return { id: m.id, etiqueta: m.etiqueta, hoja: m.hoja, tipo: m.tipo }; }));
}

// ---------------------------------------------------------------------------
// Tarjetas de débito (motor 1.21): plata de la cuenta de cada uno. Se anotan en Gastos Hormiga.
// ---------------------------------------------------------------------------

var MAXIMO_DEBITOS = 20;

/** 'Débito BCP · Pedro' (lo que se escribe en la columna Medio de Pago). */
function etiquetaDebito(d) {
  var titular = String((d && d.titular) || '').trim().split(' ')[0];
  return 'Débito ' + String((d && d.banco) || '').trim() + (titular ? ' · ' + titular : '');
}

/** Lista guardada de tarjetas de débito, limpia: [{id, banco, titular, activa, orden}]. */
function debitosDesde(crudo) {
  var lista = [];
  if (crudo) { try { lista = JSON.parse(crudo); } catch (err) { lista = []; } }
  if (!Array.isArray(lista)) return [];
  var vistos = {};
  return lista.filter(function (d) {
    if (!d || typeof d !== 'object' || !/^[A-Z0-9_]{2,24}$/.test(String(d.id || '')) || vistos[d.id]) return false;
    vistos[d.id] = true;
    return String(d.banco || '').trim().length >= 2;
  }).slice(0, MAXIMO_DEBITOS).map(function (d, i) {
    return { id: String(d.id), banco: String(d.banco).replace(/\s+/g, ' ').trim().slice(0, 20), titular: String(d.titular || '').trim().slice(0, 40),
      activa: d.activa !== false, orden: typeof d.orden === 'number' ? d.orden : i + 1 };
  });
}

/** Revisa {banco, titular} de una tarjeta de débito nueva o editada. Devuelve {banco, titular} o {error}. */
function validarDebito(datos) {
  var d = datos || {};
  var banco = String(d.banco || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (banco.length < 2 || banco.length > 20) return { error: 'Escribe el banco (2 a 20 letras).' };
  var titular = String(d.titular || '').trim();
  if (titular.length > 40) return { error: 'El titular es muy largo.' };
  return { banco: banco, titular: titular };
}

/** Id para una tarjeta de débito: 'BCP_P' (banco + inicial del titular), sin repetir. */
function idDebito(banco, titular, existentes) {
  var raiz = normalizar(banco).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'DEB';
  var ini = normalizar(titular).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  var id = raiz + (ini ? '_' + ini : '');
  var usados = {};
  (existentes || []).forEach(function (x) { usados[x.id] = true; });
  var n = 2;
  var final = id;
  while (usados[final]) final = id + n++;
  return final;
}

/** Tarjeta de débito de un banco para una persona (por su primer nombre), o null. */
function debitoDe(debitos, banco, persona) {
  var b = normalizar(banco);
  var p = normalizar(persona).split(' ')[0];
  var delBanco = (debitos || []).filter(function (d) { return d.activa !== false && normalizar(d.banco) === b; });
  for (var i = 0; i < delBanco.length; i++) if (p && normalizar(delBanco[i].titular).split(' ')[0] === p) return delBanco[i];
  return null;
}

/** {id: {cierre, vence}} de todas las tarjetas del catálogo (también las inactivas, por los gastos viejos). */
function ciclosDesde(catalogo) {
  var salida = {};
  (catalogo || CATALOGO_DEFECTO).forEach(function (t) { salida[t.id] = { cierre: t.cierre, vence: t.vence }; });
  return salida;
}

/** Hojas de consumos de tarjeta (sin repetir) de las tarjetas activas. */
function hojasDesde(catalogo) {
  var salida = [];
  tarjetasActivas(catalogo).forEach(function (t) { if (salida.indexOf(t.hoja) === -1) salida.push(t.hoja); });
  return salida;
}

/** true si el responsable es el titular ('PersonaA' coincide con 'PersonaA'). */
function coincideTitular_(titular, responsable) {
  var t = normalizar(titular), r = normalizar(responsable);
  if (!t || !r) return false;
  return t === r || t.split(' ')[0] === r.split(' ')[0];
}

/**
 * Revisa los datos de una tarjeta del catálogo (para agregar o editar).
 * Devuelve {campos} con solo los campos que vinieron (ya limpios) o {error}.
 * Con completo = true exige nombre y color.
 */
function validarTarjetaCatalogo(datos, completo) {
  var d = datos || {};
  var campos = {};
  if (d.nombre !== undefined || completo) {
    var nombre = String(d.nombre === undefined || d.nombre === null ? '' : d.nombre).replace(/\s+/g, ' ').trim();
    if (nombre.length < 2 || nombre.length > 30) return { error: 'El nombre de la tarjeta debe tener entre 2 y 30 letras.' };
    campos.nombre = nombre;
  }
  if (d.titular !== undefined) {
    var titular = String(d.titular === null ? '' : d.titular).replace(/\s+/g, ' ').trim();
    if (titular.length > 40) return { error: 'El titular es muy largo.' };
    campos.titular = titular;
  }
  var cierre = d.cierre !== undefined ? diaValido_(d.cierre) : undefined;
  var vence = d.vence !== undefined ? diaValido_(d.vence) : undefined;
  if ((cierre !== undefined && isNaN(cierre)) || (vence !== undefined && isNaN(vence))) {
    return { error: 'El cierre y el vencimiento deben ser un día del mes (1 a 31) o quedar vacíos.' };
  }
  if (cierre !== undefined) campos.cierre = cierre;
  if (vence !== undefined) campos.vence = vence;
  if (d.color !== undefined || completo) {
    var color = String(d.color || '').trim().toLowerCase();
    if (COLORES_TARJETA.indexOf(color) === -1) return { error: 'El color no es válido. Opciones: ' + COLORES_TARJETA.join(', ') + '.' };
    campos.color = color;
  }
  if (d.orden !== undefined) {
    if (!Number.isInteger(d.orden) || d.orden < 1 || d.orden > 999) return { error: 'El orden debe ser un número entero.' };
    campos.orden = d.orden;
  }
  return { campos: campos };
}

/** Id a partir del nombre: 'Diners Club' -> 'DINERS_CLUB'; si ya existe, 'DINERS_CLUB_2', '_3'... */
function generarIdTarjeta(nombre, existentes) {
  var base = normalizar(nombreCorto_(nombre)).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!base) base = 'TARJETA';
  var ids = {};
  (existentes || []).forEach(function (x) { ids[String(x)] = true; });
  var id = base;
  for (var n = 2; ids[id]; n++) id = base + '_' + n;
  return id;
}

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

/**
 * Identificador de tarjeta según la hoja y, si varias tarjetas comparten la hoja
 * (Interbank), según el titular que coincida con el responsable; si ninguno coincide,
 * la primera de la hoja (la que no tiene titular, si la hay). 'HORMIGA' para Gastos Hormiga.
 */
function idTarjeta(hoja, responsable, catalogo) {
  var h = normalizar(hoja);
  if (h === 'gastos hormiga') return 'HORMIGA';
  var cat = ordenarCatalogo_(catalogo || CATALOGO_DEFECTO);
  var candidatas = cat.filter(function (t) { return t.activa !== false && normalizar(t.hoja) === h; });
  if (!candidatas.length) candidatas = cat.filter(function (t) { return normalizar(t.hoja) === h; });
  if (!candidatas.length) return null;
  if (candidatas.length === 1) return candidatas[0].id;
  for (var i = 0; i < candidatas.length; i++) if (coincideTitular_(candidatas[i].titular, responsable)) return candidatas[i].id;
  for (var j = 0; j < candidatas.length; j++) if (!candidatas[j].titular) return candidatas[j].id;
  return candidatas[0].id;
}

/**
 * Fecha de pago y vencimiento de una compra.
 * m = mes de la compra; si el día pasa el cierre, m = m + 1.
 * Pago = último día del mes m. Vence = día 'vence' del mes m + 1.
 */
// mesesDespues (motor 1.11.0): para la cuota N de una compra en cuotas, el pago cae N-1 meses después.
function calcularCiclo(idCiclo, fechaCompra, catalogo, mesesDespues) {
  var vacio = { pago: '', vence: '' };
  var t = buscarTarjetaCatalogo(catalogo || CATALOGO_DEFECTO, idCiclo);
  var c = t ? { cierre: t.cierre, vence: t.vence } : CICLOS[idCiclo];
  if (!c || c.cierre === null || c.cierre === undefined || c.vence === null || c.vence === undefined) return vacio;
  var d = parsearFecha(fechaCompra);
  if (!d) return vacio;
  var y = d.getFullYear();
  var m = d.getMonth(); // 0-based
  if (d.getDate() > c.cierre) m += 1;
  m += Math.max(0, Math.floor(Number(mesesDespues) || 0));
  var pago = new Date(y, m + 1, 0); // último día del mes m (Date maneja el cambio de año)
  var diasMesSig = new Date(y, m + 2, 0).getDate();
  var vence = new Date(y, m + 1, Math.min(c.vence, diasMesSig));
  return { pago: fechaISO(pago), vence: fechaISO(vence) };
}

// ---------------------------------------------------------------------------
// Compras en cuotas (motor 1.11.0)
// ---------------------------------------------------------------------------

var MAXIMO_CUOTAS = 36;

/**
 * Montos de cada cuota. Sin montoCuota se reparte el total en partes iguales (los centavos que sobran van en
 * la primera). Con montoCuota (cuando el banco cobra intereses) todas las cuotas son ese monto; debe cubrir el
 * total y no pasar del doble. Devuelve null si no es válido.
 */
function montosDeCuotas(total, n, montoCuota) {
  var cent = Math.round(Number(total) * 100);
  if (!(cent > 0) || !(Number(n) === Math.floor(Number(n))) || n < 1 || n > MAXIMO_CUOTAS) return null;
  var lista = [];
  if (n === 1) return [cent / 100];
  var hayFija = !(montoCuota === undefined || montoCuota === null || montoCuota === '');
  if (hayFija) {
    var fija = typeof montoCuota === 'number' ? montoCuota : parsearMonto(String(montoCuota));
    var cf = Math.round(Number(fija) * 100);
    if (!(cf > 0) || cf * n < cent - n || cf * n > cent * 2) return null;
    for (var i = 0; i < n; i++) lista.push(cf / 100);
    return lista;
  }
  var parte = Math.floor(cent / n);
  var resto = cent - parte * n;
  for (var j = 0; j < n; j++) lista.push((parte + (j === 0 ? resto : 0)) / 100);
  return lista;
}

/** "Televisor" -> "Televisor · cuota 2/6" (sin pasar de 120 caracteres). */
function descripcionDeCuota(descripcion, k, n) {
  var d = String(descripcion || '').trim();
  if (!(n > 1)) return d;
  var sufijo = ' · cuota ' + k + '/' + n;
  return d.slice(0, 120 - sufijo.length).trim() + sufijo;
}

/** {k, n} si la descripción es de una cuota ("… · cuota 2/6"), o null. */
function numeroDeCuota(descripcion) {
  var m = String(descripcion || '').match(/·\s*cuota\s+(\d{1,2})\/(\d{1,2})\s*$/i);
  if (!m) return null;
  var k = Number(m[1]), n = Number(m[2]);
  return k >= 1 && n >= 2 && k <= n ? { k: k, n: n } : null;
}

function texto_(v) {
  if (v === null || v === undefined) return '';
  if (esFechaValida_(v)) return fechaISO(v);
  return String(v).trim();
}

function celda_(fila, idx) {
  return idx >= 0 && fila && idx < fila.length ? fila[idx] : '';
}

// ---------------------------------------------------------------------------
// Tarjeta explícita de una fila (motor 1.6): quién gastó vs. con qué tarjeta
// ---------------------------------------------------------------------------

/**
 * Separa la columna _id_form: 'APP:abc|TC:IBK_B|OR:P%3AUsuarioA' ->
 * {base: 'APP:abc', tarjeta: 'IBK_B', origen: 'P:UsuarioA'}. La base es todo lo que va antes
 * del primer '|'; los sufijos son opcionales y pueden venir en cualquier orden:
 *   TC:<ID>      tarjeta explícita (motor 1.6)
 *   OR:<origen>  de dónde sale el gasto (motor 1.7), codificado con encodeURIComponent
 * Sin sufijo, tarjeta y origen quedan ''.
 */
function partesIdForm(idForm) {
  var t = (idForm === null || idForm === undefined) ? '' : String(idForm).trim();
  var trozos = t.split('|');
  var salida = { base: trozos[0].trim(), tarjeta: '', origen: '' };
  for (var i = 1; i < trozos.length; i++) {
    var trozo = trozos[i].trim();
    if (!salida.tarjeta && /^TC:[A-Za-z0-9_]+$/.test(trozo)) salida.tarjeta = trozo.slice(3);
    else if (!salida.origen && trozo.indexOf('OR:') === 0) {
      try { salida.origen = decodeURIComponent(trozo.slice(3)).trim(); } catch (err) { salida.origen = ''; }
    }
  }
  return salida;
}

/**
 * Arma el valor de _id_form: la base y, si hacen falta, los sufijos '|TC:<ID>' y
 * '|OR:<origen codificado>' (así un '|' o un ':' dentro de un nombre no rompen la lectura).
 */
function armarIdForm(base, tarjetaId, origen) {
  return String(base || '') + (tarjetaId ? '|TC:' + tarjetaId : '') + (origen ? '|OR:' + encodeURIComponent(origen) : '');
}

/**
 * Origen de un gasto: '' = fondo común; 'P:<nombre>' = sobrante personal de esa persona;
 * 'A:<línea de ahorro>' = sale de ese ahorro. Devuelve {tipo: ''|'P'|'A'|'?', nombre}.
 */
function partesOrigen(origen) {
  var t = (origen === null || origen === undefined) ? '' : String(origen).trim();
  if (!t) return { tipo: '', nombre: '' };
  var m = t.match(/^([PA]):\s*(\S[\s\S]*)$/);
  return m ? { tipo: m[1], nombre: m[2].trim() } : { tipo: '?', nombre: t };
}

/**
 * Mes ('YYYY-MM') en que cuenta un gasto: en hojas de tarjeta, el de su Fecha de pago
 * (así lo suma la hoja del presupuesto) o, si no tiene, el de su Fecha; en Gastos Hormiga, el de su Fecha.
 */
function mesDeGasto(c) {
  if (!c) return '';
  if (c.tarjeta === 'HORMIGA') return String(c.fecha || '').slice(0, 7);
  return String(c.pago || c.fecha || '').slice(0, 7);
}

/**
 * A qué tarjeta pertenece una fila. Si _id_form trae '|TC:<ID>' y ese ID es una tarjeta
 * ACTIVA del catálogo cuya hoja es la de la fila, manda esa; si no, la regla de siempre
 * (idTarjeta por hoja y responsable). Devuelve {tarjeta, explicita}.
 */
function tarjetaDeFila(hoja, responsable, idForm, catalogo) {
  var pedida = partesIdForm(idForm).tarjeta;
  if (pedida) {
    var t = buscarTarjetaCatalogo(catalogo || CATALOGO_DEFECTO, pedida);
    if (t && t.activa !== false && normalizar(t.hoja) === normalizar(hoja)) return { tarjeta: t.id, explicita: true };
  }
  return { tarjeta: idTarjeta(hoja, responsable, catalogo), explicita: false };
}

/** true si la tarjeta tiene titular y quien gastó (responsable) es otra persona. */
function esPrestada(idTarjetaFila, responsable, catalogo) {
  var t = buscarTarjetaCatalogo(catalogo || CATALOGO_DEFECTO, idTarjetaFila);
  if (!t || !t.titular || !normalizar(responsable)) return false;
  return !coincideTitular_(t.titular, responsable);
}

/**
 * Lee los consumos de una hoja TC o de Gastos Hormiga.
 * valores2D debe empezar en la fila 1 de la hoja (getDataRange().getValues()).
 * Ignora filas sin monto válido y filas sin responsable, fecha, concepto ni descripción.
 */
function leerConsumos(valores2D, hoja, catalogo) {
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
    var idFormFila = texto_(celda_(f, cols.idForm));
    var tarjetaFila = tarjetaDeFila(hoja, responsable, idFormFila, catalogo).tarjeta;
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
      idForm: idFormFila,
      huella: texto_(celda_(f, cols.huella)),
      tarjeta: tarjetaFila,
      prestada: esPrestada(tarjetaFila, responsable, catalogo),
      origen: partesIdForm(idFormFila).origen,
      deTarjeta: normalizar(hoja) !== 'gastos hormiga'
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Cuentas entre ustedes (motor 1.14.0). Regla: cuando alguien le da plata a otro (le presta, le devuelve, o
// paga con SU tarjeta o SU Yape un gasto que "sale de" la otra persona), esa otra persona le debe ese monto.
// El fondo común no genera deudas.
// ---------------------------------------------------------------------------

var MAXIMO_MOVIMIENTOS_CUENTAS = 300;

/** Nombre completo de la lista que corresponde a 'nombre' (igual o mismo primer nombre), o ''. */
function nombreDeLista(nombre, nombres) {
  var n = normalizar(nombre);
  if (!n) return '';
  var lista = nombres || [];
  for (var i = 0; i < lista.length; i++) if (normalizar(lista[i]) === n) return lista[i];
  for (var j = 0; j < lista.length; j++) if (normalizar(lista[j]).split(' ')[0] === n.split(' ')[0]) return lista[j];
  return '';
}

/** Quién puso la plata: en tarjetas, su titular (si el catálogo lo tiene); si no, quien hizo el gasto. */
function pagadorDe(consumo, catalogo, nombres) {
  if (consumo.tarjeta && consumo.tarjeta !== 'HORMIGA') {
    var t = buscarTarjetaCatalogo(catalogo || CATALOGO_DEFECTO, consumo.tarjeta);
    var titular = t && t.titular ? nombreDeLista(t.titular, nombres) : '';
    if (titular) return titular;
  }
  return nombreDeLista(consumo.responsable, nombres);
}

/** Lo guardado, saneado: {desde, movimientos: [{id, fecha, de, a, monto, nota, por}]}. */
function cuentasDesde(texto) {
  var obj = {};
  try { obj = typeof texto === 'string' ? JSON.parse(texto || '{}') : (texto || {}); } catch (err) { obj = {}; }
  var desde = /^\d{4}-\d{2}-\d{2}$/.test(String(obj.desde || '')) ? obj.desde : '';
  var movimientos = (Array.isArray(obj.movimientos) ? obj.movimientos : []).filter(function (m) {
    return m && m.id && m.de && m.a && Number(m.monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''));
  }).map(function (m) {
    return { id: String(m.id).slice(0, 64), fecha: m.fecha, de: String(m.de), a: String(m.a), monto: Math.round(Number(m.monto) * 100) / 100,
      nota: String(m.nota || '').slice(0, 120), por: String(m.por || '') };
  });
  return { desde: desde, movimientos: movimientos };
}

/**
 * Junta los movimientos más viejos en un "Saldo anterior" por pareja cuando pasan del máximo,
 * así la lista no crece sin fin y el saldo no cambia.
 */
function compactarCuentas(cuentas) {
  var movs = cuentas.movimientos.slice().sort(function (x, y) { return x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0; });
  if (movs.length <= MAXIMO_MOVIMIENTOS_CUENTAS) return cuentas;
  var cuantos = movs.length - MAXIMO_MOVIMIENTOS_CUENTAS + 50;
  var viejos = movs.slice(0, cuantos), resto = movs.slice(cuantos);
  var neto = {}, fecha = viejos[viejos.length - 1].fecha;
  viejos.forEach(function (m) {
    var k = [m.de, m.a].sort().join('|');
    var signo = m.de < m.a ? 1 : -1; // positivo: el primero (en orden) le dio plata al segundo
    neto[k] = (neto[k] || 0) + signo * Math.round(m.monto * 100);
  });
  var resumen = [];
  Object.keys(neto).forEach(function (k) {
    if (!neto[k]) return;
    var p = k.split('|');
    resumen.push({ id: 'saldo-' + fecha + '-' + resumen.length, fecha: fecha, de: neto[k] > 0 ? p[0] : p[1], a: neto[k] > 0 ? p[1] : p[0],
      monto: Math.abs(neto[k]) / 100, nota: 'Saldo anterior', por: '' });
  });
  return { desde: cuentas.desde, movimientos: resumen.concat(resto) };
}

/**
 * Saldos entre las personas y los últimos movimientos que los explican.
 * Devuelve {desde, saldos: [{deudor, acreedor, monto}], movimientos: [{tipo, id?, fecha, paga, para, monto, texto}]}.
 */
function cuentasEntre(consumos, cuentas, nombres, catalogo) {
  var desde = cuentas.desde || '';
  var deuda = {}; // deuda[deudor|acreedor] = centavos
  var items = [];
  var sumar = function (deudor, acreedor, monto) {
    var k = deudor + '|' + acreedor;
    deuda[k] = (deuda[k] || 0) + Math.round(Number(monto) * 100);
  };
  (consumos || []).forEach(function (c) {
    if (!c.fecha || (desde && c.fecha < desde)) return;
    var o = partesOrigen(c.origen);
    if (o.tipo !== 'P') return; // fondo común y ahorros: sin deudas
    var para = nombreDeLista(o.nombre, nombres);
    var paga = pagadorDe(c, catalogo, nombres);
    if (!para || !paga || para === paga) return;
    sumar(para, paga, c.monto);
    items.push({ tipo: 'gasto', fecha: c.fecha, paga: paga, para: para, monto: c.monto, texto: c.descripcion || c.concepto || 'Gasto' });
  });
  (cuentas.movimientos || []).forEach(function (m) {
    var de = nombreDeLista(m.de, nombres), a = nombreDeLista(m.a, nombres);
    if (!de || !a || de === a) return;
    sumar(a, de, m.monto);
    items.push({ tipo: 'mano', id: m.id, fecha: m.fecha, paga: de, para: a, monto: m.monto, texto: m.nota || 'Préstamo', por: m.por });
  });
  var saldos = [];
  for (var i = 0; i < nombres.length; i++) {
    for (var j = i + 1; j < nombres.length; j++) {
      var x = (deuda[nombres[i] + '|' + nombres[j]] || 0) - (deuda[nombres[j] + '|' + nombres[i]] || 0);
      if (x > 0) saldos.push({ deudor: nombres[i], acreedor: nombres[j], monto: x / 100 });
      else if (x < 0) saldos.push({ deudor: nombres[j], acreedor: nombres[i], monto: -x / 100 });
    }
  }
  items.sort(function (x, y) { return x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0; });
  return { desde: desde, saldos: saldos, movimientos: items.slice(0, 40) };
}

function estaPagado_(estado) {
  return normalizar(estado) === 'pagado';
}

function redondear_(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Lo que la app recibe de cada consumo. `idForm` va SIN el sufijo de tarjeta (así la app
 * lo sigue comparando con 'APP:<idCliente>'); la tarjeta va en `tarjetaId` y, si quien
 * gastó no es el titular, `prestada: true`. `origen` dice de dónde sale ('' = fondo común,
 * 'P:PersonaA', 'A:Ahorro Viaje').
 */
function consumoPublico_(c) {
  var p = {
    fila: c.fila, idForm: partesIdForm(c.idForm).base, fecha: c.fecha, concepto: c.concepto,
    descripcion: c.descripcion, monto: c.monto, estado: c.estado, nota: c.nota, medio: c.medio,
    responsable: c.responsable, tarjetaId: c.tarjeta, origen: c.origen || ''
  };
  if (c.prestada) p.prestada = true;
  return p;
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
function resumenTarjetas(consumos, hoyISO, incluirPagados, catalogo) {
  var lista = consumos || [];
  var mesHoy = String(hoyISO || '').slice(0, 7);
  var nombreMesHoy = nombreMes(hoyISO);
  var resultado = [];
  var defs = tarjetasActivas(catalogo).map(function (c) {
    return { id: c.id, nombre: etiquetaTarjeta(c), hoja: c.hoja, titular: c.titular || '' };
  }).concat([{ id: 'HORMIGA', nombre: 'Gastos hormiga', hoja: 'Gastos Hormiga', titular: '' }]);

  for (var t = 0; t < defs.length; t++) {
    var def = defs[t];
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

    // Responsable: el único que aparezca en sus consumos; si no, el titular del catálogo (o '').
    var vistos = {};
    propios.forEach(function (c) { if (c.responsable) vistos[c.responsable] = true; });
    var nombres = Object.keys(vistos);
    var responsable = nombres.length === 1 ? nombres[0] : def.titular;

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
 * notas2D (getNotes, opcional) trae las notas: una línea de gastos está pagada
 * si la nota de su celda del mes tiene un renglón que empieza con "Pagado".
 * Devuelve null si el mes no está en los encabezados.
 */
function leerPresupuesto(display2D, valores2D, claveMes, notas2D) {
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
  var filasTotales = { ingresos: 0, gastos: 0, ahorros: 0, saldo: 0, saldoPersonal: 0 };
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
      filasTotales[total] = i + 1;
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
    var linea = { concepto: concepto, seccion: seccion, monto: monto === null ? 0 : monto, fila: i + 1 };
    if (seccion === 'gastos') {
      var marca = notaPagado(celda_((notas2D && notas2D[i]) || [], col));
      linea.pagado = !!marca;
      linea.pagadoNota = marca;
      linea.esTarjeta = n.indexOf('tc ') === 0;
    }
    filas.push(linea);
  }

  var columnas = {};
  meses.forEach(function (m) { columnas[m.clave] = colPorClave[m.clave] + 1; });
  return {
    meses: meses,
    mes: claveMes,
    etiquetaMes: claveAEtiqueta(claveMes),
    columna: col + 1,
    columnas: columnas,
    colConcepto: colConcepto + 1,
    filas: filas,
    filasTotales: filasTotales,
    totales: totales
  };
}

// ---------------------------------------------------------------------------
// Líneas del presupuesto (motor 1.5): posición de una línea nueva y conceptos por línea
// ---------------------------------------------------------------------------

var SECCIONES_PRESUPUESTO = ['ingresos', 'gastos', 'ahorros'];

/** Para la sección 'ahorros' el nombre debe empezar con "Ahorro" o "Fondo" (así lo clasifica leerPresupuesto). */
function nombreLineaParaSeccion(nombre, seccion) {
  var n = String(nombre || '').replace(/\s+/g, ' ').trim();
  if (seccion === 'ahorros' && !/^(ahorro|fondo)/i.test(normalizar(n))) return 'Ahorro ' + n;
  return n;
}

/**
 * Fila (1-based) ANTES de la cual se inserta una línea nueva de esa sección, para quedar
 * siempre dentro del rango de las fórmulas de total: la última línea del bloque (la que
 * era última baja un lugar). Si el bloque está vacío: ingresos → antes de TOTAL INGRESOS;
 * gastos → antes de la primera línea de ahorros o de TOTAL GASTOS; ahorros → antes de TOTAL GASTOS.
 * Devuelve 0 si no se puede ubicar.
 */
function posicionNuevaLinea(presupuesto, seccion) {
  if (!presupuesto || !presupuesto.filas) return 0;
  var propias = presupuesto.filas.filter(function (f) { return f.seccion === seccion; });
  if (propias.length) return propias[propias.length - 1].fila;
  var ft = presupuesto.filasTotales || {};
  if (seccion === 'ingresos') return ft.ingresos || 0;
  if (seccion === 'gastos') {
    var ahorros = presupuesto.filas.filter(function (f) { return f.seccion === 'ahorros'; });
    return ahorros.length ? ahorros[0].fila : (ft.gastos || 0);
  }
  return ft.gastos || 0;
}

/**
 * Asignación inicial sugerida (clave = nombre de la línea normalizado y sin paréntesis).
 * Solo es una sugerencia: se guarda cuando el usuario llama a asignarConceptos.
 */
var ASIGNACION_INICIAL = {
  'alimentacion': ['Supermercado', 'Desayuno'],
  'alacena': ['Chucherías', 'Matanza'],
  'limpieza': ['Limpieza'],
  'mascotas': ['Mascotas'],
  'internet': ['Internet y Telefonía'],
  'suscripciones': ['Suscripciones'],
  'salud': ['Salud y Farmacia'],
  'cuidado personal': ['Cuidado Personal'],
  'pasajes': ['Pasajes y Transporte'],
  'remodelacion': ['Remodelación']
};

/** 'Alimentación (BCP-DEB-PE)' -> 'alimentacion (bcp-deb-pe)' (clave del mapa guardado). */
function claveLinea(nombre) {
  return normalizar(nombre);
}

function claveSinParentesis_(nombre) {
  return normalizar(String(nombre || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[….]+$/, ''));
}

/** Mapa guardado {claveLinea: [conceptos]} (texto JSON o null), saneado. */
function mapaLineasDesde(crudo) {
  var g = null;
  if (crudo) { try { g = JSON.parse(crudo); } catch (err) { g = null; } }
  var salida = {};
  if (!g || typeof g !== 'object' || Array.isArray(g)) return salida;
  Object.keys(g).forEach(function (k) {
    var clave = claveLinea(k);
    if (!clave || !Array.isArray(g[k])) return;
    var lista = [];
    g[k].forEach(function (c) { var t = String(c || '').trim(); if (t && lista.indexOf(t) === -1) lista.push(t); });
    salida[clave] = lista;
  });
  return salida;
}

/**
 * Conceptos de gasto que cuentan para una línea: los guardados en el mapa o, si no hay,
 * la sugerencia inicial (filtrada por los conceptos que existen en Configuración, si se pasan).
 * Devuelve {conceptos, sugerido}.
 */
function conceptosDeLinea(mapa, nombreLinea, conceptosConfig) {
  var m = mapa || {};
  var clave = claveLinea(nombreLinea);
  if (Object.prototype.hasOwnProperty.call(m, clave)) return { conceptos: m[clave].slice(), sugerido: false };
  var sugeridos = ASIGNACION_INICIAL[claveSinParentesis_(nombreLinea)] || [];
  if (conceptosConfig) {
    var existentes = {};
    conceptosConfig.forEach(function (c) { existentes[normalizar(c)] = c; });
    sugeridos = sugeridos.map(function (c) { return existentes[normalizar(c)]; }).filter(function (c) { return !!c; });
  }
  return { conceptos: sugeridos, sugerido: sugeridos.length > 0 };
}

/** Nuevo mapa con `conceptos` en esa línea; un concepto solo puede estar en una línea (se mueve). */
function asignarConceptosEnMapa(mapa, nombreLinea, conceptos) {
  var salida = {};
  var clave = claveLinea(nombreLinea);
  var nuevos = {};
  var lista = [];
  (conceptos || []).forEach(function (c) {
    var t = String(c || '').trim();
    if (t && !nuevos[normalizar(t)]) { nuevos[normalizar(t)] = true; lista.push(t); }
  });
  Object.keys(mapa || {}).forEach(function (k) {
    if (k === clave) return;
    salida[k] = mapa[k].filter(function (c) { return !nuevos[normalizar(c)]; });
  });
  salida[clave] = lista;
  return salida;
}

/** Mismo mapa con la clave de una línea renombrada (si existía). */
function renombrarLineaEnMapa(mapa, de, a) {
  var salida = {};
  var kDe = claveLinea(de), kA = claveLinea(a);
  Object.keys(mapa || {}).forEach(function (k) { salida[k === kDe ? kA : k] = mapa[k].slice(); });
  return salida;
}

/** Mismo mapa sin esa línea. */
function quitarLineaDeMapa(mapa, nombre) {
  var salida = {};
  var k0 = claveLinea(nombre);
  Object.keys(mapa || {}).forEach(function (k) { if (k !== k0) salida[k] = mapa[k].slice(); });
  return salida;
}

/**
 * Gasto real de una línea en un mes: suma de los consumos del mes cuyos conceptos están
 * asignados a la línea. Si la asignación es solo sugerida (o no hay ninguna), también
 * cuentan los consumos cuyo concepto se llama igual que la línea.
 */
/**
 * Cobran a fin de mes: el presupuesto de un mes se gasta desde ese día de cobro (el último día del mes) hasta el
 * día antes del siguiente cobro. '2026-11' -> {desde: '2026-11-30', hasta: '2026-12-30'} (motor 1.9.3).
 */
function cicloDelMes(claveMes) {
  var p = String(claveMes || '').split('-');
  var a = Number(p[0]), m = Number(p[1]);
  var fin = new Date(a, m + 1, 0);
  fin.setDate(fin.getDate() - 1);
  return { desde: fechaISO(new Date(a, m, 0)), hasta: fechaISO(fin) };
}

/** Mes del presupuesto que se está gastando en esa fecha ('2026-11-10' -> '2026-10'; '2026-11-30' -> '2026-11'). */
function mesDelCiclo(fecha) {
  var d = parsearFecha(fecha);
  if (!d) return '';
  var clave = fechaISO(d).slice(0, 7);
  var ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() === ultimo) return clave;
  var antes = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return fechaISO(antes).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Avisos por WhatsApp con CallMeBot (motor 1.17.0)
// ---------------------------------------------------------------------------

/** '+51 987 654 321' / '51987654321' -> '+51987654321'; '' si no parece un número con código de país. */
function telefonoWhatsapp(texto) {
  var d = String(texto || '').replace(/[^\d]/g, '');
  return d.length >= 9 && d.length <= 15 ? '+' + d : '';
}

/** '+51987654321' -> '+51 ••• ••• 321' (para mostrarlo sin revelarlo entero). */
function telefonoOculto(tel) {
  var t = String(tel || '');
  return t ? t.slice(0, 3) + ' ••• ••• ' + t.slice(-3) : '';
}

/** Mensaje de WhatsApp a partir de un correo {asunto, cuerpo}: título en negrita y sin pasar de 1500 caracteres. */
function textoWhatsapp(texto) {
  var cuerpo = String((texto && texto.cuerpo) || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  var t = '*' + String((texto && texto.asunto) || 'FinFamily').trim() + '*' + (cuerpo ? '\n\n' + cuerpo : '');
  return t.length > 1500 ? t.slice(0, 1497) + '…' : t;
}

/**
 * Texto para la plantilla oficial de WhatsApp (motor 1.18.0): Meta no acepta saltos de línea, tabulaciones ni
 * más de 4 espacios seguidos en el dato variable. Queda "Asunto: línea · línea · …" (máximo 900 caracteres).
 */
function textoPlantillaWhatsapp(texto) {
  var asunto = String((texto && texto.asunto) || 'FinFamily').replace(/\s+/g, ' ').trim();
  var lineas = String((texto && texto.cuerpo) || '').replace(/\r/g, '').split('\n')
    .map(function (l) { return l.replace(/^[\s•\-*]+/, '').replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  var t = (asunto + (lineas.length ? ': ' + lineas.join(' · ') : '')).replace(/\s{2,}/g, ' ');
  return t.length > 900 ? t.slice(0, 897) + '…' : t;
}

// ---------------------------------------------------------------------------
// Cuadre de saldos (motor 1.16.0): el último cuadre de cada cuenta (débito, Lemon o el estado de una tarjeta).
// clave: 'debito|<persona>', 'lemon|<persona>' o 'tc|<idTarjeta>|<vence>'.
// ---------------------------------------------------------------------------

var MAXIMO_CUADRES = 60;
var MEDIOS_CUADRE = ['YAPE', 'PLIN', 'EFECTIVO', 'LEMON'];

function claveCuadreValida(clave) {
  return /^(debito|lemon)\|[^|]{1,60}$/.test(String(clave || '')) || /^tc\|[A-Z0-9_]{1,30}\|\d{4}-\d{2}-\d{2}$/.test(String(clave || ''));
}

/** Lo guardado saneado: { clave: {saldo, base, fecha, medios, por} }. */
function cuadresDesde(texto) {
  var obj = {};
  try { obj = typeof texto === 'string' ? JSON.parse(texto || '{}') : (texto || {}); } catch (err) { obj = {}; }
  var salida = {};
  Object.keys(obj || {}).sort(function (a, b) { return String((obj[b] || {}).fecha).localeCompare(String((obj[a] || {}).fecha)); })
    .slice(0, MAXIMO_CUADRES).forEach(function (k) {
      var v = obj[k] || {};
      if (!claveCuadreValida(k) || !isFinite(Number(v.saldo)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || ''))) return;
      salida[k] = {
        saldo: Math.round(Number(v.saldo) * 100) / 100, base: Math.round((Number(v.base) || 0) * 100) / 100, fecha: v.fecha,
        medios: (Array.isArray(v.medios) ? v.medios : []).map(function (m) { return String(m).toUpperCase(); }).filter(function (m) { return MEDIOS_CUADRE.indexOf(m) !== -1 || /^TD_[A-Z0-9_]{2,24}$/.test(m); }),
        por: String(v.por || '').slice(0, 80)
      };
    });
  return salida;
}

// ---------------------------------------------------------------------------
// Tope semanal de antojos (motor 1.20.0): unos conceptos (restaurantes, chucherías, delivery…) con un tope
// por semana (de lunes a domingo). Avisa al 80 % y al 100 %, una vez cada uno por semana.
// ---------------------------------------------------------------------------

var ANTOJOS_DEFECTO = ['Restaurantes y Salidas', 'Chucherías', 'Delivery'];

function antojosDesde(texto) {
  var obj = {};
  try { obj = typeof texto === 'string' ? JSON.parse(texto || '{}') : (texto || {}); } catch (err) { obj = {}; }
  var conceptos = (Array.isArray(obj.conceptos) ? obj.conceptos : []).map(function (c) { return String(c || '').replace(/\s+/g, ' ').trim().slice(0, 60); })
    .filter(Boolean).slice(0, 12);
  var tope = Math.round(Number(obj.tope) * 100) / 100;
  return { conceptos: conceptos, tope: tope > 0 ? tope : 0 };
}

/** Lunes y domingo de la semana de esa fecha. */
function semanaDe(hoyISO) {
  var d = parsearFecha(hoyISO);
  var dia = (d.getDay() + 6) % 7;
  var lunes = sumarDias_(fechaISO(d), -dia);
  return { desde: lunes, hasta: sumarDias_(lunes, 6) };
}

function esAntojo_(c, conceptos) {
  var n = normalizar(c.concepto);
  return conceptos.some(function (x) { return normalizar(x) === n; });
}

/** Lo gastado en antojos en la semana de hoy (de lunes a hoy). */
function antojosDeSemana(consumos, conceptos, hoyISO) {
  var s = semanaDe(hoyISO);
  var total = 0, por = {};
  (consumos || []).forEach(function (c) {
    if (!c.fecha || c.fecha < s.desde || c.fecha > hoyISO || !esAntojo_(c, conceptos)) return;
    total += Number(c.monto) || 0;
    por[c.concepto] = (por[c.concepto] || 0) + (Number(c.monto) || 0);
  });
  return { desde: s.desde, hasta: s.hasta, gastado: redondear_(total),
    porConcepto: ordenadoPorMonto_(por, 'concepto'), diasQuedan: Math.max(0, diasEntre_(hoyISO, s.hasta)) };
}

/** Promedio semanal de antojos de las 4 semanas completas anteriores. */
function promedioAntojos(consumos, conceptos, hoyISO) {
  var s = semanaDe(hoyISO);
  var desde = sumarDias_(s.desde, -28), hasta = sumarDias_(s.desde, -1);
  var total = 0;
  (consumos || []).forEach(function (c) {
    if (!c.fecha || c.fecha < desde || c.fecha > hasta || !esAntojo_(c, conceptos)) return;
    total += Number(c.monto) || 0;
  });
  return redondear_(total / 4);
}

function textoAlertaAntojos(nivel, semana, tope) {
  var pasado = nivel === '100';
  var lineas = (semana.porConcepto || []).map(function (x) { return '• ' + x.concepto + ': ' + formatoSoles_(x.monto); });
  return {
    asunto: pasado ? 'Antojos: se pasaron del tope de la semana (' + formatoSoles_(semana.gastado) + ' de ' + formatoSoles_(tope) + ')'
      : 'Antojos: ya van ' + formatoSoles_(semana.gastado) + ' de ' + formatoSoles_(tope) + ' esta semana',
    cuerpo: (pasado ? 'Esta semana ya se pasaron del tope de antojos.' : 'Esta semana ya llevan el ' + Math.floor((semana.gastado / tope) * 100) + ' % del tope de antojos.') +
      '\n\n' + lineas.join('\n') + '\n\n' +
      (pasado ? 'Lo que gasten de más sale de lo que les sobra del mes.' : 'Quedan ' + formatoSoles_(Math.max(0, tope - semana.gastado)) + ' hasta el domingo.')
  };
}

/** Correo/WhatsApp del día de cobro: cómo cerró el ciclo que terminó ayer. */
function textoCierreMes(etiquetaMes, ciclo, gastado, consumos, saldo, top) {
  var cuerpo = ['Así cerró ' + etiquetaMes + ' (del ' + fechaCorta_(ciclo.desde) + ' al ' + fechaCorta_(ciclo.hasta) + '):', ''];
  cuerpo.push('Gastaron ' + formatoSoles_(gastado) + ' en ' + consumos + ' gasto' + (consumos === 1 ? '' : 's') + '.');
  if (top && top.length) {
    cuerpo.push('', 'En qué se fue más:');
    top.forEach(function (c) { cuerpo.push('• ' + c.concepto + ': ' + formatoSoles_(c.monto)); });
  }
  if (saldo !== null && saldo !== undefined && isFinite(saldo)) {
    cuerpo.push('', saldo >= 0 ? 'Según el presupuesto quedó libre ' + formatoSoles_(saldo) + '.' : 'Según el presupuesto faltaron ' + formatoSoles_(-saldo) + '.');
  }
  cuerpo.push('', 'Hoy empieza el nuevo mes: ¡a cuidarlo!');
  return { asunto: 'Así cerró ' + etiquetaMes + ': ' + formatoSoles_(gastado) + ' gastados', cuerpo: cuerpo.join('\n') };
}

// ---------------------------------------------------------------------------
// Anotar gastos escribiendo por WhatsApp (motor 1.20.0)
// ---------------------------------------------------------------------------

/** "25 tambo", "+12.50 taxi al trabajo yape" -> {monto, descripcion, medio?}; null si no es un gasto. */
function gastoDeMensaje(texto) {
  var t = String(texto || '').replace(/\s+/g, ' ').trim();
  var m = t.match(/^\+?\s*(?:s\/\.?\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s+(.{2,80})$/i);
  if (!m) return null;
  var monto = Number(m[1].replace(',', '.'));
  if (!(monto > 0)) return null;
  var palabras = m[2].trim().split(' ');
  var medios = { yape: 'YAPE', plin: 'PLIN', efectivo: 'EFECTIVO', cash: 'EFECTIVO', lemon: 'LEMON' };
  var medio = '';
  var ultima = normalizar(palabras[palabras.length - 1]);
  if (palabras.length > 1 && medios[ultima]) { medio = medios[ultima]; palabras.pop(); }
  return { monto: Math.round(monto * 100) / 100, descripcion: palabras.join(' ').slice(0, 80), medio: medio };
}

// ---------------------------------------------------------------------------
// Metas de ahorro con fecha (motor 1.15.0): a cada línea de ahorro se le pone un objetivo y el mes límite;
// se calcula cuánto falta, cuánto apartar al mes y si con lo que se pone este mes se llega.
// ---------------------------------------------------------------------------

var MAXIMO_METAS = 30;

/** Config guardada saneada: { claveLinea: {concepto, objetivo, fecha ('YYYY-MM')} }. */
function metasDesde(texto) {
  var obj = {};
  try { obj = typeof texto === 'string' ? JSON.parse(texto || '{}') : (texto || {}); } catch (err) { obj = {}; }
  var salida = {}, n = 0;
  Object.keys(obj || {}).forEach(function (k) {
    var v = obj[k] || {};
    var concepto = String(v.concepto || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var objetivo = Math.round(Number(v.objetivo) * 100) / 100;
    var fecha = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v.fecha || '')) ? v.fecha : '';
    if (!concepto || !(objetivo > 0) || !fecha || n >= MAXIMO_METAS) return;
    salida[claveLinea(concepto)] = { concepto: concepto, objetivo: objetivo, fecha: fecha };
    n++;
  });
  return salida;
}

/** Meses de 'desde' a 'hasta' ('2026-11' a '2027-02' = 3). */
function mesesEntre(desde, hasta) {
  var a = String(desde).split('-').map(Number), b = String(hasta).split('-').map(Number);
  return (b[0] * 12 + b[1]) - (a[0] * 12 + a[1]);
}

/**
 * Cómo va una meta en el mes 'mes': lo que ya hay (disponible, con lo de este mes) contra el objetivo.
 * porMes = lo que hay que apartar en cada mes que queda (después de este) hasta el mes límite.
 * estado: 'lista' (ya llegó), 'bien' (lo de este mes alcanza para ese ritmo), 'atrasada' o 'vencida' (se acabó el plazo).
 */
function planDeMeta(objetivo, fecha, disponible, aporteMes, mes) {
  var obj = Math.round(Number(objetivo) * 100) / 100;
  var hay = Math.round((Number(disponible) || 0) * 100) / 100;
  var faltan = Math.max(0, Math.round((obj - hay) * 100) / 100);
  var restantes = mesesEntre(mes, fecha);
  var porMes = 0, estado;
  if (faltan <= 0) estado = 'lista';
  else if (restantes <= 0) estado = 'vencida';
  else {
    porMes = Math.ceil((faltan / restantes) * 100) / 100;
    estado = (Number(aporteMes) || 0) + 0.005 >= porMes ? 'bien' : 'atrasada';
  }
  return { objetivo: obj, fecha: fecha, faltan: faltan, mesesRestantes: restantes, porMes: porMes, estado: estado,
    pct: obj > 0 ? Math.max(0, Math.min(100, Math.round((hay / obj) * 1000) / 10)) : 0 };
}

// ---------------------------------------------------------------------------
// Gastos fijos automáticos (motor 1.13.0): cada fijo tiene su día; los de débito automático se marcan
// pagados solos ese día y los demás se recuerdan hasta que se marquen.
// ---------------------------------------------------------------------------

var MAXIMO_FIJOS = 60;

/** Config guardada saneada: { claveLinea: {concepto, dia (1-31), auto} }. */
function fijosDesde(texto) {
  var obj = {};
  try { obj = typeof texto === 'string' ? JSON.parse(texto || '{}') : (texto || {}); } catch (err) { obj = {}; }
  var salida = {};
  var n = 0;
  Object.keys(obj || {}).forEach(function (k) {
    var v = obj[k] || {};
    var concepto = String(v.concepto || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var dia = Math.floor(Number(v.dia));
    var conDia = dia >= 1 && dia <= 31;
    var palabras = Array.isArray(v.palabras) ? palabrasValidas(v.palabras) : null; // motor 1.23.0
    if (!concepto || (!conDia && !palabras) || n >= MAXIMO_FIJOS) return;
    var f = { concepto: concepto, dia: conDia ? dia : 0, auto: conDia && v.auto === true };
    if (palabras) f.palabras = palabras;
    salida[claveLinea(concepto)] = f;
    n++;
  });
  return salida;
}

/** Fecha del fijo en ese mes calendario ('2026-11', día 31 -> '2026-11-30'). */
function fechaDelFijo(dia, anioMes) {
  var p = String(anioMes || '').split('-');
  var a = Number(p[0]), m = Number(p[1]);
  var ultimo = new Date(a, m, 0).getDate();
  return fechaISO(new Date(a, m - 1, Math.min(Math.max(1, dia), ultimo)));
}

/**
 * Fijos cuyo día de este mes calendario ya llegó: [{clave, concepto, fecha, mes, auto}].
 * mes = el mes del presupuesto que lo paga (el ciclo de cobro de esa fecha).
 */
function fijosVencidos(config, hoyISO) {
  var salida = [];
  var mesCal = String(hoyISO || '').slice(0, 7);
  Object.keys(config || {}).forEach(function (k) {
    var f = config[k];
    if (!(f.dia >= 1)) return; // solo con empresas, sin día
    var fecha = fechaDelFijo(f.dia, mesCal);
    if (fecha > hoyISO) return;
    salida.push({ clave: k, concepto: f.concepto, fecha: fecha, mes: mesDelCiclo(fecha), auto: f.auto === true });
  });
  return salida.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
}

/** Correo de los fijos que vencen hoy y no están marcados. lista: [{concepto, monto}]. */
function textoFijosDeHoy(lista) {
  var total = 0;
  lista.forEach(function (x) { total += Number(x.monto) || 0; });
  var nombres = lista.map(function (x) { return x.concepto; });
  return {
    asunto: 'Hoy vence: ' + (nombres.length > 2 ? nombres.slice(0, 2).join(', ') + ' y ' + (nombres.length - 2) + ' más' : nombres.join(' y ')),
    cuerpo: 'Hoy toca pagar:\n\n' + lista.map(function (x) { return '• ' + x.concepto + ': ' + formatoSoles_(x.monto); }).join('\n') +
      (lista.length > 1 ? '\n\nTotal: ' + formatoSoles_(total) : '') +
      '\n\nCuando lo pagues, márcalo en "Gastos fijos" de FinFamily y no te lo vuelvo a recordar.'
  };
}

function gastoRealDeLinea(linea, consumos, claveMes, mapa, conceptosConfig, rango) {
  var c0 = conceptosDeLinea(mapa, linea.concepto, conceptosConfig);
  var claves = {};
  c0.conceptos.forEach(function (c) { claves[normalizar(c)] = true; });
  // Con asignación guardada mandan solo esos conceptos; si es sugerida o no hay, también cuenta el nombre de la línea,
  // completo o sin lo que va entre paréntesis ('Remodelación (IBK-DEB-PE)' cuenta el concepto 'Remodelación').
  if (!c0.conceptos.length || c0.sugerido) {
    claves[normalizar(linea.concepto)] = true;
    claves[claveSinParentesis_(linea.concepto)] = true;
  }
  var total = 0;
  (consumos || []).forEach(function (c) {
    if (!c.fecha) return;
    // Con rango (ciclo de cobro) cuenta por fechas; sin rango, por mes calendario como antes.
    if (rango ? (c.fecha < rango.desde || c.fecha > rango.hasta) : c.fecha.slice(0, 7) !== claveMes) return;
    // Lo que sale del sobrante de alguien (P:) o de un ahorro (A:) no gasta la línea (regla del usuario, 1.21).
    if (c.origen) return;
    // Lo pagado con tarjeta de crédito ya cuenta en la línea de la tarjeta: no descuenta de los gastos fijos (1.21.1).
    if (c.deTarjeta) return;
    if (claves[normalizar(c.concepto)]) total += c.monto;
  });
  return redondear_(total);
}

// ---------------------------------------------------------------------------
// Gastos fijos pagados (nota en la celda del mes)
// ---------------------------------------------------------------------------

/** Renglón de la nota que empieza con "Pagado", o '' si no hay. */
function notaPagado(nota) {
  var lineas = String(nota === null || nota === undefined ? '' : nota).split(/\r?\n/);
  for (var i = 0; i < lineas.length; i++) {
    if (normalizar(lineas[i]).indexOf('pagado') === 0) return lineas[i].trim();
  }
  return '';
}

/** Nota sin los renglones que empiezan con "Pagado" (lo demás se conserva). */
function quitarNotaPagado(nota) {
  return String(nota === null || nota === undefined ? '' : nota).split(/\r?\n/)
    .filter(function (l) { return normalizar(l).indexOf('pagado') !== 0; })
    .join('\n').replace(/^\n+|\n+$/g, '');
}

/** Nota con un único renglón "Pagado…" (reemplaza el anterior y conserva lo demás). */
function ponerNotaPagado(nota, texto) {
  var resto = quitarNotaPagado(nota);
  return resto ? texto + '\n' + resto : texto;
}

// ---------------------------------------------------------------------------
// Gasto por persona
// ---------------------------------------------------------------------------

function nombreTarjeta_(id, catalogo) {
  if (id === 'HORMIGA') return 'Gastos hormiga';
  var t = buscarTarjetaCatalogo(catalogo, id);
  return t ? etiquetaTarjeta(t) : 'Otros';
}

function ordenadoPorMonto_(mapa, clave) {
  return Object.keys(mapa).map(function (k) {
    var o = { monto: redondear_(mapa[k]) };
    o[clave] = k;
    return o;
  }).sort(function (a, b) { return b.monto - a.monto; });
}

/**
 * Cuánto gastó cada responsable en un mes ('YYYY-MM'), según la fecha de cada consumo
 * (pagado o no). Devuelve, de mayor a menor: {nombre, total, consumos, conceptos[], medios[]}.
 */
function gastoPorPersona(consumos, claveMes, catalogo) {
  var porNombre = {};
  (consumos || []).forEach(function (c) {
    if (!c.fecha || c.fecha.slice(0, 7) !== claveMes) return;
    var nombre = c.responsable || 'Sin responsable';
    if (!porNombre[nombre]) porNombre[nombre] = { nombre: nombre, total: 0, consumos: 0, conceptos: {}, medios: {} };
    var p = porNombre[nombre];
    p.total += c.monto;
    p.consumos += 1;
    var concepto = c.concepto || 'Sin concepto';
    p.conceptos[concepto] = (p.conceptos[concepto] || 0) + c.monto;
    var medio = nombreTarjeta_(c.tarjeta, catalogo);
    p.medios[medio] = (p.medios[medio] || 0) + c.monto;
  });
  return Object.keys(porNombre).map(function (k) {
    var p = porNombre[k];
    return {
      nombre: p.nombre, total: redondear_(p.total), consumos: p.consumos,
      conceptos: ordenadoPorMonto_(p.conceptos, 'concepto'),
      medios: ordenadoPorMonto_(p.medios, 'medio')
    };
  }).sort(function (a, b) { return b.total - a.total; });
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

function etiquetaMedio_(idMedio, catalogo) {
  var medios = mediosDesde(catalogo);
  for (var i = 0; i < medios.length; i++) {
    if (medios[i].id === idMedio) return medios[i].etiqueta;
  }
  return '';
}

/**
 * Arma la fila a escribir (longitud anchoFila). Celdas sin columna quedan ''.
 * datos: {idCliente, monto, medio, concepto, descripcion, nota, fecha, tarjetaExplicita?, origen?}
 * origen: '' (fondo común, no se anota), 'P:<persona>' o 'A:<línea de ahorro>'; va como sufijo '|OR:…'.
 * tarjetaExplicita: id de tarjeta a guardar como sufijo '|TC:<ID>' en _id_form (solo si no es la de la regla).
 * ciclo: {pago, vence} de calcularCiclo (solo tarjetas).
 */
function construirFila(columnas, anchoFila, datos, usuarioNombre, hoja, ciclo, catalogo) {
  var fila = [];
  for (var i = 0; i < anchoFila; i++) fila.push('');
  var cols = columnas || {};
  var d = datos || {};
  var poner = function (idx, valor) {
    if (typeof idx === 'number' && idx >= 0 && idx < anchoFila) fila[idx] = valor;
  };
  var esHormiga = normalizar(hoja) === 'gastos hormiga';
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
    poner(cols.medio, etiquetaMedio_(d.medio, catalogo));
  }
  poner(cols.estado, esHormiga ? 'Pagado' : 'Pendiente');
  poner(cols.nota, neutralizarTexto(d.nota || ''));
  poner(cols.idForm, armarIdForm('APP:' + (d.idCliente || ''), d.tarjetaExplicita, d.origen));
  poner(cols.huella, firmaGasto({ fecha: fechaTexto, monto: monto, descripcion: d.descripcion }));
  return fila;
}

// ---------------------------------------------------------------------------
// Editar el presupuesto (validación del monto)
// ---------------------------------------------------------------------------

var MONTO_MAXIMO_PRESUPUESTO = 1000000;

/**
 * Revisa el monto nuevo de una línea del presupuesto.
 * Devuelve {monto} (redondeado a centavos) o {error} con el motivo en español.
 * Acepta número o texto ('1,234.50', 'S/ 80'). El cero sí vale; negativos no.
 */
function validarMontoPresupuesto(valor) {
  var n = null;
  if (typeof valor === 'number') n = isFinite(valor) ? valor : null;
  else if (typeof valor === 'string') n = parsearMonto(valor);
  if (n === null) return { error: 'El monto debe ser un número.' };
  if (n < 0) return { error: 'El monto no puede ser negativo.' };
  if (n > MONTO_MAXIMO_PRESUPUESTO) return { error: 'El monto es demasiado grande (máximo 1,000,000).' };
  return { monto: Math.round(n * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Ahorros acumulados
// ---------------------------------------------------------------------------

/**
 * Acumulado de cada meta de ahorro (líneas de la sección 'ahorros' del presupuesto)
 * sumando todos los meses de la hoja hasta claveMes inclusive, con el detalle por mes.
 * Son los montos escritos en el presupuesto, no movimientos reales de una cuenta.
 * Devuelve null si el mes no está en los encabezados.
 */
function ahorrosAcumulados(display2D, valores2D, claveMes) {
  var base = leerPresupuesto(display2D, valores2D, claveMes);
  if (!base) return null;
  var claves = base.meses.map(function (m) { return m.clave; })
    .filter(function (c) { return c <= claveMes; })
    .sort();
  var porFila = {};
  var orden = [];
  claves.forEach(function (clave) {
    var p = clave === claveMes ? base : leerPresupuesto(display2D, valores2D, clave);
    if (!p) return;
    p.filas.forEach(function (f) {
      if (f.seccion !== 'ahorros') return;
      if (!porFila[f.fila]) {
        porFila[f.fila] = { concepto: f.concepto, fila: f.fila, acumulado: 0, delMes: 0, meses: [] };
        orden.push(f.fila);
      }
      var meta = porFila[f.fila];
      meta.acumulado += f.monto;
      if (clave === claveMes) meta.delMes = f.monto;
      meta.meses.push({ mes: clave, etiqueta: claveAEtiqueta(clave), monto: f.monto });
    });
  });
  var total = 0, totalDelMes = 0;
  var metas = orden.map(function (fila) {
    var meta = porFila[fila];
    meta.acumulado = redondear_(meta.acumulado);
    total += meta.acumulado;
    totalDelMes += meta.delMes;
    return meta;
  });
  return {
    mes: claveMes,
    etiquetaMes: claveAEtiqueta(claveMes),
    desde: claves.length ? claves[0] : claveMes,
    metas: metas,
    total: redondear_(total),
    totalDelMes: redondear_(totalDelMes)
  };
}

// ---------------------------------------------------------------------------
// Avisos de vencimiento por correo
// ---------------------------------------------------------------------------

/** Días antes del vencimiento en que se avisa: 3 días antes, la víspera y el mismo día. */
var DIAS_DE_AVISO = [3, 1, 0];

/**
 * Decide qué avisar hoy. Un aviso por cada estado de cuenta con saldo pendiente
 * que vence exactamente en 3 días, mañana u hoy. No avisa de Gastos Hormiga,
 * ni de estados sin fecha, ni de los ya vencidos.
 * yaAvisadas: lista de claves ya enviadas (clave = 'hoy|tarjeta|vence'); esas se saltan.
 * Devuelve, del más urgente al menos urgente:
 *   [{clave, tarjeta, nombre, vence, monto, dias, cuando: 'hoy'|'manana'|'en_3_dias'}]
 */
function avisosDelDia(resumen, hoyISO, yaAvisadas) {
  var enviadas = {};
  (yaAvisadas || []).forEach(function (k) { enviadas[String(k)] = true; });
  var salida = [];
  if (!parsearFecha(hoyISO)) return salida;
  (resumen || []).forEach(function (t) {
    if (!t || t.id === 'HORMIGA') return;
    (t.estados || []).forEach(function (g) {
      if (!g || !g.vence || !(g.pendiente > 0)) return;
      var dias = diasEntre_(hoyISO, g.vence);
      if (dias === null || DIAS_DE_AVISO.indexOf(dias) === -1) return;
      var clave = hoyISO + '|' + t.id + '|' + g.vence;
      if (enviadas[clave]) return;
      enviadas[clave] = true; // por si el mismo estado viniera repetido
      salida.push({
        clave: clave, tarjeta: t.id, nombre: t.nombre, vence: g.vence,
        monto: redondear_(g.pendiente), dias: dias,
        cuando: dias === 0 ? 'hoy' : (dias === 1 ? 'manana' : 'en_3_dias')
      });
    });
  });
  salida.sort(function (a, b) {
    if (a.dias !== b.dias) return a.dias - b.dias;
    return a.nombre < b.nombre ? -1 : (a.nombre > b.nombre ? 1 : 0);
  });
  return salida;
}

/** 1234.5 -> 'S/ 1,234.50'; 6000 -> 'S/ 6,000' (sin céntimos no se escriben decimales; motor 1.9.6). */
function formatoSoles_(n) {
  var partes = redondear_(Number(n) || 0).toFixed(2).split('.');
  var negativo = partes[0].charAt(0) === '-';
  var entero = (negativo ? partes[0].slice(1) : partes[0]).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negativo ? '-' : '') + 'S/ ' + entero + (partes[1] === '00' ? '' : '.' + partes[1]);
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' */
function fechaCorta_(isoTexto) {
  var s = String(isoTexto || '');
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

function textoCuando_(cuando) {
  if (cuando === 'hoy') return 'vence HOY';
  if (cuando === 'manana') return 'vence mañana';
  return 'vence en 3 días';
}

/**
 * Asunto y cuerpo (texto simple) del correo para una lista de avisosDelDia.
 * Devuelve null si no hay nada que avisar.
 */
function textoAvisos(avisos) {
  var lista = avisos || [];
  if (!lista.length) return null;
  var asunto;
  if (lista.length === 1) {
    asunto = 'FinFamily: ' + lista[0].nombre + ' ' + textoCuando_(lista[0].cuando) +
      ' (' + formatoSoles_(lista[0].monto) + ')';
  } else {
    asunto = 'FinFamily: ' + lista.length + ' pagos de tarjeta por vencer';
  }
  var total = 0;
  var lineas = lista.map(function (a) {
    total += a.monto;
    return '• ' + a.nombre + ': ' + formatoSoles_(a.monto) + ' — ' + textoCuando_(a.cuando) +
      ' (' + fechaCorta_(a.vence) + ')';
  });
  var cuerpo = ['Hola, este es el recordatorio de FinFamily.', ''].concat(lineas);
  if (lista.length > 1) cuerpo = cuerpo.concat(['', 'Total: ' + formatoSoles_(total)]);
  cuerpo = cuerpo.concat(['', 'Cuando paguen, márquenlo como pagado en la app y dejarán de llegar avisos.']);
  return { asunto: asunto, cuerpo: cuerpo.join('\n') };
}

// ---------------------------------------------------------------------------
// Lector de correos de bancos (motor 1.3)
// ---------------------------------------------------------------------------

/**
 * Cómo reconocer a cada banco en un correo (editable).
 * dominios: del remitente. nombres: palabras que delatan al banco en el remitente
 * o en el asunto cuando el dominio no alcanza (p. ej. un reenvío).
 */
var BANCOS_CORREO = [
  // BCP manda los avisos (también los de tarjeta de débito) desde notificacionesbcp.com.pe.
  { banco: 'BCP', dominios: ['bcp.com.pe', 'notificacionesbcp.com.pe', 'viabcp.com'], nombres: ['bcp', 'banco de credito'] },
  { banco: 'IBK', dominios: ['interbank.pe', 'interbank.com.pe'], nombres: ['interbank'] },
  { banco: 'RIPLEY', dominios: ['bancoripley.com.pe', 'bancoripley.com', 'ripley.com.pe'], nombres: ['banco ripley', 'ripley'] },
  // La tarjeta Oh! hoy se llama Sip: avisa desde alertas.sip.pe, servicioalcliente.sip.pe y operaciones.agora.pe.
  { banco: 'SIP', dominios: ['sip.pe', 'agora.pe', 'tarjetaoh.pe', 'financieraoh.pe', 'financieraoh.com.pe', 'oh.pe'],
    nombres: ['tarjeta oh', 'financiera oh', 'oh!', 'tarjeta sip', 'operaciones sip'] }
];

/** Palabras del asunto o del cuerpo que indican un aviso de consumo. */
var PALABRAS_CONSUMO = ['consumo', 'compra', 'operacion', 'transaccion', 'cargo'];

/** Si el asunto trae alguna de estas, el correo no es un consumo (se ignora). */
var PALABRAS_NO_CONSUMO = [
  'pago recibido', 'recibimos tu pago', 'pago de tu tarjeta', 'gracias por tu pago', 'pago realizado', 'pago exitoso',
  'estado de cuenta', 'tu estado de cuenta', 'codigo de seguridad', 'codigo de verificacion', 'clave', 'token',
  'clave dinamica', 'promocion', 'promociones', 'oferta', 'ofertas', 'descuento', 'descuentos', 'sorteo',
  'newsletter', 'novedades', 'encuesta', 'bienvenido', 'bienvenida', 'cuotas sin intereses', 'anulacion',
  'extorno', 'devolucion', 'rechazada', 'rechazado', 'denegada', 'no se pudo',
  // órdenes de compra de tiendas por internet (Ripley.com): no son avisos de tarjeta
  'confirmamos tu compra', 'se entrego tu compra', 'tu pedido', 'tu orden', 'orden de compra'
];

/** Medio de pago (del catálogo) que corresponde a cada banco del lector. */
var MEDIO_POR_BANCO = { BCP: 'TC_BCP', RIPLEY: 'TC_RIPLEY', SIP: 'TC_SIP', IBK: 'TC_IBK' };

/** Valor inicial de ciclo por banco (se usa si el catálogo no tiene ese medio). */
var TARJETA_POR_BANCO = { BCP: 'BCP', RIPLEY: 'RIPLEY', SIP: 'SIP', IBK: 'IBK_P' };

/** Medio por tarjeta del catálogo (o del inicial si no está). */
function medioDeTarjeta_(idTarjeta, catalogo) {
  var t = buscarTarjetaCatalogo(catalogo || CATALOGO_DEFECTO, idTarjeta);
  return t ? t.medio : (buscarTarjetaCatalogo(CATALOGO_DEFECTO, idTarjeta) || {}).medio || '';
}

/** Encabezados de la hoja "Por confirmar" (en este orden). */
var COLUMNAS_POR_CONFIRMAR = ['Id', 'Fecha', 'Banco', 'Tarjeta', 'Comercio', 'Monto', 'Moneda', 'Últimos 4',
  'Responsable sugerido', 'Estado', 'Fecha correo', 'Asunto'];

/** Banco ('BCP'|'IBK'|'RIPLEY'|'SIP') según el remitente y, si no alcanza, el asunto; o null. */
function bancoDeCorreo(remitente, asunto) {
  var rem = normalizar(remitente);
  var dominio = (rem.match(/@([a-z0-9.\-]+)/) || [])[1] || '';
  for (var i = 0; i < BANCOS_CORREO.length; i++) {
    var b = BANCOS_CORREO[i];
    for (var j = 0; j < b.dominios.length; j++) {
      var d = b.dominios[j];
      if (dominio === d || dominio.slice(-(d.length + 1)) === '.' + d) return b.banco;
    }
  }
  // Sin el dominio: así un dominio parecido ("bcp.com.pe.falso.com") no engaña por el nombre.
  var texto = rem.replace(/@[a-z0-9.\-]+/g, ' ') + ' ' + normalizar(asunto);
  for (var k = 0; k < BANCOS_CORREO.length; k++) {
    var nombres = BANCOS_CORREO[k].nombres;
    for (var n = 0; n < nombres.length; n++) {
      if (texto.indexOf(nombres[n]) !== -1) return BANCOS_CORREO[k].banco;
    }
  }
  return null;
}

function tieneAlguna_(textoNormalizado, palabras) {
  for (var i = 0; i < palabras.length; i++) if (textoNormalizado.indexOf(palabras[i]) !== -1) return true;
  return false;
}

/** Patrón de "moneda + cifra": S/ 1,234.50, S/. 45, US$ 20.00, USD 20, $ 15. */
var PATRON_MONTO_ = /(US\$|U\$S|USD|S\/\.?|PEN|\$)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i;

function monedaDe_(simbolo) {
  var s = String(simbolo || '').toUpperCase().replace(/\s+/g, '');
  return (s === 'US$' || s === 'U$S' || s === 'USD' || s === '$') ? 'USD' : 'PEN';
}

/**
 * Primer monto con moneda del texto. Prefiere el que sigue a una palabra de consumo
 * ("consumo de S/ 85.90", "compra por US$ 20"). Devuelve {monto, moneda} o null.
 */
function montoDeTexto_(texto) {
  var t = String(texto || '');
  var conPalabra = new RegExp('(?:consumo|compra|operaci[oó]n|transacci[oó]n|cargo|monto|importe|total|por)[^0-9\\n]{0,40}?' +
    PATRON_MONTO_.source, 'i');
  var m = t.match(conPalabra) || t.match(PATRON_MONTO_);
  if (!m) return null;
  var monto = parsearMonto(m[2]);
  if (monto === null || !(monto > 0)) return null;
  return { monto: monto, moneda: monedaDe_(m[1]) };
}

/** Texto del comercio ya limpio: sin saltos, sin puntuación sobrante, máximo 60 letras. */
function limpiarComercio_(texto) {
  var t = String(texto || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ')
    .replace(/^[\s:*\-–—"'.,]+|[\s:*\-–—"'.,]+$/g, '').trim();
  if (t.length > 60) t = t.slice(0, 60).trim();
  return t;
}

/** Comercio según los formatos típicos: "en PLAZA VEA con/el/por", "Comercio: PLAZA VEA", "Establecimiento: ...". */
function comercioDeTexto_(texto) {
  var t = String(texto || '').replace(/\r/g, '');
  var corte = '(?=\\s+(?:con|el\\s+d[ií]a|el\\s+\\d|por\\s+(?:un\\s+)?(?:monto|importe|S\\/|US)|a\\s+las|utilizando|usando|desde|mediante)\\b|[,;\\n]|\\.(?=\\s|$)|$)';
  // Cuando el correo viene en una sola línea, el dato siguiente ("Monto:", "Número de operación") marca el fin.
  var finCampo = '(?=\\s+(?:Monto|Fecha|N[uú]mero|Tarjeta|Descargar|Importe|Hora|Operaci[oó]n)\\b|[\\n;]|$)';
  var m = t.match(new RegExp('(?:comercio|establecimiento|negocio|lugar|tienda)\\s*:\\s*([^\\n;]{2,80}?)' + finCampo, 'i')) ||
    t.match(new RegExp('\\bEmpresa\\s*:?\\s+([^\\n;]{2,80}?)' + finCampo, 'i')) ||
    t.match(new RegExp('\\ben\\s+(?:el\\s+)?(?:comercio|establecimiento|la\\s+tienda)\\s+([^\\n]{2,80}?)' + corte, 'im')) ||
    t.match(new RegExp('\\ben\\s+(?!tu\\b|el\\b|la\\b|los\\b|las\\b|cuotas\\b|soles\\b|d[oó]lares\\b|l[ií]nea\\b|caso\\b)([^\\n]{2,80}?)' + corte, 'im'));
  return m ? limpiarComercio_(m[1]) : '';
}

/** Últimos 4 dígitos de la tarjeta ("terminada en 4821", "**** 4821", "xxxx4821") o ''. */
function ultimos4DeTexto_(texto) {
  var t = String(texto || '');
  var m = t.match(/(?:terminad[ao]\s+en|terminaci[oó]n|que\s+termina\s+en|finaliza(?:da)?\s+en|n[uú]mero)\s*:?\s*(?:\*+|x+|\.+)?\s*(\d{4})\b/i) ||
    t.match(/(?:\*{2,}|x{2,}|•{2,})\s*-?\s*(\d{4})\b/i) ||
    t.match(/tarjeta[^\n\d]{0,40}?(\d{4})\b/i);
  return m ? m[1] : '';
}

/** Fecha del consumo dentro del cuerpo ('09/11/2026', '9-11-26', '2026-11-09'); ISO o ''. */
function fechaDeTexto_(texto) {
  var t = String(texto || '');
  // "07 de noviembre de 2026" (como lo escribe el BCP)
  var letras = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóúA-ZÁÉÍÓÚ]+)\s+de\s+(\d{4})\b/);
  if (letras) {
    var idx = -1;
    var mesN = normalizar(letras[2]);
    if (mesN === 'setiembre') mesN = 'septiembre';
    for (var i = 0; i < MESES_ES.length; i++) if (normalizar(MESES_ES[i]) === mesN) idx = i;
    if (idx !== -1) return fechaISO(parsearFecha(letras[1] + '/' + (idx + 1) + '/' + letras[3]));
  }
  var m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/);
  if (m) return fechaISO(parsearFecha(m[1] + '/' + m[2] + '/' + m[3]));
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return fechaISO(parsearFecha(m[0]));
  return '';
}

/**
 * Convierte un correo {remitente, asunto, cuerpo (texto plano), fechaISO} en un consumo
 * {banco, monto, moneda, comercio, ultimos4, fecha, tipo:'consumo'} o null si no es un
 * aviso de consumo (pagos recibidos, estados de cuenta, publicidad, códigos, etc.).
 */
function extraerConsumoDeCorreo(correo) {
  var c = correo || {};
  // Yape y Lemon tienen su propio formato (motor 1.8).
  if (billeteraDeCorreo(c.remitente)) return extraerMovimientoBilletera(c);
  var banco = bancoDeCorreo(c.remitente, c.asunto);
  if (!banco) return null;
  var asuntoN = normalizar(c.asunto);
  var cuerpo = String(c.cuerpo || '');
  var cuerpoN = normalizar(cuerpo);
  if (tieneAlguna_(asuntoN, PALABRAS_NO_CONSUMO)) return null;
  // Debe hablar de un consumo (en el asunto o en el cuerpo) y traer un monto con moneda.
  var esConsumo = tieneAlguna_(asuntoN, PALABRAS_CONSUMO) || tieneAlguna_(cuerpoN, PALABRAS_CONSUMO);
  if (!esConsumo) return null;
  // Avisos que mencionan "pago" o "estado de cuenta" en el cuerpo sin ser compras.
  if (!tieneAlguna_(asuntoN, PALABRAS_CONSUMO) &&
      /(recibimos|hemos recibido|se registro|registramos)\s+(tu|el|su)\s+pago|estado de cuenta/.test(cuerpoN)) return null;
  var dinero = montoDeTexto_(cuerpo) || montoDeTexto_(c.asunto);
  if (!dinero) return null;
  var comercio = comercioDeTexto_(cuerpo) || comercioDeTexto_(c.asunto);
  var fechaCorreo = fechaISO(parsearFecha(c.fechaISO));
  var consumo = {
    banco: banco,
    monto: dinero.monto,
    moneda: dinero.moneda,
    comercio: comercio,
    ultimos4: ultimos4DeTexto_(cuerpo),
    fecha: fechaDeTexto_(cuerpo) || fechaCorreo,
    tipo: 'consumo'
  };
  // Débito BCP (motor 1.8.3): sale de la cuenta de quien recibe el correo, no de la tarjeta de crédito BCP.
  if (banco === 'BCP' && /tarjeta de d[eé]bito/i.test(String(c.asunto || '') + ' ' + cuerpo)) {
    consumo.debito = true;
    consumo.titular = (cuerpo.replace(/\*/g, ' ').match(/Hola,?\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\s*[,!]/) || [])[1] || '';
  }
  return consumo;
}

/**
 * Qué tarjeta del catálogo y qué responsable sugerir para un consumo leído del correo.
 * Se buscan las tarjetas activas con el medio del banco (TC_IBK, TC_BCP...). Si hay varias
 * (Interbank), se decide por los últimos 4 dígitos guardados en los datos de tarjetas
 * ({IBK_P:{digitos}, ...}) y el responsable sugerido es el titular; si no se sabe, la
 * primera y sin responsable. Devuelve {tarjeta, responsable}.
 */
function tarjetaDeConsumo(banco, ultimos4, datosTarjetas, catalogo) {
  var cat = catalogo || CATALOGO_DEFECTO;
  var medio = MEDIO_POR_BANCO[banco] || 'TC_IBK';
  var candidatas = tarjetasActivas(cat).filter(function (t) { return t.medio === medio; });
  if (!candidatas.length) candidatas = ordenarCatalogo_(cat).filter(function (t) { return t.medio === medio; });
  if (!candidatas.length) return { tarjeta: TARJETA_POR_BANCO[banco] || 'IBK_P', responsable: '' };
  var d = datosTarjetas || {};
  var u4 = String(ultimos4 || '');
  if (candidatas.length > 1 && u4) {
    for (var i = 0; i < candidatas.length; i++) {
      var digitos = d[candidatas[i].id] && String(d[candidatas[i].id].digitos || '');
      if (digitos && digitos === u4) return { tarjeta: candidatas[i].id, responsable: candidatas[i].titular || '' };
    }
  }
  return { tarjeta: candidatas[0].id, responsable: candidatas.length === 1 ? '' : '' };
}

/**
 * Medio de pago sugerido para un consumo leído del correo. Normalmente el de la tarjeta
 * (TC_BCP, TC_SIP, TC_IBK, TC_RIPLEY); pero las transferencias por Plin ("PLIN-PersonaB")
 * y Yape cargadas al débito BCP van a Gastos Hormiga: 'PLIN' o 'YAPE'.
 */
function medioSugerido(tarjeta, comercio, catalogo, responsable) {
  var c = normalizar(comercio);
  if (tarjeta === 'LEMON' || /^lemon\b/.test(c)) return 'LEMON';
  if (tarjeta === 'YAPE') return 'YAPE';
  if (/^plin[\s\-:]/.test(c) || c === 'plin') return 'PLIN';
  if (c.indexOf('yape') !== -1) return 'YAPE';
  if (tarjeta === 'DEBITO_BCP') { // plata de la cuenta: su tarjeta de débito BCP (1.21) o, si no hay, efectivo
    var deb = debitoDe(catalogo && catalogo.debitos, 'BCP', responsable);
    return deb ? 'TD_' + deb.id : 'EFECTIVO';
  }
  return medioDeTarjeta_(tarjeta, catalogo) || 'TC_BCP';
}

/**
 * Primer nombre del saludo de un correo ("Hola PersonaB," / "¡Hola, PERSONA A!" / "Hola PERSONA , te…"), o ''.
 * Sirve para saber de quién es un aviso reenviado desde el Gmail de la otra persona (motor 1.9.2).
 */
function primerNombreDeSaludo(cuerpo) {
  var t = String(cuerpo || '').replace(/\*/g, ' ').replace(/\s+/g, ' ');
  var m = t.match(/Hola,?\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,})/);
  return m ? m[1] : '';
}

/** 'PersonaB' -> 'PersonaB' (cada palabra con mayúscula inicial). */
function capitalizar_(texto) {
  return String(texto || '').toLowerCase().replace(/(^|[\s\-])([a-záéíóúñ])/g, function (x, sep, letra) { return sep + letra.toUpperCase(); });
}

/**
 * Comercio tal como se mostrará: "PLIN-PersonaB" -> "Plin a Personab",
 * "YAPE-PERSONA DE PRUEBA
 */
function comercioLegible(comercio) {
  var c = String(comercio || '').trim();
  if (/^(plin|yape|lemon) a /i.test(c)) return c; // ya viene legible (Yape y Lemon del lector 1.8)
  var m = c.match(/^(plin|yape)\s*[\-:]?\s*(.+)$/i);
  if (!m || !m[2].trim()) return c;
  return capitalizar_(m[1]) + ' a ' + capitalizar_(m[2].trim());
}

// ---------------------------------------------------------------------------
// Billeteras: Yape y Lemon (motor 1.8)
// ---------------------------------------------------------------------------

/**
 * Billeteras que avisan por correo cada envío (editable). Yape manda un correo por cada yapeo;
 * Lemon, uno por cada envío de soles. Lo que va a uno mismo (pasar plata de una app a otra,
 * pagar la propia tarjeta) no es un gasto y se ignora.
 */
var BILLETERAS_CORREO = [
  { billetera: 'YAPE', dominios: ['yape.pe'] },
  { billetera: 'LEMON', dominios: ['lemoncash.com.ar', 'lemon.me'] }
];

/** 'YAPE' | 'LEMON' según el dominio del remitente, o null. */
function billeteraDeCorreo(remitente) {
  var rem = normalizar(remitente);
  var dominio = (rem.match(/@([a-z0-9.\-]+)/) || [])[1] || '';
  if (!dominio) return null;
  for (var i = 0; i < BILLETERAS_CORREO.length; i++) {
    var b = BILLETERAS_CORREO[i];
    for (var j = 0; j < b.dominios.length; j++) {
      var d = b.dominios[j];
      if (dominio === d || dominio.slice(-(d.length + 1)) === '.' + d) return b.billetera;
    }
  }
  return null;
}

/** true si dos nombres son de la misma persona (mismas dos primeras palabras, sin tildes). */
function mismaPersona_(a, b) {
  var pa = normalizar(a).replace(/[^a-z ]/g, ' ').split(' ').filter(Boolean);
  var pb = normalizar(b).replace(/[^a-z ]/g, ' ').split(' ').filter(Boolean);
  if (!pa.length || !pb.length) return false;
  var n = Math.min(2, pa.length, pb.length);
  for (var i = 0; i < n; i++) if (pa[i] !== pb[i]) return false;
  return true;
}

/** "08 noviembre 2026" (como lo escribe Yape) -> '2026-11-08', o ''. */
function fechaConMesEnLetras_(texto) {
  var m = String(texto || '').match(/\b(\d{1,2})\s+(?:de\s+)?([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+(?:de\s+|del\s+)?(\d{4})\b/);
  if (!m) return '';
  var mesN = normalizar(m[2]);
  if (mesN === 'setiembre') mesN = 'septiembre';
  for (var i = 0; i < MESES_ES.length; i++) {
    if (normalizar(MESES_ES[i]) === mesN) return fechaISO(parsearFecha(m[1] + '/' + (i + 1) + '/' + m[3]));
  }
  return '';
}

/** Monto escrito por Lemon ("5.0000", "61.0200") o Yape ("3.90", "1,250.00"). */
function montoBilletera_(texto) {
  var t = String(texto || '').trim();
  // Lemon escribe siempre 4 decimales ("5.0000"): ahí el punto no es de miles.
  if (/^\d+[.,]\d{4}$/.test(t)) {
    var n = Number(t.replace(',', '.'));
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  var m = parsearMonto(t);
  return m !== null && m > 0 ? m : null;
}

/**
 * Convierte el correo de una billetera en un consumo {banco:'YAPE'|'LEMON', monto, moneda, comercio,
 * ultimos4:'', fecha, tipo:'consumo', titular}. Null si no es un envío (ingresos, avisos de seguridad,
 * estados de cuenta) o si la plata fue a la misma persona.
 */
function extraerMovimientoBilletera(correo) {
  var c = correo || {};
  var billetera = billeteraDeCorreo(c.remitente);
  if (!billetera) return null;
  // Gmail entrega el texto con asteriscos donde había negritas (*Monto de yapeo**): se quitan.
  var cuerpo = String(c.cuerpo || '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  var fechaCorreo = fechaISO(parsearFecha(c.fechaISO));
  var monto, comercio, titular, fecha;

  if (billetera === 'YAPE') {
    if (!/acabas de yapear/i.test(cuerpo)) return null;
    var m = cuerpo.match(/Monto de yapeo\s*:?\s*S\/\.?\s*([0-9][0-9.,]*)/i);
    if (!m) return null;
    monto = montoBilletera_(m[1]);
    titular = (cuerpo.match(/Yapero\s*:?\s*(.+?)\s+Tu n[uú]mero de celular/i) || [])[1] || '';
    var miCelular = (cuerpo.match(/Tu n[uú]mero de celular\s*:?\s*[X*x•]*\s*(\d{2,4})\b/i) || [])[1] || '';
    var suCelular = (cuerpo.match(/Celular del Beneficiario\s*:?\s*[X*x•]*\s*(\d{2,4})\b/i) || [])[1] || '';
    var beneficiario = (cuerpo.match(/Nombre del Beneficiario\s*:?\s*(.+?)\s+N[º°o]\.?\s*de operaci[oó]n/i) || [])[1] || '';
    if ((miCelular && miCelular === suCelular) || (beneficiario && titular && mismaPersona_(beneficiario, titular))) return null;
    comercio = 'Yape a ' + capitalizar_(beneficiario || 'alguien');
    fecha = fechaConMesEnLetras_((cuerpo.match(/Fecha y Hora de la operaci[oó]n\s*:?\s*(.{6,40})/i) || [])[1]) || fechaCorreo;
  } else {
    if (!/realizaste un env[ií]o/i.test(cuerpo)) return null;
    var e = cuerpo.match(/env[ií]o exitoso de S\/\.?\s*([0-9][0-9.,]*)/i) || String(c.asunto || '').match(/Enviaste S\/\.?\s*([0-9][0-9.,]*)/i);
    if (!e) return null;
    monto = montoBilletera_(e[1].replace(/[.,]$/, ''));
    var saludo = cuerpo.match(/^(.*?),\s*¡?\s*realizaste un env[ií]o exitoso/i);
    titular = saludo ? saludo[1].replace(/^.*(?:soles|descargar)\s+/i, '').trim() : '';
    // Los datos vienen en una lista ("- Nombre: X - N° de teléfono: …"): se busca "Nombre:" después de "destinatario".
    var desde = cuerpo.search(/destinatario/i);
    var destino = ((desde === -1 ? cuerpo : cuerpo.slice(desde))
      .match(/Nombre:\s*(.+?)\s*(?:[\-•·]\s*)?(?:N[°º]\.?\s*de tel|CCI:|Entidad:|Mensaje:|Otros detalles)/i) || [])[1] || '';
    destino = destino.replace(/[\s\-•·]+$/, '').trim();
    if (destino && titular && mismaPersona_(destino, titular)) return null;
    comercio = 'Lemon a ' + capitalizar_(destino || 'alguien');
    var ext = cuerpo.match(/ID externo:\s*(20\d{2})(\d{2})(\d{2})/i);
    fecha = (ext && fechaISO(parsearFecha(ext[1] + '-' + ext[2] + '-' + ext[3]))) || fechaCorreo;
  }
  if (!(monto > 0)) return null;
  return {
    banco: billetera, monto: monto, moneda: 'PEN', comercio: limpiarComercio_(comercio), ultimos4: '',
    fecha: fecha, tipo: 'consumo', titular: capitalizar_(titular)
  };
}

/**
 * Lee la hoja "Por confirmar" (valores desde la fila 1). Devuelve una lista de
 * {fila, id, fecha, banco, tarjeta, comercio, monto, moneda, ultimos4, responsable, estado, fechaCorreo, asunto}.
 */
function leerPendientes(valores2D) {
  var salida = [];
  if (!valores2D || !valores2D.length) return salida;
  var idxEnc = buscarFilaEncabezado(valores2D, 'Id');
  if (idxEnc === -1) return salida;
  var enc = valores2D[idxEnc].map(normalizar);
  var col = function (nombre) { return enc.indexOf(normalizar(nombre)); };
  var c = {
    id: col('Id'), fecha: col('Fecha'), banco: col('Banco'), tarjeta: col('Tarjeta'), comercio: col('Comercio'),
    monto: col('Monto'), moneda: col('Moneda'), ultimos4: col('Últimos 4'), responsable: col('Responsable sugerido'),
    estado: col('Estado'), fechaCorreo: col('Fecha correo'), asunto: col('Asunto')
  };
  for (var i = idxEnc + 1; i < valores2D.length; i++) {
    var f = valores2D[i] || [];
    var id = texto_(celda_(f, c.id));
    if (!id) continue;
    var monto = parsearMonto(celda_(f, c.monto));
    salida.push({
      fila: i + 1, id: id,
      fecha: fechaISO(parsearFecha(celda_(f, c.fecha))) || texto_(celda_(f, c.fecha)),
      banco: texto_(celda_(f, c.banco)), tarjeta: texto_(celda_(f, c.tarjeta)), comercio: texto_(celda_(f, c.comercio)),
      monto: monto === null ? 0 : monto, moneda: texto_(celda_(f, c.moneda)) || 'PEN',
      ultimos4: texto_(celda_(f, c.ultimos4)), responsable: texto_(celda_(f, c.responsable)),
      estado: texto_(celda_(f, c.estado)), fechaCorreo: texto_(celda_(f, c.fechaCorreo)), asunto: texto_(celda_(f, c.asunto))
    });
  }
  return salida;
}

/** Solo los pendientes con Estado 'Pendiente', del más reciente (fecha del correo) al más antiguo. */
function pendientesActivos(lista, catalogo) {
  return (lista || []).filter(function (p) { return normalizar(p.estado) === 'pendiente'; })
    .sort(function (a, b) {
      if (a.fechaCorreo !== b.fechaCorreo) return a.fechaCorreo > b.fechaCorreo ? -1 : 1;
      return b.fila - a.fila;
    })
    .map(function (p) {
      return { id: p.id, fecha: p.fecha, banco: p.banco, tarjeta: p.tarjeta, comercio: p.comercio, monto: p.monto,
        moneda: p.moneda, ultimos4: p.ultimos4, responsable: p.responsable, fechaCorreo: p.fechaCorreo,
        medioSugerido: medioSugerido(p.tarjeta, p.comercio, catalogo, p.responsable) };
    });
}

// ---------------------------------------------------------------------------
// Ajustes de avisos y datos de tarjetas (motor 1.3)
// ---------------------------------------------------------------------------

var AJUSTES_AVISOS_DEFECTO = { vencimiento: true, presupuesto: true, gastoGrande: 300, resumenSemanal: true, calendario: true, recordatorio: true, subidas: true };
var GASTO_GRANDE_MAXIMO = 100000;
var IDS_TARJETAS_DATOS = ['SIP', 'IBK_P', 'IBK_B', 'BCP', 'RIPLEY']; // valor inicial; manda el catálogo

function idsDeTarjetas_(catalogo) {
  return catalogo ? ordenarCatalogo_(catalogo).map(function (t) { return t.id; }) : IDS_TARJETAS_DATOS;
}

/** Ajustes guardados (texto JSON o null) completados con los valores por defecto. */
function ajustesAvisosDesde(crudo) {
  var a = {};
  Object.keys(AJUSTES_AVISOS_DEFECTO).forEach(function (k) { a[k] = AJUSTES_AVISOS_DEFECTO[k]; });
  if (!crudo) return a;
  var g;
  try { g = JSON.parse(crudo); } catch (err) { return a; }
  if (!g || typeof g !== 'object') return a;
  ['vencimiento', 'presupuesto', 'resumenSemanal', 'calendario', 'recordatorio', 'subidas'].forEach(function (k) {
    if (typeof g[k] === 'boolean') a[k] = g[k];
  });
  if (typeof g.gastoGrande === 'number' && isFinite(g.gastoGrande) && g.gastoGrande >= 0 && g.gastoGrande <= GASTO_GRANDE_MAXIMO) {
    a.gastoGrande = Math.round(g.gastoGrande * 100) / 100;
  }
  return a;
}

/**
 * Revisa los ajustes que manda la app y los mezcla con los actuales.
 * Devuelve {ajustes} o {error}. Los campos que no vienen se dejan como estaban.
 */
function validarAjustesAvisos(datos, actuales) {
  var d = datos || {};
  var a = ajustesAvisosDesde(JSON.stringify(actuales || AJUSTES_AVISOS_DEFECTO));
  var booleanos = ['vencimiento', 'presupuesto', 'resumenSemanal', 'calendario', 'recordatorio', 'subidas'];
  for (var i = 0; i < booleanos.length; i++) {
    var k = booleanos[i];
    if (d[k] === undefined) continue;
    if (typeof d[k] !== 'boolean') return { error: 'El ajuste "' + k + '" debe ser sí o no.' };
    a[k] = d[k];
  }
  if (d.gastoGrande !== undefined) {
    var n = typeof d.gastoGrande === 'number' ? d.gastoGrande : (typeof d.gastoGrande === 'string' ? parsearMonto(d.gastoGrande) : null);
    if (n === null || !isFinite(n)) return { error: 'El monto de gasto grande debe ser un número.' };
    if (n < 0) return { error: 'El monto de gasto grande no puede ser negativo.' };
    if (n > GASTO_GRANDE_MAXIMO) return { error: 'El monto de gasto grande es demasiado alto (máximo 100,000).' };
    a.gastoGrande = Math.round(n * 100) / 100;
  }
  return { ajustes: a };
}

/** Datos de tarjetas guardados (texto JSON o null): {SIP:{digitos, red, nombre}, ...} siempre con las 5 tarjetas. */
function datosTarjetasDesde(crudo, catalogo) {
  var g = null;
  if (crudo) { try { g = JSON.parse(crudo); } catch (err) { g = null; } }
  var salida = {};
  idsDeTarjetas_(catalogo).forEach(function (id) {
    var t = (g && g[id] && typeof g[id] === 'object') ? g[id] : {};
    var digitos = /^\d{4}$/.test(String(t.digitos || '')) ? String(t.digitos) : '';
    var red = (t.red === 'visa' || t.red === 'mastercard') ? t.red : '';
    var nombre = String(t.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 26);
    salida[id] = { digitos: digitos, red: red, nombre: nombre };
    if (DISENO_TARJETA_RE.test(String(t.diseno || ''))) salida[id].diseno = String(t.diseno);
  });
  return salida;
}

/** Diseño del plástico (motor 1.20.1): 'propio' o el id de un diseño real del banco, p. ej. 'ibk-clasica'. */
var DISENO_TARJETA_RE = /^(propio|[a-z]{2,8}(-[a-z]{2,12}){0,3})$/;

/** Revisa {id, digitos, red, nombre, diseno?} de una tarjeta. Devuelve {tarjeta} o {error}. */
function validarDatosTarjeta(datos, catalogo) {
  var d = datos || {};
  var ids = idsDeTarjetas_(catalogo);
  if (ids.indexOf(d.id) === -1) return { error: 'La tarjeta no es válida (' + ids.join(', ') + ').' };
  var digitos = d.digitos === undefined || d.digitos === null ? '' : String(d.digitos).trim();
  if (digitos && !/^\d{4}$/.test(digitos)) return { error: 'Los últimos dígitos deben ser 4 números.' };
  var red = d.red === undefined || d.red === null ? '' : String(d.red).trim().toLowerCase();
  if (red && red !== 'visa' && red !== 'mastercard') return { error: 'La red debe ser visa o mastercard.' };
  var nombre = d.nombre === undefined || d.nombre === null ? '' : String(d.nombre).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nombre.length > 26) return { error: 'El nombre de la tarjeta es muy largo (máximo 26 caracteres).' };
  var tarjeta = { id: d.id, digitos: digitos, red: red, nombre: nombre };
  var diseno = d.diseno === undefined || d.diseno === null ? '' : String(d.diseno).trim().toLowerCase();
  if (diseno && !DISENO_TARJETA_RE.test(diseno)) return { error: 'El diseño de la tarjeta no es válido.' };
  if (diseno) tarjeta.diseno = diseno;
  return { tarjeta: tarjeta };
}

// ---------------------------------------------------------------------------
// Alertas por correo (motor 1.3): textos puros
// ---------------------------------------------------------------------------

/** 'S/ 450.00' o 'US$ 20.00' según la moneda. */
function formatoMonto_(n, moneda) {
  var s = formatoSoles_(n);
  return moneda === 'USD' ? s.replace('S/ ', 'US$ ') : s;
}

/** Primer nombre ('PersonaA' -> 'PersonaA'). */
function primerNombre_(nombre) {
  return String(nombre || '').trim().split(' ')[0];
}

/**
 * Correo inmediato por un gasto grande.
 * aviso: {responsable, monto, descripcion, medio (etiqueta, ej. 'TC BCP'), concepto, fecha}
 */
function textoGastoGrande(aviso) {
  var a = aviso || {};
  var quien = primerNombre_(a.responsable) || 'Alguien';
  var frase = quien + ' registró ' + formatoSoles_(a.monto) + ' en ' + (a.descripcion || 'un gasto') +
    (a.medio ? ' (' + a.medio + ')' : '');
  var cuerpo = ['Hola, este es un aviso de FinFamily por un gasto grande.', '', frase + '.'];
  if (a.concepto) cuerpo.push('Concepto: ' + a.concepto + '.');
  if (a.fecha) cuerpo.push('Fecha: ' + fechaCorta_(a.fecha) + '.');
  cuerpo.push('', 'Si fue un error, pueden corregirlo o borrarlo desde la app.');
  return { asunto: 'FinFamily: ' + frase, cuerpo: cuerpo.join('\n') };
}

// ---------------------------------------------------------------------------
// Recordatorio de anotar (motor 1.22.0): si alguien lleva 3 días sin anotar nada, se le recuerda una sola vez
// por cada racha (hasta que vuelva a anotar).
// ---------------------------------------------------------------------------

var DIAS_RECORDATORIO_ANOTAR = 3;
var URL_ANOTAR_GASTO = 'https://pedronicolas98.github.io/finfamily-app/gasto.html';

/**
 * A quién toca recordarle. consumos: [{responsable, fecha}]; usuarios: {correo: {nombre}};
 * avisados: {correo: fecha del último gasto por el que ya se le avisó}. Solo a quien ya anotó alguna vez.
 * Devuelve [{correo, nombre, ultima, dias}].
 */
function recordatoriosAnotar(consumos, usuarios, hoy, avisados, dias) {
  var limite = dias || DIAS_RECORDATORIO_ANOTAR;
  var ultima = {};
  (consumos || []).forEach(function (c) {
    if (!c || !c.fecha || c.fecha > hoy) return;
    var k = normalizar(primerNombre_(c.responsable));
    if (k && (!ultima[k] || c.fecha > ultima[k])) ultima[k] = c.fecha;
  });
  var salida = [];
  Object.keys(usuarios || {}).forEach(function (correo) {
    var nombre = primerNombre_((usuarios[correo] || {}).nombre);
    var u = ultima[normalizar(nombre)];
    if (!nombre || !u) return;
    var d = diasEntre_(u, hoy);
    if (d === null || d < limite) return;
    if (avisados && avisados[correo] === u) return;
    salida.push({ correo: correo, nombre: nombre, ultima: u, dias: d });
  });
  return salida;
}

/** {asunto, cuerpo} del recordatorio para una persona {nombre, ultima, dias}. */
function textoRecordatorioAnotar(r) {
  return {
    asunto: 'FinFamily: ' + r.nombre + ', ¿anotamos tus gastos?',
    cuerpo: ['Hola ' + r.nombre + ', hace ' + r.dias + ' días que no anotas ningún gasto (el último fue el ' + fechaCorta_(r.ultima) + ').',
      '', 'Si gastaste algo, anótalo al toque aquí:', URL_ANOTAR_GASTO,
      '', 'Si no gastaste nada, ¡bien ahí! Ignora este mensaje.'].join('\n')
  };
}

// ---------------------------------------------------------------------------
// Pagos fijos por correo (motor 1.23.0): cuando llega el correo de un pago ya hecho (débito automático,
// "cobro de tu recibo", pago o yapeo de un servicio) o un consumo con tarjeta en la empresa de una línea fija
// (Entel, WOW, Luz del Sur, Netflix...), se suma a esa línea; cuando lo pagado llega a lo planeado, se marca
// pagada sola. Los recibos por pagar ("Total a pagar", "Tu boleta") no cuentan.
// ---------------------------------------------------------------------------

/** Empresas que se reconocen solas según el nombre de la línea (hasta que el usuario elija las suyas). */
var PALABRAS_FIJO_DEFECTO = [
  { patron: /movil|celular|telefon/, palabras: ['entel', 'claro', 'movistar', 'bitel'] },
  { patron: /internet|wifi|fibra/, palabras: ['wow', 'win internet', 'fiberpro', 'mi fibra'] },
  { patron: /servicio|luz|agua|\bgas\b/, palabras: ['luz del sur', 'enel', 'sedapal', 'calidda'] },
  { patron: /suscrip|streaming/, palabras: ['netflix', 'spotify', 'youtube', 'disney', 'prime video', 'hbo', 'google one', 'icloud'] }
];
var MAXIMO_PALABRAS_FIJO = 8;
var UMBRAL_PAGADO_FIJO = 0.9; // con el 90 % de lo planeado ya se da por pagado (los recibos varían un poco)

/** Lista de empresas saneada (arreglo o texto separado por comas): minúsculas, sin tildes, 2-30 letras, sin repetir. */
function palabrasValidas(lista) {
  var crudo = Array.isArray(lista) ? lista : String(lista || '').split(/[,;\n]/);
  var salida = [];
  crudo.forEach(function (p) {
    var t = normalizar(p).replace(/[^a-z0-9 &.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 30 || salida.indexOf(t) !== -1 || salida.length >= MAXIMO_PALABRAS_FIJO) return;
    salida.push(t);
  });
  return salida;
}

/** Empresas de una línea: las elegidas por el usuario o, si nunca eligió, las de su tipo (por el nombre). */
function palabrasDeFijo(concepto, config) {
  var f = (config || {})[claveLinea(concepto)];
  if (f && Array.isArray(f.palabras)) return f.palabras.slice();
  var n = claveSinParentesis_(concepto);
  for (var i = 0; i < PALABRAS_FIJO_DEFECTO.length; i++) {
    if (PALABRAS_FIJO_DEFECTO[i].patron.test(n)) return PALABRAS_FIJO_DEFECTO[i].palabras.slice();
  }
  return [];
}

// Motor 1.25.1: solo confirmaciones claras ("afíliate al débito automático" en un recibo por pagar no cuenta).
var FRASES_PAGO_SERVICIO = /(realizo|procesado) un debito automatico|(exito|exitoso)[^.]{0,80}cobro de tu recibo|cobro de tu recibo[^.]{0,80}(exito|exitoso)|servicio fue yapeado|yapeo de servicio ha sido confirmado|pago de tu servicio se realizo|pago de (tu |su )?servicio[^.]{0,60}(exitoso|realizado|con exito)|pagaste (tu|el) recibo|recibo pagado/;
var FRASES_NO_PAGO = /recibo digital|tu boleta|total a pagar|monto a pagar|ultimo dia de pago|afiliacion|modificacion de (la )?tarjeta|rechazad|no se pudo|fallid|pendiente de pago|pagaste con exito tu tarjeta|pago de tu tarjeta|pago a tu tarjeta/;
// El pie de los correos (redes sociales, "descarga la app") no sirve para saber la empresa: trae "YouTube", "Facebook"...
var CORTE_PIE_CORREO = /encuentranos|siguenos|descarga (la|nuestra) app|copyright|redes sociales|este buzon no es monitoreado|no respondas este/;

/**
 * Un correo {remitente, asunto, cuerpo, fechaISO} que confirma un pago de servicio ya hecho, en soles:
 * {monto, fecha (la del correo), texto (normalizado, para buscar la empresa)} o null.
 */
function pagoDeServicioDeCorreo(correo) {
  var c = correo || {};
  var asunto = String(c.asunto || '');
  var cuerpo = String(c.cuerpo || '');
  var texto = normalizar(asunto + ' ' + cuerpo);
  if (!FRASES_PAGO_SERVICIO.test(texto) || FRASES_NO_PAGO.test(texto)) return null;
  var asuntoN = normalizar(asunto);
  if (/\b(recibo|boleta)\b/.test(asuntoN) && !/pagad|cobro|exito/.test(asuntoN)) return null; // "Recibo Claro - Octubre"
  var dinero = montoDeTexto_(cuerpo) || montoDeTexto_(asunto);
  if (!dinero || dinero.moneda !== 'PEN') return null;
  var fecha = fechaISO(parsearFecha(c.fechaISO));
  if (!fecha) return null;
  var cuerpoN = normalizar(cuerpo);
  var pie = cuerpoN.search(CORTE_PIE_CORREO);
  // texto: quién lo manda y el asunto (manda primero); textoCuerpo: el cuerpo sin el pie, para "Empresa: Luz del Sur".
  return { monto: dinero.monto, fecha: fecha, texto: normalizar(String(c.remitente || '') + ' ' + asunto),
    textoCuerpo: (pie >= 0 ? cuerpoN.slice(0, pie) : cuerpoN).slice(0, 800) };
}

function contienePalabra_(textoNormalizado, palabra) {
  var p = String(palabra || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !!p && new RegExp('(^|[^a-z0-9])' + p + '([^a-z0-9]|$)').test(textoNormalizado);
}

/**
 * A qué línea va un pago: la que tiene una de sus empresas en el texto. Si dos líneas se lo disputan, gana la
 * palabra más larga; si empatan, no se asigna. lineas: [{clave, palabras}]. Devuelve {clave, palabra} o null.
 */
function lineaDePago(texto, lineas) {
  var mejor = null;
  var empate = false;
  (lineas || []).forEach(function (l) {
    (l.palabras || []).forEach(function (p) {
      if (!contienePalabra_(texto, p)) return;
      if (!mejor || p.length > mejor.palabra.length) { mejor = { clave: l.clave, palabra: p }; empate = false; }
      else if (p.length === mejor.palabra.length && l.clave !== mejor.clave) empate = true;
    });
  });
  return mejor && !empate ? mejor : null;
}

/** Total pagado de una línea sin contar dos veces el mismo pago (mismo monto con 2 días o menos de diferencia). */
function sumaPagosFijo(lista) {
  var total = pagosUnicos(lista).reduce(function (t, p) { return t + p.monto; }, 0);
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cobros de servicios (motor 1.25.0): con los pagos leídos del correo se aprende qué día y cuánto se cobra cada
// empresa (dos recibos de Entel de montos distintos son dos cobros) y se avisa si un cobro sube de precio.
// ---------------------------------------------------------------------------

/** Los pagos sin repetir (el mismo monto con 2 días o menos de diferencia es el mismo pago), del más viejo al más nuevo. */
function pagosUnicos(lista) {
  var vistos = [];
  (lista || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }).forEach(function (p) {
    var monto = Number(p.monto) || 0;
    var repetido = vistos.some(function (v) { return Math.abs(v.monto - monto) < 0.01 && Math.abs(diasEntre_(v.fecha, p.fecha)) <= 2; });
    if (!repetido) vistos.push({ id: p.id, fecha: p.fecha, monto: monto, de: p.de });
  });
  return vistos;
}

/**
 * Cobros aprendidos del registro de pagos: [{clave, de, dia, monto, ultima, veces}], uno por empresa, línea y
 * monto parecido (±15 % o S/ 3). dia y monto son los del último cobro.
 */
function cobrosAprendidos(registro, hoy) {
  // Motor 1.25.2: con hoy, un cobro que no se ve hace más de 45 días ya no se espera (p. ej. un plan que se cambió).
  var vigente = hoy ? sumarDias_(hoy, -45) : '';
  var grupos = {};
  var meses = (registro && registro.meses) || {};
  Object.keys(meses).forEach(function (mes) {
    Object.keys(meses[mes]).forEach(function (clave) {
      meses[mes][clave].forEach(function (p) {
        if (!p.de) return;
        var k = clave + '\u0001' + p.de;
        (grupos[k] = grupos[k] || []).push(p);
      });
    });
  });
  var salida = [];
  Object.keys(grupos).forEach(function (k) {
    var partes = k.split('\u0001');
    var racimos = [];
    pagosUnicos(grupos[k]).forEach(function (p) {
      var mejor = null;
      racimos.forEach(function (r) {
        var d = Math.abs(r.ultimo.monto - p.monto);
        if (d <= Math.max(3, r.ultimo.monto * 0.15) && (!mejor || d < Math.abs(mejor.ultimo.monto - p.monto))) mejor = r;
      });
      if (mejor) { mejor.veces++; mejor.ultimo = p; } else racimos.push({ ultimo: p, veces: 1 });
    });
    racimos.forEach(function (r) {
      if (vigente && r.ultimo.fecha < vigente) return;
      salida.push({ clave: partes[0], de: partes[1], dia: Number(r.ultimo.fecha.slice(8, 10)), monto: r.ultimo.monto, ultima: r.ultimo.fecha, veces: r.veces });
    });
  });
  return salida.sort(function (a, b) { return (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0) || (a.dia - b.dia); });
}

/**
 * ¿Este pago {fecha, monto} sube frente al cobro anterior de la misma empresa y línea? anteriores: pagos ya
 * guardados. Se compara con el más parecido de hace 20 a 75 días. Devuelve {antes, fechaAntes, ahora, dif} o null.
 */
function subidaDePrecio(anteriores, pago) {
  var previos = pagosUnicos(anteriores).filter(function (p) {
    var d = diasEntre_(p.fecha, pago.fecha);
    return d >= 20 && d <= 75;
  });
  if (!previos.length) return null;
  var ahora = Number(pago.monto) || 0;
  var cerca = previos.reduce(function (a, b) { return Math.abs(b.monto - ahora) < Math.abs(a.monto - ahora) ? b : a; });
  var dif = Math.round((ahora - cerca.monto) * 100) / 100;
  if (dif < Math.max(1, cerca.monto * 0.03)) return null;
  return { antes: cerca.monto, fechaAntes: cerca.fecha, ahora: ahora, dif: dif };
}

/** {asunto, cuerpo} del aviso de subida. x: {de, linea, antes, fechaAntes, ahora, dif}. */
function textoSubidaPrecio(x) {
  var de = capitalizar_(x.de);
  return {
    asunto: 'FinFamily: ' + de + ' subió ' + formatoSoles_(x.dif),
    cuerpo: [de + ' cobró ' + formatoSoles_(x.ahora) + '. La vez anterior (' + fechaCorta_(x.fechaAntes) + ') fueron ' + formatoSoles_(x.antes) + '.',
      '', 'Va en la línea ' + x.linea + ' del presupuesto. Si no esperabas el cambio, revisa tu plan con ' + de + '.'].join('\n')
  };
}

/** {asunto, cuerpo} de los cobros que vienen en 2 días. lista: [{de, monto, fecha, linea}]. */
function textoCobrosProximos(lista) {
  var nombres = lista.map(function (x) { return capitalizar_(x.de); });
  return {
    asunto: 'FinFamily: en 2 días toca ' + (nombres.length > 2 ? nombres.slice(0, 2).join(', ') + ' y ' + (nombres.length - 2) + ' más' : nombres.join(' y ')),
    cuerpo: 'Se vienen estos cobros:\n\n' + lista.map(function (x) {
      return '• ' + capitalizar_(x.de) + ': ~' + formatoSoles_(x.monto) + ' el ' + fechaCorta_(x.fecha).slice(0, 5) + ' (' + x.linea + ')';
    }).join('\n') + '\n\nQue la tarjeta o la cuenta tenga saldo.'
  };
}


/** Registro guardado de pagos fijos (texto JSON o null): {ids: {idCorreo: fecha}, meses: {mes: {clave: [pagos]}}}. */
function pagosFijosDesde(texto) {
  var g = null;
  try { g = JSON.parse(texto || 'null'); } catch (err) { g = null; }
  var salida = { ids: {}, meses: {} };
  if (!g || typeof g !== 'object') return salida;
  if (g.ids && typeof g.ids === 'object') Object.keys(g.ids).forEach(function (k) { salida.ids[k] = String(g.ids[k] || ''); });
  if (g.meses && typeof g.meses === 'object') {
    Object.keys(g.meses).forEach(function (mes) {
      if (!/^\d{4}-\d{2}$/.test(mes) || !g.meses[mes] || typeof g.meses[mes] !== 'object') return;
      salida.meses[mes] = {};
      Object.keys(g.meses[mes]).forEach(function (clave) {
        var lista = Array.isArray(g.meses[mes][clave]) ? g.meses[mes][clave] : [];
        salida.meses[mes][clave] = lista.filter(function (p) { return p && Number(p.monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || ''); })
          .map(function (p) { return { id: String(p.id || ''), fecha: p.fecha, monto: Math.round(Number(p.monto) * 100) / 100, de: String(p.de || '').slice(0, 30) }; });
      });
    });
  }
  return salida;
}

/** Deja solo los últimos 3 meses y los correos de los últimos 30 días. */
function podarPagosFijos(registro, hoy) {
  var d = parsearFecha(hoy);
  var limiteMes = d ? fechaISO(new Date(d.getFullYear(), d.getMonth() - 3, 1)).slice(0, 7) : '';
  var limiteDia = sumarDias_(hoy, -30);
  Object.keys(registro.meses).forEach(function (m) { if (m < limiteMes) delete registro.meses[m]; });
  Object.keys(registro.ids).forEach(function (k) { if (!(registro.ids[k] >= limiteDia)) delete registro.ids[k]; });
  return registro;
}

/** Para la app: {mes: {clave: {total, de: ['Entel', ...]}}}. */
function resumenPagosFijos(registro) {
  var salida = {};
  Object.keys((registro && registro.meses) || {}).forEach(function (mes) {
    Object.keys(registro.meses[mes]).forEach(function (clave) {
      var lista = registro.meses[mes][clave];
      if (!lista.length) return;
      var de = [];
      lista.forEach(function (p) { var n = capitalizar_(p.de); if (n && de.indexOf(n) === -1) de.push(n); });
      salida[mes] = salida[mes] || {};
      salida[mes][clave] = { total: sumaPagosFijo(lista), de: de };
    });
  });
  return salida;
}

/** Nota de la celda cuando se marca sola por el correo. */
function textoPagadoPorCorreo(fecha) {
  return 'Pagado el ' + fechaCorta_(fecha) + ' · automático (correo)';
}

// ---------------------------------------------------------------------------
// Meta de ahorro del año (motor 1.24.0): cuánto quieren ahorrar en cada año, la misma para los dos.
// ---------------------------------------------------------------------------

var MAXIMO_META_ANUAL = 10000000;

/** Metas guardadas (texto JSON o null) saneadas: {'2027': 12000}. */
function metasAnualesDesde(texto) {
  var g = null;
  try { g = JSON.parse(texto || 'null'); } catch (err) { g = null; }
  var salida = {};
  if (!g || typeof g !== 'object') return salida;
  Object.keys(g).forEach(function (anio) {
    var v = Number(g[anio]);
    if (/^20\d{2}$/.test(anio) && v > 0 && v <= MAXIMO_META_ANUAL) salida[anio] = Math.round(v * 100) / 100;
  });
  return salida;
}

/** Revisa {anio, monto} y devuelve {anio, monto} (monto 0 = quitar) o {error}. */
function validarMetaAnual(datos) {
  var d = datos || {};
  var anio = String(d.anio || '');
  if (!/^20\d{2}$/.test(anio)) return { error: 'Elige el año de la meta.' };
  var monto = typeof d.monto === 'number' ? d.monto : parsearMonto(String(d.monto === undefined ? '' : d.monto));
  if (monto === null || !isFinite(monto) || monto < 0) return { error: 'Escribe un monto válido.' };
  if (monto > MAXIMO_META_ANUAL) return { error: 'La meta es demasiado alta.' };
  return { anio: anio, monto: Math.round(monto * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Apartados (motor 1.26.0): la plata de algunas líneas (comida, súper, limpieza...) se guarda en una cuenta; lo que
// no se gasta se acumula ahí de un mes a otro. El paréntesis del nombre dice la cuenta: "Alimentación (BCP-DEB-PE)".
// ---------------------------------------------------------------------------

var BANCOS_CODIGO_LINEA = { BCP: 'BCP', IBK: 'Interbank', SIP: 'Sip', RIPLEY: 'Ripley', OH: 'Oh!' };

/** La cuenta de una línea según su paréntesis: {codigo, banco, etiqueta} o null (sin paréntesis o con varias cuentas). */
function cuentaDeLinea(concepto) {
  var m = String(concepto || '').match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  var cod = m[1].replace(/\s+/g, '').toUpperCase();
  if (cod.indexOf('/') !== -1) return null;
  var partes = cod.split('-');
  var banco = BANCOS_CODIGO_LINEA[partes[0]];
  if (!banco) return null;
  return { codigo: cod, banco: banco, etiqueta: (partes.indexOf('DEB') !== -1 ? 'Débito ' : '') + banco };
}

/** Ajustes guardados {claveLinea: {ajuste}} (texto JSON o null), saneados. */
function apartadosAjustesDesde(texto) {
  var g = null;
  try { g = JSON.parse(texto || 'null'); } catch (err) { g = null; }
  var salida = {};
  if (!g || typeof g !== 'object') return salida;
  Object.keys(g).forEach(function (k) {
    var v = Number(g[k] && g[k].ajuste);
    if (isFinite(v) && Math.abs(v) <= 1000000) salida[k] = { ajuste: Math.round(v * 100) / 100 };
  });
  return salida;
}

/**
 * Saldo de cada apartado. meses: [{mes, filas (con conceptos)}] hasta el mes de cobro en curso; consumos: los de
 * leerConsumos (con origen y deTarjeta); config: {fijos, ajustes}; hoy.
 * Entra: lo planeado de la línea en cada mes que se marcó pagado (se pasó a la cuenta). Sale: lo gastado en sus tipos
 * desde el primer mes con plata, del fondo común y sin tarjeta de crédito (regla del usuario). Sin las líneas de
 * recibos (las que se pagan solas con el correo).
 * Devuelve [{clave, linea, cuenta, conceptos, depositado, gastado, ajuste, saldo, desde, meses}].
 */
function apartadosDeLineas(meses, consumos, config, hoy) {
  var cfg = config || {};
  var porClave = {};
  (meses || []).slice().sort(function (a, b) { return a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0; }).forEach(function (m) {
    (m.filas || []).forEach(function (f) {
      if (f.seccion !== 'gastos' || f.esTarjeta) return;
      var cuenta = cuentaDeLinea(f.concepto);
      if (!cuenta || !(f.conceptos && f.conceptos.length) || palabrasDeFijo(f.concepto, cfg.fijos).length) return;
      var k = claveLinea(f.concepto);
      var a = porClave[k] || (porClave[k] = { linea: f.concepto, cuenta: cuenta.etiqueta, conceptos: [], depositado: 0, desde: '', meses: 0 });
      a.linea = f.concepto;
      a.conceptos = f.conceptos.slice();
      if (f.pagado && Number(f.monto) > 0) {
        a.depositado += Math.round(Number(f.monto) * 100);
        a.meses++;
        if (!a.desde) a.desde = cicloDelMes(m.mes).desde;
      }
    });
  });
  return Object.keys(porClave).map(function (k) {
    var a = porClave[k];
    var claves = {};
    a.conceptos.forEach(function (c) { claves[normalizar(c)] = true; });
    var gastado = 0;
    if (a.desde) {
      (consumos || []).forEach(function (c) {
        if (!c || c.deTarjeta || c.origen || !c.fecha || c.fecha < a.desde || c.fecha > hoy) return;
        if (claves[normalizar(c.concepto)]) gastado += Math.round((Number(c.monto) || 0) * 100);
      });
    }
    var ajuste = Math.round((Number(((cfg.ajustes || {})[k] || {}).ajuste) || 0) * 100);
    return { clave: k, linea: a.linea, cuenta: a.cuenta, conceptos: a.conceptos, depositado: a.depositado / 100, gastado: gastado / 100,
      ajuste: ajuste / 100, saldo: (a.depositado - gastado + ajuste) / 100, desde: a.desde, meses: a.meses };
  }).sort(function (x, y) { return x.linea < y.linea ? -1 : x.linea > y.linea ? 1 : 0; });
}

/** Umbrales del presupuesto en que se avisa (porcentaje gastado). */
var UMBRALES_PRESUPUESTO = [80, 100];

/** Gasto real del mes por concepto (nombre normalizado -> monto), según la fecha de cada consumo. */
function gastoRealPorConcepto_(consumos, claveMes) {
  var suma = {};
  (consumos || []).forEach(function (c) {
    if (!c.fecha || c.fecha.slice(0, 7) !== claveMes) return;
    var k = normalizar(c.concepto);
    if (!k) return;
    suma[k] = (suma[k] || 0) + c.monto;
  });
  return suma;
}

/**
 * Líneas de gastos del presupuesto que ya llegaron al 80 % o al 100 % de lo planeado.
 * El gasto real es la suma de los consumos del mes cuyo concepto coincide con la línea.
 * yaAvisadas: claves ya enviadas ('mes|concepto normalizado|umbral'); se saltan.
 * Devuelve [{clave, concepto, planeado, real, porcentaje, umbral}] de mayor porcentaje a menor.
 */
function alertasPresupuesto(presupuesto, consumos, claveMes, yaAvisadas, mapa, conceptosConfig, rango) {
  var salida = [];
  if (!presupuesto || !presupuesto.filas) return salida;
  var enviadas = {};
  (yaAvisadas || []).forEach(function (k) { enviadas[String(k)] = true; });
  presupuesto.filas.forEach(function (f) {
    if (f.seccion !== 'gastos' || !(f.monto > 0)) return;
    var k = normalizar(f.concepto);
    var gastado = gastoRealDeLinea(f, consumos, claveMes, mapa, conceptosConfig, rango);
    var porcentaje = Math.floor(gastado / f.monto * 100);
    var umbral = null;
    UMBRALES_PRESUPUESTO.forEach(function (u) { if (porcentaje >= u) umbral = u; });
    if (umbral === null) return;
    var clave = claveMes + '|' + k + '|' + umbral;
    if (enviadas[clave]) return;
    enviadas[clave] = true;
    salida.push({ clave: clave, concepto: f.concepto, planeado: f.monto, real: gastado, porcentaje: porcentaje, umbral: umbral });
  });
  salida.sort(function (a, b) { return b.porcentaje - a.porcentaje; });
  return salida;
}

/** Al avisar un umbral también quedan "avisados" los umbrales menores de esa línea. */
function clavesCubiertas(alertas) {
  var claves = [];
  (alertas || []).forEach(function (a) {
    var partes = String(a.clave).split('|');
    UMBRALES_PRESUPUESTO.forEach(function (u) {
      if (u <= a.umbral) claves.push(partes[0] + '|' + partes[1] + '|' + u);
    });
  });
  return claves;
}

/** Asunto y cuerpo del correo de presupuesto. null si la lista está vacía. */
function textoAlertasPresupuesto(lista, etiquetaMes) {
  var l = lista || [];
  if (!l.length) return null;
  var asunto = l.length === 1
    ? 'FinFamily: ' + l[0].concepto + ' va en ' + l[0].porcentaje + ' % del presupuesto'
    : 'FinFamily: ' + l.length + ' líneas del presupuesto están por agotarse';
  var lineas = l.map(function (a) {
    var estado = a.umbral >= 100 ? 'ya se pasó' : 'está cerca del límite';
    return '• ' + a.concepto + ': llevan ' + formatoSoles_(a.real) + ' de ' + formatoSoles_(a.planeado) +
      ' (' + a.porcentaje + ' %), ' + estado + '.';
  });
  var cuerpo = ['Hola, este es el aviso de presupuesto de FinFamily' + (etiquetaMes ? ' para ' + etiquetaMes : '') + '.', '']
    .concat(lineas).concat(['', 'Este aviso llega una sola vez por línea cuando pasa el 80 % y otra al llegar al 100 %.']);
  return { asunto: asunto, cuerpo: cuerpo.join('\n') };
}

/** true si la fecha ISO cae lunes. */
function esLunes(iso) {
  var d = parsearFecha(iso);
  return !!d && d.getDay() === 1;
}

/** Suma n días a una fecha ISO. */
function sumarDias_(iso, n) {
  var d = parsearFecha(iso);
  if (!d) return '';
  return fechaISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/**
 * Datos de la semana anterior a hoyISO (lunes a domingo pasados): total, por persona y top 3 conceptos.
 * Devuelve {desde, hasta, total, consumos, porPersona:[{nombre,total}], conceptos:[{concepto,monto}]}.
 */
function resumenSemanal(consumos, hoyISO) {
  var d = parsearFecha(hoyISO);
  if (!d) return null;
  var diaSemana = (d.getDay() + 6) % 7; // 0 = lunes
  var lunesActual = sumarDias_(hoyISO, -diaSemana);
  var desde = sumarDias_(lunesActual, -7);
  var hasta = sumarDias_(lunesActual, -1);
  var total = 0, cantidad = 0;
  var personas = {}, conceptos = {};
  var chicos = { cantidad: 0, total: 0, porDesc: {} };
  (consumos || []).forEach(function (c) {
    if (!c.fecha || c.fecha < desde || c.fecha > hasta) return;
    total += c.monto;
    cantidad++;
    if (c.monto > 0 && c.monto <= TOPE_HORMIGA) {
      chicos.cantidad++; chicos.total += c.monto;
      var d = String(c.descripcion || c.concepto || 'Otro').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
      var kd = normalizar(d);
      if (!chicos.porDesc[kd]) chicos.porDesc[kd] = { descripcion: d, veces: 0, monto: 0 };
      chicos.porDesc[kd].veces++; chicos.porDesc[kd].monto += c.monto;
    }
    var p = c.responsable || 'Sin responsable';
    personas[p] = (personas[p] || 0) + c.monto;
    var k = c.concepto || 'Sin concepto';
    conceptos[k] = (conceptos[k] || 0) + c.monto;
  });
  return {
    desde: desde, hasta: hasta, total: redondear_(total), consumos: cantidad,
    porPersona: ordenadoPorMonto_(personas, 'nombre').map(function (p) { return { nombre: p.nombre, total: p.monto }; }),
    conceptos: ordenadoPorMonto_(conceptos, 'concepto').slice(0, 3),
    hormiga: {
      cantidad: chicos.cantidad, total: redondear_(chicos.total),
      top: Object.keys(chicos.porDesc).map(function (k) { return chicos.porDesc[k]; })
        .sort(function (a, b) { return (b.veces - a.veces) || (b.monto - a.monto); })
        .map(function (x) { return { descripcion: x.descripcion, veces: x.veces, monto: redondear_(x.monto) }; })[0] || null
    }
  };
}

// Gastos chicos (motor 1.20.0): hasta este monto cuentan como "hormiga" en el resumen semanal.
var TOPE_HORMIGA = 15;

/**
 * Correo del resumen semanal.
 * semana: lo que devuelve resumenSemanal.
 * presupuesto (opcional): {etiquetaMes, planeado, gastado} del mes en curso.
 * vencimientos (opcional): [{nombre, vence, monto}] próximos a pagar.
 */
function textoResumenSemanal(semana, presupuesto, vencimientos) {
  var s = semana || { desde: '', hasta: '', total: 0, consumos: 0, porPersona: [], conceptos: [] };
  var cuerpo = ['Hola, este es el resumen semanal de FinFamily (del ' + fechaCorta_(s.desde) + ' al ' + fechaCorta_(s.hasta) + ').', ''];
  if (!s.consumos) {
    cuerpo.push('La semana pasada no registraron gastos.');
  } else {
    cuerpo.push('Gastaron en total ' + formatoSoles_(s.total) + ' en ' + s.consumos + ' gasto' + (s.consumos === 1 ? '' : 's') + '.');
    if (s.porPersona.length) {
      cuerpo.push('', 'Por persona:');
      s.porPersona.forEach(function (p) { cuerpo.push('• ' + p.nombre + ': ' + formatoSoles_(p.total)); });
    }
    if (s.conceptos.length) {
      cuerpo.push('', 'En qué se fue más:');
      s.conceptos.forEach(function (c) { cuerpo.push('• ' + c.concepto + ': ' + formatoSoles_(c.monto)); });
    }
  }
  var hg = s.hormiga;
  if (hg && hg.cantidad >= 3) {
    cuerpo.push('', 'Gastos chicos (hasta ' + formatoSoles_(TOPE_HORMIGA) + '): ' + hg.cantidad + ' por ' + formatoSoles_(hg.total) +
      (hg.top && hg.top.veces > 1 ? '. El que más se repite: ' + hg.top.descripcion + ' (' + hg.top.veces + ' veces, ' + formatoSoles_(hg.top.monto) + ')' : '') + '.');
  }
  if (presupuesto && presupuesto.planeado > 0) {
    var queda = redondear_(presupuesto.planeado - presupuesto.gastado);
    cuerpo.push('', 'Presupuesto de ' + (presupuesto.etiquetaMes || 'este mes') + ': llevan ' + formatoSoles_(presupuesto.gastado) +
      ' de ' + formatoSoles_(presupuesto.planeado) + '. ' +
      (queda >= 0 ? 'Les quedan ' + formatoSoles_(queda) + '.' : 'Se pasaron en ' + formatoSoles_(-queda) + '.'));
  }
  var v = vencimientos || [];
  if (v.length) {
    cuerpo.push('', 'Próximos pagos de tarjeta:');
    v.forEach(function (t) { cuerpo.push('• ' + t.nombre + ': ' + formatoSoles_(t.monto) + ' vence el ' + fechaCorta_(t.vence)); });
  }
  cuerpo.push('', 'Buen inicio de semana.');
  return { asunto: 'FinFamily: resumen de la semana (' + formatoSoles_(s.total) + ')', cuerpo: cuerpo.join('\n') };
}

/** Tarjetas con deuda y fecha de vencimiento, ordenadas por fecha: [{tarjeta, nombre, vence, monto}]. */
function proximosVencimientos(resumen) {
  return (resumen || []).filter(function (t) { return t.id !== 'HORMIGA' && t.pendiente > 0 && t.proximoVence; })
    .map(function (t) {
      var monto = t.pendiente;
      (t.estados || []).forEach(function (g) { if (g.vence === t.proximoVence) monto = g.pendiente; });
      return { tarjeta: t.id, nombre: t.nombre, vence: t.proximoVence, monto: redondear_(monto) };
    })
    .sort(function (a, b) { return a.vence < b.vence ? -1 : (a.vence > b.vence ? 1 : 0); });
}

// ---------------------------------------------------------------------------
// Calendario (motor 1.3): qué eventos debe haber y qué cambiar
// ---------------------------------------------------------------------------

/** Minutos antes del inicio del día del vencimiento: 3 días antes a las 9:00 y 1 día antes a las 9:00. */
var RECORDATORIOS_CALENDARIO = [3 * 24 * 60 - 9 * 60, 24 * 60 - 9 * 60];

/** Un evento por tarjeta con deuda: [{clave:'SIP|2026-11-09', tarjeta, vence, monto, titulo, descripcion}]. */
function eventosDeVencimiento(resumen) {
  return proximosVencimientos(resumen).map(function (v) {
    return {
      clave: v.tarjeta + '|' + v.vence, tarjeta: v.tarjeta, vence: v.vence, monto: v.monto,
      titulo: 'Vence ' + v.nombre + ': ' + formatoSoles_(v.monto),
      descripcion: 'Pago de ' + v.nombre + ' por ' + formatoSoles_(v.monto) + '. Cuando paguen, márquenlo en FinFamily.'
    };
  });
}

/**
 * Compara los eventos deseados con los guardados ({clave: idEvento}) y dice qué hacer.
 * Devuelve {crear:[evento], actualizar:[{evento, idEvento}], borrar:[{clave, idEvento}]}.
 */
function planCalendario(deseados, guardados) {
  var g = guardados || {};
  var crear = [], actualizar = [], borrar = [];
  var vistas = {};
  (deseados || []).forEach(function (e) {
    vistas[e.clave] = true;
    if (g[e.clave]) actualizar.push({ evento: e, idEvento: g[e.clave] });
    else crear.push(e);
  });
  Object.keys(g).forEach(function (clave) { if (!vistas[clave]) borrar.push({ clave: clave, idEvento: g[clave] }); });
  return { crear: crear, actualizar: actualizar, borrar: borrar };
}

// ---------------------------------------------------------------------------
// Íconos de los tipos de gasto (motor 1.5.1): la app dibuja, aquí solo se guarda el nombre
// ---------------------------------------------------------------------------

/** Nombre de ícono válido: 1 a 30 caracteres a-z, 0-9, guion o guion bajo (en minúsculas). */
function iconoValido(icono) {
  return typeof icono === 'string' && /^[a-z0-9_-]{1,30}$/.test(icono);
}

/** Mapa guardado {conceptoNormalizado: icono} (texto JSON o null), saneado. */
function iconosDesde(crudo) {
  var g = null;
  if (crudo) { try { g = JSON.parse(crudo); } catch (err) { g = null; } }
  var salida = {};
  if (!g || typeof g !== 'object' || Array.isArray(g)) return salida;
  Object.keys(g).forEach(function (k) {
    var clave = normalizar(k);
    var icono = String(g[k] || '').trim().toLowerCase();
    if (clave && iconoValido(icono)) salida[clave] = icono;
  });
  return salida;
}

/** El mapa con los nombres canónicos de Configuración como clave ({"Supermercado":"carrito"}); solo conceptos que existen. */
function iconosConNombres(mapa, conceptosConfig) {
  var salida = {};
  var m = mapa || {};
  (conceptosConfig || []).forEach(function (c) {
    var icono = m[normalizar(c)];
    if (icono) salida[c] = icono;
  });
  return salida;
}

// ---------------------------------------------------------------------------
// Bolsas (motor 1.7): fondo común, sobrante de cada persona y ahorros
// ---------------------------------------------------------------------------

function aCentavos_(n) {
  return Math.round((Number(n) || 0) * 100);
}

/** Saldo ("SALDO / SUPERÁVIT FINAL") de cada mes de la hoja del presupuesto: [{clave, saldoHoja}] en orden. */
function saldosPorMes(display2D, valores2D) {
  var salida = [];
  if (!display2D || !display2D.length) return salida;
  var idxEnc = buscarFilaEncabezado(display2D, 'Concepto / Categoría');
  if (idxEnc === -1) idxEnc = buscarFilaEncabezado(display2D, 'Concepto');
  if (idxEnc === -1) return salida;
  var vistos = {};
  (display2D[idxEnc] || []).forEach(function (celda) {
    var clave = etiquetaAClave(celda);
    if (!clave || vistos[clave]) return;
    vistos[clave] = true;
    var p = leerPresupuesto(display2D, valores2D, clave);
    if (p) salida.push({ clave: clave, saldoHoja: redondear_(p.totales.saldo) });
  });
  salida.sort(function (a, b) { return a.clave < b.clave ? -1 : (a.clave > b.clave ? 1 : 0); });
  return salida;
}

/**
 * Lo retirado de cada ahorro: suma de los gastos con origen 'A:<meta>' cuyo mes es <= claveMes.
 * Devuelve {metaNormalizada: {retirado, retiradoMes}} (en soles).
 */
function retirosPorMeta(consumos, claveMes) {
  var cent = {};
  (consumos || []).forEach(function (c) {
    var o = partesOrigen(c.origen);
    if (o.tipo !== 'A') return;
    var m = mesDeGasto(c);
    if (!m || m > claveMes) return;
    var k = normalizar(o.nombre);
    if (!cent[k]) cent[k] = { total: 0, mes: 0 };
    cent[k].total += aCentavos_(c.monto);
    if (m === claveMes) cent[k].mes += aCentavos_(c.monto);
  });
  var salida = {};
  Object.keys(cent).forEach(function (k) { salida[k] = { retirado: cent[k].total / 100, retiradoMes: cent[k].mes / 100 }; });
  return salida;
}

/**
 * Calcula las bolsas para un mes.
 *   saldosMeses: [{clave, saldoHoja}] de todos los meses de la hoja (saldosPorMes).
 *   consumos: todos los consumos (leerConsumos) con tarjeta, fecha, pago, monto y origen.
 *   usuarios: nombres de las personas (USUARIOS). N = cuántas son (mínimo 1).
 *   metasAhorro: [{concepto, acumulado}] hasta `mes` inclusive (ahorrosAcumulados).
 *   mes: mes pedido; mesActual: mes de hoy (los meses futuros no se acumulan).
 * Reglas:
 *   fuera(m)  = consumos de hojas TC con origen distinto del común y Fecha de pago en m
 *               (la hoja los restó del saldo y no debía). Hormiga y TC sin fecha de pago no entran.
 *   saldo(m)  = saldoHoja(m) + fuera(m);  porPersona(m) = saldo(m) / N.
 *   persona:  acumulado = suma de porPersona de los meses ANTERIORES a `mes` (y no futuros);
 *             gastado = sus gastos con origen P:<ella> de mes <= `mes`; disponible = acumulado - gastado.
 *             Una TARJETA pagada con el sobrante de una persona sale del sobrante del mes en que se paga
 *             (ese sobrante recién llega al cobrar ese mes): cuenta desde el mes siguiente al de pago.
 *             Mientras tanto va en `comprometido` (motor 1.9.4).
 *   proximos: el sobrante que llegará en los cobros de `mes` y del mes siguiente (si están en la hoja), por
 *             persona: [{mes, porPersona, personas: [{nombre, apartado, queda}]}]; apartado = tarjetas suyas
 *             que se pagan ese mes; queda = porPersona - apartado (motor 1.9.5).
 *   ahorro:   disponible = acumulado - retirado (gastos con origen A:<meta> de mes <= `mes`).
 *   otros     = gastos con un origen que ya no existe (persona o ahorro quitados o renombrados).
 *   disponible (total) = comun.saldo + suma de lo disponible de las personas (sin ahorros).
 * Todo se calcula en centavos. Devuelve null si `mes` no está en saldosMeses.
 */
/** '2026-11' -> '2026-12'; '2026-12' -> '2027-01'. */
function mesSiguiente_(clave) {
  var p = String(clave).split('-');
  var a = Number(p[0]), m = Number(p[1]) + 1;
  if (m > 12) { m = 1; a += 1; }
  return a + '-' + (m < 10 ? '0' : '') + m;
}

function calcularBolsas(saldosMeses, consumos, usuarios, metasAhorro, mes, mesActual) {
  var lista = (saldosMeses || []).slice().sort(function (a, b) { return a.clave < b.clave ? -1 : (a.clave > b.clave ? 1 : 0); });
  if (!lista.some(function (m) { return m.clave === mes; })) return null;
  var nombres = (usuarios || []).filter(function (n) { return !!normalizar(n); });
  var N = Math.max(1, nombres.length);
  var hoyMes = mesActual || mes;

  var personas = {}, metas = {};
  nombres.forEach(function (n) { personas[normalizar(n)] = { total: 0, mes: 0, comprometido: 0 }; });
  (metasAhorro || []).forEach(function (m) { metas[normalizar(m.concepto)] = { total: 0, mes: 0 }; });
  var fuera = {};
  var otros = 0;
  var apartadoPor = {}; // persona normalizada -> {mesDePago: centavos}

  (consumos || []).forEach(function (c) {
    var o = partesOrigen(c.origen);
    if (!o.tipo) return; // fondo común
    var cent = aCentavos_(c.monto);
    if (c.tarjeta !== 'HORMIGA' && c.pago) {
      var mesPago = String(c.pago).slice(0, 7);
      fuera[mesPago] = (fuera[mesPago] || 0) + cent;
    }
    var m = mesDeGasto(c);
    if (!m) return;
    var k = normalizar(o.nombre);
    var bolsa = o.tipo === 'P' ? personas[k] : (o.tipo === 'A' ? metas[k] : null);
    if (!bolsa) { if (m <= mes) otros += cent; return; }
    // Tarjeta con el sobrante de una persona: se paga con lo que le sobre el mes del pago, que llega al cobrar.
    if (o.tipo === 'P' && c.tarjeta !== 'HORMIGA') {
      if (!apartadoPor[k]) apartadoPor[k] = {};
      apartadoPor[k][m] = (apartadoPor[k][m] || 0) + cent;
      m = mesSiguiente_(m);
    }
    if (m > mes) {
      if (o.tipo === 'P' && String(c.fecha || '').slice(0, 7) <= mes) bolsa.comprometido += cent;
      return;
    }
    bolsa.total += cent;
    if (m === mes) bolsa.mes += cent;
  });

  var meses = [];
  var acumuladoPersona = 0;
  var comun = null;
  lista.forEach(function (m) {
    if (m.clave > mes) return;
    var saldoHoja = aCentavos_(m.saldoHoja);
    var f = fuera[m.clave] || 0;
    var saldo = saldoHoja + f;
    var porPersona = Math.round(saldo / N);
    meses.push({ clave: m.clave, saldoHoja: saldoHoja / 100, fuera: f / 100, saldo: saldo / 100, porPersona: porPersona / 100 });
    if (m.clave < mes && m.clave <= hoyMes) acumuladoPersona += porPersona;
    if (m.clave === mes) comun = { saldoHoja: saldoHoja / 100, fuera: f / 100, saldo: saldo / 100, centavos: saldo };
  });

  var disponible = comun.centavos;
  delete comun.centavos;
  var salidaPersonas = nombres.map(function (n) {
    var b = personas[normalizar(n)];
    disponible += acumuladoPersona - b.total;
    return { nombre: n, acumulado: acumuladoPersona / 100, gastado: b.total / 100, gastadoMes: b.mes / 100, disponible: (acumuladoPersona - b.total) / 100,
      comprometido: b.comprometido / 100 };
  });
  var salidaAhorros = (metasAhorro || []).map(function (m) {
    var b = metas[normalizar(m.concepto)];
    var acumulado = aCentavos_(m.acumulado);
    return { meta: m.concepto, acumulado: acumulado / 100, retirado: b.total / 100, retiradoMes: b.mes / 100, disponible: (acumulado - b.total) / 100 };
  });
  // Lo que llegará en los próximos cobros (este mes y el siguiente) y lo que ya está apartado para tarjetas.
  var porPersonaDe = {};
  lista.forEach(function (m) { porPersonaDe[m.clave] = Math.round((aCentavos_(m.saldoHoja) + (fuera[m.clave] || 0)) / N); });
  var proximos = [mes, mesSiguiente_(mes)].filter(function (m) { return porPersonaDe[m] !== undefined; }).map(function (m) {
    return {
      mes: m, porPersona: porPersonaDe[m] / 100,
      personas: nombres.map(function (n) {
        var ap = (apartadoPor[normalizar(n)] || {})[m] || 0;
        return { nombre: n, apartado: ap / 100, queda: (porPersonaDe[m] - ap) / 100 };
      })
    };
  });
  return {
    mes: mes, comun: comun, personas: salidaPersonas, ahorros: salidaAhorros,
    otros: otros / 100, disponible: disponible / 100, meses: meses, proximos: proximos
  };
}

/**
 * ¿Le alcanza el sobrante a la persona para un gasto que ya se anotó con origen P:<ella>? (motor 1.9.5)
 *   bolsas: calcularBolsas del mes de hoy (ya incluye el gasto).
 *   gasto: {monto, tarjeta (true si no es Gastos Hormiga), pago 'YYYY-MM-DD' o '', fecha}.
 * Yape/efectivo sale de lo que tiene hoy (disponible); la tarjeta, del sobrante del mes en que se paga.
 * Devuelve {nombre, de: 'hoy' | 'YYYY-MM', queda, alcanza, falta} o null si no se puede saber.
 */
function alcanceSobrante(bolsas, nombre, gasto) {
  if (!bolsas || !gasto) return null;
  var k = normalizar(nombre);
  var persona = (bolsas.personas || []).filter(function (p) { return normalizar(p.nombre) === k; })[0];
  if (!persona) return null;
  var de = 'hoy', queda = persona.disponible;
  if (gasto.tarjeta) {
    var mesPago = String(gasto.pago || gasto.fecha || '').slice(0, 7);
    if (mesPago >= bolsas.mes) {
      var prox = (bolsas.proximos || []).filter(function (p) { return p.mes === mesPago; })[0];
      var suyo = prox ? prox.personas.filter(function (p) { return normalizar(p.nombre) === k; })[0] : null;
      if (!suyo) return null;
      de = mesPago;
      queda = suyo.queda;
    }
  }
  return { nombre: persona.nombre, de: de, queda: queda, alcanza: queda >= 0, falta: queda < 0 ? Math.round(-queda * 100) / 100 : 0 };
}

/** Correo a la persona cuando lo que anotó con su sobrante no le alcanza. aviso: alcanceSobrante + {monto, descripcion}. */
function textoSobranteNoAlcanza(aviso) {
  var a = aviso || {};
  var quien = primerNombre_(a.nombre) || 'Hola';
  var deDonde = a.de && a.de !== 'hoy'
    ? 'lo que te sobrará de ' + (MESES_ES[Number(String(a.de).slice(5, 7)) - 1] || a.de).toLowerCase() + ' (con eso se paga la tarjeta)'
    : 'lo que tienes hoy de tu sobrante';
  var cuerpo = [
    quien + ', anotaste ' + (a.descripcion || 'un gasto') + ' por ' + formatoSoles_(a.monto) + ' para pagarlo con tu sobrante.',
    '',
    'No te alcanza: sale de ' + deDonde + ' y te faltan ' + formatoSoles_(a.falta) + '.',
    '',
    'Si no lo vas a pagar tú, cámbialo en la app: abre el gasto y en "¿De dónde sale?" elige otra opción.'
  ];
  return { asunto: 'FinFamily: tu sobrante no alcanza (faltan ' + formatoSoles_(a.falta) + ')', cuerpo: cuerpo.join('\n') };
}

if (typeof module !== 'undefined') {
  module.exports = {
    partesOrigen: partesOrigen,
    mesDeGasto: mesDeGasto,
    saldosPorMes: saldosPorMes,
    retirosPorMeta: retirosPorMeta,
    calcularBolsas: calcularBolsas,
    alcanceSobrante: alcanceSobrante,
    textoSobranteNoAlcanza: textoSobranteNoAlcanza,
    partesIdForm: partesIdForm,
    armarIdForm: armarIdForm,
    tarjetaDeFila: tarjetaDeFila,
    esPrestada: esPrestada,
    iconoValido: iconoValido,
    iconosDesde: iconosDesde,
    iconosConNombres: iconosConNombres,
    BANCOS_CORREO: BANCOS_CORREO,
    BILLETERAS_CORREO: BILLETERAS_CORREO,
    billeteraDeCorreo: billeteraDeCorreo,
    primerNombreDeSaludo: primerNombreDeSaludo,
    extraerMovimientoBilletera: extraerMovimientoBilletera,
    PALABRAS_CONSUMO: PALABRAS_CONSUMO,
    TARJETA_POR_BANCO: TARJETA_POR_BANCO,
    COLUMNAS_POR_CONFIRMAR: COLUMNAS_POR_CONFIRMAR,
    AJUSTES_AVISOS_DEFECTO: AJUSTES_AVISOS_DEFECTO,
    RECORDATORIOS_CALENDARIO: RECORDATORIOS_CALENDARIO,
    bancoDeCorreo: bancoDeCorreo,
    extraerConsumoDeCorreo: extraerConsumoDeCorreo,
    tarjetaDeConsumo: tarjetaDeConsumo,
    leerPendientes: leerPendientes,
    pendientesActivos: pendientesActivos,
    medioSugerido: medioSugerido,
    comercioLegible: comercioLegible,
    ajustesAvisosDesde: ajustesAvisosDesde,
    validarAjustesAvisos: validarAjustesAvisos,
    datosTarjetasDesde: datosTarjetasDesde,
    validarDatosTarjeta: validarDatosTarjeta,
    textoGastoGrande: textoGastoGrande,
    cuentaDeLinea: cuentaDeLinea,
    apartadosAjustesDesde: apartadosAjustesDesde,
    apartadosDeLineas: apartadosDeLineas,
    pagosUnicos: pagosUnicos,
    cobrosAprendidos: cobrosAprendidos,
    subidaDePrecio: subidaDePrecio,
    textoSubidaPrecio: textoSubidaPrecio,
    textoCobrosProximos: textoCobrosProximos,
    metasAnualesDesde: metasAnualesDesde,
    validarMetaAnual: validarMetaAnual,
    palabrasValidas: palabrasValidas,
    palabrasDeFijo: palabrasDeFijo,
    pagoDeServicioDeCorreo: pagoDeServicioDeCorreo,
    lineaDePago: lineaDePago,
    sumaPagosFijo: sumaPagosFijo,
    pagosFijosDesde: pagosFijosDesde,
    podarPagosFijos: podarPagosFijos,
    resumenPagosFijos: resumenPagosFijos,
    textoPagadoPorCorreo: textoPagadoPorCorreo,
    recordatoriosAnotar: recordatoriosAnotar,
    textoRecordatorioAnotar: textoRecordatorioAnotar,
    alertasPresupuesto: alertasPresupuesto,
    clavesCubiertas: clavesCubiertas,
    textoAlertasPresupuesto: textoAlertasPresupuesto,
    esLunes: esLunes,
    SECCIONES_PRESUPUESTO: SECCIONES_PRESUPUESTO,
    ASIGNACION_INICIAL: ASIGNACION_INICIAL,
    nombreLineaParaSeccion: nombreLineaParaSeccion,
    posicionNuevaLinea: posicionNuevaLinea,
    claveLinea: claveLinea,
    mapaLineasDesde: mapaLineasDesde,
    conceptosDeLinea: conceptosDeLinea,
    asignarConceptosEnMapa: asignarConceptosEnMapa,
    renombrarLineaEnMapa: renombrarLineaEnMapa,
    quitarLineaDeMapa: quitarLineaDeMapa,
    gastoRealDeLinea: gastoRealDeLinea,
    cicloDelMes: cicloDelMes,
    mesDelCiclo: mesDelCiclo,
    resumenSemanal: resumenSemanal,
    textoResumenSemanal: textoResumenSemanal,
    proximosVencimientos: proximosVencimientos,
    eventosDeVencimiento: eventosDeVencimiento,
    planCalendario: planCalendario,
    MONTO_MAXIMO_PRESUPUESTO: MONTO_MAXIMO_PRESUPUESTO,
    DIAS_DE_AVISO: DIAS_DE_AVISO,
    validarMontoPresupuesto: validarMontoPresupuesto,
    ahorrosAcumulados: ahorrosAcumulados,
    avisosDelDia: avisosDelDia,
    textoAvisos: textoAvisos,
    CICLOS: CICLOS,
    MESES_ES: MESES_ES,
    ABREV_MES: ABREV_MES,
    MEDIOS: MEDIOS,
    TARJETAS: TARJETAS,
    COLORES_TARJETA: COLORES_TARJETA,
    MEDIOS_DIRECTOS: MEDIOS_DIRECTOS,
    CATALOGO_DEFECTO: CATALOGO_DEFECTO,
    MEDIO_POR_BANCO: MEDIO_POR_BANCO,
    catalogoDesde: catalogoDesde,
    tarjetasActivas: tarjetasActivas,
    etiquetaTarjeta: etiquetaTarjeta,
    buscarTarjetaCatalogo: buscarTarjetaCatalogo,
    mediosDesde: mediosDesde,
    etiquetaDebito: etiquetaDebito,
    debitosDesde: debitosDesde,
    validarDebito: validarDebito,
    idDebito: idDebito,
    debitoDe: debitoDe,
    ciclosDesde: ciclosDesde,
    hojasDesde: hojasDesde,
    validarTarjetaCatalogo: validarTarjetaCatalogo,
    generarIdTarjeta: generarIdTarjeta,
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
    notaPagado: notaPagado,
    quitarNotaPagado: quitarNotaPagado,
    ponerNotaPagado: ponerNotaPagado,
    gastoPorPersona: gastoPorPersona,
    firmaGasto: firmaGasto,
    construirFila: construirFila
  };
}
