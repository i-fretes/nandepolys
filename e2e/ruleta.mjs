// Comprueba que la Ruleta del Casino se ve igual que lo que dice el motor:
// el número que frena bajo el marcador es el que salió, y el color de esa celda coincide
// con ganar/perder. Además mide cuántas veces se gana (tiene que perderse más que ganarse).
// Requiere el servidor compilado con DEBUG_TOOLS=1.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/ruleta';
const ROUNDS = Number(process.argv[4] ?? 12);
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
let failed = 0;
const ok = (cond, msg) => { log(cond ? '✔' : '✘', msg); if (!cond) { failed++; process.exitCode = 1; } };

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  return p;
}
const dbg = (p, data) => p.evaluate(d => new Promise(res => window.__nandepoly.socket.emit('debug:set', d, res)), data);
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const click = (p, text) => p.locator('button:not([disabled])', { hasText: new RegExp('(^|\\s)' + esc(text)) }).first().click({ timeout: 8000, force: true });

const [a, b] = await Promise.all([page(), page()]);
await a.goto(BASE);
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`);
await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía');
await b.click('button[title="Chipa"]');
await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');

const cb = a.locator('label', { hasText: 'Casinos' }).locator('input[type=checkbox]');
await cb.click();
await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
await offNandu(a);
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b].map(p => p.waitForSelector('.board')));

const pages = { Ivan: a, 'Lucía': b };
const turnOf = async () => (await a.locator('.center b').first().innerText()).replace('Turno de ', '');

let wins = 0, losses = 0;
for (let i = 0; i < ROUNDS; i++) {
  const p = pages[await turnOf()];
  const rival = p === a ? b : a;
  await dbg(p, { position: 36, dice: [1, 2], cash: 5000 });
  await click(p, 'Tirar dados');
  await p.waitForSelector('button:has-text("Apostar")', { timeout: 10000 });
  // La mesa está abierta para todos. En una de cada dos rondas el rival también apuesta
  // (además de probar el modo multijugador, mueve la semilla y así no sale siempre el mismo número).
  if (i % 2 === 1) {
    await rival.locator('button:has-text("10 mil")').first().click();
    await click(rival, 'Apostar');
    await rival.waitForTimeout(4200);
    await click(rival, 'Listo, salgo del Casino');
  } else {
    await click(rival, 'Paso, no apuesto');
  }
  await p.locator('button:has-text("200 mil")').first().click();
  await click(p, 'Apostar');

  // Esperamos a que frene el carrete y aparezca el resultado
  const res = p.locator('[data-ruleta-result]');
  await res.waitFor({ timeout: 12000 });
  const verdict = await res.getAttribute('data-ruleta-result');
  const text = (await res.innerText()).trim();

  // ¿Qué celda quedó realmente bajo el marcador?
  const under = await p.evaluate(() => {
    const marker = document.querySelector('.reel-marker');
    const win = document.querySelector('.reel-cell.hit');
    if (!marker || !win) return null;
    const m = marker.getBoundingClientRect();
    const x = m.left + m.width / 2;
    const cells = [...document.querySelectorAll('.reel-cell')];
    const at = cells.find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x <= r.right; });
    return {
      markerCell: at ? at.textContent.trim() : null,
      markerIsWin: at ? at.classList.contains('win') : null,
      hitCell: win.textContent.trim(),
      hitIsWin: win.classList.contains('win'),
      sameCell: at === win,
    };
  });

  const roll = Number((text.match(/Salió (\d+)/) || [])[1]);
  ok(Number.isFinite(roll), `tirada ${i + 1}: el texto dice el número (${text})`);
  ok(under && under.sameCell, `tirada ${i + 1}: la celda bajo el marcador es la ganadora (${JSON.stringify(under)})`);
  ok(under && under.hitCell.startsWith(String(roll)), `tirada ${i + 1}: la celda frenada muestra ${roll} (${under && under.hitCell})`);
  // El color de la celda tiene que coincidir con el veredicto
  ok(under && under.hitIsWin === (verdict === 'win'), `tirada ${i + 1}: color de la celda coincide con ${verdict}`);
  // Y el veredicto tiene que coincidir con la regla: 1..43 gana
  ok((roll <= 43) === (verdict === 'win'), `tirada ${i + 1}: salió ${roll} y el resultado es ${verdict}`);

  if (verdict === 'win') wins++; else losses++;
  if (i < 3) await p.screenshot({ path: `${OUT}/ruleta-${i + 1}-${verdict}.png` });

  await click(p, 'Listo, salgo del Casino');
  await p.waitForSelector('button:has-text("Terminar turno")', { timeout: 8000 });
  await click(p, 'Terminar turno');
  await a.waitForTimeout(250);
}

log(`\nResultados: ${wins} ganadas / ${losses} perdidas de ${ROUNDS}`);
ok(losses > 0, 'se pierde alguna vez (no "siempre se gana")');
log(failed ? `\n${failed} comprobaciones fallaron` : '\nTodo bien');
await browser.close();
