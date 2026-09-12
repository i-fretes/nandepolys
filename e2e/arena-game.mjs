// Carrera de sapos vertical: capturas durante la carrera (servidor con DEBUG_TOOLS=1).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080'; const OUT = process.argv[3] ?? 'e2e/arena'; mkdirSync(OUT, { recursive: true });
const GAME = process.argv[4] ?? 'cartas';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

// El dado ñandú se apaga en las pruebas: cambian las casillas donde se cae
async function offNandu(page) {
  const cb = page.locator('label', { hasText: 'Dado ñandú' }).locator('input[type=checkbox]');
  if (await cb.count() && await cb.isChecked()) {
    await cb.click();
    await page.waitForFunction(el => !el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
  }
}
const MOBILE = process.env.MOBILE === '1';
const mk = async () => { const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); return p; };
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const st = p => p.evaluate(() => window.__nandepoly.store.getState().state);
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const click = (p, text) => p.locator('button:not([disabled])', { hasText: new RegExp('(^|\\s)' + esc(text)) }).first().click({ timeout: 8000, force: true });
const a = await mk(), b = await mk(), c = await mk();
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")'); await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
for (const [p, name, tok] of [[b, 'Lucía', 'Chipa'], [c, 'Mateo', 'Carreta']]) { await p.goto(`${BASE}/sala/${code}`); await p.waitForSelector('button:has-text("Entrar a la sala")'); await p.fill('input[maxlength="20"]', name); await p.click(`button[title="${tok}"]`); await p.click('button:has-text("Entrar a la sala")'); }
await a.waitForSelector('text=Jugadores (3/6)');
const cb = a.locator('label', { hasText: 'La Arena' }).locator('input[type=checkbox]'); await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
await offNandu(a);
await a.click('button:has-text("Empezar partida")'); await a.waitForSelector('.board');
const s0 = await st(a); const ids = {}; for (const p of [a, b, c]) ids[await p.evaluate(() => window.__nandepoly.store.getState().playerId)] = p;
const meA = await a.evaluate(() => window.__nandepoly.store.getState().playerId);
const cur = ids[s0.players[s0.currentPlayerIndex].id];
await dbg(cur, { position: 3, dice: [1, 2] });
await click(cur, 'Tirar dados');
await a.waitForSelector('[data-arena-option]', { timeout: 15000 });
await dbg(a, { arenaGame: GAME });
await a.waitForTimeout(300);
for (const p of [a, b, c]) await p.locator('[data-arena-option="0"]').click({ force: true });
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'play', null, { timeout: 12000, polling: 200 });
await a.waitForTimeout(3600);
await a.screenshot({ path: `${OUT}/${GAME}-1.png` });
const t0 = Date.now(); let shots = 0;
while (Date.now() - t0 < 120000) {
  const s = await st(a); if (!s.arena || s.arena.stage !== 'play') break;
  const d = s.arena.data;
  for (const [id, p] of Object.entries(ids)) {
    try {
      switch (GAME) {
        case 'cartas':
          if (d.stage === 'pick' && id !== d.judge && !(d.pickedIds ?? []).includes(id)) { await p.locator('[data-white="1"]').click({ force: true, timeout: 500 }); await p.locator('[data-play-card]').click({ force: true, timeout: 500 }); }
          if (d.stage === 'judge' && id === d.judge) { await p.waitForTimeout(1200); await p.locator('[data-judge-pick="0"]').click({ force: true, timeout: 500 }); }
          break;
        case 'borrosa': if (d.reveal === null && d.answered?.[id] === undefined && Math.random() < 0.15) await p.locator(`[data-blur-opt="${Math.floor(Math.random() * 4)}"]`).click({ force: true, timeout: 500 }); break;
        case 'cadena': if (!d.reveal && !d.orders?.[id]) { for (const i of [2, 0, 3, 1]) await p.locator(`[data-chain="${i}"]`).click({ force: true, timeout: 500 }); await p.locator('[data-send-chain]').click({ force: true, timeout: 500 }); } break;
        case 'ruleta': if (d.turn === id) { await p.waitForTimeout(600); await p.locator('[data-ruleta="shoot"]').click({ force: true, timeout: 500 }); } break;
        case 'bomba2': if ((d.stage === 'plant' && id === d.saboteur) || (d.stage === 'cut' && id !== d.saboteur && d.cuts?.[id] === undefined)) await p.locator(`[data-wire="${Math.floor(Math.random() * 4)}"]`).click({ force: true, timeout: 500 }); break;
      }
    } catch { /* no disponible ahora */ }
  }
  shots++;
  if (shots === 6) await a.screenshot({ path: `${OUT}/${GAME}-2.png`, fullPage: MOBILE });
  if (shots === 14) await b.screenshot({ path: `${OUT}/${GAME}-3.png`, fullPage: MOBILE });
  await a.waitForTimeout(400);
}
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'done' || !window.__nandepoly.store.getState().state?.arena, null, { timeout: 40000, polling: 300 });
await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/${GAME}-podio.png` });
const sd = await st(a);
console.log('ranking', sd.arena?.ranking, 'scores', sd.arena?.scores, 'rewards', sd.arena?.rewards);
await browser.close(); console.log('OK');
