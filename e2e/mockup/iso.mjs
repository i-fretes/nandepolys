// Boceto de cómo se vería Ñandepoly en isométrico "de verdad" (diamante 45°, piezas con volumen).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const src = readFileSync(new URL('../../packages/engine/src/board.ts', import.meta.url), 'utf8');
const tiles = [];
for (const m of src.matchAll(/street\((\d+), '([^']+)', '(\w+)', (\d+)/g)) tiles[+m[1]] = { id: +m[1], type: 'street', name: m[2], group: m[3], price: +m[4] };
for (const m of src.matchAll(/\{ id: (\d+), type: '(\w+)', name: '([^']+)'(?:, price: (\d+))?/g)) tiles[+m[1]] = { id: +m[1], type: m[2], name: m[3], price: m[4] ? +m[4] : 0 };

const COLORS = { marron: '#8B4513', celeste: '#6EC1E4', rosa: '#E75480', naranja: '#F7941D', rojo: '#D62828', amarillo: '#F4D03F', verde: '#2E8B57', azul: '#1F4E9A' };
const SHORT = { 'Estacionamiento Libre': 'Estacionamiento', 'Impuesto a la Renta (SET)': 'Imp. Renta', 'Aeropuerto Silvio Pettirossi': 'Aeropuerto', 'Terminal de Ómnibus': 'Terminal', 'Av. Aviadores del Chaco': 'Av. Aviadores', 'Mariano Roque Alonso': 'M. R. Alonso', 'Pedro Juan Caballero': 'P. J. Caballero', 'Fernando de la Mora': 'Fdo. de la Mora', 'Costanera de Asunción': 'Costanera', 'Puente de la Amistad': 'Pte. Amistad', 'Av. Mariscal López': 'Av. Mcal. López', 'Vaya a Tacumbú': 'A Tacumbú', 'Puerto de Asunción': 'Puerto', 'Estacionamiento': 'Estacionamiento' };

const OWN = { 1: 'A', 3: 'A', 7: 'B', 9: 'B', 10: 'B', 12: 'C', 14: 'C', 18: 'A', 20: 'A', 21: 'A', 23: 'D', 26: 'D', 29: 'B', 30: 'B', 32: 'B', 34: 'C', 41: 'D', 43: 'D', 5: 'C', 16: 'A', 13: 'D', 31: 'B' };
const HOUSES = { 1: 2, 3: 3, 7: 1, 9: 1, 10: 4, 18: 5, 20: 3, 21: 2, 29: 5, 30: 2, 32: 1, 41: 1, 43: 5 };
const PCOL = { A: '#D62828', B: '#1F4E9A', C: '#2E8B57', D: '#F7941D' };
const PDARK = { A: '#8d1414', B: '#12305e', C: '#1b5334', D: '#a35c07' };
const TOKENS = { A: { pos: 18 }, B: { pos: 30 }, C: { pos: 11 }, D: { pos: 39 } };

const TW = 46, TH = 23;               // medio ancho / medio alto de una casilla en pantalla
const OX = 760, OY = 90;              // origen
const P = (gx, gy, z = 0) => [OX + (gx - gy) * TW, OY + (gx + gy) * TH - z];
const poly = pts => pts.map(p => p.join(',')).join(' ');
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
};

function cell(id) {
  if (id <= 11) return { r: 11, c: 11 - id };
  if (id <= 22) return { r: 11 - (id - 11), c: 0 };
  if (id <= 33) return { r: 0, c: id - 22 };
  return { r: id - 33, c: 11 };
}
const side = id => id <= 11 ? 'bottom' : id <= 22 ? 'left' : id <= 33 ? 'top' : 'right';

/** Caja 3D isométrica: devuelve las tres caras visibles. */
function box(gx, gy, w, d, h, colTop, colL, colR) {
  const A = P(gx, gy, h), B = P(gx + w, gy, h), C = P(gx + w, gy + d, h), D = P(gx, gy + d, h);
  const b1 = P(gx, gy + d, 0), b2 = P(gx + w, gy + d, 0), b3 = P(gx + w, gy, 0);
  return `<polygon points="${poly([D, b1, b2, C])}" fill="${colL}"/>
          <polygon points="${poly([C, b2, b3, B])}" fill="${colR}"/>
          <polygon points="${poly([A, B, C, D])}" fill="${colTop}" stroke="${shade(colTop, .6)}" stroke-width=".6"/>`;
}

/** Casita 3D: cuerpo + techo a dos aguas. */
function isoHouse(gx, gy) {
  const w = 0.26, d = 0.26, h = 9;
  const body = box(gx, gy, w, d, h, '#f3e7cf', '#c9b48c', '#e2d1ac');
  // techo: prisma triangular
  const a = P(gx, gy, h), b = P(gx + w, gy, h), c = P(gx + w, gy + d, h), dd = P(gx, gy + d, h);
  const ridge1 = P(gx + w / 2, gy, h + 7), ridge2 = P(gx + w / 2, gy + d, h + 7);
  return body +
    `<polygon points="${poly([dd, a, ridge1, ridge2])}" fill="#e8453c"/>
     <polygon points="${poly([c, b, ridge1, ridge2])}" fill="#a11d16"/>
     <polygon points="${poly([dd, ridge2, c])}" fill="#7d1010"/>`;
}

/** Hotel 3D: bloque más grande con ventanas. */
function isoHotel(gx, gy) {
  const w = 0.5, d = 0.34, h = 15;
  const a = P(gx, gy, h), b = P(gx + w, gy, h), c = P(gx + w, gy + d, h), dd = P(gx, gy + d, h);
  const r1 = P(gx + w / 2, gy, h + 8), r2 = P(gx + w / 2, gy + d, h + 8);
  let win = '';
  for (let i = 0; i < 3; i++) {
    const u = 0.08 + i * 0.15;
    const p1 = P(gx + u, gy + d, h - 3), p2 = P(gx + u + 0.09, gy + d, h - 3), p3 = P(gx + u + 0.09, gy + d, h - 8), p4 = P(gx + u, gy + d, h - 8);
    win += `<polygon points="${poly([p1, p2, p3, p4])}" fill="#ffdf8a"/>`;
  }
  return box(gx, gy, w, d, h, '#a52a2a', '#8d1c1c', '#c0392b') + win +
    `<polygon points="${poly([dd, a, r1, r2])}" fill="#e8453c"/>
     <polygon points="${poly([c, b, r1, r2])}" fill="#8d1717"/>
     <polygon points="${poly([dd, r2, c])}" fill="#6b0f0f"/>`;
}

/** Ficha 3D: cilindro parado con cara superior y brillo. */
function isoToken(gx, gy, color, dark, emoji) {
  const [cx, cy] = P(gx, gy, 0);
  const rx = 15, ry = 7.5, h = 26;
  return `<g>
    <ellipse cx="${cx}" cy="${cy + 2}" rx="${rx + 3}" ry="${ry + 1.5}" fill="#000" opacity=".38"/>
    <path d="M${cx - rx} ${cy} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-h} h${-rx * 2} Z" fill="${color}"/>
    <path d="M${cx - rx} ${cy - h} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${h} h${-rx * 2} Z" fill="${dark}" opacity=".0"/>
    <path d="M${cx - rx} ${cy} a${rx} ${ry} 0 0 0 ${rx * 2} 0" fill="none" stroke="${dark}" stroke-width="2"/>
    <rect x="${cx - rx}" y="${cy - h}" width="${rx * 2}" height="${h}" fill="url(#tokwall)"/>
    <ellipse cx="${cx}" cy="${cy - h}" rx="${rx}" ry="${ry}" fill="${color}" stroke="${dark}" stroke-width="1.4"/>
    <ellipse cx="${cx}" cy="${cy - h - 1}" rx="${rx - 4}" ry="${ry - 2.4}" fill="#f6f1e4" stroke="${dark}" stroke-width="1"/>
    <text x="${cx}" y="${cy - h + 2}" font-size="9" text-anchor="middle">${emoji}</text>
    <path d="M${cx - rx + 2} ${cy - h + 6} v${h - 10}" stroke="#fff" stroke-width="2.4" opacity=".28" stroke-linecap="round"/>
  </g>`;
}

const THICK = 16; // espesor del tablero

// --- Dibujo ---
const order = [...tiles].sort((a, b) => {
  const A = cell(a.id), B = cell(b.id);
  return (A.r + A.c) - (B.r + B.c);
});

let svg = '';
// Losa del tablero (base)
{
  const N = 12;
  const c0 = P(0, 0), c1 = P(N, 0), c2 = P(N, N), c3 = P(0, N);
  const b0 = P(0, 0, -THICK), b1 = P(N, 0, -THICK), b2 = P(N, N, -THICK), b3 = P(0, N, -THICK);
  svg += `<polygon points="${poly([c3, b3, b2, c2])}" fill="#1d2a1d"/>
          <polygon points="${poly([c2, b2, b1, c1])}" fill="#2a3a28"/>
          <polygon points="${poly([c0, c1, c2, c3])}" fill="#31432f"/>`;
  // zona central
  const i0 = P(1, 1), i1 = P(11, 1), i2 = P(11, 11), i3 = P(1, 11);
  svg += `<polygon points="${poly([i0, i1, i2, i3])}" fill="#e7dcc2" stroke="#b9b39f"/>`;
  // marca central, acostada en el plano
  const [mx, my] = P(6, 6);
  const n2 = 1 / Math.sqrt(TW * TW + TH * TH);
  svg += `<g transform="matrix(${TW * n2} ${TH * n2} ${-TW * n2} ${TH * n2} ${mx} ${my})"><text x="0" y="0" text-anchor="middle" font-size="30" font-weight="900" fill="#D62828" opacity=".85">Ñandepoly</text></g>`;
}

// Casillas
for (const t of order) {
  const { r, c } = cell(t.id);
  const gx = c, gy = r;
  const a = P(gx, gy), b = P(gx + 1, gy), cc = P(gx + 1, gy + 1), d = P(gx, gy + 1);
  svg += `<polygon points="${poly([a, b, cc, d])}" fill="#f7f0df" stroke="#b9b39f" stroke-width=".8"/>`;

  // franja de color hacia el centro
  if (t.type === 'street') {
    const s = side(t.id);
    let p;
    if (s === 'bottom') p = [P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + .24), P(gx, gy + .24)];
    else if (s === 'top') p = [P(gx, gy + .76), P(gx + 1, gy + .76), P(gx + 1, gy + 1), P(gx, gy + 1)];
    else if (s === 'left') p = [P(gx + .76, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx + .76, gy + 1)];
    else p = [P(gx, gy), P(gx + .24, gy), P(gx + .24, gy + 1), P(gx, gy + 1)];
    svg += `<polygon points="${poly(p)}" fill="${COLORS[t.group]}" stroke="${shade(COLORS[t.group], .7)}" stroke-width=".5"/>`;
  }

  // nombre, acostado en el plano del tablero y orientado según el lado
  const sd = side(t.id);
  const nrm = 1 / Math.sqrt(TW * TW + TH * TH);
  // dos orientaciones, las dos se leen de izquierda a derecha en pantalla
  const along = (sd === 'bottom' || sd === 'top')
    ? [TW * nrm, TH * nrm, -TW * nrm, TH * nrm]     // baja hacia la derecha
    : [TW * nrm, -TH * nrm, TW * nrm, TH * nrm];    // sube hacia la derecha
  const [tx, ty] = P(gx + .5, gy + .55);
  const M = `matrix(${along.join(' ')} ${tx} ${ty})`;
  const nm = (SHORT[t.name] ?? t.name);
  // partimos el nombre en renglones cortos: en isométrico la casilla es un rombo y entra poco
  const words = nm.split(' ');
  const lines = [];
  for (const w of words) {
    if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 11) lines[lines.length - 1] += ' ' + w;
    else lines.push(w);
  }
  const y0 = -(lines.length - 1) * 4;
  const tspans = lines.map((l, i) => `<text x="0" y="${y0 + i * 8}" text-anchor="middle" font-size="7.4" font-weight="800" fill="#2b2b2b">${l}</text>`).join('');
  svg += `<g transform="${M}">${tspans}${t.price ? `<text x="0" y="${y0 + lines.length * 8}" text-anchor="middle" font-size="6.4" font-weight="700" fill="#6b6151">${t.price} mil</text>` : ''}</g>`;

  // dueño
  if (OWN[t.id]) {
    const [ox, oy] = P(gx + .85, gy + .15);
    svg += `<circle cx="${ox}" cy="${oy}" r="3.6" fill="${PCOL[OWN[t.id]]}" stroke="#fff" stroke-width="1.2"/>`;
  }
  // construcciones
  const h = HOUSES[t.id] ?? 0;
  if (h === 5) svg += isoHotel(gx + .25, gy + .06);
  else for (let i = 0; i < h; i++) svg += isoHouse(gx + .08 + i * 0.2, gy + .06);
  // fichas
  for (const [k2, v] of Object.entries(TOKENS)) {
    if (v.pos !== t.id) continue;
    svg += isoToken(gx + .5, gy + .72, PCOL[k2], PDARK[k2], { A: '🧉', B: '🥯', C: '🐆', D: '🛺' }[k2]);
  }
}

const W = 1560, H = 700;
const page = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background: radial-gradient(circle at 50% 20%, #33513a, #0e1712 75%); font-family: Inter, system-ui, sans-serif }
  .cap { color:#fff; font-weight:800; font-size:20px; padding: 18px 30px 0 }
  .sub { color:#cde8d4; font-size:13.5px; padding: 0 30px 20px; max-width: 1200px; line-height:1.55 }
  .warn { color:#ffd7a0 }
</style>
<div class="cap">Isométrico "de verdad" (diamante 45°) — cómo se vería Ñandepoly</div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="tokwall" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".3" stop-color="#fff" stop-opacity=".12"/>
      <stop offset=".65" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
  </defs>
  ${svg}

</svg>
<div class="sub">Las casas y el hotel son cajas 3D de verdad (se ven las tres caras), las fichas son cilindros parados con su sombra, y el tablero tiene espesor: se le ve el canto. <span class="warn">Lo que se pierde:</span> los nombres quedan acostados en diagonal y hay que girarlos según el lado, así que se leen bastante peor que de frente; las casillas del fondo quedan chicas y las de adelante grandes; y hay que decidir a mano qué se dibuja delante de qué en cada cuadro. Para que sea cómodo necesitaría cámara con zoom y poder rotar el tablero, y eso ya es reescribir el tablero entero con un motor gráfico.</div>`;

writeFileSync(new URL('./iso.html', import.meta.url), page);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await browser.newPage({ viewport: { width: W, height: H + 200 }, deviceScaleFactor: 1.6 });
await p.goto('file://' + new URL('./iso.html', import.meta.url).pathname);
await p.waitForTimeout(300);
await p.screenshot({ path: new URL('./tablero-iso.png', import.meta.url).pathname, fullPage: true });
await browser.close();
console.log('ok');
