// Carrera de sapos vertical: capturas durante la carrera (servidor con DEBUG_TOOLS=1).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080'; const OUT = process.argv[3] ?? 'e2e/sapos'; mkdirSync(OUT, { recursive: true });
const GAME = process.argv[4] ?? 'sapos';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); return p; };
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const st = p => p.evaluate(() => window.__nandepoly.store.getState().state);
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const click = (p, text) => p.locator('button:not([disabled])', { hasText: new RegExp('(^|\\s)' + esc(text)) }).first().click({ timeout: 8000, force: true });
const a = await mk(), b = await mk();
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")'); await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")'); await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
await a.click('button:has-text("Agregar bot")').catch(() => {});
const cb = a.locator('label', { hasText: 'La Arena' }).locator('input[type=checkbox]'); await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
await a.click('button:has-text("Empezar partida")'); await a.waitForSelector('.board');
const s0 = await st(a); const meA = await a.evaluate(() => window.__nandepoly.store.getState().playerId);
const cur = s0.players[s0.currentPlayerIndex].id === meA ? a : b;
await dbg(cur, { position: 3, dice: [1, 2] });
await click(cur, 'Tirar dados');
await a.waitForSelector('[data-arena-option]', { timeout: 15000 });
await dbg(a, { arenaGame: GAME });
await a.waitForTimeout(300);
for (const p of [a, b]) await p.locator('[data-arena-option="0"]').click({ force: true });
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'play', null, { timeout: 12000, polling: 200 });
await a.waitForTimeout(3600);
await a.screenshot({ path: `${OUT}/${GAME}-1.png` });
// Ivan esquiva; Lucía no hace nada
const t0 = Date.now();
while (Date.now() - t0 < 26000) {
  const s = await st(a); if (!s.arena || s.arena.stage !== 'play') break;
  if (GAME === 'sapos') {
    const d = s.arena.data; const el = Date.now() + (await a.evaluate(() => window.__nandepoly.store.getState().clockOffset)) - s.arena.startedAt; const tt = el / 1000; const row = Math.floor(2 * tt + tt * tt / 12);
    const lane = d.lane?.[meA] ?? 1; const next = d.track[Math.min(59, row + 1)];
    if (next === lane) await a.locator(lane === 0 ? '[data-sapo-r]' : '[data-sapo-l]').dispatchEvent('pointerdown');
  }
  await a.waitForTimeout(80);
  if (Date.now() - t0 > 6000 && Date.now() - t0 < 6200) await a.screenshot({ path: `${OUT}/${GAME}-2.png` });
}
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'done' || !window.__nandepoly.store.getState().state?.arena, null, { timeout: 40000, polling: 300 });
await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/${GAME}-podio.png` });
const sd = await st(a);
console.log('ranking', sd.arena?.ranking, 'out', sd.arena?.data?.out, 'finished', sd.arena?.data?.finished);
await browser.close(); console.log('OK');
