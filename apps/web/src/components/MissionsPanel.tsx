import { motion } from 'framer-motion';
import { useMe, useStore } from '../store';
import { money } from '../format';

/** Misiones secretas del jugador (solo las propias; las ajenas viajan tapadas). */
export default function MissionsPanel() {
  const me = useMe();
  const state = useStore(s => s.state)!;
  if (!state.settings.missions || !me || !me.missions.length) return null;
  const done = me.missions.filter(m => m.done).length;
  return (
    <div className="card p-3" data-missions>
      <div className="flex items-center justify-between">
        <div className="text-sm font-black">🎯 Tus misiones secretas</div>
        <span className="chip bg-amber-100 text-amber-800">{done}/{me.missions.length}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {me.missions.map(m => (
          <motion.div key={m.id} layout className={`mission ${m.done ? 'mission-done' : ''}`} title={m.done ? 'Cumplida' : 'Pendiente · nadie más la ve'}>
            <span className="text-base">{m.done ? '🏅' : '🔒'}</span>
            <span className={`flex-1 text-xs ${m.done ? 'line-through opacity-70' : 'font-semibold'}`}>{m.text}</span>
            <b className={`text-xs ${m.done ? 'text-amber-700' : 'text-emerald-700'}`}>{money(m.reward)}</b>
          </motion.div>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-ink/40">Se pagan solas al cumplirse. Los demás solo ven cuántas llevás.</div>
    </div>
  );
}
