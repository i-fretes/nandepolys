// Metiche: un tercero se mete en el trato de otros dos, el que propuso mejora y el dueño elige.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/metiche';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let bad = 0;
const ok = (c, m) => { console.log(c ? '✔' : '✘', m); if (!c) { bad++; process.exitCode = 1; } };
const page = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  return p;
};
const dlg = p => p.locator('div.fixed.inset-0.z-50').last();
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);

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
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c].map(p => p.waitForSelector('.board')));

// Ivan tiene Pilar, Lucía tiene Villarrica, Mateo mucha plata
await dbg(a, { give: 15, cash: 3000 });
await dbg(b, { give: 10 });
await dbg(c, { cash: 5000 });
await a.waitForTimeout(400);

// Ivan propone: Pilar + 200 mil por Villarrica
await a.click('button:has-text("Intercambiar")', { force: true });
await a.waitForSelector('text=Proponer intercambio');
await dlg(a).locator('button:has-text("Lucía")').first().click({ force: true });
await dlg(a).locator('input[type=number]').first().fill('200');
await dlg(a).locator('button:has-text("Pilar")').first().click({ force: true });
await dlg(a).locator('button:has-text("Villarrica")').first().click({ force: true });
await a.screenshot({ path: `${OUT}/1-propuesta.png` });
await dlg(a).locator('button:has-text("Enviar propuesta")').click({ force: true });
await a.waitForTimeout(700);

// El tablero de Lucía tiene que marcar verde lo que recibe y rojo lo que entrega
const marks = await b.evaluate(() => ({
  gain: [...document.querySelectorAll('.tile.trade-gain')].map(t => t.querySelector('.name')?.textContent.trim()),
  lose: [...document.querySelectorAll('.tile.trade-lose')].map(t => t.querySelector('.name')?.textContent.trim()),
}));
ok(marks.gain.includes('Pilar'), `verde (recibe) = Pilar ${JSON.stringify(marks.gain)}`);
ok(marks.lose.includes('Villarrica'), `rojo (entrega) = Villarrica ${JSON.stringify(marks.lose)}`);
await b.screenshot({ path: `${OUT}/2-brillo-lucia.png` });

// Mateo se mete de metiche con 1.000.000
await c.waitForSelector('button:has-text("Meterme")', { timeout: 8000 });
await c.click('button:has-text("Meterme")', { force: true });
await c.waitForSelector('text=Trato en la mesa');
await dlg(c).locator('input[type=number]').first().fill('1000');
await c.screenshot({ path: `${OUT}/3-metiche.png` });
await dlg(c).locator('button:has-text("Meterme por")').click({ force: true });
await c.waitForTimeout(800);
ok(await c.locator('text=Ya te metiste').count() > 0, 'Mateo se metió');

// Ivan ve al metiche y mejora
await a.waitForSelector('text=metiche', { timeout: 8000 });
ok(await a.locator('text=Podés mejorar tu oferta').count() > 0, 'Ivan puede mejorar su oferta');
await dlg(a).locator('input[type=number]').first().fill('1200');
await a.screenshot({ path: `${OUT}/4-mejorar.png` });
await dlg(a).locator('button:has-text("Mejorar mi oferta")').click({ force: true });
await a.waitForTimeout(700);

// Lucía elige entre las dos
await b.waitForSelector('text=ofertas', { timeout: 8000 });
const textos = await dlg(b).allInnerTexts();
ok(textos.join(' ').includes('metiche'), 'Lucía ve la oferta del metiche');
await b.screenshot({ path: `${OUT}/5-elige-lucia.png` });
await dlg(b).locator('button:has-text("Aceptar la de Mateo")').click({ force: true });
await b.waitForTimeout(900);

const owner = await b.evaluate(() => window.__nandepoly.store.getState().state.properties[10].owner);
const mateoId = await c.evaluate(() => window.__nandepoly.store.getState().playerId);
ok(owner && mateoId && owner === mateoId, `Villarrica quedó para Mateo (${owner} vs ${mateoId})`);
await b.screenshot({ path: `${OUT}/6-resultado.png` });

console.log(bad ? `\n${bad} problemas` : '\nMetiche OK');
await browser.close();
