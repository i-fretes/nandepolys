// Nada encima de nada: el jugador pasa por Salida (caja sorpresa) y cae en Suerte con la carta
// ¡Desafío!. Antes aparecían la caja y el selector de desafío uno encima del otro. Ahora el orden es:
// ficha se mueve → se lee la carta → selector de desafío → (al terminar) caja sorpresa.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/ventanas';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); p.on('dialog', d => d.accept()); return p; };
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);
let fails = 0;
const check = (ok, msg) => { console.log(ok ? '✔' : '✘', msg); if (!ok) fails++; };

const [a, b] = await Promise.all([page(), page()]);
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
for (const lbl of ['Caja sorpresa', 'Desafíos']) {
  const cb = a.locator('label', { hasText: lbl }).locator('input[type=checkbox]');
  if (await cb.count() && !(await cb.isChecked())) { await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 }); }
}
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b].map(p => p.waitForSelector('.board')));
const cur = (await a.locator('.center b').first().innerText()).includes('Ivan') ? a : b;

// Desde la casilla 41 con 3+2 = 5 → pasa por Salida (caja) y cae en 2 (Cooperativa) con la carta ¡Desafío! arriba
await dbg(cur, { position: 41, dice: [3, 2], topCard: 'C17' });
await cur.locator('button:has-text("Tirar dados")').first().click({ force: true });

// Muestreamos qué ventanas hay abiertas a la vez durante 16 s
const seen = [];
let overlap = false;
for (let i = 0; i < 64; i++) {
  const st = await cur.evaluate(() => ({
    caja: !!document.querySelector('.lootbox'),
    carta: !!document.querySelector('.cardflip'),
    desafioTxt: [...document.querySelectorAll('h2')].some(h => /Desafío obligatorio/.test(h.textContent)),
    modales: document.querySelectorAll('.fixed.inset-0').length,
    cardTxt: document.querySelector('.cardface.front')?.textContent?.slice(0, 40) ?? '',
    ch: window.__nandepoly.store.getState().state.challenge?.status ?? null,
    phase: window.__nandepoly.store.getState().state.turnPhase,
  }));
  if (i % 8 === 0) console.log('  t=' + (i / 4) + 's', JSON.stringify(st));
  const open = [st.caja && 'caja', st.carta && 'carta', st.desafioTxt && 'desafio'].filter(Boolean);
  if (open.length > 1) overlap = true;
  const key = open.join('+') || '-';
  if (seen[seen.length - 1] !== key) seen.push(key);
  if (st.desafioTxt && !st.caja && !st.carta) { await cur.screenshot({ path: `${OUT}/2-desafio-solo.png` }); }
  if (st.carta && seen.length <= 2) { await cur.screenshot({ path: `${OUT}/1-carta.png` }); }
  await cur.waitForTimeout(250);
}
console.log('secuencia de ventanas:', seen.join(' → '));
check(!overlap, 'nunca hubo dos ventanas (caja / carta / desafío) abiertas a la vez');
check(seen.includes('carta'), 'se leyó la carta');
check(seen.includes('desafio'), 'apareció el selector de desafío');
check(seen.indexOf('carta') < seen.indexOf('desafio'), 'la carta fue antes que el desafío');
check(!seen.includes('caja'), 'la caja sorpresa esperó mientras el desafío estaba abierto');

// Cerramos el desafío eligiendo rival y juego; después tiene que aparecer la caja
try {
  await cur.locator('button:has-text("Desafiar")').last().click({ timeout: 3000 });
} catch { /* quizás el selector tiene otro botón */ }
let cajaLuego = false;
for (let i = 0; i < 160 && !cajaLuego; i++) { cajaLuego = await cur.evaluate(() => !!document.querySelector('.lootbox')); await cur.waitForTimeout(250); }
check(cajaLuego, 'la caja sorpresa apareció después (no se perdió)');
if (cajaLuego) await cur.screenshot({ path: `${OUT}/3-caja-despues.png` });

console.log(fails ? `FALLAS: ${fails}` : 'Ventanas OK');
await browser.close();
process.exit(fails ? 1 : 0);
