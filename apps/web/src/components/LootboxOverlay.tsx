import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LOOTBOX } from '@nandepoly/engine';
import { useStore } from '../store';
import { epic, sfx } from '../sound';
import { useReelSpin } from './reel';
import { tokenEmoji } from '../format';

const CELL = 96;      // ancho de cada premio en el carrete (px incl. gap)
const CELLS = 40;     // celdas totales del carrete
const WIN = 34;       // celda donde frena (las celdas pasan de derecha a izquierda)
const SPIN_MS = 3500; // duración del giro

const ICON: Record<string, string> = {
  g100: '💵', g150: '💵', g200: '💰', g250: '💰', g300: '💎', g500: '👑', casa: '🏠', carcel: '🎟️', tirada: '🎲', multa: '🚔',
};
const TONE: Record<string, string> = {
  g100: 'lb-gray', g150: 'lb-gray', g200: 'lb-blue', g250: 'lb-blue', g300: 'lb-purple', g500: 'lb-gold', casa: 'lb-purple', carcel: 'lb-blue', tirada: 'lb-purple', multa: 'lb-red',
};

/**
 * Caja sorpresa al pasar por Salida. El dueño toca "Abrir caja"; en ese momento, en todas las pantallas,
 * suena la fanfarria y el carrete gira 3,5 s hasta frenar en el premio (estilo "skin club").
 */
export default function LootboxOverlay() {
  const box = useStore(s => s.lootbox);
  const setLootbox = useStore(s => s.setLootbox);
  const openLootbox = useStore(s => s.openLootbox);
  const state = useStore(s => s.state);
  const meId = useStore(s => s.playerId);
  const [phase, setPhase] = useState<'closed' | 'spin' | 'done'>('closed');
  const stripRef = useRef<HTMLDivElement>(null);
  const player = state?.players.find(p => p.id === box?.playerId);
  const mine = box?.playerId === meId;

  // Carrete: premios al azar ponderados; el ganador va en la celda WIN
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
    out[WIN] = box.index;
    return out;
  }, [box]);

  // Caja cerrada: si el dueño no la abre en 12 s, se abre sola
  useEffect(() => {
    if (!box) return;
    setPhase('closed');
    if (box.openedAt) return;
    const t = setTimeout(() => useStore.setState(s => (s.lootbox && !s.lootbox.openedAt ? { lootbox: { ...s.lootbox, openedAt: Date.now() } } : {})), 12000);
    return () => clearTimeout(t);
  }, [box?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El giro en sí arranca cuando el carrete ya está en pantalla (fase 'spin')
  useReelSpin(stripRef, phase === 'spin', { cell: CELL, winCell: WIN, ms: SPIN_MS, direction: 'left', jitterKey: box?.id });

  // Apertura: fanfarria + giro
  useEffect(() => {
    if (!box?.openedAt) return;
    const delay = Math.max(0, box.openedAt - Date.now());
    let timers: ReturnType<typeof setTimeout>[] = [];
    const start = setTimeout(() => {
      setPhase('spin');
      epic();
      let n = 0;
      const schedule = (d: number) => { if (d > SPIN_MS - 100) return; timers.push(setTimeout(() => { sfx.tick(); n++; schedule(d + 40 + n * n * 1.9); }, d)); };
      schedule(60);
      timers.push(setTimeout(() => {
        setPhase('done');
        if (box.prize === 'g500' || box.prize === 'casa') sfx.bigWin(); else if (box.amount < 0) sfx.lose(); else sfx.coin();
      }, SPIN_MS + 100));
      timers.push(setTimeout(() => setLootbox(null), SPIN_MS + 4500));
    }, delay);
    return () => { clearTimeout(start); timers.forEach(clearTimeout); timers = []; };
  }, [box?.openedAt, box?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {box && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => phase === 'done' && setLootbox(null)}>
          <motion.div className="lootbox w-full max-w-xl" initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-center gap-2 text-white">
              {player && <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg" style={{ boxShadow: `0 0 0 3px ${player.color}` }}>{tokenEmoji(player.token)}</span>}
              <div className="text-lg font-black tracking-tight">🎁 {player?.name ?? ''} pasó por Salida: ¡Caja sorpresa!</div>
            </div>

            {phase === 'closed' ? (
              <div className="flex flex-col items-center py-4">
                <motion.div className="lb-box" animate={{ rotate: [0, -4, 4, -3, 3, 0], y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>🎁</motion.div>
                {mine ? (
                  <button data-open-box className="btn-primary breathe mt-4 px-10 py-4 text-2xl" onClick={() => { openLootbox(); useStore.setState(s => (s.lootbox && !s.lootbox.openedAt ? { lootbox: { ...s.lootbox, openedAt: Date.now() } } : {})); }}>
                    🔓 ¡Abrir caja!
                  </button>
                ) : <div className="mt-4 animate-pulse text-sm font-semibold text-white/80">Esperando que {player?.name} abra la caja…</div>}
              </div>
            ) : (
              <div className="lb-window">
                <div className="lb-marker" />
                <div ref={stripRef} className="lb-strip">
                  {cells.map((idx, i) => {
                    const l = LOOTBOX[idx];
                    return (
                      <div key={i} className={`lb-cell ${TONE[l.id]} ${phase === 'done' && i === WIN ? 'lb-win' : ''}`}>
                        <div className="lb-ico">{ICON[l.id]}</div>
                        <div className="lb-lbl">{l.label.replace('¡', '').replace('!', '').replace('Carta: ', '').replace('Multa de tránsito: ', 'Multa ')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 min-h-[44px] text-center">
              {phase === 'done' ? (
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }} className={`inline-block rounded-2xl px-5 py-2 text-xl font-black text-white ${box.amount < 0 ? 'bg-red-600' : box.prize === 'g500' ? 'bg-yellow-500 text-black' : 'bg-emerald-600'}`}>
                  {ICON[box.prize]} {box.label}
                </motion.div>
              ) : phase === 'spin' ? <div className="text-sm font-semibold text-white/70">Girando…</div> : null}
            </div>
            <div className="mt-1 text-center text-[11px] text-white/50">Promedio ≈ ₲ 200.000{phase === 'done' ? ' · toca para cerrar' : ''}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
