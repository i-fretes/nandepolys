import { useEffect, useRef, useState } from 'react';
import { SPEED_FACE_INFO } from '@nandepoly/engine';
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

/** Tercer dado ("ñandú"): caras +1/+2/+3, colectivo, feria y turbo. */
export function NanduDie({ face, rolling, size }: { face: keyof typeof SPEED_FACE_INFO | null; rolling: boolean; size?: string }) {
  const info = face ? SPEED_FACE_INFO[face] : null;
  const style = { ['--d' as string]: size ?? '6cqw' } as React.CSSProperties;
  return (
    <div className={`nandu-die ${rolling ? 'rolling' : ''}`} style={style} title={info ? `${info.short}: ${info.desc}` : 'Dado ñandú'}>
      <span className="nandu-face">{info ? info.icon : '?'}</span>
    </div>
  );
}

export default function Dice() {
  const dice = useStore(s => s.state?.dice ?? null);
  const speedDie = useStore(s => s.state?.speedDie ?? null);
  const speedOn = useStore(s => s.state?.settings.speedDie ?? false);
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
    <>
      <Die3D value={dice?.[0] ?? null} rolling={rolling} />
      {dice?.[1] !== 0 && <Die3D value={dice?.[1] ?? null} rolling={rolling} />}
      {speedOn && <NanduDie face={speedDie} rolling={rolling} />}
    </>
  );
}
