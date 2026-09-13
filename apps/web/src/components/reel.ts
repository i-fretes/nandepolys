import { useLayoutEffect, type RefObject } from 'react';

/**
 * Anima un carrete horizontal (estilo apertura de caja): arranca en `startCell`, recorre y frena con la celda
 * `winCell` bajo el marcador central. `direction` 'left' = las celdas pasan hacia la izquierda (frena avanzando
 * a la derecha del carrete); 'right' = las celdas pasan hacia la derecha.
 * Se ejecuta cada vez que `active` pasa a true, después de que el carrete esté en el DOM.
 */
export function useReelSpin(stripRef: RefObject<HTMLDivElement>, active: boolean, opts: { cell: number; winCell: number; ms: number; direction: 'left' | 'right'; jitterKey?: number }) {
  useLayoutEffect(() => {
    if (!active) return;
    const strip = stripRef.current;
    if (!strip || !strip.parentElement) return;
    const width = strip.parentElement.clientWidth;
    // La posición final se mide sobre la celda real (no con cuentas): así queda exactamente centrada
    // bajo el marcador, sin importar separaciones, bordes o redondeos. Antes quedaba corrida unos
    // píxeles y se veía media celda vecina —de otro color— justo en el medio de la ventana.
    const target = strip.children[opts.winCell] as HTMLElement | undefined;
    const center = target ? target.offsetLeft + target.offsetWidth / 2 : opts.winCell * opts.cell + opts.cell / 2;
    // Desvío al azar opcional, siempre chico para que la celda siga centrada
    const jitter = opts.jitterKey === undefined ? 0
      : ((((opts.jitterKey * 9301 + 49297) % 233280) / 233280) - 0.5) * opts.cell * 0.18;
    const end = width / 2 - center + jitter;   // celda ganadora centrada
    const travel = opts.cell * 28;                                                // distancia recorrida
    const start = opts.direction === 'left' ? end + travel : end - travel;
    strip.style.transition = 'none';
    strip.style.transform = `translate3d(${start}px, 0, 0)`;
    void strip.getBoundingClientRect(); // fuerza reflow para que el navegador tome el punto de partida
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      strip.style.transition = `transform ${opts.ms}ms cubic-bezier(.08,.82,.17,1)`;
      strip.style.transform = `translate3d(${end}px, 0, 0)`;
    }));
    return () => cancelAnimationFrame(raf);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
