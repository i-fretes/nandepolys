import { useEffect, useState } from 'react';
import { useStore } from '../store';

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function Dice() {
  const dice = useStore(s => s.state?.dice ?? null);
  const rollingUntil = useStore(s => s.rollingUntil);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollingUntil > Date.now()) {
      setRolling(true);
      const id = setTimeout(() => setRolling(false), rollingUntil - Date.now());
      return () => clearTimeout(id);
    }
  }, [rollingUntil]);

  const shown = dice ?? [0, 0];
  return (
    <>
      {shown.map((d, i) => (
        <div key={i} className={`die ${rolling ? 'rolling' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
          {d ? FACES[d - 1] : <span className="opacity-30">?</span>}
        </div>
      ))}
    </>
  );
}
