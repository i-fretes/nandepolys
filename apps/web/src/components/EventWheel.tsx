import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EVENTS } from '@nandepoly/engine';
import { useStore } from '../store';
import { sfx } from '../sound';

const CELL = 112;     // ancho de cada evento en el carrete (px incl. gap)
const CELLS = 46;
const WIN = 8;        // celda donde frena (el carrete avanza de izquierda a derecha)
const SPIN_MS = 6000;
const COLORS = ['lb-blue', 'lb-purple', 'lb-gold', 'lb-red', 'lb-blue', 'lb-purple'];

/**
 * Ruleta de eventos globales: cada vuelta completa de la mesa. Carrete horizontal que avanza
 * de izquierda a derecha durante 6 segundos y frena en el evento que salió.
 */
export default function EventWheel() {
  const spin = useStore(s => s.eventSpin);
  const setEventSpin = useStore(s => s.setEventSpin);
  const [done, setDone] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const ev = spin ? EVENTS.find(e => e.id === spin.eventId) ?? EVENTS[0] : null;

  // Celdas: 2 de cada 3 Tranquilidad, el resto eventos al azar; el ganador en WIN
  const cells = useMemo(() => {
    if (!spin) return [];
    let seed = spin.id * 7919 + 13;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const others = EVENTS.filter(e => e.id !== 'tranquilidad');
    const out: number[] = [];
    for (let i = 0; i < CELLS; i++) out.push(rnd() < 0.66 ? 0 : 1 + Math.floor(rnd() * others.length));
    out[WIN] = EVENTS.findIndex(e => e.id === spin.eventId);
    return out;
  }, [spin]);

  useEffect(() => {
    if (!spin) return;
    setDone(false);
    const strip = stripRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (strip) {
      const width = strip.parentElement!.clientWidth;
      // termina con la celda WIN en el centro; arranca mucho más a la izquierda (avanza hacia la derecha)
      const end = width / 2 - CELL / 2 - WIN * CELL + (Math.random() - 0.5) * CELL * 0.5;
      const start = end - (CELLS - WIN - 3) * CELL;
      strip.style.transition = 'none';
      strip.style.transform = `translateX(${start}px)`;
      requestAnimationFrame(() => {
        strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.1,.8,.15,1)`;
        strip.style.transform = `translateX(${end}px)`;
      });
    }
    let n = 0;
    const schedule = (d: number) => { if (d > SPIN_MS - 200) return; timers.push(setTimeout(() => { sfx.tick(); n++; schedule(d + 45 + n * n * 1.1); }, d)); };
    schedule(80);
    timers.push(setTimeout(() => { setDone(true); if (spin.eventId === 'tranquilidad') sfx.notify(); else sfx.drum(); }, SPIN_MS + 150));
    timers.push(setTimeout(() => setEventSpin(null), SPIN_MS + (spin.eventId === 'tranquilidad' ? 2800 : 6500)));
    return () => timers.forEach(clearTimeout);
  }, [spin, setEventSpin]);

  return (
    <AnimatePresence>
      {spin && ev && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => done && setEventSpin(null)}>
          <motion.div className="lootbox w-full max-w-2xl" initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} onClick={e => e.stopPropagation()}>
            <div className="mb-2 text-center text-lg font-black text-white">🌪️ Vuelta completa de la mesa: ¡gira la ruleta de eventos!</div>
            <div className="lb-window" style={{ height: 130 }}>
              <div className="lb-marker" />
              <div ref={stripRef} className="lb-strip">
                {cells.map((idx, i) => {
                  const e = EVENTS[idx];
                  return (
                    <div key={i} className={`lb-cell ${e.id === 'tranquilidad' ? 'lb-gray' : COLORS[idx % COLORS.length]} ${done && i === WIN ? 'lb-win' : ''}`} style={{ flexBasis: CELL - 8, height: 110 }}>
                      <div className="lb-ico">{e.icon}</div>
                      <div className="lb-lbl">{e.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 min-h-[84px] text-center">
              {done ? (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className={`inline-block rounded-2xl px-5 py-3 text-white shadow-xl ${ev.id === 'tranquilidad' ? 'bg-slate-600' : 'bg-gradient-to-r from-teal-600 to-sky-600'}`}>
                  <div className="text-2xl font-black">{ev.icon} {ev.name}</div>
                  <div className="mt-1 text-sm font-semibold opacity-90">{ev.desc}</div>
                </motion.div>
              ) : <div className="text-sm font-semibold text-white/70">Girando…</div>}
            </div>
            <div className="mt-1 text-center text-[11px] text-white/50">2 de cada 3 giros: Tranquilidad{done ? ' · toca para cerrar' : ''}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
