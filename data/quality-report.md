# Data quality report

Source: nflverse-data (players.csv, season rosters 1920–2026, weekly rosters 2002–2026).

- Total players: **29,811**
- Missing college: **8,369** (28.1%)
- Missing jersey numbers: **15,340** (51.5%)
- Only played for defunct franchises (searchable, no team connections): **2,098**
- Canonical colleges: **924**
- ids: PFR id where available; nflverse gsis id fallback: 1,482; generated: 8,216
- players.csv rows (all eras 1974+, incl. never-active): 24,833

## Coverage by debut era

| Debut | Players | Have college | Have number | Have 32-franchise team |
|---|---:|---:|---:|---:|
| 1920–1959 | 5,855 | 0.1% | 0.5% | 64.2% |
| 1960–1973 | 3,419 | 30.7% | 1.5% | 100.0% |
| 1974–1995 | 7,881 | 99.8% | 22.5% | 100.0% |
| 1996–2001 | 2,387 | 99.7% | 98.9% | 100.0% |
| 2002–2026 | 10,269 | 98.8% | 99.9% | 100.0% |

## Team codes that didn't map to a franchise or known defunct team

- none

## Notes

- Franchise grouping follows PFR: 1946–95 Browns = Browns; Ravens from 1996; AFL and AAFC seasons count for franchises that continued (e.g. 49ers, Browns, Chiefs).
- Team/number counted only for weeks on the game-day roster (ACT/INA) from 2002; all season-roster rows before 2002 (no finer status available).
- Jersey numbers are only reliably recorded from 1996. Before that, only a single number from players.csv (1974+ debuts) or sporadic roster values.
- `0` is treated as a real number only from 2023 (when it became legal); earlier it means unknown.
