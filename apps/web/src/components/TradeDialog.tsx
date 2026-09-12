import { useEffect, useState } from 'react';
import { BOARD, GROUP_COLORS, METICHE_FEE, groupTiles, isProperty, tile, type TradeSide } from '@nandepoly/engine';
import { useMe, useStore } from '../store';
import { money, tokenEmoji } from '../format';
import Modal from './Modal';

const empty = (): TradeSide => ({ cash: 0, properties: [], jailCards: 0 });

/** Proponer un intercambio, y responder a propuestas recibidas. */
export default function TradeDialog() {
  const open = useStore(s => s.dialog === 'trade');
  const setDialog = useStore(s => s.setDialog);
  const state = useStore(s => s.state)!;
  const me = useMe();
  const act = useStore(s => s.act);
  const [toId, setToId] = useState<string>('');
  const [give, setGive] = useState<TradeSide>(empty());
  const [receive, setReceive] = useState<TradeSide>(empty());

  const sendDrafting = useStore(s => s.sendDrafting);
  const others = state.players.filter(p => !p.bankrupt && p.id !== me?.id);
  useEffect(() => { if (open) { setToId(others[0]?.id ?? ''); setGive(empty()); setReceive(empty()); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Avisar a la mesa con quién estoy negociando (fila fantasma en la tabla en vivo)
  useEffect(() => {
    if (open && toId) sendDrafting(toId);
    return () => { if (open) sendDrafting(null); };
  }, [open, toId, sendDrafting]);

  const pending = state.pendingTrade;
  const rivals = state.tradeRivals ?? [];
  const iAmButtIn = !!me && rivals.some(r => r.fromId === me.id);
  const canButtIn = !!pending && !!me && pending.fromId !== me.id && pending.toId !== me.id && !iAmButtIn && me.cash >= METICHE_FEE && !me.bankrupt;
  const [butt, setButt] = useState<TradeSide>(empty());
  const [improve, setImprove] = useState<TradeSide | null>(null);

  // Propuesta recibida: elijo entre la original y las de los metiches
  if (pending && me && pending.toId === me.id) {
    const offers = [pending, ...rivals];
    return (
      <Modal open width="max-w-3xl">
        <h2 className="text-xl font-black">🤝 Te ofrecen por lo mismo{offers.length > 1 ? ` · ${offers.length} ofertas` : ''}</h2>
        <div className="mt-1 text-sm text-ink/60">Vos entregás: <b>{sideText(pending.receive)}</b>. Elegí la oferta que más te convenga.</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {offers.map(o => {
            const from = state.players.find(p => p.id === o.fromId)!;
            return (
              <div key={o.id} className={`rounded-2xl border-2 p-3 ${o.butt ? 'border-amber-400 bg-amber-50' : 'border-emerald-500 bg-emerald-50'}`}>
                <div className="flex items-center justify-between">
                  <b>{from.name}</b>
                  <span className={`chip ${o.butt ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{o.butt ? '🕵️ metiche' : 'oferta original'}</span>
                </div>
                <SideView title="Te da" side={o.give} />
                <button className="btn-green mt-2 w-full" onClick={() => act({ type: 'TRADE_ACCEPT', tradeId: o.id })}>Aceptar la de {from.name}</button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-ghost" onClick={() => act({ type: 'TRADE_REJECT', tradeId: pending.id })}>Rechazar todas</button>
        </div>
      </Modal>
    );
  }

  // Propuesta enviada
  if (pending && me && pending.fromId === me.id) {
    const to = state.players.find(p => p.id === pending.toId)!;
    const canImprove = rivals.length > 0 && !state.tradeImproved;
    return (
      <Modal open width="max-w-2xl">
        <h2 className="text-xl font-black">🤝 Esperando respuesta de {to.name}…</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SideView title="Le das" side={pending.give} />
          <SideView title="Te da" side={pending.receive} />
        </div>
        {rivals.length > 0 && (
          <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
            <b className="text-amber-900">🕵️ Se metieron {rivals.length === 1 ? 'de metiche' : `${rivals.length} metiches`}:</b>
            <ul className="mt-1 list-inside list-disc text-sm">
              {rivals.map(r => <li key={r.id}><b>{state.players.find(p => p.id === r.fromId)?.name}</b> ofrece {sideText(r.give)}</li>)}
            </ul>
            {canImprove && (
              <>
                <div className="mt-2 text-sm font-semibold">Podés mejorar tu oferta <b>una sola vez</b>:</div>
                <SideEditor title={`Tu nueva oferta (tenés ${money(me.cash)})`} side={improve ?? pending.give} setSide={setImprove}
                  props={tradableFor(state, me.id)} maxCash={me.cash} maxCards={me.jailCards.length}
                  toggle={id => { const cur = improve ?? pending.give; setImprove({ ...cur, properties: cur.properties.includes(id) ? cur.properties.filter(x => x !== id) : [...cur.properties, id] }); }} />
                <button className="btn-primary mt-2 w-full" disabled={!improve} onClick={() => act({ type: 'TRADE_IMPROVE', give: improve! })}>Mejorar mi oferta</button>
              </>
            )}
            {!canImprove && state.tradeImproved && <div className="mt-1 text-xs text-amber-900/70">Ya mejoraste tu oferta una vez.</div>}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button className="btn-ghost" onClick={() => act({ type: 'TRADE_CANCEL', tradeId: pending.id })}>Cancelar propuesta</button>
        </div>
      </Modal>
    );
  }

  // Soy un tercero: puedo meterme de metiche
  if (pending && me && open && (canButtIn || iAmButtIn)) {
    const from = state.players.find(p => p.id === pending.fromId)!;
    const to = state.players.find(p => p.id === pending.toId)!;
    const miOferta = rivals.find(r => r.fromId === me.id);
    return (
      <Modal open onClose={() => setDialog(null)} width="max-w-2xl">
        <h2 className="text-xl font-black">🕵️ Trato en la mesa</h2>
        <div className="mt-1 text-sm">
          <b>{from.name}</b> le ofrece <b>{sideText(pending.give)}</b> a <b>{to.name}</b> por <b>{sideText(pending.receive)}</b>.
        </div>
        {miOferta ? (
          <>
            <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
              <b className="text-amber-900">Ya te metiste</b>
              <SideView title="Tu oferta" side={miOferta.give} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDialog(null)}>Cerrar</button>
              <button className="btn-ghost !text-red-700" onClick={() => act({ type: 'TRADE_CANCEL', tradeId: miOferta.id })}>Retirar mi oferta</button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink/70">
              Podés <b>meterte de metiche</b>: ofrecés lo tuyo por <b>lo mismo</b> que pedía {from.name} y {to.name} elige.
              Meterse cuesta <b>{money(METICHE_FEE)}</b> al banco.
            </p>
            <div className="mt-3">
              <SideEditor title={`Tu oferta (tenés ${money(me.cash)})`} side={butt} setSide={setButt}
                props={tradableFor(state, me.id)} maxCash={Math.max(0, me.cash - METICHE_FEE)} maxCards={me.jailCards.length}
                toggle={id => setButt({ ...butt, properties: butt.properties.includes(id) ? butt.properties.filter(x => x !== id) : [...butt.properties, id] })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDialog(null)}>Mirar nomás</button>
              <button className="btn-primary" disabled={!butt.cash && !butt.properties.length && !butt.jailCards}
                onClick={async () => { const ok = await act({ type: 'TRADE_BUTT_IN', give: butt }); if (ok) setButt(empty()); }}>
                🕵️ Meterme por {money(METICHE_FEE)}
              </button>
            </div>
          </>
        )}
      </Modal>
    );
  }

  if (!open || !me) return <Modal open={false} />;
  const to = state.players.find(p => p.id === toId);
  const tradable = (pid: string) => BOARD.filter(isProperty).filter(t => state.properties[t.id].owner === pid)
    .filter(t => t.type !== 'street' || groupTiles(t.group).every(g => state.properties[g.id].houses === 0));
  const toggle = (side: TradeSide, set: (s: TradeSide) => void, id: number) =>
    set({ ...side, properties: side.properties.includes(id) ? side.properties.filter(x => x !== id) : [...side.properties, id] });
  const valid = to && (give.cash || receive.cash || give.properties.length || receive.properties.length || give.jailCards || receive.jailCards)
    && give.cash <= me.cash && receive.cash <= (to?.cash ?? 0);

  return (
    <Modal open onClose={() => setDialog(null)} width="max-w-2xl">
      <h2 className="text-xl font-black">🤝 Proponer intercambio</h2>
      <label className="mt-3 block text-sm font-semibold">Con quién</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {others.map(p => (
          <button key={p.id} onClick={() => { setToId(p.id); setReceive(empty()); }}
            className={`flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 ${toId === p.id ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white'}`}>
            <span>{tokenEmoji(p.token)}</span><b>{p.name}</b>
          </button>
        ))}
      </div>
      {to && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SideEditor title={`Vos das (tenés ${money(me.cash)})`} side={give} setSide={setGive} props={tradable(me.id)} maxCash={me.cash} maxCards={me.jailCards.length} toggle={id => toggle(give, setGive, id)} />
          <SideEditor title={`${to.name} da (tiene ${money(to.cash)})`} side={receive} setSide={setReceive} props={tradable(to.id)} maxCash={to.cash} maxCards={to.jailCards.length} toggle={id => toggle(receive, setReceive, id)} />
        </div>
      )}
      <p className="mt-2 text-xs text-ink/50">Las propiedades con edificios en su grupo no se pueden intercambiar: vendé las casas primero.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => setDialog(null)}>Cerrar</button>
        <button className="btn-green" disabled={!valid} onClick={async () => {
          const ok = await act({ type: 'TRADE_PROPOSE', toPlayerId: toId, give, receive });
          if (ok) setDialog(null);
        }}>Enviar propuesta</button>
      </div>
    </Modal>
  );
}

/** Propiedades que un jugador puede dar (sin edificios en el grupo). */
function tradableFor(state: { properties: Record<number, { owner: string | null; houses: number }> }, pid: string) {
  return BOARD.filter(isProperty).filter(t => state.properties[t.id].owner === pid)
    .filter(t => t.type !== 'street' || groupTiles(t.group).every(g => state.properties[g.id].houses === 0));
}

/** Resumen de un lado del trato en una línea. */
function sideText(side: TradeSide): string {
  return [side.cash ? money(side.cash) : null, ...side.properties.map(id => tile(id).name), side.jailCards ? `${side.jailCards} carta(s) de Tacumbú` : null]
    .filter(Boolean).join(' + ') || 'nada';
}

function SideEditor({ title, side, setSide, props, maxCash, maxCards, toggle }: {
  title: string; side: TradeSide; setSide: (s: TradeSide) => void; props: ReturnType<typeof BOARD.filter>; maxCash: number; maxCards: number; toggle: (id: number) => void;
}) {
  return (
    <div className="rounded-xl bg-cream p-3">
      <div className="text-sm font-bold">{title}</div>
      <label className="mt-2 block text-xs font-semibold text-ink/60">Efectivo (en miles de ₲)</label>
      <input type="number" className="input !py-1" min={0} max={maxCash} step={10} value={side.cash}
        onChange={e => setSide({ ...side, cash: Math.max(0, Math.min(maxCash, Math.floor(Number(e.target.value) || 0))) })} />
      {maxCards > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={side.jailCards > 0} onChange={e => setSide({ ...side, jailCards: e.target.checked ? 1 : 0 })} />
          Carta "Salís de Tacumbú" 🎟️
        </label>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {props.length === 0 && <span className="text-xs text-ink/40">Sin propiedades intercambiables</span>}
        {props.map(t => {
          const on = side.properties.includes(t.id);
          const color = t.type === 'street' ? GROUP_COLORS[t.group] : t.type === 'transport' ? '#37474F' : '#C9A227';
          return (
            <button key={t.id} onClick={() => toggle(t.id)} className={`flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-xs ${on ? 'border-py-blue bg-blue-50 font-bold' : 'border-black/10 bg-white'}`}>
              <span className="h-3 w-3 rounded-sm" style={{ background: color }} />{t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SideView({ title, side }: { title: string; side: TradeSide }) {
  return (
    <div className="rounded-xl bg-cream p-3 text-sm">
      <div className="font-bold">{title}</div>
      <ul className="mt-1 list-inside list-disc">
        {side.cash > 0 && <li>{money(side.cash)}</li>}
        {side.properties.map(id => <li key={id}>{tile(id).name}</li>)}
        {side.jailCards > 0 && <li>{side.jailCards} carta(s) "Salís de Tacumbú"</li>}
        {!side.cash && !side.properties.length && !side.jailCards && <li className="text-ink/40">Nada</li>}
      </ul>
    </div>
  );
}
