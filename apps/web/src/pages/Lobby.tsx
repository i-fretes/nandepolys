import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { GameSettings } from '@nandepoly/engine';
import { clearSession, emitAck } from '../socket';
import { useStore } from '../store';
import { money, tokenEmoji } from '../format';
import RulesDialog from '../components/RulesDialog';

export default function Lobby() {
  const nav = useNavigate();
  const { state, playerId, roomCode, spectator, leaveRoom, setRulesOpen } = useStore();
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const isHost = state.hostId === playerId;
  const link = `${location.origin}/sala/${roomCode}`;

  async function start() {
    setBusy(true);
    try { await emitAck('game:action', { type: 'START_GAME' }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    try { await emitAck('room:settings', { [key]: value }); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function addBot() {
    try { await emitAck('room:addBot', {}); } catch (e) { toast.error((e as Error).message); }
  }

  async function kick(id: string) {
    try { await emitAck('room:removePlayer', { playerId: id }); } catch (e) { toast.error((e as Error).message); }
  }

  async function leave() {
    try { if (!spectator) await emitAck('room:removePlayer', {}); } catch { /* ignore */ }
    clearSession(roomCode!);
    leaveRoom();
    nav('/');
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copiado`)).catch(() => toast(text));
  }

  const s = state.settings;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-ink/50">Sala</div>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black tracking-[.3em] text-py-red">{roomCode}</span>
            <button className="btn-ghost btn-sm" onClick={() => copy(roomCode!, 'Código')}>Copiar código</button>
            <button className="btn-ghost btn-sm" onClick={() => copy(link, 'Link')}>Copiar link</button>
          </div>
          <p className="mt-1 text-sm text-ink/60">Compartí el código o el link: <span className="font-mono">{link}</span></p>
        </div>
        <div className="flex gap-2">
          <button className="btn-blue btn-sm" onClick={() => setRulesOpen(true)}>📖 Cómo se juega</button>
          <button className="btn-ghost btn-sm" onClick={leave}>Salir</button>
        </div>
      </header>
      <RulesDialog />

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-bold">Jugadores ({state.players.length}/6)</h2>
          <ul className="mt-3 space-y-2">
            {state.players.map(p => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-cream px-3 py-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-xl" style={{ boxShadow: `0 0 0 3px ${p.color}` }}>{tokenEmoji(p.token)}</span>
                <span className="font-semibold">{p.name}</span>
                {p.id === state.hostId && <span className="chip bg-py-gold/20 text-yellow-800">Anfitrión</span>}
                {p.isBot && <span className="chip bg-slate-200 text-slate-700">Bot</span>}
                {p.id === playerId && <span className="chip bg-blue-100 text-py-blue">Vos</span>}
                {!p.connected && !p.isBot && <span className="chip bg-red-100 text-red-700">Desconectado</span>}
                {isHost && p.id !== playerId && (
                  <button className="ml-auto text-xs text-ink/50 hover:text-red-600" onClick={() => kick(p.id)}>Quitar</button>
                )}
              </li>
            ))}
            {Array.from({ length: 6 - state.players.length }).map((_, i) => (
              <li key={i} className="rounded-xl border-2 border-dashed border-black/10 px-3 py-2 text-sm text-ink/40">Lugar libre</li>
            ))}
          </ul>
          {isHost && state.players.length < 6 && (
            <button className="btn-ghost btn-sm mt-3" onClick={addBot}>+ Agregar bot</button>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-bold">Reglas de la partida</h2>
          <p className="text-xs text-ink/50">{isHost ? 'Solo vos podés cambiarlas.' : 'Las define el anfitrión.'}</p>
          <div className="mt-3 space-y-3">
            <Row label="Efectivo inicial">
              <select className="input !w-auto !py-1" disabled={!isHost} value={s.startingCash} onChange={e => setSetting('startingCash', Number(e.target.value))}>
                {[1000, 1500, 2000, 2500].map(v => <option key={v} value={v}>{money(v)}</option>)}
              </select>
            </Row>
            <Toggle label="Subastar propiedades rechazadas (regla oficial)" checked={s.auctions} disabled={!isHost} onChange={v => setSetting('auctions', v)} />
            <Toggle label="Pozo en Estacionamiento Libre" checked={s.freeParkingPot} disabled={!isHost} onChange={v => setSetting('freeParkingPot', v)} />
            <Toggle label="Doble sueldo al caer exacto en Salida" checked={s.doubleGoSalary} disabled={!isHost} onChange={v => setSetting('doubleGoSalary', v)} />
            <Toggle label="Sin compras en la primera vuelta" checked={s.noBuyFirstLap} disabled={!isHost} onChange={v => setSetting('noBuyFirstLap', v)} />
            <Row label="Tiempo por turno">
              <select className="input !w-auto !py-1" disabled={!isHost} value={s.turnTimerSeconds} onChange={e => setSetting('turnTimerSeconds', Number(e.target.value))}>
                <option value={0}>Sin límite</option><option value={60}>60 s</option><option value={120}>120 s</option><option value={180}>180 s</option>
              </select>
            </Row>
            <div className="my-2 border-t border-black/10 pt-2 text-xs font-bold uppercase tracking-wide text-ink/50">🎰 Timba (opcional)</div>
            <Toggle label="Casinos (dos casillas 🎰 a los lados del tablero: ruleta 49/51, quiniela, doble o nada, carrera de carretas)" checked={s.casino} disabled={!isHost} onChange={v => setSetting('casino', v)} />
            {s.casino && (
              <Row label="Apuesta máxima en el Casino">
                <select className="input !w-auto !py-1" disabled={!isHost} value={s.casinoMaxBet} onChange={e => setSetting('casinoMaxBet', Number(e.target.value))}>
                  {[200, 500, 1000, 2000].map(v => <option key={v} value={v}>{money(v)}</option>)}
                </select>
              </Row>
            )}
            <Toggle label="Jackpot: lo perdido en el Casino se acumula y el doble seis se lo lleva" checked={s.jackpot} disabled={!isHost} onChange={v => setSetting('jackpot', v)} />
            <Toggle label="Alquiler a doble o nada (7+ no pagás, 6- pagás doble; el dueño decide)" checked={s.rentDoubleOrNothing} disabled={!isHost} onChange={v => setSetting('rentDoubleOrNothing', v)} />
            <Toggle label="Desafíos entre jugadores (dados, piedra-papel-tijera, trivia, tereré) + cartas ¡Desafío!" checked={s.challenges} disabled={!isHost} onChange={v => setSetting('challenges', v)} />
            <Toggle label="Duelo mayor: cada 3 vueltas ganás una ficha para retar a alguien por hasta ₲ 500.000 a Escopeta o Truco a 2 manos (negarse cuesta ₲ 50.000)" checked={s.duels} disabled={!isHost} onChange={v => setSetting('duels', v)} />
            <div className="my-2 border-t border-black/10 pt-2 text-xs font-bold uppercase tracking-wide text-ink/50">🏟️ Fiesta (opcional)</div>
            <Toggle label="La Arena (dos casillas 🏟️ arriba y abajo): al caer, TODOS juegan un mini-juego votado entre 3; el banco paga 300/150/50 mil y el que tiene menos efectivo cobra doble" checked={s.arena} disabled={!isHost} onChange={v => setSetting('arena', v)} />
            <Toggle label="Caja sorpresa al pasar por Salida (en vez de ₲ 200.000 fijos: carrete con premios, promedio ≈ 200.000)" checked={s.lootbox} disabled={!isHost} onChange={v => setSetting('lootbox', v)} />
            <Toggle label="Misiones secretas: 3 objetivos ocultos por jugador que pagan solos al cumplirse" checked={s.missions} disabled={!isHost} onChange={v => setSetting('missions', v)} />
            <Toggle label="Eventos globales: cada vuelta completa de la mesa gira una ruleta (2 de cada 3 veces: tranquilidad)" checked={s.events} disabled={!isHost} onChange={v => setSetting('events', v)} />
            <Row label="Duración máxima">
              <select className="input !w-auto !py-1" disabled={!isHost} value={s.timeLimitMinutes} onChange={e => setSetting('timeLimitMinutes', Number(e.target.value))}>
                <option value={0}>Sin límite</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option>
              </select>
            </Row>
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        {isHost ? (
          <button className="btn-primary px-10 py-3 text-lg" disabled={busy || state.players.length < 2} onClick={start}>
            {state.players.length < 2 ? 'Esperando al menos 2 jugadores…' : '¡Empezar partida!'}
          </button>
        ) : (
          <p className="animate-pulse font-semibold text-ink/60">Esperando a que el anfitrión empiece…</p>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between gap-3 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-medium">
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-py-blue" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}
