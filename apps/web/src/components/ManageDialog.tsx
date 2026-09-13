import {
  BOARD, GROUP_COLORS, canBuild, canMortgage, canSellBuilding, canUnmortgage, isProperty, mortgageValue,
  unmortgageCost, type GameState,
} from '@nandepoly/engine';
import { useMe, useStore } from '../store';
import { money } from '../format';
import Modal from './Modal';

/** Construir, vender edificios, hipotecar y deshipotecar. */
export default function ManageDialog() {
  const open = useStore(s => s.dialog === 'manage');
  const setDialog = useStore(s => s.setDialog);
  const state = useStore(s => s.state)!;
  const me = useMe();
  const act = useStore(s => s.act);
  if (!me) return <Modal open={false} />;
  const gs = state as unknown as GameState;
  const mine = BOARD.filter(isProperty).filter(t => state.properties[t.id].owner === me.id);

  return (
    <Modal open={open} onClose={() => setDialog(null)} width="max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">🏠 Mis propiedades</h2>
        <div className="text-sm">Efectivo: <b className="text-emerald-700">{money(me.cash)}</b></div>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        Casas disponibles en el banco: {state.housesAvailable} · Hoteles: {state.hotelsAvailable}. Construcción y venta parejas dentro de cada grupo.
      </p>
      {mine.length === 0 && <p className="mt-4 text-ink/60">Todavía no tenés propiedades.</p>}
      <div className="mt-3 space-y-2">
        {mine.map(t => {
          const ps = state.properties[t.id];
          const color = t.type === 'street' ? GROUP_COLORS[t.group] : t.type === 'transport' ? '#37474F' : '#C9A227';
          const build = canBuild(gs, me.id, t.id);
          const sell = canSellBuilding(gs, me.id, t.id);
          const mort = canMortgage(gs, me.id, t.id);
          const unmort = canUnmortgage(gs, me.id, t.id);
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream p-2">
              <span className="h-8 w-2 rounded" style={{ background: color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.name} {ps.mortgaged && <span className="chip bg-red-100 text-red-700">Hipotecada</span>}</div>
                <div className="text-xs text-ink/60">
                  {t.type === 'street' ? (ps.houses === 5 ? 'Hotel' : `${ps.houses} casa(s)`) + ` · casa ${money(t.houseCost)}` : t.type === 'transport' ? 'Transporte' : 'Servicio'}
                  {' · '}hipoteca {money(mortgageValue(t))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.type === 'street' && (
                  <>
                    <button className="btn-green btn-sm" disabled={!!build} title={build ?? `Construir por ${money(t.houseCost)}`} onClick={() => act({ type: 'BUILD', tileId: t.id })}>
                      {ps.houses === 4 ? '+ Hotel' : '+ Casa'}
                    </button>
                    <button className="btn-ghost btn-sm" disabled={!!sell} title={sell ?? `Vender por ${money(Math.floor(t.houseCost / 2))}`} onClick={() => act({ type: 'SELL_BUILDING', tileId: t.id })}>
                      Vender
                    </button>
                  </>
                )}
                {ps.mortgaged ? (
                  <button className="btn-blue btn-sm" disabled={!!unmort} title={unmort ?? ''} onClick={() => act({ type: 'UNMORTGAGE', tileId: t.id })}>
                    Deshipotecar ({money(unmortgageCost(t))})
                  </button>
                ) : (
                  <button className="btn-ghost btn-sm" disabled={!!mort} title={mort ?? ''} onClick={() => act({ type: 'MORTGAGE', tileId: t.id })}>
                    Hipotecar (+{money(mortgageValue(t))})
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn-ghost mt-4 w-full" onClick={() => setDialog(null)}>Cerrar</button>
    </Modal>
  );
}
