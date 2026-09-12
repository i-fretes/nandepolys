import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TOKENS } from '@nandepoly/engine';
import { connect, emitAck, loadName, saveName, saveSession } from '../socket';
import { useStore, type RoomView } from '../store';

export function TokenPicker({ value, onChange, taken = [] }: { value: string; onChange: (t: string) => void; taken?: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {TOKENS.map(t => {
        const disabled = taken.includes(t.id);
        return (
          <button
            key={t.id} type="button" disabled={disabled} onClick={() => onChange(t.id)}
            title={t.label}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-2xl transition ${value === t.id ? 'border-py-blue bg-blue-50' : 'border-black/10 bg-white hover:border-black/30'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
          >
            <span>{t.emoji}</span>
            <span className="text-[10px] font-semibold leading-tight text-center">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [name, setName] = useState(loadName());
  const [token, setToken] = useState('mate');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const enterRoom = useStore(s => s.enterRoom);

  useEffect(() => { connect(); }, []);

  async function create() {
    if (!name.trim()) return toast.error('Poné tu nombre');
    setBusy(true);
    try {
      saveName(name.trim());
      const res = await emitAck<{ roomCode: string; playerId: string; playerToken: string } & RoomView>('room:create', { name: name.trim(), token });
      saveSession(res.roomCode, { playerToken: res.playerToken, name: name.trim() });
      enterRoom({ ...res, spectator: false });
      nav(`/sala/${res.roomCode}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return toast.error('Ingresá el código de la sala');
    saveName(name.trim());
    nav(`/sala/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <div className="brand inline-block !text-5xl sm:!text-7xl" style={{ fontSize: undefined }}>Ñandepoly</div>
        <p className="mt-5 text-lg text-ink/70">El juego de comprar, construir y cobrar alquiler… en guaraníes. De 2 a 6 jugadores, online.</p>
      </header>

      <section className="card w-full p-6">
        <label className="block text-sm font-semibold text-ink/70">Tu nombre</label>
        <input className="input mt-1" maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Ivan" />
        <label className="mt-4 block text-sm font-semibold text-ink/70">Tu ficha</label>
        <div className="mt-1"><TokenPicker value={token} onChange={setToken} /></div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-4">
            <h2 className="font-bold">Crear sala nueva</h2>
            <p className="mt-1 text-sm text-ink/60">Te damos un código para compartir con tus amigos.</p>
            <button className="btn-primary mt-3 w-full" disabled={busy} onClick={create}>Crear sala</button>
          </div>
          <div className="rounded-2xl bg-cream p-4">
            <h2 className="font-bold">Unirme con código</h2>
            <input className="input mt-2 uppercase tracking-widest" maxLength={6} placeholder="TERERE" value={code}
              onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && join()} />
            <button className="btn-blue mt-2 w-full" onClick={join}>Entrar</button>
          </div>
        </div>
      </section>

      <footer className="text-center text-xs text-ink/50">
        Juego independiente sin fines comerciales, ambientado en Paraguay. Reglas clásicas de compra-venta de propiedades.
      </footer>
    </main>
  );
}
