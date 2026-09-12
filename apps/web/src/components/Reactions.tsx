import { REACTIONS } from '../format';
import { useStore } from '../store';

/**
 * Reacciones rápidas: reemplazan al chat. Al tocar una, el emoji sale flotando
 * sobre tu ficha en la pantalla de todos. Hay un límite de una por segundo.
 */
export default function Reactions() {
  const react = useStore(s => s.react);
  return (
    <div className="card flex items-center justify-between gap-1 p-2">
      {REACTIONS.map(e => (
        <button key={e} className="reaction" title="Mandar esta reacción a la mesa" onClick={() => react(e)}>{e}</button>
      ))}
    </div>
  );
}
