// Genera los íconos de instalación a partir del logo aprobado (casa de una línea con flecha).
//  - logo-*.png / gasto-logo-*.png: el logo solo, con fondo transparente (computadora: sale sin recuadro).
//  - logo-fondo-*.png / gasto-fondo-*.png: el logo en sus colores sobre un fondo claro (celular: el sistema exige ícono relleno).
// Uso: node iconos3.mjs <carpeta web>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const web = process.argv[2];
const CASA = 'M98 74v26H22V58l38-34 26 23';
const FLECHA = 'M42 82l14-14 12 10 30-32';
const PUNTA = 'M84 46h14v14';
const T = 'fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"';
const DEG = '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="14" y1="16" x2="106" y2="108"><stop offset="0" stop-color="#6E97E0"/><stop offset="1" stop-color="#2452B0"/></linearGradient>';
const DEG_CLARO = '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="14" y1="16" x2="106" y2="108"><stop offset="0" stop-color="#4E78C6"/><stop offset="1" stop-color="#12264F"/></linearGradient>';

// El logo; con "mas" lleva abajo a la derecha un círculo verde con un +, que identifica la app de gastos.
// En esa versión la línea de la casa termina antes de la esquina, para dejarle sitio al círculo.
const CASA_MAS = 'M65 100H22V58l38-34 26 23';
const logo = (mas, deg) => `<defs>${deg}</defs>
  <path d="${mas ? CASA_MAS : CASA}" stroke="url(#g)" ${T}/>
  <path d="${FLECHA}" stroke="#1FB894" ${T}/>
  <path d="${PUNTA}" stroke="#1FB894" ${T}/>${mas ? `
  <circle cx="91" cy="93" r="17" fill="#1FB894"/>
  <path d="M91 84.5v17M82.5 93h17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` : ''}`;

const svgSolo = (mas) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="11 13 98 98" role="img" aria-label="${mas ? 'FinFamily Gasto' : 'FinFamily'}">
  ${logo(mas, DEG)}
</svg>
`;
// Con fondo: el logo ocupa el centro (zona segura de los íconos adaptables de Android).
const svgFondo = (mas) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9EEF8"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#f)"/>
  <svg x="106" y="106" width="300" height="300" viewBox="11 13 98 98">${logo(mas, DEG_CLARO)}</svg>
</svg>
`;
// En el PNG transparente el logo llena casi todo el lienzo.
const svgLleno = (mas) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <svg x="24" y="24" width="464" height="464" viewBox="11 13 98 98">${logo(mas, DEG)}</svg>
</svg>
`;

writeFileSync(join(web, 'iconos', 'icono.svg'), svgSolo(false));
writeFileSync(join(web, 'iconos', 'gasto.svg'), svgSolo(true));

const trabajos = [];
for (const [base, mas] of [['logo', false], ['gasto-logo', true]]) {
  for (const lado of [192, 512]) trabajos.push({ svg: svgLleno(mas), lado, transparente: true, salida: join(web, 'iconos', `${base}-${lado}.png`) });
}
for (const [base, mas] of [['logo-fondo', false], ['gasto-fondo', true]]) {
  for (const lado of [192, 512]) trabajos.push({ svg: svgFondo(mas), lado, transparente: false, salida: join(web, 'iconos', `${base}-${lado}.png`) });
}

const PUERTO = 9336;
const tmp = join(aqui, 'iconos-tmp');
mkdirSync(tmp, { recursive: true });
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${join(aqui, 'perfil-iconos')}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
await cdp('Page.enable');
for (const [i, t] of trabajos.entries()) {
  const pagina = join(tmp, `i${i}.html`);
  writeFileSync(pagina, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}body>svg{width:100vw;height:100vh}</style>${t.svg}`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: t.lado, height: t.lado, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setDefaultBackgroundColorOverride', t.transparente ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await cdp('Page.navigate', { url: 'file:///' + pagina.replace(/\\/g, '/') });
  await dormir(500);
  const foto = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(t.salida, Buffer.from(foto.result.data, 'base64'));
  console.log(t.salida.split(/[\\/]/).pop(), t.lado, t.transparente ? 'transparente' : 'con fondo');
}
ws.close(); edge.kill();
