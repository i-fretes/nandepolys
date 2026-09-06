import { BOARD, GROUP_COLORS, isProperty, netWorth, type GameState } from '@nandepoly/engine';
import { useStore } from '../store';
import { money, tokenEmoji } from '../format';
import AnimatedNumber from './AnimatedNumber';

export default function PlayerPanel() {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const setSelected = useStore(s => s.setSelectedTile);
  const act = useStore(s => s.act);
  const streak = useStore(s => s.streak);
  const current = state.players[state.currentPlayerIndex];
  const isHost = state.hostId === me;

  return (
    <div className="space-y-2">
      {state.players.map(p => {
        const props = BOARD.filter(isProperty).filter(t => state.properties[t.id].owner === p.id);
        const isCurrent = state.phase === 'PLAYING' && current?.id === p.id;
        return (
          <div key={p.id} data-player-card={p.id} className={`card relative p-3 transition ${isCurrent ? 'ring-2 ring-py-red' : ''} ${p.bankrupt ? 'opacity-50 grayscale' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-xl" style={{ boxShadow: `0 0 0 3px ${p.color}` }}>{tokenEmoji(p.token)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{p.name}</span>
                  {p.id === me && <span className="chip bg-blue-100 text-py-blue">Vos</span>}
                  {p.isBot && <span className="chip bg-slate-200 text-slate-700">Bot</span>}
                  {p.inJail && <span className="chip bg-slate-800 text-white">Preso</span>}
                  {p.bankrupt && <span className="chip bg-red-100 text-red-700">Fuera</span>}
                  {!p.connected && !p.isBot && !p.bankrupt && <span className="chip bg-red-100 text-red-700">Offline</span>}
                </div>
                <div className="text-sm">
                  <b className="text-emerald-700"><AnimatedNumber value={p.cash} format={money} /></b>
                  <span className="text-ink/50"> · patrimonio {money(netWorth(state as unknown as GameState, p.id))}</span>
                  {p.lapsCompleted > 0 && <span className="text-ink/40"> · {p.lapsCompleted} vuelta{p.lapsCompleted === 1 ? '' : 's'}</span>}
                  {(streak[p.id] ?? 0) >= 3 && <span className="streak ml-1 inline-block" title={`${streak[p.id]} alquileres cobrados seguidos`}>🔥{streak[p.id]}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-sm">
                {p.jailCards.length > 0 && <span title="Carta Salís de Tacumbú">🎟️{p.jailCards.length > 1 ? `×${p.jailCards.length}` : ''}</span>}
                {state.settings.duels && p.duelTokens > 0 && <span title="Fichas de Duelo mayor" className="duel-token">🔫×{p.duelTokens}</span>}
                {state.settings.missions && p.missions.length > 0 && <span title="Misiones secretas cumplidas" className="text-xs">🎯 {p.missions.filter(m => m.done).length}/{p.missions.length}</span>}
              </div>
            </div>
            {isHost && state.phase === 'PLAYING' && p.id !== me && !p.bankrupt && (
              <div className="mt-2 flex gap-1">
                <button
                  className="btn-ghost btn-sm !px-2 !py-0.5 text-[11px]"
                  title={p.isBot ? 'Devolverle el control a la persona' : 'Que un bot juegue por esta persona mientras no está'}
                  onClick={() => act({ type: 'SET_BOT', targetId: p.id, isBot: !p.isBot })}
                >{p.isBot ? '🧑 Devolver control' : '🤖 Reemplazar por bot'}</button>
                <button
                  className="btn-ghost btn-sm !px-2 !py-0.5 text-[11px] text-red-700"
                  title="Sacarlo de la partida: sus propiedades vuelven al banco y se subastan"
                  onClick={() => confirm(`¿Sacar a ${p.name} de la partida? Sus propiedades vuelven al banco y se subastan.`) && act({ type: 'LEAVE_GAME', targetId: p.id })}
                >Sacar</button>
              </div>
            )}
            {props.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {props.map(t => {
                  const ps = state.properties[t.id];
                  const color = t.type === 'street' ? GROUP_COLORS[t.group] : t.type === 'transport' ? '#37474F' : '#C9A227';
                  return (
                    <button
                      key={t.id} onClick={() => setSelected(t.id)} title={t.name}
                      className={`relative h-6 w-4 rounded-sm border border-black/20 ${ps.mortgaged ? 'opacity-40' : ''}`}
                      style={{ background: color }}
                    >
                      {ps.houses > 0 && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-white px-0.5 text-[9px] font-bold leading-none shadow">
                          {ps.houses === 5 ? 'H' : ps.houses}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
