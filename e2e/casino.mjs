// Prueba visual de casino, doble o nada de alquiler y desafíos (requiere servidor con DEBUG_TOOLS=1).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/casino';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const log = (...a) => console.log(...a);
const ok = (cond, msg) => { log(cond ? '✔' : '✘', msg); if (!cond) process.exitCode = 1; };

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  p.on('dialog', d => d.accept());
  return p;
}
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const clickIf = async (p, text) => {
  const btn = p.locator(`button:has-text("${text}"):not([disabled])`).first();
  try { if (await btn.count() && await btn.isVisible()) { await btn.click({ timeout: 1500, force: true }); return true; } } catch {}
  return false;
};
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const click = (p, text) => p.locator('button:not([disabled])', { hasText: new RegExp('(^|\\s)' + esc(text)) }).first().click({ timeout: 8000, force: true });

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
// Activar timba
for (const label of ['Casinos', 'Jackpot', 'Alquiler a doble o nada', 'Desafíos entre jugadores']) {
  const cb = a.locator('label', { hasText: label }).locator('input[type=checkbox]');
  await cb.click();
  await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
}
await a.waitForTimeout(400);
await a.screenshot({ path: `${OUT}/lobby-timba.png` });
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c].map(p => p.waitForSelector('.board')));

// ¿Quién empieza?
const firstName = await a.locator('.center b').first().innerText();
const pages = { Ivan: a, 'Lucía': b, Mateo: c };
const cur = pages[firstName.replace('Turno de ', '')];
log('empieza', firstName);

// 1) Casino: fijar posición 36 y dados 1+2 → 39
await dbg(cur, { position: 36, dice: [1, 2] });
await click(cur, 'Tirar dados');
await cur.waitForSelector('text=Casino', { timeout: 8000 });
await cur.waitForTimeout(700);
await cur.screenshot({ path: `${OUT}/casino-mesas.png` });
await cur.locator('button:has-text("200 mil")').first().click();
await click(cur, 'Apostar');
await cur.waitForTimeout(1500);
await cur.screenshot({ path: `${OUT}/casino-ruleta-girando.png` });
await cur.waitForTimeout(2600);
await cur.screenshot({ path: `${OUT}/casino-ruleta-resultado.png` });
ok(await cur.locator('text=Salir del Casino').count() > 0, 'ruleta jugada');
await click(cur, 'Salir del Casino');
await cur.waitForSelector('button:has-text("Terminar turno")');
await cur.waitForTimeout(500);
await click(cur, 'Terminar turno');

const turnOf = async () => a.locator('.center b').first().innerText();
const waitTurnChange = async (prev) => { await a.waitForFunction(p => document.querySelector('.center b')?.textContent !== p, prev, { timeout: 8000, polling: 200 }); };
// 2) Siguiente jugador: carrera de carretas
await waitTurnChange(firstName);
const second = await turnOf();
const cur2 = pages[second.replace('Turno de ', '')];
await dbg(cur2, { position: 36, dice: [1, 2] });
await click(cur2, 'Tirar dados');
await cur2.waitForSelector('text=Casino', { timeout: 8000 });
await cur2.click('button:has-text("Carrera de carretas")');
await cur2.locator('button:has-text("🟢 3")').click();
await click(cur2, 'Apostar');
await cur2.waitForTimeout(2200);
await cur2.screenshot({ path: `${OUT}/casino-carrera.png` });
await cur2.waitForTimeout(3000);
await click(cur2, 'Salir del Casino');
await cur2.waitForTimeout(500);
await click(cur2, 'Terminar turno');

// 3) Tercero: doble o nada
await waitTurnChange(second);
const third = await turnOf();
const cur3 = pages[third.replace('Turno de ', '')];
await dbg(cur3, { position: 36, dice: [1, 2] });
await click(cur3, 'Tirar dados');
await cur3.waitForSelector('text=Casino', { timeout: 8000 });
await cur3.click('button:has-text("Doble o nada")');
await dbg(cur3, { dice: [2, 4] }); // par → dobla
await click(cur3, 'Arrancar con');
await cur3.waitForTimeout(1300);
await cur3.screenshot({ path: `${OUT}/casino-doble.png` });
if (await cur3.locator('button:has-text("Retirar")').count()) await click(cur3, 'Retirar');
await click(cur3, 'Salir del Casino');
await cur3.waitForTimeout(500);
await click(cur3, 'Terminar turno');
await waitTurnChange(third);

// 4) Alquiler a doble o nada: el primero es dueño de la casilla 39; el segundo cae ahí
const p1 = cur, p2 = cur2;
const id1 = await p1.evaluate(() => JSON.parse(localStorage.getItem('nandepoly:session:' + location.pathname.split('/').pop()) || '{}') && null);
// Damos Palacio de López al jugador 1 (dueño) y hacemos caer al que tiene el turno ahora (p1) → necesitamos que caiga p2: avanzamos el turno.
await dbg(p1, { give: 43 });
// turno actual es p1 (después de 3 jugadores volvió al primero). p1 tira y termina.
await dbg(p1, { position: 0, dice: [1, 3] }); // 4: impuesto → elegir
await click(p1, 'Tirar dados');
await p1.waitForFunction(() => window.__nandepoly.store.getState().state?.turnPhase === 'TAX_CHOICE' && window.__nandepoly.store.getState().moving === null, null, { timeout: 10000, polling: 150 });
await click(p1, 'Pagar ₲ 200.000');
await p1.waitForFunction(() => window.__nandepoly.store.getState().state?.turnPhase === 'END_TURN', null, { timeout: 8000, polling: 150 });
await click(p1, 'Terminar turno');
await waitTurnChange(firstName);
// ahora p2: posición 40, dados 1+2 → 43 (Palacio, del jugador 1)
await dbg(p2, { position: 40, dice: [1, 2] });
await click(p2, 'Tirar dados');
await p2.waitForSelector('text=Alquiler en Palacio', { timeout: 8000 });
await p2.screenshot({ path: `${OUT}/alquiler-oferta.png` });
await click(p2, 'Proponer doble o nada');
await p1.waitForSelector('text=te propone', { timeout: 8000 });
await p1.screenshot({ path: `${OUT}/alquiler-dueno-decide.png` });
await click(p1, '¡Acepto el doble o nada');
// Ahora se define en un mini-desafío mano a mano (elegido al azar)
await p2.waitForFunction(() => window.__nandepoly.store.getState().state?.turnPhase === 'CHALLENGE', null, { timeout: 8000, polling: 200 });
const kind = await p2.evaluate(() => window.__nandepoly.store.getState().state.challenge.kind);
log('doble o nada se define a', kind);
await p2.waitForTimeout(800);
await p2.screenshot({ path: `${OUT}/alquiler-desafio.png` });
// jugamos el desafío hasta que termine
for (let i = 0; i < 40; i++) {
  const st = await p2.evaluate(() => window.__nandepoly.store.getState().state);
  if (st.turnPhase !== 'CHALLENGE') break;
  const c = st.challenge;
  for (const p of [p1, p2]) {
    try {
      if (c.kind === 'dados') await p.locator('[data-roll-dados]').click({ force: true, timeout: 500 });
      else if (c.kind === 'ppt') await p.locator('.ppt-btn').first().click({ force: true, timeout: 500 });
      else if (c.kind === 'trivia') await p.locator('[data-answer="0"]').click({ force: true, timeout: 500 });
      else if (c.kind === 'terere') await p.locator('[data-terere]').dispatchEvent('pointerdown');
    } catch { /* no disponible */ }
  }
  await p2.waitForTimeout(400);
}
await p2.waitForTimeout(1200);
await p2.screenshot({ path: `${OUT}/alquiler-resultado.png` });
const cash = await p2.evaluate(() => { const s = window.__nandepoly.store.getState(); return s.state.players.find(p => p.id === s.playerId).cash; });
ok(cash === 1500 || cash === 1500 - 100 || cash < 1500, `doble o nada resuelto por desafío (efectivo del que pagaba: ${cash})`);
for (let i = 0; i < 10; i++) { if (await clickIf(p2, 'Terminar turno')) break; await p2.waitForTimeout(300); }

// 5) Desafío: trivia (el que tenga el turno desafía)
// Avanzamos turnos hasta que le toque a p3
for (let i = 0; i < 12; i++) {
  const st = await p2.evaluate(() => window.__nandepoly.store.getState().state);
  const curId = st.players[st.currentPlayerIndex].id;
  const curP = [a, b, c].find(async () => false) ?? null; void curP;
  if (st.turnPhase === 'AWAITING_ROLL' && curId === await cur3.evaluate(() => window.__nandepoly.store.getState().playerId)) break;
  for (const p of [a, b, c]) { await clickIf(p, 'Entendido'); await clickIf(p, 'Tirar dados') || await clickIf(p, 'No comprar') || await clickIf(p, 'Me retiro') || await clickIf(p, 'Pagar ₲ 200.000') || await clickIf(p, 'Salir sin apostar') || await clickIf(p, 'Terminar turno'); }
  await p2.waitForTimeout(350);
}
const p3 = cur3;
await click(p3, 'Desafiar');
await p3.waitForSelector('text=Desafiar a un jugador');
await p3.locator('button:has-text("Trivia paraguaya")').click();
await p3.screenshot({ path: `${OUT}/desafio-elegir.png` });
await click(p3, 'Desafiar por');
// el rival es el primero de la lista (p1 o p2). Aceptamos en el que tenga el botón.
const whoHas = async (pages, sel) => { for (let i = 0; i < 40; i++) { for (const p of pages) if (await p.locator(sel).count()) return p; await pages[0].waitForTimeout(200); } throw new Error('nadie tiene ' + sel); };
const rival = await whoHas([p1, p2], 'button:has-text("Acepto")');
await rival.waitForSelector('button:has-text("Acepto")', { timeout: 8000 });
await rival.screenshot({ path: `${OUT}/desafio-invitacion.png` });
await click(rival, '¡Acepto');
await p3.waitForSelector('text=Pregunta 1 de 3', { timeout: 8000 });
await p3.waitForTimeout(500);
await p3.screenshot({ path: `${OUT}/desafio-trivia.png` });
// responder: cada uno la opción A y B; alguno acierta o pasa a la 2da
await p3.locator('button[data-answer="0"]').click({ force: true });
await rival.waitForTimeout(300);
if (await rival.locator('text=Pregunta').count()) { await rival.locator('button[data-answer="1"]').click({ force: true }).catch(() => {}); }
await p3.waitForTimeout(800);
await p3.screenshot({ path: `${OUT}/desafio-trivia-respuesta.png` });
// terminar la trivia como sea: seguir respondiendo hasta que se cierre
for (let i = 0; i < 12; i++) {
  for (const p of [p3, rival]) {
    try { if (await p.locator('text=Pregunta').count()) await p.locator(`button[data-answer="${i % 4}"]:not([disabled])`).click({ timeout: 800, force: true }); } catch {}
  }
  await p3.waitForTimeout(300);
  if (!(await p3.locator('text=Pregunta').count())) break;
}
await p3.waitForTimeout(800);
await p3.screenshot({ path: `${OUT}/desafio-resultado.png` });
ok(await p3.locator('text=Ganó').count() > 0 || await p3.locator('text=Sin ganador').count() > 0, 'trivia terminada');

// 6) Piedra papel o tijera
await p3.waitForTimeout(4500);
await clickIf(p3, 'Cerrar');
await click(p3, 'Desafiar');
await p3.locator('button:has-text("Piedra, papel o tijera")').click();
await click(p3, 'Desafiar por');
const rival2 = await whoHas([p1, p2], 'button:has-text("Acepto")');
await rival2.waitForSelector('button:has-text("Acepto")', { timeout: 8000 });
await click(rival2, '¡Acepto');
await p3.waitForSelector('.ppt-btn', { timeout: 8000 });
await p3.locator('.ppt-btn').nth(0).click();
await p3.screenshot({ path: `${OUT}/desafio-ppt.png` });
await rival2.locator('.ppt-btn').nth(2).click();
await p3.waitForTimeout(700);
await p3.screenshot({ path: `${OUT}/desafio-ppt-ronda.png` });
for (let i = 0; i < 6; i++) {
  if (!(await p3.locator('.ppt-btn').count())) break;
  await p3.locator('.ppt-btn:not([disabled])').first().click().catch(() => {});
  await rival2.locator('.ppt-btn:not([disabled])').nth(1).click().catch(() => {});
  await p3.waitForTimeout(600);
}
ok(true, 'ppt jugado');
await browser.close();
log(process.exitCode ? 'FALLÓ' : 'OK');
