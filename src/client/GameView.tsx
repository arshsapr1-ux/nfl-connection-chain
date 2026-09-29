// The in-round screen shared by pass-and-play and online modes.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ConnectionKind, Dataset } from "../engine/dataset.ts";
import type { ChainLink, GameState, Seat } from "../engine/engine.ts";
import type { Intent } from "../shared/protocol.ts";
import { ConnectionPicker, PlayerPicker } from "./Pickers.tsx";
import { Wheel } from "./Wheel.tsx";

const ICON: Record<ConnectionKind, string> = { college: "🎓", number: "", team: "🏈" };

export function connLabel(data: Dataset, kind: ConnectionKind, value: string) {
  return `${ICON[kind]} ${data.connectionLabel(kind, value)}`.trim();
}

function describePrompt(data: Dataset, game: GameState): string {
  const r = game.round!;
  const prev = r.chain[r.chain.length - 1];
  if (prev.type === "connection") {
    const label = data.connectionLabel(prev.kind, prev.value);
    if (prev.kind === "team") {
      const t = data.teamById.get(prev.value);
      return `name a player who played for the ${t ? `${t.city} ${t.nickname}` : label}`;
    }
    if (prev.kind === "number") return `name a player who wore ${label}`;
    return `name a player who went to ${label}`;
  }
  const p = data.player(prev.playerId);
  return `name a college, jersey number, or team for ${p?.name ?? "that player"}`;
}

export function ChainView({ data, chain }: { data: Dataset; chain: ChainLink[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.scrollTo({ left: el.scrollWidth, top: el.scrollHeight, behavior: "smooth" });
  }, [chain.length]);
  return (
    <div className="chain" ref={ref}>
      {chain.map((l, i) => {
        if (l.type === "connection") {
          return (
            <div key={i} className={`chip chip-${l.kind} ${l.seat === null ? "wheel-chip" : ""}`} title={l.seat === null ? "Wheel spin" : undefined}>
              {connLabel(data, l.kind, l.value)}
            </div>
          );
        }
        const p = data.player(l.playerId);
        return (
          <div key={i} className="card-player">
            <div className="card-name">{p?.name ?? l.playerId}</div>
            <div className="card-meta">{p?.positions} · {p?.firstYear === p?.lastYear ? p?.firstYear : `${p?.firstYear}–${p?.lastYear}`}</div>
          </div>
        );
      })}
    </div>
  );
}

function UsedPanel({ data, used }: { data: Dataset; used: string[] }) {
  const groups: { kind: ConnectionKind; title: string }[] = [
    { kind: "team", title: "Teams" }, { kind: "college", title: "Colleges" }, { kind: "number", title: "Numbers" },
  ];
  return (
    <aside className="panel used">
      <h3>Used connections</h3>
      {groups.map(({ kind, title }) => {
        const vals = used.filter((u) => u.startsWith(kind + ":")).map((u) => u.slice(kind.length + 1));
        return (
          <div key={kind} className="used-group">
            <div className="used-title">{title}</div>
            {vals.length ? (
              <div className="used-list">{vals.map((v) => <span key={v} className={`chip small chip-${kind}`}>{connLabel(data, kind, v)}</span>)}</div>
            ) : <div className="muted small">None yet</div>}
          </div>
        );
      })}
    </aside>
  );
}

export function Scoreboard({ game, highlight, status }: { game: GameState; highlight: Seat | null; status?: ReactNode[] }) {
  const alive = game.round?.status === "playing" ? game.round.alive : null;
  return (
    <div className={`scoreboard ${game.names.length > 2 ? "multi" : ""}`}>
      {game.names.map((name, s) => (
        <div key={s} className={`score ${highlight === s ? "on" : ""} ${alive && !alive[s] ? "out" : ""}`}>
          <span className="score-name">{name || "Waiting…"}{status?.[s]}</span>
          <span className="score-num">{game.scores[s]}</span>
        </div>
      ))}
    </div>
  );
}

export interface GameViewProps {
  data: Dataset;
  game: GameState;
  /** null in pass-and-play (the active player uses the shared screen) */
  mySeat: Seat | null;
  now: number;
  onMove: (intent: Intent) => Promise<string | null>;
  onNextRound: () => void;
  onNewGame: () => void;
  seatStatus?: ReactNode[];
  notice?: ReactNode;
}

export function GameView({ data, game, mySeat, now, onMove, onNextRound, onNewGame, seatStatus, notice }: GameViewProps) {
  const r = game.round!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [r.number, r.chain.length]);

  const spinning = now < r.spinUntil;
  const active = r.turn;
  const myTurn = mySeat === null || mySeat === active;
  const secondsLeft = r.deadline === null ? null : Math.max(0, Math.ceil((r.deadline - now) / 1000));
  const shownError = error ?? (r.lastError && (mySeat === null || r.lastError.seat === mySeat) ? r.lastError.message : null);
  const lastOut = r.outs[r.outs.length - 1];
  const iAmOut = mySeat !== null && !r.alive[mySeat];
  const over = r.status === "over";

  if (over && !spinning) {
    return (
      <div className="game">
        {notice}
        <EndScreen data={data} game={game} mySeat={mySeat} onNextRound={onNextRound} onNewGame={onNewGame} />
      </div>
    );
  }

  const send = async (intent: Intent) => {
    setBusy(true);
    const err = await onMove(intent);
    setBusy(false);
    setError(err);
  };

  return (
    <div className="game">
      <Scoreboard game={game} highlight={r.status === "playing" && !spinning ? active : null} status={seatStatus} />
      {notice}
      {/* hide the wheel result until the spin lands */}
      <ChainView data={data} chain={spinning ? [] : r.chain} />

      <div className="game-grid">
        <section className="panel main">
          {spinning ? (
            <Wheel teams={data.teams} result={r.wheelTeam} spinUntil={r.spinUntil} now={now} />
          ) : (
            <>
              <div className={`banner ${myTurn ? "mine" : ""}`}>
                <div className="banner-text">
                  <div className="banner-round">Round {r.number} · {r.expecting === "player" ? "Name a player" : "Name a connection"}</div>
                  <div className="banner-who">
                    {myTurn ? <><b>{game.names[active]}</b> — {describePrompt(data, game)}</> : <>Waiting for <b>{game.names[active]}</b>…</>}
                  </div>
                  {game.names.length > 2 && lastOut && (
                    <div className="out-note">❌ {game.names[lastOut.seat]} is out — {lastOut.reason}</div>
                  )}
                  {iAmOut && <div className="out-note">You're out this round — watch the rest play it out.</div>}
                  {game.settings.strikes > 1 && (
                    <div className="strikes">Strikes left: {"●".repeat(r.strikesLeft[active])}{"○".repeat(game.settings.strikes - r.strikesLeft[active])}</div>
                  )}
                </div>
                {secondsLeft !== null && <div className={`timer ${secondsLeft <= 10 ? "low" : ""}`}>{secondsLeft}</div>}
              </div>
              {shownError && <div className="error" role="alert">✗ {shownError}</div>}
              {myTurn && (r.expecting === "player"
                ? <PlayerPicker key={`p${r.number}-${r.chain.length}`} data={data} busy={busy} onSubmit={(playerId) => send({ type: "player", playerId })} />
                : <ConnectionPicker key={`c${r.number}-${r.chain.length}`} data={data} used={r.usedConnections} busy={busy}
                    onSubmit={(kind, value) => send({ type: "connection", kind, value })} />)}
              {myTurn && <button className="btn ghost giveup" onClick={() => send({ type: "giveUp" })}>Give up</button>}
            </>
          )}
        </section>
        <UsedPanel data={data} used={spinning ? [] : r.usedConnections} />
      </div>
    </div>
  );
}

function EndScreen({ data, game, mySeat, onNextRound, onNewGame }: {
  data: Dataset; game: GameState; mySeat: Seat | null; onNextRound: () => void; onNewGame: () => void;
}) {
  const r = game.round!;
  const w = r.winner!;
  const [showChain, setShowChain] = useState(false);
  const players = r.chain.filter((l) => l.type === "player").length;
  const headline = mySeat === null ? `${game.names[w]} wins!` : mySeat === w ? "You win! 🎉" : `${game.names[w]} wins`;
  const standings = game.names.map((name, seat) => ({ name, seat, score: game.scores[seat] })).sort((a, b) => b.score - a.score);
  return (
    <section className="panel end">
      <div className="end-trophy">🏆</div>
      <div className="end-round">Round {r.number}</div>
      <h2>{headline}</h2>
      <p className="end-reason">{r.loseReason}</p>

      <div className="end-stats">
        <div><b>{players}</b><span>player{players === 1 ? "" : "s"}</span></div>
        <div><b>{r.chain.length}</b><span>links</span></div>
        <div><b>{r.usedConnections.length}</b><span>connections</span></div>
      </div>

      <ol className="standings">
        {standings.map((s) => (
          <li key={s.seat} className={s.seat === w ? "win" : ""}>
            <span className="standings-name">{s.name}{s.seat === mySeat ? " (you)" : ""}</span>
            <span className="standings-score">{s.score}</span>
          </li>
        ))}
      </ol>

      <div className="end-actions">
        <button className="btn primary big" onClick={onNextRound}>Play again</button>
        <button className="btn" onClick={onNewGame}>New game</button>
      </div>

      <button className="btn ghost small" aria-expanded={showChain} onClick={() => setShowChain((v) => !v)}>
        {showChain ? "Hide chain ▲" : "View chain ▼"}
      </button>
      {showChain && <ChainList data={data} game={game} />}
    </section>
  );
}

/** The finished chain as a compact vertical list. */
function ChainList({ data, game }: { data: Dataset; game: GameState }) {
  const chain = game.round!.chain;
  return (
    <ol className="chain-list">
      {chain.map((l, i) => {
        const by = l.seat === null ? "Wheel" : game.names[l.seat];
        if (l.type === "connection") {
          return (
            <li key={i}>
              <span className={`chip small chip-${l.kind} ${l.seat === null ? "wheel-chip" : ""}`}>{connLabel(data, l.kind, l.value)}</span>
              <span className="chain-by">{by}</span>
            </li>
          );
        }
        const p = data.player(l.playerId);
        return (
          <li key={i}>
            <span className="chain-player">{p?.name ?? l.playerId}</span>
            <span className="chain-by">{by}</span>
          </li>
        );
      })}
    </ol>
  );
}
