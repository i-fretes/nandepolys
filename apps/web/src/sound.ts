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
// Música de fondo (chiptune suave, muy bajita) y fanfarria "épica" para la caja sorpresa
// ---------------------------------------------------------------------------------------
let musicOn = (() => { try { return localStorage.getItem('nandepoly:music') !== '0'; } catch { return true; } })();
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicGain: GainNode | null = null;
let step = 0;
// Progresión relajada en La menor: Am – F – C – G (arpegios), bajo y un "hi-hat" de ruido
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];

function musicTick() {
  const a = ac();
  if (!a || muted || !musicOn) return;
  if (!musicGain) { musicGain = a.createGain(); musicGain.gain.value = 0.035; musicGain.connect(a.destination); }
  const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
  const t0 = a.currentTime;
  const note = (freq: number, dur: number, type: OscillatorType, gain: number, at = 0) => {
    const osc = a.createOscillator(); const g = a.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(g).connect(musicGain!);
    osc.start(t0 + at); osc.stop(t0 + at + dur + 0.05);
  };
  // arpegio
  const n = chord[step % 3] * (step % 8 >= 4 ? 2 : 1);
  note(n, 0.22, 'triangle', 0.5);
  // bajo cada 4 pasos
  if (step % 4 === 0) note(chord[0] / 2, 0.5, 'sine', 0.7);
  // melodía ocasional
  if (step % 8 === 6) note(chord[2] * 2, 0.3, 'square', 0.12);
  step++;
}

export function isMusicOn() { return musicOn; }
export function setMusicOn(v: boolean) {
  musicOn = v;
  try { localStorage.setItem('nandepoly:music', v ? '1' : '0'); } catch { /* ignore */ }
  if (v) startMusic(); else stopMusic();
}
export function startMusic() {
  if (musicTimer || !musicOn) return;
  musicTimer = setInterval(musicTick, 250); // 240 bpm de corcheas → tranquilo
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
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
