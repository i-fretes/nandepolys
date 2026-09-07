// Verifica que los carretes (caja sorpresa y ruleta de eventos) se muevan de verdad: mide el transform en el tiempo.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8080'; const OUT = process.argv[3] ?? 'e2e/reels'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const a = await ctx.newPage(); a.on('dialog', d => d.accept());
a.on('pageerror', e => console.error('PAGE ERROR', e.message));
await a.goto(BASE); await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan'); await a.click('button:has-text("Crear sala")'); await a.waitForURL(/\/sala\//);
await a.click("button:has-text(\"Agregar bot\")"); await a.waitForSelector("text=Jugadores (2/6)");
await a.click('button:has-text("Empezar partida")'); await a.waitForSelector('.board');
const me = await a.evaluate(() => window.__nandepoly.store.getState().playerId);
const tx = sel => a.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const m = getComputedStyle(el).transform; return m; }, sel);
// --- caja ---
await a.evaluate(id => window.__nandepoly.store.setState({ lootbox: { id: 77, playerId: id, index: 2, label: '₲ 200.000', amount: 200, prize: 'g200', openedAt: null } }), me);
await a.waitForSelector('[data-open-box]');
await a.click('[data-open-box]', { force: true });
const samples = [];
for (let i = 0; i < 8; i++) { await a.waitForTimeout(450); samples.push(await tx('.lb-strip')); if (i === 1) await a.screenshot({ path: `${OUT}/caja-1.png` }); if (i === 4) await a.screenshot({ path: `${OUT}/caja-2.png` }); }
await a.screenshot({ path: `${OUT}/caja-fin.png` });
const xs = samples.map(m => m ? Number(m.split(',')[4]) : NaN);
console.log('caja translateX:', xs.map(x => Math.round(x)).join(' → '));
const moving = new Set(xs.map(x => Math.round(x))).size > 4 && xs[0] > xs[xs.length - 1];
console.log(moving ? '✔ la caja gira (de derecha a izquierda) y frena' : '✘ la caja no se mueve');
await a.evaluate(() => window.__nandepoly.store.setState({ lootbox: null }));
await a.waitForTimeout(600);
// --- ruleta de eventos ---
await a.evaluate(() => window.__nandepoly.store.setState({ eventSpin: { id: 5, eventId: 'hora_feliz', index: 1, text: 'x' } }));
await a.waitForSelector('.lb-strip');
const s2 = [];
for (let i = 0; i < 14; i++) { await a.waitForTimeout(500); s2.push(await tx('.lb-strip')); if (i === 2) await a.screenshot({ path: `${OUT}/ruleta-1.png` }); if (i === 8) await a.screenshot({ path: `${OUT}/ruleta-2.png` }); }
await a.screenshot({ path: `${OUT}/ruleta-fin.png` });
const xs2 = s2.map(m => m ? Number(m.split(',')[4]) : NaN);
console.log('ruleta translateX:', xs2.map(x => Math.round(x)).join(' → '));
const mov2 = new Set(xs2.map(x => Math.round(x))).size > 6 && xs2[0] < xs2[xs2.length - 1];
console.log(mov2 ? '✔ la ruleta gira (de izquierda a derecha) y frena' : '✘ la ruleta no se mueve');
await browser.close();
process.exit(moving && mov2 ? 0 : 1);
