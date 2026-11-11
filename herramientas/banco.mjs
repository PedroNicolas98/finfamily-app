// Banco de pruebas visual: maneja Edge sin ventana por su puerto de depuración y guarda capturas.
// Uso: node banco.mjs escenas.json   → [{ nombre, url, ancho, alto, espera, js, congelar, despues }]
//  - js: código (puede usar await) que se ejecuta en la página después de cargar
//  - congelar: milisegundos en los que se detiene la transición entre páginas que dispare ese js
//  - despues: milisegundos de espera antes de la captura
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const escenas = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// Cada quien usa su propia carpeta, puerto y perfil (variables BANCO_SALIDA, BANCO_PUERTO y BANCO_PERFIL) para no pisarse.
const salida = process.env.BANCO_SALIDA || join(aqui, 'capturas');
mkdirSync(salida, { recursive: true });
const PUERTO = Number(process.env.BANCO_PUERTO) || 9333;
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${process.env.BANCO_PERFIL || join(aqui, 'perfil-banco')}`,
  '--hide-scrollbars', '--window-size=1534,704', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let destino;
for (let i = 0; i < 50 && !destino; i++) {
  await dormir(200);
  try { destino = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* aún no abre */ }
}
if (!destino) { console.log('Edge no abrió'); edge.kill(); process.exit(1); }
const ws = new WebSocket(destino.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const espera = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && espera.has(m.id)) { espera.get(m.id)(m); espera.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; espera.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluar = async (codigo) => {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${codigo} })()`, awaitPromise: true, returnByValue: true });
  return r.result?.exceptionDetails ? 'ERROR: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable');

for (const e of escenas) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: e.ancho || 1534, height: e.alto || 704, deviceScaleFactor: e.escala || 1, mobile: !!e.movil });
  await cdp('Page.navigate', { url: e.url });
  await dormir(e.espera ?? 2500);
  let nota = '';
  if (e.js) {
    const congelar = e.congelar == null ? '' : `
      await new Promise((listo) => {
        const fin = setTimeout(() => listo(), 3000);
        const mirar = () => {
          const vt = document.getAnimations().filter((a) => a.effect?.pseudoElement?.includes('view-transition'));
          if (!vt.length) { requestAnimationFrame(mirar); return; }
          vt.forEach((a) => { a.pause(); a.currentTime = ${e.congelar}; });
          window.__vt = vt.length + ' animaciones, tipo ' + document.documentElement.dataset.vt + ': ' + [...new Set(vt.map((a) => a.effect.pseudoElement))].join(' ');
          clearTimeout(fin); listo();
        };
        requestAnimationFrame(mirar);
      });
      return window.__vt || 'SIN TRANSICION';`;
    nota = await evaluar(e.js + ';' + congelar);
  }
  await dormir(e.despues ?? 400);
  const foto = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(salida, e.nombre + '.png'), Buffer.from(foto.result.data, 'base64'));
  console.log(e.nombre, '→', nota ?? '');
}
ws.close(); edge.kill();
