# Herramientas de prueba de FinFamily

Nada de esta carpeta se publica en la web ni toca la hoja real.

## App de práctica (`prueba.html`)

Es la app completa con un **motor simulado**: no pide sesión y no escribe en el Sheets.

1. Copia `prueba.html` y `prueba-datos.ejemplo.json` a `web/` (git los ignora ahí, así no se publican).
2. Sirve la carpeta `web/` en `http://localhost:8765/` (por ejemplo `npx http-server web -p 8765 -c-1`).
3. Abre `http://localhost:8765/prueba.html?motor=19#inicio`.

- `?motor=` elige qué versión del motor imita: `12`, `13`, `14`, `15`, `151`, `16`, `18`, `19` (sin el parámetro, 1.7.0).
  Sirve para comprobar que la app esconde lo que un motor viejo no tiene.
- Pantallas: `#inicio`, `#tarjetas`, `#tarjeta-SIP` (también `IBK_P`, `IBK_B`, `BCP`, `RIPLEY`, `HORMIGA`), `#movimientos`,
  `#presupuesto`, `#registrar`, `#configuracion`.
- Otros: `?modo=oscuro`, `?color=esmeralda|turquesa|coral`, `?app=gasto` (la app solo para registrar), `?foto=1`.
- Cambia el número de `?b=` en cada prueba para evitar la memoria del navegador. Si cambian los datos de ejemplo,
  borra el almacenamiento del sitio (`localStorage.clear()`).
- Todo lo que la app mandaría al motor queda en `window.__llamadas` (acción y datos).
- Los datos de `prueba-datos.ejemplo.json` son **inventados** (mismo formato que los reales, montos cambiados,
  descripciones genéricas). Si en tu computadora existe `web/prueba-datos.local.json` (datos reales, ignorado por git),
  se usa ese primero. `receptor.py` sirve para guardar ese archivo desde la app real: recibe una sola vez lo que se le
  envía por POST al puerto 8766.

## Banco de capturas (`banco.mjs`)

Toma capturas reales de la app con Microsoft Edge sin ventana (ruta de Edge para Windows dentro del archivo).
Necesita la app servida en `http://localhost:8765/`.

```bash
BANCO_SALIDA="<carpeta de capturas>" BANCO_PUERTO=<puerto libre> BANCO_PERFIL="<carpeta de perfil>" node herramientas/banco.mjs <escenas.json>
```

`escenas.json` es una lista: `{ "nombre", "url", "ancho" (1534), "alto" (704), "movil" (false), "espera" (ms tras cargar, 2500),
"js" (código que corre en la página; puede usar await y devolver un texto que se imprime), "congelar" (ms en que detiene una
transición de páginas), "despues" (ms antes de la captura, 400) }`. Para celular: `"ancho": 390, "alto": 844, "movil": true`.
Guarda `<nombre>.png` en la carpeta de salida.

- En `js` no uses expresiones regulares con barras ni `\n`: se rompen al pasar por JSON (usa `String.fromCharCode(10)`).
- Edge sin ventana no avanza las animaciones solo: para revisarlas, lee `document.getAnimations()` y fija `currentTime`.
  Una animación no se da por buena con un solo cuadro: revisa una tira de varios cuadros.

## Íconos (`iconos.mjs`)

Genera los íconos de instalación a partir del logo (casa de una línea con flecha): `node herramientas/iconos.mjs web`.
