// Prueba end-to-end: 6 navegadores crean/entran a una sala, juegan turnos y uno se reconecta.
// Uso: node e2e/six-players.mjs [baseUrl] [screenshotsDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const SHOTS = process.argv[3] ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const NAMES = ['Ivan', 'Lucía', 'Mateo', 'Sofía', 'Diego', 'Camila'];
const TOKENS = ['mate', 'chipa', 'nanduti', 'carreta', 'jaguarete', 'arpa'];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const pages = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function newPage(mobile = false) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  return page;
}

// 1. El anfitrión crea la sala
const host = await newPage();
pages.push(host);
await host.goto(BASE);
await host.fill('input[placeholder="Ej: Ivan"]', NAMES[0]);
await host.click(`button[title="Mate y bombilla"]`);
await host.click('button:has-text("Crear sala")');
await host.waitForURL(/\/sala\//);
const code = host.url().split('/sala/')[1];
log('Sala creada:', code);
await host.screenshot({ path: `${SHOTS}/01-lobby-host.png` });

// 2. Cinco amigos entran (uno desde "celular")
for (let i = 1; i < 6; i++) {
  const p = await newPage(i === 5);
  pages.push(p);
  await p.goto(`${BASE}/sala/${code}`);
  await p.waitForSelector('text=Entrar a la sala');
  await p.fill('input[maxlength="20"]', NAMES[i]);
  await p.click(`button[title="${['Mate y bombilla', 'Chipa', 'Ñandutí', 'Carreta', 'Jaguareté', 'Arpa paraguaya'][i]}"]`);
  await p.click('button:has-text("Entrar a la sala")');
  await p.waitForSelector(`text=${NAMES[i]}`);
  log('Entró', NAMES[i]);
}
await host.waitForSelector('text=Jugadores (6/6)');
await host.screenshot({ path: `${SHOTS}/02-lobby-full.png` });

// 3. Empezar
await host.click('button:has-text("Empezar partida")');
await host.waitForSelector('.board');
await Promise.all(pages.map(p => p.waitForSelector('.board')));
log('Partida iniciada');
await host.screenshot({ path: `${SHOTS}/03-game-start.png` });
await pages[5].screenshot({ path: `${SHOTS}/04-mobile.png`, fullPage: true });

// 4. Jugar turnos: cada página actúa si tiene botones habilitados
async function step(page) {
  const clickIf = async (text) => {
    const btn = page.locator(`button:has-text("${text}"):not([disabled])`).first();
    try {
      if (await btn.count() && await btn.isVisible()) { await btn.click({ timeout: 1500, force: true }); return true; }
    } catch { /* el botón desapareció (ej. modal que se cerró solo) */ }
    return false;
  };
  if (await clickIf('Tirar dados')) return 'roll';
  if (await clickIf('Intentar dobles')) return 'jailroll';
  if (await clickIf('Comprar por')) return 'buy';
  if (await clickIf('Pagar 200 mil')) return 'tax'; // por si acaso
  if (await clickIf('Pagar ₲ 200.000')) return 'tax';
  if (await clickIf('Me retiro')) return 'pass';
  if (await clickIf('Aceptar')) return 'accept';
  if (await clickIf('Entendido')) return 'card';
  if (await clickIf('Pagar') ) return 'paydebt';
  if (await clickIf('Terminar turno')) return 'end';
  return null;
}

let actions = 0;
const deadline = Date.now() + 90_000;
let shot = false;
while (Date.now() < deadline && actions < 120) {
  let did = false;
  for (const p of pages) {
    const r = await step(p);
    if (r) { did = true; actions++; log('acción', r); }
  }
  if (!did) await host.waitForTimeout(300);
  if (actions > 25 && !shot) {
    shot = true;
    await host.screenshot({ path: `${SHOTS}/05-midgame.png` });
    // abrir propiedades y ficha de una casilla
    await host.click('.tile[title="Palacio de López"]');
    await host.waitForTimeout(400);
    await host.screenshot({ path: `${SHOTS}/06-property-card.png` });
    await host.click('button:has-text("Cerrar")');
  }
}
log('Acciones ejecutadas:', actions);

// 5. Reconexión: un jugador cierra la pestaña y vuelve
const victim = pages[2];
const ctx = victim.context();
await victim.close();
await host.waitForSelector(`text=${NAMES[2]} se desconectó`, { timeout: 15000 }).catch(() => log('(sin evento de desconexión visible)'));
const back = await ctx.newPage();
await back.goto(`${BASE}/sala/${code}`);
await back.waitForSelector('.board', { timeout: 15000 });
const meChip = await back.locator('text=Vos').count();
log('Reconectado', NAMES[2], meChip ? 'como el mismo jugador ✔' : '✘ (no se reconoció la sesión)');
await back.screenshot({ path: `${SHOTS}/07-reconnected.png` });

// 6. Estado consistente entre clientes
const texts = await Promise.all([host, pages[1], back].map(p => p.locator('.center b').first().innerText()));
log('Centro del tablero coincide en todos:', texts.every(t => t === texts[0]) ? '✔' : '✘');

await host.screenshot({ path: `${SHOTS}/08-final.png` });
await browser.close();
log('OK');
