import { useEffect, useState } from 'react';
import { useStore } from '../store';

// Posiciones de los puntos de cada cara (en una grilla de 3×3: 0..2)
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/**
 * Dado plano y minimalista: cuadrado blanco redondeado con puntos oscuros. Mientras "rueda" las
 * caras cambian al azar y el dado se sacude apenas; al frenar muestra el valor.
 */
export function Die({ value, rolling, size }: { value: number | null; rolling: boolean; size?: string }) {
  const [shown, setShown] = useState<number | null>(value);
  useEffect(() => {
    if (!rolling) { setShown(value); return; }
    const id = setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 90);
    return () => { clearInterval(id); setShown(value); };
  }, [rolling, value]);
  const face = shown ?? value;
  const style = { ['--d' as string]: size ?? '6cqw' } as React.CSSProperties;
  return (
    <div className={`die ${rolling ? 'rolling' : ''} ${face ? '' : 'empty'}`} style={style} aria-label={face ? `Dado: ${face}` : 'Dado'}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {face ? PIPS[face].map(([x, y]) => <circle key={`${x}${y}`} cx={22 + x * 28} cy={22 + y * 28} r="8.5" className="pip" />) : <text x="50" y="60" textAnchor="middle" fontSize="44" fontWeight="800" opacity=".25">?</text>}
      </svg>
    </div>
  );
}
/** Alias (los diálogos de casino, alquiler y desafíos importan este nombre). */
export const Die3D = Die;

export default function Dice() {
  const dice = useStore(s => s.state?.dice ?? null);
  const rollingUntil = useStore(s => s.rollingUntil);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollingUntil > Date.now()) {
      setRolling(true);
      const id = setTimeout(() => setRolling(false), Math.max(300, rollingUntil - Date.now() + 300));
      return () => clearTimeout(id);
    }
  }, [rollingUntil]);

  return (
    <div className={`dice-stage ${rolling ? 'rolling' : ''}`}>
      <div className="die-slot d1"><Die value={dice?.[0] ?? null} rolling={rolling} /></div>
      {dice?.[1] !== 0 && <div className="die-slot d2"><Die value={dice?.[1] ?? null} rolling={rolling} /></div>}
    </div>
  );
}
