import { useNavigate } from 'react-router-dom';
import { ranking, type GameState } from '@nandepoly/engine';
import { useStore } from '../store';
import { money, tokenEmoji } from '../format';
import { clearSession, emitAck } from '../socket';
import toast from 'react-hot-toast';
import Modal from './Modal';

export default function GameOver() {
  const state = useStore(s => s.state)!;
  const roomCode = useStore(s => s.roomCode);
  const playerId = useStore(s => s.playerId);
  const leaveRoom = useStore(s => s.leaveRoom);
  const nav = useNavigate();
  const isHost = state.hostId === playerId;
  async function rematchNow() {
    try { await emitAck('room:rematch', {}); } catch (e) { toast.error((e as Error).message); }
  }
  if (state.phase !== 'FINISHED') return <Modal open={false} />;
  const rank = ranking(state as unknown as GameState);
  const winner = state.players.find(p => p.id === state.winnerId);
  return (
    <Modal open width="max-w-md">
      <div className="text-center">
        <div className="text-5xl">🏆</div>
        <h2 className="mt-2 text-2xl font-black">¡Ganó {winner?.name ?? '—'}!</h2>
        <p className="text-sm text-ink/60">Fin de la partida</p>
      </div>
      <ol className="mt-4 space-y-1">
        {rank.map((r, i) => {
          const p = state.players.find(x => x.id === r.playerId)!;
          return (
            <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i === 0 ? 'bg-yellow-50' : 'bg-cream'}`}>
              <span className="w-5 text-right font-black text-ink/50">{i + 1}</span>
              <span>{tokenEmoji(p.token)}</span>
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-sm">{p.bankrupt ? 'Fuera' : money(r.netWorth)}</span>
            </li>
          );
        })}
      </ol>
      {isHost ? (
        <button className="btn-green mt-4 w-full" onClick={rematchNow}>🔁 Revancha con los mismos jugadores</button>
      ) : playerId ? (
        <p className="mt-4 animate-pulse text-center text-sm text-ink/60">El anfitrión puede pedir revancha; quedate en esta pantalla para jugar de nuevo.</p>
      ) : null}
      <button className="btn-ghost mt-2 w-full" onClick={() => { if (roomCode) clearSession(roomCode); leaveRoom(); nav('/'); }}>Volver al inicio</button>
    </Modal>
  );
}
