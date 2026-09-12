import type { TokenId } from '@nandepoly/engine';

/**
 * Piezas dibujadas del tablero: fichas paraguayas, casas, hoteles y las cartas de Suerte y Cooperativa.
 * Todo es SVG con degradés y sombra propia, así se ve el relieve y además se ve igual en Windows,
 * Android y iPhone (los emojis cambian de dibujo según el aparato).
 */

const light = (c: string) => `color-mix(in srgb, ${c} 55%, white)`;
const dark = (c: string) => `color-mix(in srgb, ${c} 68%, black)`;

/** Figura de cada ficha, dibujada en un cuadro de 40×40 y apoyada sobre la base (y ≈ 40). */
function figure(token: TokenId, c: string, id: string) {
  const g = `url(#g${id})`;
  const D = dark(c), L = light(c);
  switch (token) {
    case 'mate': // guampa paraguaya con bombilla
      return (
        <>
          <path d="M9.5 8 Q11.5 27 16.5 40 h7 Q28.5 27 30.5 8 Z" fill={g} stroke={D} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M13 12 Q14 28 17.5 38" stroke="#fff" strokeWidth="2" opacity=".45" fill="none" strokeLinecap="round" />
          <ellipse cx="20" cy="8" rx="10.5" ry="3.6" fill={L} stroke={D} strokeWidth="1.5" />
          <ellipse cx="20" cy="8.2" rx="7" ry="2.2" fill="#79a53c" />
          <path d="M25 6 L34 1.5" stroke={D} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M25 6 L34 1.5" stroke={L} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="34.5" cy="1.3" r="2.2" fill={L} stroke={D} strokeWidth="1.2" />
        </>
      );
    case 'chipa': // rosca de chipa
      return (
        <>
          <circle cx="20" cy="23" r="16" fill={g} stroke={D} strokeWidth="1.6" />
          <circle cx="20" cy="23" r="5.4" fill="#fdf6e6" stroke={D} strokeWidth="1.4" />
          <circle cx="12.4" cy="16.6" r="1.7" fill={D} opacity=".55" />
          <circle cx="27.6" cy="17.4" r="1.7" fill={D} opacity=".55" />
          <circle cx="28.4" cy="29.4" r="1.7" fill={D} opacity=".55" />
          <circle cx="12.6" cy="29.6" r="1.7" fill={D} opacity=".55" />
          <path d="M8.6 16.5 A15 15 0 0 1 18 9.4" stroke="#fff" strokeWidth="2.8" opacity=".5" fill="none" strokeLinecap="round" />
        </>
      );
    case 'nanduti': // ñandutí: encaje de telaraña
      return (
        <>
          <circle cx="20" cy="22" r="17" fill={L} stroke={D} strokeWidth="1.8" />
          <circle cx="20" cy="22" r="17" fill={g} opacity=".35" />
          <g stroke="#fff" strokeWidth="1.35" opacity=".95" fill="none">
            {[0, 30, 60, 90, 120, 150].map(a => (
              <line key={a} x1={20 - 16 * Math.cos(a * Math.PI / 180)} y1={22 - 16 * Math.sin(a * Math.PI / 180)}
                x2={20 + 16 * Math.cos(a * Math.PI / 180)} y2={22 + 16 * Math.sin(a * Math.PI / 180)} />
            ))}
            <circle cx="20" cy="22" r="5.5" /><circle cx="20" cy="22" r="11" />
          </g>
          <circle cx="20" cy="22" r="2.4" fill="#fff" />
        </>
      );
    case 'carreta': // carreta paraguaya
      return (
        <>
          <path d="M6 18 Q20 2 34 18 Z" fill={L} stroke={D} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9.5 17 Q20 6 30.5 17" stroke={D} strokeWidth="1" opacity=".5" fill="none" />
          <rect x="4" y="17.5" width="32" height="10.5" rx="2" fill={g} stroke={D} strokeWidth="1.5" />
          <path d="M5.5 20.5 h29" stroke="#fff" strokeWidth="1.8" opacity=".4" strokeLinecap="round" />
          <path d="M36 22 h3.2" stroke={D} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="33" r="6.6" fill={L} stroke={D} strokeWidth="1.7" />
          <circle cx="28" cy="33" r="6.6" fill={L} stroke={D} strokeWidth="1.7" />
          <g stroke={D} strokeWidth="1" opacity=".65">
            <line x1="12" y1="26.8" x2="12" y2="39.2" /><line x1="5.6" y1="33" x2="18.4" y2="33" />
            <line x1="28" y1="26.8" x2="28" y2="39.2" /><line x1="21.6" y1="33" x2="34.4" y2="33" />
          </g>
          <circle cx="12" cy="33" r="2" fill={D} /><circle cx="28" cy="33" r="2" fill={D} />
        </>
      );
    case 'jaguarete': // cabeza de jaguareté
      return (
        <>
          <path d="M7 13 Q5 3 13.5 6.5 Z" fill={g} stroke={D} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M33 13 Q35 3 26.5 6.5 Z" fill={g} stroke={D} strokeWidth="1.5" strokeLinejoin="round" />
          <ellipse cx="20" cy="23" rx="16" ry="15.5" fill={g} stroke={D} strokeWidth="1.7" />
          <ellipse cx="20" cy="28" rx="9" ry="8" fill={L} opacity=".75" />
          <ellipse cx="14.2" cy="20" rx="2.4" ry="3" fill="#20170a" />
          <ellipse cx="25.8" cy="20" rx="2.4" ry="3" fill="#20170a" />
          <circle cx="14.9" cy="19" r=".8" fill="#fff" /><circle cx="26.5" cy="19" r=".8" fill="#fff" />
          <path d="M20 26.5 l-2.6 2.2 h5.2z" fill="#20170a" />
          <path d="M20 28.7 v2.2 M20 30.9 q-2.6 2.2 -5 .2 M20 30.9 q2.6 2.2 5 .2" stroke="#20170a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <g stroke={D} strokeWidth="1.1" opacity=".75" strokeLinecap="round">
            <line x1="4.5" y1="26" x2="11" y2="27" /><line x1="4.5" y1="30" x2="11" y2="30" />
            <line x1="35.5" y1="26" x2="29" y2="27" /><line x1="35.5" y1="30" x2="29" y2="30" />
          </g>
          <circle cx="9" cy="15" r="1.7" fill={D} opacity=".55" /><circle cx="31" cy="15" r="1.7" fill={D} opacity=".55" />
        </>
      );
    default: // arpa paraguaya
      return (
        <>
          <path d="M12 40 V16 Q12 4 32 2 Q22 13 21 25 V40 Z" fill={g} stroke={D} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 16 Q13 6 29 3" stroke={L} strokeWidth="3" fill="none" strokeLinecap="round" />
          <g stroke="#fff" strokeWidth="1.3" opacity=".95" strokeLinecap="round">
            {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={13.4 + i * 1.15} y1={36 - i * 5.4} x2={20.6 - i * 0.55} y2={36 - i * 5.4} />)}
          </g>
          <path d="M10.5 40 h12.5" stroke={D} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M14 36 V18" stroke="#fff" strokeWidth="1.4" opacity=".3" strokeLinecap="round" />
        </>
      );
  }
}

/** Ficha de un jugador: la figura en su color, con base y sombra para que se vea apoyada. */
export function PlayerToken({ token, color, size, title }: { token: TokenId; color: string; size?: string; title?: string }) {
  const id = `${token}-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox="0 0 40 48" className="piece-token" style={size ? { width: size, height: size } : undefined} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor={light(color)} /><stop offset=".55" stopColor={color} /><stop offset="1" stopColor={dark(color)} />
        </linearGradient>
        <radialGradient id={`b${id}`} cx=".4" cy=".35" r=".8">
          <stop offset="0" stopColor={light(color)} /><stop offset="1" stopColor={dark(color)} />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="44.6" rx="14.5" ry="3.4" fill="#000" opacity=".32" />
      <ellipse cx="20" cy="42" rx="14.5" ry="4.2" fill={`url(#b${id})`} stroke={dark(color)} strokeWidth="1.3" />
      <ellipse cx="20" cy="40.8" rx="10.5" ry="2.6" fill={light(color)} opacity=".5" />
      <g>{figure(token, color, id)}</g>
    </svg>
  );
}

/** Casa con techo iluminado, paredes con degradé y sombra sobre la casilla. */
export function House() {
  return (
    <svg viewBox="0 0 24 22" className="piece-house" aria-hidden="true">
      <defs>
        <linearGradient id="phr" x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stopColor="#ff7a6b" /><stop offset=".45" stopColor="#d93025" /><stop offset="1" stopColor="#7d1010" /></linearGradient>
        <linearGradient id="phw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fffdf6" /><stop offset=".55" stopColor="#efe4cd" /><stop offset="1" stopColor="#bda98a" /></linearGradient>
      </defs>
      <ellipse cx="12" cy="20.4" rx="9" ry="1.6" fill="#000" opacity=".32" />
      <path d="M3.2 10.4 L12 3.4 L20.8 10.4 V19.4 H3.2 Z" fill="url(#phw)" stroke="#6b4f2a" strokeWidth=".8" />
      <path d="M0.8 10.6 L12 1.2 L23.2 10.6 L20.6 12.3 L12 5 L3.4 12.3 Z" fill="url(#phr)" stroke="#5e0c0c" strokeWidth=".7" strokeLinejoin="round" />
      <rect x="9.7" y="13.4" width="4.6" height="6" rx=".5" fill="#6b4f2a" />
      <rect x="5" y="12.6" width="3.2" height="3.2" rx=".4" fill="#8fd3ef" stroke="#6b4f2a" strokeWidth=".6" />
      <rect x="15.8" y="12.6" width="3.2" height="3.2" rx=".4" fill="#8fd3ef" stroke="#6b4f2a" strokeWidth=".6" />
    </svg>
  );
}

/** Hotel: bloque con cara iluminada, cara en sombra y ventanas encendidas. */
export function Hotel() {
  return (
    <svg viewBox="0 0 44 28" className="piece-hotel" aria-hidden="true">
      <defs>
        <linearGradient id="ptw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c0392b" /><stop offset=".5" stopColor="#9b1c1c" /><stop offset="1" stopColor="#5d0b0b" /></linearGradient>
        <linearGradient id="ptr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8d1717" /><stop offset="1" stopColor="#480707" /></linearGradient>
      </defs>
      <ellipse cx="22" cy="26.2" rx="17" ry="1.8" fill="#000" opacity=".36" />
      <path d="M2 9.5 L22 2 L42 9.5 L39 11.4 L22 5 L5 11.4 Z" fill="url(#ptr)" />
      <rect x="5" y="10.8" width="34" height="14.6" rx="1" fill="url(#ptw)" stroke="#3a0606" strokeWidth=".9" />
      <rect x="5" y="10.8" width="10" height="14.6" fill="#fff" opacity=".13" />
      {[0, 1, 2, 3].map(i => <rect key={i} x={8 + i * 7.6} y="13.4" width="4.4" height="4" rx=".4" fill="#ffe08a" stroke="#3a0606" strokeWidth=".5" />)}
      <rect x="18.8" y="19.6" width="6.4" height="5.8" rx=".5" fill="#2c0404" />
    </svg>
  );
}

/** Mazo de cartas para las casillas de Suerte y Cooperativa: se ven las cartas, no un emoji. */
export function CardStack({ kind }: { kind: 'chance' | 'community' }) {
  const face = kind === 'chance' ? '#FFCA28' : '#4FC3F7';
  const edge = kind === 'chance' ? '#8d6a06' : '#0b5d86';
  const back = kind === 'chance' ? '#FFE9A8' : '#BEE7FB';
  return (
    <svg viewBox="0 0 34 30" className="piece-cards" aria-hidden="true">
      <g transform="rotate(-12 17 17)"><rect x="6" y="4" width="20" height="24" rx="2.6" fill={back} stroke={edge} strokeWidth="1.1" /></g>
      <g transform="rotate(-5 17 17)"><rect x="7" y="3" width="20" height="24" rx="2.6" fill="#fff" stroke={edge} strokeWidth="1.1" /></g>
      <g transform="rotate(5 17 17)">
        <rect x="7" y="2.5" width="20" height="24" rx="2.6" fill={face} stroke={edge} strokeWidth="1.3" />
        <rect x="9.4" y="4.8" width="15.2" height="19.4" rx="1.8" fill="#fff" opacity=".45" />
        <text x="17" y="19" textAnchor="middle" fontSize="14" fontWeight="900" fill={edge}>{kind === 'chance' ? '?' : '★'}</text>
      </g>
    </svg>
  );
}
