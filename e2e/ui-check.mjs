// Barrido visual: lobby, reglas, propiedades, intercambio y fin de partida, en PC y celular.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'e2e/ui'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const M = process.env.MOBILE === '1';
const mk = async () => { const c = await b.newContext(M ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('PAGEERROR', e.message)); return p; };
const sfx = M ? '-m' : '';
const p = await mk();
await p.goto('http://localhost:8080');
await p.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await p.click('button:has-text("Crear sala")');
await p.waitForURL(/\/sala\//);
await p.click('button:has-text("Agregar bot")');
await p.waitForSelector('text=Jugadores (2/6)');
for (const label of ['Casinos', 'Desafíos entre jugadores', 'Duelo mayor', 'La Arena', 'Caja sorpresa', 'Misiones secretas', 'Eventos globales']) {
  const cb = p.locator('label', { hasText: label }).locator('input[type=checkbox]');
  await cb.click(); await p.waitForFunction(el => el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 });
}
await p.screenshot({ path: `${OUT}/lobby${sfx}.png`, fullPage: true });
await p.click('button:has-text("Cómo se juega")');
await p.waitForSelector('text=Objetivo');
await p.screenshot({ path: `${OUT}/reglas-indice${sfx}.png` });
await p.click('button:has-text("La Arena")');
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/reglas-arena${sfx}.png` });
await p.click('button:has-text("Cerrar")');
await p.click('button:has-text("Empezar partida")');
await p.waitForSelector('.board');
await p.evaluate(() => {
  const st = window.__nandepoly.store.getState();
  const me = st.playerId;
  const s = structuredClone(st.state);
  for (const id of [1, 3, 5, 7, 9, 16]) s.properties[id] = { owner: me, houses: id === 1 ? 3 : 0, mortgaged: id === 5 };
  window.__nandepoly.store.setState({ state: s });
});
await p.waitForTimeout(300);
await p.click('button:has-text("Propiedades")');
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/propiedades${sfx}.png`, fullPage: M });
await p.click('button:has-text("Cerrar")');
await p.click('button:has-text("Intercambiar")');
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/intercambio${sfx}.png`, fullPage: M });
await p.click('button:has-text("Cerrar")');
// Fin de partida
await p.evaluate(() => {
  const st = window.__nandepoly.store.getState();
  const s = structuredClone(st.state);
  s.phase = 'FINISHED'; s.winnerId = s.players[0].id;
  window.__nandepoly.store.setState({ state: s });
});
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/fin${sfx}.png`, fullPage: M });
await b.close();
console.log('OK');
