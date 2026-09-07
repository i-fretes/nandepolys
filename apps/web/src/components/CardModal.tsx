import { useEffect } from 'react';
import { useMoving, useStore } from '../store';
import Modal from './Modal';

/** Muestra la carta que acaba de sacar un jugador. */
export default function CardModal() {
  const cardModal = useStore(s => s.cardModal);
  const setCardModal = useStore(s => s.setCardModal);
  const state = useStore(s => s.state);
  const moving = useMoving();

  useEffect(() => {
    if (!cardModal || moving) return;
    const id = setTimeout(() => setCardModal(null), 7000);
    return () => clearTimeout(id);
  }, [cardModal, setCardModal, moving]);

  const who = cardModal ? state?.players.find(p => p.id === cardModal.playerId) : null;
  const isChance = cardModal?.card.deck === 'chance';
  return (
    <Modal open={!!cardModal && !moving} onClose={() => setCardModal(null)} width="max-w-sm">
      {cardModal && (
        <div className="flip-scene text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink/50">{who?.name} sacó una carta</div>
          <div className={`flip mt-2 rounded-2xl p-6 ${isChance ? 'bg-[#FFE082]' : 'bg-[#B3E5FC]'}`} key={cardModal.card.id + cardModal.playerId}>
            <div className="text-3xl">{isChance ? '❓' : '🤝'}</div>
            <div className="mt-1 text-lg font-black">{isChance ? 'Suerte' : 'Cooperativa'}</div>
            <p className="mt-3 text-base font-medium leading-snug">{cardModal.card.text}</p>
          </div>
          <button className="btn-ghost mt-4 w-full" onClick={() => setCardModal(null)}>Entendido</button>
        </div>
      )}
    </Modal>
  );
}
