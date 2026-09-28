// One Node service: serves the built frontend and runs Socket.IO game rooms.
// The server is authoritative: it owns game state, validates moves, and runs timers.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import { Server, type Socket } from "socket.io";
import { Dataset } from "../engine/dataset.ts";
import {
  applyMove, DEFAULT_SETTINGS, other, randomTeam, startRound, TURN_OPTIONS, type Seat, type Settings,
} from "../engine/engine.ts";
import { DISCONNECT_CLAIM_MS, type ClientToServer, type RoomView, type ServerToClient } from "../shared/protocol.ts";
import { createRoom, MemoryRoomStore, newToken, type Room, type RoomStore } from "./rooms.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT ?? 3000);
const PROD = process.env.NODE_ENV === "production";
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const data = new Dataset(JSON.parse(readFileSync(path.join(ROOT, "public/data/game-data.json"), "utf8")));
const store: RoomStore = new MemoryRoomStore();
const timers = new Map<string, NodeJS.Timeout>();

const app = express();
app.use(compression());
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient, {}, { code?: string; seat?: Seat }>(http);

// ---------- rooms ----------

function sanitizeSettings(s: Partial<Settings> | undefined): Settings {
  const turnSeconds = (TURN_OPTIONS as readonly (number | null)[]).includes(s?.turnSeconds ?? null)
    ? (s!.turnSeconds ?? null) : DEFAULT_SETTINGS.turnSeconds;
  const strikes = Math.min(3, Math.max(1, Math.round(Number(s?.strikes) || 1)));
  return { turnSeconds, strikes, swapRoles: s?.swapRoles !== false };
}
const cleanName = (n: unknown) => String(n ?? "").trim().slice(0, 24) || "Player";

function view(room: Room, seat: Seat): RoomView {
  return {
    code: room.code, you: seat, game: room.game, serverNow: Date.now(),
    seats: room.seats.map((s) => s && { name: s.name, connected: s.connected, disconnectedAt: s.disconnectedAt }) as RoomView["seats"],
  };
}

async function broadcast(room: Room) {
  room.lastActivity = Date.now();
  store.set(room);
  for (const s of await io.in(room.code).fetchSockets()) {
    if (s.data.seat !== undefined) s.emit("state", view(room, s.data.seat));
  }
  scheduleTimeout(room);
}

/** Server-side turn clock: end the round when the active player's deadline passes. */
function scheduleTimeout(room: Room) {
  clearTimeout(timers.get(room.code));
  const r = room.game.round;
  if (!r || r.status !== "playing" || r.deadline === null) return;
  timers.set(room.code, setTimeout(() => {
    const cur = store.get(room.code);
    const rr = cur?.game.round;
    if (!cur || !rr || rr.status !== "playing") return;
    const res = applyMove(cur.game, { type: "timeout", seat: rr.turn }, data, Date.now());
    if (res.ok) { cur.game = res.state; void broadcast(cur); } else scheduleTimeout(cur);
  }, Math.max(0, r.deadline - Date.now()) + 50));
}

function beginRound(room: Room) {
  room.game = startRound(room.game, randomTeam(data), Date.now());
}

function attach(socket: Socket, room: Room, seat: Seat) {
  socket.data = { code: room.code, seat };
  void socket.join(room.code);
  const s = room.seats[seat]!;
  s.connected = true;
  s.disconnectedAt = null;
}

io.on("connection", (socket) => {
  const current = () => {
    const { code, seat } = socket.data;
    const room = code ? store.get(code) : undefined;
    return room && seat !== undefined ? { room, seat } : null;
  };

  socket.on("create", (p, ack) => {
    const { room, token } = createRoom(store, cleanName(p?.name), sanitizeSettings(p?.settings), Date.now());
    attach(socket, room, 0);
    ack({ ok: true, code: room.code, token });
    void broadcast(room);
  });

  socket.on("join", (p, ack) => {
    const room = store.get(String(p?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, error: "That game doesn't exist or has expired." });
    if (room.seats[1]) return ack({ ok: false, error: "That game is already full." });
    const token = newToken();
    const name = cleanName(p?.name);
    room.seats[1] = { token, name, connected: true, disconnectedAt: null };
    room.game = { ...room.game, names: [room.seats[0]!.name, name] };
    attach(socket, room, 1);
    beginRound(room);
    ack({ ok: true, token });
    void broadcast(room);
  });

  socket.on("resume", (p, ack) => {
    const room = store.get(String(p?.code ?? "").toUpperCase());
    if (!room) return ack({ ok: false, error: "That game doesn't exist or has expired." });
    const seat = room.seats.findIndex((s) => s?.token === p?.token);
    if (seat < 0) return ack({ ok: false, error: "Not a player in this game." });
    attach(socket, room, seat as Seat);
    ack({ ok: true });
    void broadcast(room);
  });

  socket.on("move", (intent, ack) => {
    const cur = current();
    if (!cur) return ack({ ok: false, error: "Not in a game." });
    const { room, seat } = cur;
    const move = intent?.type === "player" ? { type: "player" as const, seat, playerId: String(intent.playerId) }
      : intent?.type === "connection" ? { type: "connection" as const, seat, kind: intent.kind, value: String(intent.value) }
      : intent?.type === "giveUp" ? { type: "giveUp" as const, seat }
      : null;
    if (!move || (move.type === "connection" && !["college", "number", "team"].includes(move.kind))) {
      return ack({ ok: false, error: "Invalid move." });
    }
    const res = applyMove(room.game, move, data, Date.now());
    room.game = res.state;
    ack(res.ok ? { ok: true } : { ok: false, error: res.error });
    void broadcast(room);
  });

  socket.on("nextRound", () => {
    const cur = current();
    if (!cur || cur.room.game.round?.status !== "over") return;
    beginRound(cur.room);
    void broadcast(cur.room);
  });

  socket.on("newGame", () => {
    const cur = current();
    if (!cur || cur.room.game.round?.status !== "over") return;
    cur.room.game = { ...cur.room.game, scores: [0, 0], round: null };
    beginRound(cur.room);
    void broadcast(cur.room);
  });

  socket.on("claimWin", (ack) => {
    const cur = current();
    if (!cur) return ack({ ok: false, error: "Not in a game." });
    const { room, seat } = cur;
    const opp = room.seats[other(seat)];
    if (!opp || opp.connected || !opp.disconnectedAt || Date.now() - opp.disconnectedAt < DISCONNECT_CLAIM_MS) {
      return ack({ ok: false, error: "Your opponent is still here." });
    }
    const res = applyMove(room.game, { type: "forfeit", seat: other(seat), reason: `${opp.name} disconnected.` }, data, Date.now());
    room.game = res.state;
    ack(res.ok ? { ok: true } : { ok: false, error: res.error });
    void broadcast(room);
  });

  socket.on("disconnect", async () => {
    const cur = current();
    if (!cur) return;
    // another tab/socket may still hold this seat
    const still = (await io.in(cur.room.code).fetchSockets()).some((s) => s.data.seat === cur.seat);
    if (still) return;
    const s = cur.room.seats[cur.seat]!;
    s.connected = false;
    s.disconnectedAt = Date.now();
    void broadcast(cur.room);
  });
});

// Expire rooms after 2 hours of inactivity.
setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const room of [...store.all()]) {
    if (room.lastActivity < cutoff) {
      clearTimeout(timers.get(room.code));
      timers.delete(room.code);
      store.delete(room.code);
    }
  }
}, 5 * 60 * 1000).unref();

// ---------- frontend ----------

if (PROD) {
  const dist = path.join(ROOT, "dist/client");
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({ configFile: path.join(ROOT, "vite.config.ts"), server: { middlewareMode: true, hmr: { server: http } }, appType: "spa" });
  app.use(vite.middlewares);
}

http.listen(PORT, () => console.log(`NFL Chain running on http://localhost:${PORT}`));
