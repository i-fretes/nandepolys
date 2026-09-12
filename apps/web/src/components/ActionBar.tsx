import { JAIL_FINE, legalActions, netWorth, tile, type GameState, type PropertyTile } from '@nandepoly/engine';
import { useIsMyTurn, useMe, useMoving, useStore } from '../store';
import { money } from '../format';

export default function ActionBar() {
  const state = useStore(s => s.state)!;
  const me = useMe();
  const myTurn = useIsMyTurn();
  const act = useStore(s => s.act);
  const setDialog = useStore(s => s.setDialog);
  const spectator = useStore(s => s.spectator);
  const moving = useMoving();
  const current = state.players[state.currentPlayerIndex];

  if (spectator || !me) {
    return <Bar><span className="text-sm text-ink/60">Estás mirando la partida. Turno de <b>{current?.name}</b>.</span></Bar>;
  }
  if (state.phase !== 'PLAYING') return null;
  const legal = legalActions(state as unknown as GameState, me.id);
  const mgmt = (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setDialog('manage')} disabled={!(legal.has('BUILD') || legal.has('SELL_BUILDING') || legal.has('MORTGAGE') || legal.has('UNMORTGAGE'))}>🏠 Propiedades</button>
      <button className={`btn-ghost btn-sm ${legal.has('TRADE_BUTT_IN') ? 'breathe !border-amber-400' : ''}`} onClick={() => setDialog('trade')}
        disabled={!(legal.has('TRADE_PROPOSE') || legal.has('TRADE_BUTT_IN')) && !state.tradeRivals?.some(r => r.fromId === me.id)}
        title={legal.has('TRADE_BUTT_IN') ? 'Hay un trato en la mesa: podés meterte de metiche' : 'Proponer un intercambio'}>
        {legal.has('TRADE_BUTT_IN') ? '🕵️ Meterme' : '🤝 Intercambiar'}
      </button>
      {state.settings.challenges && <button className="btn-ghost btn-sm" onClick={() => setDialog('challenge')} disabled={!legal.has('CHALLENGE_PROPOSE')}>⚔️ Desafiar</button>}
      {state.settings.duels && (
        <button className={`btn-ghost btn-sm ${legal.has('DUEL_PROPOSE') ? 'duel-ready' : ''}`} onClick={() => setDialog('duel')} disabled={!legal.has('DUEL_PROPOSE')} title={me.duelTokens > 0 ? 'Tenés ficha de duelo' : 'Ganás una ficha cada 3 vueltas'}>
          🔫 Duelo mayor {me.duelTokens > 0 && <span className="chip bg-yellow-300 text-black">×{me.duelTokens}</span>}
        </button>
      )}
    </>
  );

  if (me.bankrupt) return <Bar><span className="text-sm text-ink/60">Quebraste. Podés seguir mirando la partida.</span></Bar>;

  if (moving && state.phase === 'PLAYING') {
    return <Bar><span className="text-sm font-semibold animate-pulse">🚶 {current?.name} está avanzando…</span></Bar>;
  }
  if (state.turnPhase === 'AUCTION') {
    return <Bar><span className="text-sm font-semibold">🔨 Subasta en curso</span></Bar>;
  }
  if (state.turnPhase === 'CASINO') return <Bar><span className="text-sm font-semibold">🎰 {current?.name} está en el Casino</span></Bar>;
  if (state.turnPhase === 'CHALLENGE') return <Bar><span className="text-sm font-semibold">⚔️ Desafío en curso</span></Bar>;
  if (state.turnPhase === 'RENT_OFFER') return <Bar><span className="text-sm font-semibold">💵 Cobro de alquiler en curso</span></Bar>;
  if (state.turnPhase === 'ARENA') return <Bar><span className="text-sm font-semibold">🏟️ ¡La Arena está en juego!</span></Bar>;
  if (state.turnPhase === 'DUEL') return <Bar><span className="text-sm font-semibold">🔫 Duelo mayor en curso</span></Bar>;

  if (!myTurn) {
    return (
      <Bar>
        <span className="mr-auto text-sm text-ink/60">Esperando a <b>{current?.name}</b>…</span>
        {mgmt}
      </Bar>
    );
  }

  switch (state.turnPhase) {
    case 'AWAITING_ROLL':
      return (
        <Bar>
          {me.inJail ? (
            <>
              <span className="mr-auto text-sm font-semibold">Estás preso en Tacumbú (turno {me.jailTurns + 1} de 3)</span>
              <button className="btn-blue" disabled={!legal.has('JAIL_PAY')} onClick={() => act({ type: 'JAIL_PAY' })}>Pagar {money(JAIL_FINE)}</button>
              <button className="btn-blue" disabled={!legal.has('JAIL_CARD')} onClick={() => act({ type: 'JAIL_CARD' })}>Usar carta 🎟️</button>
              <button className="btn-primary" onClick={() => act({ type: 'ROLL' })}>🎲 Intentar dobles</button>
            </>
          ) : (
            <>
              {mgmt}
              <button className="btn-primary breathe ml-auto px-6 text-lg" onClick={() => act({ type: 'ROLL' })}>🎲 Tirar dados</button>
            </>
          )}
        </Bar>
      );
    case 'AWAITING_BUY': {
      const t = tile(me.position) as PropertyTile;
      return (
        <Bar>
          <span className="mr-auto text-sm"><b>{t.name}</b> está libre · {money(t.price)}</span>
          <button className="btn-ghost" onClick={() => act({ type: 'DECLINE' })}>{state.settings.auctions ? 'No comprar (subasta)' : 'No comprar'}</button>
          <button className="btn-green" disabled={!legal.has('BUY')} onClick={() => act({ type: 'BUY' })}>Comprar por {money(t.price)}</button>
        </Bar>
      );
    }
    case 'TAX_CHOICE': {
      const pct = Math.ceil(netWorth(state as unknown as GameState, me.id) * 0.1);
      return (
        <Bar>
          <span className="mr-auto text-sm font-semibold">🧾 Impuesto a la Renta (SET)</span>
          <button className="btn-blue" onClick={() => act({ type: 'TAX_CHOICE', choice: 'flat' })}>Pagar {money(200)}</button>
          <button className="btn-blue" onClick={() => act({ type: 'TAX_CHOICE', choice: 'percent' })}>Pagar 10 % ({money(pct)})</button>
        </Bar>
      );
    }
    case 'DEBT': {
      const d = state.debt!;
      const to = d.creditorIds.length ? d.creditorIds.map(id => state.players.find(p => p.id === id)?.name).join(', ') : 'el banco';
      return (
        <Bar>
          <span className="mr-auto text-sm"><b className="text-red-700">Debés {money(d.amount)}</b> a {to} ({d.reason}). Tenés {money(me.cash)}.</span>
          <button className="btn-ghost btn-sm" onClick={() => setDialog('manage')}>Hipotecar / vender</button>
          <button className="btn-ghost btn-sm" onClick={() => setDialog('trade')} disabled={!legal.has('TRADE_PROPOSE')}>Negociar</button>
          <button className="btn-green" disabled={!legal.has('PAY_DEBT')} onClick={() => act({ type: 'PAY_DEBT' })}>Pagar</button>
          <button className="btn btn-sm bg-red-100 text-red-700 hover:bg-red-200" onClick={() => confirm('¿Seguro que querés declararte en quiebra? Quedás fuera de la partida.') && act({ type: 'DECLARE_BANKRUPTCY' })}>Quiebra</button>
        </Bar>
      );
    }
    case 'END_TURN':
      return (
        <Bar>
          {mgmt}
          <button className="btn-primary ml-auto px-6" onClick={() => act({ type: 'END_TURN' })}>Terminar turno ➜</button>
        </Bar>
      );
  }
  return null;
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="card flex flex-wrap items-center justify-end gap-2 p-3">{children}</div>;
}
