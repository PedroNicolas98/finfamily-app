/**
 * Paso único (se pega en el proyecto de Apps Script y se ejecuta una vez): agrega al presupuesto las filas
 * que separan las TC personales de las compartidas y muestran lo que le queda de verdad a cada persona
 * (filas 34 a 40). No cambia ninguna fórmula existente. Se puede repetir (reescribe solo las filas 34 a 40).
 * Para deshacerlo: quitarSaldosPersonales().
 *
 * Usa la columna _ID_FORM de cada hoja TC (sufijo |OR:): cualquier origen distinto del fondo común, y P:<persona>
 * para el sobrante de cada uno. Los nombres salen de la propiedad USUARIOS (no están en este archivo).
 */
function instalarSaldosPersonales() {
  var h = SpreadsheetApp.getActive().getSheetByName('PRESUPUESTO FAMILIAR');
  if (!h) throw new Error('No encuentro la hoja PRESUPUESTO FAMILIAR');
  var esperado = { 29: 'TOTAL GASTOS', 30: 'TOTAL AHORROS', 31: 'SALDO / SUPERÁVIT FINAL', 32: 'SALDO INDIVIDUAL' };
  Object.keys(esperado).forEach(function (f) {
    var v = String(h.getRange(Number(f), 1).getDisplayValue()).trim();
    if (v !== esperado[f]) throw new Error('La fila ' + f + ' debería ser "' + esperado[f] + '" y es "' + v + '". No toqué nada.');
  });
  if (String(h.getRange('B2').getDisplayValue()).trim() === '') throw new Error('No encuentro los meses en la fila 2. No toqué nada.');
  var usuarios = JSON.parse(PropertiesService.getScriptProperties().getProperty('USUARIOS') || '{}');
  var nombres = Object.keys(usuarios).map(function (k) { return usuarios[k].nombre; });
  if (nombres.length !== 2) throw new Error('Esperaba 2 personas y hay ' + nombres.length + '. No toqué nada.');
  var fila33 = h.getRange('A33:R33');
  if (fila33.getValues()[0].join('') !== '' || fila33.getFormulas()[0].join('') !== '') throw new Error('La fila 33 no está libre. No toqué nada.');
  var cols = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'];
  var tcs = [['TC IBK', 'J'], ['TC BCP', 'K'], ['TC Ripley', 'K'], ['TC SIP', 'K']]; // hoja y columna de _ID_FORM
  function suma(c, patron) {
    return '=' + tcs.map(function (t) {
      var n = "'" + t[0] + "'!";
      return 'SUMIFS(' + n + '$F$3:$F,' + n + '$G$3:$G,">="&' + c + '$2,' + n + '$G$3:$G,"<="&EOMONTH(' + c + '$2,0),' + n + '$' + t[1] + '$3:$' + t[1] + ',"' + patron + '")';
    }).join('+');
  }
  var codigo = function (nombre) { return '*|OR:' + encodeURIComponent('P:' + nombre) + '*'; };
  var filas = [
    { f: 34, etiqueta: 'TC con sobrante o ahorro', formula: function (c) { return suma(c, '*|OR:*'); } },
    { f: 35, etiqueta: 'SALDO COMÚN', formula: function (c) { return '=' + c + '31+' + c + '34'; } },
    { f: 36, etiqueta: 'SALDO COMÚN / PERSONA', formula: function (c) { return '=' + c + '35/2'; } },
    { f: 37, etiqueta: 'TC personal - ' + nombres[0], formula: function (c) { return suma(c, codigo(nombres[0])); } },
    { f: 38, etiqueta: 'TC personal - ' + nombres[1], formula: function (c) { return suma(c, codigo(nombres[1])); } },
    { f: 39, etiqueta: 'QUEDA REAL - ' + nombres[0], formula: function (c) { return '=' + c + '36-' + c + '37'; } },
    { f: 40, etiqueta: 'QUEDA REAL - ' + nombres[1], formula: function (c) { return '=' + c + '36-' + c + '38'; } }
  ];
  h.getRange('A34:R40').clearContent();
  h.getRange('A32:R32').copyTo(h.getRange('A34:R40'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  filas.forEach(function (r) {
    h.getRange(r.f, 1).setValue(r.etiqueta);
    cols.forEach(function (c) { h.getRange(c + r.f).setFormula(r.formula(c)); });
    h.getRange('E' + r.f).setFormula('=SUM(B' + r.f + ':D' + r.f + ')');
    h.getRange('R' + r.f).setFormula('=SUM(F' + r.f + ':Q' + r.f + ')');
  });
  SpreadsheetApp.flush();
  Logger.log('Listo: filas 34 a 40 escritas para ' + nombres.join(' y '));
}

/** Deshace el paso anterior: borra las filas 34 a 40. */
function quitarSaldosPersonales() {
  var h = SpreadsheetApp.getActive().getSheetByName('PRESUPUESTO FAMILIAR');
  h.getRange('A34:R40').clear();
}
