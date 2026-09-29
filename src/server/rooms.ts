// Room state. RoomStore is the seam for moving to Redis later: rooms are plain
// JSON-serializable objects; only timers live outside the store.
import { randomBytes, randomInt } from "node:crypto";
import type { GameState, Settings } from "../engine/engine.ts";
import { newGame } from "../engine/engine.ts";

export interface SeatRecord {
  token: string;
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  settings: Settings;
  seats: SeatRecord[];
  game: GameState;
  lastActivity: number;
}

export interface RoomStore {
  get(code: string): Room | undefined;
  set(room: Room): void;
  delete(code: string): void;
  all(): Iterable<Room>;
}

export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  get(code: string) { return this.rooms.get(code); }
  set(room: Room) { this.rooms.set(room.code, room); }
  delete(code: string) { this.rooms.delete(code); }
  all() { return this.rooms.values(); }
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(store: RoomStore): string {
  for (;;) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!store.get(code)) return code;
  }
}

export const newToken = () => randomBytes(16).toString("hex");

export function createRoom(store: RoomStore, name: string, settings: Settings, now: number): { room: Room; token: string } {
  const token = newToken();
  const room: Room = {
    code: newCode(store),
    settings,
    seats: [{ token, name, connected: true, disconnectedAt: null }],
    game: newGame([name], settings),
    lastActivity: now,
  };
  store.set(room);
  return { room, token };
}
