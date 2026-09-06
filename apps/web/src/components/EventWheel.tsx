import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EVENTS } from '@nandepoly/engine';
import { useStore } from '../store';
import { sfx } from '../sound';

const COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#ec4899', '#eab308'];
// Sectores de la ruleta: los 19 eventos con un sector de Tranquilidad cada 5 (la calma sale 2 de cada 3 veces y así no "cae siempre en el mismo lugar")
const CALM = EVENTS[0];
const SLICES = (() => {
  const out: typeof EVENTS = [];
  EVENTS.filter(e => e.id !== 'tranquilidad').forEach((e, i) => { if (i % 5 === 0) out.push(CALM); out.push(e); });
  return out;
})();
const N = SLICES.length;

/** Ruleta de eventos globales: gira cada vuelta completa de la mesa y frena en el evento que salió. */
export default function EventWheel() {
  const spin = useStore(s => s.eventSpin);
  const setEventSpin = useStore(s => s.setEventSpin);
  const [angle, setAngle] = useState(0);
  const [done, setDone] = useState(false);
  const ev = spin ? EVENTS.find(e => e.id === spin.eventId) ?? EVENTS[0] : null;

  useEffect(() => {
    if (!spin) return;
    setDone(false);
    const seg = 360 / N;
    // El puntero está arriba (0°). El sector i ocupa [i*seg, (i+1)*seg) en sentido horario; hay que llevar su centro arriba.
    const candidates = SLICES.map((e, i) => (e.id === spin.eventId ? i : -1)).filter(i => i >= 0);
    const idx = candidates.length ? candidates[spin.id % candidates.length] : 0;
    const target = 360 * 5 + (360 - (idx * seg + seg / 2));
    setAngle(0);
    const t0 = setTimeout(() => setAngle(target), 60);
    let n = 0; const ticks: ReturnType<typeof setTimeout>[] = [];
    const schedule = (d: number) => { if (d > 3600) return; ticks.push(setTimeout(() => { sfx.tick(); n++; schedule(d + 50 + n * n * 2.2); }, d)); };
    schedule(100);
    const d = setTimeout(() => { setDone(true); if (spin.eventId === 'tranquilidad') sfx.notify(); else sfx.drum(); }, 3900);
    const close = setTimeout(() => setEventSpin(null), spin.eventId === 'tranquilidad' ? 5600 : 8200);
    return () => { clearTimeout(t0); ticks.forEach(clearTimeout); clearTimeout(d); clearTimeout(close); };
  }, [spin, setEventSpin]);

  const seg = 360 / N;
  const gradient = `conic-gradient(${SLICES.map((e, i) => `${e.id === 'tranquilidad' ? '#94a3b8' : COLORS[i % COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`;

  return (
    <AnimatePresence>
      {spin && ev && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => done && setEventSpin(null)}>
          <motion.div className="flex w-full max-w-md flex-col items-center" initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} onClick={e => e.stopPropagation()}>
            <div className="mb-3 text-center text-lg font-black text-white drop-shadow">🌪️ Vuelta completa: ¡gira la ruleta de eventos!</div>
            <div className="wheel-wrap">
              <div className="wheel-pointer">▼</div>
              <div className="wheel" style={{ background: gradient, transform: `rotate(${angle}deg)` }}>
                {SLICES.map((e, i) => (
                  <div key={`${e.id}-${i}`} className="wheel-label" style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}>
                    <span style={{ transform: 'translateY(8px)' }}>{e.icon}</span>
                  </div>
                ))}
              </div>
              <div className="wheel-hub">🌪️</div>
            </div>
            <div className="mt-4 min-h-[84px] text-center">
              {done ? (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className={`rounded-2xl px-5 py-3 text-white shadow-xl ${ev.id === 'tranquilidad' ? 'bg-slate-600' : 'bg-gradient-to-r from-teal-600 to-sky-600'}`}>
                  <div className="text-2xl font-black">{ev.icon} {ev.name}</div>
                  <div className="mt-1 text-sm font-semibold opacity-90">{ev.desc}</div>
                </motion.div>
              ) : <div className="text-sm font-semibold text-white/70">Girando…</div>}
            </div>
            <div className="mt-1 text-center text-[11px] text-white/50">2 de cada 3 giros: Tranquilidad · toca para cerrar</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
