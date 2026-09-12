// Capturas del ambiente "casa": fondo de mesa, vista de mesa (inclinada) y pantalla completa,
// en varios tamaños de pantalla. Además mide que en la vista de mesa el tablero no se salga de
// su columna ni pise la barra de acciones o los paneles.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/casa';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);

const SIZES = [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]];
let fails = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const ctx2 = await browser.newContext({ viewport: { width: w, height: h } });
  const a = await ctx.newPage(); a.on('pageerror', e => console.error('PAGE ERROR', e.message)); a.on('dialog', d => d.accept());
  const b = await ctx2.newPage(); b.on('dialog', d => d.accept());
  await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
  await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
  await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")');
  await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
  await a.waitForSelector('text=Jugadores (2/6)');
  await a.click('button:has-text("Empezar partida")');
  await a.waitForSelector('.board');
  for (const t of [1, 3, 7, 9, 10]) await dbg(a, { give: t });
  await dbg(a, { cash: 99999 });
  for (const t of [1, 3, 1, 3, 7, 9, 10]) { try { await a.evaluate(id => new Promise(r => window.__nandepoly.socket.emit('game:action', { type: 'BUILD', tileId: id }, r)), t); } catch {} }
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${OUT}/${w}x${h}-1-plana.png` });

  // Vista de mesa: medimos el tablero proyectado
  await a.click('button[title*="Vista de mesa"]');
  await a.waitForTimeout(600);
  const m = await a.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const board = r(document.querySelector('.board'));
    const col = r(document.querySelector('.board-col'));
    const bar = r(document.querySelector('[data-actionbar]'));
    const panels = [...document.querySelectorAll('.side-panel')].map(r);
    return { board, col, bar, panels };
  });
  const over = [];
  if (m.board.l < m.col.l - 1 || m.board.r > m.col.r + 1) over.push(`tablero se sale de la columna (${Math.round(m.board.l)}–${Math.round(m.board.r)} vs ${Math.round(m.col.l)}–${Math.round(m.col.r)})`);
  if (m.board.b > m.bar.t + 1) over.push(`tablero pisa la barra (${Math.round(m.board.b)} > ${Math.round(m.bar.t)})`);
  for (const p of m.panels) if (m.board.r > p.l && m.board.l < p.r && m.board.b > p.t && m.board.t < p.b) over.push('tablero pisa un panel');
  console.log(`${w}x${h} vista de mesa:`, over.length ? 'FALLA ' + over.join('; ') : 'OK', JSON.stringify(m.board));
  if (over.length) fails++;
  await a.screenshot({ path: `${OUT}/${w}x${h}-2-mesa.png` });

  // Pantalla completa (sin API real en headless; probamos el modo del juego)
  await a.click('button[title*="Pantalla completa"]');
  await a.waitForTimeout(500);
  const exitVisible = await a.locator('[data-focus-exit]').isVisible();
  const exitBox = await a.locator('[data-focus-exit]').boundingBox();
  console.log(`${w}x${h} botón salir visible:`, exitVisible, exitBox && `${Math.round(exitBox.width)}x${Math.round(exitBox.height)}`);
  if (!exitVisible) fails++;
  await a.screenshot({ path: `${OUT}/${w}x${h}-3-focus.png` });
  await a.keyboard.press('Escape');
  await a.waitForTimeout(300);
  const stillFocus = await a.locator('[data-focus-exit]').count();
  console.log(`${w}x${h} Esc sale de pantalla completa:`, stillFocus === 0 ? 'OK' : 'FALLA');
  if (stillFocus !== 0) fails++;
  await ctx.close(); await ctx2.close();
}
await browser.close();
console.log(fails ? `FALLAS: ${fails}` : 'TODO OK');
process.exit(fails ? 1 : 0);
