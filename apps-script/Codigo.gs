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
 */

var VERSION = '1.1.0';
var SHEET_ID_DEFECTO = '1KEHSUJXu9lJ1HjnYgF-mKBpOQq0V2qPOlEXSnUgRyp4';
var ZONA_HORARIA = 'America/Lima';
var DIAS_AVISO = 3;
var SEGUNDOS_CACHE_TOKEN = 300;

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
  validarIdCliente_(datos.idCliente);
  var nombreHoja = hojaConsumosCanonica_(datos.hoja);
  if (!nombreHoja) throw errorApp_('datos_invalidos', 'Esa hoja no admite marcar pagos.');
  var filas = datos.filas;
  if (!Array.isArray(filas) || !filas.length || filas.length > 500) {
    throw errorApp_('datos_invalidos', 'No se indicaron filas para marcar.');
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
      if (normalizar(f[cols.estado]) === 'pagado') { omitidas.push({ fila: fila, motivo: 'ya estaba pagado' }); return; }
      aMarcar.push(fila);
    });

    var actualizadas = 0;
    if (aMarcar.length) {
      var formulas = hoja.getRange(1, cols.estado + 1, valores.length, 1).getFormulas();
      aMarcar.forEach(function (fila) {
        if (formulas[fila - 1][0]) { omitidas.push({ fila: fila, motivo: 'el estado tiene fórmula' }); return; }
        hoja.getRange(fila, cols.estado + 1).setValue('Pagado');
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
