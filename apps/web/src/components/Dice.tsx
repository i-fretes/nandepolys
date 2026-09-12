import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
// Rotación que deja cada cara mirando al frente
const SHOW: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateX(0deg) rotateY(180deg)', 2: 'rotateX(0deg) rotateY(-90deg)',
  5: 'rotateX(0deg) rotateY(90deg)', 3: 'rotateX(-90deg) rotateY(0deg)', 4: 'rotateX(90deg) rotateY(0deg)',
};

/** Un dado en 3D que gira hasta mostrar la cara indicada. */
export function Die3D({ value, rolling, size }: { value: number | null; rolling: boolean; size?: string }) {
  const turns = useRef(0);
  const [transform, setTransform] = useState(SHOW[1]);
  useEffect(() => {
    if (!value) return;
    turns.current += 1;
    const extra = `rotateX(${360 * turns.current}deg) rotateY(${360 * turns.current}deg) `;
    setTransform(extra + SHOW[value]);
  }, [value, rolling]);
  const style = { ['--d' as string]: size ?? '6cqw' } as React.CSSProperties;
  return (
    <div className={`die3d-scene ${rolling ? 'rolling' : ''}`} style={style}>
      <div className="die3d" style={{ transform }}>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} className={`face f${n}`}>
            {value ? FACES[n - 1] : <span className="opacity-30">?</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trayectorias de tiro: los dados entran rodando desde distintos lados y frenan en el centro. */
const THROWS = ['throw-left', 'throw-right', 'throw-top', 'throw-bottom', 'throw-spin', 'throw-bounce', 'throw-cross'];

export default function Dice() {
  const dice = useStore(s => s.state?.dice ?? null);
  const rollingUntil = useStore(s => s.rollingUntil);
  const [rolling, setRolling] = useState(false);
  // Cada tirada elige una trayectoria distinta (al azar, pero fija durante esa tirada)
  const throwKind = useRef(THROWS[0]);
  useEffect(() => { if (rollingUntil > Date.now()) throwKind.current = THROWS[Math.floor(Math.random() * THROWS.length)]; }, [rollingUntil]);

  useEffect(() => {
    if (rollingUntil > Date.now()) {
      setRolling(true);
      const id = setTimeout(() => setRolling(false), Math.max(300, rollingUntil - Date.now() + 300));
      return () => clearTimeout(id);
    }
  }, [rollingUntil]);

  return (
    <div className={`dice-stage ${rolling ? `rolling ${throwKind.current}` : ''}`}>
      <div className="die-slot d1"><Die3D value={dice?.[0] ?? null} rolling={rolling} /></div>
      {dice?.[1] !== 0 && <div className="die-slot d2"><Die3D value={dice?.[1] ?? null} rolling={rolling} /></div>}
    </div>
  );
}
