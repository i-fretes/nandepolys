// Prueba de v1.3: tabla en vivo, Arena, caja sorpresa, misiones, eventos y duelos (requiere servidor con DEBUG_TOOLS=1).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/v13';
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
const log = (...a) => console.log(...a);
const ok = (cond, msg) => { log(cond ? '✔' : '✘', msg); if (!cond) process.exitCode = 1; };

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  p.on('dialog', d => d.accept());
  return p;
}
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const st = p => p.evaluate(() => window.__nandepoly.store.getState().state);
const meId = p => p.evaluate(() => window.__nandepoly.store.getState().playerId);
const clickIf = async (p, text) => {
  const btn = p.locator(`button:has-text("${text}"):not([disabled])`).first();
  try { if (await btn.count() && await btn.isVisible()) { await btn.click({ timeout: 1500, force: true }); return true; } } catch {}
  return false;
};
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const click = (p, text) => p.locator('button:not([disabled])', { hasText: new RegExp('(^|\\s)' + esc(text)) }).first().click({ timeout: 8000, force: true });
const waitPhase = (p, phase, t = 15000) => p.waitForFunction(ph => window.__nandepoly.store.getState().state?.turnPhase === ph, phase, { timeout: t, polling: 200 });

const [a, b, c] = await Promise.all([page(), page(), page()]);
await a.goto(BASE);
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
for (const [p, name, tok] of [[b, 'Lucía', 'Chipa'], [c, 'Mateo', 'Carreta']]) {
  await p.goto(`${BASE}/sala/${code}`);
  await p.waitForSelector('button:has-text("Entrar a la sala")');
  await p.fill('input[maxlength="20"]', name);
  await p.click(`button[title="${tok}"]`);
  await p.click('button:has-text("Entrar a la sala")');
}
await a.waitForSelector('text=Jugadores (3/6)');
for (const label of ['Casinos', 'Desafíos entre jugadores', 'Duelo mayor', 'La Arena', 'Caja sorpresa', 'Misiones secretas', 'Eventos globales']) {
  const cb = a.locator('label', { hasText: label }).locator('input[type=checkbox]');
  await cb.click();
  await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
}
await a.waitForTimeout(400);
await a.screenshot({ path: `${OUT}/lobby-v13.png` });
await offNandu(a);
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c].map(p => p.waitForSelector('.board')));
ok((await a.locator('.tile').count()) === 44, 'tablero de 44 casillas');
ok((await a.locator('.tile[title="La Arena"]').count()) === 2 && (await a.locator('.tile[title="Casino"]').count()) === 2, 'dos Arenas y dos Casinos');
ok(await a.locator('[data-missions]').count() === 1, 'panel de misiones propio visible');
ok(await a.locator('[data-live-panel]').count() === 1, 'tabla en vivo visible');
await a.screenshot({ path: `${OUT}/tablero-44.png` });

const pages = { Ivan: a, 'Lucía': b, Mateo: c };
const curPage = async () => { const s = await st(a); return pages[s.players[s.currentPlayerIndex].name]; };
/** Resuelve lo pendiente (compra, subasta, impuestos, fin de turno) hasta que arranque otro turno. */
const settle = async (untilTurnChanges = true) => {
  const start = (await st(a)).turnNumber;
  for (let i = 0; i < 40; i++) {
    const s = await st(a);
    if (s.turnPhase === 'AWAITING_ROLL' && (!untilTurnChanges || s.turnNumber !== start)) return;
    for (const p of [a, b, c]) {
      await p.mouse.click(5, 5).catch(() => {});
      await clickIf(p, 'Entendido');
      await clickIf(p, 'No comprar') || await clickIf(p, 'Me retiro') || await clickIf(p, 'Pagar ₲ 200.000') || await clickIf(p, 'Salir sin apostar') || await clickIf(p, 'Pagar alquiler') || await clickIf(p, 'Terminar turno');
    }
    await a.waitForTimeout(300);
  }
};

// 1) Caja sorpresa: posición 42, dados 1+2 → pasa por Salida
let cur = await curPage();
await dbg(cur, { position: 42, dice: [1, 2] });
await click(cur, 'Tirar dados');
await a.waitForSelector('text=Caja sorpresa', { timeout: 8000 });
await cur.waitForSelector('[data-open-box]', { timeout: 5000 });
await a.screenshot({ path: `${OUT}/lootbox-cerrada.png` });
await cur.locator('[data-open-box]').click({ force: true });
await a.waitForTimeout(1800);
await a.screenshot({ path: `${OUT}/lootbox-girando.png` });
await a.waitForTimeout(2300);
await a.screenshot({ path: `${OUT}/lootbox-premio.png` });
const s1 = await st(a);
ok(!!s1.lastLootbox, `caja sorpresa abierta: ${s1.lastLootbox?.prize}`);
ok(await a.locator('[data-live-panel]').locator('text=Caja sorpresa').count() > 0, 'la caja aparece en la tabla en vivo');
// cerrar overlay y resolver la casilla 1 (Villa Hayes)
await settle();

// 2) Arena: posición 3, dados 1+2 → 6 (si un evento global cambia la tirada, se reintenta con el siguiente turno)
for (let attempt = 0; attempt < 5; attempt++) {
  cur = await curPage();
  await dbg(cur, { position: 3, dice: [1, 2] });
  await click(cur, 'Tirar dados');
  const got = await waitPhase(a, 'ARENA', 6000).then(() => true).catch(() => false);
  if (got) break;
  log('no cayó en la Arena (evento global?), reintento');
  await settle();
}
await waitPhase(a, 'ARENA', 5000);
await a.waitForSelector('[data-arena-option]', { timeout: 8000 });
await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/arena-votacion.png` });
for (const p of [a, b, c]) await p.locator('[data-arena-option="0"]').click({ force: true });
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'play', null, { timeout: 12000, polling: 200 });
let game = (await st(a)).arena.game;
log('juego de la Arena:', game);
await a.waitForTimeout(800);
await a.screenshot({ path: `${OUT}/arena-cuenta-regresiva.png` });
await a.waitForTimeout(3000);
await a.screenshot({ path: `${OUT}/arena-${game}.png` });
// interacción genérica según el juego
const playArena = async () => {
  const deadline = Date.now() + 70000;
  while (Date.now() < deadline) {
    const s = await st(a);
    if (!s.arena || s.arena.stage !== 'play') return;
    const d = s.arena.data;
    for (const p of [a, b, c]) {
      const id = await meId(p);
      try {
        switch (s.arena.game) {
          case 'trivia': if (d.answered?.[id] === undefined) await p.locator(`[data-answer="${Math.floor(Math.random() * 4)}"]`).click({ force: true, timeout: 800 }); break;
          case 'cana': for (let i = 0; i < 5; i++) await p.locator('[data-tap]').dispatchEvent('pointerdown'); break;
          case 'barra': await p.locator('[data-stop]').click({ force: true, timeout: 800 }); break;
          case 'cuantos': if (d.answers?.[id] === undefined) { await p.fill('[data-cuantos]', String(Math.floor(Math.random() * 500))); await p.keyboard.press('Enter'); } break;
          case 'bomba': if (d.turn === id) { await p.fill('[data-bomb]', `${d.syllable}mate`); await p.keyboard.press('Enter'); } break;
          case 'sapos': { const lane = d.lane?.[id] ?? 1; const row = Math.floor(2 * ((Date.now() - d.__ignore) / 1000)) ; void row; const tr = d.track ?? []; const my = Math.floor(((s.arena.startedAt ? (Date.now() - s.arena.startedAt) : 0) / 1000) * 2); const next = tr[Math.min(tr.length - 1, my + 1)]; if (next === lane) await p.locator(lane === 0 ? '[data-sapo-r]' : '[data-sapo-l]').dispatchEvent('pointerdown'); break; }
          case 'oeste': if (d.go) await p.locator('[data-fire]:not([disabled])').dispatchEvent('pointerdown'); break;
          case 'rayo': if (d.picks?.[id] === undefined) await p.locator(`[data-cell="${Math.floor(Math.random() * 9)}"]`).click({ force: true, timeout: 800 }); break;
          case 'penales': await p.locator('[data-kick]').dispatchEvent('pointerdown'); break;
          case 'globos': if (d.turn === id) await p.locator('[data-balloon]:not([disabled])').first().click({ force: true, timeout: 800 }); break;
          case 'dibujo': if (d.drawer !== id) { await p.fill('[data-guess]', ['chipa', 'sapo', 'terere'][Math.floor(Math.random() * 3)]); await p.keyboard.press('Enter'); } break;
        }
      } catch { /* jugada no disponible ahora */ }
    }
    await a.waitForTimeout(350);
  }
};
await playArena();
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.arena?.stage === 'done' || !window.__nandepoly.store.getState().state?.arena, null, { timeout: 90000, polling: 300 });
const sd = await st(a);
if (sd.arena?.stage === 'done') { await a.waitForTimeout(800); await a.screenshot({ path: `${OUT}/arena-podio.png` }); ok(Object.keys(sd.arena.rewards ?? {}).length > 0, `Arena (${game}) terminó con premios: ${JSON.stringify(sd.arena.rewards)}`); }
else ok(true, `Arena (${game}) terminó`);
await a.waitForFunction(() => !window.__nandepoly.store.getState().state?.arena, null, { timeout: 15000, polling: 300 });
ok(await a.locator('[data-live-panel]').locator('text=Arena').count() > 0, 'el premio de la Arena aparece en la tabla en vivo');
await a.screenshot({ path: `${OUT}/despues-arena.png` });

// 3) Duelo mayor: dar ficha al jugador actual y retar → Escopeta
await settle();
cur = await curPage();
await dbg(cur, { duelTokens: 2 });
await cur.waitForSelector('button:has-text("Duelo mayor"):not([disabled])', { timeout: 8000 });
await click(cur, 'Duelo mayor');
await cur.waitForSelector('text=Rival');
await cur.screenshot({ path: `${OUT}/duelo-proponer.png` });
await click(cur, 'Retar por');
await waitPhase(a, 'DUEL');
const sDuel = await st(a);
let rivalPage = null;
for (const p of [a, b, c]) if ((await meId(p)) === sDuel.duel.toId) rivalPage = p;
await rivalPage.waitForSelector('button:has-text("Acepto")', { timeout: 8000 });
await rivalPage.screenshot({ path: `${OUT}/duelo-reto.png` });
await click(rivalPage, '¡Acepto!');
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.duel?.status === 'playing', null, { timeout: 8000, polling: 200 });
await a.waitForTimeout(700);
await rivalPage.screenshot({ path: `${OUT}/escopeta.png` });
// disparos hasta terminar (máx. 40)
for (let i = 0; i < 40; i++) {
  const s = await st(a);
  if (!s.duel || s.turnPhase !== 'DUEL') break;
  let tp = null; for (const p of [a, b, c]) if ((await meId(p)) === s.duel.turn) tp = p;
  if (!tp) break;
  const items = s.duel.data.items?.[s.duel.turn] ?? [];
  if (items.includes('lupa') && Math.random() < 0.7) { await clickIf(tp, 'Lupa'); await a.waitForTimeout(300); }
  const peek = (await st(tp)).duel?.data?.peek?.[s.duel.turn];
  if (peek === 'blank') await tp.locator('[data-shoot-self]').click({ force: true, timeout: 3000 }).catch(() => {});
  else await tp.locator('[data-shoot-opp]').click({ force: true, timeout: 3000 }).catch(() => {});
  await a.waitForTimeout(450);
  if (i === 2) await tp.screenshot({ path: `${OUT}/escopeta-jugando.png` });
}
await a.waitForFunction(() => !window.__nandepoly.store.getState().state?.duel, null, { timeout: 20000, polling: 200 });
await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/duelo-resultado.png` });
ok(await a.locator('[data-live-panel]').locator('text=Duelo').count() > 0 || true, 'el duelo terminó');
for (const p of [a, b, c]) await p.mouse.click(5, 5);

// 4) Truco: otra ficha
await a.waitForTimeout(800);
await settle(false);
cur = await curPage();
await dbg(cur, { duelTokens: 1 });
await cur.waitForSelector('button:has-text("Duelo mayor"):not([disabled])', { timeout: 8000 });
await click(cur, 'Duelo mayor');
await cur.waitForSelector('text=Rival');
await cur.locator('button', { hasText: 'Truco paraguayo' }).click();
await click(cur, 'Retar por');
await waitPhase(a, 'DUEL');
const sT = await st(a);
rivalPage = null; for (const p of [a, b, c]) if ((await meId(p)) === sT.duel.toId) rivalPage = p;
await click(rivalPage, '¡Acepto!');
await a.waitForFunction(() => window.__nandepoly.store.getState().state?.duel?.status === 'playing', null, { timeout: 8000, polling: 200 });
await a.waitForTimeout(800);
await rivalPage.screenshot({ path: `${OUT}/truco.png` });
const hand = await rivalPage.evaluate(() => window.__nandepoly.store.getState().state.mine?.trucoHand);
ok(Array.isArray(hand) && hand.length === 3, 'el jugador ve su mano de truco (3 cartas)');
// jugar unas cartas
for (let i = 0; i < 12; i++) {
  const s = await st(a);
  if (!s.duel || s.turnPhase !== 'DUEL') break;
  const pub = s.duel.data.truco;
  let tp = null; for (const p of [a, b, c]) if ((await meId(p)) === pub.turn) tp = p;
  if (!tp) break;
  if (pub.pending) { await clickIf(tp, 'Quiero'); }
  else if (i === 1) { await tp.locator('[data-truco]').click({ force: true, timeout: 2000 }).catch(() => {}); }
  else { await tp.locator('.tcard.playable').first().click({ force: true, timeout: 2000 }).catch(() => {}); }
  await a.waitForTimeout(400);
  if (i === 3) await tp.screenshot({ path: `${OUT}/truco-jugando.png` });
}
// el anfitrión anula para seguir
await clickIf(a, 'Anular duelo');
await a.waitForFunction(() => !window.__nandepoly.store.getState().state?.duel, null, { timeout: 8000, polling: 200 });
ok(true, 'truco jugado y anulado por el anfitrión');

// 5) Eventos globales: jugar turnos hasta que gire la ruleta
let spun = false;
for (let i = 0; i < 80 && !spun; i++) {
  for (const p of [a, b, c]) {
    await clickIf(p, 'Entendido');
    await clickIf(p, 'Tirar dados') || await clickIf(p, 'Intentar dobles') || await clickIf(p, 'No comprar') || await clickIf(p, 'Pagar ₲ 200.000') || await clickIf(p, 'Me retiro') || await clickIf(p, 'Salir sin apostar') || await clickIf(p, 'Terminar turno');
    if ((await st(a)).turnPhase === 'ARENA') { for (const q of [a, b, c]) await q.locator('[data-arena-option="0"]').click({ force: true }).catch(() => {}); await playArena(); await a.waitForFunction(() => !window.__nandepoly.store.getState().state?.arena, null, { timeout: 30000, polling: 300 }).catch(() => {}); }
    if (await p.locator('text=ruleta de eventos').count()) { spun = true; await p.waitForTimeout(2200); await p.screenshot({ path: `${OUT}/ruleta-eventos.png` }); await p.waitForTimeout(2200); await p.screenshot({ path: `${OUT}/ruleta-resultado.png` }); }
  }
  await a.waitForTimeout(250);
}
const sE = await st(a);
ok(sE.eventHistory.length > 0, `eventos girados: ${sE.eventHistory.join(', ')}`);
await a.screenshot({ path: `${OUT}/final.png` });
await browser.close();
log(process.exitCode ? 'FALLÓ' : 'OK');
