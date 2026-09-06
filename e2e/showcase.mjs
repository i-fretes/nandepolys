// Genera capturas de los diálogos principales: subasta, intercambio, propiedades, carta.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'e2e/showcase';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const log = (...a) => console.log(...a);

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return ctx.newPage();
}
const clickIf = async (p, text) => {
  const btn = p.locator(`button:has-text("${text}"):not([disabled])`).first();
  try { if (await btn.count() && await btn.isVisible()) { await btn.click({ timeout: 1500 }); return true; } } catch {}
  return false;
};

const a = await page(); const b = await page(); const c = await page();
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
const pages = [a, b, c];

let gotAuction = false, gotCard = false, gotTrade = false, gotManage = false, gotJail = false;
const deadline = Date.now() + 120_000;
let buys = 0;
while (Date.now() < deadline && !(gotAuction && gotCard && gotTrade && gotManage)) {
  for (const p of pages) {
    // Carta
    if (!gotCard && await p.locator('text=sacó una carta').count()) {
      await p.screenshot({ path: `${OUT}/carta.png` }); gotCard = true; log('carta ✔');
    }
    await clickIf(p, 'Entendido');
    // Cárcel
    if (!gotJail && await p.locator('text=Estás preso').count()) {
      await p.screenshot({ path: `${OUT}/carcel.png` }); gotJail = true; log('cárcel ✔');
    }
    await clickIf(p, 'Tirar dados') || await clickIf(p, 'Intentar dobles');
    // Compra: las primeras 4 compramos; después rechazamos una para ver la subasta
    if (await p.locator('button:has-text("Comprar por"):not([disabled])').count()) {
      if (buys < 4 || gotAuction) { await clickIf(p, 'Comprar por'); buys++; }
      else {
        await clickIf(p, 'No comprar');
        // otro jugador oferta
        const other = pages.find(x => x !== p);
        await other.waitForSelector('button:has-text("Ofertar")', { timeout: 5000 }).catch(() => {});
        await clickIf(other, '+50 mil');
        await clickIf(other, 'Ofertar');
        await other.waitForTimeout(400);
        await other.screenshot({ path: `${OUT}/subasta.png` }); gotAuction = true; log('subasta ✔');
        for (const x of pages) await clickIf(x, 'Me retiro');
        await p.waitForTimeout(500);
        for (const x of pages) await clickIf(x, 'Me retiro');
      }
    }
    await clickIf(p, 'Pagar ₲ 200.000');
    if (await clickIf(p, 'Pagar') ) {}
    // Intercambio: cuando alguien tenga propiedad, abrir el diálogo
    if (!gotTrade && buys >= 3 && await p.locator('button:has-text("Intercambiar"):not([disabled])').count()) {
      await p.click('button:has-text("Intercambiar")');
      await p.waitForSelector('text=Proponer intercambio');
      const mine = p.locator('.rounded-xl.bg-cream').nth(0).locator('button.flex.items-center.gap-1');
      const theirs = p.locator('.rounded-xl.bg-cream').nth(1).locator('button.flex.items-center.gap-1');
      if (await mine.count() && await theirs.count()) {
        await mine.first().click(); await theirs.first().click();
        await p.locator('.rounded-xl.bg-cream').nth(0).locator('input[type=number]').fill('50');
        await p.waitForTimeout(300);
        await p.screenshot({ path: `${OUT}/intercambio-proponer.png` });
        await p.click('button:has-text("Enviar propuesta")');
        // el receptor ve la propuesta
        const receiver = pages.find(x => x !== p && x.locator('text=te propone un intercambio'));
        for (const x of pages) {
          if (x !== p && await x.locator('text=te propone un intercambio').count()) {
            await x.waitForTimeout(300);
            await x.screenshot({ path: `${OUT}/intercambio-recibir.png` });
            await clickIf(x, 'Aceptar');
            gotTrade = true; log('intercambio ✔');
          }
        }
      } else {
        await clickIf(p, 'Cerrar');
      }
    }
    if (!gotManage && buys >= 3 && await p.locator('button:has-text("Propiedades"):not([disabled])').count()) {
      await p.click('button:has-text("Propiedades")');
      await p.waitForSelector('text=Mis propiedades');
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/propiedades.png` });
      await clickIf(p, 'Hipotecar');
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/propiedades-hipoteca.png` });
      await p.click('button:has-text("Cerrar")');
      gotManage = true; log('propiedades ✔');
    }
    await clickIf(p, 'Terminar turno');
  }
  await a.waitForTimeout(150);
}
// Lobby con reglas (nueva sala)
const d = await page();
await d.goto(BASE);
await d.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await d.click('button:has-text("Crear sala")');
await d.waitForSelector('text=Reglas de la partida');
await d.screenshot({ path: `${OUT}/lobby-reglas.png` });
await a.screenshot({ path: `${OUT}/tablero.png` });
log({ gotAuction, gotCard, gotTrade, gotManage, gotJail });
await browser.close();
