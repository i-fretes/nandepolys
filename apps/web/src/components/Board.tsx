import { useEffect, useState } from 'react';
import { BOARD, EVENTS, GROUP_COLORS, SIDE_LEN, isProperty, type Tile as TileT } from '@nandepoly/engine';
import AnimatedNumber from './AnimatedNumber';
import { useStore } from '../store';
import { moneyShort, tokenEmoji } from '../format';
import Dice from './Dice';

const N = SIDE_LEN + 1;            // casillas entre esquina y esquina (11): las esquinas son 0, 11, 22, 33
const G = SIDE_LEN + 2;            // columnas/filas de la grilla (12)
export function gridPos(i: number): { col: number; row: number } {
  if (i <= N) return { row: G, col: G - i };                 // abajo, de derecha a izquierda
  if (i <= 2 * N) return { col: 1, row: G - (i - N) };       // izquierda, subiendo
  if (i <= 3 * N) return { row: 1, col: 1 + (i - 2 * N) };   // arriba, hacia la derecha
  return { col: G, row: 1 + (i - 3 * N) };                   // derecha, bajando
}
function side(i: number): 'bottom' | 'left' | 'top' | 'right' {
  if (i <= N) return 'bottom';
  if (i <= 2 * N) return 'left';
  if (i <= 3 * N) return 'top';
  return 'right';
}

const ICONS: Record<string, string> = {
  go: '🚀', jail: '🚔', parking: '🅿️', gotojail: '👮', chance: '❓', community: '🤝', tax: '🧾', transport: '🚌', utility: '💡', casino: '🎰', arena: '🏟️',
};

export default function Board() {
  const state = useStore(s => s.state)!;
  const setSelected = useStore(s => s.setSelectedTile);
  const displayPos = useStore(s => s.displayPos);
  const highlight = useStore(s => s.highlightGroup);
  const current = state.players[state.currentPlayerIndex];
  const glowGroup = highlight && highlight.until > Date.now() ? highlight.group : null;

  return (
    <div className="board w-full">
      {BOARD.map(t => {
        const pos = gridPos(t.id);
        const ps = isProperty(t) ? state.properties[t.id] : null;
        const owner = ps?.owner ? state.players.find(p => p.id === ps.owner) : null;
        const corner = t.id % N === 0;
        const here = state.players.filter(p => !p.bankrupt && (displayPos[p.id] ?? p.position) === t.id);
        return (
          <div
            key={t.id}
            className={`tile side-${side(t.id)} ${corner ? 'corner' : ''} ${owner ? 'owned' : ''} ${ps?.mortgaged ? 'mortgaged' : ''} ${t.type === 'street' && t.group === glowGroup ? 'glow-group' : ''}`}
            style={{ gridColumn: pos.col, gridRow: pos.row, ['--owner' as string]: owner?.color ?? 'transparent' }}
            onClick={() => setSelected(t.id)}
            title={t.name}
          >
            <TileContent t={t} houses={ps?.houses ?? 0} corner={corner} active={t.type === 'casino' ? state.settings.casino : t.type === 'arena' ? state.settings.arena : true} />
            {here.length > 0 && (
              <div className="tokens">
                {here.map(p => (
                  <span key={p.id} className={`token ${p.id === current?.id ? 'current' : ''}`} style={{ ['--c' as string]: p.color }} title={p.name}>
                    {tokenEmoji(p.token)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Center />
    </div>
  );
}

function TileContent({ t, houses, corner, active }: { t: TileT; houses: number; corner: boolean; active?: boolean }) {
  if (t.type === 'casino') {
    return (
      <>
        <div className={`band ${active ? 'neon' : ''}`} style={{ background: active ? 'linear-gradient(90deg,#7c3aed,#db2777)' : '#cfd8dc' }}><span style={{ fontSize: '1.7cqw' }}>🎰</span></div>
        <div className="body">
          <div className="name">Casino</div>
          <div className="price">{active ? '¡Apostá!' : 'Descanso'}</div>
        </div>
      </>
    );
  }
  if (t.type === 'arena') {
    return (
      <>
        <div className={`band ${active ? 'neon' : ''}`} style={{ background: active ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : '#cfd8dc' }}><span style={{ fontSize: '1.7cqw' }}>🏟️</span></div>
        <div className="body">
          <div className="name">La Arena</div>
          <div className="price">{active ? 'Todos juegan' : 'Descanso'}</div>
        </div>
      </>
    );
  }
  if (corner) {
    return (
      <div className="body">
        <div style={{ fontSize: '3.2cqw' }}>{ICONS[t.type]}</div>
        <div className="name">{t.name}</div>
        {t.type === 'go' && <div className="price">Cobrá 200 mil</div>}
        {t.type === 'jail' && <div className="price">Solo de visita</div>}
      </div>
    );
  }
  if (t.type === 'street') {
    return (
      <>
        <div className="band" style={{ background: GROUP_COLORS[t.group] }}>
          {houses === 5 ? <span className="hotel" /> : Array.from({ length: houses }).map((_, i) => <span key={i} className="house" />)}
        </div>
        <div className="body">
          <div className="name">{t.name}</div>
          <div className="price">{moneyShort(t.price)}</div>
        </div>
      </>
    );
  }
  if (isProperty(t)) {
    return (
      <>
        <div className="band" style={{ background: t.type === 'transport' ? '#37474F' : '#FFF8E1' }}>
          <span style={{ fontSize: '1.8cqw' }}>{ICONS[t.type]}</span>
        </div>
        <div className="body">
          <div className="name">{t.name}</div>
          <div className="price">{moneyShort(t.price)}</div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="band" style={{ background: t.type === 'chance' ? '#FFE082' : t.type === 'community' ? '#B3E5FC' : '#ECEFF1' }}>
        <span style={{ fontSize: '1.8cqw' }}>{ICONS[t.type]}</span>
      </div>
      <div className="body">
        <div className="name">{t.name}</div>
        {t.type === 'tax' && <div className="price">{t.percent ? `200 mil o ${t.percent} %` : moneyShort(t.amount)}</div>}
      </div>
    </>
  );
}

function Center() {
  const state = useStore(s => s.state)!;
  const events = useStore(s => s.events);
  const current = state.players[state.currentPlayerIndex];
  const last = [...events].reverse().find(e => e.type !== 'turn' && e.type !== 'roll');
  const [now, setNow] = useState(Date.now());
  const turnDeadline = useStore(s => s.turnDeadline);
  useEffect(() => {
    if (!turnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [turnDeadline]);
  const secs = turnDeadline ? Math.max(0, Math.ceil((turnDeadline - now) / 1000)) : null;

  return (
    <div className="center">
      <div className="brand">Ñandepoly</div>
      <div className="mt-[3cqw] flex items-center gap-[2cqw]">
        <Dice />
      </div>
      {state.phase === 'PLAYING' && current && (
        <div className="mt-[2.5cqw] flex items-center gap-[1cqw] rounded-full bg-white/80 px-[2cqw] py-[0.8cqw]" style={{ fontSize: '2cqw' }}>
          <span className="token !static" style={{ ['--c' as string]: current.color, width: '3.2cqw', height: '3.2cqw', fontSize: '2cqw' }}>{tokenEmoji(current.token)}</span>
          <b>Turno de {current.name}</b>
          {secs !== null && <span className={`ml-[1cqw] font-mono ${secs <= 10 ? 'text-red-600' : 'text-ink/60'}`}>{secs}s</span>}
        </div>
      )}
      {state.settings.freeParkingPot && state.freeParkingPot > 0 && (
        <div className="mt-[1cqw] rounded-full bg-emerald-600 px-[2cqw] py-[0.5cqw] text-white" style={{ fontSize: '1.6cqw' }}>
          Pozo: {moneyShort(state.freeParkingPot)}
        </div>
      )}
      {state.activeEvent && (() => { const ev = EVENTS.find(e => e.id === state.activeEvent!.id); return ev ? (
        <div className="event-badge mt-[1cqw] rounded-full px-[2cqw] py-[0.5cqw] font-bold text-white" style={{ fontSize: '1.6cqw' }} title={ev.desc}>
          {ev.icon} {ev.name}{state.activeEvent!.data?.number ? ` · nº ${state.activeEvent!.data.number}` : ''}
        </div>
      ) : null; })()}
      {state.settings.jackpot && (
        <div className="mt-[1cqw] rounded-full bg-gradient-to-r from-purple-700 to-pink-600 px-[2cqw] py-[0.5cqw] font-black text-yellow-300 shadow" style={{ fontSize: '1.7cqw', letterSpacing: '.05em' }} title="Doble seis se lo lleva">
          🎰 JACKPOT <AnimatedNumber value={state.jackpot} format={n => '₲ ' + (n * 1000).toLocaleString('es-PY')} />
          <span className="ml-[1cqw] font-semibold text-white/80" style={{ fontSize: '1.2cqw' }}>· sacá ⚅⚅ y es tuyo</span>
        </div>
      )}
      {last && (
        <div className="absolute bottom-[2cqw] left-[3cqw] right-[3cqw] rounded-[1cqw] bg-white/70 px-[1.5cqw] py-[0.8cqw] text-center leading-snug text-ink/80" style={{ fontSize: '1.6cqw' }}>
          {last.text}
        </div>
      )}
      <div className="absolute left-[3cqw] top-[3cqw] -rotate-12 rounded-[0.8cqw] bg-[#FFE082] px-[1.5cqw] py-[1cqw] shadow" style={{ fontSize: '1.6cqw' }}>
        <b>Suerte</b><div className="opacity-70">{state.deckCounts.chance} cartas</div>
      </div>
      <div className="absolute bottom-[8cqw] right-[3cqw] rotate-12 rounded-[0.8cqw] bg-[#B3E5FC] px-[1.5cqw] py-[1cqw] shadow" style={{ fontSize: '1.6cqw' }}>
        <b>Cooperativa</b><div className="opacity-70">{state.deckCounts.community} cartas</div>
      </div>
    </div>
  );
}
