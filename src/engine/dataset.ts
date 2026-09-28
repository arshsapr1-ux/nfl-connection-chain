// Dataset: player/college/team lookups shared by the browser and the server.
import { normalize, tokens } from "./search.ts";

export type ConnectionKind = "college" | "number" | "team";

export interface Team {
  id: string;
  city: string;
  nickname: string;
  abbreviation: string;
  colors: { primary: string; secondary: string };
  aliases: string[];
}

// [id, name, positions "WR/TE", firstYear, lastYear, teams, colleges, numbers, games, seasons, defunctTeams]
export type PlayerRow = [string, string, string, number, number, string[], string[], number[], number, number, string[]];

export interface GameDataFile {
  teams: Team[];
  colleges: [string, string, string[]][]; // [id, name, aliases]
  players: PlayerRow[];
}

export interface Player {
  id: string;
  name: string;
  positions: string;
  firstYear: number;
  lastYear: number;
  teams: string[];
  colleges: string[];
  numbers: number[];
  games: number;
  seasons: number;
  defunctTeams: string[];
  /** notability used to rank search results */
  rank: number;
  /** normalized name and its words, for search */
  norm: string;
  words: string[];
}

export interface Option {
  kind: ConnectionKind;
  value: string;
  label: string;
  /** normalized strings the option can be found by */
  keys: string[];
}

export class Dataset {
  readonly players: Player[];
  readonly byId = new Map<string, Player>();
  readonly teams: Team[];
  readonly teamById = new Map<string, Team>();
  readonly collegeName = new Map<string, string>();
  readonly options: Record<ConnectionKind, Option[]>;

  constructor(file: GameDataFile) {
    this.teams = file.teams;
    for (const t of file.teams) this.teamById.set(t.id, t);
    for (const [id, name] of file.colleges) this.collegeName.set(id, name);

    this.players = file.players.map(([id, name, positions, firstYear, lastYear, teams, colleges, numbers, games, seasons, defunctTeams]) => {
      const norm = normalize(name);
      return {
        id, name, positions, firstYear, lastYear, teams, colleges, numbers, games, seasons, defunctTeams,
        // games are only known from 2002; estimate ~13 per earlier season
        rank: Math.max(games, seasons * 13),
        norm, words: tokens(norm),
      };
    });
    for (const p of this.players) this.byId.set(p.id, p);

    this.options = {
      college: file.colleges.map(([id, name, aliases]) => ({
        kind: "college" as const, value: id, label: name, keys: [name, ...aliases].map(normalize),
      })),
      number: Array.from({ length: 100 }, (_, n) => ({
        kind: "number" as const, value: String(n), label: `#${n}`, keys: [String(n)],
      })),
      team: file.teams.map((t) => ({
        kind: "team" as const, value: t.id, label: `${t.city} ${t.nickname}`, keys: t.aliases.map(normalize),
      })),
    };
  }

  player(id: string): Player | undefined {
    return this.byId.get(id);
  }

  /** Human label for a connection value, e.g. "TCU", "#84", "Saints". */
  connectionLabel(kind: ConnectionKind, value: string): string {
    if (kind === "number") return `#${value}`;
    if (kind === "team") return this.teamById.get(value)?.nickname ?? value;
    return this.collegeName.get(value) ?? value;
  }

  /** Is the connection true of the player? */
  playerHas(p: Player, kind: ConnectionKind, value: string): boolean {
    if (kind === "team") return p.teams.includes(value);
    if (kind === "college") return p.colleges.includes(value);
    return p.numbers.includes(Number(value));
  }
}
