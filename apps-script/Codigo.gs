/**
 * FinFamily · Codigo.gs
 *
 * Aplicación web de Apps Script (se ejecuta como el dueño del script).
 * Recibe POST con cuerpo JSON {accion, token, datos} enviado como
 * 'text/plain;charset=utf-8' y responde JSON:
 *   {ok:true, datos:{...}}  o  {ok:false, codigo, error}
 *
 * Solo lee y escribe en las hojas que ya existen. No crea hojas ni cambia fórmulas.
 * Un gasto fijo "pagado" se guarda como nota en su celda del mes en PRESUPUESTO FAMILIAR.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   SHEET_ID   ID del Google Sheets (si falta, se usa SHEET_ID_DEFECTO).
 *   CLIENT_ID  ID de cliente OAuth web de Google (el mismo de la PWA).
 *   USUARIOS   JSON {"correo@gmail.com":{"nombre":"Pedro Nicolás","clave":"P"}, ...}
 *   FINFAMILY_AVISOS  (la escribe el propio script) avisos de vencimiento ya enviados hoy.
 */

var VERSION = '1.2.0';
var SHEET_ID_DEFECTO = '1KEHSUJXu9lJ1HjnYgF-mKBpOQq0V2qPOlEXSnUgRyp4';
var ZONA_HORARIA = 'America/Lima';
var DIAS_AVISO = 3;
var SEGUNDOS_CACHE_TOKEN = 300;
var PROPIEDAD_AVISOS = 'FINFAMILY_AVISOS';
var FUNCION_AVISOS = 'avisosDeVencimiento';
var HORA_AVISOS = 8; // hora (de Lima) a la que corre el aviso diario

/** Acciones que entiende este motor (la acción 'version' las devuelve). */
var ACCIONES = ['inicio', 'tarjetas', 'presupuesto', 'config', 'registrar', 'marcarPagado', 'marcarFijo',
  'editarGasto', 'borrarGasto', 'personas', 'desmarcarPagado', 'editarPresupuesto', 'ahorros', 'version'];

var HOJAS_TC = ['TC IBK', 'TC BCP', 'TC Ripley', 'TC SIP'];
var HOJA_HORMIGA = 'Gastos Hormiga';
var HOJA_CONFIG = 'Configuración';
var HOJA_PRESUPUESTO = 'PRESUPUESTO FAMILIAR';

var MENSAJES = {
  no_autorizado: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.',
  datos_invalidos: 'Los datos enviados no son válidos.',
  hoja_no_encontrada: 'No se encontró una hoja del Sheets.',
  error_interno: 'Ocurrió un problema en el servidor. Intenta de nuevo en un momento.'
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

// Este archivo vive dentro del Apps Script del propio Sheets ("Registro de Gastos B&P").
// Ese proyecto ya tiene su doGet (el dashboard, solo para el dueño), así que aquí
// solo se define doPost, que es lo que usa la app del celular.

/**
 * Ejecutar una vez desde el editor (botón Ejecutar) para que Google pida el permiso
 * "Conectarse a un servicio externo", que se usa para verificar el inicio de sesión.
 * No lee ni escribe el Sheets.
 */
function finfamilyAutorizar() {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=prueba', { muteHttpExceptions: true });
  console.log('FinFamily: verificación de sesiones disponible (respuesta ' + r.getResponseCode() + ').');
}

function doPost(e) {
  try {
    var cuerpo = leerCuerpo_(e);
    var usuario = verificarToken_(cuerpo.token);
    var datos = (cuerpo.datos && typeof cuerpo.datos === 'object') ? cuerpo.datos : {};
    var resultado;
    switch (cuerpo.accion) {
      case 'inicio': resultado = accionInicio_(usuario, datos); break;
      case 'tarjetas': resultado = accionTarjetas_(usuario, datos); break;
      case 'presupuesto': resultado = accionPresupuesto_(usuario, datos); break;
      case 'config': resultado = accionConfig_(usuario, datos); break;
      case 'registrar': resultado = accionRegistrar_(usuario, datos); break;
      case 'marcarPagado': resultado = accionMarcarPagado_(usuario, datos); break;
      case 'marcarFijo': resultado = accionMarcarFijo_(usuario, datos); break;
      case 'editarGasto': resultado = accionEditarGasto_(usuario, datos); break;
      case 'borrarGasto': resultado = accionBorrarGasto_(usuario, datos); break;
      case 'personas': resultado = accionPersonas_(usuario, datos); break;
      case 'desmarcarPagado': resultado = accionDesmarcarPagado_(usuario, datos); break;
      case 'editarPresupuesto': resultado = accionEditarPresupuesto_(usuario, datos); break;
      case 'ahorros': resultado = accionAhorros_(usuario, datos); break;
      case 'version': resultado = accionVersion_(usuario, datos); break;
      default: throw errorApp_('datos_invalidos', 'Acción no reconocida.');
    }
    return responderJSON_({ ok: true, datos: resultado });
  } catch (err) {
    if (err && err.codigoApp) {
      return responderJSON_({ ok: false, codigo: err.codigoApp, error: err.message || MENSAJES[err.codigoApp] });
    }
    console.error('FinFamily error_interno: ' + (err && err.stack ? err.stack : err));
    return responderJSON_({ ok: false, codigo: 'error_interno', error: MENSAJES.error_interno });
  }
}

function leerCuerpo_(e) {
  var texto = e && e.postData && e.postData.contents;
  if (!texto) throw errorApp_('datos_invalidos', 'La petición llegó vacía.');
  try {
    var cuerpo = JSON.parse(texto);
    if (!cuerpo || typeof cuerpo !== 'object') throw new Error('no es objeto');
    return cuerpo;
  } catch (err) {
    throw errorApp_('datos_invalidos', 'La petición no tiene un formato válido.');
  }
}

function responderJSON_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorApp_(codigo, mensaje) {
  var e = new Error(mensaje || MENSAJES[codigo] || MENSAJES.error_interno);
  e.codigoApp = codigo;
  return e;
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

function propiedad_(nombre) {
  return PropertiesService.getScriptProperties().getProperty(nombre);
}

/** Lista de usuarios permitidos con correos en minúsculas. */
function leerUsuarios_() {
  var crudo = propiedad_('USUARIOS');
  if (!crudo) throw errorApp_('error_interno', 'El servicio no está configurado todavía.');
  var obj;
  try { obj = JSON.parse(crudo); } catch (err) {
    throw errorApp_('error_interno', 'El servicio no está configurado correctamente.');
  }
  var salida = {};
  Object.keys(obj || {}).forEach(function (correo) {
    var u = obj[correo] || {};
    salida[String(correo).trim().toLowerCase()] = { nombre: String(u.nombre || ''), clave: String(u.clave || '') };
  });
  return salida;
}

function hashHex_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/**
 * Verifica el ID token de Google Identity Services y devuelve {email, nombre, clave}.
 * La verificación se guarda 5 minutos en caché (clave = SHA-256 del token).
 * El usuario se vuelve a buscar en USUARIOS en cada petición, así quitar a alguien
 * de la lista surte efecto de inmediato.
 */
function verificarToken_(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) throw errorApp_('no_autorizado');
  var clientId = propiedad_('CLIENT_ID');
  if (!clientId) throw errorApp_('error_interno', 'El servicio no está configurado todavía.');
  var usuarios = leerUsuarios_();

  var cache = CacheService.getScriptCache();
  var claveCache = 'tok_' + hashHex_(token);
  var email = null;
  var enCache = cache.get(claveCache);
  if (enCache) {
    try {
      var guardado = JSON.parse(enCache);
      if (guardado && guardado.email && guardado.exp * 1000 > Date.now()) email = guardado.email;
    } catch (err) { email = null; }
  }

  if (!email) {
    var resp;
    try {
      resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
        muteHttpExceptions: true
      });
    } catch (err) {
      console.error('FinFamily tokeninfo falló: ' + err);
      throw errorApp_('error_interno', 'No se pudo verificar tu sesión. Intenta de nuevo.');
    }
    if (resp.getResponseCode() !== 200) throw errorApp_('no_autorizado');
    var info;
    try { info = JSON.parse(resp.getContentText()); } catch (err) { throw errorApp_('no_autorizado'); }
    var exp = Number(info.exp);
    var ahora = Date.now();
    var emisorValido = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    if (info.aud !== clientId || String(info.email_verified) !== 'true' || !emisorValido ||
        !(exp * 1000 > ahora) || !info.email) {
      throw errorApp_('no_autorizado');
    }
    email = String(info.email).trim().toLowerCase();
    var ttl = Math.min(SEGUNDOS_CACHE_TOKEN, Math.floor(exp - ahora / 1000));
    if (ttl > 0) cache.put(claveCache, JSON.stringify({ email: email, exp: exp }), ttl);
  }

  var u = usuarios[email];
  if (!u || !u.nombre) throw errorApp_('no_autorizado', 'Tu cuenta no tiene acceso a FinFamily.');
  return { email: email, nombre: u.nombre, clave: u.clave };
}

// ---------------------------------------------------------------------------
// Acceso al Sheets
// ---------------------------------------------------------------------------

var libro_ = null;

function abrirLibro_() {
  if (!libro_) libro_ = SpreadsheetApp.openById(propiedad_('SHEET_ID') || SHEET_ID_DEFECTO);
  return libro_;
}

/** Busca una hoja por nombre exacto o, si no, por nombre normalizado (sin tildes). */
function obtenerHoja_(nombre) {
  var libro = abrirLibro_();
  var hoja = libro.getSheetByName(nombre);
  if (hoja) return hoja;
  var buscado = normalizar(nombre);
  var hojas = libro.getSheets();
  for (var i = 0; i < hojas.length; i++) {
    if (normalizar(hojas[i].getName()) === buscado) return hojas[i];
  }
  throw errorApp_('hoja_no_encontrada', 'No se encontró la hoja "' + nombre + '" en el Sheets.');
}

/** Nombre canónico (del contrato) de una hoja de consumos, o null si no está permitida. */
function hojaConsumosCanonica_(nombre) {
  var n = normalizar(nombre);
  var todas = HOJAS_TC.concat([HOJA_HORMIGA]);
  for (var i = 0; i < todas.length; i++) {
    if (normalizar(todas[i]) === n) return todas[i];
  }
  return null;
}

function leerTodosLosConsumos_() {
  var todos = [];
  HOJAS_TC.concat([HOJA_HORMIGA]).forEach(function (nombre) {
    var valores = obtenerHoja_(nombre).getDataRange().getValues();
    todos = todos.concat(leerConsumos(valores, nombre));
  });
  return todos;
}

function leerPresupuestoDelMes_(claveMes) {
  var rango = obtenerHoja_(HOJA_PRESUPUESTO).getDataRange();
  return leerPresupuesto(rango.getDisplayValues(), rango.getValues(), claveMes, rango.getNotes());
}

/** Fila y columna (0-based) de la primera celda de encabezado que coincide, en las primeras 8 filas. */
function buscarCeldaEncabezado_(valores, clave) {
  var c = normalizar(clave);
  var limite = Math.min(valores.length, 8);
  for (var i = 0; i < limite; i++) {
    for (var j = 0; j < valores[i].length; j++) {
      var n = normalizar(valores[i][j]);
      if (n && (n === c || n.indexOf(c) === 0)) return { fila: i, col: j };
    }
  }
  return null;
}

function listaDebajo_(valores, celda) {
  var salida = [];
  var vistos = {};
  if (!celda) return salida;
  for (var i = celda.fila + 1; i < valores.length; i++) {
    var v = valores[i][celda.col];
    var t = (v === null || v === undefined) ? '' : String(v).trim();
    if (t && !vistos[normalizar(t)]) { vistos[normalizar(t)] = true; salida.push(t); }
  }
  return salida;
}

function leerConfiguracion_() {
  var valores = obtenerHoja_(HOJA_CONFIG).getDataRange().getValues();
  var conceptos = listaDebajo_(valores, buscarCeldaEncabezado_(valores, 'Conceptos de Gasto'));
  var responsables = listaDebajo_(valores, buscarCeldaEncabezado_(valores, 'Responsable'));
  return { conceptos: conceptos, responsables: responsables };
}

// ---------------------------------------------------------------------------
// Utilidades de validación
// ---------------------------------------------------------------------------

function hoyServidor_() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd');
}

/** Usa la fecha del cliente si es válida y está a ±1 día del servidor; si no, la del servidor. */
function resolverHoy_(hoyCliente) {
  var servidor = hoyServidor_();
  if (typeof hoyCliente !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(hoyCliente) || !parsearFecha(hoyCliente)) return servidor;
  var dif = Math.abs(diasEntre_(servidor, hoyCliente));
  return dif <= 1 ? hoyCliente : servidor;
}

function textoLimpio_(v, maximo, campo, obligatorio) {
  var t = (v === null || v === undefined) ? '' : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (obligatorio && !t) throw errorApp_('datos_invalidos', 'Falta ' + campo + '.');
  if (t.length > maximo) throw errorApp_('datos_invalidos', 'El campo ' + campo + ' es muy largo (máximo ' + maximo + ' caracteres).');
  return t;
}

function validarIdCliente_(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    throw errorApp_('datos_invalidos', 'Falta el identificador del registro.');
  }
  return id;
}

function centavos_(n) {
  return Math.round(Number(n) * 100);
}

function tomarCandado_() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(20000)) {
    throw errorApp_('error_interno', 'El Sheets está ocupado en este momento. Intenta de nuevo.');
  }
  return candado;
}

// ---------------------------------------------------------------------------
// Acciones de lectura
// ---------------------------------------------------------------------------

function sinConsumos_(tarjeta) {
  return {
    id: tarjeta.id, nombre: tarjeta.nombre, hoja: tarjeta.hoja, responsable: tarjeta.responsable,
    pendiente: tarjeta.pendiente, proximoVence: tarjeta.proximoVence,
    estados: tarjeta.estados.map(function (g) {
      return { vence: g.vence, pago: g.pago, total: g.total, pendiente: g.pendiente };
    })
  };
}

function accionInicio_(usuario, datos) {
  var hoy = resolverHoy_(datos.hoy);
  var mes = hoy.slice(0, 7);
  var p = leerPresupuestoDelMes_(mes);
  var resumen = resumenTarjetas(leerTodosLosConsumos_(), hoy, false);
  var totalPorPagar = 0;
  resumen.forEach(function (t) { if (t.id !== 'HORMIGA') totalPorPagar += t.pendiente; });
  return {
    version: VERSION,
    usuario: usuario,
    mes: mes,
    etiquetaMes: claveAEtiqueta(mes),
    presupuesto: p ? p.totales : null,
    tarjetas: resumen.map(sinConsumos_),
    alertas: alertas(resumen, hoy, DIAS_AVISO),
    totalPorPagar: Math.round(totalPorPagar * 100) / 100
  };
}

function accionTarjetas_(usuario, datos) {
  var hoy = resolverHoy_(datos.hoy);
  return { tarjetas: resumenTarjetas(leerTodosLosConsumos_(), hoy, datos.incluirPagados === true) };
}

function accionPresupuesto_(usuario, datos) {
  var mes = mesValido_(datos.mes);
  var p = leerPresupuestoDelMes_(mes);
  if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  return p;
}

function mesValido_(mes) {
  if (mes === undefined || mes === null || mes === '') mes = hoyServidor_().slice(0, 7);
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw errorApp_('datos_invalidos', 'El mes no es válido.');
  }
  return mes;
}

/** Cuánto gastó cada persona en el mes (por fecha del consumo, pagado o no). */
function accionPersonas_(usuario, datos) {
  var mes = mesValido_(datos.mes);
  return { mes: mes, personas: gastoPorPersona(leerTodosLosConsumos_(), mes) };
}

function accionConfig_(usuario) {
  var conf = leerConfiguracion_();
  var responsables = conf.responsables;
  if (!responsables.length) {
    var usuarios = leerUsuarios_();
    responsables = Object.keys(usuarios).map(function (k) { return usuarios[k].nombre; });
  }
  return {
    version: VERSION,
    usuario: usuario,
    conceptos: conf.conceptos,
    responsables: responsables,
    medios: MEDIOS,
    ciclos: CICLOS
  };
}

// ---------------------------------------------------------------------------
// Acciones de escritura
// ---------------------------------------------------------------------------

function buscarMedio_(id) {
  for (var i = 0; i < MEDIOS.length; i++) if (MEDIOS[i].id === id) return MEDIOS[i];
  return null;
}

function leerHojaConEncabezado_(hoja) {
  var valores = hoja.getDataRange().getValues();
  var idxEnc = buscarFilaEncabezado(valores, 'responsable');
  if (idxEnc === -1) throw errorApp_('error_interno', 'La hoja "' + hoja.getName() + '" no tiene el formato esperado.');
  var cols = mapearColumnas(valores[idxEnc]);
  return { valores: valores, idxEnc: idxEnc, cols: cols };
}

function accionRegistrar_(usuario, datos) {
  // --- Validación ---
  var idCliente = validarIdCliente_(datos.idCliente);
  var monto = typeof datos.monto === 'number' ? datos.monto : parsearMonto(String(datos.monto || ''));
  if (monto === null || !isFinite(monto) || monto <= 0 || monto > 1000000) {
    throw errorApp_('datos_invalidos', 'El monto debe ser mayor a cero.');
  }
  monto = Math.round(monto * 100) / 100;
  if (monto <= 0) throw errorApp_('datos_invalidos', 'El monto debe ser mayor a cero.');

  var medio = buscarMedio_(datos.medio);
  if (!medio) throw errorApp_('datos_invalidos', 'El medio de pago no es válido.');

  var conf = leerConfiguracion_();
  var conceptoNorm = normalizar(datos.concepto);
  var concepto = null;
  for (var i = 0; i < conf.conceptos.length; i++) {
    if (normalizar(conf.conceptos[i]) === conceptoNorm) { concepto = conf.conceptos[i]; break; }
  }
  if (!concepto) throw errorApp_('datos_invalidos', 'El concepto no está en la lista de Configuración.');

  var descripcion = textoLimpio_(datos.descripcion, 120, 'la descripción', true);
  var nota = textoLimpio_(datos.nota, 200, 'la nota', false);

  var fecha = typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? fechaISO(parsearFecha(datos.fecha)) : '';
  if (!fecha) throw errorApp_('datos_invalidos', 'La fecha no es válida.');
  if (diasEntre_(hoyServidor_(), fecha) > 1) throw errorApp_('datos_invalidos', 'La fecha no puede ser futura.');

  var nombreHoja = medio.hoja;
  var idCiclo = idTarjeta(nombreHoja, usuario.nombre);
  var ciclo = calcularCiclo(idCiclo, fecha);
  var idForm = 'APP:' + idCliente;
  var firma = firmaGasto({ fecha: fecha, monto: monto, descripcion: descripcion });

  // --- Escritura con candado ---
  var hoja = obtenerHoja_(nombreHoja);
  var candado = tomarCandado_();
  try {
    var h = leerHojaConEncabezado_(hoja);
    var valores = h.valores, cols = h.cols, idxEnc = h.idxEnc;
    if (cols.monto === -1 || cols.descripcion === -1 || cols.fecha === -1) {
      throw errorApp_('error_interno', 'La hoja "' + nombreHoja + '" no tiene el formato esperado.');
    }

    var ultimaConDatos = idxEnc; // 0-based
    var coincidencia = null;
    for (var r = idxEnc + 1; r < valores.length; r++) {
      var f = valores[r];
      var montoFila = parsearMonto(f[cols.monto]);
      var descFila = f[cols.descripcion];
      var tieneDesc = descFila !== '' && descFila !== null && descFila !== undefined;
      if (montoFila !== null || tieneDesc) ultimaConDatos = r;

      if (cols.idForm !== -1 && String(f[cols.idForm]).trim() === idForm) {
        // Ya se guardó antes (reintento de la cola): no se escribe de nuevo.
        return { guardado: false, duplicadoId: true, hoja: nombreHoja, fila: r + 1 };
      }
      if (!coincidencia && montoFila !== null &&
          firmaGasto({ fecha: f[cols.fecha], monto: montoFila, descripcion: descFila }) === firma) {
        coincidencia = { fecha: fecha, descripcion: String(descFila).trim(), monto: montoFila, hoja: nombreHoja };
      }
    }

    if (coincidencia && datos.confirmarDuplicado !== true) {
      return { guardado: false, posibleDuplicado: true, coincidencia: coincidencia };
    }

    var anchoFila = 0;
    Object.keys(cols).forEach(function (k) { if (cols[k] + 1 > anchoFila) anchoFila = cols[k] + 1; });
    var nueva = construirFila(cols, anchoFila, {
      idCliente: idCliente, monto: monto, medio: medio.id, concepto: concepto,
      descripcion: descripcion, nota: nota, fecha: fecha
    }, usuario.nombre, nombreHoja, ciclo);

    var filaDestino = ultimaConDatos + 2; // 1-based, la siguiente a la última con datos
    escribirFila_(hoja, filaDestino, nueva, cols, ultimaConDatos > idxEnc ? ultimaConDatos + 1 : 0);
    SpreadsheetApp.flush();
    return { guardado: true, hoja: nombreHoja, fila: filaDestino, duplicadoId: false };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Escribe solo las columnas conocidas de la fila destino y nunca pisa una celda
 * que tenga fórmula. Si la fila está fuera del rango con contenido, copia el
 * formato de la fila anterior con datos (filaModelo, 1-based; 0 = no copiar).
 */
function escribirFila_(hoja, filaDestino, valoresFila, cols, filaModelo) {
  if (filaDestino > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), filaDestino - hoja.getMaxRows());
  var ancho = valoresFila.length;
  if (filaModelo > 0 && filaDestino > hoja.getLastRow()) {
    hoja.getRange(filaModelo, 1, 1, ancho).copyFormatToRange(hoja, 1, ancho, filaDestino, filaDestino);
  }
  var rango = hoja.getRange(filaDestino, 1, 1, ancho);
  var formulas = rango.getFormulas()[0];
  var columnasAEscribir = {};
  Object.keys(cols).forEach(function (k) { if (cols[k] >= 0) columnasAEscribir[cols[k]] = true; });

  // Agrupa columnas contiguas para escribir en pocos llamados.
  var inicio = -1;
  for (var c = 0; c <= ancho; c++) {
    var escribir = c < ancho && columnasAEscribir[c] && !formulas[c];
    if (escribir && inicio === -1) inicio = c;
    if (!escribir && inicio !== -1) {
      hoja.getRange(filaDestino, inicio + 1, 1, c - inicio).setValues([valoresFila.slice(inicio, c)]);
      inicio = -1;
    }
  }
}

function accionMarcarPagado_(usuario, datos) {
  return cambiarEstadoDePago_(datos, true);
}

/** Lo contrario de marcarPagado: devuelve a 'Pendiente' consumos que estaban 'Pagado'. */
function accionDesmarcarPagado_(usuario, datos) {
  return cambiarEstadoDePago_(datos, false);
}

/**
 * Cuerpo común de marcarPagado (pagar = true) y desmarcarPagado (pagar = false).
 * Solo toca la celda Estado de cada fila, después de comprobar que la fila sigue
 * teniendo el monto y la descripción que vio la app, y nunca si esa celda tiene fórmula.
 */
function cambiarEstadoDePago_(datos, pagar) {
  validarIdCliente_(datos.idCliente);
  var nombreHoja = hojaConsumosCanonica_(datos.hoja);
  if (!nombreHoja) throw errorApp_('datos_invalidos', 'Esa hoja no admite marcar pagos.');
  var filas = datos.filas;
  if (!Array.isArray(filas) || !filas.length || filas.length > 500) {
    throw errorApp_('datos_invalidos', pagar ? 'No se indicaron filas para marcar.' : 'No se indicaron filas para desmarcar.');
  }
  var verificar = {};
  (Array.isArray(datos.verificar) ? datos.verificar : []).forEach(function (v) {
    if (v && Number.isInteger(v.fila)) verificar[v.fila] = v;
  });

  var hoja = obtenerHoja_(nombreHoja);
  var candado = tomarCandado_();
  try {
    var h = leerHojaConEncabezado_(hoja);
    var valores = h.valores, cols = h.cols, idxEnc = h.idxEnc;
    if (cols.estado === -1 || cols.monto === -1 || cols.descripcion === -1) {
      throw errorApp_('error_interno', 'La hoja "' + nombreHoja + '" no tiene el formato esperado.');
    }
    var omitidas = [];
    var aMarcar = [];
    var vistas = {};
    filas.forEach(function (fila) {
      if (!Number.isInteger(fila) || fila <= idxEnc + 1 || fila > valores.length) {
        omitidas.push({ fila: fila, motivo: 'fila no válida' });
        return;
      }
      if (vistas[fila]) return;
      vistas[fila] = true;
      var v = verificar[fila];
      if (!v) { omitidas.push({ fila: fila, motivo: 'sin datos para verificar' }); return; }
      var f = valores[fila - 1];
      var montoFila = parsearMonto(f[cols.monto]);
      var montoEsperado = typeof v.monto === 'number' ? v.monto : parsearMonto(String(v.monto || ''));
      if (montoFila === null || montoEsperado === null || centavos_(montoFila) !== centavos_(montoEsperado) ||
          normalizar(f[cols.descripcion]) !== normalizar(v.descripcion)) {
        omitidas.push({ fila: fila, motivo: 'la fila cambió' });
        return;
      }
      var yaPagado = normalizar(f[cols.estado]) === 'pagado';
      if (pagar && yaPagado) { omitidas.push({ fila: fila, motivo: 'ya estaba pagado' }); return; }
      if (!pagar && !yaPagado) { omitidas.push({ fila: fila, motivo: 'no estaba pagado' }); return; }
      aMarcar.push(fila);
    });

    var actualizadas = 0;
    if (aMarcar.length) {
      var formulas = hoja.getRange(1, cols.estado + 1, valores.length, 1).getFormulas();
      aMarcar.forEach(function (fila) {
        if (formulas[fila - 1][0]) { omitidas.push({ fila: fila, motivo: 'el estado tiene fórmula' }); return; }
        hoja.getRange(fila, cols.estado + 1).setValue(pagar ? 'Pagado' : 'Pendiente');
        actualizadas++;
      });
      SpreadsheetApp.flush();
    }
    return { actualizadas: actualizadas, omitidas: omitidas };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Gastos fijos pagados, editar y borrar gastos
// ---------------------------------------------------------------------------

/** Marca o desmarca un gasto fijo del presupuesto como pagado (nota en la celda del mes). */
function accionMarcarFijo_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var mes = mesValido_(datos.mes);
  var fila = datos.fila;
  if (!Number.isInteger(fila) || fila < 1) throw errorApp_('datos_invalidos', 'No se indicó la línea del presupuesto.');
  var pagado = datos.pagado === true;

  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var p = leerPresupuesto(rango.getDisplayValues(), rango.getValues(), mes, rango.getNotes());
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    var linea = null;
    p.filas.forEach(function (f) { if (f.fila === fila) linea = f; });
    if (!linea || linea.seccion !== 'gastos' || normalizar(linea.concepto) !== normalizar(datos.concepto)) {
      throw errorApp_('datos_invalidos', 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.');
    }
    var celda = hoja.getRange(fila, p.columna);
    var actual = celda.getNote();
    var hoy = hoyServidor_();
    var texto = 'Pagado el ' + hoy.slice(8, 10) + '/' + hoy.slice(5, 7) + '/' + hoy.slice(0, 4) +
      ' · ' + String(usuario.nombre || '').split(' ')[0];
    var nueva = pagado ? ponerNotaPagado(actual, texto) : quitarNotaPagado(actual);
    if (nueva !== actual) {
      celda.setNote(nueva);
      SpreadsheetApp.flush();
    }
    return { mes: mes, fila: fila, pagado: pagado, pagadoNota: notaPagado(nueva) };
  } finally {
    candado.releaseLock();
  }
}

/** Devuelve el motivo por el que la fila no coincide con lo que vio la app, o '' si coincide. */
function filaNoCoincide_(valores, cols, idxEnc, fila, verificar) {
  if (!Number.isInteger(fila) || fila <= idxEnc + 1 || fila > valores.length) return 'fila no válida';
  var v = verificar || {};
  var f = valores[fila - 1];
  var montoFila = parsearMonto(f[cols.monto]);
  var montoEsperado = typeof v.monto === 'number' ? v.monto : parsearMonto(String(v.monto || ''));
  if (montoFila === null || montoEsperado === null || centavos_(montoFila) !== centavos_(montoEsperado) ||
      normalizar(f[cols.descripcion]) !== normalizar(v.descripcion)) {
    return 'la fila cambió';
  }
  return '';
}

/** Corrige un gasto ya registrado: monto, concepto, descripción, nota o fecha. */
function accionEditarGasto_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var nombreHoja = hojaConsumosCanonica_(datos.hoja);
  if (!nombreHoja) throw errorApp_('datos_invalidos', 'Esa hoja no admite cambios.');
  var cambios = (datos.cambios && typeof datos.cambios === 'object') ? datos.cambios : {};
  var nuevo = {};

  if (cambios.monto !== undefined) {
    var monto = typeof cambios.monto === 'number' ? cambios.monto : parsearMonto(String(cambios.monto || ''));
    if (monto === null || !isFinite(monto) || monto <= 0 || monto > 1000000) {
      throw errorApp_('datos_invalidos', 'El monto debe ser mayor a cero.');
    }
    nuevo.monto = Math.round(monto * 100) / 100;
  }
  if (cambios.descripcion !== undefined) nuevo.descripcion = textoLimpio_(cambios.descripcion, 120, 'la descripción', true);
  if (cambios.nota !== undefined) nuevo.nota = textoLimpio_(cambios.nota, 200, 'la nota', false);
  if (cambios.concepto !== undefined) {
    var conf = leerConfiguracion_();
    var buscado = normalizar(cambios.concepto);
    for (var i = 0; i < conf.conceptos.length; i++) {
      if (normalizar(conf.conceptos[i]) === buscado) { nuevo.concepto = conf.conceptos[i]; break; }
    }
    if (!nuevo.concepto) throw errorApp_('datos_invalidos', 'El concepto no está en la lista de Configuración.');
  }
  if (cambios.fecha !== undefined) {
    var fecha = typeof cambios.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha) ? fechaISO(parsearFecha(cambios.fecha)) : '';
    if (!fecha) throw errorApp_('datos_invalidos', 'La fecha no es válida.');
    if (diasEntre_(hoyServidor_(), fecha) > 1) throw errorApp_('datos_invalidos', 'La fecha no puede ser futura.');
    nuevo.fecha = fecha;
  }
  if (!Object.keys(nuevo).length) throw errorApp_('datos_invalidos', 'No hay cambios para guardar.');

  var hoja = obtenerHoja_(nombreHoja);
  var candado = tomarCandado_();
  try {
    var h = leerHojaConEncabezado_(hoja);
    var valores = h.valores, cols = h.cols;
    if (cols.monto === -1 || cols.descripcion === -1 || cols.fecha === -1) {
      throw errorApp_('error_interno', 'La hoja "' + nombreHoja + '" no tiene el formato esperado.');
    }
    var motivo = filaNoCoincide_(valores, cols, h.idxEnc, datos.fila, datos.verificar);
    if (motivo) throw errorApp_('datos_invalidos', 'Ese gasto cambió en el Sheets. Actualiza y vuelve a intentar.');
    var fila = datos.fila;
    var f = valores[fila - 1];
    var formulas = hoja.getRange(fila, 1, 1, f.length).getFormulas()[0];
    var escribir = function (col, valor) {
      if (col >= 0 && col < f.length && !formulas[col]) hoja.getRange(fila, col + 1).setValue(valor);
    };

    if (nuevo.monto !== undefined) escribir(cols.monto, nuevo.monto);
    if (nuevo.descripcion !== undefined) escribir(cols.descripcion, neutralizarTexto(nuevo.descripcion));
    if (nuevo.concepto !== undefined) escribir(cols.concepto, neutralizarTexto(nuevo.concepto));
    if (nuevo.nota !== undefined) escribir(cols.nota, neutralizarTexto(nuevo.nota));
    if (nuevo.fecha !== undefined) {
      escribir(cols.fecha, parsearFecha(nuevo.fecha));
      escribir(cols.mes, nombreMes(nuevo.fecha));
      var idCiclo = idTarjeta(nombreHoja, f[cols.responsable]);
      var ciclo = idCiclo === 'HORMIGA' ? { pago: '', vence: '' } : calcularCiclo(idCiclo, nuevo.fecha);
      if (ciclo.pago && ciclo.vence) {
        escribir(cols.fechaPago, parsearFecha(ciclo.pago));
        escribir(cols.fechaVencimiento, parsearFecha(ciclo.vence));
      }
    }
    // La huella (para detectar duplicados) se rehace con los datos finales.
    if (cols.huella !== -1 && String(f[cols.huella] || '').trim()) {
      escribir(cols.huella, firmaGasto({
        fecha: nuevo.fecha !== undefined ? nuevo.fecha : f[cols.fecha],
        monto: nuevo.monto !== undefined ? nuevo.monto : parsearMonto(f[cols.monto]),
        descripcion: nuevo.descripcion !== undefined ? nuevo.descripcion : f[cols.descripcion]
      }));
    }
    SpreadsheetApp.flush();
    return { actualizado: true, hoja: nombreHoja, fila: fila };
  } finally {
    candado.releaseLock();
  }
}

/** Borra la fila de un gasto (queda en el historial de versiones del Sheets). */
function accionBorrarGasto_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var nombreHoja = hojaConsumosCanonica_(datos.hoja);
  if (!nombreHoja) throw errorApp_('datos_invalidos', 'Esa hoja no admite cambios.');
  var hoja = obtenerHoja_(nombreHoja);
  var candado = tomarCandado_();
  try {
    var h = leerHojaConEncabezado_(hoja);
    if (h.cols.monto === -1 || h.cols.descripcion === -1) {
      throw errorApp_('error_interno', 'La hoja "' + nombreHoja + '" no tiene el formato esperado.');
    }
    var motivo = filaNoCoincide_(h.valores, h.cols, h.idxEnc, datos.fila, datos.verificar);
    if (motivo) throw errorApp_('datos_invalidos', 'Ese gasto cambió en el Sheets. Actualiza y vuelve a intentar.');
    hoja.deleteRow(datos.fila);
    SpreadsheetApp.flush();
    return { borrado: true, hoja: nombreHoja };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Versión del motor
// ---------------------------------------------------------------------------

/** Dice qué versión está instalada y qué acciones entiende. No lee el Sheets. */
function accionVersion_() {
  return { version: VERSION, acciones: ACCIONES.slice() };
}

// ---------------------------------------------------------------------------
// Ahorros acumulados (solo lectura)
// ---------------------------------------------------------------------------

/** Acumulado de cada meta de ahorro del presupuesto hasta el mes pedido inclusive. */
function accionAhorros_(usuario, datos) {
  var mes = mesValido_(datos.mes);
  var rango = obtenerHoja_(HOJA_PRESUPUESTO).getDataRange();
  var r = ahorrosAcumulados(rango.getDisplayValues(), rango.getValues(), mes);
  if (!r) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  return r;
}

// ---------------------------------------------------------------------------
// Editar una línea del presupuesto
// ---------------------------------------------------------------------------

/**
 * Cambia el monto de UNA línea del presupuesto en UN mes.
 * Se niega si la línea ya no es la misma, si la celda tiene fórmula, si está
 * combinada, si no contiene un número simple o si su valor ya no es el que la
 * app mostraba (montoAnterior). Solo escribe el valor: la nota de la celda
 * ("Pagado…") y su formato quedan como estaban.
 */
function accionEditarPresupuesto_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  // En una escritura el mes es obligatorio: no se asume el mes actual.
  if (datos.mes === undefined || datos.mes === null || datos.mes === '') {
    throw errorApp_('datos_invalidos', 'Falta el mes.');
  }
  var mes = mesValido_(datos.mes);
  var fila = datos.fila;
  if (!Number.isInteger(fila) || fila < 1) throw errorApp_('datos_invalidos', 'No se indicó la línea del presupuesto.');
  var concepto = textoLimpio_(datos.concepto, 200, 'el concepto', true);

  var revisado = validarMontoPresupuesto(datos.monto);
  if (revisado.error) throw errorApp_('datos_invalidos', revisado.error);
  var montoNuevo = revisado.monto;

  var anterior = typeof datos.montoAnterior === 'number'
    ? (isFinite(datos.montoAnterior) ? datos.montoAnterior : null)
    : (typeof datos.montoAnterior === 'string' ? parsearMonto(datos.montoAnterior) : null);
  if (anterior === null) throw errorApp_('datos_invalidos', 'Falta el monto que mostraba la app (montoAnterior).');

  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var p = leerPresupuesto(rango.getDisplayValues(), rango.getValues(), mes, rango.getNotes());
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    var linea = null;
    p.filas.forEach(function (f) { if (f.fila === fila) linea = f; });
    if (!linea || normalizar(linea.concepto) !== normalizar(concepto)) {
      throw errorApp_('datos_invalidos', 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.');
    }

    var celda = hoja.getRange(fila, p.columna);
    if (celda.getFormula()) {
      throw errorApp_('datos_invalidos', 'Ese monto se calcula con una fórmula y no se cambia desde la app. Edítalo en el Sheets.');
    }
    if (celda.isPartOfMerge()) {
      throw errorApp_('datos_invalidos', 'Esa celda está combinada con otras y no se cambia desde la app. Edítala en el Sheets.');
    }
    var crudo = celda.getValue();
    var vacia = crudo === '' || crudo === null;
    if (!vacia && (typeof crudo !== 'number' || !isFinite(crudo))) {
      throw errorApp_('datos_invalidos', 'Esa celda no contiene un número simple y no se cambia desde la app. Edítala en el Sheets.');
    }
    var actual = vacia ? 0 : crudo;
    if (centavos_(actual) !== centavos_(anterior)) {
      throw errorApp_('datos_invalidos', 'El monto de esa línea cambió en el Sheets. Actualiza y vuelve a intentar.');
    }

    var actualizado = false;
    if (centavos_(actual) !== centavos_(montoNuevo)) {
      celda.setValue(montoNuevo);
      SpreadsheetApp.flush();
      actualizado = true;
    }

    // Se vuelve a leer para devolver los totales ya recalculados por el Sheets.
    var totales = p.totales;
    if (actualizado) {
      var rango2 = hoja.getDataRange();
      var p2 = leerPresupuesto(rango2.getDisplayValues(), rango2.getValues(), mes, rango2.getNotes());
      totales = p2 ? p2.totales : null;
    }
    return {
      actualizado: actualizado, mes: mes, fila: fila, concepto: linea.concepto, seccion: linea.seccion,
      montoAnterior: Math.round(actual * 100) / 100, monto: montoNuevo,
      pagadoNota: notaPagado(celda.getNote()),
      totales: totales
    };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Avisos de vencimiento por correo (activador diario, sin costo)
// ---------------------------------------------------------------------------

/** Claves ya avisadas HOY según lo guardado en la propiedad (lo de otros días se descarta). */
function avisosYaEnviados_(crudo, hoy) {
  if (!crudo) return [];
  try {
    var g = JSON.parse(crudo);
    if (g && g.fecha === hoy && Array.isArray(g.claves)) return g.claves.map(String);
  } catch (err) { /* propiedad dañada: se trata como vacía */ }
  return [];
}

/**
 * Pensada para correr una vez al día con un activador de tiempo (ver instalarAvisos).
 * Manda UN solo correo a los usuarios de USUARIOS cuando una tarjeta con deuda
 * vence en 3 días, mañana u hoy. No repite el mismo aviso el mismo día.
 * Solo LEE el Sheets; lo único que escribe es la propiedad FINFAMILY_AVISOS.
 * También se puede ejecutar a mano desde el editor para probarla.
 */
function avisosDeVencimiento() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(20000)) {
    console.warn('FinFamily avisos: el script estaba ocupado; no se envió nada en esta pasada.');
    return { enviado: false, avisos: 0, motivo: 'ocupado' };
  }
  try {
    var hoy = hoyServidor_();
    var propiedades = PropertiesService.getScriptProperties();
    var yaAvisadas = avisosYaEnviados_(propiedades.getProperty(PROPIEDAD_AVISOS), hoy);
    var resumen = resumenTarjetas(leerTodosLosConsumos_(), hoy, false);
    var avisos = avisosDelDia(resumen, hoy, yaAvisadas);
    if (!avisos.length) {
      console.log('FinFamily avisos (' + hoy + '): nada nuevo que avisar.');
      return { enviado: false, avisos: 0, motivo: 'nada que avisar' };
    }

    var correos = Object.keys(leerUsuarios_()).filter(function (c) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c); });
    if (!correos.length) {
      console.error('FinFamily avisos: no hay correos válidos en USUARIOS.');
      return { enviado: false, avisos: avisos.length, motivo: 'sin destinatarios' };
    }
    if (MailApp.getRemainingDailyQuota() < correos.length) {
      console.error('FinFamily avisos: se agotó la cuota diaria de correos de Google.');
      return { enviado: false, avisos: avisos.length, motivo: 'sin cuota de correo' };
    }

    var texto = textoAvisos(avisos);
    MailApp.sendEmail({ to: correos.join(','), subject: texto.asunto, body: texto.cuerpo, name: 'FinFamily' });

    // Se anota recién después de enviar: si el envío falla, mañana (o al reintentar) se avisa igual.
    propiedades.setProperty(PROPIEDAD_AVISOS, JSON.stringify({
      fecha: hoy,
      claves: yaAvisadas.concat(avisos.map(function (a) { return a.clave; }))
    }));
    console.log('FinFamily avisos (' + hoy + '): correo enviado con ' + avisos.length + ' aviso(s).');
    return { enviado: true, avisos: avisos.length, destinatarios: correos.length };
  } finally {
    candado.releaseLock();
  }
}

/** Borra solo los activadores de avisosDeVencimiento (no toca los demás del proyecto). */
function quitarActivadoresDeAvisos_() {
  var quitados = 0;
  ScriptApp.getProjectTriggers().forEach(function (a) {
    if (a.getHandlerFunction() === FUNCION_AVISOS) {
      ScriptApp.deleteTrigger(a);
      quitados++;
    }
  });
  return quitados;
}

/**
 * Ejecutar UNA vez a mano desde el editor: crea el activador diario (8 a 9 a. m., hora de Lima).
 * Si ya existía, lo reemplaza (nunca quedan dos). Google pedirá permiso para enviar
 * correo y para ejecutar el script cuando ustedes no estén.
 */
function instalarAvisos() {
  var quitados = quitarActivadoresDeAvisos_();
  ScriptApp.newTrigger(FUNCION_AVISOS).timeBased().everyDays(1).atHour(HORA_AVISOS).inTimezone(ZONA_HORARIA).create();
  var correos = Object.keys(leerUsuarios_());
  console.log('FinFamily avisos: activador diario creado' + (quitados ? ' (reemplazó ' + quitados + ' anterior)' : '') +
    '. Avisará a ' + correos.length + ' correo(s). Cuota de correos disponible hoy: ' + MailApp.getRemainingDailyQuota() + '.');
}

/** Ejecutar a mano desde el editor para dejar de recibir los avisos. */
function quitarAvisos() {
  var quitados = quitarActivadoresDeAvisos_();
  PropertiesService.getScriptProperties().deleteProperty(PROPIEDAD_AVISOS);
  console.log('FinFamily avisos: se quitaron ' + quitados + ' activador(es). Ya no se enviarán correos.');
}
