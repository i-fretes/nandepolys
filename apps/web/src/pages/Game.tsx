import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useStore } from '../store';
import { clearSession, emitAck } from '../socket';
import Board from '../components/Board';
import PlayerPanel from '../components/PlayerPanel';
import ActionBar from '../components/ActionBar';
import Reactions from '../components/Reactions';
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
import LivePanel from '../components/LivePanel';
import ArenaDialog from '../components/ArenaDialog';
import DuelDialog from '../components/DuelDialog';
import LootboxOverlay from '../components/LootboxOverlay';
import EventWheel from '../components/EventWheel';
import MissionsPanel from '../components/MissionsPanel';
import { isMusicOn, isMuted, setMusicOn, setMuted, startMusic, stopMusic } from '../sound';
import { useEffect, useState } from 'react';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [music, setMusicState] = useState(isMusicOn());
  const [focus, setFocus] = useState(false);   // pantalla completa: esconde los paneles y agranda el tablero
  useEffect(() => { startMusic(); return () => stopMusic(); }, []);
  const me = state.players.find(p => p.id === playerId);
  const canAbandon = !!me && !me.bankrupt && state.phase === 'PLAYING';
  const myTurn = state.phase === 'PLAYING' && state.players[state.currentPlayerIndex]?.id === playerId && (state.turnPhase === 'AWAITING_ROLL' || state.turnPhase === 'END_TURN');

  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  async function endGame() {
    if (!confirm('¿Terminar la partida ahora? Gana quien tenga mayor patrimonio.')) return;
    try { await emitAck('game:action', { type: 'END_GAME' }); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className={`mx-auto flex min-h-full max-w-[1900px] flex-col gap-3 p-2 sm:p-3 lg:h-screen lg:flex-row ${focus ? 'board-focus' : ''}`}>
      {/* Tabla en vivo (izquierda) */}
      <aside className="side-panel order-3 flex flex-col gap-3 lg:order-1 lg:h-full lg:w-[280px] lg:shrink-0 lg:overflow-hidden xl:w-[320px]">
        <div className="max-h-[40vh] lg:max-h-none lg:flex-1 lg:overflow-hidden"><LivePanel /></div>
        <MissionsPanel />
      </aside>
      {/* Tablero */}
      <div className="order-1 flex flex-col items-center gap-3 lg:order-2 lg:flex-1 lg:justify-center">
        {!connected && (
          <div className="w-full rounded-xl bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">Sin conexión… intentando reconectar</div>
        )}
        <div className="w-full" style={{ maxWidth: `min(100%, calc(100vh - ${focus ? 96 : 128}px))` }}>
          <Board />
        </div>
        <div className="w-full" style={{ maxWidth: `min(100%, calc(100vh - ${focus ? 96 : 128}px))` }}>
          <ActionBar />
        </div>
      </div>

      {/* Panel lateral */}
      <aside className="side-panel order-2 flex flex-col gap-3 lg:order-3 lg:h-full lg:w-[320px] lg:shrink-0 lg:overflow-hidden xl:w-[344px]">
        <div className="relative flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm">
          <div>Sala <b className="tracking-widest text-py-red">{roomCode}</b></div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold text-py-blue hover:underline" onClick={() => setRulesOpen(true)}>📖 Reglas</button>
            <button className="text-sm text-ink/60 hover:text-ink" title={muted ? 'Activar sonido' : 'Silenciar todo'} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? '🔇' : '🔊'}</button>
            <button className={`text-sm hover:text-ink ${music ? 'text-ink/60' : 'text-ink/25'}`} title={music ? 'Apagar música de fondo' : 'Prender música de fondo'} onClick={() => { setMusicOn(!music); setMusicState(!music); }}>🎵</button>
            <button className="text-sm text-ink/60 hover:text-ink" title={focus ? 'Volver a mostrar los paneles' : 'Pantalla completa: esconde los paneles y agranda el tablero'} onClick={() => setFocus(v => !v)}>{focus ? '🗗' : '⛶'}</button>
            <button className="btn-ghost btn-sm !px-2 !py-1 text-xs" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}>☰ Más</button>
          </div>
          {menuOpen && (
            <div className="absolute right-2 top-full z-30 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-black/10 bg-white p-2 text-left shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
              {isHost && state.phase === 'PLAYING' && <button className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100" onClick={() => { setMenuOpen(false); endGame(); }}>🏁 Terminar partida</button>}
              <button className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100" title="Cerrar esta pestaña; podés volver con el mismo link" onClick={() => {
                if (confirm('¿Salir? Podés volver con el mismo link y seguís con tu jugador.')) { leaveRoom(); nav('/'); }
              }}>🚪 Salir (podés volver)</button>
              {canAbandon && (
                <button className="rounded-lg px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50" title="Retirarme de la partida definitivamente" onClick={async () => {
                  setMenuOpen(false);
                  if (confirm('¿Abandonar la partida? Quedás fuera: tus propiedades vuelven al banco y se subastan. Podés seguir mirando.')) await act({ type: 'LEAVE_GAME' });
                }}>💸 Abandonar partida</button>
              )}
              {!canAbandon && (
                <button className="rounded-lg px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50" title="Olvidar mi lugar en esta sala" onClick={() => {
                  if (roomCode && confirm('Esto borra tu sesión guardada de esta sala. ¿Seguro?')) { clearSession(roomCode); leaveRoom(); nav('/'); }
                }}>🧹 Olvidar sala</button>
              )}
            </div>
          )}
        </div>
        <div className="scroll-thin lg:flex-1 lg:overflow-y-auto"><PlayerPanel /></div>
        <Reactions />
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
      <ArenaDialog />
      <DuelDialog />
      <LootboxOverlay />
      <EventWheel />
      <FX />
      {myTurn && <div className="my-turn-glow" style={{ ['--glow' as string]: me?.color }} />}
    </div>
  );
}
