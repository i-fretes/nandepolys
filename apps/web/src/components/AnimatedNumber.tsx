import { useEffect, useRef, useState } from 'react';

/** Número que cuenta de a poco hasta el valor nuevo (saldos, jackpot). Siempre termina en el valor real. */
export default function AnimatedNumber({ value, format, duration = 700, className }: {
  value: number; format: (n: number) => string; duration?: number; className?: string;
}) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);   // lo que se ve ahora mismo (aunque una animación se corte)
  const raf = useRef<number>();
  useEffect(() => {
    const a = shownRef.current, b = value;
    if (a === b) return;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = k >= 1 ? b : Math.round(a + (b - a) * e);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);
  const changing = shown !== value;
  return <span className={`count-up ${className ?? ''} ${changing ? (value > shown ? 'text-emerald-600' : 'text-red-600') : ''}`}>{format(shown)}</span>;
}
