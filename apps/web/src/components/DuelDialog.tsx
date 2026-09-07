import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUEL_COWARD_FEE, DUEL_MAX_BET, type DuelState, type TrucoPublic } from '@nandepoly/engine';
import { useMe, useStore } from '../store';
import { money, tokenEmoji } from '../format';
import Modal from './Modal';
import { sfx } from '../sound';

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Duelo mayor: proponer (con ficha), aceptar/rechazar, y las mesas de Escopeta y Truco. */
export default function DuelDialog() {
  const state = useStore(s => s.state)!;
  const me = useMe();
  const open = useStore(s => s.dialog === 'duel');
  const setDialog = useStore(s => s.setDialog);
  const act = useStore(s => s.act);
  const d = state.duel;
  const result = useStore(s => s.lastDuelResult);
  const setResult = useStore(s => s.setLastDuelResult);
  const [toId, setToId] = useState('');
  const [game, setGame] = useState<'escopeta' | 'truco'>('escopeta');
  const [amount, setAmount] = useState(200);
  const others = state.players.filter(p => !p.bankrupt && p.id !== me?.id);
  useEffect(() => { if (open) setToId(others[0]?.id ?? ''); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (result) { const t = setTimeout(() => setResult(null), 6500); return () => clearTimeout(t); } }, [result, setResult]);

  // Resultado (se muestra unos segundos después de terminar)
  if (result && !d) {
    const w = state.players.find(p => p.id === result.winner), l = state.players.find(p => p.id === result.loser);
    return (
      <Modal open onClose={() => setResult(null)}>
        <div className="text-center">
          <div className="text-sm font-semibold text-ink/50">Duelo mayor · {result.game === 'truco' ? 'Truco' : 'Escopeta'}</div>
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }} className="mt-2 text-4xl font-black">🏆 ¡Ganó {w?.name}!</motion.div>
          <div className="mt-2 text-lg">{l?.name} paga <b className="text-emerald-700">{money(result.amount)}</b></div>
          <div className="mt-4 flex justify-center gap-6 text-5xl">
            <span className="duel-face win">{w && tokenEmoji(w.token)}</span>
            <span className="duel-face lose">{l && tokenEmoji(l.token)}</span>
          </div>
          <button className="btn-ghost mt-4" onClick={() => setResult(null)}>Cerrar</button>
        </div>
      </Modal>
    );
  }

  // Duelo en curso
  if (d && state.turnPhase === 'DUEL') {
    const from = state.players.find(p => p.id === d.fromId)!, to = state.players.find(p => p.id === d.toId)!;
    const amI = me && (me.id === d.fromId || me.id === d.toId);
    if (d.status === 'pending') {
      return (
        <Modal open width="max-w-md">
          <div className="text-center">
            <div className="vs-splash text-5xl">{d.game === 'truco' ? '🃏' : '🔫'}</div>
            <h2 className="mt-2 text-2xl font-black">Duelo mayor: {d.game === 'truco' ? 'Truco paraguayo' : 'Escopeta'}</h2>
            <p className="mt-2 text-sm"><b>{from.name}</b> gastó su ficha y reta a <b>{to.name}</b> por <b className="text-emerald-700">{money(d.amount)}</b>.</p>
            <p className="mt-1 text-xs text-ink/50">Negarse cuesta {money(DUEL_COWARD_FEE)} (se los lleva el retador). Responder antes de 20 s.</p>
            {me?.id === d.toId ? (
              <div className="mt-4 flex justify-center gap-2">
                <button className="btn-ghost" onClick={() => act({ type: 'DUEL_REJECT' })}>Me rajo (−{money(DUEL_COWARD_FEE)})</button>
                <button className="btn-primary breathe px-6" onClick={() => act({ type: 'DUEL_ACCEPT' })}>¡Acepto!</button>
              </div>
            ) : <div className="mt-4 text-sm text-ink/60">Esperando a {to.name}…</div>}
            {me?.id === state.hostId && me.id !== d.toId && <button className="btn-ghost btn-sm mt-3" onClick={() => act({ type: 'DUEL_CANCEL' })}>Anular (anfitrión)</button>}
          </div>
        </Modal>
      );
    }
    return (
      <Modal open width={d.game === 'truco' ? 'max-w-3xl' : 'max-w-2xl'}>
        {d.game === 'escopeta' ? <Escopeta d={d} meId={me?.id ?? null} /> : <Truco d={d} meId={me?.id ?? null} />}
        {!amI && <div className="mt-2 text-center text-xs text-ink/50">Estás mirando el duelo.</div>}
        {me?.id === state.hostId && <div className="mt-2 text-right"><button className="btn-ghost btn-sm !text-[11px]" onClick={() => confirm('¿Anular el duelo? Nadie paga y el retador recupera la ficha.') && act({ type: 'DUEL_CANCEL' })}>Anular duelo</button></div>}
      </Modal>
    );
  }

  // Proponer
  if (!open || !me) return <Modal open={false} />;
  const to = state.players.find(p => p.id === toId);
  const max = Math.min(DUEL_MAX_BET, me.cash, to?.cash ?? 0);
  return (
    <Modal open onClose={() => setDialog(null)} width="max-w-lg">
      <h2 className="text-xl font-black">⚔️ Duelo mayor</h2>
      <p className="text-sm text-ink/60">Tenés <b>{me.duelTokens}</b> ficha{me.duelTokens === 1 ? '' : 's'} (una cada 3 vueltas). Apostá hasta {money(DUEL_MAX_BET)}. Si el rival se niega, te paga {money(DUEL_COWARD_FEE)} y conservás la ficha.</p>
      <label className="mt-3 block text-sm font-semibold">Rival</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {others.map(p => <button key={p.id} onClick={() => setToId(p.id)} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 ${toId === p.id ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white'}`}><span>{tokenEmoji(p.token)}</span><b>{p.name}</b><span className="text-xs text-ink/50">{money(p.cash)}</span></button>)}
      </div>
      <label className="mt-3 block text-sm font-semibold">Juego</label>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <button onClick={() => setGame('escopeta')} className={`rounded-xl border-2 p-3 text-left ${game === 'escopeta' ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white'}`}>
          <div className="text-2xl">🔫</div><b>Escopeta</b><div className="text-xs text-ink/60">Cartuchos de verdad y de fogueo mezclados. Disparate o dispará al rival. 3 vidas. Lupa, cerveza y esposas.</div>
        </button>
        <button onClick={() => setGame('truco')} className={`rounded-xl border-2 p-3 text-left ${game === 'truco' ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white'}`}>
          <div className="text-2xl">🃏</div><b>Truco paraguayo</b><div className="text-xs text-ink/60">Mano a mano a 15: envido, real, falta, flor, truco, retruco y vale cuatro.</div>
        </button>
      </div>
      <label className="mt-3 block text-sm font-semibold">Apuesta: <span className="text-emerald-700">{money(amount)}</span></label>
      <input type="range" className="mt-1 w-full accent-red-600" min={50} max={Math.max(50, max)} step={50} value={Math.min(amount, Math.max(50, max))} onChange={e => setAmount(Number(e.target.value))} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => setDialog(null)}>Cerrar</button>
        <button className="btn-primary" disabled={!to || me.duelTokens <= 0 || max < 50} onClick={async () => { const ok = await act({ type: 'DUEL_PROPOSE', toId, game, amount: Math.min(amount, max) }); if (ok) setDialog(null); }}>Retar por {money(Math.min(amount, Math.max(50, max)))}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
const ITEM: Record<string, { icon: string; name: string; desc: string }> = {
  lupa: { icon: '🔍', name: 'Lupa', desc: 'Mirás el próximo cartucho' },
  cerveza: { icon: '🍺', name: 'Cerveza', desc: 'Expulsás el próximo cartucho' },
  esposas: { icon: '⛓️', name: 'Esposas', desc: 'El rival pierde su próximo turno' },
};

function Escopeta({ d, meId }: { d: DuelState; meId: string | null }) {
  const state = useStore(s => s.state)!;
  const act = useStore(s => s.act);
  const data = d.data as D;
  const lives = (data.lives ?? {}) as Record<string, number>;
  const known = (data.known ?? { live: 0, blank: 0 }) as { live: number; blank: number };
  const items = (data.items ?? {}) as Record<string, string[]>;
  const peek = (data.peek ?? {}) as Record<string, string>;
  const myTurn = meId === d.turn;
  const me = state.players.find(p => p.id === meId);
  const opp = state.players.find(p => p.id === (meId === d.fromId ? d.toId : d.fromId));
  const turnP = state.players.find(p => p.id === d.turn);
  const evs = useStore(s => s.duelEvents);
  const lastShot = [...evs].reverse().find(e => e.type === 'duel_round' && e.data.live !== undefined);
  const [flash, setFlash] = useState<null | 'live' | 'blank'>(null);
  useEffect(() => { if (lastShot) { setFlash(lastShot.data.live ? 'live' : 'blank'); const t = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(t); } }, [lastShot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shoot = (target: 'self' | 'opp') => act({ type: 'DUEL_MOVE', move: { kind: 'shoot', target } });
  const useItem = (item: string) => act({ type: 'DUEL_MOVE', move: { kind: 'item', item } });
  const players = [d.fromId, d.toId].map(id => state.players.find(p => p.id === id)!);
  const canPlay = myTurn && meId && (meId === d.fromId || meId === d.toId);
  const [showHelp, setShowHelp] = useState(true);
  const history = evs.filter(e => e.type === 'duel_round' && e.data.live !== undefined && (e.data.round === undefined || true)).slice(-12);
  return (
    <div className={`escopeta relative ${flash ? `flash-${flash}` : ''}`}>
      {flash && lastShot && (
        <div className={`shot-splash ${flash}`}>
          <div className="text-6xl">{flash === 'live' ? '💥' : '🔘'}</div>
          <div className="text-4xl font-black">{flash === 'live' ? '¡BOOM!' : 'clic…'}</div>
          <div className="text-sm font-semibold">{flash === 'live' ? `Era de verdad: ${state.players.find(p => p.id === (lastShot.data.target as string))?.name} pierde una vida` : 'De fogueo. Nadie sale herido.'}</div>
        </div>
      )}
      <div className={`mb-2 rounded-xl px-3 py-2 text-center text-sm font-black ${myTurn ? 'bg-yellow-300 text-black' : 'bg-white/10 text-white'}`}>
        {myTurn ? '👉 ES TU TURNO: elegí a quién disparar (o usá un ítem)' : `Turno de ${turnP?.name}…`}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">🔫 Escopeta · Ronda {data.round ?? 1}</h2>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white" onClick={() => setShowHelp(v => !v)}>{showHelp ? 'Ocultar ayuda' : '¿Cómo se juega?'}</button>
          <div className="text-sm font-bold text-emerald-300">Pozo: {money(d.amount)}</div>
        </div>
      </div>
      {showHelp && (
        <div className="mt-2 rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-white/90">
          <b>Cómo se juega:</b> la escopeta se carga con cartuchos <b className="text-red-300">de verdad</b> y <b className="text-sky-300">de fogueo</b> mezclados al azar; se anuncia cuántos hay de cada uno, no el orden.
          En tu turno elegís: <b>dispararte</b> (si sale de fogueo no pasa nada y <u>seguís vos</u>; si es de verdad perdés una vida) o <b>disparar al rival</b> (si es de verdad pierde una vida; en cualquier caso <u>pasa el turno</u>).
          Cada cartucho usado se descuenta del conteo: si quedan más de verdad, dispará al rival; si quedan más de fogueo, dispararte te da otro turno. Pierde el que llega a 0 vidas ❤️.
          Ítems: 🔍 <b>lupa</b> = ves el próximo cartucho · 🍺 <b>cerveza</b> = expulsás el próximo cartucho sin disparar · ⛓️ <b>esposas</b> = el rival pierde su próximo turno.
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {players.map(p => (
          <div key={p.id} className={`rounded-xl p-3 ${d.turn === p.id ? 'bg-white/15 ring-2 ring-yellow-300' : 'bg-white/5'}`}>
            <div className="flex items-center gap-2 text-white"><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg" style={{ boxShadow: `0 0 0 3px ${p.color}` }}>{tokenEmoji(p.token)}</span><b className="truncate">{p.name}</b>{data.cuffed === p.id && <span title="Esposado">⛓️</span>}</div>
            <div className="mt-1 text-xl">{'❤️'.repeat(Math.max(0, lives[p.id] ?? 0))}{'🖤'.repeat(Math.max(0, 3 - (lives[p.id] ?? 0)))}</div>
            <div className="mt-1 flex gap-1">{(items[p.id] ?? []).map((it, i) => <span key={i} className="rounded bg-white/20 px-1.5 py-0.5 text-sm" title={ITEM[it]?.name}>{ITEM[it]?.icon}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col items-center rounded-xl bg-black/30 p-3 text-white">
        <div className="text-xs font-bold uppercase tracking-widest text-white/60">Cartuchos en la escopeta</div>
        <div className="mt-1 flex gap-1 text-2xl">{Array.from({ length: (data.shellsLeft as number) ?? 0 }, (_, i) => <span key={i} className="shell" title="Cartucho: no se sabe si es de verdad o de fogueo">🔘</span>)}</div>
        <div className="mt-1 text-sm">Quedan <b className="text-red-400">{known.live} de verdad 💥</b> y <b className="text-sky-300">{known.blank} de fogueo</b>, en orden desconocido</div>
        {meId && peek[meId] && <div className="mt-2 rounded-lg bg-yellow-300 px-3 py-1 text-sm font-black text-black">🔍 El próximo es {peek[meId] === 'live' ? 'DE VERDAD 💥' : 'de fogueo'}</div>}
        {lastShot && <div className={`mt-2 text-sm font-bold ${lastShot.data.live ? 'text-red-400' : 'text-sky-300'}`}>{lastShot.text}</div>}
        {history.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-white/60">
            <span className="mr-1">Cartuchos ya disparados:</span>
            {history.map(h => <span key={h.id} className={`rounded px-1.5 py-0.5 text-[11px] font-black ${h.data.live ? 'bg-red-600 text-white' : 'bg-sky-700 text-white'}`} title={h.text}>{h.data.live ? '💥' : '○'}</span>)}
          </div>
        )}
      </div>
      {canPlay ? (
        <div className="mt-3">
          <div className="text-center text-sm font-bold text-yellow-300">¡Te toca, {me?.name}!</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button data-shoot-self className="duel-btn self" onClick={() => { shoot('self'); sfx.tick(); }}>🔫 Dispararme<span className="text-xs font-semibold opacity-80">fogueo → sigo yo · verdad → pierdo ❤️</span></button>
            <button data-shoot-opp className="duel-btn opp" onClick={() => { shoot('opp'); sfx.tick(); }}>🎯 Disparar a {opp?.name}<span className="text-xs font-semibold opacity-80">verdad → pierde ❤️ · siempre pasa el turno</span></button>
          </div>
          {(items[meId!] ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {(items[meId!] ?? []).map((it, i) => <button key={i} className="btn-ghost btn-sm flex-col !items-start !gap-0" onClick={() => useItem(it)}><span>{ITEM[it]?.icon} {ITEM[it]?.name}</span><span className="text-[10px] font-normal text-ink/60">{ITEM[it]?.desc}</span></button>)}
            </div>
          )}
        </div>
      ) : <div className="mt-3 text-center text-sm text-white/70">Turno de <b className="text-white">{turnP?.name}</b>…</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
const SUIT_ICON: Record<string, string> = { espada: '⚔️', basto: '🪵', oro: '🪙', copa: '🏆' };
function CardView({ c, small, onClick, disabled }: { c: { r: number; s: string } | null; small?: boolean; onClick?: () => void; disabled?: boolean }) {
  if (!c) return <div className={`tcard back ${small ? 'small' : ''}`} />;
  return (
    <button className={`tcard ${c.s} ${small ? 'small' : ''} ${onClick ? 'playable' : ''}`} onClick={onClick} disabled={disabled || !onClick}>
      <span className="rank">{c.r}</span><span className="suit">{SUIT_ICON[c.s]}</span><span className="rank flip">{c.r}</span>
    </button>
  );
}

function Truco({ d, meId }: { d: DuelState; meId: string | null }) {
  const state = useStore(s => s.state)!;
  const act = useStore(s => s.act);
  const pub = d.data.truco as TrucoPublic | undefined;
  const hand = useStore(s => s.state?.mine?.trucoHand ?? null);
  if (!pub) return null;
  const ids = [d.fromId, d.toId];
  const oppId = meId === d.fromId ? d.toId : d.fromId;
  const name = (id: string) => state.players.find(p => p.id === id)?.name ?? '';
  const playing = meId && ids.includes(meId);
  const myTurn = playing && pub.turn === meId;
  const call = (what: string) => act({ type: 'DUEL_MOVE', move: { kind: 'call', what } });
  const play = (i: number) => { act({ type: 'DUEL_MOVE', move: { kind: 'play', card: i } }); sfx.card(); };
  const pend = pub.pending;
  const mustAnswer = playing && pend && pend.by !== meId;
  const canEnvido = playing && !pub.envidoDone && pub.baza === 0 && (pub.table[meId!]?.length ?? 0) === 0 && (!pend || pend.type === 'envido');
  const canTruco = playing && !pend && myTurn && !(pub.trucoLevel > 0 && pub.trucoCallerLast === meId) && pub.trucoLevel < 3;
  const trucoWord = ['¡Truco!', '¡Retruco!', '¡Vale cuatro!'][pub.trucoLevel] ?? '';
  const trucoWhat = ['truco', 'retruco', 'vale4'][pub.trucoLevel];
  const log = pub.log.slice(-4).map(l => ids.reduce((t, id) => t.split(id).join(name(id)), l));
  const shown = playing ? [meId!, oppId] : ids;
  return (
    <div className="truco">
      <div className="flex items-center justify-between text-white">
        <h2 className="text-xl font-black">🃏 Truco · a {pub.target}</h2>
        <div className="flex gap-3 text-sm font-bold">{ids.map(id => <span key={id} className={`rounded-full px-3 py-1 ${pub.turn === id ? 'bg-yellow-300 text-black' : 'bg-white/15'}`}>{name(id)}: {pub.scores[id]}</span>)}</div>
      </div>
      <div className="mt-1 text-xs text-emerald-300">Pozo {money(d.amount)} · mano {pub.hand} · vale {pub.handValue} · {pub.mano === meId ? 'sos mano' : `mano: ${name(pub.mano)}`}</div>

      {/* Rival */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 p-2">
        <div className="text-sm font-bold text-white">{name(shown[1])} {pub.flor[shown[1]] ? '🌸 flor' : ''}</div>
        <div className="flex gap-1">{Array.from({ length: pub.cardCount[shown[1]] ?? 0 }, (_, i) => <CardView key={i} c={null} small />)}</div>
      </div>
      {/* Mesa */}
      <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-emerald-900/60 p-3">
        {[0, 1, 2].map(b => (
          <div key={b} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${pub.baza === b && !pub.finished ? 'bg-white/10' : ''}`}>
            <CardView c={pub.table[shown[1]]?.[b] ?? null} small={!pub.table[shown[1]]?.[b]} />
            <div className="text-[10px] font-bold text-white/60">{pub.bazaWinners[b] ? (pub.bazaWinners[b] === 'parda' ? 'parda' : `${name(pub.bazaWinners[b] as string)} ✔`) : `baza ${b + 1}`}</div>
            <CardView c={pub.table[shown[0]]?.[b] ?? null} small={!pub.table[shown[0]]?.[b]} />
          </div>
        ))}
      </div>
      {/* Mi mano */}
      <div className="mt-2 flex items-center justify-between rounded-xl bg-white/5 p-2">
        <div className="text-sm font-bold text-white">{playing ? 'Tu mano' : name(shown[0])} {pub.flor[shown[0]] ? '🌸 flor' : ''}{pub.lastEnvido && playing ? <span className="ml-2 text-xs text-yellow-300">envido: {pub.lastEnvido[meId!]} vs {pub.lastEnvido[oppId]}</span> : null}</div>
        <div className="flex gap-2">
          {playing && hand ? hand.map((c, i) => <CardView key={`${c.r}${c.s}`} c={c} onClick={myTurn && !pend ? () => play(i) : undefined} />)
            : Array.from({ length: pub.cardCount[shown[0]] ?? 0 }, (_, i) => <CardView key={i} c={null} small />)}
        </div>
      </div>
      {/* Cantos */}
      {playing && !pub.finished && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {mustAnswer ? (
            <>
              <div className="w-full text-center text-sm font-bold text-yellow-300">{name(pend!.by)} cantó {pend!.type === 'envido' ? pub.envidoChain[pub.envidoChain.length - 1] : trucoWord.replace('!', '').replace('¡', '')}. ¿Querés?</div>
              <button data-quiero className="duel-btn opp" onClick={() => call('quiero')}>¡Quiero!</button>
              <button data-noquiero className="duel-btn self" onClick={() => call('no_quiero')}>No quiero</button>
              {pend!.type === 'envido' && <>
                {!pub.envidoChain.includes('real') && !pub.envidoChain.includes('falta') && <button className="btn-ghost btn-sm" onClick={() => call('real')}>Real envido</button>}
                {!pub.envidoChain.includes('falta') && <button className="btn-ghost btn-sm" onClick={() => call('falta')}>Falta envido</button>}
              </>}
            </>
          ) : (
            <>
              {canEnvido && !pend && <button className="btn-ghost btn-sm" onClick={() => call('envido')}>Envido</button>}
              {canEnvido && !pend && <button className="btn-ghost btn-sm" onClick={() => call('real')}>Real envido</button>}
              {canEnvido && !pend && <button className="btn-ghost btn-sm" onClick={() => call('falta')}>Falta envido</button>}
              {canTruco && <button data-truco className="btn-primary btn-sm" onClick={() => call(trucoWhat)}>{trucoWord}</button>}
              <button className="btn-ghost btn-sm !text-red-700" onClick={() => confirm('¿Irte al mazo? El rival se lleva la mano.') && call('mazo')}>Al mazo</button>
              {myTurn && !pend && <span className="w-full text-center text-xs text-yellow-300">Te toca: jugá una carta o cantá.</span>}
              {!myTurn && <span className="w-full text-center text-xs text-white/60">Esperando a {name(pub.turn)}…</span>}
            </>
          )}
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] text-white/60">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}
