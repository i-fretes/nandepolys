// Blackjack como desafío: el que desafía es la banca, el rival apuesta y decide.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/blackjack';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let bad = 0; const ok = (c, m) => { console.log(c ? '✔' : '✘', m); if (!c) { bad++; process.exitCode = 1; } };
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); return p; };
const dlg = p => p.locator('div.fixed.inset-0.z-50').last();

const [a, b] = await Promise.all([page(), page()]);
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
const cb = a.locator('label', { hasText: 'Desafíos entre jugadores' }).locator('input[type=checkbox]');
await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b].map(p => p.waitForSelector('.board')));

const first = (await a.locator('.center b').first().innerText()).replace('Turno de ', '');
const house = first === 'Ivan' ? a : b, bettor = first === 'Ivan' ? b : a;
const houseName = first, bettorName = first === 'Ivan' ? 'Lucía' : 'Ivan';

await house.click('button:has-text("Desafiar")', { force: true });
await house.waitForSelector('text=Blackjack');
await dlg(house).locator('button:has-text("Blackjack")').first().click({ force: true });
await dlg(house).locator('button:has-text("Desafiar por")').first().click({ force: true });
await bettor.waitForSelector('button:has-text("Acepto")', { timeout: 8000 });
await dlg(bettor).locator('button:has-text("Acepto")').click({ force: true });

await bettor.waitForSelector('.bjtable', { timeout: 8000 });
await house.waitForSelector('.bjtable', { timeout: 8000 });
await bettor.waitForTimeout(700);
await bettor.screenshot({ path: `${OUT}/1-mesa-apostador.png` });
await house.screenshot({ path: `${OUT}/2-mesa-banca.png` });

const cards = await bettor.locator('.bjtable .bjcard').count();
ok(cards === 4, `se repartieron 4 cartas (${cards})`);
ok(await bettor.locator('.bjcard.hidden').count() === 1, 'la banca tiene una carta tapada');
ok(await house.locator('[data-bj]').count() === 0, 'la banca no tiene botones: juega sola');

// El apostador decide (si no salió blackjack natural de entrada)
if (await bettor.locator('[data-bj="stand"]').count()) {
  ok(await bettor.locator('[data-bj="hit"]').count() === 1 && await bettor.locator('[data-bj="double"]').count() === 1, 'apostador ve Pedir / Plantarme / Doblar');
  await bettor.locator('[data-bj="stand"]').click({ force: true });
}
// El final se cuenta con calma: primero la mesa como quedó (carta tapada), sin resultado ni ganador todavía
await bettor.waitForSelector('[data-bj-final]', { timeout: 8000 });
const t0 = Date.now();
ok(await bettor.locator('[data-bj-final] .bjcard.hidden').count() === 1, 'al terminar, la banca todavía tiene la carta tapada (no se apura)');
ok(await bettor.locator('.bj-result').count() === 0, 'el resultado no aparece de entrada');
ok(await bettor.locator('[data-challenge-splash]').count() === 0, 'el cartel del ganador no aparece de entrada');
await bettor.screenshot({ path: `${OUT}/3a-final-tapada.png` });
await bettor.waitForSelector('[data-bj-final] .bjcard:not(.hidden) >> nth=1', { timeout: 5000 });
const tFlip = Date.now() - t0;
ok(tFlip >= 800, `la banca dio vuelta la carta después de ~1 s (${tFlip} ms)`);
await bettor.screenshot({ path: `${OUT}/3b-final-destapada.png` });
await bettor.waitForSelector('.bj-result', { timeout: 15000 });
const tRes = Date.now() - t0;
const res = (await bettor.locator('.bj-result').innerText()).trim();
ok(/Gana|Empate|BLACKJACK/.test(res), `resultado en pantalla: "${res}" (a los ${tRes} ms)`);
ok(tRes >= 1800, 'el resultado esperó a que la banca jugara');
ok(await bettor.locator('.bjcard.hidden').count() === 0, 'la carta tapada se reveló');
await bettor.waitForSelector('[data-challenge-splash]', { timeout: 6000 });
ok(Date.now() - t0 >= tRes + 900, 'el cartel del ganador salió después del resultado');
await bettor.screenshot({ path: `${OUT}/3-resultado.png` });

// la plata se movió (o empate)
await bettor.waitForTimeout(1500);
const cash = await a.evaluate(() => Object.fromEntries(window.__nandepoly.store.getState().state.players.map(p => [p.name, p.cash])));
console.log('efectivo:', JSON.stringify(cash));
const moved = cash[houseName] !== 1500 || cash[bettorName] !== 1500;
ok(moved || /Empate/.test(res), 'la apuesta se pagó (o fue empate)');
console.log(bad ? `\n${bad} problemas` : '\nBlackjack OK');
await browser.close();
