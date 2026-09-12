import { useEffect, useMemo, useRef, useState } from 'react';
import { CARRETA_PAYOUT, DOUBLE_MAX_STEPS, QUINIELA_PAYOUT, RULETA_WIN_CHANCE } from '@nandepoly/engine';
import { useMoving, useStore } from '../store';
import { useReelSpin } from './reel';
import { money } from '../format';
import { sfx } from '../sound';
import Modal from './Modal';
import { Die3D } from './Dice';

type Game = 'ruleta' | 'quiniela' | 'doble' | 'carrera';
const GAMES: { id: Game; name: string; icon: string; desc: string }[] = [
  { id: 'ruleta', name: 'Ruleta', icon: '🎡', desc: `${RULETA_WIN_CHANCE} % ganás lo apostado · ${100 - RULETA_WIN_CHANCE} % lo perdés (la banca tiene ventaja)` },
  { id: 'quiniela', name: 'Quiniela', icon: '🎟️', desc: `Elegí la suma de los dados. El 7 paga ${QUINIELA_PAYOUT[7]} veces, el 2 y el 12 pagan ${QUINIELA_PAYOUT[2]}.` },
  { id: 'doble', name: 'Doble o nada', icon: '🪙', desc: 'Par dobla, impar perdés todo. Retirate cuando quieras, hasta 4 pasos (×16).' },
  { id: 'carrera', name: 'Carrera de carretas', icon: '🛺', desc: `Seis carretas, elegí una. Paga ${CARRETA_PAYOUT} a 1.` },
];
const CARTS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠'];

export default function CasinoDialog() {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const act = useStore(s => s.act);
  const last = useStore(s => s.lastCasino);
  const c = state.casino;
  const moving = useMoving();
  const open = state.turnPhase === 'CASINO' && !!c && !moving;
  // La mesa está abierta para todos: yo juego lo mío, y veo cómo van los demás
  const atTable = !!c && !!me && c.players.includes(me);
  const iPassed = !!c && !!me && !!c.passed[me];
  const mine = atTable && !iPassed;
  const iPlayed = !!c && !!me && !!c.played[me];
  const myDouble = (c && me ? c.double[me] : null) ?? null;
  const player = c && me && atTable ? state.players.find(p => p.id === me)! : c ? state.players.find(p => p.id === c.triggeredBy) : null;
  const trigger = c ? state.players.find(p => p.id === c.triggeredBy) : null;
  const mustBet = !!c && c.triggeredBy === me && (player?.cash ?? 0) >= 10;
  const [game, setGame] = useState<Game>('ruleta');
  const [amount, setAmount] = useState(50);
  const [pick, setPick] = useState(7);
  const [cart, setCart] = useState(0);
  const [busy, setBusy] = useState(false);
  const maxBet = Math.min(state.settings.casinoMaxBet, player?.cash ?? 0);

  useEffect(() => { if (open) { setBusy(false); } }, [open]);
  // Cuando llega un resultado, la vista pasa a ese juego (para que los demás también lo vean)
  useEffect(() => {
    if (last?.data.game) setGame(last.data.game as Game);
    setBusy(false);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !c || !player) return <Modal open={false} />;
  const showResult = last && (last.data.game === game) && iPlayed;

  async function play() {
    setBusy(true);
    const a = Math.floor(amount);
    if (game === 'doble') await act({ type: 'CASINO_DOUBLE_START', amount: a });
    else await act({ type: 'CASINO_PLAY', game, amount: a, pick: game === 'quiniela' ? pick : game === 'carrera' ? cart : undefined });
  }

  return (
    <Modal open width="max-w-2xl">
      <div className="-m-5 rounded-2xl bg-gradient-to-br from-[#2a0845] via-[#4a0d67] to-[#7a1b4d] p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-wide">🎰 Casino</h2>
            <div className="text-xs opacity-80">Cayó {trigger?.name ?? ''} y abrió la mesa: juegan todos. {trigger?.name ?? ''} apuesta sí o sí; los demás pueden pasar.</div>
          </div>
          <div className="text-right text-sm">
            <div className="opacity-80">{atTable ? 'Tu efectivo' : `Efectivo de ${player.name}`}</div>
            <div className="text-lg font-black text-yellow-300">{money(player.cash)}</div>
          </div>
        </div>
        {state.settings.jackpot && (
          <div className="mt-2 rounded-xl bg-black/30 px-3 py-1.5 text-center text-sm">
            JACKPOT acumulado: <b className="text-yellow-300">{money(state.jackpot)}</b> · se lo lleva quien saque doble seis en su turno
          </div>
        )}

        {/* Mesas */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GAMES.map(g => (
            <button key={g.id} disabled={iPlayed && !myDouble && g.id !== game} onClick={() => setGame(g.id)}
              className={`rounded-xl p-2 text-left transition ${game === g.id ? 'bg-yellow-400 text-black shadow-lg' : 'bg-white/10 hover:bg-white/20'} disabled:opacity-40`}>
              <div className="text-xl">{g.icon}</div>
              <div className="text-sm font-bold leading-tight">{g.name}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-80">{GAMES.find(g => g.id === game)!.desc}</p>

        {/* Mesa activa */}
        <div className="mt-3 rounded-2xl bg-black/30 p-3">
          {game === 'ruleta' && <Ruleta result={showResult ? last!.data : null} />}
          {game === 'quiniela' && <Quiniela pick={pick} setPick={setPick} disabled={!mine || iPlayed} result={showResult ? last!.data : null} />}
          {game === 'carrera' && <Carrera cart={cart} setCart={setCart} disabled={!mine || iPlayed} result={showResult ? last!.data : null} />}
          {game === 'doble' && <Doble c={{ double: myDouble, played: iPlayed }} amount={amount} last={last?.data.game === 'doble' ? last.data : null} />}
        </div>

        {/* Apuesta */}
        {mine ? (
          <div className="mt-3 space-y-2">
            {!iPlayed && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Apuesta:</span>
                  {[10, 50, 100, 200, 500].filter(v => v <= maxBet).map(v => (
                    <button key={v} className={`rounded-lg px-3 py-1 text-sm font-bold ${amount === v ? 'bg-yellow-400 text-black' : 'bg-white/15 hover:bg-white/25'}`} onClick={() => setAmount(v)}>{v} mil</button>
                  ))}
                  <button className="rounded-lg bg-white/15 px-3 py-1 text-sm font-bold hover:bg-white/25" onClick={() => setAmount(maxBet)}>Máx ({maxBet} mil)</button>
                  <input type="number" className="w-24 rounded-lg bg-white/90 px-2 py-1 text-sm text-black" min={10} max={maxBet} step={10} value={amount}
                    onChange={e => setAmount(Math.max(10, Math.min(maxBet, Math.floor(Number(e.target.value) || 0))))} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1" disabled={mustBet} title={mustBet ? 'Caíste en el Casino: tenés que apostar al menos una vez' : ''} onClick={() => act({ type: 'CASINO_LEAVE' })}>
                    {mustBet ? 'Caíste acá: tenés que apostar' : 'Paso, no apuesto'}
                  </button>
                  <button className="btn flex-1 bg-yellow-400 text-black hover:bg-yellow-300" disabled={busy || amount < 10 || amount > maxBet} onClick={play}>
                    {game === 'doble' ? `Arrancar con ${money(amount)}` : `Apostar ${money(amount)}`}
                  </button>
                </div>
              </>
            )}
            {iPlayed && !myDouble && (
              <button className="btn w-full bg-yellow-400 text-black hover:bg-yellow-300" onClick={() => act({ type: 'CASINO_LEAVE' })}>Listo, salgo del Casino ➜</button>
            )}
            {myDouble && (
              <div className="flex gap-2">
                <button className="btn-green flex-1" onClick={() => act({ type: 'CASINO_CASHOUT' })}>Retirar {money(myDouble.stake)} 💰</button>
                <button className="btn-primary flex-1 breathe" onClick={() => act({ type: 'CASINO_DOUBLE_CONTINUE' })}>¡Una más! (×2 → {money(myDouble.stake * 2)})</button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-center text-sm opacity-80">{iPassed ? 'Ya saliste de la mesa. Esperando a los demás…' : `${trigger?.name ?? ''} está en el Casino…`}</p>
        )}

        {/* Quién va cómo en la mesa */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {c.players.map(id => {
            const pl = state.players.find(x => x.id === id);
            if (!pl) return null;
            const estado = c.passed[id] ? (c.played[id] ? 'jugó' : 'pasó') : c.double[id] ? 'doblando' : c.played[id] ? 'viendo' : 'apostando…';
            return (
              <span key={id} className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.passed[id] ? 'bg-white/10 opacity-60' : 'bg-white/25'}`} style={{ boxShadow: `inset 0 0 0 2px ${pl.color}` }}>
                {pl.name}{id === c.triggeredBy ? ' 🎯' : ''} · {estado}
              </span>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
// Ruleta: carrete horizontal que frena despacio sobre el número que salió
// ---------------------------------------------------------------------------------------
function Ruleta({ result }: { result: Record<string, unknown> | null }) {
  const CELL = 78;   // 72 de celda + 6 de separación
  const CELLS = 56;
  const WIN = 44;    // celda donde frena el carrete
  const SPIN_MS = 3600;
  const roll = result && typeof result.roll === 'number' ? (result.roll as number) : null;
  const win = !!result?.win;
  const stripRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  // Números del carrete; el que salió va justo en la celda WIN, que es la que queda bajo el marcador
  const cells = useMemo(() => {
    const out = Array.from({ length: CELLS }, (_, i) => ((i * 37 + 23) % 100) + 1);
    if (roll !== null) out[WIN] = roll;
    return out;
  }, [roll]);

  useReelSpin(stripRef, roll !== null, { cell: CELL, winCell: WIN, ms: SPIN_MS, direction: 'left', jitterKey: roll ?? 0 });

  useEffect(() => {
    if (roll === null) { setDone(false); return; }
    setDone(false);
    const ticks: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) { t += 40 + i * i * 2.2; if (t < SPIN_MS - 200) ticks.push(setTimeout(() => sfx.tick(), t)); }
    ticks.push(setTimeout(() => { setDone(true); if (win) sfx.bigWin(); else sfx.lose(); }, SPIN_MS + 100));
    return () => ticks.forEach(clearTimeout);
  }, [roll]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="reel-window mx-auto" style={{ maxWidth: 560 }}>
        <div className="reel-marker" />
        <div ref={stripRef} className="reel-strip">
          {cells.map((n, i) => (
            <div key={i} className={`reel-cell ${n <= RULETA_WIN_CHANCE ? 'win' : 'lose'} ${done && i === WIN ? 'hit' : ''}`} data-cell={i}>
              <div className="text-center">{n}<br /><small>{n <= RULETA_WIN_CHANCE ? 'GANÁS' : 'PERDÉS'}</small></div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 h-8 text-center text-lg font-black">
        {roll === null ? <span className="opacity-60">Del 1 al {RULETA_WIN_CHANCE} ganás · del {RULETA_WIN_CHANCE + 1} al 100 perdés</span>
          : done ? <span data-ruleta-result={win ? 'win' : 'lose'} className={`reveal inline-block ${win ? 'text-green-300' : 'text-red-300'}`}>{win ? `¡Salió ${roll}! Ganaste ${money(result!.amount as number)}` : `Salió ${roll}. Perdiste ${money(result!.amount as number)}`}</span>
          : <span className="opacity-60">Girando…</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Quiniela
// ---------------------------------------------------------------------------------------
function Quiniela({ pick, setPick, disabled, result }: { pick: number; setPick: (n: number) => void; disabled: boolean; result: Record<string, unknown> | null }) {
  const dice = result?.dice as [number, number] | undefined;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!dice) { setShown(false); return; }
    setShown(false);
    const id = setTimeout(() => { setShown(true); if (result?.win) sfx.bigWin(); else sfx.lose(); }, 1200);
    sfx.dice();
    return () => clearTimeout(id);
  }, [dice?.[0], dice?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = result ? (result.pick as number) : pick;
  return (
    <div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
          <button key={n} disabled={disabled} onClick={() => setPick(n)}
            className={`rounded-lg py-2 text-center transition ${chosen === n ? 'bg-yellow-400 text-black scale-110 shadow-lg' : 'bg-white/15 hover:bg-white/25'} ${shown && result && (result.sum as number) === n ? 'ring-4 ring-green-400' : ''}`}>
            <div className="text-lg font-black leading-none">{n}</div>
            <div className="text-[10px] opacity-80">×{QUINIELA_PAYOUT[n]}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4" style={{ ['--cq' as string]: '1px' }}>
        <div className="flex gap-3" style={{ fontSize: 0 }}>
          <Die3D value={dice?.[0] ?? null} rolling={!!dice && !shown} size="56px" />
          <Die3D value={dice?.[1] ?? null} rolling={!!dice && !shown} size="56px" />
        </div>
        <div className="min-w-[180px] text-lg font-black">
          {!dice ? <span className="opacity-60">Tu número: {pick} (paga ×{QUINIELA_PAYOUT[pick]})</span>
            : shown ? <span className={`reveal inline-block ${result?.win ? 'text-green-300' : 'text-red-300'}`}>Salió {result!.sum as number}. {result?.win ? `¡Ganaste ${money((result!.payout as number) - (result!.amount as number))}!` : 'Perdiste.'}</span>
            : <span className="opacity-60">Tirando…</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Carrera de carretas
// ---------------------------------------------------------------------------------------
function Carrera({ cart, setCart, disabled, result }: { cart: number; setCart: (n: number) => void; disabled: boolean; result: Record<string, unknown> | null }) {
  const race = result?.race as number[][] | undefined;
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!race) { setStep(-1); return; }
    setStep(-1);
    let i = 0;
    const id = setInterval(() => {
      setStep(i); sfx.gallop(); i++;
      if (i >= race[0].length) { clearInterval(id); setTimeout(() => (result?.win ? sfx.bigWin() : sfx.lose()), 300); }
    }, 420);
    return () => clearInterval(id);
  }, [race]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxDist = race ? Math.max(...race.map(r => r[r.length - 1])) : 30;
  const finished = race ? step >= race[0].length - 1 : false;
  const chosen = result ? (result.pick as number) : cart;
  return (
    <div>
      <div className="space-y-1.5">
        {CARTS.map((emoji, k) => {
          const dist = race && step >= 0 ? race[k][step] : 0;
          const pct = Math.min(92, (dist / maxDist) * 92);
          const isWinner = finished && result && (result.winner as number) === k;
          return (
            <div key={k} className="flex items-center gap-2">
              <button disabled={disabled} onClick={() => setCart(k)} className={`w-14 rounded-lg py-1 text-sm font-black ${chosen === k ? 'bg-yellow-400 text-black' : 'bg-white/15 hover:bg-white/25'}`}>{emoji} {k + 1}</button>
              <div className={`race-lane flex-1 ${isWinner ? 'ring-4 ring-green-400' : ''}`}>
                <div className="finish" />
                <span key={step} className={`race-cart ${step >= 0 ? 'bounce' : ''}`} style={{ left: `${pct}%` }}>🛺</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 h-8 text-center text-lg font-black">
        {!race ? <span className="opacity-60">Elegiste la carreta {cart + 1}. Paga {CARRETA_PAYOUT} a 1.</span>
          : finished ? <span className={`reveal inline-block ${result?.win ? 'text-green-300' : 'text-red-300'}`}>¡Ganó la carreta {(result!.winner as number) + 1}! {result?.win ? `Cobrás ${money((result!.payout as number) - (result!.amount as number))}` : 'Perdiste.'}</span>
          : <span className="opacity-60">¡Corren!</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Doble o nada
// ---------------------------------------------------------------------------------------
function Doble({ c, amount, last }: { c: { double: { stake: number; step: number } | null; played: boolean }; amount: number; last: Record<string, unknown> | null }) {
  const dice = last?.dice as [number, number] | undefined;
  const stake = c.double?.stake ?? (last ? (last.stake as number) : amount);
  const chips = Math.min(8, Math.max(1, Math.round(Math.log2(Math.max(1, stake / 10)) + 1)));
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!dice) return;
    setRolling(true); sfx.dice();
    const id = setTimeout(() => { setRolling(false); if (last?.win) sfx.coin(); else sfx.lose(); }, 900);
    return () => clearTimeout(id);
  }, [dice?.[0], dice?.[1], last?.step]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = !!last && !last.win && !c.double;
  return (
    <div className="flex items-center justify-around gap-4">
      <div className="text-center">
        <div className="chip-tower">
          {!lost && Array.from({ length: chips }).map((_, i) => <div key={`${i}-${stake}`} className="poker-chip" style={{ animationDelay: `${i * 40}ms` }} />)}
        </div>
        <div className="mt-1 text-xs opacity-80">En juego</div>
        <div className={`text-xl font-black ${lost ? 'text-red-300 line-through' : 'text-yellow-300'}`}>{money(lost ? (last!.stake as number) : stake)}</div>
        <div className="text-xs opacity-80">Paso {c.double?.step ?? (last ? (last.step as number) : 0)} de {DOUBLE_MAX_STEPS}</div>
      </div>
      <div className="flex gap-3">
        <Die3D value={dice?.[0] ?? null} rolling={rolling} size="56px" />
        <Die3D value={dice?.[1] ?? null} rolling={rolling} size="56px" />
      </div>
      <div className="max-w-[180px] text-center text-base font-bold">
        {!dice ? <span className="opacity-70">Par dobla, impar perdés. ¿Hasta dónde llegás?</span>
          : rolling ? <span className="opacity-70">…</span>
          : last?.win ? <span className="reveal inline-block text-green-300">¡Par! Dobla.</span>
          : <span className="reveal inline-block text-red-300">Impar. Se fue todo.</span>}
      </div>
    </div>
  );
}
