import { useEffect, useRef, useState } from 'react';

/** Número que cuenta de a poco hasta el valor nuevo (saldos, jackpot). */
export default function AnimatedNumber({ value, format, duration = 700, className }: {
  value: number; format: (n: number) => string; duration?: number; className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number>();
  useEffect(() => {
    const start = performance.now();
    const a = from.current, b = value;
    if (a === b) return;
    cancelAnimationFrame(raf.current!);
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (b - a) * e);
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current!);
  }, [value, duration]);
  const changing = shown !== value;
  return <span className={`count-up ${className ?? ''} ${changing ? (value > shown ? 'text-emerald-600' : 'text-red-600') : ''}`}>{format(shown)}</span>;
}
