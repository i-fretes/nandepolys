import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ARENA_GAMES, ARENA_REWARDS, type ArenaGame, type ArenaState } from '@nandepoly/engine';
import { useMe, useStore } from '../store';
import { money, tokenEmoji } from '../format';
import { socket } from '../socket';
import { sfx } from '../sound';

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function useNow(ms = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** La Arena: votación, los 11 mini-juegos y el podio. Todos los jugadores participan a la vez. */
export default function ArenaDialog() {
  const state = useStore(s => s.state)!;
  const me = useMe();
  const a = state.arena;
  const open = state.turnPhase === 'ARENA' && !!a;
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
  const startedAt = useRef(Date.now());
  useEffect(() => { startedAt.current = Date.now(); }, [a.game]);
  const now = useNow(250);
  const left = Math.max(0, def.seconds - Math.floor((now - startedAt.current) / 1000));
  const showTimer = a.game !== 'bomba' && a.game !== 'oeste' && a.game !== 'rayo' && a.game !== 'globos';
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

function Play({ a, meId }: { a: ArenaState; meId: string | null }) {
  const participating = !!meId && a.players.includes(meId);
  const props = { a, meId, participating };
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
  const evs = useStore(s => s.arenaEvents);
  const reveal = [...evs].reverse().find(e => e.type === 'arena_round' && e.data.reveal !== undefined && e.id > (a.round ?? 0));
  void reveal;
  return (
    <div>
      <Header a={a} subtitle={`Pregunta ${(d.qIndex ?? 0) + 1} de 3 · 15 s cada una · 3 puntos + bonus por rapidez`} />
      <Players a={a} render={id => `${a.scores[id] ?? 0} pts${answered[id] !== undefined ? ' ✔' : ''}`} />
      {q && (
        <motion.div key={d.qIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <div className="rounded-2xl bg-slate-800 p-4 text-center text-lg font-bold text-white">{q.q}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, i) => (
              <button key={i} data-answer={i} disabled={!participating || mine !== undefined}
                onClick={() => move(act, { answer: i })}
                className={`rounded-xl border-2 px-3 py-3 text-left font-semibold transition ${mine === i ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white hover:border-py-blue/50'} disabled:opacity-70`}>
                <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-black">{'ABCD'[i]}</span>{o}
              </button>
            ))}
          </div>
          {mine !== undefined && <div className="mt-2 text-center text-xs text-ink/50">Respondiste. Esperando a los demás…</div>}
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
  const start = useRef(Date.now());
  const now = useNow(100);
  const left = Math.max(0, 5000 - (now - start.current));
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
function Sapos({ a, meId, participating }: GP) {
  const act = useAct();
  const d = a.data as D;
  const state = useStore(s => s.state)!;
  const pos = (d.pos ?? {}) as Record<string, number>;
  const finished = (d.finished ?? []) as string[];
  const goal = (d.goal as number) ?? 30;
  const puddles = (d.puddles ?? []) as number[];
  const lastSide = useRef<string | null>(null);
  const [flash, setFlash] = useState<'L' | 'R' | null>(null);
  const step = useCallback((side: 'L' | 'R') => {
    if (!participating || finished.includes(meId!)) return;
    if (lastSide.current === side) { setFlash(side); setTimeout(() => setFlash(null), 150); sfx.pay(); return; }
    lastSide.current = side;
    move(act, { side }); sfx.hop();
  }, [act, participating, finished, meId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault(); step('L'); }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault(); step('R'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);
  const t0 = useRef(Date.now());
  const now = useNow(500);
  const level = Math.floor((now - t0.current) / 3000);
  return (
    <div>
      <Header a={a} subtitle={`Alterná ← → (o A / D). Repetir el mismo lado te frena. Charcos te resbalan. Velocidad: nivel ${level + 1}`} />
      <div className="mt-3 space-y-1.5">
        {a.players.map(id => {
          const p = state.players.find(x => x.id === id)!;
          const pct = Math.min(100, ((pos[id] ?? 0) / goal) * 100);
          const place = finished.indexOf(id);
          return (
            <div key={id} className="race-lane sapo-lane">
              {puddles.map(c => <span key={c} className="puddle" style={{ left: `${(c / goal) * 100}%` }}>💧</span>)}
              <span className="finish" />
              <span className="race-cart" style={{ left: `calc(${pct}% - ${pct > 90 ? 26 : 0}px)` }} title={p.name}>🐸</span>
              <span className="absolute left-1 top-1/2 -translate-y-1/2 rounded bg-white/80 px-1 text-[10px] font-bold" style={{ color: p.color }}>{p.name}{place >= 0 ? ` · ${place + 1}º 🏁` : ''}</span>
            </div>
          );
        })}
      </div>
      {participating && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button data-sapo-l onPointerDown={() => step('L')} className={`sapo-btn ${flash === 'L' ? 'bad' : ''}`}>◀ IZQ</button>
          <button data-sapo-r onPointerDown={() => step('R')} className={`sapo-btn ${flash === 'R' ? 'bad' : ''}`}>DER ▶</button>
        </div>
      )}
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
  return (
    <div>
      <Header a={a} subtitle={`Ronda ${a.round} · Esperá la campana. Si disparás antes, se te traba el revólver.`} />
      <Players a={a} render={id => (jammed.includes(id) ? '🔧 trabado' : shots[id] ? '🔫 disparó' : alive.includes(id) ? '…' : '💀')} />
      <div className={`mt-4 rounded-2xl p-6 text-center ${d.go ? 'oeste-go' : 'oeste-wait'}`}>
        <div className="text-5xl">{d.go ? '🔔' : '🤠'}</div>
        <div className="mt-1 text-2xl font-black text-white">{d.go ? '¡¡DISPAREN!!' : 'Quietos… esperen la campana'}</div>
      </div>
      {canShoot && (
        <div className="mt-3">
          <div className="mb-1 text-center text-xs font-semibold text-ink/60">{d.go ? 'Elegí a quién disparar' : 'Elegí a quién vas a disparar (¡pero no toques hasta la campana!)'}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {alive.filter(id => id !== meId).map(id => { const p = state.players.find(x => x.id === id)!; return (
              <button key={id} data-shoot={id} onClick={() => move(act, { target: id })} className="flex items-center gap-2 rounded-xl border-2 border-black/10 bg-white px-3 py-2 font-bold hover:border-red-500">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-base" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>{p.name} 🎯
              </button>
            ); })}
          </div>
        </div>
      )}
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
      <Header a={a} subtitle="Un globo esconde la aguja. Por turnos, pinchá uno. El que la encuentra queda afuera." />
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
      {ranking.length > 3 && <div className="mt-3 text-xs text-ink/50">Después: {ranking.slice(3).map(id => state.players.find(p => p.id === id)?.name).join(', ')}</div>}
      <div className="mt-4 text-xs text-ink/50">La partida sigue en unos segundos…</div>
    </div>
  );
}
