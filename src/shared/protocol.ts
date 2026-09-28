// Socket.IO message shapes shared by client and server.
import type { ConnectionKind } from "../engine/dataset.ts";
import type { GameState, Seat, Settings } from "../engine/engine.ts";

export type Intent =
  | { type: "player"; playerId: string }
  | { type: "connection"; kind: ConnectionKind; value: string }
  | { type: "giveUp" };

export interface SeatView {
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface RoomView {
  code: string;
  you: Seat;
  seats: [SeatView | null, SeatView | null];
  game: GameState;
  serverNow: number;
}

export type Ack<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServer {
  create: (p: { name: string; settings: Settings }, ack: (r: Ack<{ code: string; token: string }>) => void) => void;
  join: (p: { code: string; name: string }, ack: (r: Ack<{ token: string }>) => void) => void;
  resume: (p: { code: string; token: string }, ack: (r: Ack) => void) => void;
  move: (intent: Intent, ack: (r: Ack) => void) => void;
  nextRound: () => void;
  newGame: () => void;
  claimWin: (ack: (r: Ack) => void) => void;
}

export interface ServerToClient {
  state: (view: RoomView) => void;
}

export const DISCONNECT_CLAIM_MS = 60_000;
