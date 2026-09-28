# NFL Connection Chain

Two-player NFL trivia: build a chain that alternates players and connections
(college, jersey number, or NFL team). Pass-and-play on one screen, or online via a share link.

## Run locally

```bash
npm install
npm run data      # packs data/*.json into public/data/game-data.json
npm run dev       # http://localhost:3000 (Express + Socket.IO + Vite dev middleware)
npm test          # engine + search unit tests
```

Production: `npm run build && npm start` (serves `dist/client` and the socket server on `$PORT`).

## Layout

- `src/engine/` — pure game logic shared by browser and server (`applyMove`, used values, turns, strikes, timers via a passed-in clock), dataset lookups, and typeahead search.
- `src/server/` — one Node service: static frontend + Socket.IO rooms. The server is authoritative (validates moves, runs the turn clock, picks the wheel team). Rooms live in an in-memory `RoomStore` (swap for Redis later), expire after 2h idle.
- `src/client/` — React UI (wheel, typeaheads, chain, used panel, end screen).
- `scripts/data/` — offline dataset build from nflverse (see below). `scripts/smoke-online.ts` drives a two-player online game against a running server.

## Data

Source: [nflverse-data](https://github.com/nflverse/nflverse-data) (Pro Football Reference blocks automated access).
The app never fetches data at runtime.

```bash
python3 scripts/data/fetch_nflverse.py   # one-time download into data/raw/ (resumable)
python3 scripts/data/normalize.py        # builds data/*.json + data/quality-report.md
```

Colleges and numbers are complete from ~1996; older eras are partial (see `data/quality-report.md`).

## Deploy (Render / Railway / Fly.io)

Deploy as a single long-running Node web service (not serverless — Socket.IO needs persistent WebSockets):

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Node 20+. The service listens on `$PORT`.

Commit `data/*.json` (not `data/raw/`) so the build can run `npm run data` without re-downloading.
Rooms are in memory, so run a single instance.
