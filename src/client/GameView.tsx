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

export function Scoreboard({ game, highlight, status }: { game: GameState; highlight: Seat | null; status?: [ReactNode, ReactNode] }) {
  return (
    <div className="scoreboard">
      {([0, 1] as Seat[]).map((s) => (
        <div key={s} className={`score ${highlight === s ? "on" : ""}`}>
          <span className="score-name">{game.names[s] || "Waiting…"}{status?.[s]}</span>
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
  seatStatus?: [ReactNode, ReactNode];
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
          ) : r.status === "over" ? (
            <EndScreen data={data} game={game} mySeat={mySeat} onNextRound={onNextRound} onNewGame={onNewGame} />
          ) : (
            <>
              <div className={`banner ${myTurn ? "mine" : ""}`}>
                <div className="banner-text">
                  <div className="banner-round">Round {r.number} · {r.expecting === "player" ? "Name a player" : "Name a connection"}</div>
                  <div className="banner-who">
                    {myTurn ? <><b>{game.names[active]}</b> — {describePrompt(data, game)}</> : <>Waiting for <b>{game.names[active]}</b>…</>}
                  </div>
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
  const players = r.chain.filter((l) => l.type === "player").length;
  const headline = mySeat === null ? `${game.names[w]} wins the round!` : mySeat === w ? "You win the round! 🎉" : `${game.names[w]} wins the round`;
  return (
    <div className="end">
      <div className="end-trophy">🏆</div>
      <h2>{headline}</h2>
      <p className="end-reason">{r.loseReason}</p>
      <p className="muted">Chain length: <b>{players}</b> player{players === 1 ? "" : "s"}, {r.chain.length} links</p>
      <ChainView data={data} chain={r.chain} />
      <div className="end-actions">
        <button className="btn primary big" onClick={onNextRound}>Play again</button>
        <button className="btn" onClick={onNewGame}>New game</button>
      </div>
    </div>
  );
}
