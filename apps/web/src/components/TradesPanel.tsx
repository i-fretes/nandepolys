import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { METICHE_FEE, legalActions, type GameState, type TradeState } from '@nandepoly/engine';
import { useMe, useStore } from '../store';
import { money } from '../format';
import { PlayerToken } from './Pieces';
import { sideText } from './TradeDialog';

/**
 * Panel "Intercambios" (columna izquierda, entre En vivo y las misiones). Acá viven las propuestas:
 * las que me llegan (con aceptar/rechazar), la que mandé (esperando, con los metiches que se metieron)
 * y las de otros (con el botón para meterme). Ya no aparecen como ventana encima del tablero;
 * la ventana queda sólo para armar una oferta (proponer, meterse o mejorar).
 */
export default function TradesPanel() {
  const state = useStore(s => s.state)!;
  const me = useMe();
  const act = useStore(s => s.act);
  const setDialog = useStore(s => s.setDialog);
  const pending = state.pendingTrade;
  const rivals = state.tradeRivals ?? [];
  const [flash, setFlash] = useState(false);
  const incoming = !!pending && !!me && pending.toId === me.id;
  // Al llegar una propuesta para mí, el panel late unos segundos para que se note
  useEffect(() => {
    if (!incoming) { setFlash(false); return; }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 6000);
    return () => clearTimeout(t);
  }, [incoming, pending?.id, rivals.length]);

  if (!me || state.phase !== 'PLAYING') return null;
  const legal = legalActions(state as unknown as GameState, me.id);
  const player = (id?: string | null) => state.players.find(p => p.id === id);
  const Who = ({ id }: { id: string }) => { const p = player(id); return p ? <span className="inline-flex items-center gap-1"><PlayerToken token={p.token} color={p.color} size="14px" /><b>{p.name}</b></span> : <b>—</b>; };

  let body: React.ReactNode;
  if (!pending) {
    body = (
      <div className="px-3 py-2">
        <div className="text-xs text-ink/50">No hay ninguna propuesta en la mesa.</div>
        <button className="btn-ghost btn-sm mt-2 w-full" disabled={!legal.has('TRADE_PROPOSE')} onClick={() => setDialog('trade')}
          title={legal.has('TRADE_PROPOSE') ? 'Armar una oferta para otro jugador' : 'Ahora no podés proponer'}>🤝 Proponer intercambio</button>
      </div>
    );
  } else if (pending.toId === me.id) {
    // Me ofrecen: elijo entre la original y las de los metiches
    const offers: TradeState[] = [pending, ...rivals];
    body = (
      <div className="space-y-2 px-3 py-2" data-trades-incoming>
        <div className="text-xs">Vos entregás: <b>{sideText(pending.receive)}</b></div>
        <AnimatePresence initial={false}>
          {offers.map(o => (
            <motion.div key={o.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}
              className={`rounded-xl border-2 p-2 ${o.butt ? 'border-amber-300 bg-amber-50' : 'border-emerald-400 bg-emerald-50'}`}>
              <div className="flex items-center justify-between text-xs">
                <Who id={o.fromId} />
                <span className={`chip text-[10px] ${o.butt ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{o.butt ? '🕵️ metiche' : 'original'}</span>
              </div>
              <div className="mt-1 text-xs">Te da: <b>{sideText(o.give)}</b></div>
              <button className="btn-green btn-sm mt-1.5 w-full" onClick={() => act({ type: 'TRADE_ACCEPT', tradeId: o.id })}>✅ Aceptar</button>
            </motion.div>
          ))}
        </AnimatePresence>
        <button className="btn-ghost btn-sm w-full !text-red-700" onClick={() => act({ type: 'TRADE_REJECT', tradeId: pending.id })}>❌ Rechazar {offers.length > 1 ? 'todas' : ''}</button>
      </div>
    );
  } else if (pending.fromId === me.id) {
    // La mandé yo
    const canImprove = rivals.length > 0 && !state.tradeImproved;
    body = (
      <div className="space-y-2 px-3 py-2" data-trades-mine>
        <div className="flex items-center gap-1 text-xs"><span className="animate-pulse">⏳</span> Esperando a <Who id={pending.toId} /></div>
        <div className="rounded-xl bg-cream p-2 text-xs">
          <div>Le das: <b className="text-red-700">{sideText(pending.give)}</b></div>
          <div>Te da: <b className="text-emerald-700">{sideText(pending.receive)}</b></div>
        </div>
        {rivals.length > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-2 text-xs">
            <b className="text-amber-900">🕵️ Se {rivals.length === 1 ? 'metió' : 'metieron'}:</b>
            <ul className="mt-1 space-y-0.5">{rivals.map(r => <li key={r.id}><Who id={r.fromId} /> ofrece <b>{sideText(r.give)}</b></li>)}</ul>
            {canImprove && <button className="btn-primary btn-sm mt-1.5 w-full" onClick={() => setDialog('trade')}>Mejorar mi oferta (una vez)</button>}
            {state.tradeImproved && <div className="mt-1 text-[10px] text-amber-900/70">Ya mejoraste tu oferta.</div>}
          </div>
        )}
        <button className="btn-ghost btn-sm w-full" onClick={() => act({ type: 'TRADE_CANCEL', tradeId: pending.id })}>Cancelar propuesta</button>
      </div>
    );
  } else {
    // Trato ajeno: puedo meterme de metiche
    const mine = rivals.find(r => r.fromId === me.id);
    const canButtIn = legal.has('TRADE_BUTT_IN');
    body = (
      <div className="space-y-2 px-3 py-2" data-trades-other>
        <div className="text-xs"><Who id={pending.fromId} /> le ofrece <b>{sideText(pending.give)}</b> a <Who id={pending.toId} /> por <b>{sideText(pending.receive)}</b>.</div>
        {rivals.length > 0 && <div className="text-xs text-amber-900">🕵️ {rivals.length === 1 ? 'Ya hay un metiche' : `Ya hay ${rivals.length} metiches`}{mine ? ' (vos incluido)' : ''}.</div>}
        {mine ? (
          <>
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-2 text-xs">Tu oferta: <b>{sideText(mine.give)}</b></div>
            <button className="btn-ghost btn-sm w-full !text-red-700" onClick={() => act({ type: 'TRADE_CANCEL', tradeId: mine.id })}>Retirar mi oferta</button>
          </>
        ) : (
          <button className={`btn-sm w-full ${canButtIn ? 'btn-primary breathe' : 'btn-ghost'}`} disabled={!canButtIn} onClick={() => setDialog('trade')}
            title={canButtIn ? `Ofrecés lo tuyo por lo mismo; cuesta ${money(METICHE_FEE)}` : 'No podés meterte ahora'}>🕵️ Meterme por {money(METICHE_FEE)}</button>
        )}
      </div>
    );
  }

  return (
    <div className={`card overflow-hidden ${flash ? 'live-pulse ring-2 ring-emerald-400' : ''}`} data-trades>
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <div className="text-sm font-black tracking-tight">🤝 Intercambios</div>
        {pending && <span className={`chip text-[10px] ${incoming ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-py-blue'}`}>{incoming ? 'te ofrecen' : 'en la mesa'}</span>}
      </div>
      {body}
    </div>
  );
}
