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
import { HouseBackground, TableProps } from '../components/HouseScene';
import { isMusicOn, isMuted, setMusicOn, setMuted, startMusic, stopMusic } from '../sound';
import { useEffect, useRef, useState } from 'react';

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
  // Vista de mesa: el tablero inclinado con fichas y casas paradas (preferencia de cada uno, se guarda en el navegador)
  const [tilt, setTilt] = useState(() => { try { return localStorage.getItem('nandepoly:tilt') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('nandepoly:tilt', tilt ? '1' : '0'); } catch { /* sin storage */ } }, [tilt]);
  useEffect(() => { startMusic(); return () => stopMusic(); }, []);
  // El tablero se ve "de lejos", apoyado en la mesa con lugar alrededor para los objetos (~78 % del
  // alto disponible; las casillas se leen con la lupa al pasar el mouse). Con 🔍 se lo trae "de cerca".
  const [far, setFar] = useState(() => { try { return localStorage.getItem('nandepoly:far') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('nandepoly:far', far ? '1' : '0'); } catch { /* sin storage */ } }, [far]);
  const boardMax = `min(100%, calc((100vh - ${focus ? 150 : 128}px) * ${far ? (focus ? 0.84 : 0.78) : 1}))`;
  const colRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Pantalla completa: además de esconder los paneles pedimos la pantalla completa del navegador;
  // se sale con el botón grande de arriba, con Esc, o con el botón de la barra de acciones.
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    if (focus) {
      try { (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)?.catch?.(() => { /* sin permiso: seguimos igual */ }); } catch { /* sin API */ }
    } else if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      try { (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => { /* ignorar */ }); } catch { /* ignorar */ }
    }
  }, [focus]);
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const onChange = () => { if (!doc.fullscreenElement && !doc.webkitFullscreenElement) setFocus(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(false); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange); window.removeEventListener('keydown', onKey); };
  }, []);
  const me = state.players.find(p => p.id === playerId);
  const canAbandon = !!me && !me.bankrupt && state.phase === 'PLAYING';
  const myTurn = state.phase === 'PLAYING' && state.players[state.currentPlayerIndex]?.id === playerId && (state.turnPhase === 'AWAITING_ROLL' || state.turnPhase === 'END_TURN');

  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  async function endGame() {
    if (!confirm('¿Terminar la partida ahora? Gana quien tenga mayor patrimonio.')) return;
    try { await emitAck('game:action', { type: 'END_GAME' }); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
    <HouseBackground />
    <div className={`house relative z-[1] mx-auto flex min-h-full max-w-[1900px] flex-col gap-3 p-2 sm:p-3 lg:h-screen lg:flex-row ${focus ? 'board-focus pt-14 lg:pt-14' : ''}`}>
      {/* Tabla en vivo (izquierda) */}
      <aside className="side-panel order-3 flex flex-col gap-3 lg:order-1 lg:h-full lg:w-[280px] lg:shrink-0 lg:overflow-hidden xl:w-[320px]">
        <div className="max-h-[40vh] lg:max-h-none lg:flex-1 lg:overflow-hidden"><LivePanel /></div>
        <MissionsPanel />
      </aside>
      {/* Tablero */}
      <div ref={colRef} className="board-col relative order-1 flex flex-col items-center gap-3 lg:order-2 lg:flex-1 lg:justify-center">
        <TableProps colRef={colRef} boardRef={boardRef} />
        {!connected && (
          <div className="w-full rounded-xl bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">Sin conexión… intentando reconectar</div>
        )}
        {focus && (
          <div className="focus-bar">
            <div className="whitespace-nowrap text-sm">Sala <b className="tracking-widest text-yellow-300">{roomCode}</b></div>
            <div className="flex items-center gap-1">
              <button className="focus-icon" title={muted ? 'Activar sonido' : 'Silenciar todo'} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? '🔇' : '🔊'}</button>
              <button className={`focus-icon ${music ? '' : 'opacity-40'}`} title={music ? 'Apagar música' : 'Prender música'} onClick={() => { setMusicOn(!music); setMusicState(!music); }}>🎵</button>
              <button className={`focus-icon ${tilt ? 'bg-white/20' : ''}`} title={tilt ? 'Vista plana' : 'Vista de mesa'} onClick={() => setTilt(v => !v)}>🪑</button>
              <button className={`focus-icon ${far ? '' : 'bg-white/20'}`} title={far ? 'Tablero de cerca' : 'Tablero de lejos'} onClick={() => setFar(v => !v)}>🔍</button>
            </div>
            <button className="focus-exit" data-focus-exit title="Volver a la vista normal (también con Esc)" onClick={() => setFocus(false)}>✕ Salir de pantalla completa</button>
          </div>
        )}
        <div ref={boardRef} className={`board-wrap w-full ${tilt ? 'board-tilt' : ''}`} style={{ maxWidth: boardMax }}>
          <Board />
        </div>
        <div className="w-full" style={{ maxWidth: boardMax }}>
          <ActionBar />
          {focus && <button className="mt-2 w-full rounded-xl bg-ink/80 py-1.5 text-xs font-bold text-white hover:bg-ink" onClick={() => setFocus(false)}>✕ Salir de pantalla completa (o apretá Esc)</button>}
        </div>
      </div>

      {/* Panel lateral */}
      <aside className="side-panel order-2 flex flex-col gap-3 lg:order-3 lg:h-full lg:w-[320px] lg:shrink-0 lg:overflow-hidden xl:w-[344px]">
        <div className="relative flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm">
          <div className="whitespace-nowrap">Sala <b className="tracking-widest text-py-red">{roomCode}</b></div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button className="text-xs font-semibold text-py-blue hover:underline" title="Reglas" onClick={() => setRulesOpen(true)}>📖</button>
            <button className="text-sm text-ink/60 hover:text-ink" title={muted ? 'Activar sonido' : 'Silenciar todo'} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? '🔇' : '🔊'}</button>
            <button className={`text-sm hover:text-ink ${music ? 'text-ink/60' : 'text-ink/25'}`} title={music ? 'Apagar música de fondo' : 'Prender música de fondo'} onClick={() => { setMusicOn(!music); setMusicState(!music); }}>🎵</button>
            <button className={`text-sm hover:text-ink ${tilt ? 'text-ink' : 'text-ink/50'}`} title={tilt ? 'Vista plana' : 'Vista de mesa: tablero inclinado con las fichas paradas'} onClick={() => setTilt(v => !v)}>🪑</button>
            <button className={`text-sm hover:text-ink ${far ? 'text-ink/50' : 'text-ink'}`} title={far ? 'Tablero de cerca (más grande)' : 'Tablero de lejos (se ve la mesa)'} onClick={() => setFar(v => !v)}>🔍</button>
            <button className="text-base text-ink/70 hover:text-ink" title="Pantalla completa: esconde los paneles y agranda el tablero (se sale con Esc o con el botón rojo)" onClick={() => setFocus(true)}>⛶</button>
            <button className="btn-ghost btn-sm !px-2 !py-1 text-xs" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}>☰ Más</button>
          </div>
          {menuOpen && (
            <div className="absolute right-2 top-full z-30 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-black/10 bg-white p-2 text-left shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
              <button className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100" onClick={() => { setMenuOpen(false); setFocus(true); }}>⛶ Pantalla completa</button>
              <button className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100" onClick={() => { setMenuOpen(false); setTilt(v => !v); }}>🪑 {tilt ? 'Vista plana' : 'Vista de mesa (inclinada)'}</button>
              <button className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100" onClick={() => { setMenuOpen(false); setFar(v => !v); }}>🔍 {far ? 'Tablero de cerca (más grande)' : 'Tablero de lejos (se ve la mesa)'}</button>
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
    </>
  );
}
