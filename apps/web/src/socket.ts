import { io } from 'socket.io-client';

export const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });

export interface AckOk<T> { ok: true } // + campos
export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

export function emitAck<T = Record<string, never>>(event: string, payload: unknown): Promise<T & { ok: true }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sin respuesta del servidor.')), 10000);
    socket.emit(event, payload, (res: Ack<T>) => {
      clearTimeout(timer);
      if (!res) return reject(new Error('Sin respuesta.'));
      if (res.ok) resolve(res as T & { ok: true });
      else reject(new Error(res.error));
    });
  });
}

export function connect() {
  if (!socket.connected) socket.connect();
}

// Sesión guardada por sala (para reconectar)
const KEY = (code: string) => `nandepoly:session:${code.toUpperCase()}`;
export interface SavedSession { playerToken: string; name: string }

export function saveSession(code: string, s: SavedSession) {
  try { localStorage.setItem(KEY(code), JSON.stringify(s)); } catch { /* ignore */ }
}
export function loadSession(code: string): SavedSession | null {
  try { const raw = localStorage.getItem(KEY(code)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearSession(code: string) {
  try { localStorage.removeItem(KEY(code)); } catch { /* ignore */ }
}
export function loadName(): string {
  try { return localStorage.getItem('nandepoly:name') ?? ''; } catch { return ''; }
}
export function saveName(name: string) {
  try { localStorage.setItem('nandepoly:name', name); } catch { /* ignore */ }
}

// Acceso para pruebas automatizadas (e2e) y depuración desde la consola del navegador
declare global { interface Window { __nandepoly?: { socket: typeof socket } } }
if (typeof window !== 'undefined') window.__nandepoly = { socket };
