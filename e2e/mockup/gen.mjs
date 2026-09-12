// Genera la imagen de cómo se vería el tablero con la piel 2D: casas y hoteles con relieve,
// fichas con volumen (cilindro con pared lateral, brillo y sombra) y nombres que entran completos.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const src = readFileSync(new URL('../../packages/engine/src/board.ts', import.meta.url), 'utf8');
const tiles = [];
for (const m of src.matchAll(/street\((\d+), '([^']+)', '(\w+)', (\d+)/g)) tiles[+m[1]] = { id: +m[1], type: 'street', name: m[2], group: m[3], price: +m[4] };
for (const m of src.matchAll(/\{ id: (\d+), type: '(\w+)', name: '([^']+)'(?:, price: (\d+))?/g)) tiles[+m[1]] = { id: +m[1], type: m[2], name: m[3], price: m[4] ? +m[4] : 0 };

const COLORS = { marron: '#8B4513', celeste: '#6EC1E4', rosa: '#E75480', naranja: '#F7941D', rojo: '#D62828', amarillo: '#F4D03F', verde: '#2E8B57', azul: '#1F4E9A' };
const ICON = { go: '🏁', jail: '🔒', parking: '🅿️', gotojail: '🚔', casino: '🎰', arena: '🏟️', chance: '❓', community: '🤝', tax: '💸', transport: '🚌', utility: '💡' };
// Nombres cortos para las casillas largas (así ninguno queda cortado)
const SHORT = { 'Estacionamiento Libre': 'Estacio-<br>namiento<br>Libre', 'Impuesto a la Renta (SET)': 'Impuesto<br>Renta (SET)', 'Aeropuerto Silvio Pettirossi': 'Aeropuerto<br>Pettirossi', 'Terminal de Ómnibus': 'Terminal de<br>Ómnibus', 'Av. Aviadores del Chaco': 'Av. Aviadores<br>del Chaco', 'Mariano Roque Alonso': 'Mariano<br>R. Alonso', 'Pedro Juan Caballero': 'Pedro Juan<br>Caballero', 'Fernando de la Mora': 'Fernando<br>de la Mora', 'Costanera de Asunción': 'Costanera<br>Asunción', 'Puente de la Amistad': 'Puente de<br>la Amistad', 'Av. Mariscal López': 'Av. Mcal.<br>López', 'Vaya a Tacumbú': 'Vaya a<br>Tacumbú', 'Puerto de Asunción': 'Puerto de<br>Asunción', 'Encarnación': 'Encar-<br>nación', 'Concepción': 'Concep-<br>ción', 'Mburucuyá': 'Mburu-<br>cuyá', 'Cooperativa': 'Coope-<br>rativa', 'Av. Aviadores del Chaco': 'Av. Avia-<br>dores del<br>Chaco', 'Pedro Juan Caballero': 'Pedro<br>Juan<br>Caballero', 'Impuesto al lujo': 'Impuesto<br>al lujo', 'Costanera de Asunción': 'Costanera<br>de Asunción', 'Las Carmelitas': 'Las<br>Carmelitas', 'Palacio de López': 'Palacio<br>de López', 'Villa Morra': 'Villa<br>Morra', 'Mariano Roque Alonso': 'Mariano<br>R. Alonso', 'Fernando de la Mora': 'Fernando<br>de la Mora', 'Aeropuerto Silvio Pettirossi': 'Aeropuerto<br>Pettirossi', 'Ciudad del Este': 'Ciudad<br>del Este', 'Av. Mariscal López': 'Av. Mcal.<br>López', 'San Lorenzo': 'San<br>Lorenzo', 'Coronel Oviedo': 'Coronel<br>Oviedo', 'Villa Hayes': 'Villa<br>Hayes', 'Puente de la Amistad': 'Puente de<br>la Amistad', 'Impuesto a la Renta (SET)': 'Impuesto<br>Renta<br>(SET)' };

const OWN = { 1: 'A', 3: 'A', 7: 'B', 9: 'B', 10: 'B', 12: 'C', 14: 'C', 18: 'A', 20: 'A', 21: 'A', 23: 'D', 26: 'D', 29: 'B', 30: 'B', 32: 'B', 34: 'C', 41: 'D', 43: 'D', 5: 'C', 16: 'A', 13: 'D', 31: 'B' };
const HOUSES = { 1: 2, 3: 3, 7: 1, 9: 1, 10: 4, 18: 5, 20: 3, 21: 2, 29: 5, 30: 2, 32: 1, 41: 1, 43: 5 };
const PCOL = { A: '#D62828', B: '#1F4E9A', C: '#2E8B57', D: '#F7941D' };
const PDARK = { A: '#8d1414', B: '#12305e', C: '#1b5334', D: '#a35c07' };

// --- Emblemas de las fichas (van grabados en la cara de arriba) ---
const EMB = {
  mate: `<path d="M8 11h16l-1.7 13.5a4.5 4.5 0 0 1-4.5 4h-3.6a4.5 4.5 0 0 1-4.5-4z" fill="#7b4a22" stroke="#3b2110" stroke-width="1.6"/><ellipse cx="16" cy="11" rx="8" ry="3" fill="#8fbf4d" stroke="#3b2110" stroke-width="1.2"/><path d="M19 10L27 2" stroke="#9aa3ad" stroke-width="2.6" stroke-linecap="round"/>`,
  chipa: `<circle cx="16" cy="17" r="10.5" fill="#e0a54a" stroke="#7a4d12" stroke-width="1.8"/><circle cx="16" cy="17" r="3.6" fill="#f6ead0" stroke="#7a4d12" stroke-width="1.3"/><circle cx="11" cy="12.5" r="1.1" fill="#7a4d12"/><circle cx="21.5" cy="13" r="1.1" fill="#7a4d12"/><circle cx="21" cy="22" r="1.1" fill="#7a4d12"/>`,
  jaguarete: `<circle cx="16" cy="18" r="10" fill="#e8b13c" stroke="#5a3a0a" stroke-width="1.7"/><circle cx="8.5" cy="10.5" r="3.2" fill="#e8b13c" stroke="#5a3a0a" stroke-width="1.6"/><circle cx="23.5" cy="10.5" r="3.2" fill="#e8b13c" stroke="#5a3a0a" stroke-width="1.6"/><circle cx="12.4" cy="16.5" r="1.7" fill="#241a08"/><circle cx="19.6" cy="16.5" r="1.7" fill="#241a08"/><path d="M13.4 21.5q2.6 2.4 5.2 0" stroke="#241a08" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  carreta: `<rect x="5" y="10" width="19" height="8.5" rx="1.6" fill="#a0522d" stroke="#4a2410" stroke-width="1.6"/><circle cx="10" cy="23" r="4.4" fill="#deb887" stroke="#4a2410" stroke-width="1.6"/><circle cx="21" cy="23" r="4.4" fill="#deb887" stroke="#4a2410" stroke-width="1.6"/><path d="M24 13.5h5.5" stroke="#4a2410" stroke-width="1.8" stroke-linecap="round"/>`,
};

/** Ficha: pieza con base, pared lateral marcada, cara grabada, brillo y sombra proyectada. */
function token(kind, color, dark) {
  const uid = kind + color.replace('#', '');
  return `<svg viewBox="0 0 52 64" class="tokSvg">
  <defs>
    <linearGradient id="w${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".28" stop-color="#fff" stop-opacity=".10"/>
      <stop offset=".62" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
    </linearGradient>
    <radialGradient id="f${uid}" cx=".36" cy=".28" r=".85">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f6f1e4"/><stop offset="1" stop-color="#cfc4a9"/>
    </radialGradient>
  </defs>
  <ellipse cx="26" cy="57" rx="21" ry="5.5" fill="#000" opacity=".45"/>
  <!-- base ensanchada -->
  <ellipse cx="26" cy="52" rx="21" ry="8" fill="${dark}"/>
  <rect x="5" y="46" width="42" height="6" fill="${dark}"/>
  <ellipse cx="26" cy="46" rx="21" ry="8" fill="${color}"/>
  <!-- cuerpo -->
  <rect x="8" y="22" width="36" height="24" fill="${color}"/>
  <rect x="8" y="22" width="36" height="24" fill="url(#w${uid})"/>
  <path d="M8 46 a18 7.5 0 0 0 36 0" fill="none" stroke="#00000055" stroke-width="1.5"/>
  <!-- cara de arriba -->
  <ellipse cx="26" cy="22" rx="18" ry="7.5" fill="${color}" stroke="${dark}" stroke-width="1.4"/>
  <ellipse cx="26" cy="21" rx="14.5" ry="6" fill="url(#f${uid})" stroke="${dark}" stroke-width="1"/>
  <g transform="translate(26 21) scale(0.36) translate(-16 -17)">${EMB[kind]}</g>
  <!-- brillo -->
  <path d="M11 24 q3 -7 14 -8" stroke="#fff" stroke-width="2.4" opacity=".5" fill="none" stroke-linecap="round"/>
  <path d="M11 30 v13" stroke="#fff" stroke-width="2.2" opacity=".22" stroke-linecap="round"/>
</svg>`;
}

const TOKENS = { A: { pos: 18, kind: 'mate' }, B: { pos: 30, kind: 'chipa' }, C: { pos: 11, kind: 'jaguarete' }, D: { pos: 39, kind: 'carreta' } };

/** Casa con relieve: techo a dos aguas con luz, paredes con degradé, ventanas y sombra. */
const house = () => `<svg viewBox="0 0 24 22" class="house">
  <defs>
    <linearGradient id="hr" x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stop-color="#ff7a6b"/><stop offset=".45" stop-color="#d93025"/><stop offset="1" stop-color="#7d1010"/></linearGradient>
    <linearGradient id="hw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffdf6"/><stop offset=".55" stop-color="#efe4cd"/><stop offset="1" stop-color="#bda98a"/></linearGradient>
  </defs>
  <ellipse cx="12" cy="20.4" rx="9.2" ry="1.7" fill="#000" opacity=".34"/>
  <path d="M3.2 10.4 L12 3.4 L20.8 10.4 V19.4 H3.2 Z" fill="url(#hw)" stroke="#6b4f2a" stroke-width=".8"/>
  <path d="M0.8 10.6 L12 1.2 L23.2 10.6 L20.6 12.3 L12 5 L3.4 12.3 Z" fill="url(#hr)" stroke="#5e0c0c" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M12 1.2 L12 5" stroke="#ffb4a8" stroke-width=".8" opacity=".8"/>
  <rect x="9.6" y="13.4" width="4.8" height="6" rx=".5" fill="#6b4f2a"/>
  <rect x="4.9" y="12.6" width="3.4" height="3.4" rx=".4" fill="#8fd3ef" stroke="#6b4f2a" stroke-width=".6"/>
  <rect x="15.7" y="12.6" width="3.4" height="3.4" rx=".4" fill="#8fd3ef" stroke="#6b4f2a" stroke-width=".6"/>
</svg>`;

/** Hotel con relieve: bloque de dos cuerpos, cara lateral más oscura, ventanas encendidas. */
const hotel = () => `<svg viewBox="0 0 44 28" class="hotel">
  <defs>
    <linearGradient id="tw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c0392b"/><stop offset=".5" stop-color="#9b1c1c"/><stop offset="1" stop-color="#5d0b0b"/></linearGradient>
    <linearGradient id="tr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d1717"/><stop offset="1" stop-color="#480707"/></linearGradient>
  </defs>
  <ellipse cx="22" cy="26.2" rx="18" ry="2" fill="#000" opacity=".38"/>
  <path d="M2 9.5 L22 2 L42 9.5 L39 11.4 L22 5 L5 11.4 Z" fill="url(#tr)"/>
  <rect x="5" y="10.8" width="34" height="14.6" rx="1" fill="url(#tw)" stroke="#3a0606" stroke-width=".9"/>
  <rect x="5" y="10.8" width="10" height="14.6" fill="#fff" opacity=".13"/>
  ${[0, 1, 2, 3].map(i => `<rect x="${8 + i * 7.6}" y="13.4" width="4.6" height="4.2" rx=".4" fill="#ffe08a" stroke="#3a0606" stroke-width=".5"/>`).join('')}
  <rect x="18.6" y="19.6" width="6.8" height="5.8" rx=".5" fill="#2c0404"/>
  <rect x="5" y="10.2" width="34" height="1.4" fill="#e8b4b4" opacity=".7"/>
</svg>`;

function cell(id) {
  if (id <= 11) return { r: 12, c: 12 - id };
  if (id <= 22) return { r: 12 - (id - 11), c: 1 };
  if (id <= 33) return { r: 1, c: 1 + (id - 22) };
  return { r: 1 + (id - 33), c: 12 };
}
const side = id => id <= 11 ? 'bottom' : id <= 22 ? 'left' : id <= 33 ? 'top' : 'right';

let html = '';
for (const t of tiles) {
  const { r, c } = cell(t.id);
  const isCorner = [0, 11, 22, 33].includes(t.id);
  const owner = OWN[t.id]; const h = HOUSES[t.id] ?? 0;
  const strip = t.type === 'street' ? `<div class="strip" style="background:linear-gradient(to bottom, ${COLORS[t.group]}, ${COLORS[t.group]}cc)"></div>` : '';
  const build = h === 5 ? `<div class="builds">${hotel()}</div>` : h ? `<div class="builds">${Array.from({ length: h }, house).join('')}</div>` : '';
  const ownerTag = owner ? `<div class="owner" style="background:${PCOL[owner]}"></div>` : '';
  const toks = Object.entries(TOKENS).filter(([, v]) => v.pos === t.id).map(([k, v]) => `<div class="tok">${token(v.kind, PCOL[k], PDARK[k])}</div>`).join('');
  const nm = SHORT[t.name] ?? t.name;
  const label = t.type === 'street' ? `<div class="name">${nm}</div><div class="price">${t.price} mil</div>` : `<div class="ico">${ICON[t.type] ?? ''}</div><div class="name">${nm}</div>`;
  html += `<div class="tile ${side(t.id)} ${isCorner ? 'corner' : ''} ${t.type}" style="grid-row:${r};grid-column:${c}">${strip}${ownerTag}<div class="body">${label}</div>${build}<div class="toks">${toks}</div></div>`;
}

const css = `
* { box-sizing: border-box } body { margin:0; background:#14201a; font-family: Inter, system-ui, sans-serif; color:#1F2A37 }
.scene { width: 1480px; padding: 26px 34px; display:flex; gap: 34px; align-items:flex-start; background: radial-gradient(circle at 50% 25%, #33513a, #111a14 72%) }
.stage { perspective: 1700px; width: 660px; }
.board { position:relative; width: 660px; height: 660px; display:grid; grid-template-columns: 1.6fr repeat(10,1fr) 1.6fr; grid-template-rows: 1.6fr repeat(10,1fr) 1.6fr; background:#31432f; border: 4px solid #2a3a28; border-radius: 10px; box-shadow: 0 34px 70px rgba(0,0,0,.65), inset 0 0 40px rgba(0,0,0,.35); transform-style: preserve-3d; }
.tilt .board { transform: rotateX(40deg); transform-origin: 50% 62%; }
.tile { position:relative; background: linear-gradient(160deg, #fbf6e8, #ece2ca); border: 1px solid #b9b39f; transform-style: preserve-3d; }
.center { grid-row: 2/12; grid-column: 2/12; background: linear-gradient(160deg, #efe6cf, #e2d6b8); display:flex; flex-direction:column; align-items:center; justify-content:center; border: 1px solid #b9b39f; box-shadow: inset 0 0 50px rgba(120,100,60,.25); }
.brand { font-size: 46px; font-weight: 900; letter-spacing: -1.5px; color:#D62828; text-shadow: 3px 3px 0 #1F4E9A, 0 6px 12px rgba(0,0,0,.25); }
.dice { display:flex; gap: 13px; margin-top: 16px }
.die { width: 48px; height: 48px; border-radius: 10px; background: linear-gradient(150deg,#fff,#dfe3e8); display:grid; place-items:center; font-size: 37px; box-shadow: 0 5px 0 #9aa3ad, 0 9px 14px rgba(0,0,0,.35); }
.die.nandu { background: linear-gradient(150deg,#ffb457,#d97706); color:#fff; font-size: 24px; font-weight: 900; box-shadow: 0 5px 0 #7a4a08, 0 9px 14px rgba(0,0,0,.35) }

/* Franja de color: siempre del lado que mira al centro del tablero */
.strip { position:absolute; box-shadow: inset 0 -2px 3px rgba(0,0,0,.28); }
.bottom .strip { left:0; right:0; top:0; height: 20%; }
.top .strip { left:0; right:0; bottom:0; height: 20%; box-shadow: inset 0 2px 3px rgba(0,0,0,.28) }
.left .strip { top:0; bottom:0; right:0; width: 20%; box-shadow: inset 2px 0 3px rgba(0,0,0,.28) }
.right .strip { top:0; bottom:0; left:0; width: 20%; box-shadow: inset -2px 0 3px rgba(0,0,0,.28) }

/* Nombre: en el centro, con lugar reservado para la franja y para las fichas */
.body { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-weight: 700; }
.bottom .body { padding: 21% 1px 16% } .top .body { padding: 16% 1px 21% }
.left .body { padding: 2px 21% 2px 4% } .right .body { padding: 2px 4% 2px 21% }
.name { font-size: 6.6px; line-height: 1.14; letter-spacing: -.15px; word-break: keep-all; hyphens: none }
.left .name, .right .name { font-size: 7.2px }
.price { font-size: 6.4px; color:#6b6151; margin-top: 1.5px } .ico { font-size: 15px; line-height:1 }
.corner .body { padding: 3px } .corner .ico { font-size: 24px } .corner .name { font-size: 8px; line-height: 1.18 }
.owner { position:absolute; width: 9px; height: 9px; border-radius: 50%; right: 3px; bottom: 3px; box-shadow: 0 0 0 1.6px #fff, 0 1px 2px rgba(0,0,0,.5); }
.top .owner { bottom:auto; top: 3px }

/* Casas y hoteles: sobre la franja de color */
.builds { position:absolute; display:flex; gap: .5px; justify-content:center; align-items:flex-end; transform: translateZ(8px); }
.bottom .builds { left:1px; right:1px; top: 0; height: 21% } .top .builds { left:1px; right:1px; bottom: 0; height: 21% }
.left .builds, .right .builds { flex-direction: column; top:2px; bottom:2px; width: 21%; justify-content:center; align-items:center }
.left .builds { right: 0 } .right .builds { left: 0 }
.house { width: 13px; height: 12px } .hotel { width: 27px; height: 17px }
.left .house, .right .house { width: 12px; height: 11px } .left .hotel, .right .hotel { width: 21px; height: 13px }

/* Fichas: en el borde de afuera, para no tapar el nombre */
.toks { position:absolute; display:flex; align-items:flex-end; justify-content:center; gap: 0; transform: translateZ(22px); }
.bottom .toks { left:0; right:0; bottom: 1px } .top .toks { left:0; right:0; top: 1px; align-items:flex-start }
.left .toks { top:0; bottom:0; left:1px; flex-direction:column; justify-content:center; align-items:flex-start }
.right .toks { top:0; bottom:0; right:1px; flex-direction:column; justify-content:center; align-items:flex-end }
.tok { width: 26px; height: 32px; margin: 0 -5px }
.left .tok, .right .tok { margin: -6px 0 }
.tokSvg { width: 100%; height: 100%; overflow: visible }
.tilt .toks { transform: translateZ(22px) rotateX(-40deg); transform-origin: 50% 100%; }
.tilt .builds { transform: translateZ(5px) rotateX(-40deg); transform-origin: 50% 100%; }

.caption { color:#fff; font-weight: 800; font-size: 19px; margin-bottom: 12px }
.sub { color:#cde8d4; font-size: 13px; margin-top: 12px; max-width: 660px; line-height: 1.5 }
.zoom { margin-top: 14px; display:flex; gap: 22px; align-items:flex-end; background: rgba(255,255,255,.07); border-radius: 12px; padding: 14px 18px }
.zoom .house { width: 50px; height: 46px } .zoom .hotel { width: 92px; height: 58px } .zoom .tok { width: 68px; height: 84px; margin: 0 }
.zoom span { color:#cde8d4; font-size: 11px; font-weight:700; display:block; text-align:center; margin-top: 6px }
`;
const board = extra => `<div class="stage ${extra}"><div class="board">${html}<div class="center"><div class="brand">Ñandepoly</div><div class="dice"><div class="die">⚄</div><div class="die">⚂</div><div class="die nandu">🎪</div></div></div></div></div>`;

const page = `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="scene">
<div><div class="caption">A · Piel 2D plana — casas, hoteles y fichas con relieve</div>${board('')}
<div class="zoom">
  <div>${house()}<span>casa</span></div>
  <div>${hotel()}<span>hotel</span></div>
  <div class="tok">${token('mate', PCOL.A, PDARK.A)}<span>ficha</span></div>
  <div class="tok">${token('jaguarete', PCOL.C, PDARK.C)}<span>ficha</span></div>
</div>
<div class="sub">Techo con luz y sombra, paredes con degradé y sombra proyectada sobre la casilla. Las fichas son piezas con pared lateral, cara grabada y brillo: se ven paradas sobre el tablero, no dibujadas encima. Los nombres largos van en dos renglones y ninguno queda cortado.</div></div>
<div><div class="caption">B · Vista de mesa — el mismo tablero inclinado</div>${board('tilt')}
<div class="sub">El tablero se inclina como una mesa de verdad; casas, hoteles y fichas quedan parados y mirando al jugador, con su sombra sobre la casilla. Se alterna plano ↔ mesa con un botón; en el celular queda plano.</div></div>
</div>`;

writeFileSync(new URL('./mockup.html', import.meta.url), page);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await browser.newPage({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: 1.6 });
await p.goto('file://' + new URL('./mockup.html', import.meta.url).pathname);
await p.waitForTimeout(300);
await p.screenshot({ path: new URL('./tablero-2d.png', import.meta.url).pathname, fullPage: true });
await browser.close();
console.log('ok');
