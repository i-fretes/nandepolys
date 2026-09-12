// Capturas en celular (390x844) del tablero, la Arena y el lobby.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/mobile';
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
const mk = async (mobile) => { const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); return p; };
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const a = await mk(true), b = await mk(false);
await a.goto(BASE);
await a.screenshot({ path: `${OUT}/home.png` });
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`);
await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
for (const label of ['La Arena', 'Caja sorpresa', 'Misiones secretas', 'Eventos globales', 'Duelo mayor']) {
  const cb = a.locator('label', { hasText: label }).locator('input[type=checkbox]'); await cb.click();
  await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
}
await a.screenshot({ path: `${OUT}/lobby.png`, fullPage: true });
await offNandu(a);
await a.click('button:has-text("Empezar partida")');
await a.waitForSelector('.board');
await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/tablero.png` });
await a.screenshot({ path: `${OUT}/tablero-full.png`, fullPage: true });
// Dados en el aire
const cur = (await a.evaluate(() => window.__nandepoly.store.getState().state)).players[0];
const curPage = (await a.evaluate(() => window.__nandepoly.store.getState().playerId)) === cur.id ? a : b;
await dbg(curPage, { position: 3, dice: [1, 2] });
await curPage.locator('button:has-text("Tirar dados")').click({ force: true });
await b.waitForTimeout(250);
await b.screenshot({ path: `${OUT}/dados-en-el-aire.png`, clip: { x: 400, y: 250, width: 640, height: 400 } });
await a.waitForSelector('[data-arena-option]', { timeout: 8000 });
await a.waitForTimeout(500);
await a.screenshot({ path: `${OUT}/arena-voto.png` });
for (const p of [a, b]) await p.locator('[data-arena-option="0"]').click({ force: true });
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'play', null, { timeout: 12000, polling: 200 });
await a.waitForTimeout(700);
const game = (await a.evaluate(() => window.__nandepoly.store.getState().state)).arena.game;
await a.screenshot({ path: `${OUT}/arena-${game}.png` });
await browser.close();
console.log('OK', game);
