// Typeahead matching: case/accent/punctuation-insensitive, word-prefix based.
import type { Dataset, Option, Player } from "./dataset.ts";

/** "Ja'Marr Chase" -> "jamarr chase", "Smith-Schuster" -> "smith schuster", "A&M" -> "a m". */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(norm: string): string[] {
  return norm ? norm.split(" ") : [];
}

/** 0 = exact, 1 = full-name prefix, 2 = every query word prefixes some name word, -1 = no match */
function matchTier(query: string, qWords: string[], norm: string, words: string[]): number {
  if (norm === query) return 0;
  if (norm.startsWith(query) || norm.replace(/ /g, "").startsWith(query.replace(/ /g, ""))) return 1;
  const used = new Set<number>();
  for (const q of qWords) {
    const i = words.findIndex((w, j) => !used.has(j) && w.startsWith(q));
    if (i < 0) return -1;
    used.add(i);
  }
  return 2;
}

export function searchPlayers(data: Dataset, raw: string, limit = 10): Player[] {
  const q = normalize(raw);
  if (!q) return [];
  const qWords = tokens(q);
  const hits: { p: Player; tier: number }[] = [];
  for (const p of data.players) {
    const tier = matchTier(q, qWords, p.norm, p.words);
    if (tier >= 0) hits.push({ p, tier });
  }
  hits.sort((a, b) => a.tier - b.tier || b.p.rank - a.p.rank || a.p.name.localeCompare(b.p.name));
  return hits.slice(0, limit).map((h) => h.p);
}

export function searchOptions(options: Option[], raw: string, limit = 10): Option[] {
  const q = normalize(raw);
  if (!q) return options.slice(0, limit);
  const qWords = tokens(q);
  const hits: { o: Option; tier: number }[] = [];
  for (const o of options) {
    let best = -1;
    for (const k of o.keys) {
      const t = matchTier(q, qWords, k, tokens(k));
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    if (best >= 0) hits.push({ o, tier: best });
  }
  hits.sort((a, b) => a.tier - b.tier || a.o.label.localeCompare(b.o.label, undefined, { numeric: true }));
  return hits.slice(0, limit).map((h) => h.o);
}
