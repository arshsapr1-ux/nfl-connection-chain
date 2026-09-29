// Smoke test for online mode against a running server: npx tsx scripts/smoke-online.ts
import { io } from "socket.io-client";
const URL = process.env.URL ?? "http://localhost:3000";
const call = (s: any, ev: string, ...a: any[]) => new Promise<any>((r) => s.emit(ev, ...a, r));
const nextState = (s: any) => new Promise<any>((r) => s.once("state", r));
const a = io(URL), b = io(URL);
const created = await call(a, "create", { name: "Arsh", settings: { turnSeconds: 30, strikes: 1, swapRoles: true } });
console.log("create", created.ok, created.code);
const bState = nextState(b);
const joined = await call(b, "join", { code: created.code, name: "Sam" });
await bState;
const st = await new Promise<any>((r) => { b.once("state", r); a.emit("start", () => {}); });
const r = st.game.round;
console.log("join", joined.ok, "| wheel:", r.wheelTeam, "| turn seat", r.turn, "| names", st.game.names);
await new Promise((res) => setTimeout(res, 5100)); // wait out the wheel spin
// b tries to move out of turn
console.log("out-of-turn:", await call(b, "move", { type: "player", playerId: "MossRa00" }));
// a names a player who doesn't match the wheel team (loses with 1 strike unless it matches)
const ids: Record<string, string> = { MIN: "MossRa00", NO: "ColsMa00", DAL: "TurpKa00", PIT: "BrowAn04" };
const pid = ids[r.wheelTeam] ?? "ColsMa00";
const res = await call(a, "move", { type: "player", playerId: pid });
console.log(`a plays ${pid} for ${r.wheelTeam}:`, res);
// reconnect: b drops and resumes with token
b.disconnect();
const b2 = io(URL);
const s2 = nextState(b2);
console.log("resume:", await call(b2, "resume", { code: created.code, token: joined.token }));
const after = await s2;
console.log("restored seat", after.you, "chain len", after.game.round.chain.length, "status", after.game.round.status, after.game.round.loseReason ?? "");
if (after.game.round.status === "playing") {
  console.log("b gives up:", await call(b2, "move", { type: "giveUp" }));
}
const s3 = new Promise<any>((r) => a.on("state", (v: any) => v.game.round?.number === 2 && r(v)));
a.emit("nextRound"); const n = await s3;
console.log("next round", n.game.round.number, "playerNamer", n.game.round.playerNamer, "scores", n.game.scores);
a.disconnect(); b2.disconnect(); process.exit(0);
