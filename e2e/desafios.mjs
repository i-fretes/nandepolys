// El final de los desafíos se cuenta con calma: antes saltaba al ganador y no se veía qué pasó.
// Duelo de dados: se ven las dos tiradas, se marca la más alta y recién después el ganador.
// Trivia: queda la pregunta, se marca la correcta y se ve qué puso cada uno, y después el ganador.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/desafios';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); p.on('dialog', d => d.accept()); return p; };
const act = (p, a) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('game:action', x, r)), a);
let fails = 0;
const check = (ok, msg) => { console.log(ok ? '✔' : '✘', msg); if (!ok) fails++; };

const [a, b] = await Promise.all([page(), page()]);
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
const cb = a.locator('label', { hasText: 'Desafíos entre jugadores' }).locator('input[type=checkbox]');
if (!(await cb.isChecked())) { await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 }); }
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b].map(p => p.waitForSelector('.board')));
const ids = await a.evaluate(() => Object.fromEntries(window.__nandepoly.store.getState().state.players.map(p => [p.name, p.id])));
const quienJuega = async () => { const s = await a.evaluate(() => window.__nandepoly.store.getState().state); return s.players[s.currentPlayerIndex].name; };

async function jugar(kind) {
  const turno = await quienJuega();
  const [reta, rival] = turno === 'Ivan' ? [a, b] : [b, a];
  const rivalId = turno === 'Ivan' ? ids['Lucía'] : ids['Ivan'];
  await act(reta, { type: 'CHALLENGE_PROPOSE', toId: rivalId, kind, amount: 100 });
  await rival.waitForSelector('button:has-text("Acepto")', { timeout: 8000 });
  await rival.locator('button:has-text("Acepto")').click({ force: true });
  return [reta, rival];
}

// --- Duelo de dados ---------------------------------------------------------------------------
{
  const [reta, rival] = await jugar('dados');
  for (const p of [reta, rival]) { await p.waitForSelector('[data-roll-dados]', { timeout: 8000 }); await p.locator('[data-roll-dados]').click({ force: true }); await p.waitForTimeout(400); }
  await reta.waitForSelector('[data-dados-final]', { timeout: 10000 });
  const t0 = Date.now();
  check(true, 'al terminar se ve la mesa del duelo, no el ganador de una');
  check((await reta.locator('[data-challenge-splash]').count()) === 0, 'el ganador no aparece de entrada');
  const dados = await reta.locator('[data-dados-final] .die').count();
  check(dados === 4, `se ven las cuatro caras de los dados (${dados})`);
  await reta.screenshot({ path: `${OUT}/1-dados-tiradas.png` });
  await reta.waitForSelector('[data-dados-final][data-step="1"]', { timeout: 6000 });
  await reta.screenshot({ path: `${OUT}/2-dados-mas-alta.png` });
  const marcada = await reta.locator('[data-dados-final] .border-emerald-500').count();
  check(marcada === 1, 'se marca en verde la tirada más alta');
  await reta.waitForSelector('[data-challenge-splash]', { timeout: 8000 });
  const tardo = Date.now() - t0;
  check(tardo >= 2500, `el ganador aparece después de mostrar las tiradas (${tardo} ms)`);
  await reta.screenshot({ path: `${OUT}/3-dados-ganador.png` });
  await reta.locator('[data-challenge-splash] button:has-text("Cerrar")').click({ force: true });
  await reta.waitForTimeout(400);
}

// --- Trivia -----------------------------------------------------------------------------------
{
  // terminamos el turno para poder desafiar de nuevo
  for (const p of [a, b]) { try { await p.locator('button:has-text("Terminar turno")').first().click({ force: true, timeout: 1500 }); } catch {} }
  await a.waitForTimeout(600);
  const [reta, rival] = await jugar('trivia');
  await reta.waitForSelector('[data-answer]', { timeout: 8000 });
  // Respondemos por socket hasta que el desafío termine (acierta alguno o se agotan las 3 preguntas)
  for (let i = 0; i < 12; i++) {
    const vivo = await reta.evaluate(() => !!window.__nandepoly.store.getState().state.challenge);
    if (!vivo) break;
    for (const p of [reta, rival]) { try { await act(p, { type: 'CHALLENGE_MOVE', answer: i % 4 }); } catch {} }
    await reta.waitForTimeout(350);
  }
  await reta.waitForSelector('[data-trivia-final]', { timeout: 15000 });
  check((await reta.locator('[data-challenge-splash]').count()) === 0, 'trivia: el ganador no aparece de entrada');
  await reta.screenshot({ path: `${OUT}/4-trivia-respuestas.png` });
  await reta.waitForSelector('[data-trivia-final][data-step="1"]', { timeout: 6000 });
  const correcta = await reta.locator('[data-trivia-final] .border-emerald-500').count();
  check(correcta === 1, 'se marca en verde la respuesta correcta');
  const quienes = await reta.locator('[data-trivia-final] .chip').count();
  check(quienes >= 1, `se ve qué respondió cada uno (${quienes} etiquetas)`);
  await reta.screenshot({ path: `${OUT}/5-trivia-correcta.png` });
  await reta.waitForSelector('[data-challenge-splash]', { timeout: 8000 });
  await reta.screenshot({ path: `${OUT}/6-trivia-ganador.png` });
}

console.log(fails ? `FALLAS: ${fails}` : 'Desafíos OK');
await browser.close();
process.exit(fails ? 1 : 0);
