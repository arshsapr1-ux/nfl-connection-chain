// Pure game logic: no UI, no network, no clock (callers pass `now`).
import type { ConnectionKind, Dataset } from "./dataset.ts";

export type Seat = 0 | 1;

export interface Settings {
  /** seconds per turn, or null for no timer */
  turnSeconds: number | null;
  /** invalid moves allowed before losing (1 = first invalid move loses) */
  strikes: number;
  swapRoles: boolean;
}

export const DEFAULT_SETTINGS: Settings = { turnSeconds: 45, strikes: 1, swapRoles: true };
export const TURN_OPTIONS = [null, 15, 30, 45, 60, 90] as const;
/** time allowed for the wheel animation before the first turn clock starts */
export const SPIN_MS = 5000;

export interface Connection {
  kind: ConnectionKind;
  value: string;
}

export type ChainLink =
  | { type: "player"; playerId: string; seat: Seat }
  | { type: "connection"; kind: ConnectionKind; value: string; seat: Seat | null /* null = wheel */ };

export type Move =
  | { type: "player"; seat: Seat; playerId: string }
  | { type: "connection"; seat: Seat; kind: ConnectionKind; value: string }
  | { type: "giveUp"; seat: Seat }
  | { type: "timeout"; seat: Seat }
  | { type: "forfeit"; seat: Seat; reason: string };

export interface Round {
  number: number;
  status: "playing" | "over";
  wheelTeam: string;
  /** seat that names players this round (the other names connections) */
  playerNamer: Seat;
  turn: Seat;
  expecting: "player" | "connection";
  chain: ChainLink[];
  /** "kind:value" keys */
  usedConnections: string[];
  usedPlayers: string[];
  strikesLeft: [number, number];
  /** epoch ms when the current turn times out, or null if untimed */
  deadline: number | null;
  /** ms epoch when the wheel animation ends */
  spinUntil: number;
  /** last rejected move (when strikes remain) */
  lastError: { seat: Seat; message: string } | null;
  winner: Seat | null;
  loseReason: string | null;
}

export interface GameState {
  names: [string, string];
  settings: Settings;
  scores: [number, number];
  round: Round | null;
}

export type MoveResult = { ok: true; state: GameState } | { ok: false; error: string; state: GameState };

export const connKey = (kind: ConnectionKind, value: string) => `${kind}:${value}`;
export const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

export function newGame(names: [string, string], settings: Settings = DEFAULT_SETTINGS): GameState {
  return { names, settings: { ...settings }, scores: [0, 0], round: null };
}

/** Start the next round. `wheelTeam` is chosen by the caller (server or local RNG). */
export function startRound(state: GameState, wheelTeam: string, now: number): GameState {
  const number = (state.round?.number ?? 0) + 1;
  const playerNamer: Seat = state.settings.swapRoles && number % 2 === 0 ? 1 : 0;
  const spinUntil = now + SPIN_MS;
  const s = Math.max(1, state.settings.strikes);
  return {
    ...state,
    round: {
      number, status: "playing", wheelTeam, playerNamer, turn: playerNamer, expecting: "player",
      chain: [{ type: "connection", kind: "team", value: wheelTeam, seat: null }],
      usedConnections: [connKey("team", wheelTeam)], usedPlayers: [], strikesLeft: [s, s],
      deadline: deadlineFrom(state.settings, spinUntil), spinUntil,
      lastError: null, winner: null, loseReason: null,
    },
  };
}

export function randomTeam(data: Dataset, rand: () => number = Math.random): string {
  return data.teams[Math.floor(rand() * data.teams.length)].id;
}

function deadlineFrom(settings: Settings, from: number): number | null {
  return settings.turnSeconds ? from + settings.turnSeconds * 1000 : null;
}

function endRound(state: GameState, loser: Seat, reason: string): GameState {
  const r = state.round!;
  const winner = other(loser);
  const scores: [number, number] = [...state.scores];
  scores[winner] += 1;
  return { ...state, scores, round: { ...r, status: "over", winner, loseReason: reason, deadline: null, lastError: null } };
}

/** The previous link the current move must connect to. */
function lastLink(r: Round): ChainLink {
  return r.chain[r.chain.length - 1];
}

/** Validate a player/connection move; returns an error message or null. */
export function validate(state: GameState, move: Move, data: Dataset): string | null {
  const r = state.round!;
  const prev = lastLink(r);
  if (move.type === "player") {
    const p = data.player(move.playerId);
    if (!p) return "Unknown player.";
    if (r.usedPlayers.includes(p.id)) return `${p.name} has already been used this round.`;
    if (prev.type !== "connection") return "Expected a connection.";
    if (!data.playerHas(p, prev.kind, prev.value)) return mismatch(data, p.id, prev.kind, prev.value);
    return null;
  }
  if (move.type === "connection") {
    const label = data.connectionLabel(move.kind, move.value);
    if (move.kind === "number" && !/^\d{1,2}$/.test(move.value)) return "Jersey numbers are 0–99.";
    if (move.kind === "team" && !data.teamById.has(move.value)) return "Unknown team.";
    if (move.kind === "college" && !data.collegeName.has(move.value)) return "Unknown college.";
    if (r.usedConnections.includes(connKey(move.kind, move.value))) return `${label} has already been used this round.`;
    if (prev.type !== "player") return "Expected a player.";
    if (!data.playerHas(data.player(prev.playerId)!, move.kind, move.value)) return mismatch(data, prev.playerId, move.kind, move.value);
    return null;
  }
  return null;
}

function mismatch(data: Dataset, playerId: string, kind: ConnectionKind, value: string): string {
  const p = data.player(playerId)!;
  const label = data.connectionLabel(kind, value);
  if (kind === "number") {
    return p.numbers.length ? `${p.name} never wore ${label}.` : `${p.name} has no jersey numbers on record, so ${label} can't be verified.`;
  }
  if (kind === "college") {
    return p.colleges.length ? `${p.name} didn't attend ${label}.` : `${p.name} has no college on record, so ${label} can't be verified.`;
  }
  const t = data.teamById.get(value);
  return `${p.name} never played for the ${t ? `${t.city} ${t.nickname}` : label}.`;
}

export function applyMove(state: GameState, move: Move, data: Dataset, now: number): MoveResult {
  const r = state.round;
  if (!r || r.status !== "playing") return { ok: false, error: "No round in progress.", state };

  if (move.type === "forfeit") return { ok: true, state: endRound(state, move.seat, move.reason) };
  if (move.type === "giveUp") return { ok: true, state: endRound(state, move.seat, `${state.names[move.seat]} gave up.`) };

  if (move.seat !== r.turn) return { ok: false, error: "It's not your turn.", state };

  if (move.type === "timeout") {
    if (r.deadline === null || now < r.deadline) return { ok: false, error: "Time isn't up yet.", state };
    return { ok: true, state: endRound(state, move.seat, `${state.names[move.seat]} ran out of time.`) };
  }
  if (r.deadline !== null && now >= r.deadline) {
    return { ok: true, state: endRound(state, move.seat, `${state.names[move.seat]} ran out of time.`) };
  }
  if (move.type !== r.expecting) {
    return { ok: false, error: r.expecting === "player" ? "Name a player." : "Name a connection.", state };
  }

  const error = validate(state, move, data);
  if (error) {
    const strikesLeft: [number, number] = [...r.strikesLeft];
    strikesLeft[move.seat] -= 1;
    if (strikesLeft[move.seat] <= 0) {
      return { ok: false, error, state: endRound(state, move.seat, error) };
    }
    // strike: same player tries again, timer keeps running
    return { ok: false, error, state: { ...state, round: { ...r, strikesLeft, lastError: { seat: move.seat, message: error } } } };
  }

  const next = other(move.seat);
  const round: Round = {
    ...r,
    turn: next,
    expecting: r.expecting === "player" ? "connection" : "player",
    deadline: deadlineFrom(state.settings, now),
    lastError: null,
    chain: [...r.chain, move.type === "player"
      ? { type: "player", playerId: move.playerId, seat: move.seat }
      : { type: "connection", kind: move.kind, value: move.value, seat: move.seat }],
    usedPlayers: move.type === "player" ? [...r.usedPlayers, move.playerId] : r.usedPlayers,
    usedConnections: move.type === "connection" ? [...r.usedConnections, connKey(move.kind, move.value)] : r.usedConnections,
  };
  return { ok: true, state: { ...state, round } };
}
