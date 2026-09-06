import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LOOTBOX } from '@nandepoly/engine';
import { useStore } from '../store';
import { sfx } from '../sound';
import { tokenEmoji } from '../format';

const CELL = 96;      // ancho de cada premio en el carrete (px incl. gap)
const CELLS = 40;     // celdas totales del carrete

const ICON: Record<string, string> = {
  g100: '💵', g150: '💵', g200: '💰', g250: '💰', g300: '💎', g500: '👑', casa: '🏠', carcel: '🎟️', tirada: '🎲', multa: '🚔',
};
const TONE: Record<string, string> = {
  g100: 'lb-gray', g150: 'lb-gray', g200: 'lb-blue', g250: 'lb-blue', g300: 'lb-purple', g500: 'lb-gold', casa: 'lb-purple', carcel: 'lb-blue', tirada: 'lb-purple', multa: 'lb-red',
};

/** Caja sorpresa al pasar por Salida: carrete estilo "skin club" que frena en el premio. */
export default function LootboxOverlay() {
  const box = useStore(s => s.lootbox);
  const setLootbox = useStore(s => s.setLootbox);
  const state = useStore(s => s.state);
  const [phase, setPhase] = useState<'spin' | 'done'>('spin');
  const stripRef = useRef<HTMLDivElement>(null);
  const player = state?.players.find(p => p.id === box?.playerId);

  // Carrete: premios al azar ponderados; el ganador va en la celda 33
  const cells = useMemo(() => {
    if (!box) return [];
    const weights = LOOTBOX.map(l => l.weight);
    const total = weights.reduce((a, b) => a + b, 0);
    let seed = box.id * 9301 + 49297;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const out: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      let r = rnd() * total, idx = 0;
      for (let k = 0; k < weights.length; k++) { r -= weights[k]; if (r < 0) { idx = k; break; } }
      out.push(idx);
    }
    out[33] = box.index;
    return out;
  }, [box]);

  useEffect(() => {
    if (!box) return;
    setPhase('spin');
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0px)';
    const jitter = (Math.random() - 0.5) * (CELL * 0.6);
    const target = -(33 * CELL - (strip.parentElement!.clientWidth / 2 - CELL / 2)) + jitter;
    const t0 = requestAnimationFrame(() => {
      strip.style.transition = 'transform 4.2s cubic-bezier(.08,.82,.17,1)';
      strip.style.transform = `translateX(${target}px)`;
    });
    // tics que se van espaciando
    let n = 0; const ticks: ReturnType<typeof setTimeout>[] = [];
    const schedule = (d: number) => { if (d > 4100) return; ticks.push(setTimeout(() => { sfx.tick(); n++; schedule(d + 40 + n * n * 1.6); }, Math.max(0, d - (ticks.length ? 0 : 0)))); };
    schedule(60);
    const done = setTimeout(() => {
      setPhase('done');
      if (box.prize === 'g500' || box.prize === 'casa') sfx.bigWin(); else if (box.amount < 0) sfx.lose(); else sfx.coin();
    }, 4300);
    const close = setTimeout(() => setLootbox(null), 8200);
    return () => { cancelAnimationFrame(t0); ticks.forEach(clearTimeout); clearTimeout(done); clearTimeout(close); };
  }, [box, setLootbox]);

  return (
    <AnimatePresence>
      {box && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => phase === 'done' && setLootbox(null)}>
          <motion.div className="lootbox w-full max-w-xl" initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-center gap-2 text-white">
              {player && <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg" style={{ boxShadow: `0 0 0 3px ${player.color}` }}>{tokenEmoji(player.token)}</span>}
              <div className="text-lg font-black tracking-tight">🎁 {player?.name ?? ''} pasó por Salida: ¡Caja sorpresa!</div>
            </div>
            <div className="lb-window">
              <div className="lb-marker" />
              <div ref={stripRef} className="lb-strip">
                {cells.map((idx, i) => {
                  const l = LOOTBOX[idx];
                  return (
                    <div key={i} className={`lb-cell ${TONE[l.id]} ${phase === 'done' && i === 33 ? 'lb-win' : ''}`}>
                      <div className="lb-ico">{ICON[l.id]}</div>
                      <div className="lb-lbl">{l.label.replace('¡', '').replace('!', '').replace('Carta: ', '').replace('Multa de tránsito: ', 'Multa ')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 min-h-[44px] text-center">
              {phase === 'done' ? (
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }} className={`inline-block rounded-2xl px-5 py-2 text-xl font-black text-white ${box.amount < 0 ? 'bg-red-600' : box.prize === 'g500' ? 'bg-yellow-500 text-black' : 'bg-emerald-600'}`}>
                  {ICON[box.prize]} {box.label}
                </motion.div>
              ) : <div className="text-sm font-semibold text-white/70">Girando…</div>}
            </div>
            <div className="mt-1 text-center text-[11px] text-white/50">Promedio ≈ ₲ 200.000 · toca para cerrar</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
