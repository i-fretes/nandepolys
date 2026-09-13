// "Esquivá el rayo": el problema era que no daba tiempo a elegir (la ronda de 3 s arrancaba mientras
// todavía se veían los rayos de la anterior, y si elegían todos se resolvía al instante).
// Acá se mide el tiempo real que tiene un jugador para elegir en cada ronda y que pueda cambiar de casilla.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/rayo';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); p.on('dialog', d => d.accept()); return p; };
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);
const arena = p => p.evaluate(() => window.__nandepoly.store.getState().state.arena);
let fails = 0;
const check = (ok, msg) => { console.log(ok ? '✔' : '✘', msg); if (!ok) fails++; };

const [a, b, c] = await Promise.all([page(), page(), page()]);
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
for (const [p, name, tok] of [[b, 'Lucía', 'Chipa'], [c, 'Mateo', 'Carreta']]) {
  await p.goto(`${BASE}/sala/${code}`); await p.waitForSelector('button:has-text("Entrar a la sala")');
  await p.fill('input[maxlength="20"]', name); await p.click(`button[title="${tok}"]`); await p.click('button:has-text("Entrar a la sala")');
}
await a.waitForSelector('text=Jugadores (3/6)');
const cb = a.locator('label', { hasText: 'La Arena' }).locator('input[type=checkbox]');
if (!(await cb.isChecked())) { await cb.click(); await a.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 }); }
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c].map(p => p.waitForSelector('.board')));

// Caemos en la Arena y votamos "Esquivá el rayo"
const turn = (await a.evaluate(() => window.__nandepoly.store.getState().state.players[window.__nandepoly.store.getState().state.currentPlayerIndex].name));
const cur = { Ivan: a, 'Lucía': b, Mateo: c }[turn];
await dbg(cur, { position: 3, dice: [1, 2] });
await cur.locator('button:has-text("Tirar dados")').first().click({ force: true });
await a.waitForSelector('[data-arena-option]', { timeout: 15000 });
await dbg(a, { arenaGame: 'rayo' });
await a.waitForTimeout(300);
for (const p of [a, b, c]) { try { await p.locator('[data-arena-option]').first().click({ force: true, timeout: 3000 }); } catch {} }
await a.waitForSelector('.rayo-cell', { timeout: 20000 });
console.log('juego:', (await arena(a)).game, 'estado inicial:', JSON.stringify((await arena(a)).data).slice(0, 200));
// Esperamos a que termine la cuenta regresiva (3-2-1) para medir la ronda completa
await a.waitForFunction(() => {
  const s = window.__nandepoly.store.getState();
  const ar = s.state.arena;
  return ar && ar.stage === 'play' && Date.now() + s.clockOffset >= (ar.startedAt ?? 0);
}, null, { timeout: 20000 });

// Medimos tres rondas: cuánto tiempo real hay para elegir
const medidas = [];
for (let r = 0; r < 3; r++) {
  // esperamos a que empiece una ronda de elección
  await a.waitForFunction(() => {
    const d = window.__nandepoly.store.getState().state.arena?.data;
    return d && d.phase === 'pick';
  }, null, { timeout: 20000 }).catch(() => {});
  const viva = await arena(a);
  if (!viva || viva.stage !== 'play' || viva.data.phase !== 'pick') { console.log('  la Arena terminó en la ronda', viva?.round ?? '—'); break; }
  const meAlive = await a.evaluate(() => { const s = window.__nandepoly.store.getState(); return s.state.arena.alive.includes(s.playerId); });
  if (!meAlive) { console.log('  quedé afuera: no mido más rondas'); break; }
  const t0 = Date.now();
  // ¿los botones están habilitados desde el arranque de la ronda?
  const enabled = await a.locator('.rayo-cell:not([disabled])').count();
  // Clic en una casilla y después en otra: tiene que poder cambiar
  await a.locator('[data-cell="0"]').click({ force: true });
  await a.waitForTimeout(250);
  await a.locator('[data-cell="4"]').click({ force: true });
  const st = await arena(a);
  const mine = await a.evaluate(() => { const s = window.__nandepoly.store.getState(); return s.state.arena.data.picks[s.playerId]; });
  // Tiempo que quedaba visible cuando la ronda arrancó
  const queda = Number((await a.locator('[data-rayo-left]').innerText()).replace('s', ''));
  medidas.push({ ronda: st.round, enabled, mine, queda, ms: Date.now() - t0 });
  if (r === 0) await a.screenshot({ path: `${OUT}/1-eligiendo.png` });
  // esperamos el destape
  await a.waitForFunction(() => window.__nandepoly.store.getState().state.arena?.data?.phase === 'reveal', null, { timeout: 20000 }).catch(() => {});
  if (r === 0) { await a.waitForTimeout(300); await a.screenshot({ path: `${OUT}/2-rayos.png` }); }
  const fin = await a.evaluate(() => !window.__nandepoly.store.getState().state.arena || window.__nandepoly.store.getState().state.arena.stage !== 'play');
  if (fin) break;
  await a.waitForFunction(() => { const d = window.__nandepoly.store.getState().state.arena?.data; return !d || d.phase === 'pick'; }, null, { timeout: 20000 }).catch(() => {});
}
console.log('rondas medidas:', JSON.stringify(medidas));
check(medidas.length > 0, `se midieron rondas (${medidas.length})`);
check(medidas.every(m => m.enabled === 9 || m.enabled === 4), 'las casillas están habilitadas ni bien arranca la ronda');
check(medidas.every(m => m.mine === 4), 'se pudo cambiar de casilla (quedó la segunda elección)');
check(medidas.every(m => m.queda >= 2.5), `al arrancar cada ronda quedan al menos 2,5 s para elegir (${medidas.map(m => m.queda).join(', ')})`);

// Durante el destape no se puede elegir y el rival no ve mi casilla antes de tiempo
const secreto = await b.evaluate(() => {
  const s = window.__nandepoly.store.getState();
  const d = s.state.arena?.data;
  if (!d || d.phase !== 'pick') return null;
  return { ajenas: Object.keys(d.picks ?? {}).filter(id => id !== s.playerId).length, picked: (d.picked ?? []).length };
});
if (secreto) check(secreto.ajenas === 0, `nadie ve la casilla del otro mientras se elige (ve ${secreto.ajenas})`);

console.log(fails ? `FALLAS: ${fails}` : 'Rayo OK');
await browser.close();
process.exit(fails ? 1 : 0);
