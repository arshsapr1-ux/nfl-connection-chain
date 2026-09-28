#!/usr/bin/env python3
"""Build the game dataset in data/ from the cached nflverse files in data/raw/.

Outputs:
  data/players.json        full player records (validation source of truth)
  data/teams.json          the 32 franchises, colors, historical names/codes
  data/colleges.json       canonical colleges with aliases
  data/indexes.json        byCollege / byNumber / byTeam -> player ids
  data/search-index.json.gz compact rows for client-side typeahead
  data/quality-report.md   coverage stats and anything that didn't map

Usage: python3 scripts/data/normalize.py
"""
import collections
import csv
import gzip
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import teams as T  # noqa: E402
from colleges import CollegeRegistry, split_colleges  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data")
FIRST_SEASON, LAST_SEASON, FIRST_WEEKLY = 1920, 2026, 2002
ZERO_ALLOWED_FROM = 2023  # #0 became legal in 2023; before that "0" means unknown
COUNTED_WEEKLY_STATUS = {"ACT", "INA"}  # on the active (game-day) roster that week
PFR_ID_RE = re.compile(r"^[A-Za-z][A-Za-z.'\-]{3}[A-Za-z.][A-Za-z.]\d\d$")


def norm_name(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"[\s\-]+", " ", s)).strip()


def read_csv(name):
    with open(os.path.join(RAW, name), newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


def parse_number(raw, season):
    try:
        n = int(float(raw))
    except (TypeError, ValueError):
        return None
    if not 0 <= n <= 99 or (n == 0 and season < ZERO_ALLOWED_FROM):
        return None
    return n


def appearances():
    """Yield counted roster rows: every row of the season files before 2002,
    and active/inactive game-day weekly rows from 2002 on."""
    for y in range(FIRST_SEASON, FIRST_WEEKLY):
        for r in read_csv(f"roster_{y}.csv"):
            yield y, r, None
    for y in range(FIRST_WEEKLY, LAST_SEASON + 1):
        for r in read_csv(f"roster_weekly_{y}.csv"):
            if r["status"] in COUNTED_WEEKLY_STATUS:
                yield y, r, (r["week"], r["status"])


def main():
    players_csv = {r["gsis_id"]: r for r in read_csv("players.csv")}
    by_name_birth = {}
    for r in players_csv.values():
        if r["birth_date"]:
            by_name_birth.setdefault((norm_name(r["display_name"]), r["birth_date"]), r["gsis_id"])

    # Pass 1: link (name, birth) -> gsis id from any row that carries one, so early
    # un-id'd seasons join the same person as later id'd seasons.
    nb_to_gsis = dict(by_name_birth)
    for y, r, _ in appearances():
        if r["gsis_id"] and r["birth_date"]:
            nb_to_gsis.setdefault((norm_name(r["full_name"]), r["birth_date"]), r["gsis_id"])

    def person_key(r):
        if r["gsis_id"]:
            return "g:" + r["gsis_id"]
        nb = (norm_name(r["full_name"]), r["birth_date"])
        if r["birth_date"] and nb in nb_to_gsis:
            return "g:" + nb_to_gsis[nb]
        return "n:" + nb[0] + "|" + nb[1]

    people = collections.defaultdict(lambda: {
        "names": collections.Counter(), "positions": collections.Counter(), "seasons": set(),
        "teams": set(), "defunct": set(), "numbers": set(), "games": set(),
        "roster_colleges": set(), "birth": "", "gsis": None, "pfr": set(),
    })
    unmapped_codes = collections.Counter()

    for y, r, weekly in appearances():
        key = person_key(r)
        p = people[key]
        if key.startswith("g:"):
            p["gsis"] = key[2:]
        p["names"][r["full_name"]] += 1
        if r["position"]:
            p["positions"][r["position"]] += 1
        p["seasons"].add(y)
        p["birth"] = p["birth"] or r["birth_date"]
        if r.get("pfr_id"):
            p["pfr"].add(r["pfr_id"])
        ids, defunct_name, known = T.resolve(r["team"], y)
        if not known:
            unmapped_codes[f"{r['team']} ({y})"] += 1
        p["teams"].update(ids)
        if defunct_name:
            p["defunct"].add(defunct_name)
        n = parse_number(r["jersey_number"], y)
        if n is not None:
            p["numbers"].add(n)
        if weekly and weekly[1] == "ACT":
            p["games"].add((y, weekly[0], r["team"]))
        if y >= 2003 and r["college"]:
            p["roster_colleges"].update(split_colleges(r["college"]))

    # Build records
    colleges = CollegeRegistry()
    records, used_ids = [], set()
    stats = collections.Counter()
    for key, p in people.items():
        src = players_csv.get(p["gsis"]) if p["gsis"] else None
        name = (src and src["display_name"]) or p["names"].most_common(1)[0][0]
        first, last = min(p["seasons"]), max(p["seasons"])

        raw_colleges = split_colleges(src["college_name"]) if src else []
        if not raw_colleges:
            raw_colleges = sorted(p["roster_colleges"])
        college_keys = list(dict.fromkeys(colleges.add(c) for c in raw_colleges))

        numbers = set(p["numbers"])
        if src and last < FIRST_WEEKLY:
            # pre-weekly careers: players.csv holds one number the player wore
            n = parse_number(src["jersey_number"], last)
            if n is not None:
                numbers.add(n)

        pos = [x for x, _ in p["positions"].most_common(3)]
        if not pos and src and src["position"]:
            pos = [src["position"]]

        pfr = (src and src["pfr_id"]) or next(iter(sorted(p["pfr"])), "")
        if pfr and PFR_ID_RE.match(pfr) and pfr not in used_ids:
            pid = pfr
        elif p["gsis"] and p["gsis"] not in used_ids:
            pid = p["gsis"]
            stats["id_fallback_gsis"] += 1
        else:
            base = "nv-" + re.sub(r"[^a-z0-9]+", "-", norm_name(name)) + "-" + (p["birth"] or str(first))
            pid, i = base, 2
            while pid in used_ids:
                pid, i = f"{base}-{i}", i + 1
            stats["id_generated"] += 1
        used_ids.add(pid)

        rec = {
            "id": pid, "name": name, "positions": pos, "firstYear": first, "lastYear": last,
            "colleges": college_keys, "teams": sorted(p["teams"]), "numbers": sorted(numbers),
            "seasons": len(p["seasons"]),
        }
        if p["games"]:
            rec["games"] = len(p["games"])
        if p["defunct"]:
            rec["defunctTeams"] = sorted(p["defunct"])
        if p["birth"]:
            rec["birthDate"] = p["birth"]
        records.append(rec)

    key_to_cid, colleges_json = colleges.finalize()
    for rec in records:
        rec["colleges"] = list(dict.fromkeys(key_to_cid[k] for k in rec["colleges"]))
    records.sort(key=lambda r: (r["name"].lower(), r["firstYear"]))

    # Indexes
    by_college, by_number, by_team = (collections.defaultdict(list) for _ in range(3))
    for rec in records:
        for c in rec["colleges"]:
            by_college[c].append(rec["id"])
        for n in rec["numbers"]:
            by_number[str(n)].append(rec["id"])
        for t in rec["teams"]:
            by_team[t].append(rec["id"])
    indexes = {"byCollege": by_college, "byNumber": by_number, "byTeam": by_team}

    # Compact search rows: [id, name, positions, firstYear, lastYear, teams, games, seasons]
    search = [[r["id"], r["name"], r["positions"], r["firstYear"], r["lastYear"],
               r["teams"] or r.get("defunctTeams", []), r.get("games", 0), r["seasons"]]
              for r in records]

    def dump(name, obj, pretty=False):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1 if pretty else None,
                      separators=None if pretty else (",", ":"))

    dump("players.json", records)
    dump("teams.json", T.teams_json(), pretty=True)
    dump("colleges.json", colleges_json, pretty=True)
    dump("indexes.json", indexes)
    with gzip.open(os.path.join(OUT, "search-index.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(search, f, ensure_ascii=False, separators=(",", ":"))

    write_report(records, colleges_json, unmapped_codes, stats, len(players_csv))


def write_report(records, colleges_json, unmapped, stats, n_players_csv):
    total = len(records)
    no_college = [r for r in records if not r["colleges"]]
    no_number = [r for r in records if not r["numbers"]]
    defunct_only = [r for r in records if not r["teams"]]
    pct = lambda n, d: f"{100 * n / d:.1f}%" if d else "–"

    eras = [(1920, 1959), (1960, 1973), (1974, 1995), (1996, 2001), (2002, 2026)]
    lines = [
        "# Data quality report", "",
        "Source: nflverse-data (players.csv, season rosters 1920–2026, weekly rosters 2002–2026).", "",
        f"- Total players: **{total:,}**",
        f"- Missing college: **{len(no_college):,}** ({pct(len(no_college), total)})",
        f"- Missing jersey numbers: **{len(no_number):,}** ({pct(len(no_number), total)})",
        f"- Only played for defunct franchises (searchable, no team connections): **{len(defunct_only):,}**",
        f"- Canonical colleges: **{len(colleges_json):,}**",
        f"- ids: PFR id where available; nflverse gsis id fallback: {stats['id_fallback_gsis']:,}; "
        f"generated: {stats['id_generated']:,}",
        f"- players.csv rows (all eras 1974+, incl. never-active): {n_players_csv:,}", "",
        "## Coverage by debut era", "",
        "| Debut | Players | Have college | Have number | Have 32-franchise team |",
        "|---|---:|---:|---:|---:|",
    ]
    for lo, hi in eras:
        grp = [r for r in records if lo <= r["firstYear"] <= hi]
        lines.append(f"| {lo}–{hi} | {len(grp):,} | {pct(sum(1 for r in grp if r['colleges']), len(grp))} "
                     f"| {pct(sum(1 for r in grp if r['numbers']), len(grp))} "
                     f"| {pct(sum(1 for r in grp if r['teams']), len(grp))} |")
    lines += ["", "## Team codes that didn't map to a franchise or known defunct team", ""]
    lines += [f"- {k}: {v} rows" for k, v in sorted(unmapped.items())] or ["- none"]
    lines += ["", "## Notes", "",
              "- Franchise grouping follows PFR: 1946–95 Browns = Browns; Ravens from 1996; "
              "AFL and AAFC seasons count for franchises that continued (e.g. 49ers, Browns, Chiefs).",
              "- Team/number counted only for weeks on the game-day roster (ACT/INA) from 2002; "
              "all season-roster rows before 2002 (no finer status available).",
              "- Jersey numbers are only reliably recorded from 1996. Before that, only a single number "
              "from players.csv (1974+ debuts) or sporadic roster values.",
              "- `0` is treated as a real number only from 2023 (when it became legal); earlier it means unknown."]
    with open(os.path.join(OUT, "quality-report.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
