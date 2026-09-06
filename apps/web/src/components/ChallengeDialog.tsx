import { useEffect, useState } from 'react';
import { challengeName, type ChallengeKind, type PptChoice } from '@nandepoly/engine';
import { useStore } from '../store';
import { money, tokenEmoji } from '../format';
import { sfx } from '../sound';
import Modal from './Modal';
import { Die3D } from './Dice';

const KINDS: { id: ChallengeKind; icon: string; desc: string }[] = [
  { id: 'dados', icon: '🎲', desc: 'Cada uno tira dos dados. El mayor gana. Puro azar.' },
  { id: 'ppt', icon: '✊', desc: 'Piedra, papel o tijera al mejor de tres.' },
  { id: 'trivia', icon: '🧠', desc: 'Pregunta sobre Paraguay. El primero que acierta gana.' },
  { id: 'terere', icon: '🧉', desc: 'Cuando aparezca el tereré, tocá primero. Si te adelantás, perdés.' },
];
const PPT: { id: PptChoice; icon: string }[] = [{ id: 'piedra', icon: '✊' }, { id: 'papel', icon: '✋' }, { id: 'tijera', icon: '✌️' }];

/** Botón "Desafiar" + diálogo de desafío en todas sus fases. */
export default function ChallengeDialog() {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const act = useStore(s => s.act);
  const openPicker = useStore(s => s.dialog === 'challenge');
  const setDialog = useStore(s => s.setDialog);
  const deadline = useStore(s => s.phaseDeadline);
  const chEvents = useStore(s => s.challengeEvents);
  const c = state.challenge;
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ id: number; data: Record<string, unknown>; text: string } | null>(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  // Mostrar el resultado final unos segundos aunque el estado ya haya vuelto al turno
  const lastDone = [...chEvents].reverse().find(e => e.type === 'challenge_done');
  useEffect(() => {
    if (!lastDone) return;
    setResult(lastDone);
    const id = setTimeout(() => setResult(r => (r?.id === lastDone.id ? null : r)), 4500);
    return () => clearTimeout(id);
  }, [lastDone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const name = (id: string | null | undefined) => state.players.find(p => p.id === id)?.name ?? '—';
  const emoji = (id: string | null | undefined) => { const p = state.players.find(p => p.id === id); return p ? tokenEmoji(p.token) : ''; };

  // Resultado final (splash)
  if (result && !c) {
    const d = result.data as { winner: string | null; loser?: string; amount: number; kind: ChallengeKind };
    const iWon = d.winner === me, iLost = d.loser === me;
    return (
      <Modal open onClose={() => setResult(null)} width="max-w-md">
        <div className="vs-splash text-center">
          <div className="text-6xl">{d.winner ? '🏆' : '🤝'}</div>
          <h2 className={`mt-2 text-2xl font-black ${iWon ? 'text-emerald-600' : iLost ? 'text-red-600' : ''}`}>
            {d.winner ? `¡Ganó ${name(d.winner)}!` : 'Sin ganador'}
          </h2>
          <p className="mt-1 text-ink/70">{result.text}</p>
          {d.amount > 0 && <div className="mt-3 text-3xl font-black text-emerald-700">+{money(d.amount)}</div>}
          <button className="btn-ghost mt-4 w-full" onClick={() => setResult(null)}>Cerrar</button>
        </div>
      </Modal>
    );
  }

  // Elegir rival y mini-juego (por botón o por carta)
  const picking = (c && c.status === 'pick' && c.fromId === me) || (openPicker && !c);
  if (picking) return <Picker forced={!!c} amount={c?.amount ?? 100} onClose={() => setDialog(null)} secs={secs} />;

  if (!c) return <Modal open={false} />;
  const from = state.players.find(p => p.id === c.fromId)!;
  const to = c.toId ? state.players.find(p => p.id === c.toId) : null;
  const iAmIn = me === c.fromId || me === c.toId;

  if (c.status === 'pick') {
    return <Modal open width="max-w-sm"><p className="text-center text-ink/70">⚔️ {from.name} sacó una carta de ¡Desafío! y está eligiendo rival…</p></Modal>;
  }

  return (
    <Modal open width="max-w-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">⚔️ {challengeName(c.kind!)}</h2>
        {secs !== null && <span className={`font-mono text-lg ${secs <= 5 ? 'text-red-600' : 'text-ink/60'}`}>{secs}s</span>}
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <Side name={from.name} emoji={emoji(from.id)} color={from.color} />
        <div className="vs-splash text-2xl font-black text-py-red">VS</div>
        <Side name={to?.name ?? '?'} emoji={emoji(to?.id)} color={to?.color ?? '#999'} />
      </div>
      <div className="mt-1 text-center text-sm text-ink/60">Se juega por <b>{money(c.amount)}</b>{c.forced ? ' · por carta, no se puede rechazar' : ''}</div>

      {c.status === 'pending' && (
        me === c.toId ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="btn-ghost py-3" onClick={() => act({ type: 'CHALLENGE_REJECT' })}>No, gracias</button>
            <button className="btn-primary breathe py-3" onClick={() => act({ type: 'CHALLENGE_ACCEPT' })}>¡Acepto! ⚔️</button>
          </div>
        ) : <p className="mt-4 animate-pulse text-center text-ink/60">Esperando que {to?.name} acepte…</p>
      )}

      {c.status === 'playing' && c.kind === 'ppt' && <Ppt c={c} me={me} iAmIn={iAmIn} act={act} name={name} />}
      {c.status === 'playing' && c.kind === 'trivia' && <Trivia c={c} me={me} iAmIn={iAmIn} act={act} name={name} />}
      {c.status === 'playing' && c.kind === 'terere' && <Terere c={c} iAmIn={iAmIn} act={act} />}
      {c.status === 'playing' && c.kind === 'dados' && <p className="mt-4 text-center">Tirando…</p>}
    </Modal>
  );
}

function Side({ name, emoji, color }: { name: string; emoji: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-3xl" style={{ boxShadow: `0 0 0 4px ${color}` }}>{emoji}</span>
      <span className="mt-1 max-w-[120px] truncate font-bold">{name}</span>
    </div>
  );
}

function Picker({ forced, amount: fixed, onClose, secs }: { forced: boolean; amount: number; onClose: () => void; secs: number | null }) {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const act = useStore(s => s.act);
  const rivals = state.players.filter(p => !p.bankrupt && p.id !== me && p.cash > 0);
  const [toId, setToId] = useState(rivals[0]?.id ?? '');
  const [kind, setKind] = useState<ChallengeKind>('dados');
  const [amount, setAmount] = useState(100);
  const myCash = state.players.find(p => p.id === me)?.cash ?? 0;
  const rival = rivals.find(r => r.id === toId);
  const max = Math.min(myCash, rival?.cash ?? 0);
  const amt = forced ? Math.min(fixed, max) : Math.min(amount, max);

  return (
    <Modal open onClose={forced ? undefined : onClose} width="max-w-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">⚔️ {forced ? '¡Desafío obligatorio!' : 'Desafiar a un jugador'}</h2>
        {secs !== null && forced && <span className="font-mono text-ink/60">{secs}s</span>}
      </div>
      {forced && <p className="mt-1 text-sm text-ink/70">Sacaste la carta ¡Desafío!: elegí rival y mini-juego. Se juega por {money(amt)} y el rival no puede negarse.</p>}
      <div className="mt-3 text-sm font-semibold">Rival</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {rivals.map(p => (
          <button key={p.id} onClick={() => setToId(p.id)} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 ${toId === p.id ? 'border-py-red bg-red-50' : 'border-black/10 bg-white'}`}>
            <span>{tokenEmoji(p.token)}</span><b>{p.name}</b><span className="text-xs text-ink/50">{money(p.cash)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm font-semibold">Mini-juego</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {KINDS.map(k => (
          <button key={k.id} onClick={() => setKind(k.id)} className={`rounded-xl border-2 p-3 text-left ${kind === k.id ? 'border-py-red bg-red-50' : 'border-black/10 bg-white'}`}>
            <div className="text-lg font-bold">{k.icon} {challengeName(k.id)}</div>
            <div className="text-xs text-ink/60">{k.desc}</div>
          </button>
        ))}
      </div>
      {!forced && (
        <>
          <div className="mt-3 text-sm font-semibold">Apuesta (máximo {money(max)})</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {[50, 100, 200, 500].filter(v => v <= max).map(v => (
              <button key={v} className={`btn-ghost btn-sm ${amount === v ? '!bg-red-50 !border-py-red' : ''}`} onClick={() => setAmount(v)}>{v} mil</button>
            ))}
            <input type="number" className="input !w-28 !py-1" min={10} max={max} step={10} value={amount} onChange={e => setAmount(Math.max(10, Math.min(max, Math.floor(Number(e.target.value) || 0))))} />
          </div>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {!forced && <button className="btn-ghost" onClick={onClose}>Cancelar</button>}
        <button className="btn-primary" disabled={!toId || amt < 10 && !forced} onClick={async () => {
          const ok = await act({ type: 'CHALLENGE_PROPOSE', toId, kind, amount: amt });
          if (ok && !forced) onClose();
        }}>{forced ? '¡A jugar!' : `Desafiar por ${money(amt)}`}</button>
      </div>
    </Modal>
  );
}

// --- Piedra, papel o tijera ------------------------------------------------------------------
function Ppt({ c, me, iAmIn, act, name }: { c: NonNullable<ReturnType<typeof useStore.getState>['state']>['challenge'] & object; me: string | null; iAmIn: boolean; act: (a: Record<string, unknown> & { type: string }) => Promise<boolean>; name: (id: string) => string }) {
  const ch = c!;
  const rounds = ch.data.rounds ?? [];
  const score = ch.data.score ?? {};
  const chosen = ch.data.chosen ?? [];
  const iChose = !!me && chosen.includes(me);
  const [picked, setPicked] = useState<PptChoice | null>(null);
  useEffect(() => { if (!iChose) setPicked(null); }, [iChose, rounds.length]);
  const lastRound = rounds[rounds.length - 1];
  return (
    <div className="mt-3">
      <div className="flex items-center justify-center gap-6 text-2xl font-black">
        <span>{score[ch.fromId] ?? 0}</span><span className="text-sm text-ink/50">mejor de 3</span><span>{score[ch.toId!] ?? 0}</span>
      </div>
      {lastRound && (
        <div key={rounds.length} className="reveal mt-2 flex items-center justify-center gap-4 text-4xl">
          <span>{PPT.find(p => p.id === lastRound.a)!.icon}</span>
          <span className="text-base font-bold text-ink/60">{lastRound.winner ? `punto ${name(lastRound.winner)}` : 'empate'}</span>
          <span>{PPT.find(p => p.id === lastRound.b)!.icon}</span>
        </div>
      )}
      {iAmIn ? (
        <div className="mt-4">
          <div className="flex justify-center gap-3">
            {PPT.map(p => (
              <button key={p.id} className={`ppt-btn ${picked === p.id ? 'picked' : ''}`} disabled={iChose} title={p.id}
                onClick={() => { setPicked(p.id); sfx.tick(); act({ type: 'CHALLENGE_MOVE', choice: p.id }); }}>{p.icon}</button>
            ))}
          </div>
          <p className="mt-2 text-center text-sm text-ink/60">{iChose ? 'Esperando al rival…' : 'Elegí en secreto'}</p>
        </div>
      ) : <p className="mt-4 text-center text-sm text-ink/60">Eligiendo… ({chosen.length}/2)</p>}
    </div>
  );
}

// --- Trivia -----------------------------------------------------------------------------------
function Trivia({ c, me, iAmIn, act, name }: { c: NonNullable<ReturnType<typeof useStore.getState>['state']>['challenge'] & object; me: string | null; iAmIn: boolean; act: (a: Record<string, unknown> & { type: string }) => Promise<boolean>; name: (id: string) => string }) {
  const ch = c!;
  const q = ch.data.question;
  const answered = ch.data.answered ?? {};
  const mine = me ? answered[me] : undefined;
  const chEvents = useStore(s => s.challengeEvents);
  const reveal = [...chEvents].reverse().find(e => e.type === 'challenge_round' && e.data.reveal !== undefined);
  const others = Object.entries(answered).filter(([id]) => id !== me);
  if (!q) return null;
  return (
    <div className="mt-3">
      <div className="text-center text-xs font-semibold uppercase tracking-wider text-ink/50">Pregunta {(ch.data.qIndex ?? 0) + 1} de 3</div>
      <div key={q.q} className="reveal mt-1 rounded-2xl bg-cream p-4 text-center text-lg font-bold">{q.q}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const wrongMine = mine === i;
          const wrongOther = others.some(([, a]) => a === i);
          return (
            <button key={i} disabled={!iAmIn || mine !== undefined} data-answer={i}
              onClick={() => { sfx.tick(); act({ type: 'CHALLENGE_MOVE', answer: i }); }}
              className={`rounded-xl border-2 px-3 py-3 text-left font-semibold transition ${wrongMine ? 'border-red-400 bg-red-50 line-through' : 'border-black/10 bg-white hover:border-py-blue'} disabled:cursor-default`}>
              <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-py-blue text-xs text-white">{'ABCD'[i]}</span>{opt}
              {wrongOther && <span className="ml-2 text-xs text-ink/50">✗ {others.filter(([, a]) => a === i).map(([id]) => name(id)).join(', ')}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-sm text-ink/60">
        {!iAmIn ? 'Mirando…' : mine === undefined ? 'El primero que acierta gana. Si fallás, el rival todavía puede acertar.' : 'Fallaste. Cruzá los dedos para que el rival también…'}
        {reveal && (reveal.data.reveal !== undefined) && ' '}
      </p>
    </div>
  );
}

// --- Tereré caliente --------------------------------------------------------------------------
function Terere({ c, iAmIn, act }: { c: NonNullable<ReturnType<typeof useStore.getState>['state']>['challenge'] & object; iAmIn: boolean; act: (a: Record<string, unknown> & { type: string }) => Promise<boolean> }) {
  const go = !!c!.data.go;
  const [tapped, setTapped] = useState(false);
  useEffect(() => { setTapped(false); }, [c!.id]);
  const tap = () => { if (!iAmIn || tapped) return; setTapped(true); act({ type: 'CHALLENGE_MOVE' }); };
  return (
    <div className="mt-3">
      {go ? (
        <div className="terere-go" onPointerDown={tap} role="button">
          <div className="text-center"><div className="icon">🧉</div><div className="text-3xl font-black">¡TERERÉ! ¡TOCÁ!</div></div>
        </div>
      ) : (
        <div className="terere-wait" onPointerDown={tap} role="button">
          <div className="text-center"><div className="text-5xl opacity-40">🧉</div><div className="mt-2">Esperá… cuando se ponga verde, tocá.</div><div className="text-xs opacity-60">Si tocás antes, perdés.</div></div>
        </div>
      )}
      {!iAmIn && <p className="mt-2 text-center text-sm text-ink/60">Mirando el duelo de reflejos…</p>}
    </div>
  );
}
