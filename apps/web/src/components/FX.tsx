import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useStore, type FxEvent } from '../store';
import { sfx } from '../sound';
import { money } from '../format';

/** Punto central (en píxeles de viewport) de la tarjeta de un jugador, del banco (centro del tablero) o del centro de pantalla. */
function anchor(id: string): { x: number; y: number } {
  const el = id === 'bank'
    ? document.querySelector('.center')
    : document.querySelector(`[data-player-card="${id}"]`);
  const r = el?.getBoundingClientRect();
  if (!r || r.width === 0) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

interface Bill { id: number; x0: number; y0: number; x1: number; y1: number; delay: number; rot: number; big: boolean }
interface Float { id: number; x: number; y: number; text: string; tone: string }
interface Jackpot { id: number; amount: number }

/**
 * Capa de efectos: billetes que vuelan, números flotantes, temblor, confeti,
 * rejas al ir preso, lluvia de billetes al cobrar sueldo y cartel de jackpot.
 */
export default function FX() {
  const fx = useStore(s => s.fx);
  const popFx = useStore(s => s.popFx);
  const [bills, setBills] = useState<Bill[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [jackpot, setJackpot] = useState<Jackpot | null>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    for (const f of fx) {
      if (seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      run(f);
      popFx(f.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  function run(f: FxEvent) {
    switch (f.kind) {
      case 'money': {
        const a = anchor(f.from), b = anchor(f.to);
        const n = Math.min(14, 3 + Math.round(Math.log2(1 + f.amount / 10)));
        const big = f.amount >= 300;
        const items: Bill[] = Array.from({ length: n }, (_, i) => ({
          id: Date.now() + Math.random(), x0: a.x + (Math.random() - 0.5) * 40, y0: a.y + (Math.random() - 0.5) * 30,
          x1: b.x + (Math.random() - 0.5) * 50, y1: b.y + (Math.random() - 0.5) * 30, delay: i * 45, rot: (Math.random() - 0.5) * 60, big,
        }));
        setBills(bs => [...bs, ...items]);
        sfx.cash(Math.min(n, 8));
        setTimeout(() => setBills(bs => bs.filter(x => !items.includes(x))), 1400 + n * 45);
        return;
      }
      case 'float': {
        const a = anchor(f.playerId);
        const item: Float = { id: Date.now() + Math.random(), x: a.x, y: a.y - 10, text: f.text, tone: f.tone };
        setFloats(fs => [...fs, item]);
        setTimeout(() => setFloats(fs => fs.filter(x => x !== item)), 1600);
        return;
      }
      case 'react': {
        const a = anchor(f.playerId);
        const item: Float = { id: Date.now() + Math.random(), x: a.x, y: a.y - 16, text: f.emoji, tone: 'react' };
        setFloats(fs => [...fs, item]);
        setTimeout(() => setFloats(fs => fs.filter(x => x !== item)), 1800);
        return;
      }
      case 'shake': {
        const root = document.getElementById('root');
        if (!root) return;
        root.style.setProperty('--shake', `${4 + f.strength * 10}px`);
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        sfx.drum();
        setTimeout(() => root.classList.remove('shake'), 600);
        return;
      }
      case 'confetti': {
        const a = f.playerId ? anchor(f.playerId) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        confetti({
          particleCount: f.big ? 220 : 90, spread: f.big ? 110 : 70, startVelocity: f.big ? 55 : 35,
          origin: { x: a.x / window.innerWidth, y: a.y / window.innerHeight },
          colors: ['#D52B1E', '#0038A8', '#FFFFFF', '#C9A227', '#2E8B57'],
          disableForReducedMotion: true,
        });
        if (f.big) setTimeout(() => confetti({ particleCount: 160, spread: 160, origin: { x: 0.5, y: 0.3 }, disableForReducedMotion: true }), 400);
        return;
      }
      case 'bars': {
        const el = document.querySelector(`[data-player-card="${f.playerId}"]`);
        if (!el) return;
        const bars = document.createElement('div');
        bars.className = 'jail-bars';
        bars.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';
        el.appendChild(bars);
        setTimeout(() => bars.remove(), 2200);
        return;
      }
      case 'crack': {
        const el = document.querySelector(`[data-player-card="${f.playerId}"]`);
        el?.classList.add('cracked');
        return;
      }
      case 'rain': {
        const a = anchor(f.playerId);
        const items: Bill[] = Array.from({ length: 10 }, (_, i) => ({
          id: Date.now() + Math.random(), x0: a.x + (Math.random() - 0.5) * 120, y0: a.y - 160 - Math.random() * 60,
          x1: a.x + (Math.random() - 0.5) * 140, y1: a.y + 20, delay: i * 60, rot: (Math.random() - 0.5) * 120, big: false,
        }));
        setBills(bs => [...bs, ...items]);
        setTimeout(() => setBills(bs => bs.filter(x => !items.includes(x))), 2200);
        return;
      }
      case 'jackpot': {
        setJackpot({ id: f.id, amount: f.amount });
        setTimeout(() => setJackpot(j => (j?.id === f.id ? null : j)), 3800);
        return;
      }
    }
  }

  return (
    <div className="fx-layer" aria-hidden>
      {bills.map(b => (
        <span key={b.id} className={`bill ${b.big ? 'big' : ''}`}
          style={{ ['--x0' as string]: `${b.x0}px`, ['--y0' as string]: `${b.y0}px`, ['--x1' as string]: `${b.x1}px`, ['--y1' as string]: `${b.y1}px`, ['--rot' as string]: `${b.rot}deg`, animationDelay: `${b.delay}ms` }}>
          💵
        </span>
      ))}
      {floats.map(f => (
        <span key={f.id} className={`float ${f.tone}`} style={{ left: f.x, top: f.y }}>{f.text}</span>
      ))}
      {jackpot && (
        <div className="jackpot-splash">
          <div className="jackpot-title">JACKPOT</div>
          <div className="jackpot-amount">{money(jackpot.amount)}</div>
        </div>
      )}
    </div>
  );
}
