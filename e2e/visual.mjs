// Capturas de las animaciones nuevas: vista de mesa, dados rodando, carta que vuela, podio.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/visual';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = async () => { const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.5 }); const p = await ctx.newPage(); p.on('pageerror', e => console.error('PAGE ERROR', e.message)); p.on('dialog', d => d.accept()); return p; };
const dbg = (p, d) => p.evaluate(x => new Promise(r => window.__nandepoly.socket.emit('debug:set', x, r)), d);
async function offNandu(page) {
  const cb = page.locator('label', { hasText: 'Dado ñandú' }).locator('input[type=checkbox]');
  if (await cb.count() && await cb.isChecked()) { await cb.click(); await page.waitForFunction(el => !el.checked, await cb.elementHandle(), { timeout: 5000, polling: 200 }); }
}
const [a, b] = await Promise.all([page(), page()]);
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//); const code = a.url().split('/sala/')[1];
await b.goto(`${BASE}/sala/${code}`); await b.waitForSelector('button:has-text("Entrar a la sala")');
await b.fill('input[maxlength="20"]', 'Lucía'); await b.click('button[title="Chipa"]'); await b.click('button:has-text("Entrar a la sala")');
await a.waitForSelector('text=Jugadores (2/6)');
await offNandu(a);
await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b].map(p => p.waitForSelector('.board')));
const cur = (await a.locator('.center b').first().innerText()).includes('Ivan') ? a : b;

// Propiedades y casas para que se vea el relieve
for (const t of [1, 3, 7, 9, 10, 18, 20, 21]) await dbg(a, { give: t });
await dbg(a, { cash: 99999 });
await a.waitForTimeout(300);
for (const t of [1, 3, 1, 3, 1, 3, 1, 3, 1, 7, 9, 10, 18, 20, 21, 18, 20, 21]) { try { await a.evaluate(id => new Promise(r => window.__nandepoly.socket.emit('game:action', { type: 'BUILD', tileId: id }, r)), t); } catch {} }
await a.waitForTimeout(600);

// Vista de mesa
await a.click('button[title*="Vista de mesa"]');
await a.waitForTimeout(700);
await a.screenshot({ path: `${OUT}/1-vista-mesa.png` });
const bb = await a.locator('.board').boundingBox();
await a.screenshot({ path: `${OUT}/2-vista-mesa-detalle.png`, clip: { x: bb.x, y: bb.y + bb.height * 0.5, width: bb.width * 0.6, height: bb.height * 0.5 } });
await a.click('button[title="Vista plana"]');
await a.waitForTimeout(400);

// Dados rodando: capturamos en pleno vuelo
const cur2 = (await a.locator('.center b').first().innerText()).includes('Ivan') ? a : b;
await dbg(cur2, { position: 0, dice: [3, 4] });
await cur2.locator('button:has-text("Tirar dados")').first().click({ force: true, timeout: 15000 });
await cur2.waitForTimeout(250);
await cur2.screenshot({ path: `${OUT}/3-dados-rodando.png`, clip: { x: bb.x + bb.width * 0.2, y: bb.y + bb.height * 0.2, width: bb.width * 0.6, height: bb.height * 0.6 } });
await cur2.waitForTimeout(900);
await cur2.screenshot({ path: `${OUT}/4-ficha-saltando.png`, clip: { x: bb.x, y: bb.y + bb.height * 0.55, width: bb.width, height: bb.height * 0.45 } });
await cur2.waitForTimeout(3500);
// cerrar lo que haya hasta que le toque tirar al siguiente
for (let i = 0; i < 20; i++) {
  const ph = await a.evaluate(() => window.__nandepoly.store.getState().state.turnPhase);
  if (ph === 'AWAITING_ROLL') break;
  for (const p of [a, b]) for (const t of ['No comprar', 'Subastar', 'No, gracias', 'Pagar', 'Terminar turno', 'Entendido']) { try { await p.locator(`button:has-text("${t}")`).first().click({ force: true, timeout: 300 }); } catch {} }
  await a.waitForTimeout(500);
}

// Carta que vuela desde el mazo
const nxt = (await a.locator('.center b').first().innerText()).includes('Ivan') ? a : b;
await dbg(nxt, { position: 5, dice: [1, 2] }); // → 8 Suerte
await nxt.locator('button:has-text("Tirar dados")').first().click({ force: true });
await nxt.waitForSelector('.cardflip', { timeout: 10000 });
await nxt.waitForTimeout(60);
await nxt.screenshot({ path: `${OUT}/5-carta-volando.png` });
await nxt.waitForTimeout(1200);
await nxt.screenshot({ path: `${OUT}/6-carta-dada-vuelta.png` });
// mientras se lee la carta la ficha está frenada en Suerte y la barra no ofrece comprar todavía
const bar = await nxt.locator('.actionbar, [data-actionbar]').first().innerText().catch(() => '');
console.log('barra durante la carta:', bar.slice(0, 60));
await nxt.waitForTimeout(3500);
await nxt.screenshot({ path: `${OUT}/6b-despues-de-la-carta.png` });

// Podio: terminamos la partida
await a.click('button:has-text("Más")');
await a.click('button:has-text("Terminar partida")');
await a.waitForSelector('.fpodium', { timeout: 8000 });
await a.waitForTimeout(2600);
await a.screenshot({ path: `${OUT}/7-podio.png` });
console.log('OK');
await browser.close();
