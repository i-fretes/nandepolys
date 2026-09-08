import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ARENA_GAMES, ARENA_REWARDS, sapoPos, type ArenaGame, type ArenaState } from '@nandepoly/engine';
import { serverNow, useMe, useMoving, useStore } from '../store';
import { money, tokenEmoji } from '../format';
import { socket } from '../socket';
import { sfx } from '../sound';

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function useNow(ms = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
/** Reloj del servidor (misma cuenta regresiva en todas las pantallas). */
function useServerNow(ms = 100) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const id = setInterval(() => setNow(serverNow()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** La Arena: votación, los 11 mini-juegos y el podio. Todos los jugadores participan a la vez. */
export default function ArenaDialog() {
  const state = useStore(s => s.state)!;
  const me = useMe();
  const a = state.arena;
  const moving = useMoving();
  const open = state.turnPhase === 'ARENA' && !!a && !moving;
  return (
    <AnimatePresence>
      {open && a && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}>
          <motion.div className="arena card w-full max-w-3xl max-h-[96vh] overflow-y-auto p-4 sm:p-5" initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
            {a.stage === 'vote' && <Vote a={a} meId={me?.id ?? null} />}
            {a.stage === 'play' && <Play a={a} meId={me?.id ?? null} />}
            {a.stage === 'done' && <Podium a={a} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------------------
function Vote({ a, meId }: { a: ArenaState; meId: string | null }) {
  const act = useStore(s => s.act);
  const state = useStore(s => s.state)!;
  const deadline = useStore(s => s.phaseDeadline);
  const now = useNow(200);
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const canVote = !!meId && a.players.includes(meId);
  const trig = state.players.find(p => p.id === a.triggeredBy);
  return (
    <div>
      <div className="vs-splash text-center">
        <div className="text-3xl font-black tracking-tight">🏟️ ¡La Arena!</div>
        <div className="text-sm text-ink/60">{trig?.name} cayó en la Arena: <b>todos juegan</b>, el banco paga {ARENA_REWARDS.map(money).join(' / ')}. ¿Qué se juega?</div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {a.options.map((g, i) => {
          const def = ARENA_GAMES.find(x => x.id === g)!;
          const voters = Object.entries(a.votes).filter(([, v]) => v === i).map(([id]) => state.players.find(p => p.id === id)).filter(Boolean);
          const mine = meId ? a.votes[meId] === i : false;
          return (
            <button key={g} data-arena-option={i} disabled={!canVote} onClick={() => { act({ type: 'ARENA_VOTE', option: i }); sfx.tick(); }}
              className={`arena-option ${mine ? 'picked' : ''}`}>
              <div className="text-4xl">{def.icon}</div>
              <div className="mt-1 text-base font-black">{def.name}</div>
              <div className="mt-1 text-xs text-ink/60">{def.desc}</div>
              <div className="mt-2 flex min-h-[22px] flex-wrap justify-center gap-1">
                {voters.map(p => <span key={p!.id} className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs" style={{ boxShadow: `0 0 0 2px ${p!.color}` }}>{tokenEmoji(p!.token)}</span>)}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-center text-sm font-semibold text-ink/60">
        {secs !== null ? <>Arranca en <b className={secs <= 3 ? 'text-red-600' : ''}>{secs}s</b> · empate: lo decide la suerte</> : 'Contando votos…'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Header({ a, subtitle }: { a: ArenaState; subtitle?: React.ReactNode }) {
  const def = ARENA_GAMES.find(x => x.id === a.game)!;
  const now = useServerNow(250);
  const left = Math.max(0, def.seconds - Math.floor((now - (a.startedAt ?? now)) / 1000));
  const showTimer = !['bomba', 'oeste', 'rayo', 'globos', 'cartas', 'borrosa', 'cadena', 'ruleta', 'bomba2'].includes(a.game ?? '');
  return (
    <div className="flex items-center gap-3">
      <div className="text-3xl">{def.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-black leading-tight">{def.name}</div>
        <div className="text-xs text-ink/60">{subtitle ?? def.desc}</div>
      </div>
      {showTimer && <div className={`rounded-full px-3 py-1 font-mono text-sm font-bold ${left <= 5 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-ink/70'}`}>{left}s</div>}
    </div>
  );
}

function Players({ a, render }: { a: ArenaState; render?: (id: string) => React.ReactNode }) {
  const state = useStore(s => s.state)!;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {a.players.map(id => {
        const p = state.players.find(x => x.id === id)!;
        const out = a.eliminated.includes(id);
        return (
          <div key={id} className={`flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold ${out ? 'opacity-40 line-through' : ''}`}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>
            <span className="max-w-[80px] truncate">{p.name}</span>
            {render && <span className="text-ink/70">{render(id)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ a }: { a: ArenaState }) {
  const now = useServerNow(100);
  const def = ARENA_GAMES.find(x => x.id === a.game)!;
  const left = Math.max(0, Math.ceil(((a.startedAt ?? now) - now) / 1000));
  const lastTick = useRef(-1);
  useEffect(() => { if (left !== lastTick.current) { lastTick.current = left; if (left > 0) sfx.countdown(); else sfx.go(); } }, [left]);
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="text-5xl">{def.icon}</div>
      <div className="mt-1 text-2xl font-black">{def.name}</div>
      <div className="mt-1 max-w-md text-sm text-ink/70">{def.desc}</div>
      <motion.div key={left} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`countdown mt-4 ${left === 0 ? 'go' : ''}`}>{left > 0 ? left : '¡YA!'}</motion.div>
      <div className="mt-2 text-xs font-semibold text-ink/50">Preparate…</div>
    </div>
  );
}

function Play({ a, meId }: { a: ArenaState; meId: string | null }) {
  const participating = !!meId && a.players.includes(meId);
  const props = { a, meId, participating };
  const now = useServerNow(200);
  if (a.startedAt && now < a.startedAt) return <Countdown a={a} />;
  switch (a.game as ArenaGame) {
    case 'trivia': return <Trivia {...props} />;
    case 'cana': return <Cana {...props} />;
    case 'barra': return <Barra {...props} />;
    case 'cuantos': return <Cuantos {...props} />;
    case 'bomba': return <Bomba {...props} />;
    case 'sapos': return <Sapos {...props} />;
    case 'oeste': return <Oeste {...props} />;
    case 'rayo': return <Rayo {...props} />;
    case 'penales': return <Penales {...props} />;
    case 'globos': return <Globos {...props} />;
    case 'dibujo': return <Dibujo {...props} />;
    case 'cartas': return <Cartas {...props} />;
    case 'borrosa': return <Borrosa {...props} />;
    case 'cadena': return <Cadena {...props} />;
    case 'ruleta': return <Ruleta {...props} />;
    case 'bomba2': return <Bomba2 {...props} />;
  }
  return null;
}

type GP = { a: ArenaState; meId: string | null; participating: boolean };
const useAct = () => useStore(s => s.act);
const move = (act: ReturnType<typeof useAct>, payload: Record<string, unknown>) => act({ type: 'ARENA_MOVE', payload });

// ---------------------------------------------------------------------------------------
function Trivia({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const q = d.question as { q: string; options: string[] } | undefined;
  const answered = (d.answered ?? {}) as Record<string, number>;
  const mine = meId ? answered[meId] : undefined;
  const state = useStore(s => s.state)!;
  const reveal = (d.reveal ?? null) as number | null;
  const now = useServerNow(250);
  const qLeft = d.questionStartedAt ? Math.max(0, 15 - Math.floor((now - (d.questionStartedAt as number)) / 1000)) : 15;
  return (
    <div>
      <Header a={a} subtitle={`Pregunta ${(d.qIndex ?? 0) + 1} de 3 · 3 puntos por acertar + 2 al primero, +1 al segundo`} />
      <Players a={a} render={id => `${a.scores[id] ?? 0} pts${answered[id] !== undefined ? ' ✔' : ''}`} />
      {q && (
        <motion.div key={d.qIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <div className="relative rounded-2xl bg-slate-800 p-4 text-center text-lg font-bold text-white">
            {q.q}
            {reveal === null && <span className={`absolute right-3 top-2 rounded-full px-2 py-0.5 font-mono text-xs ${qLeft <= 5 ? 'bg-red-500' : 'bg-white/20'}`}>{qLeft}s</span>}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const who = Object.entries(answered).filter(([, v]) => v === i).map(([id]) => state.players.find(p => p.id === id)!).filter(Boolean);
              const isRight = reveal !== null && reveal === i;
              const isWrong = reveal !== null && reveal !== i && who.length > 0;
              return (
                <button key={i} data-answer={i} disabled={!participating || mine !== undefined || reveal !== null}
                  onClick={() => { move(act, { answer: i }); sfx.tick(); }}
                  className={`relative rounded-xl border-2 px-3 py-3 text-left font-semibold transition ${isRight ? 'border-emerald-500 bg-emerald-50 reveal' : isWrong ? 'border-red-300 bg-red-50' : mine === i ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white hover:border-py-blue/50'} disabled:opacity-90`}>
                  <span className={`mr-2 inline-grid h-6 w-6 place-items-center rounded-full text-xs font-black ${isRight ? 'bg-emerald-500 text-white' : isWrong ? 'bg-red-400 text-white' : 'bg-slate-100'}`}>{isRight ? '✔' : isWrong ? '✘' : 'ABCD'[i]}</span>{o}
                  {reveal !== null && who.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {who.map(p => <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${isRight ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}><span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px]" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>{p.name} {isRight ? '✔' : '✘'}</span>)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {reveal !== null ? (
            <div className="mt-2 text-center text-sm font-bold">
              {mine === undefined ? <span className="text-ink/50">No respondiste.</span> : mine === reveal ? <span className="text-emerald-700">¡Acertaste!</span> : <span className="text-red-600">Fallaste.</span>}
              <span className="ml-2 text-ink/50">Siguiente pregunta en un momento…</span>
            </div>
          ) : mine !== undefined && <div className="mt-2 text-center text-xs text-ink/50">Respondiste. Esperando a los demás…</div>}
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Cana({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const [local, setLocal] = useState(0);
  const pending = useRef(0);
  const now = useServerNow(100);
  const left = Math.max(0, 5000 - (now - (a.startedAt ?? now)));
  useEffect(() => {
    const id = setInterval(() => { if (pending.current > 0) { const n = pending.current; pending.current = 0; move(act, { taps: n }); } }, 350);
    return () => clearInterval(id);
  }, [act]);
  const tap = () => { if (left <= 0 || !participating) return; pending.current++; setLocal(n => n + 1); sfx.tick(); };
  const taps = (d.taps ?? {}) as Record<string, number>;
  const mineServer = meId ? taps[meId] ?? 0 : 0;
  return (
    <div>
      <Header a={a} subtitle="¡Tocá lo más rápido que puedas durante 5 segundos!" />
      <Players a={a} render={id => `${id === meId ? Math.max(local, mineServer) : taps[id] ?? 0}`} />
      <div className="mt-4 flex flex-col items-center">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-gradient-to-r from-pink-500 to-orange-400 transition-[width]" style={{ width: `${(left / 5000) * 100}%` }} /></div>
        <button data-tap onPointerDown={tap} disabled={!participating || left <= 0} className="tap-btn mt-4">
          <span className="text-6xl">🍬</span>
          <span className="mt-1 text-4xl font-black tabular-nums">{Math.max(local, mineServer)}</span>
          <span className="text-xs font-semibold opacity-80">{left > 0 ? '¡TOCÁ!' : 'Tiempo'}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Barra({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const attempts = (d.attempts ?? {}) as Record<string, number[]>;
  const mine = meId ? attempts[meId] ?? [] : [];
  const t0 = useRef(Date.now());
  const now = useNow(16);
  const speed = 1.3 + mine.length * 0.5; // más rápido en cada intento
  const pos = (Math.sin(((now - t0.current) / 1000) * speed * Math.PI) + 1) / 2; // 0..1
  const stop = () => { if (!participating || mine.length >= 3) return; const dist = Math.round(Math.abs(pos - 0.5) * 200); move(act, { distance: dist }); sfx.tick(); };
  const best = (arr: number[]) => (arr.length ? Math.min(...arr) : null);
  return (
    <div>
      <Header a={a} subtitle="Frená la aguja en el centro. Tres intentos; cuenta el mejor." />
      <Players a={a} render={id => { const b = best(attempts[id] ?? []); return b === null ? '—' : `mejor: ${b}`; }} />
      <div className="mt-6">
        <div className="bar-track">
          <div className="bar-center" />
          <div className="bar-zone" />
          <div className="bar-needle" style={{ left: `${pos * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold text-ink/40"><span>0</span><span>CENTRO</span><span>0</span></div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        {[0, 1, 2].map(i => <span key={i} className={`grid h-10 w-10 place-items-center rounded-full text-sm font-black ${mine[i] !== undefined ? (mine[i] <= 5 ? 'bg-emerald-500 text-white' : mine[i] <= 20 ? 'bg-amber-400' : 'bg-red-400 text-white') : 'bg-slate-100 text-ink/30'}`}>{mine[i] ?? '·'}</span>)}
        <button data-stop className="btn-primary px-8 py-3 text-lg" disabled={!participating || mine.length >= 3} onClick={stop}>¡FRENÁ!</button>
      </div>
      <div className="mt-2 text-center text-xs text-ink/50">Distancia al centro (0 = perfecto). Gana la menor.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Cuantos({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const answers = (d.answers ?? {}) as Record<string, number>;
  const [v, setV] = useState('');
  const mine = meId ? answers[meId] : undefined;
  return (
    <div>
      <Header a={a} subtitle="Una sola respuesta. Gana quien más se acerca." />
      <Players a={a} render={id => (answers[id] !== undefined ? '✔ respondió' : '…')} />
      <div className="mt-4 rounded-2xl bg-slate-800 p-4 text-center text-lg font-bold text-white">{d.q}{d.unit ? <span className="ml-2 text-sm font-semibold opacity-70">({d.unit})</span> : null}</div>
      {participating && mine === undefined ? (
        <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); if (v.trim() !== '') move(act, { value: Number(v) }); }}>
          <input data-cuantos className="input text-lg font-bold" type="number" inputMode="numeric" placeholder="Tu número" value={v} onChange={e => setV(e.target.value)} autoFocus />
          <button className="btn-primary" type="submit" disabled={v.trim() === ''}>Enviar</button>
        </form>
      ) : <div className="mt-3 text-center text-sm text-ink/60">{mine !== undefined ? <>Dijiste <b>{mine}</b>. Esperando a los demás…</> : 'Mirando…'}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Bomba({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const [w, setW] = useState('');
  const lives = (d.lives ?? {}) as Record<string, number>;
  const used = (d.used ?? []) as string[];
  const myTurn = participating && d.turn === meId;
  const turnP = state.players.find(p => p.id === d.turn);
  const evs = useStore(s => s.arenaEvents);
  const lastFail = [...evs].reverse().find(e => e.type === 'arena_round' && e.data.ok === false && e.playerId === meId);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (myTurn) { setW(''); inputRef.current?.focus(); } }, [myTurn, d.syllable]);
  const t0 = useRef(Date.now());
  useEffect(() => { t0.current = Date.now(); }, [d.turnStartedAt]);
  const now = useNow(100);
  const burn = Math.min(1, (now - t0.current) / 13000);
  return (
    <div>
      <Header a={a} subtitle="Escribí una palabra que contenga la sílaba. Sin acentos, da igual mayúsculas. Dos vidas." />
      <Players a={a} render={id => '❤️'.repeat(Math.max(0, lives[id] ?? 0)) || '💀'} />
      <div className="mt-4 flex flex-col items-center">
        <div className={`bomb ${myTurn ? 'mine' : ''}`}>
          <div className="fuse"><div className="fuse-fill" style={{ width: `${(1 - burn) * 100}%` }} /></div>
          <div className="text-6xl">💣</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-white/70">Nivel {['fácil', 'medio', 'difícil'][d.level ?? 0]}</div>
          <div className="syllable">{d.syllable}</div>
        </div>
        <div className="mt-3 text-sm font-semibold">{myTurn ? <span className="text-red-600">¡Te toca! Rápido…</span> : <>Le toca a <b>{turnP?.name}</b></>}</div>
        {myTurn && (
          <form className="mt-2 flex w-full max-w-md gap-2" onSubmit={e => { e.preventDefault(); if (w.trim()) { move(act, { word: w.trim() }); setW(''); } }}>
            <input ref={inputRef} data-bomb className="input text-lg font-bold uppercase" value={w} onChange={e => setW(e.target.value)} placeholder={`Palabra con ${d.syllable}…`} autoComplete="off" />
            <button className="btn-primary" type="submit">¡Va!</button>
          </form>
        )}
        {myTurn && lastFail && <div className="mt-1 text-xs font-semibold text-red-600">{lastFail.text}</div>}
        {used.length > 0 && <div className="mt-3 flex max-h-16 flex-wrap justify-center gap-1 overflow-hidden text-[11px] text-ink/50">{used.slice(-14).map(u => <span key={u} className="rounded bg-slate-100 px-1.5 py-0.5 uppercase">{u}</span>)}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------
function Sapos({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const track = (d.track ?? []) as number[];
  const lanes = (d.lanes as number) ?? 3;
  const goal = (d.goal as number) ?? 60;
  const laneOf = (d.lane ?? {}) as Record<string, number>;
  const out = (d.out ?? {}) as Record<string, number>;
  const finished = (d.finished ?? []) as string[];
  const now = useServerNow(40);
  const elapsed = now - (a.startedAt ?? now);
  const pos = Math.min(goal, sapoPos(elapsed));
  const myOut = meId ? out[meId] : undefined;
  const myDone = !!meId && finished.includes(meId);
  const canMove = participating && myOut === undefined && !myDone;
  const [localLane, setLocalLane] = useState<number | null>(null);
  const myLane = localLane ?? (meId ? laneOf[meId] ?? 1 : 1);
  useEffect(() => { if (meId && laneOf[meId] !== undefined) setLocalLane(laneOf[meId]); }, [meId, laneOf[meId ?? '']]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = useCallback((dir: -1 | 1) => {
    if (!canMove) return;
    const next = Math.max(0, Math.min(lanes - 1, myLane + dir));
    if (next === myLane) return;
    setLocalLane(next);
    move(act, { lane: next }); sfx.hop();
  }, [act, canMove, lanes, myLane]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);
  const ROWS = 9;
  const first = Math.max(0, Math.floor(pos) - 1);
  const rows = Array.from({ length: ROWS }, (_, i) => first + i).filter(r => r < goal + 2);
  const speedLevel = 1 + Math.floor(elapsed / 3000);
  const frogs = a.players.map(id => ({ id, p: state.players.find(x => x.id === id)!, lane: id === meId ? myLane : laneOf[id] ?? 1, row: out[id] !== undefined ? out[id] : finished.includes(id) ? goal : Math.floor(pos), out: out[id] !== undefined, done: finished.includes(id) }));
  return (
    <div>
      <Header a={a} subtitle={`Los sapos saltan solos y cada vez más rápido (velocidad ${speedLevel}). Vos solo cambiás de carril: ← → (A/D) o los botones. Charco = afuera. Meta: fila ${goal}.`} />
      <Players a={a} render={id => (out[id] !== undefined ? `💦 fila ${out[id] + 1}` : finished.includes(id) ? '🏁' : `fila ${Math.min(goal, Math.floor(pos))}`)} />
      <div className="sapo-track mt-3" style={{ ['--lanes' as string]: lanes }}>
        {rows.slice().reverse().map(r => (
          <div key={r} className={`sapo-row ${r >= goal ? 'goal' : ''}`}>
            {Array.from({ length: lanes }, (_, l) => {
              const puddle = r < goal && track[r] === l;
              const here = frogs.filter(f => f.row === r && f.lane === l);
              return (
                <div key={l} className={`sapo-cell ${puddle ? 'puddle' : ''} ${r >= goal ? 'finish' : ''}`}>
                  {puddle && <span className="puddle-ico">💧</span>}
                  {here.map(f => (
                    <span key={f.id} className={`frog ${f.out ? 'splash' : ''} ${f.id === meId ? 'mine' : ''}`} style={{ ['--c' as string]: f.p.color }} title={f.p.name}>
                      {f.out ? '💦' : '🐸'}
                      {f.id === meId ? <i>vos</i> : here.length <= 2 ? <i>{f.p.name}</i> : null}
                    </span>
                  ))}
                </div>
              );
            })}
            <span className="sapo-rowno">{r < goal ? r + 1 : '🏁'}</span>
          </div>
        ))}
      </div>
      {participating && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button data-sapo-l disabled={!canMove} onPointerDown={() => step(-1)} className="sapo-btn">◀ IZQ</button>
          <button data-sapo-r disabled={!canMove} onPointerDown={() => step(1)} className="sapo-btn">DER ▶</button>
        </div>
      )}
      {myOut !== undefined && <div className="mt-2 text-center text-sm font-bold text-red-600">💦 Caíste en un charco en la fila {myOut + 1}. Mirá cómo termina…</div>}
      {myDone && <div className="mt-2 text-center text-sm font-bold text-emerald-700">🏁 ¡Llegaste a la meta!</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Oeste({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const shots = (d.shots ?? {}) as Record<string, string>;
  const jammed = (d.jammed ?? []) as string[];
  const alive = a.alive;
  const meAlive = participating && alive.includes(meId!);
  const canShoot = meAlive && !shots[meId!] && !jammed.includes(meId!);
  const evs = useStore(s => s.arenaEvents);
  const lastShots = evs.filter(e => e.type === 'arena_round' && e.data.shooter).slice(-3);
  const rivals = alive.filter(id => id !== meId);
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => { if (!target || !rivals.includes(target)) setTarget(rivals[0] ?? null); }, [rivals.join(','), a.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fired, setFired] = useState(false);
  useEffect(() => { setFired(false); }, [a.round]);
  const fire = () => { if (!canShoot || fired || !target) return; setFired(true); move(act, { target }); sfx.drum(); };
  return (
    <div>
      <Header a={a} subtitle={`Ronda ${a.round} · 1) Elegí a quién apuntás. 2) Cuando suene la campana, tocá DISPARAR. El más rápido dispara primero; si tocás antes, se te traba.`} />
      <Players a={a} render={id => (jammed.includes(id) ? '🔧 trabado' : shots[id] ? '🔫 disparó' : alive.includes(id) ? '…' : '💀')} />
      {canShoot && rivals.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-center text-xs font-semibold text-ink/60">🎯 Apuntás a:</div>
          <div className="flex flex-wrap justify-center gap-2">
            {rivals.map(id => { const p = state.players.find(x => x.id === id)!; return (
              <button key={id} data-aim={id} onClick={() => setTarget(id)} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 font-bold ${target === id ? 'border-red-600 bg-red-50' : 'border-black/10 bg-white'}`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-base" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>{p.name}{target === id ? ' 🎯' : ''}
              </button>
            ); })}
          </div>
        </div>
      )}
      <button data-fire data-shoot={target ?? ''} disabled={!canShoot || fired} onPointerDown={fire} className={`oeste-btn mt-4 ${d.go ? 'go' : 'wait'} ${fired ? 'fired' : ''}`}>
        <div className="text-6xl">{d.go ? '🔔' : '🤠'}</div>
        <div className="mt-1 text-3xl font-black text-white">{fired ? (jammed.includes(meId ?? '') ? '🔧 ¡Se trabó!' : '🔫 ¡Disparaste!') : d.go ? '¡¡DISPARAR!!' : 'Quieto… esperá la campana'}</div>
        {!fired && canShoot && <div className="text-xs font-semibold text-white/80">{d.go ? 'Tocá ya' : 'Si tocás antes de la campana, se te traba el revólver'}</div>}
      </button>
      {lastShots.length > 0 && <div className="mt-3 space-y-0.5 text-center text-xs text-ink/60">{lastShots.map(e => <div key={e.id}>{e.text}</div>)}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Rayo({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const size = (d.gridSize as number) ?? 3;
  const picks = (d.picks ?? {}) as Record<string, number>;
  const hits = (d.hits ?? null) as number[] | null;
  const lastPicks = (d.lastPicks ?? {}) as Record<string, number>;
  const [showHits, setShowHits] = useState(false);
  useEffect(() => { if (hits) { setShowHits(true); const t = setTimeout(() => setShowHits(false), 1800); return () => clearTimeout(t); } }, [hits, a.round]);
  const meAlive = participating && a.alive.includes(meId!);
  const mine = meId ? picks[meId] : undefined;
  return (
    <div>
      <Header a={a} subtitle={`Ronda ${a.round} · Elegí una casilla; en 3 segundos caen rayos. El último en pie gana.`} />
      <Players a={a} render={id => (a.alive.includes(id) ? (picks[id] !== undefined ? '✔' : '…') : '⚡💀')} />
      <div className="mx-auto mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, maxWidth: size * 110 }}>
        {Array.from({ length: size * size }, (_, i) => {
          const struck = showHits && hits?.includes(i);
          const standing = showHits ? Object.entries(lastPicks).filter(([, c]) => c === i).map(([id]) => state.players.find(p => p.id === id)!) : Object.entries(picks).filter(([id, c]) => c === i && id === meId).map(([id]) => state.players.find(p => p.id === id)!);
          return (
            <button key={i} data-cell={i} disabled={!meAlive || showHits} onClick={() => { move(act, { cell: i }); sfx.tick(); }}
              className={`rayo-cell ${mine === i ? 'picked' : ''} ${struck ? 'struck' : ''}`}>
              {struck && <span className="bolt">⚡</span>}
              <span className="flex flex-wrap justify-center gap-0.5">{standing.map(p => <span key={p.id} className="grid h-6 w-6 place-items-center rounded-full bg-white text-sm" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Penales({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const shots = (d.shots ?? {}) as Record<string, { power: number; dir: number; keeper: number; goal: boolean }[]>;
  const goals = (d.goals ?? {}) as Record<string, number>;
  const mine = meId ? shots[meId] ?? [] : [];
  const [stage, setStage] = useState<'power' | 'dir' | 'anim'>('power');
  const [power, setPower] = useState<number | null>(null);
  const t0 = useRef(Date.now());
  const now = useNow(16);
  const t = (now - t0.current) / 1000;
  const livePower = (Math.sin(t * 2.6 * Math.PI - Math.PI / 2) + 1) / 2 * 100;
  const liveDir = Math.sin(t * 1.9 * Math.PI);
  const last = mine[mine.length - 1];
  const click = () => {
    if (!participating || mine.length >= 3 || stage === 'anim') return;
    if (stage === 'power') { setPower(Math.round(livePower)); setStage('dir'); sfx.tick(); return; }
    move(act, { power, dir: Number(liveDir.toFixed(2)) }); setStage('anim'); sfx.whoosh();
    setTimeout(() => { setStage('power'); setPower(null); }, 1400);
  };
  return (
    <div>
      <Header a={a} subtitle="Tres penales. Primer toque: fuerza (ni flojo ni por arriba). Segundo: dirección." />
      <Players a={a} render={id => `${'⚽'.repeat(goals[id] ?? 0)}${'·'.repeat(Math.max(0, (shots[id]?.length ?? 0) - (goals[id] ?? 0)))} (${shots[id]?.length ?? 0}/3)`} />
      <div className="goal mt-4" onPointerDown={click} data-kick>
        <div className="net" />
        <div className={`keeper ${stage === 'anim' && last ? `dive-${last.keeper}` : ''}`}>🧤</div>
        {stage === 'anim' && last && <div className={`ball zone-${last.dir < -0.33 ? 0 : last.dir > 0.33 ? 2 : 1} ${last.goal ? 'in' : last.power > 92 ? 'over' : last.power < 35 ? 'weak' : 'saved'}`}>⚽</div>}
        {stage !== 'anim' && <div className="aim" style={{ left: `${50 + (stage === 'dir' ? liveDir : 0) * 40}%` }}>🎯</div>}
        {stage === 'anim' && last && <div className={`kick-result ${last.goal ? 'ok' : 'bad'}`}>{last.goal ? '¡GOOOL!' : last.power > 92 ? '¡Afuera!' : last.power < 35 ? 'Muy flojo' : '¡Atajó!'}</div>}
      </div>
      <div className="mt-3">
        <div className="power-track"><div className="power-fill" style={{ width: `${power ?? livePower}%` }} /><div className="power-sweet" /></div>
        <div className="mt-1 flex justify-between text-[10px] font-bold text-ink/40"><span>flojo</span><span>zona ideal</span><span>por arriba</span></div>
      </div>
      {participating && mine.length < 3 && <div className="mt-2 text-center text-sm font-semibold">{stage === 'power' ? 'Tocá el arco para fijar la FUERZA' : stage === 'dir' ? 'Tocá para fijar la DIRECCIÓN y patear' : '…'}</div>}
      {participating && mine.length >= 3 && <div className="mt-2 text-center text-sm text-ink/60">Ya pateaste tus tres. Esperando…</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Globos({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const n = (d.balloons as number) ?? 4;
  const popped = (d.popped ?? []) as number[];
  const myTurn = participating && d.turn === meId && a.alive.includes(meId!);
  const turnP = state.players.find(p => p.id === d.turn);
  const evs = useStore(s => s.arenaEvents);
  const lastPop = [...evs].reverse().find(e => e.type === 'arena_round' && e.data.balloon !== undefined);
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
  return (
    <div>
      <Header a={a} subtitle={`Un globo esconde la aguja. Por turnos, cada uno pincha uno. Quien encuentra la aguja queda afuera 💥, se inflan ${a.alive.length} globos de nuevo y siguen los demás, hasta que quede uno.`} />
      <Players a={a} render={id => (a.alive.includes(id) ? (d.turn === id ? '👉' : '') : '💥')} />
      <div className="mt-2 text-center text-sm font-semibold">{myTurn ? <span className="text-red-600">¡Te toca pinchar!</span> : <>Le toca a <b>{turnP?.name}</b></>}</div>
      <div className="mt-4 flex flex-wrap items-end justify-center gap-4">
        {Array.from({ length: n }, (_, i) => {
          const gone = popped.includes(i);
          return (
            <button key={`${a.round}-${d.balloons}-${i}`} data-balloon={i} disabled={!myTurn || gone} onClick={() => { move(act, { balloon: i }); sfx.tick(); }} className={`balloon ${gone ? 'popped' : ''} ${myTurn && !gone ? 'hover' : ''}`} style={{ ['--b' as string]: colors[i % colors.length], animationDelay: `${i * 0.3}s` }}>
              <span className="body">{gone ? '💥' : ''}</span>
              <span className="string" />
            </button>
          );
        })}
      </div>
      {lastPop && <div className={`mt-3 text-center text-sm font-bold ${lastPop.data.needle ? 'text-red-600' : 'text-ink/60'}`}>{lastPop.text}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
type Stroke = { points: number[]; color: string; width: number; clear?: boolean };
function Dibujo({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const drawer = state.players.find(p => p.id === d.drawer);
  const isDrawer = meId === d.drawer;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState('#111827');
  const [width, setWidth] = useState(6);
  const [guess, setGuess] = useState('');
  const guesses = (d.guesses ?? []) as { id: string; guess: string }[];

  const redraw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      if (s.clear) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); continue; }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width * (c.width / 600);
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) { const x = s.points[i] * c.width, y = s.points[i + 1] * c.height; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, []);
  useEffect(() => {
    const onStroke = (s: Stroke) => { if (s.clear) strokes.current = []; else strokes.current.push(s); redraw(); };
    socket.on('arena:stroke', onStroke);
    return () => { socket.off('arena:stroke', onStroke); };
  }, [redraw]);
  useEffect(() => { redraw(); }, [redraw]);

  const pt = (e: React.PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const down = (e: React.PointerEvent) => { if (!isDrawer) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); current.current = { points: pt(e), color, width }; };
  const moveP = (e: React.PointerEvent) => { if (!isDrawer || !current.current) return; current.current.points.push(...pt(e)); if (current.current.points.length > 380) up(); else redraw(); };
  const up = () => { if (!isDrawer || !current.current) return; const s = current.current; current.current = null; strokes.current.push(s); socket.emit('arena:stroke', s); redraw(); };
  const clear = () => { strokes.current = []; redraw(); socket.emit('arena:stroke', { points: [], color, width, clear: true }); };
  const evs = useStore(s => s.arenaEvents);
  const mine = useStore(s => s.state?.mine);
  void mine;
  const secretWord = isDrawer ? [...evs].reverse().find(e => e.type === 'arena_start')?.data?.word : null;
  void secretWord;

  return (
    <div>
      <Header a={a} subtitle={isDrawer ? 'Vos dibujás. ¡Sin letras ni números!' : `${drawer?.name} dibuja. Escribí lo que creés que es.`} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="font-mono text-lg font-black tracking-[0.3em]">{isDrawer ? <DrawerWord /> : d.hint}</div>
        {isDrawer && (
          <div className="flex items-center gap-1">
            {['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#a855f7'].map(c => <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} />)}
            <button onClick={() => setWidth(w => (w >= 14 ? 4 : w + 5))} className="btn-ghost btn-sm !px-2">✏️ {width}</button>
            <button onClick={clear} className="btn-ghost btn-sm !px-2">🧹</button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} width={600} height={400} className={`draw-canvas mt-2 ${isDrawer ? 'cursor-crosshair' : ''}`} onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerLeave={up} data-canvas />
      {!isDrawer && participating && (
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (guess.trim()) { move(act, { guess: guess.trim() }); setGuess(''); } }}>
          <input data-guess className="input" value={guess} onChange={e => setGuess(e.target.value)} placeholder="¿Qué es?" autoComplete="off" />
          <button className="btn-primary" type="submit">Adivinar</button>
        </form>
      )}
      {guesses.length > 0 && <div className="mt-2 flex flex-wrap gap-1 text-xs">{guesses.slice(-8).map((g, i) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5"><b>{state.players.find(p => p.id === g.id)?.name}</b>: {g.guess}</span>)}</div>}
    </div>
  );
}

function DrawerWord() {
  // El servidor solo revela la palabra al dibujante a través de su vista privada (state.mine.drawWord)
  const word = useStore(s => (s.state?.mine as { drawWord?: string } | null)?.drawWord);
  return <span className="text-py-red">{word ? word.toUpperCase() : '…'}</span>;
}


// ---------------------------------------------------------------------------------------
function StageTimer({ from, ms }: { from: number | null | undefined; ms: number }) {
  const now = useServerNow(250);
  if (!from) return null;
  const left = Math.max(0, Math.ceil((from + ms - now) / 1000));
  return <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${left <= 5 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-ink/60'}`}>{left}s</span>;
}

// ---------------------------------------------------------------------------------------
function Cartas({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const hand = useStore(s => s.state?.mine?.arenaHand ?? null);
  const judge = state.players.find(p => p.id === d.judge);
  const isJudge = meId === d.judge;
  const picked = ((d.pickedIds ?? []) as string[]).includes(meId ?? '');
  const played = (d.played ?? []) as string[];
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSel(null); }, [d.round, d.stage]);
  const fill = (card: string) => (d.black as string).includes('____') ? (d.black as string).replace('____', card) : `${d.black} ${card}`;
  return (
    <div>
      <Header a={a} subtitle={`Ronda ${d.round} de ${d.rounds} · Juez: ${judge?.name}. ${isJudge ? 'Esperá las cartas y elegí la más graciosa.' : 'Completá la frase con la carta más graciosa de tu mano.'}`} />
      <Players a={a} render={id => `${a.scores[id] ?? 0} pt${id === d.judge ? ' 👨‍⚖️' : ((d.pickedIds ?? []) as string[]).includes(id) ? ' ✔' : ''}`} />
      <div className="mt-3 flex items-start gap-2">
        <div className="black-card">{d.black}</div>
        <div className="shrink-0 pt-1"><StageTimer from={d.stageAt} ms={d.stage === 'pick' ? 35000 : d.stage === 'judge' ? 25000 : 4000} /></div>
      </div>
      {d.stage === 'pick' && !isJudge && participating && hand && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-bold text-ink/60">{picked ? 'Ya jugaste. Esperando a los demás…' : 'Tu mano (tocá una carta y confirmá):'}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {hand.map((c, i) => <button key={i} data-white={i} disabled={picked} onClick={() => setSel(i)} className={`white-card ${sel === i ? 'picked' : ''}`}>{c}</button>)}
          </div>
          {sel !== null && !picked && <div className="mt-2 rounded-xl bg-slate-100 p-2 text-sm italic">"{fill(hand[sel])}"</div>}
          <button data-play-card className="btn-primary mt-2 w-full" disabled={sel === null || picked} onClick={() => { move(act, { card: sel }); sfx.card(); }}>Jugar esta carta</button>
        </div>
      )}
      {d.stage === 'pick' && (isJudge || !participating) && <div className="mt-4 text-center text-sm text-ink/60 animate-pulse">Los demás están eligiendo su carta… ({((d.pickedIds ?? []) as string[]).length}/{a.players.length - 1})</div>}
      {d.stage === 'judge' && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-bold text-ink/60">{isJudge ? 'Elegí la más graciosa (no sabés de quién es):' : `${judge?.name} está eligiendo…`}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {played.map((c, i) => <button key={i} data-judge-pick={i} disabled={!isJudge} onClick={() => { move(act, { pick: i }); sfx.win(); }} className={`white-card text-left ${isJudge ? 'hover:border-py-red' : ''}`}><span className="text-ink/50">{fill(c)}</span></button>)}
          </div>
        </div>
      )}
      {d.stage === 'result' && d.lastWin && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 rounded-2xl bg-amber-50 p-4 text-center">
          <div className="text-xs font-bold uppercase text-amber-700">Ganó la ronda</div>
          <div className="mt-1 text-lg font-black">"{fill((d.lastWin as D).text)}"</div>
          <div className="mt-1 text-sm">de <b>{state.players.find(p => p.id === (d.lastWin as D).winner)?.name}</b> 🏅</div>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Borrosa({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const now = useServerNow(80);
  const answered = (d.answered ?? {}) as Record<string, number>;
  const reveal = (d.reveal ?? null) as number | null;
  const started = (d.roundStartedAt as number | null) ?? now;
  const t = Math.min(1, Math.max(0, (now - started) / 12000));
  const blur = reveal !== null ? 0 : Math.max(0, 28 * (1 - t));
  const mine = meId ? answered[meId] : undefined;
  const canAnswer = participating && mine === undefined && reveal === null;
  return (
    <div>
      <Header a={a} subtitle={`Imagen ${(d.qIndex ?? 0) + 1} de ${d.rounds} · Se destapa en 12 s. El primero que toca la respuesta correcta gana 3 puntos; si errás, quedás afuera de esta imagen.`} />
      <Players a={a} render={id => `${a.scores[id] ?? 0} pts${answered[id] === undefined ? '' : reveal !== null && answered[id] === reveal ? ' ✔' : ' ✘ falló'}`} />
      <div className="mt-3 flex items-center justify-center">
        <div className="blur-box"><span style={{ filter: `blur(${blur}px)`, transform: `scale(${1 + (1 - t) * 0.3})` }}>{d.emoji}</span></div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {((d.options ?? []) as string[]).map((o, i) => {
          const who = Object.entries(answered).filter(([, v]) => v === i).map(([id]) => state.players.find(p => p.id === id)!);
          const right = reveal === i;
          return (
            <button key={i} data-blur-opt={i} disabled={!canAnswer} onClick={() => { move(act, { answer: i }); sfx.tick(); }}
              className={`rounded-xl border-2 px-3 py-3 text-left font-semibold ${right ? 'border-emerald-500 bg-emerald-50' : mine === i ? 'border-red-400 bg-red-50' : 'border-black/10 bg-white hover:border-py-blue/50'} disabled:opacity-80`}>
              {o}
              {who.length > 0 && <span className="ml-2 inline-flex gap-1 align-middle">{who.map(p => <span key={p.id} className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px]" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>)}</span>}
            </button>
          );
        })}
      </div>
      {reveal !== null && <div className="mt-2 text-center text-sm font-bold">{d.winner ? <span className="text-emerald-700">🏅 {state.players.find(p => p.id === d.winner)?.name} adivinó primero</span> : <span className="text-ink/60">Nadie adivinó</span>}</div>}
      {mine !== undefined && reveal === null && <div className="mt-2 text-center text-xs text-red-600">Fallaste: quedás afuera de esta imagen.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Cadena({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const shown = (d.shown ?? []) as string[];
  const orders = (d.orders ?? {}) as Record<string, number[]>;
  const reveal = (d.reveal ?? null) as number[] | null;
  const results = (d.results ?? null) as Record<string, number> | null;
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => { setOrder([]); }, [d.qIndex]);
  const mine = meId ? orders[meId] : undefined;
  const done = !!mine;
  const toggle = (i: number) => { if (done || reveal) return; setOrder(o => (o.includes(i) ? o.filter(x => x !== i) : [...o, i])); sfx.tick(); };
  return (
    <div>
      <Header a={a} subtitle={`Cadena ${(d.qIndex ?? 0) + 1} de ${d.rounds} · Tocá las cuatro en el orden correcto (1º, 2º, 3º, 4º). Un punto por cada posición bien.`} />
      <Players a={a} render={id => `${a.scores[id] ?? 0} pts${results ? ` (+${results[id] ?? 0})` : orders[id] ? ' ✔' : ''}`} />
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-800 p-4 text-white">
        <div className="text-lg font-bold">🔗 {d.title}</div>
        {!reveal && <StageTimer from={d.roundStartedAt} ms={25000} />}
      </div>
      {reveal && <div className="mt-2 text-center text-xs font-bold text-emerald-700">El círculo verde muestra el orden correcto; la etiqueta, lo que pusiste vos.</div>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {shown.map((item, i) => {
          const pos = reveal ? reveal.indexOf(i) : (mine ? mine.indexOf(i) : order.indexOf(i));
          const ok = reveal && mine ? mine[reveal.indexOf(i)] === i : null;
          return (
            <button key={i} data-chain={i} disabled={done || !!reveal || !participating} onClick={() => toggle(i)}
              className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left font-semibold ${reveal ? (ok ? 'border-emerald-500 bg-emerald-50' : 'border-red-300 bg-red-50') : pos >= 0 ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${reveal ? 'bg-emerald-600 text-white' : pos >= 0 ? 'bg-py-blue text-white' : 'bg-slate-100 text-ink/40'}`}
                title={reveal ? 'Posición correcta' : 'Tu posición'}>{pos >= 0 ? `${pos + 1}º` : '·'}</span>
              <span className="flex-1">{item}</span>
              {reveal && mine && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>vos: {mine.indexOf(i) + 1}º {ok ? '✔' : '✘'}</span>}
            </button>
          );
        })}
      </div>
      {!done && !reveal && participating && <button data-send-chain className="btn-primary mt-3 w-full" disabled={order.length !== shown.length} onClick={() => move(act, { order })}>Confirmar orden {order.length}/{shown.length}</button>}
      {done && !reveal && <div className="mt-2 text-center text-sm text-ink/60">Listo. Esperando a los demás…</div>}
      {reveal && results && <div className="mt-2 text-center text-sm font-bold">{a.players.map(id => `${state.players.find(p => p.id === id)?.name}: ${results[id]}/4`).join(' · ')}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Ruleta({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const myTurn = participating && d.turn === meId && a.alive.includes(meId!);
  const turnP = state.players.find(p => p.id === d.turn);
  const passes = (d.passes ?? {}) as Record<string, number>;
  const evs = useStore(s => s.arenaEvents);
  const last = [...evs].reverse().find(e => e.type === 'arena_round' && e.data.bang !== undefined);
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (last?.data.bang) { setFlash(true); const t = setTimeout(() => setFlash(false), 900); return () => clearTimeout(t); } }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clicks = (d.clicks as number) ?? 0;
  const chance = Math.round((1 / (6 - clicks)) * 100);
  return (
    <div className={flash ? 'shake-hard' : ''}>
      <Header a={a} subtitle="Un revólver, seis recámaras, una bala. Cada clic vacío sube la probabilidad. Apretá, girá el tambor (vuelve a 1 en 6) o pasá (una sola vez). Último en pie gana." />
      <Players a={a} render={id => (a.alive.includes(id) ? `${d.turn === id ? '👉 ' : ''}${passes[id] > 0 ? 'con pase' : 'sin pase'}` : '💀 afuera')} />
      <div className={`mt-4 rounded-2xl p-5 text-center text-white ${flash ? 'bg-red-700' : 'bg-slate-900'}`}>
        <div className="text-6xl">{flash ? '💥' : '🔫'}</div>
        <div className="mt-2 flex justify-center gap-2">{Array.from({ length: 6 }, (_, i) => <span key={i} className={`chamber ${i < clicks ? 'used' : ''}`} />)}</div>
        <div className="mt-2 text-sm">{clicks} clic{clicks === 1 ? '' : 's'} vacío{clicks === 1 ? '' : 's'} · próxima: <b className={chance >= 34 ? 'text-red-400' : 'text-emerald-300'}>{chance} %</b> de bala</div>
        <div className="mt-2 text-sm font-bold text-yellow-300">{myTurn ? '¡Te toca!' : `Turno de ${turnP?.name}…`}</div>
        {last && <div className="mt-1 text-xs text-white/70">{last.text}</div>}
      </div>
      {myTurn && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button data-ruleta="shoot" className="duel-btn opp" onClick={() => { move(act, { kind: 'shoot' }); sfx.drum(); }}>🔫 Apretar<span className="text-xs font-semibold opacity-80">{chance} % de bala</span></button>
          <button data-ruleta="spin" className="duel-btn self" onClick={() => { move(act, { kind: 'spin' }); sfx.whoosh(); }}>🔄 Girar y apretar<span className="text-xs font-semibold opacity-80">vuelve a 17 %</span></button>
          <button data-ruleta="pass" className="duel-btn" style={{ background: passes[meId!] > 0 ? '#475569' : '#94a3b8' }} disabled={!(passes[meId!] > 0)} onClick={() => move(act, { kind: 'pass' })}>🎟️ Pasar<span className="text-xs font-semibold opacity-80">{passes[meId!] > 0 ? 'una sola vez' : 'ya lo usaste'}</span></button>
        </div>
      )}
      {!myTurn && <StageTimer from={d.turnStartedAt} ms={12000} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
const WIRE = [{ n: 'rojo', c: '#dc2626' }, { n: 'azul', c: '#2563eb' }, { n: 'verde', c: '#16a34a' }, { n: 'amarillo', c: '#eab308' }];
function Bomba2({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const sab = state.players.find(p => p.id === d.saboteur);
  const isSab = meId === d.saboteur;
  const cuts = (d.cuts ?? {}) as Record<string, number>;
  const reveal = (d.reveal ?? null) as { trap: number; cuts: Record<string, number>; blown: string[] } | null;
  const alive = participating && a.alive.includes(meId!);
  const canPlant = isSab && d.stage === 'plant';
  const canCut = !isSab && alive && d.stage === 'cut' && cuts[meId!] === undefined;
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => { setChosen(null); }, [d.round, d.stage]);
  return (
    <div>
      <Header a={a} subtitle={`Ronda ${d.round} de ${d.rounds} · Saboteador: ${sab?.name}. ${isSab ? 'Elegí en secreto qué cable es la trampa.' : 'Cortá un cable. Si es la trampa, volás.'} Puntos: saboteador +1 por cada uno que vuela; desactivador +1 por ronda que sobrevive.`} />
      <Players a={a} render={id => (id === d.saboteur ? `🧨 saboteador · ${a.scores[id] ?? 0} pt` : a.alive.includes(id) ? `${a.scores[id] ?? 0} pt${cuts[id] !== undefined && d.stage === 'cut' ? ' ✂️ cortó' : ''}` : '💀 voló')} />
      <div className={`mt-4 rounded-2xl p-4 text-center text-white ${d.stage === 'reveal' && reveal?.blown.length ? 'bg-red-700' : 'bg-slate-900'}`}>
        <div className="text-5xl">{d.stage === 'reveal' ? (reveal?.blown.length ? '💥' : '😮‍💨') : '🧨'}</div>
        <div className="mt-1 text-sm font-bold">
          {d.stage === 'plant' && (isSab ? 'Elegí el cable trampa' : `${sab?.name} está plantando la trampa…`)}
          {d.stage === 'cut' && (isSab ? 'Están cortando cables…' : canCut ? '¡Cortá un cable!' : 'Ya cortaste. Esperando…')}
          {d.stage === 'reveal' && reveal && (reveal.blown.length ? `El cable trampa era el ${WIRE[reveal.trap].n}. Volaron: ${reveal.blown.map(id => state.players.find(p => p.id === id)?.name).join(', ')}` : `El cable trampa era el ${WIRE[reveal.trap].n}. ¡Todos a salvo!`)}
        </div>
        <div className="mt-1"><StageTimer from={d.stageAt} ms={d.stage === 'plant' ? 12000 : d.stage === 'cut' ? 15000 : 4000} /></div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {WIRE.map((w, i) => {
          const who = d.stage === 'reveal' && reveal ? Object.entries(reveal.cuts).filter(([, v]) => v === i).map(([id]) => state.players.find(p => p.id === id)!) : [];
          const trap = d.stage === 'reveal' && reveal?.trap === i;
          return (
            <button key={i} data-wire={i} disabled={!(canPlant || canCut)} onClick={() => { setChosen(i); move(act, { wire: i }); sfx.tick(); }}
              className={`wire ${chosen === i ? 'chosen' : ''} ${trap ? 'trap' : ''}`} style={{ ['--w' as string]: w.c }}>
              <span className="wire-line" />
              <span className="text-xs font-black capitalize">{w.n}</span>
              {trap && <span className="text-lg">💣</span>}
              <span className="flex flex-wrap justify-center gap-0.5">{who.map(p => <span key={p.id} className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
function Podium({ a }: { a: ArenaState }) {
  const state = useStore(s => s.state)!;
  const ranking = a.ranking ?? [];
  const rewards = a.rewards ?? {};
  const def = ARENA_GAMES.find(x => x.id === a.game)!;
  const top = ranking.slice(0, 3);
  const order = [1, 0, 2].filter(i => i < top.length);
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-ink/50">{def.icon} {def.name}</div>
      <div className="text-3xl font-black">🏆 Resultados de la Arena</div>
      <div className="mt-6 flex items-end justify-center gap-3">
        {order.map(i => {
          const p = state.players.find(x => x.id === top[i])!;
          const r = rewards[p.id] ?? 0;
          return (
            <motion.div key={p.id} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i === 0 ? 0.5 : i === 1 ? 0.2 : 0.35, type: 'spring', stiffness: 260, damping: 20 }} className="flex flex-col items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-2xl" style={{ boxShadow: `0 0 0 3px ${p.color}` }}>{tokenEmoji(p.token)}</span>
              <b className="mt-1 max-w-[100px] truncate text-sm">{p.name}</b>
              <div className={`podium podium-${i}`}>{['🥇', '🥈', '🥉'][i]}<div className="text-xs font-black">{r ? `+${money(r)}` : ''}</div></div>
            </motion.div>
          );
        })}
      </div>
      {(a.data as D).doubled && <div className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">⚡ ¡Remontada! {state.players.find(p => p.id === (a.data as D).doubled)?.name} tenía menos efectivo y cobra el doble</div>}
      {a.game === 'cuantos' && (
        <div className="mx-auto mt-4 max-w-md rounded-xl bg-slate-100 p-3 text-sm">
          <div className="text-xs text-ink/60">{String((a.data as D).q)}</div>
          <div className="mt-1 text-lg font-black text-emerald-700">Respuesta correcta: {String((a.data as D).answer)} {String((a.data as D).unit ?? '')}</div>
          <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs">
            {a.players.map(id => { const v = ((a.data as D).answers ?? {})[id]; const p = state.players.find(x => x.id === id)!; return <span key={id} className="rounded-full bg-white px-2 py-0.5"><b>{p.name}</b>: {v === undefined ? '—' : v}</span>; })}
          </div>
        </div>
      )}
      {a.game === 'dibujo' && (a.data as D).word && <div className="mt-3 text-sm">La palabra era <b className="text-py-red">{String((a.data as D).word).toUpperCase()}</b></div>}
      {ranking.length > 3 && <div className="mt-3 text-xs text-ink/50">Después: {ranking.slice(3).map(id => state.players.find(p => p.id === id)?.name).join(', ')}</div>}
      <div className="mt-4 text-xs text-ink/50">La partida sigue en unos segundos…</div>
    </div>
  );
}
