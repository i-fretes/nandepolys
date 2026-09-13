import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Ambiente "en la casa de alguien": el tablero está apoyado sobre una mesa de tablones de madera,
 * con una alfombra roja tipo ñandutí debajo y el piso de parquet alrededor; una lámpara cálida cae
 * sobre el centro. Todo es SVG fijo detrás de la partida (los paneles quedan igual, sólo cambia el fondo).
 * Los objetos de la mesa (termo, guampa, chipa, dados…) los pone <TableProps /> al costado del tablero.
 */
/** Geometría de la mesa en fracciones del ancho de la ventana (la usan el fondo y los objetos). */
export const TABLE_LEFT = 0.13, TABLE_RIGHT = 0.87;
const RUG_LEFT = 0.09, RUG_RIGHT = 0.91;
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const TW = pct(TABLE_RIGHT - TABLE_LEFT), TX = pct(TABLE_LEFT);

export function HouseBackground() {
  return (
    <svg className="house-bg" aria-hidden width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Vetas de madera: ruido alargado que oscurece a tramos */}
        <filter id="hb-wood" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="4" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="0" k2="1" k3="-.9" k4="0" />
        </filter>
        <filter id="hb-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .08 0" /></filter>
        <filter id="hb-fabric"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="5" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 0" /></filter>
        <filter id="hb-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18" /></filter>
        {/* Parquet espina de pez */}
        <pattern id="hb-herring" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale(.9)">
          <rect width="120" height="120" fill="#a67a48" />
          <rect x="0" y="0" width="60" height="20" fill="#b58753" /><rect x="60" y="0" width="60" height="20" fill="#9e7040" />
          <rect x="0" y="20" width="60" height="20" fill="#9c6e3f" /><rect x="60" y="20" width="60" height="20" fill="#b3854f" />
          <rect x="0" y="40" width="60" height="20" fill="#ad7e4a" /><rect x="60" y="40" width="60" height="20" fill="#a37545" />
          <rect x="0" y="60" width="60" height="20" fill="#a07242" /><rect x="60" y="60" width="60" height="20" fill="#b7895a" />
          <rect x="0" y="80" width="60" height="20" fill="#b2844d" /><rect x="60" y="80" width="60" height="20" fill="#996b3c" />
          <rect x="0" y="100" width="60" height="20" fill="#a87a48" /><rect x="60" y="100" width="60" height="20" fill="#af8150" />
          <path d="M0 20H120M0 40H120M0 60H120M0 80H120M0 100H120M60 0V120" stroke="#5a3a1c" strokeOpacity=".55" strokeWidth="1.5" />
        </pattern>
        {/* Tejido de la alfombra (guarda tipo ñandutí) */}
        <pattern id="hb-rug" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="#8e2f2b" />
          <path d="M24 4 L44 24 L24 44 L4 24 Z" fill="none" stroke="#e7c99a" strokeWidth="2" />
          <circle cx="24" cy="24" r="6" fill="none" stroke="#e7c99a" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="4" fill="#2e6b4f" /><circle cx="48" cy="0" r="4" fill="#2e6b4f" /><circle cx="0" cy="48" r="4" fill="#2e6b4f" /><circle cx="48" cy="48" r="4" fill="#2e6b4f" />
        </pattern>
        {/* Tablones de la mesa */}
        <pattern id="hb-planks" width="944" height="40" patternUnits="userSpaceOnUse">
          {['#7a4a25', '#70431f', '#7e4e29', '#6b3f1d', '#774826', '#6f4321', '#7c4c28', '#6d401e'].map((c, i) => (
            <g key={i}><rect x={i * 118} y="0" width="118" height="40" fill={c} /><rect x={i * 118} y="0" width="2" height="40" fill="#3a220e" fillOpacity=".7" /></g>
          ))}
        </pattern>
        <radialGradient id="hb-lamp" cx="50%" cy="46%" r="60%">
          <stop offset="0" stopColor="#ffe2b0" stopOpacity=".55" /><stop offset=".45" stopColor="#ffcf8a" stopOpacity=".16" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hb-vig" cx="50%" cy="50%" r="72%">
          <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#1a0b03" stopOpacity=".75" />
        </radialGradient>
        <linearGradient id="hb-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a3617" /><stop offset="1" stopColor="#3a220e" /></linearGradient>
        <linearGradient id="hb-varnish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a5a2e" /><stop offset=".5" stopColor="#7a4d26" /><stop offset="1" stopColor="#65401f" /></linearGradient>
      </defs>

      {/* Piso */}
      <rect width="100%" height="100%" fill="url(#hb-herring)" />
      <rect width="100%" height="100%" filter="url(#hb-grain)" />
      <rect width="100%" height="100%" fill="#2a1608" opacity=".35" />

      {/* Alfombra (con flecos) */}
      <g className="house-rug">
        <rect x={pct(RUG_LEFT)} y="1.5%" width={pct(RUG_RIGHT - RUG_LEFT)} height="97%" rx="10" fill="#6d1f1c" />
        <rect x={pct(RUG_LEFT + 0.008)} y="3%" width={pct(RUG_RIGHT - RUG_LEFT - 0.016)} height="94%" rx="6" fill="url(#hb-rug)" />
        <rect x={pct(RUG_LEFT + 0.008)} y="3%" width={pct(RUG_RIGHT - RUG_LEFT - 0.016)} height="94%" filter="url(#hb-fabric)" />
      </g>

      {/* Sombra de la mesa sobre el piso */}
      <rect className="house-table" x={TX} y="3.5%" width={TW} height="94%" rx="40" fill="#000" opacity=".5" filter="url(#hb-soft)" />

      {/* Mesa: canto, tablones, vetas, barniz */}
      <g className="house-table">
        <rect x={pct(TABLE_LEFT - 0.004)} y="2.5%" width={pct(TABLE_RIGHT - TABLE_LEFT + 0.008)} height="95.4%" rx="34" fill="url(#hb-edge)" />
        <rect x={TX} y="3%" width={TW} height="94%" rx="30" fill="url(#hb-planks)" />
        <rect x={TX} y="3%" width={TW} height="94%" rx="30" filter="url(#hb-wood)" fill="#3a200c" opacity=".55" />
        <rect x={TX} y="3%" width={TW} height="94%" rx="30" fill="url(#hb-varnish)" opacity=".35" />
        <rect x={TX} y="3%" width={TW} height="94%" rx="30" fill="none" stroke="#e2b27a" strokeOpacity=".3" strokeWidth="2" />
      </g>

      {/* Luz de lámpara y viñeta */}
      <rect width="100%" height="100%" fill="url(#hb-lamp)" />
      <rect width="100%" height="100%" fill="url(#hb-vig)" />
    </svg>
  );
}

/* ---------- Objetos sobre la mesa ---------- */

function Dice() {
  return (
    <svg viewBox="0 0 130 100" width="130" height="100">
      <g transform="translate(40 46) rotate(-18)">
        <rect x="-20" y="-16" width="44" height="44" rx="9" fill="#000" opacity=".35" />
        <rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff8ee" stroke="#d8ccb6" />
        <circle cx="0" cy="0" r="4.2" fill="#d62828" />
      </g>
      <g transform="translate(92 60) rotate(25)">
        <rect x="-20" y="-16" width="44" height="44" rx="9" fill="#000" opacity=".35" />
        <rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff8ee" stroke="#d8ccb6" />
        {[[-9, -9], [9, 9], [-9, 9], [9, -9]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.2" fill="#d62828" />)}
      </g>
    </svg>
  );
}

function ChipaPlate() {
  return (
    <svg viewBox="0 0 180 180" width="180" height="180">
      <defs>
        <radialGradient id="hp-chipa" cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#f1c675" /><stop offset=".7" stopColor="#d9994a" /><stop offset="1" stopColor="#a86a2a" /></radialGradient>
        <radialGradient id="hp-plate" cx=".5" cy=".45" r=".6"><stop offset="0" stopColor="#ffffff" /><stop offset=".85" stopColor="#e9e4dc" /><stop offset="1" stopColor="#c9c2b8" /></radialGradient>
      </defs>
      <g transform="translate(90 86)">
        <ellipse cx="4" cy="14" rx="86" ry="78" fill="#000" opacity=".4" />
        <circle cx="0" cy="0" r="82" fill="url(#hp-plate)" />
        <circle cx="0" cy="0" r="66" fill="none" stroke="#c9c2b8" strokeWidth="2" />
        <circle cx="0" cy="0" r="72" fill="none" stroke="#d62828" strokeOpacity=".5" strokeWidth="3" />
        {[[-22, -14, 0], [22, -6, 30], [-2, 26, -20]].map(([x, y, r]) => (
          <g key={`${x}${y}`} transform={`translate(${x} ${y}) rotate(${r})`}>
            <ellipse cx="2" cy="5" rx="30" ry="24" fill="#000" opacity=".25" />
            <ellipse cx="0" cy="0" rx="30" ry="24" fill="url(#hp-chipa)" />
            <ellipse cx="0" cy="0" rx="11" ry="8" fill="#e9dcc3" />
            <ellipse cx="0" cy="1" rx="9" ry="6" fill="#d7c4a1" />
            <circle cx="-14" cy="-8" r="2" fill="#8a4d16" /><circle cx="12" cy="-10" r="2" fill="#8a4d16" /><circle cx="16" cy="9" r="2" fill="#8a4d16" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Thermo() {
  return (
    <svg viewBox="0 0 120 240" width="120" height="240">
      <defs>
        <linearGradient id="hp-thermo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1b4f86" /><stop offset=".45" stopColor="#3b82c4" /><stop offset=".6" stopColor="#2a6aab" /><stop offset="1" stopColor="#143b66" /></linearGradient>
        <linearGradient id="hp-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a8f96" /><stop offset=".5" stopColor="#e6e9ec" /><stop offset="1" stopColor="#6f757c" /></linearGradient>
      </defs>
      <g transform="translate(50 116) rotate(10)">
        <ellipse cx="6" cy="120" rx="46" ry="18" fill="#000" opacity=".4" />
        <rect x="-28" y="-90" width="60" height="200" rx="26" fill="url(#hp-thermo)" />
        <rect x="-28" y="-90" width="60" height="30" rx="14" fill="url(#hp-steel)" />
        <rect x="-18" y="-60" width="12" height="140" rx="6" fill="#fff" opacity=".18" />
        <path d="M32 -40 q30 40 0 90" stroke="#0d2a4a" strokeWidth="10" fill="none" strokeLinecap="round" />
        <text x="2" y="30" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="16" fill="#fff" opacity=".8">PY</text>
      </g>
    </svg>
  );
}

function Guampa() {
  return (
    <svg viewBox="0 0 120 190" width="120" height="190">
      <defs>
        <linearGradient id="hp-horn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a4a3a" /><stop offset=".5" stopColor="#8a7560" /><stop offset="1" stopColor="#2f251b" /></linearGradient>
        <linearGradient id="hp-steel2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a8f96" /><stop offset=".5" stopColor="#e6e9ec" /><stop offset="1" stopColor="#6f757c" /></linearGradient>
      </defs>
      <g transform="translate(56 118) rotate(-8)">
        <ellipse cx="0" cy="58" rx="42" ry="16" fill="#000" opacity=".45" />
        <path d="M-30 -30 C-34 10 -26 40 -14 62 L14 62 C28 40 34 10 30 -30 Z" fill="url(#hp-horn)" />
        <path d="M-22 -20 C-24 10 -18 36 -10 56" stroke="#fff" strokeOpacity=".18" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="-33" y="-36" width="66" height="14" rx="4" fill="url(#hp-steel2)" />
        <ellipse cx="0" cy="-30" rx="30" ry="10" fill="#7fb04a" />
        <line x1="10" y1="-34" x2="42" y2="-110" stroke="url(#hp-steel2)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="43" cy="-112" r="5" fill="#d9dde2" />
      </g>
    </svg>
  );
}

function Deck() {
  return (
    <svg viewBox="0 0 170 130" width="170" height="130">
      <g transform="translate(88 70) rotate(-14)">
        <rect x="-52" y="-30" width="118" height="84" rx="10" fill="#000" opacity=".4" />
        {[6, 4, 2, 0].map(o => <rect key={o} x={-60 + o} y={-40 - o} width="118" height="84" rx="10" fill="#f8ecd0" stroke="#c9b489" />)}
        <rect x="-52" y="-32" width="102" height="68" rx="6" fill="none" stroke="#e08a1f" strokeWidth="3" />
        <text x="-1" y="10" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="22" fill="#b4640f">SUERTE</text>
      </g>
    </svg>
  );
}

function Bills() {
  return (
    <svg viewBox="0 0 200 110" width="200" height="110">
      <g transform="translate(96 62) rotate(6)">
        {[[0, 0, '#2E8B57'], [14, -8, '#1F4E9A'], [28, -16, '#D62828']].map(([x, y, c]) => (
          <g key={c} transform={`translate(${x} ${y}) rotate(-6)`}>
            <rect x="-70" y="-30" width="140" height="60" rx="4" fill={String(c)} />
            <rect x="-64" y="-24" width="128" height="48" rx="3" fill="none" stroke="#fff" strokeOpacity=".6" />
            <circle cx="0" cy="0" r="16" fill="#fff" opacity=".85" />
            <text x="0" y="6" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="15" fill={String(c)}>₲</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Objetos apoyados en la mesa a los costados del tablero. Sólo aparecen si sobra lugar entre el
 * tablero y los paneles (nunca encima del tablero ni de un botón). Se acomodan al ancho libre.
 */
export function TableProps({ colRef, boardRef }: { colRef: React.RefObject<HTMLElement>; boardRef: React.RefObject<HTMLElement> }) {
  const [geo, setGeo] = useState({ left: [0, 0] as [number, number], right: [0, 0] as [number, number], height: 0 });
  const raf = useRef(0);
  useEffect(() => {
    const col = colRef.current, board = boardRef.current;
    if (!col || !board) return;
    const measure = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const c = col.getBoundingClientRect(), b = board.getBoundingClientRect();
        // Zona libre a cada lado: entre el borde de la mesa (o de la columna) y el tablero, en coordenadas de la columna
        const tableL = Math.max(0, window.innerWidth * TABLE_LEFT + 24 - c.left);
        const tableR = Math.min(c.width, window.innerWidth * TABLE_RIGHT - 24 - c.left);
        setGeo({ left: [tableL, b.left - c.left], right: [b.right - c.left, tableR], height: c.height });
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(col); ro.observe(board);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, [colRef, boardRef]);

  const { left, right, height } = geo;
  const lw = left[1] - left[0], rw = right[1] - right[0];
  // Con menos de ~120 px libres no entra nada sin tapar el tablero; los objetos se achican al ancho libre
  const sl = useMemo(() => Math.min(1, lw / 210), [lw]);
  const sr = useMemo(() => Math.min(1, rw / 210), [rw]);
  if (height < 500) return null;
  const prop = (x: number, y: number, scale: number, el: React.ReactNode, key: string) => (
    <div key={key} className="house-prop" style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${scale})` }}>{el}</div>
  );
  const lx = (left[0] + left[1]) / 2, rx = (right[0] + right[1]) / 2;
  return (
    <div className="house-props" aria-hidden>
      {lw >= 120 && prop(lx, height * 0.16, sl, <Dice />, 'dice')}
      {lw >= 120 && prop(lx, height * 0.72, sl, <ChipaPlate />, 'chipa')}
      {rw >= 120 && prop(rx, height * 0.13, sr, <Deck />, 'deck')}
      {rw >= 120 && prop(rx, height * 0.42, sr, <Thermo />, 'thermo')}
      {rw >= 120 && prop(rx, height * 0.7, sr, <Guampa />, 'guampa')}
      {rw >= 170 && prop(rx, height * 0.9, sr, <Bills />, 'bills')}
    </div>
  );
}
