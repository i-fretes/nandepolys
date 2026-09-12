// Verifica que dos cartas seguidas no se pisen: la segunda espera en la cola.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:8080');
await p.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await p.click('button:has-text("Crear sala")');
await p.waitForURL(/\/sala\//);
await p.click('button:has-text("Agregar bot")');
await p.waitForSelector('text=Jugadores (2/6)');
await p.click('button:has-text("Empezar partida")');
await p.waitForSelector('.board');
// Simulamos dos cartas seguidas de jugadores distintos
await p.evaluate(() => {
  const s = window.__nandepoly.store.getState();
  const ids = s.state.players.map(x => x.id);
  s.applyView({ state: s.state, chat: [], auctionDeadline: null, turnDeadline: null, phaseDeadline: null,
    serverTime: Date.now() }, []);
  window.__nandepoly.store.setState({ cardModal: { card: { id: 'S1', deck: 'chance', text: 'Primera carta: avanzá a Salida.' }, playerId: ids[0] }, cardQueue: [] });
  const st = window.__nandepoly.store.getState();
  // la segunda carta llega mientras la primera está en pantalla
  window.__nandepoly.store.setState({ cardQueue: [...st.cardQueue, { card: { id: 'C2', deck: 'community', text: 'Segunda carta: cobrá ₲ 50.000.' }, playerId: ids[1] }] });
});
await p.waitForTimeout(400);
const t1 = await p.locator('.flip').innerText();
const btn = await p.locator('button:has-text("Siguiente carta")').count();
console.log('primera:', t1.replace(/\n/g, ' | '));
console.log('boton de cola:', btn === 1 ? 'OK' : 'FALTA');
await p.screenshot({ path: 'e2e/casino/carta-1.png' });
await p.click('button:has-text("Siguiente carta")');
await p.waitForTimeout(400);
const t2 = await p.locator('.flip').innerText();
console.log('segunda:', t2.replace(/\n/g, ' | '));
await p.screenshot({ path: 'e2e/casino/carta-2.png' });
console.log(t1.includes('Primera') && t2.includes('Segunda') && btn === 1 ? 'OK' : 'FALLÓ');
await b.close();
