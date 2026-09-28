// Packs data/*.json into public/data/game-data.json: one compact file used by
// the browser (search + local-mode validation) and by the server.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { GameDataFile } from "../src/engine/dataset.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const players = read("players.json");
const colleges = read("colleges.json");
const teams = read("teams.json");

const out: GameDataFile = {
  teams: teams.map((t: any) => ({
    id: t.id, city: t.city, nickname: t.nickname, abbreviation: t.abbreviation,
    colors: t.colors, aliases: t.aliases,
  })),
  colleges: colleges.map((c: any) => [c.id, c.name, c.aliases.filter((a: string) => a !== c.name)]),
  players: players.map((p: any) => [
    p.id, p.name, p.positions.join("/"), p.firstYear, p.lastYear,
    p.teams, p.colleges, p.numbers, p.games ?? 0, p.seasons, p.defunctTeams ?? [],
  ]),
};
mkdirSync(new URL("../public/data", import.meta.url), { recursive: true });
const path = new URL("../public/data/game-data.json", import.meta.url);
writeFileSync(path, JSON.stringify(out));
console.log(`wrote ${out.players.length} players, ${out.colleges.length} colleges, ${out.teams.length} teams`);
