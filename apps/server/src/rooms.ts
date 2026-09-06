import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet, nanoid } from 'nanoid';
import { createGame, type GameState } from '@nandepoly/engine';

export interface ChatMessage { id: string; playerId: string | null; name: string; text: string; at: number }

export interface Room {
  code: string;
  state: GameState;
  tokens: Record<string, string>;        // playerToken → playerId
  spectators: Record<string, string>;    // playerToken → nombre
  chat: ChatMessage[];
  lastActivity: number;
  auctionDeadline: number | null;        // epoch ms (para el cliente)
  turnDeadline: number | null;
}

const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 5);

export class RoomManager {
  rooms = new Map<string, Room>();
  private dataFile: string | null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string | null, private ttlMs: number) {
    this.dataFile = dataDir ? join(dataDir, 'rooms.json') : null;
    if (this.dataFile) {
      mkdirSync(dataDir!, { recursive: true });
      if (existsSync(this.dataFile)) {
        try {
          const raw = JSON.parse(readFileSync(this.dataFile, 'utf8')) as Room[];
          for (const r of raw) {
            for (const p of r.state.players) p.connected = false;
            r.auctionDeadline = null; r.turnDeadline = null;
            this.rooms.set(r.code, r);
          }
          console.log(`Salas restauradas: ${this.rooms.size}`);
        } catch (e) {
          console.error('No se pudo leer rooms.json', e);
        }
      }
    }
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  create(hostId: string, settings: Partial<GameState['settings']>): Room {
    let code = codeGen();
    while (this.rooms.has(code)) code = codeGen();
    const seed = Math.floor(Math.random() * 2 ** 31);
    const room: Room = {
      code,
      state: createGame(code, hostId, seed, settings),
      tokens: {},
      spectators: {},
      chat: [],
      lastActivity: Date.now(),
      auctionDeadline: null,
      turnDeadline: null,
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  newToken(): string { return nanoid(24); }
  newPlayerId(): string { return nanoid(10); }

  touch(room: Room) {
    room.lastActivity = Date.now();
    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.dataFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        writeFileSync(this.dataFile!, JSON.stringify([...this.rooms.values()]));
      } catch (e) {
        console.error('No se pudo guardar rooms.json', e);
      }
    }, 2000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      const anyoneConnected = r.state.players.some(p => p.connected && !p.isBot);
      if (!anyoneConnected && now - r.lastActivity > this.ttlMs) {
        this.rooms.delete(code);
      }
    }
    this.scheduleSave();
  }
}
