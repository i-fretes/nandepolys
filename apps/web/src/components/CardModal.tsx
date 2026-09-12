import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMoving, useStore } from '../store';
import { sfx } from '../sound';

/**
 * Muestra la carta que acaba de sacar un jugador. La carta sale volando desde el mazo dibujado
 * en el tablero (Suerte o Cooperativa), llega al centro boca abajo y se da vuelta.
 * Las cartas hacen cola: nunca se muestra una encima de otra.
 */
export default function CardModal() {
  const cardModal = useStore(s => s.cardModal);
  const queued = useStore(s => s.cardQueue.length);
  const setCardModal = useStore(s => s.setCardModal);
  const state = useStore(s => s.state);
  const moving = useMoving();
  const paused = useStore(s => s.movePaused);
  // Se muestra cuando la ficha llegó, o cuando frenó en la casilla de la carta antes de seguir viaje
  const open = !!cardModal && (!moving || paused);
  const [flipped, setFlipped] = useState(false);

  // De dónde sale la carta: el mazo del tablero (o el centro de la pantalla si no está en vista)
  const from = useMemo(() => {
    if (!cardModal) return { x: 0, y: 0, scale: 0.35 };
    const el = document.querySelector(`[data-deck="${cardModal.card.deck}"]`);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0) return { x: 0, y: -80, scale: 0.4 };
    return { x: r.left + r.width / 2 - window.innerWidth / 2, y: r.top + r.height / 2 - window.innerHeight / 2, scale: Math.max(0.25, r.width / 340) };
  }, [cardModal?.card.id, cardModal?.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setFlipped(false); return; }
    setFlipped(false);
    const flip = setTimeout(() => { setFlipped(true); sfx.card(); }, 520);
    const close = setTimeout(() => setCardModal(null), queued > 0 ? 4800 : paused ? 12000 : 6000);
    return () => { clearTimeout(flip); clearTimeout(close); };
  }, [open, cardModal?.card.id, cardModal?.playerId, queued, setCardModal]);

  const who = cardModal ? state?.players.find(p => p.id === cardModal.playerId) : null;
  const isChance = cardModal?.card.deck === 'chance';
  return (
    <AnimatePresence>
      {open && cardModal && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setCardModal(null)}>
          <motion.div
            key={cardModal.card.id + cardModal.playerId}
            className="w-full max-w-sm"
            initial={{ x: from.x, y: from.y, scale: from.scale, rotate: isChance ? -12 : 12, opacity: 0.9 }}
            animate={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
            exit={{ y: 30, scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 170, damping: 20, mass: 0.9 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center text-xs font-semibold uppercase tracking-widest text-white/85 drop-shadow">{who?.name} sacó una carta</div>
            <div className={`cardflip mt-2 ${flipped ? 'flipped' : ''}`}>
              <div className={`cardface back ${isChance ? 'chance' : 'community'}`}>
                <div className="cardback-logo">{isChance ? '?' : '★'}</div>
                <div className="cardback-name">{isChance ? 'Suerte' : 'Cooperativa'}</div>
              </div>
              <div className={`cardface front ${isChance ? 'bg-[#FFE082]' : 'bg-[#B3E5FC]'}`}>
                <div className="text-3xl">{isChance ? '❓' : '🤝'}</div>
                <div className="mt-1 text-lg font-black">{isChance ? 'Suerte' : 'Cooperativa'}</div>
                <p className="mt-3 text-base font-medium leading-snug">{cardModal.card.text}</p>
              </div>
            </div>
            <button className="btn-ghost mt-4 w-full" onClick={() => setCardModal(null)}>
              {queued > 0 ? `Siguiente carta (${queued} en espera)` : 'Entendido'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
