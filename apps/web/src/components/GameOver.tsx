import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { ranking, type GameState, type PlayerStats } from '@nandepoly/engine';
import { useStore } from '../store';
import { money } from '../format';
import { clearSession, emitAck } from '../socket';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { PlayerToken } from './Pieces';
import { sfx } from '../sound';

/** Premios "de charla": quién fue el más timbero, el más preso, etc. */
const AWARDS: { key: keyof PlayerStats; icon: string; title: string; text: (n: number) => string; min?: number }[] = [
  { key: 'rentsCollected', icon: '🏠', title: 'El casero', text: n => `cobró ${n} alquileres` },
  { key: 'casinoWins', icon: '🎰', title: 'El timbero', text: n => `ganó ${n} veces en el Casino` },
  { key: 'jailVisits', icon: '🚔', title: 'El preso', text: n => `fue ${n} veces a Tacumbú` },
  { key: 'arenaWins', icon: '🏟️', title: 'MVP de la Arena', text: n => `ganó ${n} mini-juegos` },
  { key: 'trades', icon: '🤝', title: 'El negociador', text: n => `cerró ${n} intercambios` },
  { key: 'challengesWon', icon: '⚔️', title: 'El guapo', text: n => `ganó ${n} desafíos` },
  { key: 'housesBuilt', icon: '🏗️', title: 'El constructor', text: n => `levantó ${n} casas` },
  { key: 'doubles', icon: '🎲', title: 'Mano caliente', text: n => `sacó ${n} dobles` },
  { key: 'duelsWon', icon: '🔫', title: 'El duelista', text: n => `ganó ${n} duelos mayores` },
  { key: 'donWins', icon: '💵', title: 'El caradura', text: n => `zafó de ${n} alquileres a doble o nada` },
];

export default function GameOver() {
  const state = useStore(s => s.state)!;
  const roomCode = useStore(s => s.roomCode);
  const playerId = useStore(s => s.playerId);
  const leaveRoom = useStore(s => s.leaveRoom);
  const nav = useNavigate();
  const isHost = state.hostId === playerId;
  const finished = state.phase === 'FINISHED';
  async function rematchNow() {
    try { await emitAck('room:rematch', {}); } catch (e) { toast.error((e as Error).message); }
  }

  // Confeti al aparecer el podio
  useEffect(() => {
    if (!finished) return;
    const t1 = setTimeout(() => { confetti({ particleCount: 160, spread: 90, origin: { y: 0.4 } }); sfx.win(); }, 900);
    const t2 = setTimeout(() => confetti({ particleCount: 90, spread: 120, angle: 60, origin: { x: 0, y: 0.6 } }), 1500);
    const t3 = setTimeout(() => confetti({ particleCount: 90, spread: 120, angle: 120, origin: { x: 1, y: 0.6 } }), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [finished]);

  const rank = useMemo(() => (finished ? ranking(state as unknown as GameState) : []), [finished, state]);
  const awards = useMemo(() => {
    if (!finished) return [];
    const out: { icon: string; title: string; who: string; text: string }[] = [];
    for (const a of AWARDS) {
      let best: { id: string; n: number } | null = null;
      for (const p of state.players) {
        const n = p.stats?.[a.key] ?? 0;
        if (n > 0 && (!best || n > best.n)) best = { id: p.id, n };
      }
      if (best) out.push({ icon: a.icon, title: a.title, who: state.players.find(p => p.id === best!.id)!.name, text: a.text(best.n) });
    }
    return out.slice(0, 6);
  }, [finished, state]);

  if (!finished) return <Modal open={false} />;
  const byId = (id: string) => state.players.find(x => x.id === id)!;
  const top = rank.slice(0, 3);
  const order = [1, 0, 2].filter(i => top[i]); // 2º, 1º, 3º (el primero al medio, más alto)
  const heights = ['fpodium-1', 'fpodium-2', 'fpodium-3'];

  return (
    <Modal open width="max-w-2xl">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink/50">Fin de la partida</div>
        <h2 className="mt-1 text-3xl font-black">🏆 ¡Ganó {byId(state.winnerId ?? rank[0]?.playerId).name}!</h2>
      </div>

      {/* Podio */}
      <div className="fpodium mt-4">
        {order.map(i => {
          const r = top[i]; const p = byId(r.playerId);
          return (
            <div key={p.id} className={`fpodium-col ${heights[i]}`} style={{ animationDelay: `${i === 0 ? 0.5 : i === 1 ? 0.2 : 0.35}s` }}>
              <div className="fpodium-token" style={{ animationDelay: `${i === 0 ? 0.9 : i === 1 ? 0.6 : 0.75}s` }}>
                <PlayerToken token={p.token} color={p.color} size="64px" />
                {i === 0 && <span className="fpodium-crown">👑</span>}
              </div>
              <div className="fpodium-name">{p.name}</div>
              <div className="fpodium-worth">{p.bankrupt ? 'Fuera' : money(r.netWorth)}</div>
              <div className="fpodium-block" style={{ background: p.color }}><span>{i + 1}</span></div>
            </div>
          );
        })}
      </div>

      {rank.length > 3 && (
        <ol className="mt-3 space-y-1">
          {rank.slice(3).map((r, i) => { const p = byId(r.playerId); return (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-cream px-3 py-1.5 text-sm">
              <span className="w-5 text-right font-black text-ink/50">{i + 4}</span>
              <PlayerToken token={p.token} color={p.color} size="22px" />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span>{p.bankrupt ? 'Fuera' : money(r.netWorth)}</span>
            </li>
          ); })}
        </ol>
      )}

      {/* Premios de charla */}
      {awards.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {awards.map((a, i) => (
            <div key={a.title} className="award" style={{ animationDelay: `${1.3 + i * 0.12}s` }}>
              <span className="award-icon">{a.icon}</span>
              <div><div className="text-xs font-bold uppercase tracking-wide text-ink/50">{a.title}</div><div className="text-sm"><b>{a.who}</b> {a.text}</div></div>
            </div>
          ))}
        </div>
      )}

      {isHost ? (
        <button className="btn-green mt-4 w-full" onClick={rematchNow}>🔁 Revancha con los mismos jugadores</button>
      ) : playerId ? (
        <p className="mt-4 animate-pulse text-center text-sm text-ink/60">El anfitrión puede pedir revancha; quedate en esta pantalla para jugar de nuevo.</p>
      ) : null}
      <button className="btn-ghost mt-2 w-full" onClick={() => { if (roomCode) clearSession(roomCode); leaveRoom(); nav('/'); }}>Volver al inicio</button>
    </Modal>
  );
}
