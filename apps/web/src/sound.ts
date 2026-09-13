// Sonidos sintetizados con WebAudio (sin archivos). Se activan tras la primera interacción del usuario.

let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('nandepoly:muted') === '1'; } catch { return false; } })();

export function isMuted() { return muted; }
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem('nandepoly:muted', v ? '1' : '0'); } catch { /* ignore */ }
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Desbloquear el audio en la primera interacción (política de autoplay de los navegadores)
if (typeof window !== 'undefined') {
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + (opts.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.15, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.12, at = 0) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1200;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  dice() { for (let i = 0; i < 5; i++) noise(0.05, 0.1, i * 0.07); tone(220, 0.08, { type: 'square', gain: 0.05, at: 0.36 }); },
  hop() { tone(600, 0.05, { type: 'triangle', gain: 0.05 }); },
  buy() { tone(660, 0.12, { type: 'triangle' }); tone(880, 0.18, { type: 'triangle', at: 0.1 }); },
  coin() { tone(1046, 0.08, { type: 'square', gain: 0.06 }); tone(1568, 0.16, { type: 'square', gain: 0.06, at: 0.07 }); },
  pay() { tone(300, 0.18, { type: 'sawtooth', gain: 0.07, slideTo: 150 }); },
  card() { noise(0.08, 0.08); tone(900, 0.06, { type: 'triangle', gain: 0.05, at: 0.05 }); },
  jail() { tone(440, 0.25, { type: 'square', gain: 0.08 }); tone(330, 0.3, { type: 'square', gain: 0.08, at: 0.25 }); },
  turn() { tone(784, 0.12, { type: 'sine' }); tone(1175, 0.25, { type: 'sine', at: 0.12 }); },
  build() { tone(400, 0.06, { type: 'square', gain: 0.06 }); tone(500, 0.06, { type: 'square', gain: 0.06, at: 0.08 }); tone(650, 0.1, { type: 'square', gain: 0.06, at: 0.16 }); },
  auction() { tone(523, 0.1, { type: 'triangle' }); tone(523, 0.1, { type: 'triangle', at: 0.15 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.12, at: i * 0.15 })); tone(1318, 0.6, { type: 'triangle', gain: 0.12, at: 0.6 }); },
  lose() { tone(392, 0.3, { type: 'sawtooth', gain: 0.06 }); tone(330, 0.3, { type: 'sawtooth', gain: 0.06, at: 0.3 }); tone(262, 0.6, { type: 'sawtooth', gain: 0.06, at: 0.6 }); },
  notify() { tone(1000, 0.08, { type: 'sine', gain: 0.08 }); },
  tick() { tone(1800, 0.03, { type: 'square', gain: 0.04 }); },
  bigWin() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.07, at: i * 0.08 })); tone(2093, 0.7, { type: 'triangle', gain: 0.1, at: 0.5 }); },
  whoosh() { noise(0.25, 0.08); },
  gallop() { for (let i = 0; i < 3; i++) tone(120 + i * 10, 0.05, { type: 'triangle', gain: 0.08, at: i * 0.09 }); },
  go() { tone(880, 0.12, { type: 'square', gain: 0.12 }); tone(1320, 0.3, { type: 'square', gain: 0.12, at: 0.1 }); },
  countdown() { tone(660, 0.08, { type: 'sine', gain: 0.06 }); },
  cash(n = 6) { for (let i = 0; i < n; i++) tone(1200 + (i % 3) * 200, 0.05, { type: 'square', gain: 0.04, at: i * 0.06 }); },
  drum() { tone(90, 0.25, { type: 'sine', gain: 0.2, slideTo: 40 }); noise(0.08, 0.1); },
  bars() { noise(0.1, 0.15); tone(200, 0.3, { type: 'sawtooth', gain: 0.1, slideTo: 80, at: 0.05 }); },
  fire() { noise(0.4, 0.06); },
};

// ---------------------------------------------------------------------------------------
// Música de fondo: jazz relajado de bar, generado en vivo (piano eléctrico con acordes de séptima
// sostenidos, contrabajo suave "a dos", escobillas apenas y una melodía que entra de a ratos), con
// reverberación. Muy bajito. Si en apps/web/public existe un archivo musica.mp3, se usa ese en su lugar.
// ---------------------------------------------------------------------------------------
let musicOn = (() => { try { return localStorage.getItem('nandepoly:music') !== '0'; } catch { return true; } })();
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicGain: GainNode | null = null;
let musicBus: GainNode | null = null;
let nextBeat = 0;      // tiempo (en el reloj del audio) del próximo pulso a programar
let beatIndex = 0;     // pulso global (4 por compás)
let melodyRest = 0;    // pulsos que faltan para que la melodía vuelva a entrar
let melodyLast = 12;   // última nota de la melodía (para que la frase se mueva de a poco)
let customTrack: HTMLAudioElement | null | undefined; // undefined = todavía no averiguamos si existe

const BPM = 72;
const BEAT = 60 / BPM;
const SWING = 0.64;    // la segunda corchea cae al 64 % del pulso (swing)

// Progresión de 8 compases en Do mayor, tranquila. Notas en semitonos desde Do central (C4 = 0).
type Chord = { root: number; tones: number[]; scale: number[] };
const maj7 = (r: number): Chord => ({ root: r, tones: [0, 4, 7, 11, 14].map(x => x + r), scale: [0, 2, 4, 7, 9].map(x => x + r) });
const min7 = (r: number): Chord => ({ root: r, tones: [0, 3, 7, 10, 14].map(x => x + r), scale: [0, 3, 5, 7, 10].map(x => x + r) });
const dom7 = (r: number): Chord => ({ root: r, tones: [0, 4, 7, 10, 14].map(x => x + r), scale: [0, 2, 4, 7, 9].map(x => x + r) });
const PROGRESSION: Chord[] = [maj7(0), min7(4), maj7(5), dom7(7), min7(9), min7(2), maj7(5), dom7(7)];
const hz = (semi: number) => 261.63 * Math.pow(2, semi / 12);

function musicBusNode(a: AudioContext) {
  if (!musicGain) {
    musicGain = a.createGain(); musicGain.gain.value = 0.07;
    musicGain.connect(a.destination);
    musicBus = a.createGain(); musicBus.gain.value = 1;
    // Directo + reverberación (respuesta al impulso generada: cola de 2,4 s)
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    musicBus.connect(lp).connect(musicGain);
    const conv = a.createConvolver();
    const len = Math.floor(a.sampleRate * 2.4);
    const ir = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    conv.buffer = ir;
    const wet = a.createGain(); wet.gain.value = 0.42;
    const wlp = a.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 3200;
    musicBus.connect(conv).connect(wlp).connect(wet).connect(musicGain);
  }
  return musicBus!;
}

/** Nota con envolvente de instrumento: ataque suave, sostén y cola larga; parciales para el timbre. */
function inst(a: AudioContext, out: AudioNode, freq: number, t: number, dur: number, gain: number, partials: [number, number][], attack = 0.02, release = 0.8) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(gain * 0.55, t + attack, dur * 0.5);
  g.gain.setTargetAtTime(0.0001, t + dur, release / 4);
  g.connect(out);
  for (const [mult, lvl] of partials) {
    const o = a.createOscillator(); const og = a.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult; og.gain.value = lvl;
    o.connect(og).connect(g); o.start(t); o.stop(t + dur + release + 0.1);
  }
}
const RHODES: [number, number][] = [[1, 1], [2, 0.35], [3, 0.08], [4, 0.05]];
const BASS: [number, number][] = [[1, 1], [2, 0.22], [3, 0.05]];
const FLUTE: [number, number][] = [[1, 1], [2, 0.18], [3, 0.04]];

/** Escobillas: soplido de ruido filtrado muy suave. */
function brush(a: AudioContext, out: AudioNode, t: number, dur: number, gain: number, freq: number, q = 1) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const x = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * Math.min(1, x * 6)) * Math.pow(1 - x, 1.4); }
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(xs: T[]) => xs[rnd(xs.length)];

/** Programa un pulso (negra) completo: bajo, escobillas, piano y melodía. */
function scheduleBeat(a: AudioContext, out: AudioNode, t: number, beat: number) {
  const bar = Math.floor(beat / 4), pos = beat % 4;
  const chord = PROGRESSION[bar % PROGRESSION.length];
  const next = PROGRESSION[(bar + 1) % PROGRESSION.length];
  const swing = t + BEAT * SWING;

  // Contrabajo "a dos": fundamental en el 1 y quinta (o tercera) en el 3; en el 4, a veces, una nota
  // de paso hacia el acorde que viene. Registro grave, ataque redondo.
  const low = (semi: number) => { while (semi > -12) semi -= 12; while (semi < -26) semi += 12; return semi; };
  if (pos === 0) inst(a, out, hz(low(chord.root)), t, BEAT * 1.9, 0.6, BASS, 0.015, 0.5);
  if (pos === 2) inst(a, out, hz(low(pick([chord.tones[2], chord.tones[1]]))), t, BEAT * 1.4, 0.5, BASS, 0.015, 0.5);
  if (pos === 3 && Math.random() < 0.45) inst(a, out, hz(low(next.root + pick([-1, 1, 2]))), swing, BEAT * 0.5, 0.35, BASS, 0.015, 0.4);

  // Escobillas: un roce largo en el 2 y el 4, y un "ts" mínimo en cada corchea de swing
  if (pos % 2 === 1) brush(a, out, t, 0.55, 0.07, 5200, 0.8);
  brush(a, out, swing, 0.12, 0.035, 8000, 1.5);

  // Piano eléctrico: el acorde completo (3ª 5ª 7ª 9ª, registro medio) en el 1, sostenido casi todo el compás;
  // a veces una segunda pulsación más suave en la corchea de swing del 2 o en el 3.
  const voicing = chord.tones.slice(1).map(x => (x > 9 ? x - 12 : x)); // entre A3 y A4, cerrado
  if (pos === 0) voicing.forEach((semi, i) => inst(a, out, hz(semi), t + i * 0.018, BEAT * 3.2, 0.2, RHODES, 0.03, 1.4));
  if ((pos === 1 && Math.random() < 0.5) || (pos === 2 && Math.random() < 0.3)) {
    const at = pos === 1 ? swing : t;
    voicing.slice(0, 3).forEach((semi, i) => inst(a, out, hz(semi + 12), at + i * 0.015, BEAT * 1.2, 0.1, RHODES, 0.03, 1.0));
  }

  // Melodía: frases cortas de notas largas, que se mueven de a poco por la escala del acorde;
  // entre frase y frase, silencio de uno o dos compases.
  if (melodyRest > 0) { melodyRest--; return; }
  if (pos === 0 || pos === 2) {
    const options = chord.scale.map(x => x + 12).filter(x => Math.abs(x - melodyLast) <= 5 && x !== melodyLast);
    const semi = options.length ? pick(options) : chord.scale[0] + 12;
    melodyLast = semi;
    inst(a, out, hz(semi), t + 0.02, BEAT * pick([1.6, 2.4, 3.2]), 0.13, FLUTE, 0.06, 1.2);
    if (Math.random() < 0.4) {
      const s2 = pick(chord.scale.map(x => x + 12).filter(x => Math.abs(x - semi) <= 4 && x !== semi)) ?? semi;
      inst(a, out, hz(s2), swing + BEAT, BEAT * 1.4, 0.1, FLUTE, 0.06, 1.2);
      melodyLast = s2;
    }
    melodyRest = pick([3, 5, 6, 8, 10]);
  }
}

function musicTick() {
  const a = ac();
  if (!a || muted || !musicOn) return;
  const out = musicBusNode(a);
  if (nextBeat < a.currentTime) { nextBeat = a.currentTime + 0.05; }
  // Programamos con 0,4 s de anticipación para que el ritmo no dependa del timer de la pestaña
  while (nextBeat < a.currentTime + 0.4) {
    scheduleBeat(a, out, nextBeat, beatIndex);
    nextBeat += BEAT;
    beatIndex++;
  }
}

/** Si el sitio trae un archivo /musica.mp3, lo usamos como música de fondo (en loop) en vez del jazz generado. */
async function findCustomTrack(): Promise<HTMLAudioElement | null> {
  if (customTrack !== undefined) return customTrack;
  customTrack = null;
  try {
    const r = await fetch('/musica.mp3', { method: 'HEAD' });
    if (r.ok && /audio/i.test(r.headers.get('content-type') ?? '')) {
      const el = new Audio('/musica.mp3'); el.loop = true; el.volume = 0.22; el.preload = 'auto';
      customTrack = el;
    }
  } catch { /* sin archivo */ }
  return customTrack;
}

export function isMusicOn() { return musicOn; }
export function setMusicOn(v: boolean) {
  musicOn = v;
  try { localStorage.setItem('nandepoly:music', v ? '1' : '0'); } catch { /* ignore */ }
  if (v) startMusic(); else stopMusic();
}
export function startMusic() {
  if (musicTimer || !musicOn) return;
  nextBeat = 0;
  musicTimer = setInterval(musicTick, 100);
  findCustomTrack().then(el => { if (el && musicTimer && !muted) { clearInterval(musicTimer); musicTimer = setInterval(() => { if (el.paused && !muted && musicOn) el.play().catch(() => {}); }, 1000); el.play().catch(() => {}); } });
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (customTrack) customTrack.pause();
}

/** Fanfarria épica de ~3,5 s para la caja sorpresa: redoble + subida + acorde final. */
export function epic() {
  const a = ac();
  if (!a || muted) return;
  // redoble de tambor que se acelera
  let t = 0;
  for (let i = 0; i < 26; i++) { tone(90, 0.12, { type: 'sine', gain: 0.18, slideTo: 45, at: t }); noise(0.04, 0.06, t); t += 0.16 - i * 0.004; }
  // subida (riser)
  tone(110, 3.0, { type: 'sawtooth', gain: 0.05, slideTo: 880 });
  tone(165, 3.0, { type: 'sawtooth', gain: 0.04, slideTo: 1320, at: 0.1 });
  // acorde final brillante
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 0.9, { type: 'triangle', gain: 0.12, at: 3.3 + i * 0.03 }));
  tone(261.6, 1.2, { type: 'sine', gain: 0.15, at: 3.3 });
  noise(0.3, 0.1, 3.3);
}

/** Sólo para pruebas: permite renderizar la música con un OfflineAudioContext. */
export const __music = { scheduleBeat, BEAT, bus: musicBusNode };
