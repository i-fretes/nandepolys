// Captura los efectos visuales (billetes, flotantes, rejas, jackpot) forzándolos desde la consola.
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const a = await ctx.newPage(); a.on('pageerror', e => console.error('PAGE ERROR', e.message));
await a.goto(BASE);
await a.fill('input[placeholder="Ej: Ivan"]', 'Ivan');
await a.click('button:has-text("Crear sala")');
await a.waitForURL(/\/sala\//);
await a.click('button:has-text("Agregar bot")'); await a.click('button:has-text("Agregar bot")');
await a.waitForSelector('text=Jugadores (3/6)');
await a.click('button:has-text("Empezar partida")');
await a.waitForSelector('.board');
await a.waitForTimeout(800);
const ids = await a.evaluate(() => window.__nandepoly.store.getState().state.players.map(p => p.id));
await a.evaluate(([from, to]) => {
  const st = window.__nandepoly.store.getState();
  st.pushFx({ kind: 'money', from, to, amount: 400 });
  st.pushFx({ kind: 'float', playerId: from, text: '−₲ 400.000', tone: 'bad' });
  st.pushFx({ kind: 'float', playerId: to, text: '+₲ 400.000', tone: 'good' });
  st.pushFx({ kind: 'shake', strength: 0.5 });
  st.pushFx({ kind: 'bars', playerId: ids2[2] });
}, [ids[1], ids[0]]).catch(() => {});
await a.evaluate(([from, to, third]) => {
  const st = window.__nandepoly.store.getState();
  st.pushFx({ kind: 'money', from, to, amount: 400 });
  st.pushFx({ kind: 'float', playerId: from, text: '−₲ 400.000', tone: 'bad' });
  st.pushFx({ kind: 'float', playerId: to, text: '+₲ 400.000', tone: 'good' });
  st.pushFx({ kind: 'bars', playerId: third });
}, [ids[1], ids[0], ids[2]]);
await a.waitForTimeout(450);
await a.screenshot({ path: 'e2e/casino/fx-billetes.png' });
await a.evaluate(([to]) => { const st = window.__nandepoly.store.getState(); st.pushFx({ kind: 'jackpot', playerId: to, amount: 850 }); st.pushFx({ kind: 'confetti', playerId: to, big: true }); }, [ids[0]]);
await a.waitForTimeout(900);
await a.screenshot({ path: 'e2e/casino/fx-jackpot.png' });
await browser.close();
console.log('OK');
