import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Dataset } from "./dataset.ts";
import { applyMove, newGame, startRound, type GameState, type Move } from "./engine.ts";
import { searchOptions, searchPlayers } from "./search.ts";

let data: Dataset;
beforeAll(() => {
  data = new Dataset(JSON.parse(readFileSync(new URL("../../public/data/game-data.json", import.meta.url), "utf8")));
});

const T0 = 1_000_000;
const MOSS = "MossRa00", AB = "BrowAn04", RUSH = "RushCo00", TURPIN = "TurpKa00", MILLER = "MillKe01", COLSTON = "ColsMa00";

function game(wheel: string, settings = {}) {
  return startRound(newGame(["Arsh", "Sam"], { turnSeconds: 45, strikes: 1, swapRoles: true, ...settings }), wheel, T0);
}
const P = (seat: number, playerId: string): Move => ({ type: "player", seat, playerId });
const C = (seat: number, kind: "college" | "number" | "team", value: string): Move => ({ type: "connection", seat, kind, value });

/** apply moves in order, 1s apart; returns the final result */
function play(state: GameState, moves: Move[]) {
  let t = T0 + 6000;
  let res = { ok: true as boolean, state, error: undefined as string | undefined };
  for (const m of moves) {
    const r = applyMove(res.state, m, data, (t += 1000));
    res = { ok: r.ok, state: r.state, error: r.ok ? undefined : r.error };
    if (!r.ok) break;
  }
  return res;
}

describe("engine", () => {
  it("validates the example chain end to end", () => {
    // Randy Moss → 84 → Antonio Brown → Central Michigan → Cooper Rush → Cowboys → KaVontae Turpin → TCU → Kendre Miller → Saints → Marques Colston
    const r = play(game("MIN"), [
      P(0, MOSS), C(1, "number", "84"), P(0, AB), C(1, "college", "central-michigan"), P(0, RUSH),
      C(1, "team", "DAL"), P(0, TURPIN), C(1, "college", "tcu"), P(0, MILLER), C(1, "team", "NO"), P(0, COLSTON),
    ]);
    expect(r.error).toBeUndefined();
    expect(r.state.round!.chain).toHaveLength(12);
    expect(r.state.round!.status).toBe("playing");
  });

  it("rejects reusing a connection (Saints twice)", () => {
    const r = play(game("DAL"), [
      P(0, TURPIN), C(1, "college", "tcu"), P(0, MILLER), C(1, "team", "NO"), P(0, COLSTON), C(1, "team", "NO"),
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Saints has already been used this round.");
    expect(r.state.round!.status).toBe("over");
    expect(r.state.round!.winner).toBe(0);
    expect(r.state.scores).toEqual([1, 0]);
  });

  it("rejects reusing a player", () => {
    const r = play(game("DAL"), [P(0, TURPIN), C(1, "college", "tcu"), P(0, TURPIN)]);
    expect(r.error).toBe("KaVontae Turpin has already been used this round.");
    expect(r.state.round!.winner).toBe(1);
  });

  it("rejects a false connection with a clear reason", () => {
    const r = play(game("MIN"), [P(0, MOSS), C(1, "college", "tcu")]);
    expect(r.error).toBe("Randy Moss didn't attend TCU.");
    expect(r.state.round!.loseReason).toBe("Randy Moss didn't attend TCU.");
  });

  it("rejects a player who doesn't match the connection", () => {
    const r = play(game("MIN"), [P(0, MOSS), C(1, "number", "84"), P(0, MILLER)]);
    expect(r.error).toBe("Kendre Miller never wore #84.");
    const t = play(game("MIN"), [P(0, MILLER)]);
    expect(t.error).toBe("Kendre Miller never played for the Minnesota Vikings.");
  });

  it("counts the wheel team as used", () => {
    const r = play(game("NO"), [P(0, COLSTON), C(1, "team", "NO")]);
    expect(r.error).toBe("Saints has already been used this round.");
    expect(game("NO").round!.usedConnections).toContain("team:NO");
  });

  it("ends the round on timeout", () => {
    const g = game("NO");
    const early = applyMove(g, { type: "timeout", seat: 0 }, data, T0 + 10_000);
    expect(early.ok).toBe(false);
    expect(early.state.round!.status).toBe("playing");
    // wheel spin (5s) + 45s turn
    const late = applyMove(g, { type: "timeout", seat: 0 }, data, T0 + 50_000);
    expect(late.ok).toBe(true);
    expect(late.state.round!.status).toBe("over");
    expect(late.state.round!.loseReason).toBe("Arsh ran out of time.");
    // a move submitted after the deadline also loses
    const slow = applyMove(g, P(0, COLSTON), data, T0 + 60_000);
    expect(slow.state.round!.loseReason).toBe("Arsh ran out of time.");
  });

  it("ends the round on give up", () => {
    const r = applyMove(game("NO"), { type: "giveUp", seat: 1 }, data, T0 + 6000);
    expect(r.state.round!.status).toBe("over");
    expect(r.state.round!.winner).toBe(0);
    expect(r.state.round!.loseReason).toBe("Sam gave up.");
  });

  it("supports strikes > 1 without resetting the timer", () => {
    const g = game("MIN", { strikes: 2 });
    const deadline = g.round!.deadline;
    const first = applyMove(g, P(0, MILLER), data, T0 + 6000);
    expect(first.ok).toBe(false);
    expect(first.state.round!.status).toBe("playing");
    expect(first.state.round!.strikesLeft).toEqual([1, 2]);
    expect(first.state.round!.turn).toBe(0);
    expect(first.state.round!.deadline).toBe(deadline);
    const retry = applyMove(first.state, P(0, MOSS), data, T0 + 7000);
    expect(retry.ok).toBe(true);
    const second = applyMove(first.state, P(0, MILLER), data, T0 + 8000);
    expect(second.state.round!.status).toBe("over");
    expect(second.state.round!.winner).toBe(1);
  });

  it("counts relocated-franchise players for the current team (Houston Oilers → Titans)", () => {
    const campbell = data.players.find((p) => p.name === "Earl Campbell")!;
    const r = play(game("TEN"), [P(0, campbell.id)]);
    expect(r.error).toBeUndefined();
  });

  it("enforces turn order and swaps roles each round", () => {
    const g = game("NO");
    const wrong = applyMove(g, P(1, COLSTON), data, T0 + 6000);
    expect(!wrong.ok && wrong.error).toBe("It's not your turn.");
    const over = applyMove(g, { type: "giveUp", seat: 0 }, data, T0 + 6000).state;
    const r2 = startRound(over, "DAL", T0 + 10_000);
    expect(r2.round!.number).toBe(2);
    expect(r2.round!.playerNamer).toBe(1);
    expect(r2.round!.turn).toBe(1);
  });

  it("rotates turns through 3 players and eliminates whoever breaks the chain", () => {
    const g = startRound(newGame(["A", "B", "C"], { turnSeconds: 45, strikes: 1, swapRoles: true }), "MIN", T0);
    // A: player, B: connection, C: player, A: connection
    const r = play(g, [P(0, MOSS), C(1, "number", "84"), P(2, AB), C(0, "college", "central-michigan")]);
    expect(r.error).toBeUndefined();
    expect(r.state.round!.turn).toBe(1);
    // B names a bad player: B is out, C must answer the same prompt
    const bad = play(r.state, [P(1, MILLER)]);
    expect(bad.state.round!.status).toBe("playing");
    expect(bad.state.round!.alive).toEqual([true, false, true]);
    expect(bad.state.round!.turn).toBe(2);
    expect(bad.state.round!.expecting).toBe("player");
    // C answers, then A (next alive after C) gives up: C wins
    const end = play(bad.state, [P(2, RUSH), { type: "giveUp", seat: 0 }]);
    expect(end.state.round!.status).toBe("over");
    expect(end.state.round!.winner).toBe(2);
    expect(end.state.scores).toEqual([0, 0, 1]);
    // round 2 opens with the next seat
    expect(startRound(end.state, "DAL", T0 + 99_000).round!.turn).toBe(1);
  });
});

describe("search", () => {
  const names = (q: string) => searchPlayers(data, q).map((p) => p.name);
  it("ignores punctuation and matches word starts", () => {
    expect(names("jamarr")).toContain("Ja'Marr Chase");
    expect(names("dk")).toContain("DK Metcalf");
    expect(names("moss")).toContain("Randy Moss");
    expect(names("randy moss")[0]).toBe("Randy Moss");
  });
  it("finds college aliases and teams by city/nickname/abbr", () => {
    const col = (q: string) => searchOptions(data.options.college, q).map((o) => o.label);
    expect(col("Southern Cal")).toContain("USC");
    expect(col("Southern California")).toContain("USC");
    expect(col("ole miss")).toContain("Ole Miss");
    expect(col("mississippi")).toContain("Ole Miss");
    const team = (q: string) => searchOptions(data.options.team, q).map((o) => o.value);
    expect(team("saints")).toEqual(["NO"]);
    expect(team("KC")).toContain("KC");
    expect(team("houston oilers")).toEqual(["TEN"]);
  });
});
