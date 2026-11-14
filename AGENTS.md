# Guía para agentes (Codex, Claude u otros)

FinFamily es una app de presupuesto del hogar que lee y escribe en una hoja de cálculo mediante un motor de Apps Script.
Esta guía resume la arquitectura, publicación y problemas técnicos conocidos. La configuración, identidad y datos reales
pertenecen al propietario y no se guardan en este repositorio público. Para contexto privado, consulta a la persona propietaria;
no infieras valores ni accedas a Sheets, Gmail o al motor desplegado. La guía de instalación es `LEEME.md`.

## Cómo trabajar con el usuario

- **Todo en español**, con palabras simples: respuestas, commits, comentarios de código y textos de la app. El código
  (nombres de variables y funciones) ya está en español; sigue igual.
- El usuario no programa. Prefiere que **hagas las cosas en vez de preguntar**, que no dejes nada a medias y que le
  expliques el resultado en pocas líneas (qué cambió, qué no, qué quedó pendiente).
- **No quiere pagar nada**: solo servicios gratuitos (GitHub Pages, Apps Script, Gmail).
- La hoja es la fuente de verdad. **Antes de escribir en la hoja real, pide permiso** (salvo que el usuario ya lo
  haya pedido explícitamente). Nunca borres datos sin confirmarlo.
- Gusto de diseño: profesional pero con vida, mucho movimiento, poco texto; nada de scroll interno (las ventanas
  deben caber enteras); preferir ventanitas (popups) a páginas nuevas; el mínimo de clics; metáforas físicas
  (vouchers de papel, tarjetas como plásticos reales); configuración simple.

## Partes del sistema

| Parte | Dónde | Notas |
|---|---|---|
| App web (PWA) | `web/` | JavaScript sin frameworks (módulos ES). `app.js` es casi toda la app, `api.js` habla con el motor, `cola.js` guarda envíos sin conexión, `estilos.css`, `sw.js` (service worker). `gasto.html` es una segunda app instalable solo para registrar gastos (mismo `app.js`). |
| Motor | `apps-script/Codigo.gs` (acciones, acceso a la hoja, Gmail) y `apps-script/Logica.gs` (funciones puras, se prueban en Node) | Se copia al proyecto privado de Apps Script con los nombres de archivo acordados por su propietario. No modifiques formularios ni paneles antiguos. |
| Pruebas | `tests/*.test.js` | `npm test` (Node 20+, sin dependencias). Simulan la hoja, Gmail y los servicios de Google. |
| Herramientas | `herramientas/` | App de práctica con motor simulado y banco de capturas (ver `herramientas/LEEME.md`). |

Configuración: `web/config.js` contiene la URL pública del motor y el OAuth Client ID que necesita el navegador. El ID
de la hoja debe existir solamente en la propiedad privada y obligatoria `SHEET_ID` del proyecto de Apps Script. No lo
incluyas en código, pruebas, ejemplos ni commits. El motor usa la zona horaria declarada en `appsscript.json`.

## Publicar

### Web (GitHub Pages)
1. Sube `VERSION` en `web/sw.js` (`finfamily-vNN`) en cada publicación; si no, los celulares siguen con la versión vieja.
2. Commit y push a `main`.
3. Publica la carpeta `web` en la rama `gh-pages`:
   ```bash
   git branch -D gh-pages; git subtree split --prefix web -b gh-pages; git push -f origin gh-pages
   ```
4. Comprueba que `https://SU-USUARIO.github.io/finfamily-app/sw.js` ya diga la versión nueva (tarda 1 a 3 minutos).

### Motor (Apps Script)
1. Sube `VERSION` en `Codigo.gs` (la app la lee con la acción `version` y esconde lo que el motor aún no tiene:
   `motorLector()`, `motorBolsas()`, `motorPagadoCon()`, etc. en `app.js`).
2. `npm test` debe pasar completo.
3. Reemplaza el contenido de `FinFamily_Puente.gs` (con `Codigo.gs`) y `FinFamily_Logica.gs` (con `Logica.gs`) en el
   editor del proyecto privado de Apps Script y guarda. **Los activadores (lector de Gmail cada
   10 minutos, avisos) usan el código guardado al instante.**
4. Para la app: Implementar › Gestionar implementaciones › la implementación cuyo ID está en `web/config.js` › Editar ›
   Versión: **Versión nueva** › Implementar. No se ha verificado la configuración ni la versión desplegada.
5. Alternativa sin navegador: `clasp` (requiere que el usuario lo autorice con su cuenta; `.clasp.json` está en `.gitignore`).

## La hoja (datos que importan)

- **Presupuesto**: fila 2 meses; filas de ingresos, gastos y ahorros; luego totales y saldos. Las fórmulas de la hoja
  son la fuente de verdad. No copies importes, movimientos, meses ni comercios reales a la documentación pública.
  Las líneas de tarjetas
  (`SUMAR.SI.CONJUNTO` sobre la columna **Fecha de pago** de cada hoja TC: una compra con tarjeta cuenta en el mes en que
  se paga, no en el que se compró); 11-24 gastos; 25-27 ahorros (Ahorro Casa, Ahorro Viaje, Fondo de Emergencia);
  TOTAL GASTOS, TOTAL AHORROS y SALDO. **Gastos Hormiga no entra al saldo.**
- **Hojas TC** (`TC SIP`, `TC IBK`, `TC BCP`, `TC Ripley`): encabezado en la fila 2. Columnas: Responsable, Mes, Fecha,
  Concepto, Descripción, Monto, Fecha de pago, Fecha de vencimiento, Estado, Nota, `_ID_FORM`, `_HUELLA_FORM`.
- **Gastos Hormiga** (Yape, Plin, Efectivo, Lemon): encabezado en la fila 3. Columnas: Responsable, Mes, Fecha,
  Concepto, Descripción, Monto, Medio de Pago, Estado, Nota, `_ID_FORM`, `_HUELLA_FORM`.
- **Por confirmar**: consumos leídos de Gmail que esperan que el usuario elija el tipo de gasto.
- **Configuración**: tipos de gasto (conceptos).
- Los ciclos y la asignación de titulares dependen del catálogo privado (`FINFAMILY_CATALOGO`) y de `USUARIOS`; no
  documentes titulares, emisores personales, dígitos ni valores reales. Los identificadores internos de tarjetas se
  conservan por compatibilidad.
- `_ID_FORM`: `APP:<idCliente>` + sufijos opcionales `|TC:<tarjeta>` (tarjeta prestada) y `|OR:<origen codificado>`
  (de dónde sale: vacío = fondo común, `P:<persona>` = sobrante personal, `A:<línea de ahorro>`). Las filas del
  formulario viejo usan `WEB:` o nada.
- `_HUELLA_FORM` debe ser **SHA-256 en hexadecimal (64 caracteres)**: el formulario B&P viejo rechaza la hoja entera si
  no. El motor la cifra (`hashHex_`).

## Reglas de negocio

- Los tiempos de cobro, distribución de ingresos y fuente de cada gasto son privados y configurables; no publiques ejemplos concretos. Solicita a la persona propietaria cualquier dato privado necesario y no inventes valores.
  No publiques reglas particulares, titulares ni ejemplos reales; pedí al propietario el contexto privado necesario.
- Los envíos de Lemon suelen ser pasajes (la app sugiere “Pasajes y Transporte”). Dale no manda correos.
- Lo que se manda a uno mismo (Yape al propio número, Lemon a la propia tarjeta) no es gasto.
- No modifiques celdas de la hoja, registros ni fórmulas sin autorización explícita del propietario.

## Trampas conocidas (ya resueltas; no las reintroduzcas)

- **Zona horaria**: la hoja está en hora de **California** y el motor en hora de Lima. Escribir un `Date` de medianoche
  de Lima deja la celda a las 9 p. m. del día anterior. Escribe siempre con `fechaParaHoja_()` (motor 1.8.5).
- **Gmail**: `getPlainBody()` no es lo que se ve en pantalla. Pone asteriscos donde había negritas (`*Monto de yapeo**`)
  y convierte listas en `- Nombre: X`; Lemon solo manda HTML. Prueba siempre con el texto plano real.
- **gviz** (`/gviz/tq`) se salta filas vacías: no deduzcas números de fila de ahí; usa `export?format=csv&gid=…`.
- Los pasos únicos del motor (`…UnaVez_`) quedan anotados en las Propiedades del script (`FINFAMILY_*`): si cambias uno,
  usa una propiedad nueva.
- Nunca pises una celda con fórmula (`escribirFila_` y `editarGasto` ya lo cuidan).
- El lector marca los hilos con la etiqueta de Gmail `FinFamily/Leído`.

## Funciones del motor 1.22–1.27 (qué guardan y dónde)

- **Pagos fijos por correo** (`revisarPagosDeServicios_`, corre dentro de `leerCorreosDeBancos`): `FINFAMILY_PAGOS_FIJOS`
  (ids leídos 8 días, máx. 100, y pagos por mes/línea; la propiedad no pasa de ~9 KB: `guardarRegistroPagos_` poda),
  `FINFAMILY_PAGOS_HISTORIA_V2` (lectura única de 75 días), `FINFAMILY_FIJOS_HECHOS` (marcas `correo|…`, `cobro|…`).
  Las empresas de cada línea viven en `FINFAMILY_FIJOS` (`palabras`); si no hay, `palabrasDeFijo` usa un valor por nombre.
- **Apartados** (`apartadosDeLineas`): líneas con la cuenta entre paréntesis («Alimentación (BCP-DEB-PE)») que guardan lo que
  no se gasta; ajuste manual en `FINFAMILY_APARTADOS`. Renombrar o quitar una línea migra estas claves (`migrarClaveLinea_`).
- Otros: `FINFAMILY_META_ANUAL` (meta de ahorro por año), `FINFAMILY_RECORDATORIO_ANOTAR`.
- Al pegar el motor en el editor de Apps Script, comprueba que el archivo abierto sea el correcto antes de reemplazarlo
  (si un clic falla, queda abierto otro archivo) y guarda con el botón de la barra.

## Probar

- `npm test` antes de cada publicación del motor.
- App de práctica: copia `herramientas/prueba.html` y `herramientas/prueba-datos.ejemplo.json` a `web/` (están en
  `.gitignore` para que no se publiquen) y sirve `web/` en `http://localhost:8765/`. Abre
  `prueba.html?motor=19#inicio` (otros: `#tarjeta-BCP`, `#movimientos`, `#registrar`, `?modo=oscuro`). No toca la hoja
  real; registra lo que enviaría en `window.__llamadas`. Los datos de ejemplo son inventados.
- Capturas y animaciones: `herramientas/banco.mjs` (Edge sin ventana). Ver `herramientas/LEEME.md`.

## Contexto privado

Este repositorio no documenta personas, presupuestos, saldos, movimientos ni la configuración privada del propietario.
Si una tarea depende de esos datos, pedí al propietario que proporcione el contexto necesario. Nunca intentes obtenerlo
desde servicios reales ni rellenes valores faltantes con suposiciones.
