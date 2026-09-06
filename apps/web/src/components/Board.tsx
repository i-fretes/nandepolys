import { useEffect, useState } from 'react';
import { BOARD, CASINO_TILE, GROUP_COLORS, isProperty, type Tile as TileT } from '@nandepoly/engine';
import AnimatedNumber from './AnimatedNumber';
import { useStore } from '../store';
import { moneyShort, tokenEmoji } from '../format';
import Dice from './Dice';

function gridPos(i: number): { col: number; row: number } {
  if (i <= 10) return { row: 11, col: 11 - i };
  if (i <= 20) return { col: 1, row: 21 - i };
  if (i <= 30) return { row: 1, col: i - 19 };
  return { col: 11, row: i - 29 };
}
function side(i: number): 'bottom' | 'left' | 'top' | 'right' {
  if (i <= 10) return 'bottom';
  if (i <= 20) return 'left';
  if (i <= 30) return 'top';
  return 'right';
}

const ICONS: Record<string, string> = {
  go: '🚀', jail: '🚔', parking: '🅿️', gotojail: '👮', chance: '❓', community: '🤝', tax: '🧾', transport: '🚌', utility: '💡',
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
        const corner = t.id % 10 === 0;
        const here = state.players.filter(p => !p.bankrupt && (displayPos[p.id] ?? p.position) === t.id);
        return (
          <div
            key={t.id}
            className={`tile side-${side(t.id)} ${corner ? 'corner' : ''} ${owner ? 'owned' : ''} ${ps?.mortgaged ? 'mortgaged' : ''} ${t.type === 'street' && t.group === glowGroup ? 'glow-group' : ''}`}
            style={{ gridColumn: pos.col, gridRow: pos.row, ['--owner' as string]: owner?.color ?? 'transparent' }}
            onClick={() => setSelected(t.id)}
            title={t.name}
          >
            <TileContent t={t} houses={ps?.houses ?? 0} corner={corner} casino={t.id === CASINO_TILE && state.settings.casino} />
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

function TileContent({ t, houses, corner, casino }: { t: TileT; houses: number; corner: boolean; casino?: boolean }) {
  if (casino) {
    return (
      <>
        <div className="band" style={{ background: 'linear-gradient(90deg,#7c3aed,#db2777)' }}><span style={{ fontSize: '1.8cqw' }}>🎰</span></div>
        <div className="body">
          <div className="name">Casino</div>
          <div className="price">¡Apostá!</div>
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
      {state.settings.jackpot && (
        <div className="mt-[1cqw] rounded-full bg-gradient-to-r from-purple-700 to-pink-600 px-[2cqw] py-[0.5cqw] font-black text-yellow-300 shadow" style={{ fontSize: '1.7cqw', letterSpacing: '.05em' }} title="Doble seis se lo lleva">
          🎰 JACKPOT <AnimatedNumber value={state.jackpot} format={n => '₲ ' + (n * 1000).toLocaleString('es-PY')} />
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
