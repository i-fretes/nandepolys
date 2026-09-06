import { useEffect, useState } from 'react';
import { tile, type PropertyTile } from '@nandepoly/engine';
import { useStore } from '../store';
import { money } from '../format';
import Modal from './Modal';
import { TileDetails } from './PropertyCard';

export default function AuctionDialog() {
  const state = useStore(s => s.state)!;
  const me = useStore(s => s.playerId);
  const act = useStore(s => s.act);
  const deadline = useStore(s => s.auctionDeadline);
  const a = state.auction;
  const [amount, setAmount] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (a) setAmount(Math.max(10, a.highestBid + 10));
  }, [a?.highestBid, a?.tileId]);

  if (!a || state.turnPhase !== 'AUCTION') return <Modal open={false} />;
  const t = tile(a.tileId) as PropertyTile;
  const meP = state.players.find(p => p.id === me);
  const inAuction = !!me && a.activeBidders.includes(me);
  const iAmHighest = a.highestBidderId === me;
  const highest = a.highestBidderId ? state.players.find(p => p.id === a.highestBidderId) : null;
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const canPass = inAuction && !(iAmHighest && a.activeBidders.length > 1);

  return (
    <Modal open width="max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">🔨 Subasta</h2>
        {secs !== null && <span className={`font-mono text-lg ${secs <= 5 ? 'text-red-600' : 'text-ink/60'}`}>{secs}s</span>}
      </div>
      <div className="mt-3"><TileDetails t={t} /></div>

      <div className="mt-4 rounded-xl bg-cream p-3 text-center">
        {highest ? (
          <div>Oferta más alta: <b className="text-lg">{money(a.highestBid)}</b> de <b>{highest.name}</b></div>
        ) : <div className="text-ink/60">Todavía nadie ofertó. Mínimo {money(10)}.</div>}
        <div className="mt-1 text-xs text-ink/50">
          Siguen en la subasta: {a.activeBidders.map(id => state.players.find(p => p.id === id)?.name).join(', ')}
        </div>
      </div>

      {inAuction && meP ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {[10, 20, 50, 100].map(step => (
              <button key={step} className="btn-ghost btn-sm" onClick={() => setAmount(v => Math.min(meP.cash, v + step))}>+{step} mil</button>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => setAmount(Math.max(10, a.highestBid + 10))}>Mínimo</button>
          </div>
          <div className="flex gap-2">
            <input type="number" className="input" min={a.highestBid + 10} max={meP.cash} step={10} value={amount}
              onChange={e => setAmount(Number(e.target.value))} />
            <button className="btn-green whitespace-nowrap" disabled={amount <= a.highestBid || amount > meP.cash || amount < 10}
              onClick={() => act({ type: 'BID', amount: Math.floor(amount) })}>Ofertar {money(amount)}</button>
          </div>
          <div className="flex items-center justify-between text-sm text-ink/60">
            <span>Tu efectivo: {money(meP.cash)}</span>
            <button className="btn-ghost btn-sm" disabled={!canPass} onClick={() => act({ type: 'AUCTION_PASS' })}>
              {iAmHighest ? 'Tenés la mejor oferta' : 'Me retiro'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-ink/60">{me && a.activeBidders.length ? 'Te retiraste; esperando a los demás…' : 'Mirando la subasta…'}</p>
      )}
    </Modal>
  );
}
