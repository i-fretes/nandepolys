import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clearSession, connect, emitAck, loadName, loadSession, saveName, saveSession, socket } from '../socket';
import { useStore, type RoomView } from '../store';
import { TokenPicker } from './Home';
import Lobby from './Lobby';
import Game from './Game';

type JoinRes = { roomCode: string; playerId: string | null; playerToken: string; spectator?: boolean } & RoomView;

export default function Room() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const roomCode = code.toUpperCase();
  const store = useStore();
  const [status, setStatus] = useState<'checking' | 'join' | 'in' | 'missing'>('checking');
  const [info, setInfo] = useState<{ phase: string; players: number; takenTokens: string[] } | null>(null);
  const [name, setName] = useState(loadName());
  const [token, setToken] = useState('mate');
  const [busy, setBusy] = useState(false);
  const triedRejoin = useRef(false);

  // Entrar / reconectar
  useEffect(() => {
    connect();
    let cancelled = false;

    async function boot() {
      if (store.roomCode === roomCode && store.state) { setStatus('in'); return; }
      const res = await fetch(`/api/rooms/${roomCode}`).then(r => r.json()).catch(() => null);
      if (cancelled) return;
      if (!res?.exists) { setStatus('missing'); return; }
      setInfo(res);
      const saved = loadSession(roomCode);
      if (saved && !triedRejoin.current) {
        triedRejoin.current = true;
        try {
          const r = await emitAck<JoinRes>('room:rejoin', { roomCode, playerToken: saved.playerToken });
          if (cancelled) return;
          store.enterRoom({ ...r, spectator: !!r.spectator });
          setStatus('in');
          return;
        } catch {
          clearSession(roomCode);
        }
      }
      const free = ['mate', 'chipa', 'nanduti', 'carreta', 'jaguarete', 'arpa'].find(t => !res.takenTokens.includes(t));
      if (free) setToken(free);
      setStatus('join');
    }
    if (!socket.connected) {
      socket.once('connect', () => { void boot(); });
    } else {
      void boot();
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Reconexión automática del socket → volver a la sala
  useEffect(() => {
    function onReconnect() {
      const s = useStore.getState();
      if (s.roomCode === roomCode && s.playerToken) {
        emitAck<JoinRes>('room:rejoin', { roomCode, playerToken: s.playerToken })
          .then(r => s.enterRoom({ ...r, spectator: !!r.spectator }))
          .catch(() => toast.error('No se pudo volver a la sala.'));
      }
    }
    socket.io.on('reconnect', onReconnect);
    return () => { socket.io.off('reconnect', onReconnect); };
  }, [roomCode]);

  async function join() {
    if (!name.trim()) return toast.error('Poné tu nombre');
    setBusy(true);
    try {
      saveName(name.trim());
      const r = await emitAck<JoinRes>('room:join', { roomCode, name: name.trim(), token });
      saveSession(roomCode, { playerToken: r.playerToken, name: name.trim() });
      store.enterRoom({ ...r, spectator: !!r.spectator });
      if (r.spectator) toast('La partida ya empezó o está llena: entrás como espectador.', { icon: '👀' });
      setStatus('in');
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (status === 'checking') {
    return <Center><p className="animate-pulse text-lg font-semibold">Conectando a la sala {roomCode}…</p></Center>;
  }
  if (status === 'missing') {
    return (
      <Center>
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-2xl font-black">Sala no encontrada</h1>
          <p className="mt-2 text-ink/70">No existe una sala con el código <b>{roomCode}</b>. Puede haber expirado.</p>
          <button className="btn-primary mt-4" onClick={() => nav('/')}>Volver al inicio</button>
        </div>
      </Center>
    );
  }
  if (status === 'join') {
    const full = (info?.players ?? 0) >= 6 || info?.phase !== 'LOBBY';
    return (
      <Center>
        <div className="card w-full max-w-lg p-6">
          <h1 className="text-2xl font-black">Sala <span className="tracking-widest text-py-red">{roomCode}</span></h1>
          <p className="mt-1 text-sm text-ink/60">{info?.players ?? 0} jugador(es) dentro{full ? ' — entrarás como espectador' : ''}.</p>
          <label className="mt-4 block text-sm font-semibold text-ink/70">Tu nombre</label>
          <input className="input mt-1" maxLength={20} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && join()} />
          {!full && (
            <>
              <label className="mt-4 block text-sm font-semibold text-ink/70">Tu ficha</label>
              <div className="mt-1"><TokenPicker value={token} onChange={setToken} taken={info?.takenTokens ?? []} /></div>
            </>
          )}
          <button className="btn-primary mt-5 w-full" disabled={busy} onClick={join}>{full ? 'Mirar la partida' : 'Entrar a la sala'}</button>
        </div>
      </Center>
    );
  }
  if (!store.state) return null;
  return store.state.phase === 'LOBBY' ? <Lobby /> : <Game />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-full items-center justify-center px-4 py-10">{children}</main>;
}
