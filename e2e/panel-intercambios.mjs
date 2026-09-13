// Panel "Intercambios": la propuesta aparece en el panel del que la recibe (no como ventana), el que
// la mandó la ve "esperando", el tercero ve el botón para meterse, y aceptar desde el panel cierra el trato.
// También saca capturas de los dados nuevos.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/panel-intercambios';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); p.on('dialog', d => d.accept()); return p; };
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);
const st = p => p.evaluate(() => window.__nandepoly.store.getState().state);
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
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c].map(p => p.waitForSelector('.board')));
const ids = Object.fromEntries((await st(a)).players.map(p => [p.name, p.id]));

// Ivan tiene Villarrica (1), Lucía tiene Pilar (7). Ivan le propone Villarrica + 50 por Pilar.
await dbg(a, { give: 1 }); await dbg(a, { give: 7, playerId: ids['Lucía'] });
await a.waitForTimeout(300);
await a.evaluate(({ to }) => new Promise(r => window.__nandepoly.socket.emit('game:action', { type: 'TRADE_PROPOSE', toPlayerId: to, give: { cash: 50, properties: [1], jailCards: 0 }, receive: { cash: 0, properties: [7], jailCards: 0 } }, r)), { to: ids['Lucía'] });
await b.waitForSelector('[data-trades-incoming]', { timeout: 8000 });
check(await b.locator('[data-trades-incoming]').isVisible(), 'Lucía ve la propuesta en el panel Intercambios');
check((await b.locator('.fixed.inset-0').count()) === 0, 'a Lucía no se le abrió ninguna ventana encima del tablero');
check(await a.locator('[data-trades-mine]').isVisible(), 'Ivan ve su propuesta "esperando" en el panel');
check(await c.locator('[data-trades-other]').isVisible(), 'Mateo ve el trato ajeno en el panel');
const meterme = c.locator('[data-trades-other] button:has-text("Meterme")');
check(await meterme.isEnabled(), 'Mateo tiene el botón para meterse de metiche');
// el panel late (ring) para la que recibe
check((await b.locator('[data-trades]').getAttribute('class')).includes('ring-2'), 'el panel de Lucía se resalta al llegar la propuesta');
await b.screenshot({ path: `${OUT}/1-lucia-recibe.png` });
await c.screenshot({ path: `${OUT}/2-mateo-tercero.png` });

// Mateo se mete: se abre la ventana del metiche (es un editor), ofrece 100 y confirma
await meterme.click({ force: true }); // 'breathe' lo anima, por eso force
await c.waitForSelector('h2:has-text("Trato en la mesa")');
await c.locator('input[type=number]').first().fill('100');
await c.locator('.fixed.inset-0 button:has-text("Meterme por")').click();
await b.waitForFunction(() => [...document.querySelectorAll('[data-trades-incoming] button')].filter(b => /Aceptar/.test(b.textContent)).length >= 2, null, { timeout: 8000 }).catch(() => {});
await c.waitForTimeout(600); // animación de cierre de la ventana
console.log('  dialog en store de Mateo:', await c.evaluate(() => window.__nandepoly.store.getState().dialog), 'rivals:', (await st(c)).tradeRivals.length);
const ofertas = await b.locator('[data-trades-incoming] button:has-text("Aceptar")').count();
check(ofertas === 2, `Lucía ve 2 ofertas en el panel (original + metiche), vio ${ofertas}`);
await c.waitForFunction(() => document.querySelectorAll('.fixed.inset-0').length === 0, null, { timeout: 4000 }).catch(() => {});
const abiertas = await c.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].map(e => e.textContent.slice(0, 60)));
check(abiertas.length === 0, `la ventana del metiche se cerró sola al meterse (${JSON.stringify(abiertas)})`);
check(await a.locator('[data-trades-mine] button:has-text("Mejorar")').isVisible(), 'Ivan ve el botón para mejorar su oferta');
await b.screenshot({ path: `${OUT}/3-lucia-dos-ofertas.png` });

// Lucía acepta la original desde el panel
await b.locator('[data-trades-incoming] .border-emerald-400 button:has-text("Aceptar")').click();
await b.waitForFunction(() => !window.__nandepoly.store.getState().state.pendingTrade, null, { timeout: 8000 });
const s2 = await st(b);
check(s2.properties[7].owner === ids['Ivan'] && s2.properties[1].owner === ids['Lucía'], 'el trato se cerró: Pilar para Ivan, Villarrica para Lucía');
check(await b.locator('[data-trades] :text("No hay ninguna propuesta")').isVisible(), 'el panel vuelve a "sin propuestas"');

// Dados nuevos: capturamos una tirada (rodando y frenados)
const cur = [a, b, c].find(async () => true);
const turn = (await st(a)).players[(await st(a)).currentPlayerIndex].name;
const pg = { Ivan: a, 'Lucía': b, Mateo: c }[turn];
await dbg(pg, { dice: [6, 3] });
await pg.locator('button:has-text("Tirar dados")').first().click({ force: true });
await pg.waitForTimeout(350);
const bb = await pg.locator('.board').boundingBox();
const clip = { x: bb.x + bb.width * 0.3, y: bb.y + bb.height * 0.3, width: bb.width * 0.4, height: bb.height * 0.4 };
await pg.screenshot({ path: `${OUT}/4-dados-rodando.png`, clip });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${OUT}/5-dados-quietos.png`, clip });
const faces = await pg.evaluate(() => [...document.querySelectorAll('.dice-stage .die')].map(d => d.getAttribute('aria-label')));
check(faces.join() === 'Dado: 6,Dado: 3', `los dados muestran 6 y 3 (${faces.join(' / ')})`);
check((await pg.locator('.die3d').count()) === 0, 'no queda ningún dado 3D');

console.log(fails ? `FALLAS: ${fails}` : 'Panel de intercambios OK');
await browser.close();
process.exit(fails ? 1 : 0);
