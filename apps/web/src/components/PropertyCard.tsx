import { GROUP_COLORS, GROUP_NAMES, groupTiles, isProperty, mortgageValue, tile, unmortgageCost, type Tile } from '@nandepoly/engine';
import { useStore } from '../store';
import { money } from '../format';
import Modal from './Modal';

/** Tarjeta de detalle de una casilla (se abre al tocarla en el tablero o en el panel). */
export default function PropertyCard() {
  const selected = useStore(s => s.selectedTile);
  const setSelected = useStore(s => s.setSelectedTile);
  const state = useStore(s => s.state);
  if (selected === null || !state) return <Modal open={false} />;
  const t = tile(selected);
  return (
    <Modal open onClose={() => setSelected(null)} width="max-w-sm">
      <TileDetails t={t} />
      <button className="btn-ghost mt-4 w-full" onClick={() => setSelected(null)}>Cerrar</button>
    </Modal>
  );
}

export function TileDetails({ t }: { t: Tile }) {
  const state = useStore(s => s.state)!;
  const ps = isProperty(t) ? state.properties[t.id] : null;
  const owner = ps?.owner ? state.players.find(p => p.id === ps.owner) : null;

  if (t.type === 'street') {
    const groupOwners = groupTiles(t.group).map(g => state.properties[g.id].owner);
    const monopoly = owner && groupOwners.every(o => o === owner.id);
    return (
      <div>
        <div className="rounded-xl px-4 py-3 text-center text-white" style={{ background: GROUP_COLORS[t.group] }}>
          <div className="text-xs uppercase tracking-wider opacity-80">Título de propiedad · {GROUP_NAMES[t.group]}</div>
          <div className="text-xl font-black">{t.name}</div>
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            <Row k="Precio" v={money(t.price)} />
            <Row k="Alquiler" v={money(t.rents[0])} hint={monopoly ? 'x2 con grupo completo' : `(${money(t.rents[0] * 2)} con grupo completo)`} strong={!!monopoly && ps!.houses === 0} />
            {[1, 2, 3, 4].map(n => <Row key={n} k={`Con ${n} casa${n > 1 ? 's' : ''}`} v={money(t.rents[n])} strong={ps?.houses === n} />)}
            <Row k="Con hotel" v={money(t.rents[5])} strong={ps?.houses === 5} />
            <Row k="Costo por casa / hotel" v={money(t.houseCost)} />
            <Row k="Valor hipotecario" v={money(mortgageValue(t))} hint={`deshipotecar: ${money(unmortgageCost(t))}`} />
          </tbody>
        </table>
        <OwnerLine owner={owner} ps={ps} />
      </div>
    );
  }
  if (t.type === 'transport') {
    return (
      <div>
        <div className="rounded-xl bg-slate-700 px-4 py-3 text-center text-white">
          <div className="text-xs uppercase tracking-wider opacity-80">Transporte</div>
          <div className="text-xl font-black">🚌 {t.name}</div>
        </div>
        <table className="mt-3 w-full text-sm"><tbody>
          <Row k="Precio" v={money(t.price)} />
          <Row k="Alquiler con 1 transporte" v={money(25)} />
          <Row k="Con 2" v={money(50)} /><Row k="Con 3" v={money(100)} /><Row k="Con 4" v={money(200)} />
          <Row k="Valor hipotecario" v={money(100)} />
        </tbody></table>
        <OwnerLine owner={owner} ps={ps} />
      </div>
    );
  }
  if (t.type === 'utility') {
    return (
      <div>
        <div className="rounded-xl bg-amber-100 px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wider opacity-70">Servicio público</div>
          <div className="text-xl font-black">💡 {t.name}</div>
        </div>
        <table className="mt-3 w-full text-sm"><tbody>
          <Row k="Precio" v={money(t.price)} />
          <Row k="Con 1 servicio" v="4 × dados (en miles)" />
          <Row k="Con 2 servicios" v="10 × dados (en miles)" />
          <Row k="Valor hipotecario" v={money(75)} />
        </tbody></table>
        <OwnerLine owner={owner} ps={ps} />
      </div>
    );
  }
  const desc: Record<string, string> = {
    go: 'Cada vez que pasás o caés acá cobrás ₲ 200.000 del banco.',
    jail: 'Si solo estás de visita, no pasa nada. Si estás preso: pagás ₲ 50.000, usás una carta o intentás sacar dobles (máximo 3 turnos).',
    parking: state.settings.freeParkingPot ? 'Regla casera activa: quien cae acá se lleva el pozo acumulado de impuestos y multas.' : 'Descansá. No pasa nada (regla oficial).',
    gotojail: 'Vas directo a Tacumbú sin pasar por Salida ni cobrar.',
    chance: 'Sacás la primera carta del mazo de Suerte y hacés lo que dice.',
    community: 'Sacás la primera carta del mazo de Cooperativa y hacés lo que dice.',
    tax: t.type === 'tax' && t.percent ? `Elegís: pagar ${money(t.amount)} o el ${t.percent} % de tu patrimonio total.` : `Pagás ${money((t as { amount: number }).amount)} al banco.`,
  };
  return (
    <div>
      <div className="rounded-xl bg-cream px-4 py-3 text-center"><div className="text-xl font-black">{t.name}</div></div>
      <p className="mt-3 text-sm text-ink/80">{desc[t.type]}</p>
    </div>
  );
}

function Row({ k, v, hint, strong }: { k: string; v: string; hint?: string; strong?: boolean }) {
  return (
    <tr className={`border-b border-black/5 ${strong ? 'bg-yellow-50 font-bold' : ''}`}>
      <td className="py-1 pr-2 text-ink/70">{k}</td>
      <td className="py-1 text-right">{v}{hint && <span className="ml-1 text-xs text-ink/50">{hint}</span>}</td>
    </tr>
  );
}

function OwnerLine({ owner, ps }: { owner: { name: string; color: string } | null | undefined; ps: { houses: number; mortgaged: boolean } | null }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      {owner ? (
        <>
          <span className="h-3 w-3 rounded-full" style={{ background: owner.color }} />
          <span>Dueño: <b>{owner.name}</b></span>
          {ps?.mortgaged && <span className="chip bg-red-100 text-red-700">Hipotecada</span>}
          {ps && ps.houses > 0 && <span className="chip bg-emerald-100 text-emerald-800">{ps.houses === 5 ? 'Hotel' : `${ps.houses} casa${ps.houses > 1 ? 's' : ''}`}</span>}
        </>
      ) : <span className="text-ink/60">Sin dueño (se puede comprar)</span>}
    </div>
  );
}
