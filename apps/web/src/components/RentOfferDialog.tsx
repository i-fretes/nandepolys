import { useEffect, useState } from 'react';
import { tile } from '@nandepoly/engine';
import { useStore } from '../store';
import { money, tokenEmoji } from '../format';
import { sfx } from '../sound';
import Modal from './Modal';
import { Die3D } from './Dice';

/** Alquiler a doble o nada: el que paga propone, el dueño decide, los dados deciden. */
export default function RentOfferDialog() {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const act = useStore(s => s.act);
  const deadline = useStore(s => s.phaseDeadline);
  const lastDon = useStore(s => s.lastDon);
  const o = state.rentOffer;
  const [now, setNow] = useState(Date.now());
  const [show, setShow] = useState<{ id: number; rolling: boolean } | null>(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  // Resultado del tiro: se muestra unos segundos aunque la fase ya haya cambiado
  useEffect(() => {
    if (!lastDon) return;
    setShow({ id: lastDon.id, rolling: true }); sfx.dice();
    const a = setTimeout(() => { setShow({ id: lastDon.id, rolling: false }); if (lastDon.data.win) sfx.bigWin(); else sfx.drum(); }, 1000);
    const b = setTimeout(() => setShow(null), 4200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [lastDon?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (state.turnPhase === 'RENT_OFFER' && !!o) || !!show;
  if (!open) return <Modal open={false} />;
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  if (show && lastDon) {
    const d = lastDon.data as { dice: [number, number]; win: boolean; amount: number };
    const payer = state.players.find(p => p.id === lastDon.data.playerId) ?? null;
    return (
      <Modal open width="max-w-md">
        <div className="text-center">
          <h2 className="text-xl font-black">🎲 Doble o nada</h2>
          <div className="my-5 flex justify-center gap-4">
            <Die3D value={d.dice[0]} rolling={show.rolling} size="72px" />
            <Die3D value={d.dice[1]} rolling={show.rolling} size="72px" />
          </div>
          {!show.rolling && (
            <div className={`reveal text-2xl font-black ${d.win ? 'text-emerald-600' : 'text-red-600'}`}>
              {d.dice[0] + d.dice[1]}: {d.win ? '¡7 o más! No paga nada.' : `6 o menos. Paga el doble: ${money(d.amount)}`}
            </div>
          )}
          {payer && <div className="mt-1 text-sm text-ink/60">{payer.name}</div>}
        </div>
      </Modal>
    );
  }

  const payer = state.players.find(p => p.id === o!.payerId)!;
  const owner = state.players.find(p => p.id === o!.ownerId)!;
  const t = tile(o!.tileId);
  const iPay = me === o!.payerId;
  const iOwn = me === o!.ownerId;

  return (
    <Modal open width="max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">💵 Alquiler en {t.name}</h2>
        {secs !== null && <span className={`font-mono text-lg ${secs <= 5 ? 'text-red-600' : 'text-ink/60'}`}>{secs}s</span>}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3 text-lg">
        <span className="rounded-full bg-cream px-3 py-1 font-bold">{tokenEmoji(payer.token)} {payer.name}</span>
        <span className="text-ink/50">debe</span>
        <span className="text-2xl font-black text-red-700">{money(o!.rent)}</span>
        <span className="text-ink/50">a</span>
        <span className="rounded-full bg-cream px-3 py-1 font-bold">{tokenEmoji(owner.token)} {owner.name}</span>
      </div>

      {!o!.proposed && (
        iPay ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button className="btn-ghost py-3" onClick={() => act({ type: 'RENT_PAY' })}>Pagar {money(o!.rent)}</button>
            <button className="btn-primary breathe py-3" onClick={() => act({ type: 'RENT_DON_PROPOSE' })}>
              🎲 Proponer doble o nada
              <span className="block text-xs font-normal opacity-90">7+ no pagás · 6- pagás {money(o!.rent * 2)}</span>
            </button>
          </div>
        ) : <p className="mt-5 text-center text-ink/60">{payer.name} decide si paga o propone doble o nada…</p>
      )}

      {o!.proposed && (
        iOwn ? (
          <div className="mt-5">
            <p className="text-center font-semibold">{payer.name} te propone <b>doble o nada</b>: si saca 7 o más no te paga; si saca 6 o menos te paga <b>{money(o!.rent * 2)}</b>.</p>
            <p className="mt-1 text-center text-xs text-ink/50">Probabilidad de que saque 7 o más: 58 %. Vos elegís.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button className="btn-ghost py-3" onClick={() => act({ type: 'RENT_DON_REJECT' })}>No, que pague {money(o!.rent)}</button>
              <button className="btn-green breathe py-3" onClick={() => act({ type: 'RENT_DON_ACCEPT' })}>¡Acepto el doble o nada!</button>
            </div>
          </div>
        ) : <p className="mt-5 animate-pulse text-center text-ink/60">{payer.name} propuso doble o nada. {owner.name} está decidiendo…</p>
      )}
    </Modal>
  );
}
