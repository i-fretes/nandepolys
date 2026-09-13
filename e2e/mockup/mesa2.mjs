// Mockup v2: vista cenital (desde arriba) de una mesa de madera en la casa de alguien, con el
// tablero apoyado, piso de parquet alrededor, alfombra, silla, termo + guampa, plato con chipa.
// Todo dibujado en SVG con texturas (ruido) para que no se vea plano ni "de CSS".
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const board = readFileSync(new URL('../tablero/solo-tablero.png', import.meta.url)).toString('base64');
const OUT = process.argv[2] ?? 'e2e/mockup/mesa2.png';
const WITH_UI = process.argv.includes('--ui');
mkdirSync('e2e/mockup', { recursive: true });
const W = 1600, H = 1000;

const svg = /* svg */ `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Ruido para vetas de madera -->
    <filter id="wood" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="4" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="0" k2="1" k3="-.9" k4="0"/>
    </filter>
    <filter id="wood2" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.12" numOctaves="3" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 0" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="0" k2="1" k3="-.7" k4="0"/>
    </filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .08 0"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="fabric"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="5" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 0"/></filter>

    <!-- Parquet espina de pez -->
    <pattern id="herring" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale(.9)">
      <rect width="120" height="120" fill="#a67a48"/>
      <rect x="0" y="0" width="60" height="20" fill="#b58753"/><rect x="60" y="0" width="60" height="20" fill="#9e7040"/>
      <rect x="0" y="20" width="60" height="20" fill="#9c6e3f"/><rect x="60" y="20" width="60" height="20" fill="#b3854f"/>
      <rect x="0" y="40" width="60" height="20" fill="#ad7e4a"/><rect x="60" y="40" width="60" height="20" fill="#a37545"/>
      <rect x="0" y="60" width="60" height="20" fill="#a07242"/><rect x="60" y="60" width="60" height="20" fill="#b7895a"/>
      <rect x="0" y="80" width="60" height="20" fill="#b2844d"/><rect x="60" y="80" width="60" height="20" fill="#996b3c"/>
      <rect x="0" y="100" width="60" height="20" fill="#a87a48"/><rect x="60" y="100" width="60" height="20" fill="#af8150"/>
      <path d="M0 20H120M0 40H120M0 60H120M0 80H120M0 100H120M60 0V120" stroke="#5a3a1c" stroke-opacity=".55" stroke-width="1.5"/>
    </pattern>
    <!-- Tejido de la alfombra (ñandutí-ish) -->
    <pattern id="rug" width="48" height="48" patternUnits="userSpaceOnUse">
      <rect width="48" height="48" fill="#8e2f2b"/>
      <path d="M24 4 L44 24 L24 44 L4 24 Z" fill="none" stroke="#e7c99a" stroke-width="2"/>
      <circle cx="24" cy="24" r="6" fill="none" stroke="#e7c99a" stroke-width="1.5"/>
      <circle cx="0" cy="0" r="4" fill="#2e6b4f"/><circle cx="48" cy="0" r="4" fill="#2e6b4f"/><circle cx="0" cy="48" r="4" fill="#2e6b4f"/><circle cx="48" cy="48" r="4" fill="#2e6b4f"/>
    </pattern>
    <radialGradient id="lamp" cx="50%" cy="48%" r="60%">
      <stop offset="0" stop-color="#ffe2b0" stop-opacity=".62"/><stop offset=".45" stop-color="#ffcf8a" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0b03" stop-opacity=".78"/>
    </radialGradient>
    <linearGradient id="tabletop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a5a2e"/><stop offset=".5" stop-color="#7a4d26"/><stop offset="1" stop-color="#65401f"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3617"/><stop offset="1" stop-color="#3a220e"/></linearGradient>
    <linearGradient id="thermo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b4f86"/><stop offset=".45" stop-color="#3b82c4"/><stop offset=".6" stop-color="#2a6aab"/><stop offset="1" stop-color="#143b66"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a8f96"/><stop offset=".5" stop-color="#e6e9ec"/><stop offset="1" stop-color="#6f757c"/></linearGradient>
    <linearGradient id="horn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a4a3a"/><stop offset=".5" stop-color="#8a7560"/><stop offset="1" stop-color="#2f251b"/></linearGradient>
    <radialGradient id="chipa" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f1c675"/><stop offset=".7" stop-color="#d9994a"/><stop offset="1" stop-color="#a86a2a"/></radialGradient>
    <radialGradient id="plate" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".85" stop-color="#e9e4dc"/><stop offset="1" stop-color="#c9c2b8"/></radialGradient>
    <clipPath id="boardClip"><rect x="0" y="0" width="600" height="600" rx="10"/></clipPath>
  </defs>

  <!-- Piso -->
  <rect width="${W}" height="${H}" fill="url(#herring)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
  <rect width="${W}" height="${H}" fill="#2a1608" opacity=".35"/>

  <!-- Alfombra bajo la mesa -->
  <g transform="rotate(-2 800 520)">
    <rect x="230" y="120" width="1140" height="820" rx="10" fill="#6d1f1c"/>
    <rect x="246" y="136" width="1108" height="788" rx="6" fill="url(#rug)"/>
    <rect x="246" y="136" width="1108" height="788" filter="url(#fabric)"/>
    <!-- flecos -->
    <g stroke="#e7c99a" stroke-width="3" opacity=".8">
      ${Array.from({ length: 56 }, (_, i) => `<line x1="${250 + i * 20}" y1="118" x2="${252 + i * 20}" y2="98"/><line x1="${250 + i * 20}" y1="942" x2="${248 + i * 20}" y2="962"/>`).join('')}
    </g>
  </g>

  <!-- Silla (vista desde arriba, del lado del que juega) -->
  <g transform="translate(800 985)">
    <ellipse cx="0" cy="40" rx="190" ry="60" fill="#000" opacity=".35" filter="url(#soft)"/>
    <rect x="-170" y="-30" width="340" height="150" rx="40" fill="#3f2a17"/>
    <rect x="-156" y="-16" width="312" height="130" rx="34" fill="#2f6e5a"/>
    <rect x="-156" y="-16" width="312" height="130" rx="34" filter="url(#fabric)"/>
    <rect x="-170" y="-46" width="340" height="30" rx="14" fill="#4a3219"/>
  </g>

  <!-- Sombra de la mesa sobre el piso -->
  <rect x="330" y="150" width="940" height="720" rx="40" fill="#000" opacity=".55" filter="url(#soft)"/>

  <!-- Mesa -->
  <g>
    <rect x="322" y="146" width="956" height="732" rx="34" fill="url(#edge)"/>
    <clipPath id="tclip"><rect x="330" y="140" width="940" height="720" rx="30"/></clipPath>
    <g clip-path="url(#tclip)">
      <rect x="330" y="140" width="940" height="720" fill="#6e4222"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${330 + i * 118}" y="140" width="118" height="720" fill="${['#7a4a25','#70431f','#7e4e29','#6b3f1d','#774826','#6f4321','#7c4c28','#6d401e'][i]}"/><line x1="${330 + i * 118}" y1="140" x2="${330 + i * 118}" y2="860" stroke="#3a220e" stroke-opacity=".7" stroke-width="2"/>`).join('')}
      <rect x="330" y="140" width="940" height="720" filter="url(#wood)" fill="#3a200c" opacity=".55"/>
      <rect x="330" y="140" width="940" height="720" fill="url(#tabletop)" opacity=".35"/>
    </g>
    <rect x="330" y="140" width="940" height="720" rx="30" fill="none" stroke="#e2b27a" stroke-opacity=".35" stroke-width="2"/>
    <!-- brillo de la lámpara sobre el barniz -->
    <ellipse cx="800" cy="500" rx="420" ry="300" fill="#ffd9a0" opacity=".10" filter="url(#soft)"/>
  </g>

  <!-- Tablero -->
  <g transform="translate(500 200) rotate(-1 300 300)">
    <rect x="-6" y="14" width="612" height="612" rx="14" fill="#000" opacity=".5" filter="url(#soft2)"/>
    <rect x="-8" y="-8" width="616" height="616" rx="14" fill="#3a2410"/>
    <rect x="-8" y="-8" width="616" height="616" rx="14" filter="url(#wood2)" fill="#8a5a2e" opacity=".9"/>
    <image href="data:image/png;base64,${board}" x="0" y="0" width="600" height="600" clip-path="url(#boardClip)"/>
    <rect x="0" y="0" width="600" height="600" rx="10" fill="none" stroke="#fff" stroke-opacity=".25"/>
  </g>

  <!-- Termo + guampa (derecha) -->
  <g transform="translate(1195 330) rotate(10)">
    <ellipse cx="6" cy="120" rx="46" ry="18" fill="#000" opacity=".4" filter="url(#soft2)"/>
    <rect x="-28" y="-90" width="60" height="200" rx="26" fill="url(#thermo)"/>
    <rect x="-28" y="-90" width="60" height="30" rx="14" fill="url(#steel)"/>
    <rect x="-18" y="-60" width="12" height="140" rx="6" fill="#fff" opacity=".18"/>
    <path d="M32 -40 q30 40 0 90" stroke="#0d2a4a" stroke-width="10" fill="none" stroke-linecap="round"/>
    <text x="2" y="30" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="16" fill="#fff" opacity=".8">PY</text>
  </g>
  <g transform="translate(1190 600) rotate(-8)">
    <ellipse cx="0" cy="58" rx="42" ry="16" fill="#000" opacity=".45" filter="url(#soft2)"/>
    <path d="M-30 -30 C-34 10 -26 40 -14 62 L14 62 C28 40 34 10 30 -30 Z" fill="url(#horn)"/>
    <path d="M-30 -30 C-34 10 -26 40 -14 62 L14 62 C28 40 34 10 30 -30 Z" filter="url(#wood2)" fill="#6a5644" opacity=".8"/>
    <path d="M-22 -20 C-24 10 -18 36 -10 56" stroke="#fff" stroke-opacity=".18" stroke-width="5" fill="none" stroke-linecap="round"/>
    <rect x="-33" y="-36" width="66" height="14" rx="4" fill="url(#steel)"/>
    <ellipse cx="0" cy="-30" rx="30" ry="10" fill="#7fb04a"/>
    <ellipse cx="0" cy="-30" rx="30" ry="10" filter="url(#fabric)"/>
    <line x1="10" y1="-34" x2="42" y2="-110" stroke="url(#steel)" stroke-width="6" stroke-linecap="round"/>
    <circle cx="43" cy="-112" r="5" fill="#d9dde2"/>
  </g>

  <!-- Plato con chipa (izquierda abajo) -->
  <g transform="translate(400 690)">
    <ellipse cx="4" cy="14" rx="86" ry="78" fill="#000" opacity=".45" filter="url(#soft2)"/>
    <circle cx="0" cy="0" r="82" fill="url(#plate)"/>
    <circle cx="0" cy="0" r="66" fill="none" stroke="#c9c2b8" stroke-width="2"/>
    <circle cx="0" cy="0" r="72" fill="none" stroke="#d62828" stroke-opacity=".5" stroke-width="3"/>
    ${[[-22, -14, 0], [22, -6, 30], [-2, 26, -20]].map(([x, y, r]) => `
    <g transform="translate(${x} ${y}) rotate(${r})">
      <ellipse cx="2" cy="5" rx="30" ry="24" fill="#000" opacity=".25"/>
      <ellipse cx="0" cy="0" rx="30" ry="24" fill="url(#chipa)"/>
      <ellipse cx="0" cy="0" rx="11" ry="8" fill="#e9dcc3"/>
      <ellipse cx="0" cy="1" rx="9" ry="6" fill="#d7c4a1"/>
      <circle cx="-14" cy="-8" r="2" fill="#8a4d16"/><circle cx="12" cy="-10" r="2" fill="#8a4d16"/><circle cx="16" cy="9" r="2" fill="#8a4d16"/>
    </g>`).join('')}
  </g>

  <!-- Dados sueltos (izquierda arriba) -->
  ${[[400, 380, -18, [[0, 0]]], [456, 420, 25, [[-9, -9], [9, 9], [-9, 9], [9, -9]]]].map(([x, y, r, dots]) => `
  <g transform="translate(${x} ${y}) rotate(${r})">
    <rect x="-20" y="-16" width="44" height="44" rx="9" fill="#000" opacity=".4" filter="url(#soft2)"/>
    <rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff8ee" stroke="#d8ccb6"/>
    ${dots.map(([dx, dy]) => `<circle cx="${dx}" cy="${dy}" r="4.2" fill="#d62828"/>`).join('')}
  </g>`).join('')}

  <!-- Mazo de cartas Suerte (derecha arriba) -->
  <g transform="translate(1180 190) rotate(-14)">
    <rect x="-52" y="-30" width="118" height="84" rx="10" fill="#000" opacity=".45" filter="url(#soft2)"/>
    ${[6, 4, 2, 0].map(o => `<rect x="${-60 + o}" y="${-40 - o}" width="118" height="84" rx="10" fill="#f8ecd0" stroke="#c9b489"/>`).join('')}
    <rect x="-52" y="-32" width="102" height="68" rx="6" fill="none" stroke="#e08a1f" stroke-width="3"/>
    <text x="-1" y="10" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="22" fill="#b4640f">SUERTE</text>
  </g>

  <!-- Billetes de Ñandepoly (abajo derecha) -->
  <g transform="translate(1200 830) rotate(6) scale(.8)">
    ${[[0, 0, '#2E8B57'], [14, -8, '#1F4E9A'], [28, -16, '#D62828']].map(([x, y, c]) => `
    <g transform="translate(${x} ${y}) rotate(-6)">
      <rect x="-70" y="-30" width="140" height="60" rx="4" fill="${c}"/>
      <rect x="-64" y="-24" width="128" height="48" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/>
      <circle cx="0" cy="0" r="16" fill="#fff" opacity=".85"/>
      <text x="0" y="6" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="15" fill="${c}">₲</text>
    </g>`).join('')}
  </g>

  <!-- Luz de lámpara y viñeta -->
  <rect width="${W}" height="${H}" fill="url(#lamp)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0 } body { width:${W}px; height:${H}px; overflow:hidden; position:relative; font-family: system-ui, sans-serif; background:#000 }
  svg.scene { position:absolute; inset:0 }
  .panel { position: absolute; top: 16px; width: 300px; height: 940px; border-radius: 18px; background: rgba(255, 248, 235, .86); backdrop-filter: blur(8px); box-shadow: 0 10px 30px rgba(0,0,0,.45); padding: 16px; }
  .panel.l { left: 16px } .panel.r { right: 16px }
  .panel h3 { font-size: 15px; letter-spacing: .12em; text-transform: uppercase; color: #6b5a44; margin-bottom: 10px }
  .row { height: 56px; border-radius: 12px; background: #fff; margin-bottom: 10px; box-shadow: 0 1px 0 #ddd; display:flex; align-items:center; padding: 0 12px; gap:10px; font-weight: 700; color:#333 }
  .row i { width: 30px; height: 30px; border-radius: 50%; display:inline-block }
  .bar { position: absolute; left: 340px; right: 340px; bottom: 16px; height: 64px; border-radius: 18px; background: rgba(255,248,235,.9); backdrop-filter: blur(8px); box-shadow: 0 10px 30px rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; gap: 12px; font-weight: 800; color:#333 }
  .bar span { padding: 10px 18px; border-radius: 12px; background: #2E8B57; color:#fff } .bar span.g { background: #eee; color:#444 }
</style></head><body>${svg.replace('<svg ', '<svg class="scene" ')}
${WITH_UI ? `
  <div class="panel l"><h3>Jugadores</h3>
    <div class="row"><i style="background:#D62828"></i>Ivan · ₲ 2.450.000</div>
    <div class="row"><i style="background:#1F4E9A"></i>Lucía · ₲ 1.980.000</div>
    <div class="row"><i style="background:#2E8B57"></i>Bot Rubén · ₲ 1.200.000</div>
  </div>
  <div class="panel r"><h3>Misiones</h3><div class="row">🏠 Construí 3 casas</div><div class="row">🎰 Ganá en el Casino</div><div class="row">🤝 Cerrá un intercambio</div></div>
  <div class="bar"><span>🎲 Tirar dados</span><span class="g">🤝 Intercambiar</span><span class="g">🔫 Duelo mayor</span></div>` : ''}
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT });
await browser.close();
console.log('OK', OUT);
