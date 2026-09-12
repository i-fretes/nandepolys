// Revisa el tablero: que las fichas, casas y nombres no se pisen entre sí, y saca capturas.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/tablero';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

// El dado ñandú se apaga en las pruebas: cambian las casillas donde se cae
async function offNandu(page) {
  const cb = page.locator('label', { hasText: 'Dado ñandú' }).locator('input[type=checkbox]');
  if (await cb.count() && await cb.isChecked()) {
    await cb.click();
    await page.waitForFunction(el => !el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
  }
}
let bad = 0;
const ok = (c, m) => { console.log(c ? '✔' : '✘', m); if (!c) { bad++; process.exitCode = 1; } };

const pages = [];
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  pages.push(p);
  return p;
}

const a = await page();
await a.goto(BASE);
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
const others = [['Lucía', 'Chipa'], ['Mateo', 'Carreta'], ['Sofía', 'Ñandutí'], ['Diego', 'Jaguareté'], ['Ana', 'Arpa paraguaya']];
for (const [name, tok] of others) {
  const p = await page();
  await p.goto(`${BASE}/sala/${code}`);
  await p.waitForSelector('button:has-text("Entrar a la sala")');
  await p.fill('input[maxlength="20"]', name);
  await p.click(`button[title="${tok}"]`);
  await p.click('button:has-text("Entrar a la sala")');
}
await a.waitForSelector('text=Jugadores (6/6)');
await offNandu(a);
await a.click('button:has-text("Empezar partida")');
await a.waitForSelector('.board');

// Repartimos fichas, casas y hoteles por el tablero para ver los casos difíciles
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);
const names = ['Ivan', ...others.map(o => o[0])];
const byName = {};
for (let i = 0; i < pages.length; i++) byName[names[i]] = pages[i];

// 6 fichas en una sola casilla (el caso peor)
for (const p of pages) await dbg(p, { position: 21 });
await a.waitForTimeout(8000);
await a.screenshot({ path: `${OUT}/tablero-6-en-una.png` });

// repartidas, con construcciones
const spread = [1, 10, 18, 26, 34, 41];
for (let i = 0; i < pages.length; i++) await dbg(pages[i], { position: spread[i] });
for (const t of [1, 3, 7, 9, 10, 18, 20, 21, 23, 26, 29, 30, 34, 37, 41, 43]) await dbg(a, { give: t });
await a.evaluate(() => new Promise(r => window.__nandepoly.socket.emit('debug:set', { cash: 99999 }, r)));
await a.waitForTimeout(8000);
await a.screenshot({ path: `${OUT}/tablero-repartido.png` });
await a.locator('.board').screenshot({ path: `${OUT}/solo-tablero.png` });
// recorte de una esquina para ver el detalle de fichas y casas
const bb = await a.locator('.board').boundingBox();
await a.screenshot({ path: `${OUT}/detalle.png`, clip: { x: bb.x, y: bb.y + bb.height * 0.55, width: bb.width * 0.55, height: bb.height * 0.45 } });

// --- Comprobación automática: ¿algo se superpone dentro de una casilla? ---
const report = await a.evaluate(() => {
  const overlap = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
  const out = { nameVsToken: [], nameOverflow: [], tokenOutside: [], bandVsBody: [] };
  for (const tile of document.querySelectorAll('.tile')) {
    const tr = tile.getBoundingClientRect();
    const name = tile.querySelector('.name');
    const body = tile.querySelector('.body');
    const toks = [...tile.querySelectorAll('.token')];
    const band = tile.querySelector('.band');
    const label = name ? name.textContent.trim() : '(sin nombre)';
    if (name) {
      const nr = name.getBoundingClientRect();
      for (const t of toks) { const rr = t.getBoundingClientRect(); if (overlap(nr, rr)) out.nameVsToken.push(`${label} [nombre ${Math.round(nr.left - tr.left)},${Math.round(nr.top - tr.top)} ${Math.round(nr.width)}x${Math.round(nr.height)} | ficha ${Math.round(rr.left - tr.left)},${Math.round(rr.top - tr.top)} ${Math.round(rr.width)}x${Math.round(rr.height)} | casilla ${Math.round(tr.width)}x${Math.round(tr.height)} ${tile.className.trim()}]`); }
      // el nombre no puede salirse de la casilla
      if (nr.left < tr.left - 0.5 || nr.right > tr.right + 0.5 || nr.top < tr.top - 0.5 || nr.bottom > tr.bottom + 0.5) out.nameOverflow.push(`${label} (se sale: nombre ${Math.round(nr.left - tr.left)},${Math.round(nr.top - tr.top)} ${Math.round(nr.width)}x${Math.round(nr.height)} en casilla ${Math.round(tr.width)}x${Math.round(tr.height)})`);
      // ni desbordar su caja (texto cortado)
      if (name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1) out.nameOverflow.push(`${label} (cortado: ${name.scrollWidth}x${name.scrollHeight} en ${name.clientWidth}x${name.clientHeight})`);
    }
    if (band && body && overlap(band.getBoundingClientRect(), body.getBoundingClientRect())) out.bandVsBody.push(label);
    // el texto tampoco puede desbordar su caja (queda cortado por el recorte de la casilla)
    if (body && (body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1)) out.nameOverflow.push(`${label} (texto desbordado ${body.scrollWidth}x${body.scrollHeight} en ${body.clientWidth}x${body.clientHeight})`);
    for (const t of toks) {
      const br = t.getBoundingClientRect();
      if (br.left < tr.left - 6 || br.right > tr.right + 6) out.tokenOutside.push(label);
    }
  }
  return out;
});
ok(report.nameVsToken.length === 0, `ninguna ficha tapa el nombre de su casilla ${report.nameVsToken.length ? JSON.stringify([...new Set(report.nameVsToken)]) : ''}`);
ok(report.nameOverflow.length === 0, `ningún nombre se sale ni se corta ${report.nameOverflow.length ? JSON.stringify([...new Set(report.nameOverflow)]) : ''}`);
ok(report.bandVsBody.length === 0, `la franja de color no pisa el texto ${report.bandVsBody.length ? JSON.stringify([...new Set(report.bandVsBody)]) : ''}`);
ok(report.tokenOutside.length === 0, `ninguna ficha se sale de su casilla ${report.tokenOutside.length ? JSON.stringify([...new Set(report.tokenOutside)]) : ''}`);

// Celular
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const m = await mob.newPage();
await m.goto(`${BASE}/sala/${code}`);
await m.waitForTimeout(1500);
await m.waitForTimeout(800);
await m.screenshot({ path: `${OUT}/tablero-celular.png` });

console.log(bad ? `\n${bad} problemas` : '\nTablero sin superposiciones');
await browser.close();
