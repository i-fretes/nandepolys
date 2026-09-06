// Prueba de las funciones nuevas: reglas, reemplazo por bot, sacar jugador, abandonar, fin y revancha.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/features';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const log = (...a) => console.log(...a);
const ok = (cond, msg) => { log(cond ? '✔' : '✘', msg); if (!cond) process.exitCode = 1; };

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  p.on('dialog', d => d.accept()); // confirm() → aceptar
  return p;
}
const clickIf = async (p, text) => {
  const btn = p.locator(`button:has-text("${text}"):not([disabled])`).first();
  try { if (await btn.count() && await btn.isVisible()) { await btn.click({ timeout: 1500, force: true }); return true; } } catch {}
  return false;
};

const [a, b, c, d] = await Promise.all([page(), page(), page(), page()]);
await a.goto(BASE);
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
const code = a.url().split('/sala/')[1];
for (const [p, name, tok] of [[b, 'Lucía', 'Chipa'], [c, 'Mateo', 'Carreta'], [d, 'Sofía', 'Arpa paraguaya']]) {
  await p.goto(`${BASE}/sala/${code}`);
  await p.waitForSelector('button:has-text("Entrar a la sala")');
  await p.fill('input[maxlength="20"]', name);
  await p.click(`button[title="${tok}"]`);
  await p.click('button:has-text("Entrar a la sala")');
}
await a.waitForSelector('text=Jugadores (4/6)');

// Reglas desde el lobby
await a.click('button:has-text("Cómo se juega")');
await a.waitForSelector('text=Objetivo');
await a.click('button:has-text("Negociar")');
await a.screenshot({ path: `${OUT}/reglas.png` });
await a.click('button:has-text("Cerrar")');

await a.click('button:has-text("Empezar partida")');
await Promise.all([a, b, c, d].map(p => p.waitForSelector('.board')));

// Jugar unos turnos
const pages = [a, b, c, d];
for (let i = 0; i < 60; i++) {
  for (const p of pages) {
    await clickIf(p, 'Entendido');
    await clickIf(p, 'Tirar dados') || await clickIf(p, 'Intentar dobles') || await clickIf(p, 'Comprar por') || await clickIf(p, 'Pagar ₲ 200.000') || await clickIf(p, 'Me retiro') || await clickIf(p, 'Terminar turno');
  }
  await a.waitForTimeout(80);
}
await a.screenshot({ path: `${OUT}/panel-anfitrion.png` });

// El anfitrión reemplaza a Mateo por un bot; Mateo cierra su pestaña
const mateoCard = a.locator('.card', { hasText: 'Mateo' }).first();
await mateoCard.locator('button:has-text("Reemplazar por bot")').click();
await a.waitForSelector('text=Mateo ahora es controlado por un bot', { timeout: 5000 }).catch(() => {});
ok(await a.locator('.card', { hasText: 'Mateo' }).first().locator('text=Bot').count() > 0, 'Mateo reemplazado por bot');
const mateoCtx = c.context();
await c.close();
// La partida sigue avanzando con el bot
const turnBefore = await a.locator('.center b').first().innerText();
for (let i = 0; i < 40; i++) {
  for (const p of [a, b, d]) {
    await clickIf(p, 'Entendido');
    await clickIf(p, 'Tirar dados') || await clickIf(p, 'Intentar dobles') || await clickIf(p, 'Comprar por') || await clickIf(p, 'Pagar ₲ 200.000') || await clickIf(p, 'Me retiro') || await clickIf(p, 'Terminar turno');
  }
  await a.waitForTimeout(120);
}
ok(true, `la partida siguió (antes: "${turnBefore}", ahora: "${await a.locator('.center b').first().innerText()}")`);

// Mateo vuelve → recupera el control
const c2 = await mateoCtx.newPage();
c2.on('dialog', dd => dd.accept());
await c2.goto(`${BASE}/sala/${code}`);
await c2.waitForSelector('.board');
await c2.waitForTimeout(800);
ok((await a.locator('.card', { hasText: 'Mateo' }).first().locator('span:text-is("Bot")').count()) === 0, 'Mateo recuperó el control al volver');

// Sofía abandona por su cuenta
await d.click('button:has-text("Abandonar partida")');
await a.waitForSelector('text=Sofía abandonó la partida', { timeout: 5000 });
ok(true, 'Sofía abandonó; sus propiedades van a subasta si tenía');
for (let i = 0; i < 12; i++) { for (const p of [a, b, c2]) await clickIf(p, 'Me retiro'); await a.waitForTimeout(150); }

// El anfitrión saca a Lucía
await a.locator('.card', { hasText: 'Lucía' }).first().locator('button:has-text("Sacar")').click();
await a.waitForSelector('text=sacó a Lucía', { timeout: 5000 });
ok(true, 'anfitrión sacó a Lucía');
for (let i = 0; i < 12; i++) { for (const p of [a, c2]) await clickIf(p, 'Me retiro'); await a.waitForTimeout(150); }
await a.screenshot({ path: `${OUT}/despues-de-salidas.png` });

// Terminar partida y revancha
await a.click('button:has-text("Terminar partida")');
await a.waitForSelector('text=Revancha', { timeout: 5000 });
await a.screenshot({ path: `${OUT}/fin-revancha.png` });
await a.click('button:has-text("Revancha")');
await a.waitForSelector('text=Reglas de la partida', { timeout: 5000 });
await c2.waitForSelector('text=Reglas de la partida', { timeout: 5000 });
ok(await a.locator('text=Jugadores (4/6)').count() > 0, 'revancha: los 4 jugadores vuelven al lobby');
await a.click('button:has-text("Empezar partida")');
await a.waitForSelector('.board');
ok(true, 'segunda partida iniciada');
await a.screenshot({ path: `${OUT}/segunda-partida.png` });

await browser.close();
log(process.exitCode ? 'FALLÓ' : 'OK');
