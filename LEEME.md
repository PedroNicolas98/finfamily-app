# FinFamily — Guía de instalación paso a paso

Esta guía es para Pedro Nicolás y Britney. No necesitan saber programar: solo seguir los pasos en orden, copiar y pegar. Todo es **gratis**.

Tiempo aproximado: 45 minutos la primera vez.

---

## 0. Antes de empezar

Necesitan:

- Una computadora con Google Chrome (o Edge).
- La cuenta de Google **dueña** del Sheets de presupuesto familiar.
- Los correos Gmail de los dos (Pedro y Britney).
- Esta carpeta `finfamily` en la computadora.

> Consejo: antes de empezar, hagan una copia de seguridad del Sheets (en el Sheets: **Archivo › Hacer una copia**). Es solo por tranquilidad; la app no borra nada.

---

## 1. ¿Qué es cada parte?

FinFamily tiene tres piezas. Piénsenlo como una tienda:

| Pieza | ¿Qué es? | Comparación |
|---|---|---|
| **Su Google Sheets** | Donde ya están sus tarjetas, gastos hormiga y presupuesto. No cambia. | El almacén |
| **Apps Script** (archivos `Codigo.gs`, `Logica.gs`, `appsscript.json`) | Un pequeño programa que vive en Google y hace de **puente** entre la app y su Sheets. Es el único que puede leer y escribir en el Sheets. | El encargado del almacén |
| **App web** (carpeta `web/`) | Lo que **instalan en el celular** y la computadora. Muestra el saldo, las tarjetas y permite registrar gastos. | El mostrador |
| **ID de cliente de Google** | Permite que inicien sesión con su cuenta de Google, para que solo ustedes dos puedan usar la app. | El fotocheck en la puerta |

Cómo funciona: abren la app → inician sesión con Google → la app le pide datos al puente (Apps Script) → el puente revisa que sean ustedes y lee o escribe en el Sheets.

---

## 2. Crear el ID de cliente de Google (Google Cloud Console)

Esto sirve para el botón "Iniciar sesión con Google". Háganlo con la cuenta dueña del Sheets.

> En este paso necesitan la dirección donde quedará la app (paso 5). Si todavía no la tienen, pueden hacer el paso 5 primero y volver aquí, o dejar el campo de orígenes para después y completarlo cuando la tengan.
> La dirección de GitHub Pages tiene esta forma: `https://SU-USUARIO.github.io`

1. Entren a <https://console.cloud.google.com/> e inicien sesión.
2. Arriba, al lado del logo, hagan clic en el selector de proyectos › **Proyecto nuevo**. Nombre: `FinFamily`. Clic en **Crear**. Asegúrense de que quede seleccionado arriba.
3. En el buscador de arriba escriban **"Google Auth Platform"** (o "Pantalla de consentimiento de OAuth") y entren.
4. Clic en **Comenzar** (Get started) y completen:
   - **Nombre de la app:** `FinFamily`
   - **Correo de asistencia:** su correo.
   - **Público (Audience):** elijan **Externo**.
   - **Información de contacto:** su correo.
   - Acepten la política y clic en **Crear**.
5. Vayan a **Público** (Audience). Debe decir **"En prueba"** (Testing). **Déjenlo así**: no hace falta publicarla.
6. En la misma pantalla, en **Usuarios de prueba**, clic en **Agregar usuarios** y pongan **los dos correos** (el de Pedro y el de Britney). Guardar.
7. Vayan a **Clientes** (Clients) › **Crear cliente**:
   - **Tipo de aplicación:** `Aplicación web`.
   - **Nombre:** `FinFamily web`.
   - **Orígenes autorizados de JavaScript** › **Agregar URI**: pongan la dirección de la app **sin nada después del dominio**, por ejemplo `https://su-usuario.github.io` (sin `/finfamily/` al final y sin barra final).
     - Si usan Netlify, agreguen también esa dirección, por ejemplo `https://finfamily-casa.netlify.app`.
   - **URI de redireccionamiento autorizados:** déjenlo vacío.
   - Clic en **Crear**.
8. Aparecerá el **ID de cliente**, algo como `123456789-abc...apps.googleusercontent.com`. **Cópienlo** en un bloc de notas: lo usarán en los pasos 3 y 4.
   - No necesitan el "secreto de cliente".

> Los cambios en los orígenes pueden tardar de 5 minutos a unas horas en funcionar.

---

## 3. Crear el proyecto de Apps Script (el puente)

> **Cómo quedó instalado hoy (4 nov 2026):** el puente vive **dentro del Apps Script del propio Sheets**, el proyecto "Registro de Gastos B&P" (Extensiones › Apps Script), en dos archivos: `FinFamily_Puente.gs` (= `Codigo.gs` de esta carpeta) y `FinFamily_Logica.gs` (= `Logica.gs`). No se usa `appsscript.json` de esta carpeta: el proyecto del Sheets mantiene su propio manifiesto.
>
> - Ese proyecto ya tenía su `doGet` (el dashboard). Se le agregó al inicio una verificación (`bpEsDuenioDashboard_`) para que el dashboard **solo se muestre al dueño**; cualquier otra visita recibe `{"servicio":"FinFamily"}`.
> - FinFamily tiene su propia implementación: **"FinFamily - app del celular"** (Ejecutar como: Yo · Acceso: Cualquier usuario). Las implementaciones anteriores del dashboard y formulario siguen igual.
> - Para autorizar permisos nuevos: en el editor elijan la función `finfamilyAutorizar` y toquen **Ejecutar**.
> - Al cambiar el código de FinFamily: Implementar › Gestionar implementaciones › "FinFamily - app del celular" › lápiz › Versión: **Nueva versión** › Implementar. La URL no cambia.
>
> Los pasos de abajo describen la alternativa de un proyecto independiente, por si algún día lo necesitan.

**Alternativa:** un proyecto **nuevo e independiente**, separado del Apps Script del Sheets.

### 3.1 Crear el proyecto y pegar los archivos

1. Con la cuenta dueña del Sheets, entren a <https://script.google.com/> › **Nuevo proyecto**.
2. Arriba a la izquierda, cambien el nombre "Proyecto sin título" por `FinFamily puente`.
3. Mostrar el archivo de configuración: en el menú de la izquierda clic en el **engranaje (Configuración del proyecto)** › marquen **"Mostrar el archivo de manifiesto 'appsscript.json' en el editor"**.
4. Vuelvan al editor (icono `< >`). Verán `Código.gs` y `appsscript.json`.
5. **Codigo.gs:**
   - Abran el archivo `Código.gs` que ya existe, borren todo su contenido.
   - Abran en la computadora el archivo `Codigo.gs` de esta carpeta (con el Bloc de notas), copien **todo** y péguenlo ahí.
   - (Si quieren, cámbienle el nombre a `Codigo` con los tres puntitos › Cambiar nombre. No es obligatorio.)
6. **Logica.gs:**
   - Clic en el **+** al lado de "Archivos" › **Secuencia de comandos**. Nómbrenlo `Logica`.
   - Borren lo que trae, peguen **todo** el contenido del archivo `Logica.gs` de esta carpeta.
7. **appsscript.json:**
   - Ábranlo, borren todo y peguen el contenido del archivo `appsscript.json` de esta carpeta.
8. Clic en el **disquete (Guardar)**.

### 3.2 Configurar las Propiedades del script

Aquí se guardan los datos privados, **fuera del código**.

1. Clic en el **engranaje (Configuración del proyecto)**.
2. Bajen hasta **Propiedades de la secuencia de comandos** › **Editar propiedades de la secuencia de comandos** › **Agregar propiedad**. Agreguen estas tres:

| Propiedad | Valor |
|---|---|
| `SHEET_ID` | El código largo de la dirección de su Sheets. En `https://docs.google.com/spreadsheets/d/`**`ESTE-CODIGO-LARGO`**`/edit`, copien solo la parte del medio. |
| `CLIENT_ID` | El ID de cliente que copiaron en el paso 2 (termina en `.apps.googleusercontent.com`). |
| `USUARIOS` | El texto de abajo, con sus correos reales. |

Valor de `USUARIOS` (cambien los correos por los suyos; **todo en una sola línea**):

```json
{"correo-de-pedro@gmail.com":{"nombre":"Pedro Nicolás","clave":"P"},"correo-de-britney@gmail.com":{"nombre":"Britney","clave":"B"}}
```

Cuidado con:

- Los correos van **en minúsculas**.
- El `nombre` debe ser **exactamente** igual a como aparece en la columna **Responsable** del Sheets: `Pedro Nicolás` (con tilde) y `Britney`.
- Usen comillas rectas `"` (no las curvas “ ” que pone Word o WhatsApp). Lo más seguro es copiar desde aquí y solo cambiar los correos.

3. Clic en **Guardar propiedades de la secuencia de comandos**.

### 3.3 Dar permisos por primera vez

1. Vuelvan al editor, abran `Codigo.gs`.
2. Arriba, en la lista de funciones, elijan `doGet` y clic en **Ejecutar**.
3. Google pedirá permisos: **Revisar permisos** › elijan su cuenta.
4. Saldrá "Google no ha verificado esta app". Es normal porque la app es suya: clic en **Configuración avanzada** › **Ir a FinFamily puente (no seguro)** › **Permitir**.
   - Pide permiso para ver y editar sus hojas de cálculo y para conectarse a servicios externos (esto último es solo para verificar el inicio de sesión con Google).

### 3.4 Implementar como aplicación web y copiar la URL

1. Arriba a la derecha: **Implementar** › **Nueva implementación**.
2. En el engranaje de "Seleccionar tipo", elijan **Aplicación web**.
3. Completen:
   - **Descripción:** `FinFamily v1`
   - **Ejecutar como:** **Yo** (su correo).
   - **Quién tiene acceso:** **Cualquier usuario** (Anyone).
     > Tranquilos: aunque diga "cualquier usuario", el puente **rechaza** a cualquiera que no haya iniciado sesión con uno de los dos correos de `USUARIOS`. Sin eso, la app del celular no podría conectarse.
4. Clic en **Implementar**. Copien la **URL de la aplicación web** (termina en `/exec`). Guárdenla en el bloc de notas.
5. Prueba rápida: peguen esa URL en el navegador. Debe aparecer algo como `{"ok":true,"datos":{"servicio":"FinFamily",...}}`. No muestra datos de su Sheets: es normal.

### 3.5 Cuando cambien el código más adelante

Cada vez que modifiquen algo en Apps Script (por ejemplo, las fechas de tarjetas del paso 8), hay que **publicar una nueva versión** para que la app la use, **manteniendo la misma URL**:

**Implementar** › **Administrar implementaciones** › clic en el **lápiz (Editar)** › en **Versión** elijan **Nueva versión** › **Implementar**.

> No usen "Nueva implementación" para actualizar: eso crea una URL distinta y habría que cambiarla en `config.js`.

---

## 4. Completar `web/config.js`

1. Abran el archivo `web/config.js` con el Bloc de notas.
2. Verán algo así:

```js
export const API_URL = 'PEGAR_AQUI';
export const CLIENT_ID = 'PEGAR_AQUI';
export const DIAS_AVISO = 3;
```

3. Reemplacen:
   - En `API_URL`, el primer `PEGAR_AQUI` por la URL `/exec` del paso 3.4.
   - En `CLIENT_ID`, el segundo `PEGAR_AQUI` por el ID de cliente del paso 2.
   - Dejen las comillas simples `'...'` alrededor.
   - `DIAS_AVISO` es cuántos días antes del vencimiento la app les avisa. Pueden dejar `3`.
4. Guarden el archivo.

> Estos dos valores no son contraseñas: es normal que se vean en la app publicada. La seguridad está en que solo sus dos correos pueden iniciar sesión y el puente lo verifica en cada petición.
> Los datos del Sheets **nunca** van dentro de la carpeta `web/`: la app los pide al puente cada vez.

---

## 5. Publicar la app en internet

### Opción A: GitHub Pages (recomendada)

1. Creen una cuenta gratis en <https://github.com/> (si no tienen).
2. Arriba a la derecha **+** › **New repository**:
   - **Repository name:** `finfamily`
   - **Public** (GitHub Pages gratis requiere repositorio público; no contiene datos suyos, solo la app).
   - Clic en **Create repository**.
3. En la página del repositorio, clic en **uploading an existing file** (o **Add file › Upload files**).
4. Abran la carpeta `web/` en la computadora, **seleccionen todo lo que hay dentro** (no la carpeta en sí, sino su contenido: `index.html`, `config.js`, etc.) y arrástrenlo a la página.
   - Así `index.html` queda en la raíz del repositorio.
5. Abajo, clic en **Commit changes**.
6. Vayan a **Settings** › **Pages** (menú izquierdo):
   - **Source:** `Deploy from a branch`.
   - **Branch:** `main` y carpeta `/ (root)`. Clic en **Save**.
7. Esperen 1 o 2 minutos y recarguen. Arriba aparecerá: "Your site is live at `https://su-usuario.github.io/finfamily/`". **Esa es la dirección de la app.**
8. Vuelvan al paso 2, punto 7, y confirmen que en **Orígenes autorizados** está `https://su-usuario.github.io` (sin `/finfamily`).

Para actualizar la app más adelante: suban de nuevo los archivos cambiados con **Add file › Upload files** (reemplazan a los anteriores) y **Commit changes**.

### Opción B: sin GitHub — Netlify Drop

1. Entren a <https://app.netlify.com/drop>.
2. Arrastren la **carpeta `web/`** completa a la página.
3. En segundos les da una dirección como `https://nombre-raro-123.netlify.app`.
4. Creen una cuenta gratis en Netlify (o inicien sesión) para que el sitio **no se borre** y para poder cambiarle el nombre (Site configuration › Change site name).
5. Agreguen esa dirección en **Orígenes autorizados** (paso 2, punto 7).

Para actualizar: en Netlify › su sitio › **Deploys** › arrastren otra vez la carpeta `web/`.

---

## 6. Instalar la app

### En Android (cada uno en su celular)

1. Abran **Chrome** y entren a la dirección de la app (ej. `https://su-usuario.github.io/finfamily/`).
2. Inicien sesión con su cuenta de Google (cada uno con la suya).
3. Toquen los **tres puntitos ⋮** arriba a la derecha › **Instalar app** (en algunos celulares dice **Agregar a la pantalla principal**) › **Instalar**.
4. Aparecerá el ícono de FinFamily en su pantalla, como cualquier otra app.

### En iPhone (por si acaso)

En **Safari** › botón **Compartir** (cuadrito con flecha) › **Agregar a inicio**.

### En la computadora

1. Abran la dirección en **Chrome** o **Edge**.
2. En la barra de direcciones, a la derecha, aparece un ícono de **instalar** (una pantallita con flecha). Clic › **Instalar**.
   - O desde el menú **⋮** › **Transmitir, guardar y compartir** › **Instalar página como app** (el nombre puede variar).
3. Queda en el menú de inicio / escritorio.

---

## 7. ¿Qué escribe la app en su Sheets y qué NO toca?

### Lo que SÍ hace

- **Lee** las hojas `PRESUPUESTO FAMILIAR`, `TC IBK`, `TC BCP`, `TC Ripley`, `TC SIP`, `Configuración` y `Gastos Hormiga`.
- **Agrega una fila nueva** cuando registran un gasto:
  - Si el medio de pago es una **tarjeta**: en la hoja de esa tarjeta (`TC SIP`, `TC IBK`, `TC BCP` o `TC Ripley`), con Estado **Pendiente**, y calcula la **Fecha de pago** y la **Fecha de vencimiento** según el ciclo de la tarjeta (en `TC Ripley` quedan vacías).
  - Si es **Yape, Plin o Efectivo**: en `Gastos Hormiga`, con Estado **Pagado**.
  - Escribe en la primera fila libre después de sus datos (respeta las filas vacías con formato que ya tienen).
  - El **Responsable** lo pone solo, según quién inició sesión (no se puede elegir).
  - En la columna `_ID_FORM` pone un código que empieza con `APP:` (así se distingue de lo que registra su formulario web, que usa `WEB:`), y en `_HUELLA_FORM` una firma de control.
- **Cambia el Estado a "Pagado"** cuando usan "Marcar estado como pagado" o "Marcar seleccionados". Antes de cambiarlo revisa que la fila siga teniendo el mismo monto y descripción; si alguien la cambió, no la toca y les avisa.
- Les avisa si un gasto parece **repetido** (misma fecha, monto y descripción) y les pregunta antes de guardarlo.
- Si no hay internet, guarda el gasto en el celular y lo envía solo cuando vuelva la conexión.

### Lo que NO hace

- **No crea hojas** nuevas.
- **No cambia fórmulas**, ni formatos, ni encabezados.
- **No borra filas** ni datos.
- **No escribe** en `PRESUPUESTO FAMILIAR` ni en `Configuración`: solo las lee. Los totales del presupuesto se muestran tal cual los calcula su Sheets.
- **No toca** su formulario web ni su Apps Script actual.

Si quieren agregar un nuevo concepto de gasto, agréguenlo en la hoja `Configuración`, en la columna **Conceptos de Gasto**: la app lo tomará solo.

---

## 8. Ajustar fechas de cierre y vencimiento de las tarjetas

Si el banco les cambia la fecha de cierre o de pago:

1. Entren a <https://script.google.com/> › proyecto `FinFamily puente` › archivo `Logica`.
2. Busquen (Ctrl + F) la palabra `CICLOS`. Verán algo así:

```js
const CICLOS = {
  SIP:    { cierre: 10,   vence: 3 },
  IBK_P:  { cierre: 20,   vence: 15 },   // TC Interbank de Pedro
  IBK_B:  { cierre: 20,   vence: 20 },   // TC Interbank de Britney
  BCP:    { cierre: 20,   vence: 20 },
  RIPLEY: { cierre: null, vence: null }  // sin fechas
};
```

3. Cambien **solo los números**:
   - `cierre`: último día del mes que entra en el estado de cuenta. Si compran **después** de ese día, el consumo pasa al mes siguiente.
   - `vence`: día del mes en que vence el pago (se cuenta en el mes siguiente al de pago).
   - `null` significa "sin fecha" (como Ripley).
4. Guarden (disquete) y publiquen una nueva versión (ver **paso 3.5**).

Ejemplo con `SIP` (cierre 10, vence 3): una compra del 12 de octubre queda con pago el 30 de noviembre y vencimiento el 3 de diciembre; una compra del 8 de octubre, con pago el 31 de octubre y vencimiento el 3 de noviembre.

> El cambio solo aplica a los gastos que registren **desde ahora**. Las filas que ya están en el Sheets no se modifican; si hace falta, corrijan esas fechas a mano en el Sheets.

---

## 9. Problemas comunes

| Lo que pasa | Qué hacer |
|---|---|
| Al iniciar sesión sale **"Error 400: origin_mismatch"** o "acceso bloqueado". | La dirección de la app no está en **Orígenes autorizados** (paso 2, punto 7). Pongan solo `https://su-usuario.github.io` (sin `/finfamily`, sin barra final). Esperen unos minutos y prueben otra vez. |
| Sale **"Acceso bloqueado: la app no completó el proceso de verificación"**. | Falta agregar ese correo en **Usuarios de prueba** (paso 2, punto 6). |
| La app dice **"No autorizado"** o pide iniciar sesión otra vez. | 1) Revisen que el correo esté en `USUARIOS` en minúsculas y bien escrito. 2) Que `CLIENT_ID` sea igual en las Propiedades del script y en `web/config.js`. 3) La sesión de Google dura cerca de una hora: vuelvan a iniciar sesión. Los gastos pendientes no se pierden. |
| Dice **"Hoja no encontrada"**. | Alguien cambió el nombre de una hoja. Los nombres deben ser exactamente: `PRESUPUESTO FAMILIAR`, `TC IBK`, `TC BCP`, `TC Ripley`, `TC SIP`, `Configuración`, `Gastos Hormiga`. Revisen también que `SHEET_ID` sea el correcto. |
| El presupuesto del mes sale vacío. | Ese mes no tiene columna en `PRESUPUESTO FAMILIAR` (por ejemplo, `ene-28`). Usen las flechas para ir a un mes que exista. |
| El gasto se guardó como de la otra persona. | Revisen que en `USUARIOS` cada correo tenga su `nombre` correcto. |
| Cambié algo en Apps Script y la app no lo nota. | Falta publicar una **nueva versión** (paso 3.5). |
| Cambié la app (carpeta `web/`) y en el celular sigue la versión anterior. | Cierren la app por completo y ábranla de nuevo (a veces dos veces). Si sigue igual: en Chrome, ⋮ › Configuración › Configuración de sitios › busquen la dirección de la app › **Borrar datos** (ojo: si había gastos sin enviar, se pierden; envíenlos antes). |
| La app dice **"Sin conexión"** o "En cola". | Los gastos quedan guardados en el celular y se envían solos al volver el internet o al abrir la app. No los registren dos veces. |
| Aparece algo en **"Por revisar"**. | La app encontró un gasto que parece repetido (misma fecha, monto y descripción). Entren y elijan **Guardar igual** o **Descartar**. |
| Al ejecutar en Apps Script sale "Google no ha verificado esta app". | Es normal (la app es suya): **Configuración avanzada** › **Ir a … (no seguro)** › **Permitir**. |
| Al abrir la URL `/exec` sale una página de inicio de sesión de Google o error. | En la implementación, **Quién tiene acceso** debe ser **Cualquier usuario**. Editen la implementación (paso 3.5) y cámbienlo. |
| Las fechas de pago o vencimiento salen mal. | Revisen los números en `CICLOS` (paso 8). |
| Su formulario web anterior dejó de funcionar. | FinFamily no lo toca. Verifiquen que no hayan pegado el código en el Apps Script antiguo; si fue así, restauren su versión anterior desde **Implementar › Administrar implementaciones** de ese proyecto o desde el historial de versiones. |

---

## Resumen de lo que deben guardar en su bloc de notas

- ID de cliente de Google (paso 2).
- URL `/exec` del Apps Script (paso 3.4).
- Dirección de la app (paso 5).

Ninguno es una contraseña, pero no hace falta compartirlos con nadie más.
