/**
 * FinFamily · Codigo.gs
 *
 * Aplicación web de Apps Script (se ejecuta como el dueño del script).
 * Recibe POST con cuerpo JSON {accion, token, datos} enviado como
 * 'text/plain;charset=utf-8' y responde JSON:
 *   {ok:true, datos:{...}}  o  {ok:false, codigo, error}
 *
 * Lee y escribe en las hojas que ya existen y nunca cambia fórmulas. La única hoja que
 * crea es "Por confirmar" (bandeja del lector de correos de bancos, motor 1.3).
 * Un gasto fijo "pagado" se guarda como nota en su celda del mes en PRESUPUESTO FAMILIAR.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   SHEET_ID   ID privado del Google Sheets; es obligatorio y no se incluye en el código.
 *   CLIENT_ID  ID de cliente OAuth web de Google (el mismo de la PWA).
 *   USUARIOS   JSON {"correo@gmail.com":{"nombre":"PersonaA","clave":"P"}, ...}
 * Las escribe el propio script:
 *   FINFAMILY_AVISOS               avisos de vencimiento ya enviados hoy.
 *   FINFAMILY_AJUSTES_AVISOS       ajustes de alertas de la app.
 *   FINFAMILY_TARJETAS             datos de las tarjetas (últimos 4 dígitos, red, nombre).
 *   FINFAMILY_ALERTAS_PRESUPUESTO  líneas del presupuesto ya avisadas este mes.
 *   FINFAMILY_RESUMEN_SEMANAL      último lunes en que se envió el resumen.
 *   FINFAMILY_CALENDARIO           eventos de vencimiento creados en el calendario.
 *   FINFAMILY_CATALOGO             catálogo de tarjetas (motor 1.4; si falta, se usa el inicial).
 *   FINFAMILY_LINEAS               conceptos de gasto asignados a cada línea del presupuesto (motor 1.5).
 *   FINFAMILY_ICONOS               ícono elegido para cada tipo de gasto (motor 1.5.1).
 */

var VERSION = '1.13.0';
var ZONA_HORARIA = 'America/Lima';
var DIAS_AVISO = 3;
var SEGUNDOS_CACHE_TOKEN = 300;
// Motor 1.9.8: sesiones propias, para no depender del pase de Google (vence cada hora).
var PROPIEDAD_SESIONES = 'FINFAMILY_SESIONES';
var DIAS_SESION = 180;          // se renueva sola (deslizante) con el uso
var MAXIMO_SESIONES = 30;       // por si se abren muchas: se borran las más viejas
var PROPIEDAD_AVISOS = 'FINFAMILY_AVISOS';
var PROPIEDAD_AJUSTES_AVISOS = 'FINFAMILY_AJUSTES_AVISOS';
var PROPIEDAD_TARJETAS = 'FINFAMILY_TARJETAS';
var PROPIEDAD_ALERTAS_PRESUPUESTO = 'FINFAMILY_ALERTAS_PRESUPUESTO';
var PROPIEDAD_RESUMEN_SEMANAL = 'FINFAMILY_RESUMEN_SEMANAL';
var PROPIEDAD_CALENDARIO = 'FINFAMILY_CALENDARIO';
var PROPIEDAD_CATALOGO = 'FINFAMILY_CATALOGO';
var PROPIEDAD_LINEAS = 'FINFAMILY_LINEAS';
var PROPIEDAD_ICONOS = 'FINFAMILY_ICONOS';
var PROPIEDAD_FIJOS = 'FINFAMILY_FIJOS';               // motor 1.13.0: día y si se paga solo, por línea fija
var PROPIEDAD_FIJOS_HECHOS = 'FINFAMILY_FIJOS_HECHOS'; // lo ya marcado o avisado, por línea y mes
var FUNCION_AVISOS = 'avisosDeVencimiento';
var FUNCION_LECTOR = 'leerCorreosDeBancos';
var FUNCION_ALERTAS = 'revisarAlertas';
var HORA_AVISOS = 8; // hora (de Lima) a la que corren el aviso diario y las alertas
var MINUTOS_LECTOR = 10; // cada cuántos minutos se revisa Gmail
var DIAS_CORREOS = 3; // cuántos días hacia atrás busca el lector

/** Acciones que entiende este motor (la acción 'version' las devuelve). */
var ACCIONES = ['inicio', 'tarjetas', 'presupuesto', 'config', 'registrar', 'marcarPagado', 'marcarFijo',
  'editarGasto', 'borrarGasto', 'personas', 'desmarcarPagado', 'editarPresupuesto', 'ahorros', 'version', 'abrirSesion', 'cerrarSesion', 'reenvio', 'pasarACuotas', 'fijosAuto', 'guardarFijoAuto',
  'pendientes', 'confirmarPendiente', 'descartarPendiente', 'ajustesAvisos', 'guardarAjustesAvisos',
  'datosTarjetas', 'guardarDatosTarjeta',
  'agregarTarjeta', 'editarTarjeta', 'quitarTarjeta', 'restaurarTarjeta',
  'agregarConcepto', 'renombrarConcepto', 'quitarConcepto',
  'usuarios', 'agregarUsuario', 'quitarUsuario',
  'lineasPresupuesto', 'agregarLinea', 'renombrarLinea', 'quitarLinea', 'asignarConceptos', 'editarLineaMeses',
  'guardarIconoConcepto', 'bolsas'];

var HOJAS_TC = ['TC IBK', 'TC BCP', 'TC Ripley', 'TC SIP']; // valor inicial: las hojas reales salen del catálogo
var HOJA_MODELO_TC = 'TC BCP'; // de aquí se copia la fila de encabezados al crear una tarjeta nueva
var HOJA_HORMIGA = 'Gastos Hormiga';
var HOJA_CONFIG = 'Configuración';
var HOJA_PRESUPUESTO = 'PRESUPUESTO FAMILIAR';
var HOJA_POR_CONFIRMAR = 'Por confirmar';
var ETIQUETA_GMAIL = 'FinFamily/Leído';

/**
 * Lector de Gmail (editable): dominios de los remitentes de los bancos y palabras que
 * debe traer el asunto. Si un banco cambia de dominio, agréguenlo aquí y también en
 * BANCOS_CORREO (Logica.gs), que es donde se decide a qué banco pertenece el correo.
 */
var REMITENTES_BANCOS = {
  dominios: ['notificacionesbcp.com.pe', 'bcp.com.pe', 'viabcp.com',
    'alertas.sip.pe', 'servicioalcliente.sip.pe', 'operaciones.agora.pe',
    'interbank.pe', 'interbank.com.pe', 'bancoripley.com.pe', 'bancoripley.com', 'ripley.com.pe',
    'tarjetaoh.pe', 'financieraoh.pe', 'financieraoh.com.pe', 'oh.pe',
    'yape.pe', 'lemoncash.com.ar', 'lemon.me'],
  palabrasAsunto: ['realizaste', 'consumo', 'compra', 'operación', 'transacción', 'yapeo', 'enviaste']
};

var MENSAJES = {
  no_autorizado: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.',
  datos_invalidos: 'Los datos enviados no son válidos.',
  hoja_no_encontrada: 'No se encontró una hoja del Sheets.',
  error_interno: 'Ocurrió un problema en el servidor. Intenta de nuevo en un momento.'
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

// Este archivo vive dentro del Apps Script del propio Sheets ("proyecto privado").
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
    // Con llave de sesión del motor (1.9.8) no hace falta el pase de Google; sin ella, el pase de Google.
    var usuario = cuerpo.sesion ? usuarioDeSesion_(cuerpo.sesion) : verificarToken_(cuerpo.token);
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
      case 'abrirSesion': resultado = accionAbrirSesion_(usuario, cuerpo); break;
      case 'cerrarSesion': resultado = accionCerrarSesion_(usuario, cuerpo); break;
      case 'reenvio': resultado = accionReenvio_(usuario, datos); break;
      case 'pasarACuotas': resultado = accionPasarACuotas_(usuario, datos); break;
      case 'fijosAuto': resultado = accionFijosAuto_(usuario, datos); break;
      case 'guardarFijoAuto': resultado = accionGuardarFijoAuto_(usuario, datos); break;
      case 'pendientes': resultado = accionPendientes_(usuario, datos); break;
      case 'confirmarPendiente': resultado = accionConfirmarPendiente_(usuario, datos); break;
      case 'descartarPendiente': resultado = accionDescartarPendiente_(usuario, datos); break;
      case 'ajustesAvisos': resultado = accionAjustesAvisos_(usuario, datos); break;
      case 'guardarAjustesAvisos': resultado = accionGuardarAjustesAvisos_(usuario, datos); break;
      case 'datosTarjetas': resultado = accionDatosTarjetas_(usuario, datos); break;
      case 'guardarDatosTarjeta': resultado = accionGuardarDatosTarjeta_(usuario, datos); break;
      case 'agregarTarjeta': resultado = accionAgregarTarjeta_(usuario, datos); break;
      case 'editarTarjeta': resultado = accionEditarTarjeta_(usuario, datos); break;
      case 'quitarTarjeta': resultado = accionQuitarTarjeta_(usuario, datos); break;
      case 'restaurarTarjeta': resultado = accionRestaurarTarjeta_(usuario, datos); break;
      case 'agregarConcepto': resultado = accionAgregarConcepto_(usuario, datos); break;
      case 'renombrarConcepto': resultado = accionRenombrarConcepto_(usuario, datos); break;
      case 'quitarConcepto': resultado = accionQuitarConcepto_(usuario, datos); break;
      case 'usuarios': resultado = accionUsuarios_(usuario, datos); break;
      case 'agregarUsuario': resultado = accionAgregarUsuario_(usuario, datos); break;
      case 'quitarUsuario': resultado = accionQuitarUsuario_(usuario, datos); break;
      case 'lineasPresupuesto': resultado = accionLineasPresupuesto_(usuario, datos); break;
      case 'agregarLinea': resultado = accionAgregarLinea_(usuario, datos); break;
      case 'renombrarLinea': resultado = accionRenombrarLinea_(usuario, datos); break;
      case 'quitarLinea': resultado = accionQuitarLinea_(usuario, datos); break;
      case 'asignarConceptos': resultado = accionAsignarConceptos_(usuario, datos); break;
      case 'editarLineaMeses': resultado = accionEditarLineaMeses_(usuario, datos); break;
      case 'guardarIconoConcepto': resultado = accionGuardarIconoConcepto_(usuario, datos); break;
      case 'bolsas': resultado = accionBolsas_(usuario, datos); break;
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
// Sesiones propias (motor 1.9.8): quien entra con Google recibe una llave que dura DIAS_SESION días y se
// renueva sola con el uso. Solo se guarda la huella (SHA-256) de la llave, nunca la llave. "Cerrar sesión"
// la borra. Si a la persona la quitan de USUARIOS, su llave deja de servir.
// ---------------------------------------------------------------------------

function leerSesiones_() {
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROPIEDAD_SESIONES) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch (err) { return {}; }
}

function guardarSesiones_(s) {
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_SESIONES, JSON.stringify(s));
}

/** Quita las vencidas y, si hay demasiadas, las usadas hace más tiempo. */
function podarSesiones_(s, ahora) {
  Object.keys(s).forEach(function (k) { if (!s[k] || !(s[k].expira > ahora)) delete s[k]; });
  var claves = Object.keys(s).sort(function (a, b) { return (s[a].usada || 0) - (s[b].usada || 0); });
  while (claves.length > MAXIMO_SESIONES) delete s[claves.shift()];
  return s;
}

function usuarioDeSesion_(sesion) {
  if (typeof sesion !== 'string' || !/^ffs1\.[0-9a-f]{64}$/.test(sesion)) throw errorApp_('no_autorizado');
  var ahora = Date.now();
  var sesiones = leerSesiones_();
  var huella = hashHex_(sesion);
  var x = sesiones[huella];
  if (!x || !(x.expira > ahora)) throw errorApp_('no_autorizado');
  var u = leerUsuarios_()[x.email];
  if (!u || !u.nombre) throw errorApp_('no_autorizado', 'Tu cuenta no tiene acceso a FinFamily.');
  // Se renueva (deslizante) como mucho una vez al día, para no escribir en cada pedido.
  if (ahora - (x.usada || 0) > 86400000) {
    x.usada = ahora;
    x.expira = ahora + DIAS_SESION * 86400000;
    sesiones[huella] = x;
    try { guardarSesiones_(podarSesiones_(sesiones, ahora)); } catch (err) { console.warn('FinFamily sesiones: no se pudo renovar: ' + err); }
  }
  return { email: x.email, nombre: u.nombre, clave: u.clave, sesion: huella };
}

/** Acción 'abrirSesion': solo con el pase de Google. Devuelve {sesion, expira, email}. */
function accionAbrirSesion_(usuario, cuerpo) {
  if (cuerpo && cuerpo.sesion) throw errorApp_('datos_invalidos', 'Ya hay una sesión abierta.');
  var ahora = Date.now();
  var llave = 'ffs1.' + hashHex_(Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + ahora + '|' + Math.random());
  var candado = LockService.getScriptLock();
  candado.tryLock(10000);
  try {
    var sesiones = podarSesiones_(leerSesiones_(), ahora);
    sesiones[hashHex_(llave)] = { email: usuario.email, creada: ahora, usada: ahora, expira: ahora + DIAS_SESION * 86400000 };
    guardarSesiones_(podarSesiones_(sesiones, ahora));
  } finally {
    try { candado.releaseLock(); } catch (err) { /* nada */ }
  }
  return { sesion: llave, expira: ahora + DIAS_SESION * 86400000, email: usuario.email };
}

/** Acción 'cerrarSesion': borra la llave con la que se llamó. */
function accionCerrarSesion_(usuario, cuerpo) {
  if (!usuario.sesion) return { cerrada: false };
  var candado = LockService.getScriptLock();
  candado.tryLock(10000);
  try {
    var sesiones = leerSesiones_();
    delete sesiones[usuario.sesion];
    guardarSesiones_(sesiones);
  } finally {
    try { candado.releaseLock(); } catch (err) { /* nada */ }
  }
  return { cerrada: true };
}

// ---------------------------------------------------------------------------
// Conectar los avisos del banco de otra persona (motor 1.10.0): su Gmail reenvía los avisos al Gmail donde
// corre el lector. Esta acción le dice a dónde reenviar, le muestra el código con que Gmail confirma el
// reenvío (llega a este Gmail) y si ya están llegando sus avisos.
// ---------------------------------------------------------------------------

/** Gmail donde corre el lector (el dueño del script). Propiedad CORREO_LECTOR si no se puede leer. */
function correoDelLector_() {
  var correo = '';
  try { correo = String(Session.getEffectiveUser().getEmail() || ''); } catch (err) { correo = ''; }
  if (!correo) correo = String(propiedad_('CORREO_LECTOR') || '');
  return correo.trim().toLowerCase();
}

/** Código de confirmación de reenvío de Gmail pedido por `email` en los últimos días, o null. */
function codigoDeReenvio_(email) {
  var hilos = GmailApp.search('from:forwarding-noreply@google.com newer_than:3d', 0, 20);
  var mejor = null;
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (m) {
      if (String(m.getFrom() || '').toLowerCase().indexOf('forwarding-noreply@google.com') === -1) return;
      var asunto = String(m.getSubject() || '');
      var cuerpo = '';
      try { cuerpo = String(m.getPlainBody() || ''); } catch (err) { cuerpo = ''; }
      // Solo el pedido de ESA persona (su correo aparece en el asunto o en el texto).
      if ((asunto + ' ' + cuerpo).toLowerCase().indexOf(email) === -1) return;
      var codigo = (asunto.match(/\(#(\d{6,12})\)/) || cuerpo.match(/(?:c[oó]digo de confirmaci[oó]n|confirmation code)\D{0,10}(\d{6,12})/i) || [])[1];
      if (!codigo) return;
      var fecha = m.getDate();
      if (!mejor || fecha > mejor.fecha) mejor = { codigo: codigo, fecha: fecha };
    });
  });
  return mejor;
}

function accionReenvio_(usuario) {
  var destino = correoDelLector_();
  var propio = !destino || usuario.email === destino;
  var salida = {
    destino: destino, propio: propio,
    dominios: REMITENTES_BANCOS.dominios.slice(), palabras: REMITENTES_BANCOS.palabrasAsunto.slice(),
    codigo: '', ultimoAviso: ''
  };
  if (propio) return salida;
  try {
    var c = codigoDeReenvio_(usuario.email);
    if (c) { salida.codigo = c.codigo; salida.fechaCodigo = Utilities.formatDate(c.fecha, ZONA_HORARIA, 'yyyy-MM-dd HH:mm'); }
  } catch (err) { console.warn('FinFamily reenvío: no se pudo buscar el código: ' + err); }
  // ¿Ya llegan sus avisos? El último consumo leído del correo a su nombre.
  try {
    var n = normalizar(usuario.nombre);
    leerTodosLosPendientes_().forEach(function (p) {
      if (normalizar(p.responsable) === n && String(p.fechaCorreo || '') > salida.ultimoAviso) salida.ultimoAviso = String(p.fechaCorreo || '');
    });
  } catch (err) { /* sin hoja aún */ }
  return salida;
}

// ---------------------------------------------------------------------------
// Acceso al Sheets
// ---------------------------------------------------------------------------

var libro_ = null;
var catalogo_ = null;

/** Catálogo de tarjetas (propiedad FINFAMILY_CATALOGO o el inicial). Se lee una vez por petición. */
function leerCatalogo_() {
  if (!catalogo_) {
    var guardado = propiedad_(PROPIEDAD_CATALOGO);
    if (guardado) catalogo_ = catalogoDesde(guardado);
    else {
      var inicial = CATALOGO_DEFECTO.map(function (t) { return Object.assign({}, t); });
      var usuarios = leerUsuarios_();
      var titularPrimero = '';
      var titularSegundo = '';
      Object.keys(usuarios).forEach(function (correo) {
        var u = usuarios[correo];
        if (u.clave === 'P') titularPrimero = u.nombre;
        if (u.clave === 'B') titularSegundo = u.nombre;
      });
      inicial.forEach(function (t) {
        if (t.id === 'IBK_P') t.titular = titularPrimero;
        if (t.id === 'IBK_B') t.titular = titularSegundo;
      });
      catalogo_ = catalogoDesde(JSON.stringify(inicial));
    }
  }
  return catalogo_;
}

function guardarCatalogo_(lista) {
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_CATALOGO, JSON.stringify(lista));
  catalogo_ = catalogoDesde(JSON.stringify(lista));
  return catalogo_;
}

function abrirLibro_() {
  if (!libro_) {
    var idHoja = propiedad_('SHEET_ID');
    if (!idHoja || !String(idHoja).trim()) throw errorApp_('error_interno', 'La propiedad privada SHEET_ID no está configurada.');
    libro_ = SpreadsheetApp.openById(String(idHoja).trim());
  }
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
  var todas = hojasDesde(leerCatalogo_()).concat([HOJA_HORMIGA]);
  for (var i = 0; i < todas.length; i++) {
    if (normalizar(todas[i]) === n) return todas[i];
  }
  return null;
}

function leerTodosLosConsumos_() {
  var todos = [];
  var catalogo = leerCatalogo_();
  hojasDesde(catalogo).concat([HOJA_HORMIGA]).forEach(function (nombre) {
    var valores = obtenerHoja_(nombre).getDataRange().getValues();
    todos = todos.concat(leerConsumos(valores, nombre, catalogo));
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
  var consumos = leerTodosLosConsumos_();
  var resumen = resumenTarjetas(consumos, hoy, false, leerCatalogo_());
  var bolsas = null;
  try { bolsas = bolsasDelMes_(mes, consumos); } catch (err) {
    console.warn('FinFamily inicio: no se pudieron calcular las bolsas: ' + err);
  }
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
    totalPorPagar: Math.round(totalPorPagar * 100) / 100,
    pendientes: contarPendientes_(),
    bolsas: bolsas
  };
}

function accionTarjetas_(usuario, datos) {
  var hoy = resolverHoy_(datos.hoy);
  return { tarjetas: resumenTarjetas(leerTodosLosConsumos_(), hoy, datos.incluirPagados === true, leerCatalogo_()) };
}

function accionPresupuesto_(usuario, datos) {
  var mes = mesValido_(datos.mes);
  var p = leerPresupuestoDelMes_(mes);
  if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  anotarConceptosEnFilas_(p.filas);
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
  return { mes: mes, personas: gastoPorPersona(leerTodosLosConsumos_(), mes, leerCatalogo_()) };
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
    medios: mediosDesde(leerCatalogo_()),
    ciclos: ciclosDesde(leerCatalogo_()),
    tarjetas: tarjetasActivas(leerCatalogo_()),
    iconos: iconosConNombres(leerIconos_(), conf.conceptos)
  };
}

// ---------------------------------------------------------------------------
// Acciones de escritura
// ---------------------------------------------------------------------------

function buscarMedio_(id) {
  var medios = mediosDesde(leerCatalogo_());
  for (var i = 0; i < medios.length; i++) if (medios[i].id === id) return medios[i];
  return null;
}

function leerHojaConEncabezado_(hoja) {
  var valores = hoja.getDataRange().getValues();
  var idxEnc = buscarFilaEncabezado(valores, 'responsable');
  if (idxEnc === -1) throw errorApp_('error_interno', 'La hoja "' + hoja.getName() + '" no tiene el formato esperado.');
  var cols = mapearColumnas(valores[idxEnc]);
  return { valores: valores, idxEnc: idxEnc, cols: cols };
}

/**
 * Nombre del responsable del gasto. Si la app no manda uno, es quien inició sesión.
 * Si manda uno, tiene que ser el nombre de alguien de USUARIOS (se compara sin tildes
 * ni mayúsculas) y se devuelve tal como está escrito en USUARIOS.
 */
function resolverResponsable_(usuario, nombre) {
  if (nombre === undefined || nombre === null || String(nombre).trim() === '') return usuario.nombre;
  var buscado = normalizar(nombre);
  var usuarios = leerUsuarios_();
  var correos = Object.keys(usuarios);
  for (var i = 0; i < correos.length; i++) {
    if (normalizar(usuarios[correos[i]].nombre) === buscado) return usuarios[correos[i]].nombre;
  }
  throw errorApp_('datos_invalidos', 'Ese responsable no está en la lista de usuarios.');
}

/** Resuelve el titular del catálogo contra las personas configuradas en el proyecto. */
/** Nombre de USUARIOS cuyo primer nombre es el del saludo del correo ("Hola PersonaB,"), o '' si no es de ellos. */
function usuarioDelSaludo_(cuerpo) {
  var nombre = normalizar(primerNombreDeSaludo(cuerpo));
  if (!nombre) return '';
  var usuarios = leerUsuarios_();
  var correos = Object.keys(usuarios);
  for (var i = 0; i < correos.length; i++) {
    if (normalizar(usuarios[correos[i]].nombre).split(' ')[0] === nombre) return usuarios[correos[i]].nombre;
  }
  return '';
}

/** Usuario cuyo correo está en el "Para" del aviso (sirve para los avisos reenviados desde otro Gmail). */
function usuarioDelDestinatario_(mensaje) {
  var para = '';
  try { para = String((mensaje.getTo && mensaje.getTo()) || '').toLowerCase(); } catch (err) { return ''; }
  if (!para) return '';
  var usuarios = leerUsuarios_();
  var lector = '';
  try { lector = correoDelLector_(); } catch (err) { lector = ''; }
  var hallados = Object.keys(usuarios).filter(function (correo) { return correo !== lector && para.indexOf(correo) !== -1; });
  return hallados.length === 1 ? usuarios[hallados[0]].nombre : '';
}

function nombreUsuarioDeTitular_(titular) {
  if (!titular) return '';
  var usuarios = leerUsuarios_();
  var correos = Object.keys(usuarios);
  for (var i = 0; i < correos.length; i++) {
    var n = normalizar(usuarios[correos[i]].nombre);
    if (n === normalizar(titular) || n.split(' ')[0] === normalizar(titular).split(' ')[0]) return usuarios[correos[i]].nombre;
  }
  return String(titular);
}

/** Acción 'registrar': valida el responsable, guarda el gasto y avisa si es un gasto grande. */
function accionRegistrar_(usuario, datos) {
  var responsable = resolverResponsable_(usuario, datos.responsable);
  var r = registrarGasto_(datos, responsable);
  if (r.guardado) { avisarGastoGrande_(r.gasto); avisarSobrante_(r.gasto); }
  delete r.gasto;
  return r;
}

/**
 * Origen del gasto ya validado y en su forma canónica: '' (fondo común), 'P:<nombre completo
 * de alguien de USUARIOS>' o 'A:<línea de ahorros del presupuesto del mes actual, como está en la hoja>'.
 */
function resolverOrigen_(origen) {
  if (origen === undefined || origen === null) return '';
  if (typeof origen !== 'string' || origen.length > 120) throw errorApp_('datos_invalidos', 'El origen no es válido.');
  var o = partesOrigen(origen);
  if (!o.tipo) return '';
  var buscado = normalizar(o.nombre);
  if (o.tipo === 'P') {
    var usuarios = leerUsuarios_();
    var correos = Object.keys(usuarios);
    for (var i = 0; i < correos.length; i++) if (normalizar(usuarios[correos[i]].nombre) === buscado) return 'P:' + usuarios[correos[i]].nombre;
    for (var j = 0; j < correos.length; j++) {
      if (normalizar(usuarios[correos[j]].nombre).split(' ')[0] === buscado) return 'P:' + usuarios[correos[j]].nombre;
    }
    throw errorApp_('datos_invalidos', 'Esa persona no está en la lista.');
  }
  if (o.tipo === 'A') {
    var p = null;
    try { p = leerPresupuestoDelMes_(hoyServidor_().slice(0, 7)); } catch (err) { p = null; }
    var filas = p ? p.filas : [];
    for (var k = 0; k < filas.length; k++) {
      if (filas[k].seccion === 'ahorros' && normalizar(filas[k].concepto) === buscado) return 'A:' + filas[k].concepto;
    }
    throw errorApp_('datos_invalidos', 'Ese ahorro no está en el presupuesto.');
  }
  throw errorApp_('datos_invalidos', 'El origen no es válido.');
}

/**
 * La tarjeta del catálogo que pide la app (datos.tarjeta), o null si no pidió ninguna.
 * Debe estar activa y su medio ser el mismo `idMedio`; si no, error en español sencillo.
 */
function tarjetaPedida_(idPedido, idMedio, catalogo) {
  if (idPedido === undefined || idPedido === null || idPedido === '') return null;
  var t = buscarTarjetaCatalogo(catalogo, String(idPedido));
  if (!t || t.activa === false) throw errorApp_('datos_invalidos', 'Esa tarjeta no está activa en el catálogo.');
  if (t.medio !== idMedio) throw errorApp_('datos_invalidos', 'Esa tarjeta no corresponde al medio de pago.');
  return t;
}

/**
 * Cuerpo común de 'registrar' y 'confirmarPendiente': valida y escribe UN gasto a
 * nombre de `responsable`. Devuelve lo mismo que la acción 'registrar' más, cuando se
 * guardó, `gasto` = {responsable, monto, descripcion, concepto, medio, fecha} para los avisos.
 */
function registrarGasto_(datos, responsable) {
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

  // Compra en cuotas (motor 1.11.0): una fila por cuota, cada una con el pago en su mes.
  var nCuotas = datos.cuotas === undefined || datos.cuotas === null || datos.cuotas === '' ? 1 : Number(datos.cuotas);
  if (nCuotas !== Math.floor(nCuotas) || nCuotas < 1 || nCuotas > MAXIMO_CUOTAS) {
    throw errorApp_('datos_invalidos', 'Las cuotas deben ser de 2 a ' + MAXIMO_CUOTAS + '.');
  }
  var montos = montosDeCuotas(monto, nCuotas, nCuotas > 1 ? datos.montoCuota : null);
  if (!montos) throw errorApp_('datos_invalidos', 'La cuota no cuadra con el total de la compra.');
  if (nCuotas > 1 && idCliente.length > 60) throw errorApp_('datos_invalidos', 'Falta el identificador del registro.');

  var nombreHoja = medio.hoja;
  if (nCuotas > 1 && nombreHoja === HOJA_HORMIGA) throw errorApp_('datos_invalidos', 'Las cuotas son solo para tarjetas de crédito.');
  var catalogo = leerCatalogo_();
  var idCiclo = idTarjeta(nombreHoja, responsable, catalogo);
  // Tarjeta explícita (motor 1.6): quien gastó puede no ser el titular (tarjeta prestada).
  var tarjetaPedida = tarjetaPedida_(datos.tarjeta, medio.id, catalogo);
  var sufijoTarjeta = '';
  if (tarjetaPedida) {
    nombreHoja = tarjetaPedida.hoja;
    if (tarjetaPedida.id !== idCiclo) sufijoTarjeta = tarjetaPedida.id; // solo se anota si no es la de la regla
    idCiclo = tarjetaPedida.id;
  }
  var ciclo = calcularCiclo(idCiclo, fecha, catalogo);
  if (nCuotas > 1 && !ciclo.pago) throw errorApp_('datos_invalidos', 'Esa tarjeta no tiene fechas de pago: no se puede repartir en cuotas.');
  // De dónde sale el gasto (motor 1.7): '' = fondo común, 'P:<persona>' o 'A:<ahorro>'.
  var origen = resolverOrigen_(datos.origen);
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
    if (sufijoTarjeta && cols.idForm === -1) {
      throw errorApp_('datos_invalidos', 'Esa hoja no permite elegir la tarjeta; agrega la columna _id_form.');
    }
    if (origen && cols.idForm === -1) {
      throw errorApp_('datos_invalidos', 'Esa hoja no permite anotar de dónde sale el gasto; agrega la columna _id_form.');
    }

    var ultimaConDatos = idxEnc; // 0-based
    var coincidencia = null;
    var parecidos = [];
    // Identificador de cada cuota: la primera es 'APP:<id>' y las demás 'APP:<id>-c2', 'APP:<id>-c3'…
    var idsCuota = [];
    var yaEstan = {};
    for (var q = 0; q < nCuotas; q++) { idsCuota.push(q === 0 ? idCliente : idCliente + '-c' + (q + 1)); yaEstan['APP:' + idsCuota[q]] = 0; }
    for (var r = idxEnc + 1; r < valores.length; r++) {
      var f = valores[r];
      var montoFila = parsearMonto(f[cols.monto]);
      var descFila = f[cols.descripcion];
      var tieneDesc = descFila !== '' && descFila !== null && descFila !== undefined;
      if (montoFila !== null || tieneDesc) ultimaConDatos = r;

      if (cols.idForm !== -1) {
        // Ya se guardó antes (reintento de la cola): no se escribe de nuevo.
        // Se compara solo 'APP:<idCliente>' (lo que va antes del '|'), tenga o no sufijo de tarjeta.
        var baseFila = partesIdForm(f[cols.idForm]).base;
        if (yaEstan[baseFila] === 0) { yaEstan[baseFila] = r + 1; continue; }
      }
      if (!coincidencia && montoFila !== null &&
          firmaGasto({ fecha: f[cols.fecha], monto: montoFila, descripcion: descFila }) === firma) {
        coincidencia = { fecha: fecha, descripcion: String(descFila).trim(), monto: montoFila, hoja: nombreHoja };
      }
      // Motor 1.9.9: al confirmar un consumo leído del correo, se juntan los gastos con el MISMO monto y fecha
      // ±1 día aunque la descripción sea otra ("Oxxo" a mano vs "OXXO MORE"); se decide después del recorrido.
      if (datos.buscarParecidos === true && montoFila !== null && Math.round(montoFila * 100) === Math.round(monto * 100)) {
        var fechaFila = parsearFecha(f[cols.fecha]);
        if (fechaFila && Math.abs(diasEntre_(fechaISO(fechaFila), fecha)) <= 1) {
          parecidos.push({ fecha: fechaISO(fechaFila), descripcion: String(descFila || '').trim(), monto: montoFila, hoja: nombreHoja });
        }
      }
    }

    var faltan = idsCuota.filter(function (id) { return !yaEstan['APP:' + id]; });
    if (!faltan.length) return { guardado: false, duplicadoId: true, hoja: nombreHoja, fila: yaEstan[idForm] };
    var reintento = faltan.length < idsCuota.length; // se cortó a medias: solo faltan algunas cuotas

    // Solo avisa si hay MÁS parecidos que los que ya vinieron de otros correos confirmados: así dos consumos
    // reales del mismo monto el mismo día no molestan, pero uno anotado a mano sí se detecta.
    if (!coincidencia && parecidos.length > (Number(datos.parecidosDelCorreo) || 0)) coincidencia = parecidos[parecidos.length - 1];
    if (coincidencia && datos.confirmarDuplicado !== true && !reintento) {
      return { guardado: false, posibleDuplicado: true, coincidencia: coincidencia };
    }

    var anchoFila = 0;
    Object.keys(cols).forEach(function (k) { if (cols[k] + 1 > anchoFila) anchoFila = cols[k] + 1; });
    var notaCuotas = nCuotas > 1 && !nota ? 'Compra de ' + formatoSoles_(monto) + ' en ' + nCuotas + ' cuotas' : nota;
    var primeraFila = 0;
    for (var k = 0; k < nCuotas; k++) {
      if (yaEstan['APP:' + idsCuota[k]]) continue;
      var cicloK = k === 0 ? ciclo : calcularCiclo(idCiclo, fecha, catalogo, k);
      var nueva = construirFila(cols, anchoFila, {
        idCliente: idsCuota[k], monto: montos[k], medio: medio.id, concepto: concepto,
        descripcion: descripcionDeCuota(descripcion, k + 1, nCuotas), nota: notaCuotas, fecha: fecha,
        tarjetaExplicita: sufijoTarjeta, origen: origen
      }, responsable, nombreHoja, cicloK, catalogo);
      // El formulario B&P exige que _HUELLA_FORM sea un SHA-256 en hexadecimal (64 caracteres):
      // si no, su revisión rechaza la hoja entera. Se cifra la firma del gasto.
      if (cols.huella !== -1 && nueva[cols.huella]) nueva[cols.huella] = hashHex_(String(nueva[cols.huella]));

      // Fechas a la medianoche en la zona del libro (si no, la hoja muestra un día menos).
      [cols.fecha, cols.fechaPago, cols.fechaVencimiento].forEach(function (col) {
        if (col !== -1 && nueva[col] instanceof Object && nueva[col].getTime) nueva[col] = fechaParaHoja_(nueva[col]);
      });

      var filaDestino = ultimaConDatos + 2; // 1-based, la siguiente a la última con datos
      escribirFila_(hoja, filaDestino, nueva, cols, ultimaConDatos > idxEnc ? ultimaConDatos + 1 : 0);
      ultimaConDatos = filaDestino - 1;
      if (!primeraFila) primeraFila = filaDestino;
    }
    SpreadsheetApp.flush();
    var resultado = {
      guardado: true, hoja: nombreHoja, fila: primeraFila, duplicadoId: false,
      gasto: { responsable: responsable, monto: montos[0], descripcion: descripcion, concepto: concepto, medio: medio.etiqueta, fecha: fecha,
        origen: origen, tarjeta: nombreHoja !== HOJA_HORMIGA, pago: ciclo && ciclo.pago ? ciclo.pago : '' }
    };
    if (nCuotas > 1) { resultado.cuotas = nCuotas; resultado.montoCuota = montos[0]; resultado.total = monto; }
    if (tarjetaPedida) { resultado.tarjeta = idCiclo; resultado.prestada = esPrestada(idCiclo, responsable, catalogo); }
    if (origen) resultado.origen = origen;
    return resultado;
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

/**
 * Pasa un gasto a otra hoja porque cambió el medio de pago (motor 1.9). Primero lo anota en la hoja
 * nueva (con los cambios pedidos y el mismo Id si era de la app) y recién después lo quita de la
 * anterior, así nunca se pierde. Devuelve {actualizado, movido, hoja, fila}.
 */
function moverGastoDeHoja_(datos, cambios, nombreHoja, medio, idTarjeta) {
  var hoja = obtenerHoja_(nombreHoja);
  var h = leerHojaConEncabezado_(hoja);
  var cols = h.cols;
  if (filaNoCoincide_(h.valores, cols, h.idxEnc, datos.fila, datos.verificar)) {
    throw errorApp_('datos_invalidos', 'Ese gasto cambió en el Sheets. Actualiza y vuelve a intentar.');
  }
  var f = h.valores[datos.fila - 1];
  var partes = partesIdForm(cols.idForm === -1 ? '' : f[cols.idForm]);
  var idCliente = partes.base.indexOf('APP:') === 0 ? partes.base.slice(4) : Utilities.getUuid();
  var origen = cambios.origen !== undefined && cambios.origen !== null ? cambios.origen : (partes.origen || '');
  var responsable = String(f[cols.responsable] || '').trim();
  var r = registrarGasto_({
    idCliente: idCliente,
    monto: cambios.monto !== undefined ? cambios.monto : parsearMonto(f[cols.monto]),
    medio: medio.id,
    concepto: cambios.concepto !== undefined ? cambios.concepto : f[cols.concepto],
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : String(f[cols.descripcion] || '').trim(),
    nota: cambios.nota !== undefined ? cambios.nota : (cols.nota !== -1 ? String(f[cols.nota] || '') : ''),
    fecha: cambios.fecha !== undefined ? cambios.fecha : fechaISO(parsearFecha(f[cols.fecha])),
    tarjeta: idTarjeta || undefined, origen: origen, confirmarDuplicado: true
  }, responsable);
  if (!r.guardado && !r.duplicadoId) throw errorApp_('error_interno', 'No se pudo pasar el gasto a la otra hoja.');
  // Ya está en la hoja nueva: se quita de la anterior (se busca de nuevo, por si se movieron filas).
  var candado = tomarCandado_();
  try {
    var v = leerHojaConEncabezado_(hoja);
    var fila = filaNoCoincide_(v.valores, v.cols, v.idxEnc, datos.fila, datos.verificar) ? -1 : datos.fila;
    if (fila === -1 && partes.base.indexOf('APP:') === 0) {
      for (var k = v.valores.length - 1; k > v.idxEnc; k--) {
        if (partesIdForm(v.valores[k][v.cols.idForm]).base === partes.base) { fila = k + 1; break; }
      }
    }
    if (fila !== -1) hoja.deleteRow(fila);
    SpreadsheetApp.flush();
  } finally {
    candado.releaseLock();
  }
  return { actualizado: true, movido: true, hoja: r.hoja, fila: r.fila };
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
  // Tarjeta nueva (motor 1.6): puede venir en datos.tarjeta o dentro de cambios.
  var idTarjetaNueva = datos.tarjeta !== undefined ? datos.tarjeta : cambios.tarjeta;
  // Medio de pago nuevo (motor 1.9): si va a otra hoja (de tarjeta a efectivo, de una tarjeta a otra),
  // el gasto se anota en la hoja nueva y se quita de la anterior.
  var medioNuevo = null;
  if (cambios.medio !== undefined && cambios.medio !== null && cambios.medio !== '') {
    medioNuevo = buscarMedio_(String(cambios.medio));
    if (!medioNuevo) throw errorApp_('datos_invalidos', 'El medio de pago no es válido.');
    var tarjetaDestino = tarjetaPedida_(idTarjetaNueva, medioNuevo.id, leerCatalogo_());
    var hojaDestino = tarjetaDestino ? tarjetaDestino.hoja : medioNuevo.hoja;
    if (normalizar(hojaDestino) !== normalizar(nombreHoja)) {
      return moverGastoDeHoja_(datos, cambios, nombreHoja, medioNuevo, tarjetaDestino ? tarjetaDestino.id : '');
    }
    if (medioNuevo.tipo === 'directo') nuevo.medio = medioNuevo;
    else medioNuevo = null; // misma hoja de tarjeta: lo decide la tarjeta (si viene)
  }
  var cambiaTarjeta = idTarjetaNueva !== undefined && idTarjetaNueva !== null && idTarjetaNueva !== '';
  // Origen nuevo (motor 1.7): en datos.origen o en cambios.origen; '' lo devuelve al fondo común.
  var origenPedido = datos.origen !== undefined ? datos.origen : cambios.origen;
  var cambiaOrigen = origenPedido !== undefined && origenPedido !== null;
  var origenNuevo = cambiaOrigen ? resolverOrigen_(origenPedido) : '';
  if (!Object.keys(nuevo).length && !cambiaTarjeta && !cambiaOrigen) throw errorApp_('datos_invalidos', 'No hay cambios para guardar.');
  if (cambiaTarjeta && medioNuevo && medioNuevo.tipo === 'directo') cambiaTarjeta = false;
  var catalogo = leerCatalogo_();
  var tarjetaNueva = null;
  if (cambiaTarjeta) {
    tarjetaNueva = buscarTarjetaCatalogo(catalogo, String(idTarjetaNueva));
    if (!tarjetaNueva || tarjetaNueva.activa === false) throw errorApp_('datos_invalidos', 'Esa tarjeta no está activa en el catálogo.');
    if (normalizar(tarjetaNueva.hoja) !== normalizar(nombreHoja)) {
      throw errorApp_('datos_invalidos', 'Para pasarlo a otra tarjeta, bórralo y regístralo de nuevo.');
    }
  }

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
    if (nuevo.medio && cols.medio !== -1) escribir(cols.medio, nuevo.medio.etiqueta);
    // Tarjeta de la fila: la nueva si la cambian; si no, la que ya tenía (con su sufijo, si lo hay).
    var idFormActual = cols.idForm === -1 ? '' : f[cols.idForm];
    var idCiclo = tarjetaDeFila(nombreHoja, f[cols.responsable], idFormActual, catalogo).tarjeta;
    // Los sufijos de _id_form (tarjeta y origen) se rearman juntos: cambiar uno conserva el otro.
    var partes = partesIdForm(idFormActual);
    var sufijo = partes.tarjeta;
    if (tarjetaNueva) {
      var idRegla = idTarjeta(nombreHoja, f[cols.responsable], catalogo);
      sufijo = tarjetaNueva.id !== idRegla ? tarjetaNueva.id : '';
      idCiclo = tarjetaNueva.id;
    }
    var origenFinal = cambiaOrigen ? origenNuevo : partes.origen;
    if (sufijo !== partes.tarjeta || origenFinal !== partes.origen) {
      if (cols.idForm === -1 || formulas[cols.idForm]) {
        if (sufijo && sufijo !== partes.tarjeta) {
          throw errorApp_('datos_invalidos', 'Esa hoja no permite elegir la tarjeta; agrega la columna _id_form.');
        }
        if (origenFinal && origenFinal !== partes.origen) {
          throw errorApp_('datos_invalidos', 'Esa hoja no permite anotar de dónde sale el gasto; agrega la columna _id_form.');
        }
      } else {
        escribir(cols.idForm, armarIdForm(partes.base, sufijo, origenFinal));
      }
    }
    if (nuevo.fecha !== undefined) {
      escribir(cols.fecha, fechaParaHoja_(nuevo.fecha));
      escribir(cols.mes, nombreMes(nuevo.fecha));
    }
    if (nuevo.fecha !== undefined || tarjetaNueva) {
      var fechaCiclo = nuevo.fecha !== undefined ? nuevo.fecha : fechaISO(parsearFecha(f[cols.fecha]));
      var cuotaFila = numeroDeCuota(nuevo.descripcion !== undefined ? nuevo.descripcion : f[cols.descripcion]);
      var ciclo = idCiclo === 'HORMIGA' ? { pago: '', vence: '' } : calcularCiclo(idCiclo, fechaCiclo, catalogo, cuotaFila ? cuotaFila.k - 1 : 0);
      if (ciclo.pago && ciclo.vence) {
        escribir(cols.fechaPago, fechaParaHoja_(ciclo.pago));
        escribir(cols.fechaVencimiento, fechaParaHoja_(ciclo.vence));
      } else if (tarjetaNueva) {
        // La tarjeta nueva no tiene ciclo (como Ripley): las fechas quedan vacías.
        escribir(cols.fechaPago, '');
        escribir(cols.fechaVencimiento, '');
      }
    }
    // La huella (para detectar duplicados) se rehace con los datos finales.
    if (cols.huella !== -1 && String(f[cols.huella] || '').trim()) {
      escribir(cols.huella, hashHex_(firmaGasto({
        fecha: nuevo.fecha !== undefined ? nuevo.fecha : f[cols.fecha],
        monto: nuevo.monto !== undefined ? nuevo.monto : parsearMonto(f[cols.monto]),
        descripcion: nuevo.descripcion !== undefined ? nuevo.descripcion : f[cols.descripcion]
      })));
    }
    SpreadsheetApp.flush();
    var salida = { actualizado: true, hoja: nombreHoja, fila: fila };
    if (tarjetaNueva) { salida.tarjeta = idCiclo; salida.prestada = esPrestada(idCiclo, f[cols.responsable], catalogo); }
    if (cambiaOrigen) salida.origen = origenFinal;
    return salida;
  } finally {
    candado.releaseLock();
  }
}

/** Borra la fila de un gasto (queda en el historial de versiones del Sheets). */
/**
 * Pasa a cuotas un gasto con tarjeta ya anotado entero (motor 1.12.0). La fila queda como cuota 1 (con su
 * mismo mes de pago) y se agregan al final las cuotas 2..N, cada una un mes después. Primero se agregan las
 * nuevas y al último se cambia la original: si se corta a medias, el reintento completa sin duplicar.
 */
function accionPasarACuotas_(usuario, datos) {
  var idCliente = validarIdCliente_(datos.idCliente);
  if (idCliente.length > 60) throw errorApp_('datos_invalidos', 'Falta el identificador del registro.');
  var nombreHoja = hojaConsumosCanonica_(datos.hoja);
  if (!nombreHoja || nombreHoja === HOJA_HORMIGA) throw errorApp_('datos_invalidos', 'Las cuotas son solo para tarjetas de crédito.');
  var n = Number(datos.cuotas);
  if (n !== Math.floor(n) || n < 2 || n > MAXIMO_CUOTAS) throw errorApp_('datos_invalidos', 'Las cuotas deben ser de 2 a ' + MAXIMO_CUOTAS + '.');
  var hoja = obtenerHoja_(nombreHoja);
  var candado = tomarCandado_();
  try {
    var h = leerHojaConEncabezado_(hoja);
    var valores = h.valores, cols = h.cols, idxEnc = h.idxEnc;
    if (cols.monto === -1 || cols.descripcion === -1 || cols.fecha === -1 || cols.idForm === -1) {
      throw errorApp_('error_interno', 'La hoja "' + nombreHoja + '" no tiene el formato esperado.');
    }
    var fila = datos.fila;
    if (!Number.isInteger(fila) || fila <= idxEnc + 1 || fila > valores.length) throw errorApp_('datos_invalidos', 'Ese gasto cambió en el Sheets. Actualiza y vuelve a intentar.');
    var f = valores[fila - 1];

    // Cuotas 2..N que ya se agregaron en un intento anterior.
    var yaEstan = {};
    for (var q = 2; q <= n; q++) yaEstan['APP:' + idCliente + '-c' + q] = 0;
    var ultimaConDatos = idxEnc;
    for (var r = idxEnc + 1; r < valores.length; r++) {
      var fr = valores[r];
      var tieneDesc = fr[cols.descripcion] !== '' && fr[cols.descripcion] !== null && fr[cols.descripcion] !== undefined;
      if (parsearMonto(fr[cols.monto]) !== null || tieneDesc) ultimaConDatos = r;
      var b = partesIdForm(fr[cols.idForm]).base;
      if (yaEstan[b] === 0) yaEstan[b] = r + 1;
    }
    var faltan = Object.keys(yaEstan).filter(function (k) { return !yaEstan[k]; });
    var cuotaFila = numeroDeCuota(f[cols.descripcion]);
    if (!faltan.length && cuotaFila && cuotaFila.n === n) return { convertido: false, duplicadoId: true, hoja: nombreHoja, cuotas: n };

    if (filaNoCoincide_(valores, cols, idxEnc, fila, datos.verificar)) throw errorApp_('datos_invalidos', 'Ese gasto cambió en el Sheets. Actualiza y vuelve a intentar.');
    if (cuotaFila) throw errorApp_('datos_invalidos', 'Ese gasto ya está en cuotas.');
    if (cols.estado !== -1 && estaPagado_(f[cols.estado])) throw errorApp_('datos_invalidos', 'Ese gasto ya está pagado: no se puede pasar a cuotas.');
    var total = parsearMonto(f[cols.monto]);
    var montos = montosDeCuotas(total, n, datos.montoCuota);
    if (!montos) throw errorApp_('datos_invalidos', 'La cuota no cuadra con el total de la compra.');
    var fechaD = parsearFecha(f[cols.fecha]);
    if (!fechaD) throw errorApp_('datos_invalidos', 'Ese gasto no tiene una fecha válida.');
    var fecha = fechaISO(fechaD);
    var responsable = cols.responsable !== -1 ? String(f[cols.responsable] || '') : '';
    var partes = partesIdForm(f[cols.idForm]);
    var catalogo = leerCatalogo_();
    var idCiclo = partes.tarjeta || idTarjeta(nombreHoja, responsable, catalogo);
    var c0 = calcularCiclo(idCiclo, fecha, catalogo, 0);
    if (!c0.pago) throw errorApp_('datos_invalidos', 'Esa tarjeta no tiene fechas de pago: no se puede repartir en cuotas.');
    // La cuota 1 se queda con el mes de pago que ya tiene la fila (aunque lo hayan cambiado a mano).
    var pagoFila = cols.fechaPago !== -1 ? parsearFecha(f[cols.fechaPago]) : null;
    var pagoCalc = parsearFecha(c0.pago);
    var corrimiento = pagoFila ? Math.max(0, (pagoFila.getFullYear() * 12 + pagoFila.getMonth()) - (pagoCalc.getFullYear() * 12 + pagoCalc.getMonth())) : 0;
    var desc = String(f[cols.descripcion] || '').trim();
    var notaFila = cols.nota !== -1 ? String(f[cols.nota] || '').trim() : '';
    var nota = notaFila || ('Compra de ' + formatoSoles_(total) + ' en ' + n + ' cuotas');
    var concepto = cols.concepto !== -1 ? String(f[cols.concepto] || '') : '';

    var anchoFila = 0;
    Object.keys(cols).forEach(function (k) { if (cols[k] + 1 > anchoFila) anchoFila = cols[k] + 1; });
    for (var k = 1; k < n; k++) {
      var idK = idCliente + '-c' + (k + 1);
      if (yaEstan['APP:' + idK]) continue;
      var nueva = construirFila(cols, anchoFila, {
        idCliente: idK, monto: montos[k], concepto: concepto, descripcion: descripcionDeCuota(desc, k + 1, n),
        nota: nota, fecha: fecha, tarjetaExplicita: partes.tarjeta, origen: partes.origen
      }, responsable, nombreHoja, calcularCiclo(idCiclo, fecha, catalogo, k + corrimiento), catalogo);
      if (cols.huella !== -1 && nueva[cols.huella]) nueva[cols.huella] = hashHex_(String(nueva[cols.huella]));
      [cols.fecha, cols.fechaPago, cols.fechaVencimiento].forEach(function (col) {
        if (col !== -1 && nueva[col] instanceof Object && nueva[col].getTime) nueva[col] = fechaParaHoja_(nueva[col]);
      });
      var filaDestino = ultimaConDatos + 2;
      escribirFila_(hoja, filaDestino, nueva, cols, ultimaConDatos > idxEnc ? ultimaConDatos + 1 : 0);
      ultimaConDatos = filaDestino - 1;
    }

    // Al último, la fila original pasa a ser la cuota 1.
    var formulas = hoja.getRange(fila, 1, 1, f.length).getFormulas()[0];
    var poner = function (col, valor) { if (col >= 0 && col < f.length && !formulas[col]) hoja.getRange(fila, col + 1).setValue(valor); };
    var descUno = descripcionDeCuota(desc, 1, n);
    poner(cols.monto, montos[0]);
    poner(cols.descripcion, neutralizarTexto(descUno));
    if (!notaFila) poner(cols.nota, neutralizarTexto(nota));
    if (cols.huella !== -1 && String(f[cols.huella] || '').trim()) {
      poner(cols.huella, hashHex_(firmaGasto({ fecha: fecha, monto: montos[0], descripcion: descUno })));
    }
    SpreadsheetApp.flush();
    return { convertido: true, hoja: nombreHoja, cuotas: n, montoCuota: montos[0], total: total };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Gastos fijos automáticos (motor 1.13.0)
// ---------------------------------------------------------------------------

function leerFijos_() { return fijosDesde(propiedad_(PROPIEDAD_FIJOS)); }
function guardarFijos_(config) { PropertiesService.getScriptProperties().setProperty(PROPIEDAD_FIJOS, JSON.stringify(config)); }
function listaFijos_(config) {
  return Object.keys(config).map(function (k) { return config[k]; })
    .sort(function (a, b) { return (a.dia - b.dia) || (a.concepto < b.concepto ? -1 : 1); });
}

function accionFijosAuto_(usuario) {
  return { fijos: listaFijos_(leerFijos_()) };
}

/** {concepto, dia (1-31; 0 = quitar), auto}. La línea debe ser un gasto del presupuesto (no una tarjeta). */
function accionGuardarFijoAuto_(usuario, datos) {
  var concepto = String(datos.concepto || '').replace(/\s+/g, ' ').trim();
  if (!concepto || concepto.length > 80) throw errorApp_('datos_invalidos', 'Falta la línea del presupuesto.');
  var dia = Math.floor(Number(datos.dia));
  if (!(dia >= 0 && dia <= 31)) throw errorApp_('datos_invalidos', 'El día debe ser del 1 al 31.');
  var config = leerFijos_();
  var clave = claveLinea(concepto);
  if (dia === 0) {
    delete config[clave];
  } else {
    var p = leerPresupuestoDelMes_(mesDelCiclo(hoyServidor_()));
    var linea = null;
    (p ? p.filas : []).forEach(function (f) { if (f.seccion === 'gastos' && !f.esTarjeta && claveLinea(f.concepto) === clave) linea = f; });
    if (!linea) throw errorApp_('datos_invalidos', 'Esa línea no es un gasto fijo del presupuesto.');
    if (!config[clave] && Object.keys(config).length >= MAXIMO_FIJOS) throw errorApp_('datos_invalidos', 'Ya hay demasiados gastos fijos con día.');
    config[clave] = { concepto: linea.concepto, dia: dia, auto: datos.auto === true };
  }
  guardarFijos_(config);
  return { fijos: listaFijos_(config) };
}

/**
 * Corre cada mañana con las alertas: marca pagados los fijos de débito automático cuyo día llegó (una sola vez
 * por línea y mes: si alguien lo desmarca, no se vuelve a marcar) y manda un correo con los demás que vencen hoy.
 */
function revisarFijos_(hoy, conCorreo) {
  var config = leerFijos_();
  var vencidos = fijosVencidos(config, hoy);
  if (!vencidos.length) return { marcados: 0, motivo: 'nada para hoy' };
  var hechos = {};
  try { hechos = JSON.parse(propiedad_(PROPIEDAD_FIJOS_HECHOS) || '{}') || {}; } catch (err) { hechos = {}; }
  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var marcados = [], paraCorreo = [];
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var display = rango.getDisplayValues(), valores = rango.getValues(), notas = rango.getNotes();
    var porMes = {};
    vencidos.forEach(function (v) {
      if (!porMes.hasOwnProperty(v.mes)) porMes[v.mes] = leerPresupuesto(display, valores, v.mes, notas);
      var p = porMes[v.mes];
      if (!p) return;
      var linea = null;
      p.filas.forEach(function (f) { if (f.seccion === 'gastos' && !f.esTarjeta && claveLinea(f.concepto) === v.clave) linea = f; });
      if (!linea || linea.pagado) return;
      var marca = v.clave + '|' + v.mes;
      if (v.auto) {
        if (hechos['auto|' + marca]) return;
        var celda = hoja.getRange(linea.fila, p.columna);
        var texto = 'Pagado el ' + v.fecha.slice(8, 10) + '/' + v.fecha.slice(5, 7) + '/' + v.fecha.slice(0, 4) + ' · automático';
        celda.setNote(ponerNotaPagado(celda.getNote(), texto));
        hechos['auto|' + marca] = hoy;
        marcados.push(linea.concepto);
      } else if (v.fecha === hoy && !hechos['aviso|' + marca]) {
        hechos['aviso|' + marca] = hoy;
        paraCorreo.push({ concepto: linea.concepto, monto: linea.monto });
      }
    });
    if (marcados.length) SpreadsheetApp.flush();
  } finally {
    candado.releaseLock();
  }
  // Se guardan solo los últimos 4 meses.
  var limite = sumarMesesClave_(hoy.slice(0, 7), -4);
  Object.keys(hechos).forEach(function (k) { if (k.slice(-7) < limite) delete hechos[k]; });
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_FIJOS_HECHOS, JSON.stringify(hechos));
  var salida = { marcados: marcados.length, porRecordar: paraCorreo.length };
  if (paraCorreo.length && conCorreo) {
    try { salida.correo = enviarCorreoAUsuarios_(textoFijosDeHoy(paraCorreo), 'fijos').enviado; } catch (err) { salida.correo = false; }
  }
  return salida;
}

function sumarMesesClave_(clave, n) {
  var p = String(clave).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1);
  return fechaISO(d).slice(0, 7);
}

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
  // Motor 1.7: lo que ya se sacó de cada ahorro (gastos con origen 'A:<meta>') y lo que queda.
  var retiros = {};
  try { retiros = retirosPorMeta(leerTodosLosConsumos_(), mes); } catch (err) {
    console.warn('FinFamily ahorros: no se pudieron leer los retiros: ' + err);
  }
  r.metas.forEach(function (meta) {
    var x = retiros[normalizar(meta.concepto)];
    meta.retirado = x ? x.retirado : 0;
    meta.disponible = Math.round((meta.acumulado - meta.retirado) * 100) / 100;
  });
  return r;
}

// ---------------------------------------------------------------------------
// Bolsas (motor 1.7): fondo común, sobrante de cada persona y ahorros
// ---------------------------------------------------------------------------

/** Calcula las bolsas de un mes (ver calcularBolsas). Lanza datos_invalidos si el mes no está en el presupuesto. */
function bolsasDelMes_(mes, consumosOpcional) {
  var rango = obtenerHoja_(HOJA_PRESUPUESTO).getDataRange();
  var display = rango.getDisplayValues();
  var valores = rango.getValues();
  var acumulados = ahorrosAcumulados(display, valores, mes);
  if (!acumulados) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  var usuarios = leerUsuarios_();
  var nombres = Object.keys(usuarios).map(function (c) { return usuarios[c].nombre; });
  var b = calcularBolsas(saldosPorMes(display, valores), consumosOpcional || leerTodosLosConsumos_(), nombres,
    acumulados.metas, mes, hoyServidor_().slice(0, 7));
  if (!b) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  return b;
}

/** Acción 'bolsas': {mes?} → fondo común, sobrante de cada persona, ahorros y el detalle por mes. */
function accionBolsas_(usuario, datos) {
  return bolsasDelMes_(mesValido_(datos.mes));
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
  if (!leerAjustesAvisos_().vencimiento) {
    console.log('FinFamily avisos: los avisos de vencimiento están apagados en los ajustes.');
    return { enviado: false, avisos: 0, motivo: 'apagado' };
  }
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(20000)) {
    console.warn('FinFamily avisos: el script estaba ocupado; no se envió nada en esta pasada.');
    return { enviado: false, avisos: 0, motivo: 'ocupado' };
  }
  try {
    var hoy = hoyServidor_();
    var propiedades = PropertiesService.getScriptProperties();
    var yaAvisadas = avisosYaEnviados_(propiedades.getProperty(PROPIEDAD_AVISOS), hoy);
    var resumen = resumenTarjetas(leerTodosLosConsumos_(), hoy, false, leerCatalogo_());
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

// ---------------------------------------------------------------------------
// Motor 1.3 · Ajustes de avisos y datos de tarjetas (Propiedades del script)
// ---------------------------------------------------------------------------

function leerAjustesAvisos_() {
  return ajustesAvisosDesde(propiedad_(PROPIEDAD_AJUSTES_AVISOS));
}

/** Devuelve los ajustes de alertas (con los valores por defecto si nunca se guardaron). */
function accionAjustesAvisos_() {
  return { ajustes: leerAjustesAvisos_() };
}

/** Guarda los ajustes que manda la app (solo los campos que vienen) y devuelve cómo quedaron. */
function accionGuardarAjustesAvisos_(usuario, datos) {
  var r = validarAjustesAvisos(datos, leerAjustesAvisos_());
  if (r.error) throw errorApp_('datos_invalidos', r.error);
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_AJUSTES_AVISOS, JSON.stringify(r.ajustes));
  return { ajustes: r.ajustes };
}

function leerDatosTarjetas_() {
  return datosTarjetasDesde(propiedad_(PROPIEDAD_TARJETAS), leerCatalogo_());
}

/** Datos compartidos de las tarjetas: {tarjetas: {SIP: {digitos, red, nombre}, IBK_P: ..., ...}}. */
function accionDatosTarjetas_() {
  return { tarjetas: leerDatosTarjetas_() };
}

/** Guarda los datos de UNA tarjeta {id, digitos, red, nombre} y devuelve todas. */
function accionGuardarDatosTarjeta_(usuario, datos) {
  var r = validarDatosTarjeta(datos, leerCatalogo_());
  if (r.error) throw errorApp_('datos_invalidos', r.error);
  var todas = leerDatosTarjetas_();
  todas[r.tarjeta.id] = { digitos: r.tarjeta.digitos, red: r.tarjeta.red, nombre: r.tarjeta.nombre };
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_TARJETAS, JSON.stringify(todas));
  return { tarjetas: todas };
}

// ---------------------------------------------------------------------------
// Motor 1.3 · Correo a los usuarios (común a todas las alertas)
// ---------------------------------------------------------------------------

/** Correos válidos de USUARIOS. */
function destinatarios_() {
  return Object.keys(leerUsuarios_()).filter(function (c) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c); });
}

/**
 * Manda {asunto, cuerpo} a todos los usuarios con remitente 'FinFamily', revisando la cuota.
 * Devuelve {enviado, motivo}. Lanza si el envío mismo falla (quien llama decide si lo atrapa).
 */
function enviarCorreoAUsuarios_(texto, etiquetaLog) {
  var correos = destinatarios_();
  if (!correos.length) {
    console.error('FinFamily ' + etiquetaLog + ': no hay correos válidos en USUARIOS.');
    return { enviado: false, motivo: 'sin destinatarios' };
  }
  if (MailApp.getRemainingDailyQuota() < correos.length) {
    console.error('FinFamily ' + etiquetaLog + ': se agotó la cuota diaria de correos de Google.');
    return { enviado: false, motivo: 'sin cuota de correo' };
  }
  MailApp.sendEmail({ to: correos.join(','), subject: texto.asunto, body: texto.cuerpo, name: 'FinFamily' });
  return { enviado: true, destinatarios: correos.length };
}

/**
 * Aviso inmediato por un gasto grande (según el ajuste gastoGrande; 0 = apagado).
 * Nunca hace fallar el registro: si el correo falla, solo se anota en el registro.
 * gasto: {responsable, monto, descripcion, concepto, medio, fecha}.
 */
function avisarGastoGrande_(gasto) {
  try {
    var ajustes = leerAjustesAvisos_();
    if (!(ajustes.gastoGrande > 0) || !gasto || !(gasto.monto >= ajustes.gastoGrande)) return false;
    var r = enviarCorreoAUsuarios_(textoGastoGrande(gasto), 'gasto grande');
    return r.enviado;
  } catch (err) {
    console.warn('FinFamily gasto grande: no se pudo enviar el aviso: ' + err);
    return false;
  }
}

/**
 * Motor 1.9.5: si el gasto se anotó con el sobrante de una persona y no le alcanza, le avisa por correo
 * SOLO a ella (va con los avisos de presupuesto). Nunca hace fallar el registro.
 */
function avisarSobrante_(gasto) {
  try {
    if (!gasto || String(gasto.origen || '').indexOf('P:') !== 0) return false;
    if (!leerAjustesAvisos_().presupuesto) return false;
    var nombre = partesOrigen(gasto.origen).nombre;
    var a = alcanceSobrante(bolsasDelMes_(hoyServidor_().slice(0, 7)), nombre, gasto);
    if (!a || a.alcanza) return false;
    var usuarios = leerUsuarios_();
    var correo = Object.keys(usuarios).filter(function (c) {
      return normalizar(usuarios[c].nombre) === normalizar(a.nombre) && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c);
    })[0];
    if (!correo) return false;
    if (MailApp.getRemainingDailyQuota() < 1) { console.error('FinFamily sobrante: sin cuota de correo.'); return false; }
    var texto = textoSobranteNoAlcanza({ nombre: a.nombre, de: a.de, falta: a.falta, monto: gasto.monto, descripcion: gasto.descripcion });
    MailApp.sendEmail({ to: correo, subject: texto.asunto, body: texto.cuerpo, name: 'FinFamily' });
    return true;
  } catch (err) {
    console.warn('FinFamily sobrante: no se pudo revisar o avisar: ' + err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Motor 1.3 · Lector de Gmail y bandeja "Por confirmar"
// ---------------------------------------------------------------------------

/** La hoja "Por confirmar"; la crea con sus encabezados si crear = true y no existe. Null si no existe y no se crea. */
function hojaPorConfirmar_(crear) {
  var libro = abrirLibro_();
  var hoja = libro.getSheetByName(HOJA_POR_CONFIRMAR);
  if (hoja || !crear) return hoja || null;
  hoja = libro.insertSheet(HOJA_POR_CONFIRMAR);
  hoja.getRange(1, 1, 1, COLUMNAS_POR_CONFIRMAR.length).setValues([COLUMNAS_POR_CONFIRMAR.slice()]);
  hoja.setFrozenRows(1);
  SpreadsheetApp.flush();
  return hoja;
}

/**
 * Valores de "Por confirmar" con las fechas como texto. El lector escribe '2026-11-07' y Sheets lo
 * convierte en fecha a medianoche en la zona del libro (que puede no ser la de Lima): leerla con la
 * zona del script la corría un día antes. Aquí se vuelve a texto con la zona del libro (motor 1.8.4).
 */
function valoresPorConfirmar_(hoja) {
  var libro = abrirLibro_();
  var zona = (libro.getSpreadsheetTimeZone && libro.getSpreadsheetTimeZone()) || ZONA_HORARIA;
  return hoja.getDataRange().getValues().map(function (fila) {
    return fila.map(function (v) {
      if (Object.prototype.toString.call(v) !== '[object Date]' || isNaN(v.getTime())) return v;
      var hora = Utilities.formatDate(v, zona, 'HH:mm');
      return Utilities.formatDate(v, zona, 'yyyy-MM-dd') + (hora === '00:00' ? '' : ' ' + hora);
    });
  });
}

/** Todas las filas de "Por confirmar" (ver leerPendientes), o [] si la hoja no existe. */
function leerTodosLosPendientes_() {
  var hoja = hojaPorConfirmar_(false);
  if (!hoja) return [];
  return leerPendientes(valoresPorConfirmar_(hoja));
}

/** Cuántos consumos esperan confirmación (para la insignia de la app). Nunca lanza. */
function contarPendientes_() {
  try {
    return pendientesActivos(leerTodosLosPendientes_(), leerCatalogo_()).length;
  } catch (err) {
    console.warn('FinFamily pendientes: no se pudo contar: ' + err);
    return 0;
  }
}

/**
 * Texto de la consulta de Gmail: últimos días, de los bancos y con palabras de consumo en el asunto.
 * Motor 1.9.7: SIN filtrar por la etiqueta. Gmail etiqueta HILOS, no correos: un aviso nuevo que cae en un hilo
 * ya etiquetado (el BCP agrupa los avisos con el mismo asunto) quedaba fuera. Lo ya leído se salta por el Id.
 */
function consultaGmail_() {
  var de = REMITENTES_BANCOS.dominios.map(function (d) { return 'from:' + d; }).join(' OR ');
  var asunto = REMITENTES_BANCOS.palabrasAsunto.map(function (p) { return 'subject:' + p; }).join(' OR ');
  return 'newer_than:' + DIAS_CORREOS + 'd (' + de + ') (' + asunto + ')';
}

/**
 * Consulta para la primera pasada con Yape y Lemon: trae los envíos desde el día 1 del mes
 * (no solo los últimos 3 días), para que lo ya gastado en el mes también llegue a "Por confirmar".
 */
function consultaBilleteras_(dias) {
  var de = BILLETERAS_CORREO.reduce(function (acc, b) { return acc.concat(b.dominios); }, [])
    .map(function (d) { return 'from:' + d; }).join(' OR ');
  // Sin filtrar por la etiqueta: los mensajes ya anotados se saltan por su Id.
  return 'newer_than:' + dias + 'd (' + de + ') (subject:yapeo OR subject:enviaste)';
}

// V2 (1.8.1): la 1.8.0 leyó mal el texto de Gmail (con asteriscos); esta pasada única
// borra lo que dejó pendiente de Yape y Lemon y lo vuelve a leer bien.
var PROPIEDAD_BILLETERAS = 'FINFAMILY_BILLETERAS_V3'; // V3 (1.8.2): Lemon trae los datos en lista con viñetas

/** Borra de "Por confirmar" las filas de Yape o Lemon que siguen 'Pendiente'. Devuelve cuántas. */
function borrarPendientesDeBilleteras_(hoja) {
  var lista = leerPendientes(hoja.getDataRange().getValues()).filter(function (p) {
    return (p.banco === 'YAPE' || p.banco === 'LEMON') && normalizar(p.estado) === 'pendiente';
  });
  lista.sort(function (a, b) { return b.fila - a.fila; }).forEach(function (p) { hoja.deleteRow(p.fila); });
  return lista.length;
}

function etiquetaLeido_() {
  return GmailApp.getUserLabelByName(ETIQUETA_GMAIL) || GmailApp.createLabel(ETIQUETA_GMAIL);
}

/** true si el hilo ya tiene la etiqueta "FinFamily/Leído" (por si la búsqueda no la filtró). */
function hiloYaLeido_(hilo) {
  var etiquetas = hilo.getLabels ? hilo.getLabels() : [];
  for (var i = 0; i < etiquetas.length; i++) if (etiquetas[i].getName() === ETIQUETA_GMAIL) return true;
  return false;
}

/**
 * Pensada para correr cada 10 minutos (ver instalarLector). Busca en Gmail los avisos de
 * consumo de los bancos de los últimos 3 días que no tengan la etiqueta "FinFamily/Leído",
 * los agrega a la hoja "Por confirmar" con Estado 'Pendiente' (si el Id del mensaje no
 * estaba ya) y etiqueta el hilo. Un correo raro nunca detiene la pasada: se anota y sigue.
 * También se puede ejecutar a mano desde el editor para probarla.
 */
var PROPIEDAD_HUELLAS = 'FINFAMILY_HUELLAS_V2';

/**
 * Corrige la huella de las filas que escribió FinFamily antes de la versión 1.7.1: estaba en texto
 * ('2026-11-05|45.00|pedido') y el formulario B&P exige un SHA-256 de 64 caracteres. Solo toca la celda
 * _HUELLA_FORM de filas cuyo _ID_FORM empieza con 'APP:'; las filas del formulario no se tocan.
 * Se puede ejecutar a mano desde el editor; además corre una sola vez sola, en la próxima pasada del lector.
 * Devuelve {reparadas, porHoja}.
 */
function repararHuellas() {
  var porHoja = {};
  var total = 0;
  hojasDesde(leerCatalogo_()).concat([HOJA_HORMIGA]).forEach(function (nombre) {
    var hoja = abrirLibro_().getSheetByName(nombre);
    if (!hoja) return;
    var h;
    try { h = leerHojaConEncabezado_(hoja); } catch (e) { return; }
    var cols = h.cols;
    if (cols.idForm === -1 || cols.huella === -1) return;
    var n = 0;
    for (var r = h.idxEnc + 1; r < h.valores.length; r++) {
      var f = h.valores[r];
      var id = String(f[cols.idForm] || '').trim();
      if (id.indexOf('APP:') !== 0) continue;
      var huella = String(f[cols.huella] || '').trim();
      if (/^[0-9a-f]{64}$/.test(huella)) continue;
      var firma = huella || firmaGasto({ fecha: f[cols.fecha], monto: parsearMonto(f[cols.monto]), descripcion: f[cols.descripcion] });
      var celda = hoja.getRange(r + 1, cols.huella + 1);
      if (celda.getFormula()) continue; // nunca se pisa una fórmula
      celda.setValue(hashHex_(firma));
      n++;
    }
    if (n) { porHoja[nombre] = n; total += n; }
  });
  if (total) SpreadsheetApp.flush();
  console.log('FinFamily huellas: ' + total + ' fila(s) corregida(s). ' + JSON.stringify(porHoja));
  return { reparadas: total, porHoja: porHoja };
}

/** Corre repararHuellas una sola vez (queda anotado en las propiedades del script). */
function repararHuellasUnaVez_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROPIEDAD_HUELLAS)) return null;
  var r = repararHuellas();
  props.setProperty(PROPIEDAD_HUELLAS, new Date().toISOString());
  return r;
}

var PROPIEDAD_DEBITOS = 'FINFAMILY_DEBITOS_V1';

/**
 * Antes de la 1.8.3 los avisos de Tarjeta de Débito BCP se confirmaban como gastos de la tarjeta
 * de crédito BCP. Esto los pasa a "Gastos Hormiga" como efectivo (sale de lo que ya tenía quien gastó)
 * y los quita de la hoja de la tarjeta. Solo toca filas de la app (_ID_FORM 'APP:') que coinciden
 * con un débito confirmado en "Por confirmar" (mismo monto, descripción parecida, fecha a ±3 días).
 * Devuelve {movidos, detalle}.
 */
function pasarDebitosAEfectivo() {
  var debitos = leerTodosLosPendientes_().filter(function (p) {
    return p.banco === 'BCP' && normalizar(p.estado) === 'confirmado' && /debito/.test(normalizar(p.asunto));
  });
  if (!debitos.length) return { movidos: 0, detalle: [] };
  var medioBcp = buscarMedio_('TC_BCP');
  var hoja = medioBcp ? abrirLibro_().getSheetByName(medioBcp.hoja) : null;
  if (!hoja) return { movidos: 0, detalle: [] };
  var soloLetras = function (t) { return normalizar(t).replace(/[^a-z0-9]/g, ''); };
  var h = leerHojaConEncabezado_(hoja);
  var cols = h.cols;
  if (cols.idForm === -1) return { movidos: 0, detalle: [] };
  var usados = {};
  var aMover = [];
  debitos.forEach(function (p) {
    var comercio = soloLetras(p.comercio);
    for (var r = h.idxEnc + 1; r < h.valores.length; r++) {
      var f = h.valores[r];
      var partes = partesIdForm(f[cols.idForm]);
      if (usados[r] || String(partes.base || '').indexOf('APP:') !== 0) continue;
      if (parsearMonto(f[cols.monto]) !== p.monto) continue;
      var desc = soloLetras(f[cols.descripcion]);
      if (!desc || !comercio || (comercio.indexOf(desc) === -1 && desc.indexOf(comercio) === -1)) continue;
      var fecha = fechaISO(parsearFecha(f[cols.fecha]));
      var dias = diasEntre_(p.fecha, fecha);
      if (dias === null || Math.abs(dias) > 3) continue;
      usados[r] = true;
      aMover.push({
        idForm: partes.base, idCliente: partes.base.slice(4), responsable: String(f[cols.responsable] || '').trim(),
        datos: { monto: p.monto, concepto: f[cols.concepto], descripcion: String(f[cols.descripcion] || '').trim(),
          nota: cols.nota !== -1 ? String(f[cols.nota] || '') : '', fecha: fecha }
      });
      break;
    }
  });
  var detalle = [];
  aMover.forEach(function (m) {
    var responsable = m.responsable || '';
    var pedido = {
      idCliente: m.idCliente, monto: m.datos.monto, medio: 'EFECTIVO', concepto: m.datos.concepto,
      descripcion: m.datos.descripcion, nota: m.datos.nota, fecha: m.datos.fecha, confirmarDuplicado: true,
      origen: responsable ? 'P:' + responsable : ''
    };
    var r;
    try { r = registrarGasto_(pedido, responsable); } catch (e) {
      // Si la hoja no tiene la columna _id_form, se anota sin decir de dónde sale.
      if (!pedido.origen || String(e && e.message).indexOf('_id_form') === -1) throw e;
      pedido.origen = '';
      r = registrarGasto_(pedido, responsable);
    }
    if (!r.guardado && !r.duplicadoId) return;
    // Recién con el efectivo anotado se quita de la tarjeta (se busca la fila de nuevo por su Id).
    var candado = tomarCandado_();
    try {
      var v = leerHojaConEncabezado_(hoja);
      for (var k = v.valores.length - 1; k > v.idxEnc; k--) {
        if (partesIdForm(v.valores[k][v.cols.idForm]).base === m.idForm) { hoja.deleteRow(k + 1); break; }
      }
      SpreadsheetApp.flush();
    } finally {
      candado.releaseLock();
    }
    detalle.push(m.datos.descripcion + ' ' + m.datos.monto);
  });
  console.log('FinFamily débitos: ' + detalle.length + ' gasto(s) pasados a efectivo. ' + detalle.join(', '));
  return { movidos: detalle.length, detalle: detalle };
}

/** Corre pasarDebitosAEfectivo una sola vez (queda anotado en las propiedades del script). */
function pasarDebitosAEfectivoUnaVez_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROPIEDAD_DEBITOS)) return null;
  var r = pasarDebitosAEfectivo();
  props.setProperty(PROPIEDAD_DEBITOS, new Date().toISOString());
  return r;
}

// ---------------------------------------------------------------------------
// Motor 1.8.5 · Fechas escritas en la zona del libro
// ---------------------------------------------------------------------------

/** Zona horaria del libro (la de Archivo > Configuración del Sheets). */
function zonaLibro_() {
  var libro = abrirLibro_();
  return (libro.getSpreadsheetTimeZone && libro.getSpreadsheetTimeZone()) || ZONA_HORARIA;
}

/**
 * Fecha lista para escribir en la hoja: la medianoche de ese día en la zona del libro. Un Date a la
 * medianoche de Lima, en un libro con la hora de California, se guardaba como las 9 p. m. del día
 * anterior y la hoja mostraba un día menos (motor 1.8.5).
 */
function fechaParaHoja_(valor) {
  var iso = fechaISO(valor);
  if (!iso) return valor;
  if (typeof Utilities.parseDate !== 'function') return parsearFecha(iso);
  return Utilities.parseDate(iso, zonaLibro_(), 'yyyy-MM-dd');
}

/** true si la celda tiene una fecha con hora (en la zona del libro): así quedaron las que escribió la app antes. */
function fechaConHora_(v, zona) {
  if (Object.prototype.toString.call(v) !== '[object Date]' || isNaN(v.getTime())) return false;
  return Utilities.formatDate(v, zona, 'HH:mm') !== '00:00';
}

var PROPIEDAD_FECHAS = 'FINFAMILY_FECHAS_V2';

/**
 * Corrige las fechas que la app escribió antes de la 1.8.5 (Fecha, Fecha de pago y Fecha de
 * vencimiento de las filas con _ID_FORM 'APP:'): las deja a la medianoche, en la zona del libro,
 * del día que el motor quiso anotar. Las filas del formulario y las fechas sin hora no se tocan.
 * Devuelve {corregidas, porHoja}.
 */
function corregirFechasDeLaApp() {
  var zona = zonaLibro_();
  var porHoja = {};
  var total = 0;
  hojasDesde(leerCatalogo_()).concat([HOJA_HORMIGA]).forEach(function (nombre) {
    var hoja = abrirLibro_().getSheetByName(nombre);
    if (!hoja) return;
    var h;
    try { h = leerHojaConEncabezado_(hoja); } catch (e) { return; }
    var cols = h.cols;
    if (cols.idForm === -1) return;
    var n = 0;
    for (var r = h.idxEnc + 1; r < h.valores.length; r++) {
      var f = h.valores[r];
      if (partesIdForm(f[cols.idForm]).base.indexOf('APP:') !== 0) continue;
      [cols.fecha, cols.fechaPago, cols.fechaVencimiento].forEach(function (col) {
        if (col === -1 || !fechaConHora_(f[col], zona)) return;
        var celda = hoja.getRange(r + 1, col + 1);
        if (celda.getFormula()) return; // nunca se pisa una fórmula
        celda.setValue(fechaParaHoja_(f[col]));
        n++;
      });
    }
    if (n) { porHoja[nombre] = n; total += n; }
  });
  if (total) SpreadsheetApp.flush();
  console.log('FinFamily fechas: ' + total + ' fecha(s) corregida(s). ' + JSON.stringify(porHoja));
  return { corregidas: total, porHoja: porHoja };
}

/** Corre corregirFechasDeLaApp una sola vez (queda anotado en las propiedades del script). */
function corregirFechasDeLaAppUnaVez_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROPIEDAD_FECHAS)) return null;
  var r = corregirFechasDeLaApp();
  props.setProperty(PROPIEDAD_FECHAS, new Date().toISOString());
  return r;
}

function leerCorreosDeBancos() {
  // Fuera del candado del lector: registrar, editar y borrar toman el suyo.
  try { pasarDebitosAEfectivoUnaVez_(); } catch (e) { console.warn('FinFamily débitos: no se pudieron pasar a efectivo: ' + e); }
  try { corregirFechasDeLaAppUnaVez_(); } catch (e) { console.warn('FinFamily fechas: no se pudieron corregir: ' + e); }
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(20000)) {
    console.warn('FinFamily lector: el script estaba ocupado; se intentará en la próxima pasada.');
    return { revisados: 0, agregados: 0, motivo: 'ocupado' };
  }
  try {
    try { repararHuellasUnaVez_(); } catch (e) { console.warn('FinFamily huellas: no se pudo reparar: ' + e); }
    var etiqueta = etiquetaLeido_();
    var hilos = GmailApp.search(consultaGmail_(), 0, 100);
    var releer = []; // hilos de Yape/Lemon de la pasada única: se leen aunque ya tengan la etiqueta
    var props = PropertiesService.getScriptProperties();
    var primeraVezBilleteras = !props.getProperty(PROPIEDAD_BILLETERAS);
    if (primeraVezBilleteras) {
      var diaDelMes = Number(String(hoyServidor_()).slice(8, 10)) || DIAS_CORREOS;
      releer = GmailApp.search(consultaBilleteras_(Math.max(DIAS_CORREOS, diaDelMes)), 0, 100);
      var vistos = {};
      hilos = hilos.concat(releer).filter(function (h, i, todos) {
        var clave = h.getId ? String(h.getId()) : null;
        if (clave === null) return todos.indexOf(h) === i; // mismo objeto, una sola vez
        if (vistos[clave]) return false;
        vistos[clave] = true;
        return true;
      });
    }
    if (!hilos.length) {
      if (primeraVezBilleteras) props.setProperty(PROPIEDAD_BILLETERAS, new Date().toISOString());
      return { revisados: 0, agregados: 0 };
    }

    var datosTarjetas = leerDatosTarjetas_();
    var hoja = hojaPorConfirmar_(true);
    if (primeraVezBilleteras) {
      var borradas = borrarPendientesDeBilleteras_(hoja);
      if (borradas) console.log('FinFamily lector: se vuelven a leer ' + borradas + ' movimiento(s) de Yape/Lemon.');
    }
    var existentes = {};
    leerPendientes(hoja.getDataRange().getValues()).forEach(function (p) { existentes[p.id] = true; });

    var revisados = 0, agregados = 0;
    var nuevas = [];
    // Solo correos de los últimos días: un hilo largo puede traer avisos viejos de antes del lector.
    // (En la pasada única de Yape y Lemon la ventana va desde el día 1 del mes.)
    var diasVentana = primeraVezBilleteras ? Math.max(DIAS_CORREOS, Number(String(hoyServidor_()).slice(8, 10)) || DIAS_CORREOS) : DIAS_CORREOS;
    var desde = new Date(parsearFecha(hoyServidor_()).getTime() - diasVentana * 86400000);
    hilos.forEach(function (hilo) {
      try {
        hilo.getMessages().forEach(function (mensaje) {
          try {
            var id = String(mensaje.getId());
            if (existentes[id]) return; // ya está en "Por confirmar" (pendiente, confirmado o descartado)
            var fechaCorreo = mensaje.getDate();
            if (fechaCorreo && fechaCorreo.getTime && fechaCorreo.getTime() < desde.getTime()) return;
            revisados++;
            var cuerpoCorreo = mensaje.getPlainBody();
            var consumo = extraerConsumoDeCorreo({
              remitente: mensaje.getFrom(), asunto: mensaje.getSubject(),
              cuerpo: cuerpoCorreo, fechaISO: fechaISO(fechaCorreo)
            });
            if (!consumo) return;
            var esBilletera = consumo.banco === 'YAPE' || consumo.banco === 'LEMON';
            var t = esBilletera ? { tarjeta: consumo.banco, responsable: consumo.titular || '' }
              : consumo.debito ? { tarjeta: 'DEBITO_BCP', responsable: consumo.titular || '' }
              : tarjetaDeConsumo(consumo.banco, consumo.ultimos4, datosTarjetas, leerCatalogo_());
            t.responsable = nombreUsuarioDeTitular_(t.responsable);
            // Sin titular claro (p. ej. la TC BCP, o un aviso reenviado desde el Gmail de la otra persona):
            // el nombre del saludo, solo si es uno de los usuarios.
            if (!t.responsable) t.responsable = usuarioDelSaludo_(cuerpoCorreo);
            // Motor 1.10.0: si tampoco hay saludo, el usuario a cuyo correo llegó el aviso (el reenvío conserva el "Para").
            if (!t.responsable) t.responsable = usuarioDelDestinatario_(mensaje);
            nuevas.push([
              id, consumo.fecha, consumo.banco, t.tarjeta, neutralizarTexto(comercioLegible(consumo.comercio)), consumo.monto, consumo.moneda,
              consumo.ultimos4, t.responsable, 'Pendiente',
              Utilities.formatDate(fechaCorreo, ZONA_HORARIA, 'yyyy-MM-dd HH:mm'),
              neutralizarTexto(String(mensaje.getSubject() || '').replace(/\s+/g, ' ').trim().slice(0, 120))
            ]);
            existentes[id] = true;
            agregados++;
          } catch (errMensaje) {
            console.warn('FinFamily lector: no se pudo leer un correo: ' + errMensaje);
          }
        });
        hilo.addLabel(etiqueta);
      } catch (errHilo) {
        console.warn('FinFamily lector: no se pudo procesar un hilo: ' + errHilo);
      }
    });

    if (nuevas.length) {
      var filaInicio = hoja.getLastRow() + 1;
      hoja.getRange(filaInicio, 1, nuevas.length, COLUMNAS_POR_CONFIRMAR.length).setValues(nuevas);
      SpreadsheetApp.flush();
    }
    if (primeraVezBilleteras) props.setProperty(PROPIEDAD_BILLETERAS, new Date().toISOString());
    console.log('FinFamily lector: ' + revisados + ' correo(s) revisados, ' + agregados + ' consumo(s) nuevo(s) por confirmar.');
    return { revisados: revisados, agregados: agregados };
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'pendientes': consumos leídos del correo que esperan confirmación, más recientes primero. */
function accionPendientes_() {
  var lista = pendientesActivos(leerTodosLosPendientes_(), leerCatalogo_());
  return { pendientes: lista, total: lista.length };
}

function validarIdPendiente_(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) throw errorApp_('datos_invalidos', 'Falta el identificador del consumo.');
  return id.trim();
}

/** Fila de "Por confirmar" con ese Id (objeto de leerPendientes) o error si no está. */
function buscarPendiente_(id) {
  var lista = leerTodosLosPendientes_();
  for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
  throw errorApp_('datos_invalidos', 'Ese consumo ya no está en la bandeja "Por confirmar".');
}

/** Escribe el Estado de una fila de "Por confirmar" (con candado y buscando la fila de nuevo por su Id). */
function cambiarEstadoPendiente_(id, estadoNuevo) {
  var hoja = hojaPorConfirmar_(false);
  if (!hoja) throw errorApp_('datos_invalidos', 'Ese consumo ya no está en la bandeja "Por confirmar".');
  var candado = tomarCandado_();
  try {
    var valores = valoresPorConfirmar_(hoja);
    var lista = leerPendientes(valores);
    var p = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) { p = lista[i]; break; }
    if (!p) throw errorApp_('datos_invalidos', 'Ese consumo ya no está en la bandeja "Por confirmar".');
    var idxEnc = buscarFilaEncabezado(valores, 'Id');
    var colEstado = valores[idxEnc].map(normalizar).indexOf('estado');
    if (colEstado === -1) throw errorApp_('error_interno', 'La hoja "' + HOJA_POR_CONFIRMAR + '" no tiene el formato esperado.');
    hoja.getRange(p.fila, colEstado + 1).setValue(estadoNuevo);
    SpreadsheetApp.flush();
    return p;
  } finally {
    candado.releaseLock();
  }
}

/**
 * Tarjeta que el lector asignó al pendiente, si de verdad la identificó: su medio es el
 * elegido, está activa y (los últimos 4 del correo coinciden con los guardados de esa
 * tarjeta, o es la única tarjeta activa de ese medio). Si el lector solo adivinó
 * (Interbank sin dígitos conocidos) devuelve '' y se aplica la regla de siempre.
 */
function tarjetaHeredadaDelLector_(p, idMedio) {
  var catalogo = leerCatalogo_();
  var t = buscarTarjetaCatalogo(catalogo, p.tarjeta);
  if (!t || t.activa === false || t.medio !== idMedio) return '';
  var delMedio = tarjetasActivas(catalogo).filter(function (x) { return x.medio === idMedio; });
  if (delMedio.length === 1) return t.id;
  var datos = leerDatosTarjetas_()[t.id];
  return (p.ultimos4 && datos && datos.digitos === p.ultimos4) ? t.id : '';
}

/**
 * Acción 'confirmarPendiente': registra el consumo como gasto (igual que 'registrar') y
 * marca la fila como 'Confirmado'. datos: {idCliente, id, concepto, descripcion?, nota?,
 * responsable?, medio? (TC_* o PLIN/YAPE/EFECTIVO, que van a Gastos Hormiga), fecha?,
 * confirmarDuplicado?}. Los consumos en dólares no se registran.
 */
function accionConfirmarPendiente_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var id = validarIdPendiente_(datos.id);
  var p = buscarPendiente_(id);
  if (normalizar(p.estado) === 'confirmado') return { confirmado: false, yaEstaba: true };
  if (p.moneda === 'USD') {
    throw errorApp_('datos_invalidos', 'Ese consumo está en dólares (US$ ' + p.monto.toFixed(2) +
      '). Regístralo a mano con el monto en soles que te cobró el banco.');
  }
  var responsable = resolverResponsable_(usuario, datos.responsable);
  // Por defecto el medio sugerido (la tarjeta, o PLIN/YAPE si el consumo fue una transferencia).
  var medio = datos.medio === undefined || datos.medio === null || datos.medio === '' ? medioSugerido(p.tarjeta, p.comercio, leerCatalogo_()) : datos.medio;
  if (!buscarMedio_(medio)) throw errorApp_('datos_invalidos', 'El medio de pago no es válido.');
  var descripcion = (datos.descripcion === undefined || datos.descripcion === null || String(datos.descripcion).trim() === '')
    ? (p.comercio || ('Consumo ' + p.banco)) : datos.descripcion;
  var fecha = typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : p.fecha;
  if (!fecha || !parsearFecha(fecha) || diasEntre_(hoyServidor_(), fecha) > 1) fecha = hoyServidor_();

  var tarjeta = (datos.tarjeta === undefined || datos.tarjeta === null || datos.tarjeta === '')
    ? tarjetaHeredadaDelLector_(p, medio) : datos.tarjeta;

  var delCorreo = 0;
  try {
    leerTodosLosPendientes_().forEach(function (q) {
      if (q.id === p.id || normalizar(q.estado) !== 'confirmado') return;
      if (Math.round(Number(q.monto) * 100) !== Math.round(Number(p.monto) * 100)) return;
      if (q.fecha && Math.abs(diasEntre_(String(q.fecha).slice(0, 10), fecha)) <= 1) delCorreo++;
    });
  } catch (err) { delCorreo = 0; }
  var r = registrarGasto_({
    idCliente: datos.idCliente, monto: p.monto, medio: medio, concepto: datos.concepto,
    descripcion: descripcion, nota: datos.nota, fecha: fecha, confirmarDuplicado: datos.confirmarDuplicado,
    tarjeta: tarjeta, origen: datos.origen, buscarParecidos: true, parecidosDelCorreo: delCorreo,
    cuotas: datos.cuotas, montoCuota: datos.montoCuota
  }, responsable);
  if (!r.guardado && !r.duplicadoId) {
    // Parece repetido: la app pregunta y vuelve a llamar con confirmarDuplicado = true.
    return { confirmado: false, posibleDuplicado: true, coincidencia: r.coincidencia };
  }
  cambiarEstadoPendiente_(id, 'Confirmado');
  if (r.guardado) { avisarGastoGrande_(r.gasto); avisarSobrante_(r.gasto); }
  var salida = { confirmado: true, hoja: r.hoja, fila: r.fila };
  // La tarjeta se informa solo si la pidió la app o si quedó como prestada (lo demás responde igual que antes).
  var pedida = !(datos.tarjeta === undefined || datos.tarjeta === null || datos.tarjeta === '');
  if (r.tarjeta && (pedida || r.prestada)) { salida.tarjeta = r.tarjeta; salida.prestada = r.prestada === true; }
  if (r.origen) salida.origen = r.origen;
  if (r.cuotas) { salida.cuotas = r.cuotas; salida.montoCuota = r.montoCuota; }
  return salida;
}

/** Acción 'descartarPendiente': marca la fila como 'Descartado' (no se registra nada). */
function accionDescartarPendiente_(usuario, datos) {
  var id = validarIdPendiente_(datos.id);
  var p = buscarPendiente_(id);
  if (normalizar(p.estado) === 'confirmado') return { descartado: false, yaEstaba: true };
  cambiarEstadoPendiente_(id, 'Descartado');
  return { descartado: true };
}

// ---------------------------------------------------------------------------
// Motor 1.3 · Alertas diarias: presupuesto, resumen semanal y calendario
// ---------------------------------------------------------------------------

function leerListaGuardada_(nombre, claveMes) {
  var crudo = propiedad_(nombre);
  if (!crudo) return [];
  try {
    var g = JSON.parse(crudo);
    if (g && g.mes === claveMes && Array.isArray(g.claves)) return g.claves.map(String);
  } catch (err) { /* propiedad dañada: se trata como vacía */ }
  return [];
}

/** Gasto real del mes: suma de todos los consumos (tarjetas y hormiga) con fecha en ese mes. */
function gastadoDelMes_(consumos, claveMes) {
  var total = 0;
  consumos.forEach(function (c) { if (c.fecha && c.fecha.slice(0, 7) === claveMes) total += c.monto; });
  return Math.round(total * 100) / 100;
}

/** Avisa (una vez por línea, mes y umbral) las líneas del presupuesto al 80 % y al 100 %. */
function revisarPresupuesto_(hoy, consumos) {
  // El presupuesto que se está gastando es el del último cobro (fin de mes), y cuenta lo gastado desde ese día.
  var mes = mesDelCiclo(hoy);
  var p = leerPresupuestoDelMes_(mes);
  if (!p) return { enviado: false, motivo: 'mes sin presupuesto' };
  var yaAvisadas = leerListaGuardada_(PROPIEDAD_ALERTAS_PRESUPUESTO, mes);
  var lista = alertasPresupuesto(p, consumos, mes, yaAvisadas, leerMapaLineas_(), conceptosConfigOpcional_(), cicloDelMes(mes));
  if (!lista.length) return { enviado: false, motivo: 'nada que avisar' };
  var r = enviarCorreoAUsuarios_(textoAlertasPresupuesto(lista, p.etiquetaMes), 'presupuesto');
  if (r.enviado) {
    var claves = yaAvisadas.slice();
    clavesCubiertas(lista).forEach(function (k) { if (claves.indexOf(k) === -1) claves.push(k); });
    PropertiesService.getScriptProperties().setProperty(PROPIEDAD_ALERTAS_PRESUPUESTO, JSON.stringify({ mes: mes, claves: claves }));
  }
  r.avisos = lista.length;
  return r;
}

/** Los lunes, el resumen de la semana anterior (una sola vez por lunes). */
function enviarResumenSemanal_(hoy, consumos, resumen) {
  if (!esLunes(hoy)) return { enviado: false, motivo: 'no es lunes' };
  if (propiedad_(PROPIEDAD_RESUMEN_SEMANAL) === hoy) return { enviado: false, motivo: 'ya enviado' };
  var mes = hoy.slice(0, 7);
  var p = leerPresupuestoDelMes_(mes);
  var presupuesto = p ? { etiquetaMes: p.etiquetaMes, planeado: p.totales.gastos, gastado: gastadoDelMes_(consumos, mes) } : null;
  var texto = textoResumenSemanal(resumenSemanal(consumos, hoy), presupuesto, proximosVencimientos(resumen));
  var r = enviarCorreoAUsuarios_(texto, 'resumen semanal');
  if (r.enviado) PropertiesService.getScriptProperties().setProperty(PROPIEDAD_RESUMEN_SEMANAL, hoy);
  return r;
}

/**
 * Pensada para correr una vez al día (ver instalarAlertas / instalarTodo), después de
 * avisosDeVencimiento. Según los ajustes: avisa líneas del presupuesto al 80 % y 100 %,
 * manda el resumen semanal los lunes y sincroniza el calendario. Cada parte va en su
 * propio try/catch: si una falla, las demás corren igual.
 */
function revisarAlertas() {
  var ajustes = leerAjustesAvisos_();
  var hoy = hoyServidor_();
  var resultado = { fecha: hoy };
  var consumos = leerTodosLosConsumos_();
  var resumen = resumenTarjetas(consumos, hoy, false, leerCatalogo_());

  if (ajustes.presupuesto) {
    try { resultado.presupuesto = revisarPresupuesto_(hoy, consumos); } catch (err) {
      console.warn('FinFamily alertas (presupuesto): ' + err);
      resultado.presupuesto = { enviado: false, motivo: 'error' };
    }
  }
  if (ajustes.resumenSemanal) {
    try { resultado.resumenSemanal = enviarResumenSemanal_(hoy, consumos, resumen); } catch (err) {
      console.warn('FinFamily alertas (resumen semanal): ' + err);
      resultado.resumenSemanal = { enviado: false, motivo: 'error' };
    }
  }
  try { resultado.fijos = revisarFijos_(hoy, ajustes.vencimiento !== false); } catch (err) {
    console.warn('FinFamily alertas (fijos): ' + err);
    resultado.fijos = { motivo: 'error' };
  }
  if (ajustes.calendario) {
    try { resultado.calendario = sincronizarCalendario(resumen); } catch (err) {
      console.warn('FinFamily alertas (calendario): ' + err);
      resultado.calendario = { motivo: 'error' };
    }
  }
  console.log('FinFamily alertas (' + hoy + '): ' + JSON.stringify(resultado));
  return resultado;
}

/**
 * Un evento de día completo en el calendario del dueño por cada tarjeta con deuda:
 * "Vence <tarjeta>: S/ <monto>", con recordatorios 3 días y 1 día antes (9:00 a. m.).
 * Guarda {clave: idEvento} en FINFAMILY_CALENDARIO; actualiza el título si cambió el
 * monto, borra el evento si la tarjeta ya no debe y nunca crea dos para la misma fecha.
 * Se puede ejecutar a mano sin argumentos.
 */
function sincronizarCalendario(resumenOpcional) {
  var resumen = resumenOpcional || resumenTarjetas(leerTodosLosConsumos_(), hoyServidor_(), false, leerCatalogo_());
  var propiedades = PropertiesService.getScriptProperties();
  var guardados = {};
  try { guardados = JSON.parse(propiedades.getProperty(PROPIEDAD_CALENDARIO) || '{}') || {}; } catch (err) { guardados = {}; }
  var plan = planCalendario(eventosDeVencimiento(resumen), guardados);
  var calendario = CalendarApp.getDefaultCalendar();
  var nuevos = {};
  var creados = 0, actualizados = 0, borrados = 0;

  var crear = function (e) {
    var evento = calendario.createAllDayEvent(e.titulo, parsearFecha(e.vence), { description: e.descripcion });
    evento.removeAllReminders();
    RECORDATORIOS_CALENDARIO.forEach(function (min) { evento.addPopupReminder(min); });
    nuevos[e.clave] = evento.getId();
    creados++;
  };

  plan.crear.forEach(crear);
  plan.actualizar.forEach(function (a) {
    var evento = null;
    try { evento = calendario.getEventById(a.idEvento); } catch (err) { evento = null; }
    if (!evento) { crear(a.evento); return; } // lo borraron a mano: se vuelve a crear
    if (evento.getTitle() !== a.evento.titulo) {
      evento.setTitle(a.evento.titulo);
      evento.setDescription(a.evento.descripcion);
      actualizados++;
    }
    nuevos[a.evento.clave] = a.idEvento;
  });
  plan.borrar.forEach(function (b) {
    try {
      var evento = calendario.getEventById(b.idEvento);
      if (evento) { evento.deleteEvent(); borrados++; }
    } catch (err) {
      console.warn('FinFamily calendario: no se pudo borrar el evento ' + b.clave + ': ' + err);
    }
  });

  propiedades.setProperty(PROPIEDAD_CALENDARIO, JSON.stringify(nuevos));
  return { creados: creados, actualizados: actualizados, borrados: borrados, eventos: Object.keys(nuevos).length };
}

// ---------------------------------------------------------------------------
// Motor 1.3 · Instalar y quitar activadores
// ---------------------------------------------------------------------------

/** Borra solo los activadores de esa función (no toca los demás del proyecto). */
function quitarActivadores_(nombreFuncion) {
  var quitados = 0;
  ScriptApp.getProjectTriggers().forEach(function (a) {
    if (a.getHandlerFunction() === nombreFuncion) {
      ScriptApp.deleteTrigger(a);
      quitados++;
    }
  });
  return quitados;
}

/** Ejecutar una vez desde el editor: revisa Gmail cada 10 minutos. Si ya existía, lo reemplaza. */
function instalarLector() {
  var quitados = quitarActivadores_(FUNCION_LECTOR);
  ScriptApp.newTrigger(FUNCION_LECTOR).timeBased().everyMinutes(MINUTOS_LECTOR).create();
  console.log('FinFamily lector: activador cada ' + MINUTOS_LECTOR + ' minutos creado' +
    (quitados ? ' (reemplazó ' + quitados + ' anterior)' : '') + '.');
}

/** Ejecutar desde el editor para dejar de leer Gmail (la hoja "Por confirmar" y la etiqueta se quedan). */
function quitarLector() {
  var quitados = quitarActivadores_(FUNCION_LECTOR);
  console.log('FinFamily lector: se quitaron ' + quitados + ' activador(es).');
}

/** Ejecutar una vez desde el editor: alertas diarias (presupuesto, resumen semanal, calendario) a las 8 a. m. */
function instalarAlertas() {
  var quitados = quitarActivadores_(FUNCION_ALERTAS);
  ScriptApp.newTrigger(FUNCION_ALERTAS).timeBased().everyDays(1).atHour(HORA_AVISOS).inTimezone(ZONA_HORARIA).create();
  console.log('FinFamily alertas: activador diario creado' + (quitados ? ' (reemplazó ' + quitados + ' anterior)' : '') + '.');
}

/** Ejecutar desde el editor para dejar de recibir alertas; borra también los eventos del calendario. */
function quitarAlertas() {
  var quitados = quitarActivadores_(FUNCION_ALERTAS);
  var propiedades = PropertiesService.getScriptProperties();
  try { sincronizarCalendario([]); } catch (err) { console.warn('FinFamily calendario: no se pudieron borrar los eventos: ' + err); }
  propiedades.deleteProperty(PROPIEDAD_ALERTAS_PRESUPUESTO);
  propiedades.deleteProperty(PROPIEDAD_RESUMEN_SEMANAL);
  propiedades.deleteProperty(PROPIEDAD_CALENDARIO);
  console.log('FinFamily alertas: se quitaron ' + quitados + ' activador(es).');
}

/**
 * Ejecutar UNA vez a mano desde el editor: instala todo (avisos de vencimiento, lector de
 * Gmail y alertas diarias con calendario). Google pedirá los permisos de Gmail, Calendario
 * y correo la primera vez. Volver a ejecutarlo no duplica nada.
 */
function instalarTodo() {
  instalarAvisos();
  instalarLector();
  instalarAlertas();
  console.log('FinFamily: todo instalado (avisos, lector y alertas).');
}

/** Ejecutar desde el editor para quitar todos los activadores de FinFamily. */
function quitarTodo() {
  quitarAvisos();
  quitarLector();
  quitarAlertas();
  console.log('FinFamily: se quitaron todos los activadores.');
}

// ---------------------------------------------------------------------------
// Motor 1.4 · Administrar desde la app: catálogo de tarjetas
// ---------------------------------------------------------------------------

/** Titular de una tarjeta: '' o el nombre de alguien de USUARIOS (se devuelve como está escrito ahí). */
function validarTitular_(titular) {
  if (!titular) return '';
  var buscado = normalizar(titular);
  var usuarios = leerUsuarios_();
  var correos = Object.keys(usuarios);
  for (var i = 0; i < correos.length; i++) {
    var n = normalizar(usuarios[correos[i]].nombre);
    if (n === buscado || n.split(' ')[0] === buscado) return usuarios[correos[i]].nombre;
  }
  throw errorApp_('datos_invalidos', 'El titular debe ser una de las personas con acceso (o quedar vacío).');
}

function revisarCierreYVence_(t) {
  var sinCierre = t.cierre === null || t.cierre === undefined;
  var sinVence = t.vence === null || t.vence === undefined;
  if (sinCierre !== sinVence) {
    throw errorApp_('datos_invalidos', 'Pon el día de cierre y el de vencimiento juntos, o deja los dos vacíos (tarjeta sin ciclo).');
  }
}

/** Crea la hoja "TC <nombre>" copiando SOLO la fila de encabezados de la hoja modelo (TC BCP). */
function crearHojaTarjeta_(nombreHoja) {
  var libro = abrirLibro_();
  var existente = libro.getSheetByName(nombreHoja);
  if (existente) return { hoja: existente, creada: false };
  var hojas = libro.getSheets();
  for (var i = 0; i < hojas.length; i++) if (normalizar(hojas[i].getName()) === normalizar(nombreHoja)) return { hoja: hojas[i], creada: false };
  var modelo = obtenerHoja_(HOJA_MODELO_TC);
  var valores = modelo.getDataRange().getValues();
  var idxEnc = buscarFilaEncabezado(valores, 'responsable');
  if (idxEnc === -1) throw errorApp_('error_interno', 'La hoja "' + HOJA_MODELO_TC + '" no tiene el formato esperado.');
  var encabezados = valores[idxEnc];
  var nueva = libro.insertSheet(nombreHoja);
  if (nueva.getMaxColumns && nueva.getMaxColumns() < encabezados.length) {
    nueva.insertColumnsAfter(nueva.getMaxColumns(), encabezados.length - nueva.getMaxColumns());
  }
  nueva.getRange(idxEnc + 1, 1, 1, encabezados.length).setValues([encabezados.slice()]);
  modelo.getRange(idxEnc + 1, 1, 1, encabezados.length).copyFormatToRange(nueva, 1, encabezados.length, idxEnc + 1, idxEnc + 1);
  nueva.setFrozenRows(idxEnc + 1);
  SpreadsheetApp.flush();
  return { hoja: nueva, creada: true };
}

function respuestaCatalogo_(catalogo, extra) {
  var r = extra || {};
  r.tarjetas = catalogo.map(function (t) { var c = JSON.parse(JSON.stringify(t)); c.etiqueta = etiquetaTarjeta(t); return c; });
  return r;
}

/**
 * Acción 'agregarTarjeta': {idCliente, nombre, titular?, cierre?, vence?, color}.
 * Crea la hoja "TC <nombre>" si no existe, genera el id y el medio TC_<ID>, y devuelve {tarjetas, id}.
 */
function accionAgregarTarjeta_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var v = validarTarjetaCatalogo(datos, true);
  if (v.error) throw errorApp_('datos_invalidos', v.error);
  var c = v.campos;
  var nueva = {
    nombre: c.nombre, titular: validarTitular_(c.titular), cierre: c.cierre === undefined ? null : c.cierre,
    vence: c.vence === undefined ? null : c.vence, color: c.color, activa: true
  };
  revisarCierreYVence_(nueva);
  var candado = tomarCandado_();
  try {
    var catalogo = leerCatalogo_();
    var ids = catalogo.map(function (t) { return t.id; });
    nueva.id = generarIdTarjeta(nueva.nombre, ids);
    nueva.medio = 'TC_' + nueva.id;
    nueva.hoja = 'TC ' + String(nueva.nombre).split(' · ')[0].trim();
    var ordenMax = 0;
    catalogo.forEach(function (t) { if (t.orden > ordenMax) ordenMax = t.orden; });
    nueva.orden = ordenMax + 1;
    var hoja = crearHojaTarjeta_(nueva.hoja);
    var lista = guardarCatalogo_(catalogo.concat([nueva]));
    return respuestaCatalogo_(lista, { id: nueva.id, hoja: nueva.hoja, hojaCreada: hoja.creada });
  } finally {
    candado.releaseLock();
  }
}

function tarjetaDelCatalogoOError_(catalogo, id) {
  var t = buscarTarjetaCatalogo(catalogo, id);
  if (!t) throw errorApp_('datos_invalidos', 'Esa tarjeta no está en el catálogo.');
  return t;
}

/** Acción 'editarTarjeta': {id, nombre?, titular?, cierre?, vence?, color?, orden?} → {tarjetas}. No renombra la hoja. */
function accionEditarTarjeta_(usuario, datos) {
  var v = validarTarjetaCatalogo(datos, false);
  if (v.error) throw errorApp_('datos_invalidos', v.error);
  var c = v.campos;
  if (!Object.keys(c).length) throw errorApp_('datos_invalidos', 'No hay cambios para guardar.');
  if (c.titular !== undefined) c.titular = validarTitular_(c.titular);
  var candado = tomarCandado_();
  try {
    var catalogo = leerCatalogo_();
    var t = tarjetaDelCatalogoOError_(catalogo, datos.id);
    Object.keys(c).forEach(function (k) { t[k] = c[k]; });
    if (c.nombre !== undefined || c.titular !== undefined) delete t.etiqueta; // el nombre mostrado se vuelve a armar
    revisarCierreYVence_(t);
    return respuestaCatalogo_(guardarCatalogo_(catalogo));
  } finally {
    candado.releaseLock();
  }
}

/**
 * Acción 'quitarTarjeta': {id, forzar?} → desactiva la tarjeta (la hoja y sus datos quedan).
 * Si tiene consumos pendientes devuelve {quitada:false, pendientes:N} salvo forzar:true.
 */
function accionQuitarTarjeta_(usuario, datos) {
  var catalogo = leerCatalogo_();
  var t = tarjetaDelCatalogoOError_(catalogo, datos.id);
  if (t.activa === false) return respuestaCatalogo_(catalogo, { quitada: true, yaEstaba: true });
  var pendientes = 0;
  leerTodosLosConsumos_().forEach(function (c) { if (c.tarjeta === t.id && normalizar(c.estado) !== 'pagado') pendientes++; });
  if (pendientes && datos.forzar !== true) return { quitada: false, pendientes: pendientes };
  var candado = tomarCandado_();
  try {
    t.activa = false;
    return respuestaCatalogo_(guardarCatalogo_(catalogo), { quitada: true, pendientes: pendientes });
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'restaurarTarjeta': {id} → la vuelve a activar. */
function accionRestaurarTarjeta_(usuario, datos) {
  var candado = tomarCandado_();
  try {
    var catalogo = leerCatalogo_();
    var t = tarjetaDelCatalogoOError_(catalogo, datos.id);
    t.activa = true;
    return respuestaCatalogo_(guardarCatalogo_(catalogo), { restaurada: true });
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Motor 1.4 · Administrar desde la app: tipos de gasto (hoja Configuración)
// ---------------------------------------------------------------------------

/**
 * La lista bajo un encabezado de Configuración: {hoja, col (1-based), filaEnc (1-based),
 * items:[{fila, texto}], formulas (de toda la columna)}.
 */
function listaDeConfiguracion_(encabezado) {
  var hoja = obtenerHoja_(HOJA_CONFIG);
  var valores = hoja.getDataRange().getValues();
  var celda = buscarCeldaEncabezado_(valores, encabezado);
  if (!celda) throw errorApp_('error_interno', 'La hoja "' + HOJA_CONFIG + '" no tiene la columna "' + encabezado + '".');
  var items = [];
  for (var i = celda.fila + 1; i < valores.length; i++) {
    var t = texto_(valores[i][celda.col]);
    if (t) items.push({ fila: i + 1, texto: t });
  }
  var formulas = hoja.getRange(1, celda.col + 1, Math.max(valores.length, 1), 1).getFormulas();
  return { hoja: hoja, col: celda.col + 1, filaEnc: celda.fila + 1, items: items, formulas: formulas, filas: valores.length };
}

/** Escribe `texto` en la primera celda libre debajo de la lista (nunca sobre una fórmula). */
function agregarAListaConfig_(encabezado, texto) {
  var l = listaDeConfiguracion_(encabezado);
  var fila = l.items.length ? l.items[l.items.length - 1].fila + 1 : l.filaEnc + 1;
  if (fila > l.hoja.getMaxRows()) l.hoja.insertRowsAfter(l.hoja.getMaxRows(), fila - l.hoja.getMaxRows());
  if (l.formulas[fila - 1] && l.formulas[fila - 1][0]) {
    throw errorApp_('datos_invalidos', 'La celda libre de la lista tiene una fórmula; agrégalo a mano en el Sheets.');
  }
  l.hoja.getRange(fila, l.col).setValue(neutralizarTexto(texto));
  SpreadsheetApp.flush();
  return fila;
}

function nombreConcepto_(v, campo) {
  var t = textoLimpio_(v, 40, campo, true);
  if (t.length < 2) throw errorApp_('datos_invalidos', 'El tipo de gasto debe tener al menos 2 letras.');
  return t;
}

function buscarEnLista_(items, nombre) {
  var n = normalizar(nombre);
  for (var i = 0; i < items.length; i++) if (normalizar(items[i].texto) === n) return items[i];
  return null;
}

/** Acción 'agregarConcepto': {nombre} → {conceptos}. */
function accionAgregarConcepto_(usuario, datos) {
  var nombre = nombreConcepto_(datos.nombre, 'el tipo de gasto');
  var candado = tomarCandado_();
  try {
    var l = listaDeConfiguracion_('Conceptos de Gasto');
    if (buscarEnLista_(l.items, nombre)) throw errorApp_('datos_invalidos', 'Ese tipo de gasto ya existe.');
    agregarAListaConfig_('Conceptos de Gasto', nombre);
    return { conceptos: leerConfiguracion_().conceptos };
  } finally {
    candado.releaseLock();
  }
}

/** Recorre las hojas de consumos y llama f(hoja, fila 1-based, valorConcepto, tieneFormula) por cada fila con concepto. */
function recorrerConceptos_(f) {
  hojasDesde(leerCatalogo_()).concat([HOJA_HORMIGA]).forEach(function (nombre) {
    var hoja = obtenerHoja_(nombre);
    var h = leerHojaConEncabezado_(hoja);
    if (h.cols.concepto === -1) return;
    var formulas = hoja.getRange(1, h.cols.concepto + 1, h.valores.length, 1).getFormulas();
    for (var r = h.idxEnc + 1; r < h.valores.length; r++) {
      var v = h.valores[r][h.cols.concepto];
      if (v === '' || v === null || v === undefined) continue;
      f(hoja, r + 1, v, !!formulas[r][0], h.cols.concepto + 1);
    }
  });
}

/** Acción 'renombrarConcepto': {de, a} → cambia la lista y todas las filas de consumos. {conceptos, renombrado, filas}. */
function accionRenombrarConcepto_(usuario, datos) {
  var de = nombreConcepto_(datos.de, 'el tipo de gasto actual');
  var a = nombreConcepto_(datos.a, 'el nuevo nombre');
  if (normalizar(de) === normalizar(a)) throw errorApp_('datos_invalidos', 'El nuevo nombre es igual al actual.');
  var candado = tomarCandado_();
  try {
    var l = listaDeConfiguracion_('Conceptos de Gasto');
    var item = buscarEnLista_(l.items, de);
    if (!item) throw errorApp_('datos_invalidos', 'Ese tipo de gasto no está en la lista.');
    if (buscarEnLista_(l.items, a)) throw errorApp_('datos_invalidos', 'Ya existe un tipo de gasto con el nuevo nombre.');
    if (l.formulas[item.fila - 1][0]) throw errorApp_('datos_invalidos', 'Esa celda de la lista tiene una fórmula; cámbiala a mano en el Sheets.');
    l.hoja.getRange(item.fila, l.col).setValue(neutralizarTexto(a));
    moverIcono_(de, a);
    var filas = 0;
    var buscado = normalizar(de);
    recorrerConceptos_(function (hoja, fila, valor, tieneFormula, col) {
      if (tieneFormula || normalizar(valor) !== buscado) return;
      hoja.getRange(fila, col).setValue(neutralizarTexto(a));
      filas++;
    });
    SpreadsheetApp.flush();
    return { renombrado: true, filas: filas, conceptos: leerConfiguracion_().conceptos };
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'quitarConcepto': {nombre, forzar?} → {quitado, usos?, conceptos}. Corre las celdas de abajo hacia arriba. */
function accionQuitarConcepto_(usuario, datos) {
  var nombre = nombreConcepto_(datos.nombre, 'el tipo de gasto');
  var candado = tomarCandado_();
  try {
    var l = listaDeConfiguracion_('Conceptos de Gasto');
    var item = buscarEnLista_(l.items, nombre);
    if (!item) throw errorApp_('datos_invalidos', 'Ese tipo de gasto no está en la lista.');
    var usos = 0;
    var buscado = normalizar(nombre);
    recorrerConceptos_(function (hoja, fila, valor) { if (normalizar(valor) === buscado) usos++; });
    if (usos && datos.forzar !== true) return { quitado: false, usos: usos, conceptos: leerConfiguracion_().conceptos };
    // Se reescribe la lista desde la celda quitada hasta la última, sin huecos.
    var desde = l.items.indexOf(item);
    var ultima = l.items[l.items.length - 1].fila;
    for (var f = item.fila; f <= ultima; f++) {
      if (l.formulas[f - 1][0]) throw errorApp_('datos_invalidos', 'La lista tiene fórmulas; quítalo a mano en el Sheets.');
    }
    var restantes = l.items.slice(desde + 1).map(function (x) { return x.texto; });
    var valoresNuevos = [];
    for (var k = item.fila; k <= ultima; k++) {
      var idx = k - item.fila;
      valoresNuevos.push([idx < restantes.length ? neutralizarTexto(restantes[idx]) : '']);
    }
    l.hoja.getRange(item.fila, l.col, valoresNuevos.length, 1).setValues(valoresNuevos);
    moverIcono_(nombre, null);
    SpreadsheetApp.flush();
    return { quitado: true, usos: usos, conceptos: leerConfiguracion_().conceptos };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Motor 1.4 · Administrar desde la app: personas (propiedad USUARIOS)
// ---------------------------------------------------------------------------

function listaUsuarios_() {
  var usuarios = leerUsuarios_();
  return Object.keys(usuarios).map(function (correo) {
    return { nombre: usuarios[correo].nombre, correo: correo, clave: usuarios[correo].clave };
  });
}

/** Acción 'usuarios' → {usuarios:[{nombre, correo, clave}]}. */
function accionUsuarios_() {
  return { usuarios: listaUsuarios_() };
}

/** Clave corta y única: primera letra del nombre; si choca, dos letras; luego tres... y al final letra + número. */
function generarClave_(nombre, usadas) {
  var letras = normalizar(nombre).replace(/[^a-z0-9]/g, '').toUpperCase() || 'U';
  var ocupadas = {};
  usadas.forEach(function (c) { ocupadas[String(c).toUpperCase()] = true; });
  for (var n = 1; n <= letras.length; n++) {
    var clave = letras.slice(0, n);
    if (!ocupadas[clave]) return clave;
  }
  for (var k = 2; k < 100; k++) if (!ocupadas[letras.charAt(0) + k]) return letras.charAt(0) + k;
  return letras + Date.now();
}

function guardarUsuarios_(usuarios) {
  PropertiesService.getScriptProperties().setProperty('USUARIOS', JSON.stringify(usuarios));
}

/** Acción 'agregarUsuario': {nombre, correo} → {usuarios}. También lo suma a la lista Responsable de Configuración. */
function accionAgregarUsuario_(usuario, datos) {
  var nombre = textoLimpio_(datos.nombre, 40, 'el nombre', true);
  if (nombre.length < 2) throw errorApp_('datos_invalidos', 'El nombre debe tener al menos 2 letras.');
  var correo = String(datos.correo || '').trim().toLowerCase();
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(correo) || correo.length > 120) throw errorApp_('datos_invalidos', 'El correo no es válido.');
  var candado = tomarCandado_();
  try {
    var usuarios = leerUsuarios_();
    if (usuarios[correo]) throw errorApp_('datos_invalidos', 'Ese correo ya tiene acceso.');
    var correos = Object.keys(usuarios);
    for (var i = 0; i < correos.length; i++) {
      if (normalizar(usuarios[correos[i]].nombre) === normalizar(nombre)) throw errorApp_('datos_invalidos', 'Ya hay una persona con ese nombre.');
    }
    var clave = generarClave_(nombre, correos.map(function (c) { return usuarios[c].clave; }));
    usuarios[correo] = { nombre: nombre, clave: clave };
    guardarUsuarios_(usuarios);
    try {
      var l = listaDeConfiguracion_('Responsable');
      if (!buscarEnLista_(l.items, nombre)) agregarAListaConfig_('Responsable', nombre);
    } catch (err) {
      console.warn('FinFamily usuarios: no se pudo agregar a la lista Responsable: ' + err);
    }
    return { usuarios: listaUsuarios_() };
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'quitarUsuario': {correo} → {usuarios}. No permite quitarse a uno mismo ni dejar la lista vacía. */
function accionQuitarUsuario_(usuario, datos) {
  var correo = String(datos.correo || '').trim().toLowerCase();
  if (correo === usuario.email) throw errorApp_('datos_invalidos', 'No puedes quitarte a ti mismo.');
  var candado = tomarCandado_();
  try {
    var usuarios = leerUsuarios_();
    if (!usuarios[correo]) throw errorApp_('datos_invalidos', 'Ese correo no está en la lista.');
    if (Object.keys(usuarios).length <= 1) throw errorApp_('datos_invalidos', 'No se puede dejar la lista sin personas.');
    delete usuarios[correo];
    guardarUsuarios_(usuarios);
    return { usuarios: listaUsuarios_() };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Motor 1.5 · Líneas del presupuesto desde la app
// ---------------------------------------------------------------------------

function leerMapaLineas_() {
  return mapaLineasDesde(propiedad_(PROPIEDAD_LINEAS));
}

function guardarMapaLineas_(mapa) {
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_LINEAS, JSON.stringify(mapa));
}

/** Agrega `conceptos` y `sugerido` a cada fila de gastos/ahorros (ingresos quedan sin conceptos). */
/** Conceptos de la hoja Configuración, o null si no se puede leer (no debe tumbar la lectura del presupuesto). */
function conceptosConfigOpcional_() {
  try { return leerConfiguracion_().conceptos; } catch (err) { return null; }
}

function anotarConceptosEnFilas_(filas) {
  var mapa = leerMapaLineas_();
  var conceptosConfig = conceptosConfigOpcional_();
  filas.forEach(function (f) {
    if (f.seccion === 'ingresos') { f.conceptos = []; f.sugerido = false; return; }
    var c = conceptosDeLinea(mapa, f.concepto, conceptosConfig);
    f.conceptos = c.conceptos;
    f.sugerido = c.sugerido;
  });
  return filas;
}

/** Líneas del mes con conceptos y gasto real ("Llevas X de Y"). */
function lineasDelMes_(mes, consumos) {
  var p = leerPresupuestoDelMes_(mes);
  if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  var mapa = leerMapaLineas_();
  var conceptosConfig = conceptosConfigOpcional_();
  var lista = consumos || leerTodosLosConsumos_();
  var lineas = p.filas.map(function (f) {
    var c = f.seccion === 'ingresos' ? { conceptos: [], sugerido: false } : conceptosDeLinea(mapa, f.concepto, conceptosConfig);
    return {
      fila: f.fila, concepto: f.concepto, seccion: f.seccion, monto: f.monto,
      pagado: f.pagado === true, pagadoNota: f.pagadoNota || '', esTarjeta: f.esTarjeta === true,
      conceptos: c.conceptos, sugerido: c.sugerido,
      gastado: f.seccion === 'gastos' ? gastoRealDeLinea(f, lista, mes, mapa, conceptosConfig) : 0
    };
  });
  return { mes: mes, etiquetaMes: p.etiquetaMes, meses: p.meses, lineas: lineas, totales: p.totales };
}

/** Acción 'lineasPresupuesto': {mes?} → {mes, etiquetaMes, meses, lineas:[{fila, concepto, seccion, monto, conceptos, sugerido, gastado,…}], totales}. */
function accionLineasPresupuesto_(usuario, datos) {
  return lineasDelMes_(mesValido_(datos.mes));
}

function seccionValida_(s) {
  if (SECCIONES_PRESUPUESTO.indexOf(s) === -1) throw errorApp_('datos_invalidos', 'La sección debe ser ingresos, gastos o ahorros.');
  return s;
}

function filaLineaValida_(fila) {
  if (!Number.isInteger(fila) || fila < 1) throw errorApp_('datos_invalidos', 'No se indicó la línea del presupuesto.');
  return fila;
}

/** La línea con esa fila (de leerPresupuesto) o error si es un total, un título o no existe. */
function lineaPorFila_(p, fila) {
  for (var i = 0; i < p.filas.length; i++) if (p.filas[i].fila === fila) return p.filas[i];
  throw errorApp_('datos_invalidos', 'Esa fila no es una línea del presupuesto. Actualiza y vuelve a intentar.');
}

function lineaExiste_(p, nombre) {
  var n = normalizar(nombre);
  return p.filas.some(function (f) { return normalizar(f.concepto) === n; });
}

/** Escribe `monto` en la columna de cada mes >= desdeMes de esa fila, sin pisar fórmulas. Devuelve {actualizados, omitidos}. */
function escribirMontoDesde_(hoja, p, fila, monto, desdeMes, tambienAnterioresEnCero) {
  var actualizados = 0, omitidos = 0;
  var ancho = 0;
  Object.keys(p.columnas).forEach(function (k) { if (p.columnas[k] > ancho) ancho = p.columnas[k]; });
  var formulas = hoja.getRange(fila, 1, 1, ancho).getFormulas()[0];
  p.meses.forEach(function (m) {
    var col = p.columnas[m.clave];
    var valor = m.clave >= desdeMes ? monto : (tambienAnterioresEnCero ? 0 : null);
    if (valor === null) return;
    if (formulas[col - 1]) { omitidos++; return; }
    hoja.getRange(fila, col).setValue(valor);
    actualizados++;
  });
  return { actualizados: actualizados, omitidos: omitidos };
}

/**
 * Acción 'agregarLinea': {idCliente, nombre, seccion, monto, desdeMes?}.
 * Inserta la fila ANTES de la última línea del bloque de su sección (así queda dentro
 * del rango de las fórmulas de total; la que era última baja un lugar), copia el formato
 * de la fila vecina, escribe el nombre y el monto desde desdeMes en adelante (meses anteriores en 0).
 */
function accionAgregarLinea_(usuario, datos) {
  validarIdCliente_(datos.idCliente);
  var seccion = seccionValida_(datos.seccion);
  var nombre = nombreLineaParaSeccion(textoLimpio_(datos.nombre, 40, 'el nombre de la línea', true), seccion);
  if (nombre.length < 2) throw errorApp_('datos_invalidos', 'El nombre de la línea debe tener al menos 2 letras.');
  if (nombre.length > 40) throw errorApp_('datos_invalidos', 'El nombre de la línea es muy largo (máximo 40 caracteres).');
  var revisado = validarMontoPresupuesto(datos.monto === undefined ? 0 : datos.monto);
  if (revisado.error) throw errorApp_('datos_invalidos', revisado.error);
  var desdeMes = mesValido_(datos.desdeMes);

  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var p = leerPresupuesto(rango.getDisplayValues(), rango.getValues(), desdeMes, rango.getNotes());
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    if (lineaExiste_(p, nombre)) throw errorApp_('datos_invalidos', 'Ya hay una línea con ese nombre.');
    var pos = posicionNuevaLinea(p, seccion);
    if (!pos) throw errorApp_('datos_invalidos', 'No se encontró dónde poner la línea en el presupuesto.');
    var ancho = rango.getValues()[0].length;
    hoja.insertRowBefore(pos);
    // La fila vecina (la que estaba en `pos`) ahora está en pos + 1: se copia su formato.
    hoja.getRange(pos + 1, 1, 1, ancho).copyFormatToRange(hoja, 1, ancho, pos, pos);
    hoja.getRange(pos, p.colConcepto).setValue(neutralizarTexto(nombre));
    escribirMontoDesde_(hoja, p, pos, revisado.monto, desdeMes, true);
    SpreadsheetApp.flush();
    return Object.assign({ fila: pos, nombre: nombre }, lineasDelMes_(desdeMes));
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'renombrarLinea': {fila, nombre} → {renombrada:true, nombre, lineas…}. Mantiene los conceptos asignados. */
function accionRenombrarLinea_(usuario, datos) {
  var fila = filaLineaValida_(datos.fila);
  var mes = mesValido_(datos.mes);
  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var p = leerPresupuesto(rango.getDisplayValues(), rango.getValues(), mes, rango.getNotes());
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    var linea = lineaPorFila_(p, fila);
    var nombre = nombreLineaParaSeccion(textoLimpio_(datos.nombre, 40, 'el nombre de la línea', true), linea.seccion);
    if (nombre.length < 2) throw errorApp_('datos_invalidos', 'El nombre de la línea debe tener al menos 2 letras.');
    if (normalizar(nombre) === normalizar(linea.concepto)) throw errorApp_('datos_invalidos', 'El nuevo nombre es igual al actual.');
    if (lineaExiste_(p, nombre)) throw errorApp_('datos_invalidos', 'Ya hay una línea con ese nombre.');
    var celda = hoja.getRange(fila, p.colConcepto);
    if (celda.getFormula()) throw errorApp_('datos_invalidos', 'El nombre de esa línea es una fórmula; cámbialo en el Sheets.');
    celda.setValue(neutralizarTexto(nombre));
    var mapa = leerMapaLineas_();
    if (Object.prototype.hasOwnProperty.call(mapa, claveLinea(linea.concepto))) {
      guardarMapaLineas_(renombrarLineaEnMapa(mapa, linea.concepto, nombre));
    }
    var fijos = leerFijos_();
    if (fijos[claveLinea(linea.concepto)]) {
      var fijo = fijos[claveLinea(linea.concepto)];
      delete fijos[claveLinea(linea.concepto)];
      fijos[claveLinea(nombre)] = { concepto: nombreLineaParaSeccion(nombre, linea.seccion), dia: fijo.dia, auto: fijo.auto };
      guardarFijos_(fijos);
    }
    SpreadsheetApp.flush();
    return Object.assign({ renombrada: true, fila: fila, nombre: nombre }, lineasDelMes_(mes));
  } finally {
    candado.releaseLock();
  }
}

/**
 * Acción 'quitarLinea': {fila, nombre, forzar?}. Si algún mes tiene monto > 0 o nota "Pagado"
 * y no se fuerza → {quitada:false, mesesConMonto:N}. Si no, borra la fila (las fórmulas de total se ajustan solas).
 */
function accionQuitarLinea_(usuario, datos) {
  var fila = filaLineaValida_(datos.fila);
  var mes = mesValido_(datos.mes);
  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var valores = rango.getValues();
    var notas = rango.getNotes();
    var p = leerPresupuesto(rango.getDisplayValues(), valores, mes, notas);
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    var linea = lineaPorFila_(p, fila);
    if (normalizar(datos.nombre) !== normalizar(linea.concepto)) {
      throw errorApp_('datos_invalidos', 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.');
    }
    var mesesConMonto = 0;
    p.meses.forEach(function (m) {
      var col = p.columnas[m.clave] - 1;
      var v = parsearMonto(valores[fila - 1][col]);
      if ((v !== null && v > 0) || notaPagado(notas[fila - 1][col])) mesesConMonto++;
    });
    if (mesesConMonto && datos.forzar !== true) return { quitada: false, mesesConMonto: mesesConMonto };
    hoja.deleteRow(fila);
    var mapa = leerMapaLineas_();
    if (Object.prototype.hasOwnProperty.call(mapa, claveLinea(linea.concepto))) guardarMapaLineas_(quitarLineaDeMapa(mapa, linea.concepto));
    var fijosQ = leerFijos_();
    if (fijosQ[claveLinea(linea.concepto)]) { delete fijosQ[claveLinea(linea.concepto)]; guardarFijos_(fijosQ); }
    SpreadsheetApp.flush();
    return Object.assign({ quitada: true, mesesConMonto: mesesConMonto }, lineasDelMes_(mes));
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'asignarConceptos': {linea (nombre), conceptos:[…]} → guarda el mapa (un concepto va en una sola línea). */
function accionAsignarConceptos_(usuario, datos) {
  var mes = mesValido_(datos.mes);
  var nombreLinea = textoLimpio_(datos.linea, 60, 'la línea', true);
  if (!Array.isArray(datos.conceptos) || datos.conceptos.length > 100) throw errorApp_('datos_invalidos', 'La lista de conceptos no es válida.');
  var p = leerPresupuestoDelMes_(mes);
  if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
  var linea = null;
  p.filas.forEach(function (f) { if (normalizar(f.concepto) === normalizar(nombreLinea)) linea = f; });
  if (!linea) throw errorApp_('datos_invalidos', 'Esa línea no está en el presupuesto.');
  if (linea.seccion === 'ingresos') throw errorApp_('datos_invalidos', 'Las líneas de ingresos no llevan conceptos de gasto.');
  var conf = leerConfiguracion_().conceptos;
  var canonicos = {};
  conf.forEach(function (c) { canonicos[normalizar(c)] = c; });
  var lista = [];
  datos.conceptos.forEach(function (c) {
    var canon = canonicos[normalizar(c)];
    if (!canon) throw errorApp_('datos_invalidos', 'El concepto "' + String(c) + '" no está en la lista de Configuración.');
    if (lista.indexOf(canon) === -1) lista.push(canon);
  });
  var candado = tomarCandado_();
  try {
    guardarMapaLineas_(asignarConceptosEnMapa(leerMapaLineas_(), linea.concepto, lista));
    return lineasDelMes_(mes);
  } finally {
    candado.releaseLock();
  }
}

/** Acción 'editarLineaMeses': {fila, monto, desdeMes} → escribe el monto en ese mes y los siguientes (nunca pisa fórmulas). */
function accionEditarLineaMeses_(usuario, datos) {
  var fila = filaLineaValida_(datos.fila);
  if (datos.desdeMes === undefined || datos.desdeMes === null || datos.desdeMes === '') throw errorApp_('datos_invalidos', 'Falta el mes.');
  var desdeMes = mesValido_(datos.desdeMes);
  var revisado = validarMontoPresupuesto(datos.monto);
  if (revisado.error) throw errorApp_('datos_invalidos', revisado.error);
  var hoja = obtenerHoja_(HOJA_PRESUPUESTO);
  var candado = tomarCandado_();
  try {
    var rango = hoja.getDataRange();
    var p = leerPresupuesto(rango.getDisplayValues(), rango.getValues(), desdeMes, rango.getNotes());
    if (!p) throw errorApp_('datos_invalidos', 'Ese mes no está en el presupuesto.');
    var linea = lineaPorFila_(p, fila);
    if (datos.nombre !== undefined && normalizar(datos.nombre) !== normalizar(linea.concepto)) {
      throw errorApp_('datos_invalidos', 'Esa línea del presupuesto cambió. Actualiza y vuelve a intentar.');
    }
    var r = escribirMontoDesde_(hoja, p, fila, revisado.monto, desdeMes, false);
    SpreadsheetApp.flush();
    return { actualizados: r.actualizados, omitidos: r.omitidos, fila: fila, monto: revisado.monto, desdeMes: desdeMes };
  } finally {
    candado.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Motor 1.5.1 · Íconos de los tipos de gasto (propiedad FINFAMILY_ICONOS)
// ---------------------------------------------------------------------------

function leerIconos_() {
  return iconosDesde(propiedad_(PROPIEDAD_ICONOS));
}

function guardarIconos_(mapa) {
  PropertiesService.getScriptProperties().setProperty(PROPIEDAD_ICONOS, JSON.stringify(mapa));
}

/** Pasa el ícono de un concepto a otro nombre (al renombrar) o lo borra si `a` es null (al quitar). */
function moverIcono_(de, a) {
  var mapa = leerIconos_();
  var kDe = normalizar(de);
  if (!Object.prototype.hasOwnProperty.call(mapa, kDe)) return;
  var icono = mapa[kDe];
  delete mapa[kDe];
  if (a) mapa[normalizar(a)] = icono;
  guardarIconos_(mapa);
}

/**
 * Acción 'guardarIconoConcepto': {concepto, icono} → {iconos}. El concepto debe existir en
 * Configuración; el ícono es un nombre corto (a-z, 0-9, - y _, hasta 30) y '' borra la elección.
 */
function accionGuardarIconoConcepto_(usuario, datos) {
  var conf = leerConfiguracion_();
  var buscado = normalizar(datos.concepto);
  var concepto = null;
  for (var i = 0; i < conf.conceptos.length; i++) if (normalizar(conf.conceptos[i]) === buscado) concepto = conf.conceptos[i];
  if (!concepto) throw errorApp_('datos_invalidos', 'El concepto no está en la lista de Configuración.');
  var icono = String(datos.icono === undefined || datos.icono === null ? '' : datos.icono).trim().toLowerCase();
  if (icono && !iconoValido(icono)) {
    throw errorApp_('datos_invalidos', 'El nombre del ícono debe tener de 1 a 30 letras minúsculas, números, guion o guion bajo.');
  }
  var candado = tomarCandado_();
  try {
    var mapa = leerIconos_();
    if (icono) mapa[normalizar(concepto)] = icono; else delete mapa[normalizar(concepto)];
    guardarIconos_(mapa);
    return { iconos: iconosConNombres(mapa, conf.conceptos) };
  } finally {
    candado.releaseLock();
  }
}
