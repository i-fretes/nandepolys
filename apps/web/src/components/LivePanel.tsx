import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EVENTS, tile, type TradeSide } from '@nandepoly/engine';
import { useStore, type LiveEntry } from '../store';
import { money, tokenEmoji } from '../format';

const KIND_META: Record<LiveEntry['kind'], { icon: string; label: string; cls: string }> = {
  trade_proposed: { icon: '🤝', label: 'Propuesta', cls: 'live-blue' },
  trade_done: { icon: '✅', label: 'Trato hecho', cls: 'live-green' },
  trade_rejected: { icon: '❌', label: 'Rechazado', cls: 'live-red' },
  rent_don: { icon: '🎲', label: 'Doble o nada', cls: 'live-purple' },
  challenge: { icon: '⚔️', label: 'Desafío', cls: 'live-orange' },
  arena: { icon: '🏟️', label: 'Arena', cls: 'live-gold' },
  duel: { icon: '🔫', label: 'Duelo mayor', cls: 'live-dark' },
  lootbox: { icon: '🎁', label: 'Caja sorpresa', cls: 'live-pink' },
  event: { icon: '🌪️', label: 'Evento', cls: 'live-teal' },
  mission: { icon: '🎯', label: 'Misión', cls: 'live-green' },
  jackpot: { icon: '🎰', label: 'JACKPOT', cls: 'live-gold' },
};

/** Tabla en vivo (lado izquierdo): intercambios, apuestas entre jugadores, premios de la Arena, duelos, cajas y eventos. */
export default function LivePanel() {
  const state = useStore(s => s.state)!;
  const feed = useStore(s => s.liveFeed);
  const drafting = useStore(s => s.drafting);
  const pending = state.pendingTrade;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(id); }, []);
  const name = (id?: string | null) => state.players.find(p => p.id === id)?.name ?? '';
  const player = (id?: string | null) => state.players.find(p => p.id === id);
  const now = Date.now();
  const ghosts = Object.entries(drafting).filter(([from, d]) => now - d.at < 90_000 && !(pending && pending.fromId === from));
  const rows = [...feed].reverse().slice(0, 40);
  const totals = feed.reduce((acc, e) => { if (e.kind === 'trade_done') acc.trades++; if (e.kind === 'challenge' || e.kind === 'duel' || e.kind === 'rent_don') acc.bets++; return acc; }, { trades: 0, bets: 0 });

  return (
    <div className="card flex h-full flex-col overflow-hidden" data-live-panel>
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <div className="text-sm font-black tracking-tight">📊 En vivo</div>
        <div className="flex gap-1 text-[10px] font-semibold text-ink/50">
          <span className="chip bg-emerald-50 text-emerald-700">{totals.trades} tratos</span>
          <span className="chip bg-orange-50 text-orange-700">{totals.bets} apuestas</span>
        </div>
      </div>
      <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {pending && (
            <motion.div key={`pending-${pending.id}`} layout initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="live-row live-blue live-pulse">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span>🤝</span>
                <Who p={player(pending.fromId)} />
                <span className="text-ink/40">→</span>
                <Who p={player(pending.toId)} />
                <span className="ml-auto chip bg-white/70 text-[10px] text-py-blue">esperando…</span>
              </div>
              <TradeLine give={pending.give} receive={pending.receive} fromName={name(pending.fromId)} toName={name(pending.toId)} />
            </motion.div>
          )}
          {ghosts.map(([from, d]) => (
            <motion.div key={`ghost-${from}`} layout initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="live-row live-ghost">
              <div className="flex items-center gap-2 text-xs">
                <span className="typing"><i /><i /><i /></span>
                <b>{name(from)}</b> está negociando con <b>{name(d.toId)}</b>…
              </div>
            </motion.div>
          ))}
          {rows.map(e => <Row key={e.id} e={e} player={player} name={name} />)}
        </AnimatePresence>
        {!rows.length && !pending && !ghosts.length && (
          <div className="px-2 py-6 text-center text-xs text-ink/40">
            Acá van a aparecer los intercambios, apuestas, premios de la Arena y sorpresas de la partida, en vivo.
          </div>
        )}
      </div>
    </div>
  );
}

function Who({ p }: { p?: { name: string; color: string; token: string } }) {
  if (!p) return <span>?</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px]" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>{tokenEmoji(p.token)}</span>
      <span className="max-w-[72px] truncate">{p.name}</span>
    </span>
  );
}

function sideText(s: TradeSide): string {
  const parts = [
    s.cash ? money(s.cash) : null,
    ...s.properties.map(id => tile(id).name),
    s.jailCards ? `${s.jailCards} 🎟️` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' + ') : 'nada';
}

function TradeLine({ give, receive, fromName, toName }: { give: TradeSide; receive: TradeSide; fromName: string; toName: string }) {
  return (
    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[11px] leading-tight">
      <div className="rounded bg-white/70 px-1.5 py-1"><span className="text-ink/50">{fromName} da</span><br /><b>{sideText(give)}</b></div>
      <span className="text-base">⇄</span>
      <div className="rounded bg-white/70 px-1.5 py-1 text-right"><span className="text-ink/50">{toName} da</span><br /><b>{sideText(receive)}</b></div>
    </div>
  );
}

function Row({ e, player, name }: { e: LiveEntry; player: (id?: string | null) => { name: string; color: string; token: string } | undefined; name: (id?: string | null) => string }) {
  const m = KIND_META[e.kind];
  const d = e.data ?? {};
  const isTrade = e.kind.startsWith('trade');
  const ev = e.kind === 'event' ? EVENTS.find(x => x.id === d.eventId) : null;
  return (
    <motion.div layout initial={{ opacity: 0, x: -40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} className={`live-row ${m.cls}`}>
      <div className="flex items-center gap-2 text-xs font-bold">
        <span className="live-icon">{ev ? ev.icon : m.icon}</span>
        {e.from && e.to ? (<><Who p={player(e.from)} /><span className="text-ink/40">{e.kind === 'trade_rejected' && d.cancelled ? '✕' : e.kind === 'challenge' || e.kind === 'duel' ? '⚔' : '→'}</span><Who p={player(e.to)} /></>) : e.to ? <Who p={player(e.to)} /> : <span>{ev ? ev.name : m.label}</span>}
        {typeof e.amount === 'number' && e.amount > 0 && (
          <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black ${e.kind === 'rent_don' && !e.win ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {e.kind === 'rent_don' ? (e.win ? 'no paga' : `−${money(e.amount)} ×2`) : `+${money(e.amount)}`}
          </span>
        )}
        {e.kind === 'trade_done' && <span className="ml-auto chip bg-emerald-600 text-[10px] text-white">✔ hecho</span>}
        {e.kind === 'trade_rejected' && <span className="ml-auto chip bg-red-600 text-[10px] text-white">{d.cancelled ? 'cancelado' : 'rechazado'}</span>}
      </div>
      {isTrade && !!d.give && !!d.receive && <TradeLine give={d.give as TradeSide} receive={d.receive as TradeSide} fromName={name(e.from)} toName={name(e.to)} />}
      {!isTrade && <div className="mt-0.5 text-[11px] leading-snug text-ink/75">{e.text}</div>}
    </motion.div>
  );
}
