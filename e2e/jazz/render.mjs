// Renderiza 24 s del jazz de fondo con OfflineAudioContext (en Chromium) y analiza niveles: sin
// clipping, volumen parejo y actividad musical (que no haya silencios largos ni saturación).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const { build } = createRequire(new URL('../../node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/package.json', import.meta.url))('esbuild');
import { writeFileSync } from 'node:fs';
const out = await build({ entryPoints: ['apps/web/src/sound.ts'], bundle: true, write: false, format: 'iife', globalName: 'Sound', platform: 'browser' });
const js = out.outputFiles[0].text;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
const res = await page.evaluate(async () => {
  const SR = 44100, SECS = 24;
  const ctx = new OfflineAudioContext(1, SR * SECS, SR);
  const { scheduleBeat, BEAT, bus } = Sound.__music;
  const f = bus(ctx); // el mismo bus del juego (filtro + reverberación + volumen)
  let t = 0.1, beat = 0;
  while (t < SECS - 1) { scheduleBeat(ctx, f, t, beat); t += BEAT; beat++; }
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0; const win = SR / 2; const rms = [];
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; if ((i + 1) % win === 0) { rms.push(Math.sqrt(sum / win)); sum = 0; } }
  // WAV 16-bit para poder escucharlo
  const wav = new ArrayBuffer(44 + d.length * 2); const v = new DataView(wav);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  return { peak, rms: rms.map(x => +x.toFixed(4)), wav: Array.from(new Uint8Array(wav)) };
});
writeFileSync('e2e/jazz/jazz.wav', Buffer.from(res.wav));
console.log('pico', res.peak.toFixed(3), 'rms por medio segundo', res.rms.join(' '));
const quiet = res.rms.filter(x => x < 0.002).length;
console.log(quiet > 4 ? `FALLA: ${quiet} medios segundos casi en silencio` : 'OK actividad continua', res.peak > 0.95 ? 'FALLA: clipping' : 'OK sin clipping');
await browser.close();
