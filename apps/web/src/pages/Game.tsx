import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useStore } from '../store';
import { clearSession, emitAck } from '../socket';
import Board from '../components/Board';
import PlayerPanel from '../components/PlayerPanel';
import ActionBar from '../components/ActionBar';
import LogChat from '../components/LogChat';
import PropertyCard from '../components/PropertyCard';
import AuctionDialog from '../components/AuctionDialog';
import ManageDialog from '../components/ManageDialog';
import TradeDialog from '../components/TradeDialog';
import CardModal from '../components/CardModal';
import GameOver from '../components/GameOver';
import RulesDialog from '../components/RulesDialog';
import FX from '../components/FX';
import CasinoDialog from '../components/CasinoDialog';
import RentOfferDialog from '../components/RentOfferDialog';
import ChallengeDialog from '../components/ChallengeDialog';
import { isMuted, setMuted } from '../sound';
import { useState } from 'react';

export default function Game() {
  const state = useStore(s => s.state)!;
  const roomCode = useStore(s => s.roomCode);
  const playerId = useStore(s => s.playerId);
  const connected = useStore(s => s.connected);
  const leaveRoom = useStore(s => s.leaveRoom);
  const nav = useNavigate();
  const isHost = state.hostId === playerId;
  const setRulesOpen = useStore(s => s.setRulesOpen);
  const act = useStore(s => s.act);
  const [muted, setMutedState] = useState(isMuted());
  const me = state.players.find(p => p.id === playerId);
  const canAbandon = !!me && !me.bankrupt && state.phase === 'PLAYING';
  const myTurn = state.phase === 'PLAYING' && state.players[state.currentPlayerIndex]?.id === playerId && (state.turnPhase === 'AWAITING_ROLL' || state.turnPhase === 'END_TURN');

  async function endGame() {
    if (!confirm('¿Terminar la partida ahora? Gana quien tenga mayor patrimonio.')) return;
    try { await emitAck('game:action', { type: 'END_GAME' }); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-3 p-2 sm:p-3 lg:h-screen lg:flex-row">
      {/* Tablero */}
      <div className="flex flex-col items-center gap-3 lg:flex-1 lg:justify-center">
        {!connected && (
          <div className="w-full rounded-xl bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">Sin conexión… intentando reconectar</div>
        )}
        <div className="w-full" style={{ maxWidth: 'min(100%, calc(100vh - 140px))' }}>
          <Board />
        </div>
        <div className="w-full" style={{ maxWidth: 'min(100%, calc(100vh - 140px))' }}>
          <ActionBar />
        </div>
      </div>

      {/* Panel lateral */}
      <aside className="flex flex-col gap-3 lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-hidden">
        <div className="flex flex-col gap-1 rounded-2xl bg-white/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>Sala <b className="tracking-widest text-py-red">{roomCode}</b></div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button className="text-xs font-semibold text-py-blue hover:underline" onClick={() => setRulesOpen(true)}>📖 Reglas</button>
            <button className="text-xs text-ink/60 hover:text-ink" title={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? '🔇' : '🔊'}</button>
            {isHost && state.phase === 'PLAYING' && <button className="text-xs text-ink/50 hover:text-red-600" onClick={endGame}>Terminar partida</button>}
            <button className="text-xs text-ink/50 hover:text-ink" title="Cerrar esta pestaña; podés volver con el mismo link" onClick={() => {
              if (confirm('¿Salir? Podés volver con el mismo link y seguís con tu jugador.')) { leaveRoom(); nav('/'); }
            }}>Salir</button>
            {canAbandon && (
              <button className="text-xs text-ink/50 hover:text-red-600" title="Retirarme de la partida definitivamente" onClick={async () => {
                if (confirm('¿Abandonar la partida? Quedás fuera: tus propiedades vuelven al banco y se subastan. Podés seguir mirando.')) await act({ type: 'LEAVE_GAME' });
              }}>Abandonar partida</button>
            )}
            {!canAbandon && (
              <button className="text-xs text-ink/50 hover:text-red-600" title="Olvidar mi lugar en esta sala" onClick={() => {
                if (roomCode && confirm('Esto borra tu sesión guardada de esta sala. ¿Seguro?')) { clearSession(roomCode); leaveRoom(); nav('/'); }
              }}>Olvidar sala</button>
            )}
          </div>
        </div>
        <div className="scroll-thin lg:max-h-[46%] lg:overflow-y-auto"><PlayerPanel /></div>
        <LogChat />
      </aside>

      <PropertyCard />
      <AuctionDialog />
      <ManageDialog />
      <TradeDialog />
      <CardModal />
      <GameOver />
      <RulesDialog />
      <CasinoDialog />
      <RentOfferDialog />
      <ChallengeDialog />
      <FX />
      {myTurn && <div className="my-turn-glow" style={{ ['--glow' as string]: me?.color }} />}
    </div>
  );
}
