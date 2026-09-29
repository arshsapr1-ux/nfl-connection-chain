import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import {
  applyMove, DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, newGame, randomTeam, startRound, TURN_OPTIONS,
  type GameState, type Move, type Seat, type Settings,
} from "../engine/engine.ts";
import { DISCONNECT_CLAIM_MS, type ClientToServer, type Intent, type RoomView, type ServerToClient } from "../shared/protocol.ts";
import { loadData, useData, useNow } from "./data.ts";
import { GameView } from "./GameView.tsx";

type Route =
  | { page: "home" }
  | { page: "local"; names: string[]; settings: Settings }
  /** joinName: set when the player typed a code on the home page, so we join right away */
  | { page: "online"; code: string; joinName?: string };

const CODE_LENGTH = 6;

/** Accepts "x7k2qd", " X7K-2QD ", or a pasted link ".../game/X7K2QD". */
function parseCode(input: string): string {
  const fromLink = input.match(/\/game\/([A-Za-z0-9]+)/);
  return (fromLink ? fromLink[1] : input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseRoute(): Route {
  const m = location.pathname.match(/^\/game\/([A-Za-z0-9]{4,8})\/?$/);
  return m ? { page: "online", code: m[1].toUpperCase() } : { page: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    loadData(); // start downloading the player index right away
    const onPop = () => setRoute(parseRoute());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = (r: Route, url = "/") => { history.pushState(null, "", url); setRoute(r); };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go({ page: "home" }); }}>
          <span className="brand-ball">🏈</span> NFL Connection Chain
        </a>
        <ThemeToggle />
      </header>
      <main>
        {route.page === "home" && (
          <Home
            onLocal={(names, settings) => go({ page: "local", names, settings })}
            onOnline={(code, joinName) => go({ page: "online", code, joinName }, `/game/${code}`)}
          />
        )}
        {route.page === "local" && <LocalGame names={route.names} settings={route.settings} onExit={() => go({ page: "home" })} />}
        {route.page === "online" && <OnlineGame key={route.code} code={route.code} joinName={route.joinName} onExit={() => go({ page: "home" })} />}
      </main>
    </div>
  );
}

// ---------- theme ----------

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("theme") ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return (
    <button className="btn ghost icon" aria-label="Toggle dark mode" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

// ---------- home / setup ----------

function SettingsForm({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <div className="settings">
      <label>Turn timer
        <select value={String(settings.turnSeconds)} onChange={(e) => onChange({ ...settings, turnSeconds: e.target.value === "null" ? null : Number(e.target.value) })}>
          {TURN_OPTIONS.map((t) => <option key={String(t)} value={String(t)}>{t === null ? "Off" : `${t} seconds`}</option>)}
        </select>
      </label>
      <label>Strikes before losing
        <select value={settings.strikes} onChange={(e) => onChange({ ...settings, strikes: Number(e.target.value) })}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.swapRoles} onChange={(e) => onChange({ ...settings, swapRoles: e.target.checked })} />
        Swap roles each round
      </label>
    </div>
  );
}

function Home({ onLocal, onOnline }: {
  onLocal: (n: string[], s: Settings) => void;
  onOnline: (code: string, joinName?: string) => void;
}) {
  const [mode, setMode] = useState<"local" | "online">("local");
  const [p1, setP1] = useState(() => { try { return localStorage.getItem("name") ?? ""; } catch { return ""; } });
  // pass & play: everyone after player 1
  const [others, setOthers] = useState<string[]>([""]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const joinWithCode = () => {
    const code = parseCode(codeInput);
    if (code.length !== CODE_LENGTH) return setCodeError(`Game codes are ${CODE_LENGTH} characters, like X7K2QD.`);
    const name = p1.trim() || "Player 2";
    saveName(name);
    onOnline(code, name);
  };

  const saveName = (n: string) => { try { localStorage.setItem("name", n); } catch { /* ignore */ } };

  const create = () => {
    setCreating(true);
    const socket: Socket<ServerToClient, ClientToServer> = io();
    const name = p1.trim() || "Player 1";
    saveName(name);
    socket.emit("create", { name, settings }, (res) => {
      socket.disconnect();
      setCreating(false);
      if (!res.ok) return setError(res.error);
      try { localStorage.setItem(`room:${res.code}`, res.token); } catch { /* ignore */ }
      onOnline(res.code);
    });
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="eyebrow">NFL trivia for 2–6 players</div>
        <h1>Build the chain.<br /><span className="hl">Don't break it.</span></h1>
        <p>Players and connections take turns. Connections are only colleges, jersey numbers, and NFL teams. No repeats. First invalid move, timeout, or give-up loses the round.</p>
        <p className="credit">Created by: <b>Arsh Sinha</b></p>
      </section>

      <section className="panel setup">
        <div className="tabs">
          <button className={`tab ${mode === "local" ? "on" : ""}`} onClick={() => setMode("local")}>📱 Pass &amp; play</button>
          <button className={`tab ${mode === "online" ? "on" : ""}`} onClick={() => setMode("online")}>🔗 Play online</button>
        </div>
        <div className="names">
          <label>{mode === "local" ? "Player 1" : "Your name"}
            <input className="input" value={p1} maxLength={24} placeholder="Name" onChange={(e) => setP1(e.target.value)} />
          </label>
          {mode === "local" && others.map((n, i) => (
            <label key={i}>Player {i + 2}
              <div className="name-row">
                <input className="input" value={n} maxLength={24} placeholder="Name"
                  onChange={(e) => setOthers(others.map((o, j) => (j === i ? e.target.value : o)))} />
                {others.length > MIN_PLAYERS - 1 && (
                  <button className="btn ghost icon-x" aria-label={`Remove player ${i + 2}`}
                    onClick={() => setOthers(others.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            </label>
          ))}
        </div>
        {mode === "local" && others.length + 1 < MAX_PLAYERS && (
          <button className="btn small add-player" onClick={() => setOthers([...others, ""])}>+ Add player</button>
        )}
        {mode === "local" && others.length > 1 && (
          <p className="muted small rule-note">Turns rotate in order. Break the chain and you're out — last one standing wins the round.</p>
        )}
        <SettingsForm settings={settings} onChange={setSettings} />
        {error && <div className="error">{error}</div>}
        {mode === "local" ? (
          <button className="btn primary big" onClick={() => { saveName(p1.trim()); onLocal([p1, ...others].map((n, i) => n.trim() || `Player ${i + 1}`), settings); }}>
            Start game
          </button>
        ) : (
          <>
            <button className="btn primary big" disabled={creating} onClick={create}>{creating ? "Creating…" : "Create online game"}</button>
            <div className="divider"><span>or</span></div>
            <div className="join-code">
              <label htmlFor="game-code">Have a game code?</label>
              <div className="share">
                <input
                  id="game-code"
                  className="input code-input"
                  value={codeInput}
                  placeholder="Input game code"
                  maxLength={64}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => { setCodeInput(e.target.value); setCodeError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && joinWithCode()}
                />
                <button className="btn" disabled={!codeInput.trim()} onClick={joinWithCode}>Join game</button>
              </div>
              {codeError && <div className="error">{codeError}</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const LOADING_TIPS = [
  "Connections are only colleges, jersey numbers, and NFL teams.",
  "Relocated teams count: a Houston Oilers player counts for the Titans.",
  "Every value can be used once per round, including the wheel's team.",
  "Players who attended more than one college can connect through any of them.",
];

function Loading({ text = "Warming up the roster" }: { text?: string }) {
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  return (
    <div className="loading" role="status">
      <div className="loading-field" aria-hidden>
        <span className="yard" /><span className="yard" /><span className="yard" /><span className="yard" /><span className="yard" />
        <span className="loading-ball">🏈</span>
      </div>
      <div className="loading-text">{text}<span className="dots" /></div>
      <div className="loading-bar"><span /></div>
      <p className="loading-tip">{tip}</p>
    </div>
  );
}

// ---------- pass & play ----------

function LocalGame({ names, settings, onExit }: { names: string[]; settings: Settings; onExit: () => void }) {
  const data = useData();
  const [game, setGame] = useState<GameState | null>(null);
  const now = useNow();

  useEffect(() => {
    if (data && !game) setGame(startRound(newGame(names, settings), randomTeam(data), Date.now()));
  }, [data, game, names, settings]);

  // local turn clock
  useEffect(() => {
    const r = game?.round;
    if (!data || !game || !r || r.status !== "playing" || r.deadline === null || now < r.deadline) return;
    const res = applyMove(game, { type: "timeout", seat: r.turn }, data, Date.now());
    if (res.ok) setGame(res.state);
  }, [now, data, game]);

  const onMove = useCallback(async (intent: Intent) => {
    if (!data || !game?.round) return null;
    const seat = game.round.turn;
    const move: Move = intent.type === "giveUp" ? { type: "giveUp", seat } : { ...intent, seat } as Move;
    const res = applyMove(game, move, data, Date.now());
    setGame(res.state);
    return res.ok ? null : res.error;
  }, [data, game]);

  if (!data || !game) return <Loading />;
  return (
    <GameView
      data={data} game={game} mySeat={null} now={now} onMove={onMove}
      onNextRound={() => setGame(startRound(game, randomTeam(data), Date.now()))}
      onNewGame={onExit}
    />
  );
}

// ---------- online ----------

function OnlineGame({ code, joinName, onExit }: { code: string; joinName?: string; onExit: () => void }) {
  const data = useData();
  const socketRef = useRef<Socket<ServerToClient, ClientToServer> | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [offset, setOffset] = useState(0);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const now = useNow(250, offset);
  const tokenKey = `room:${code}`;

  useEffect(() => {
    const socket: Socket<ServerToClient, ClientToServer> = io();
    socketRef.current = socket;
    const resume = () => {
      let token: string | null = null;
      try { token = localStorage.getItem(tokenKey); } catch { /* ignore */ }
      if (!token) return setNeedsJoin(true);
      socket.emit("resume", { code, token }, (res) => {
        if (!res.ok) { try { localStorage.removeItem(tokenKey); } catch { /* ignore */ } setNeedsJoin(true); }
      });
    };
    socket.on("connect", () => { setConnected(true); resume(); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (v) => {
      setOffset(v.serverNow - Date.now());
      setRoom(v);
      setNeedsJoin(false);
    });
    return () => { socket.disconnect(); };
  }, [code, tokenKey]);

  const join = (name: string) => {
    setError(null);
    try { localStorage.setItem("name", name); } catch { /* ignore */ }
    socketRef.current?.emit("join", { code, name }, (res) => {
      if (!res.ok) return setError(res.error);
      try { localStorage.setItem(tokenKey, res.token); } catch { /* ignore */ }
    });
  };

  const onMove = useCallback((intent: Intent) => new Promise<string | null>((resolve) => {
    socketRef.current?.emit("move", intent, (res) => resolve(res.ok ? null : res.error));
  }), []);

  // Came from "Input game code" on the home page: join immediately with that name.
  // If it fails (bad code, game full), fall back to the join form showing the error.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (needsJoin && joinName && !autoJoined.current) {
      autoJoined.current = true;
      join(joinName);
    }
  }, [needsJoin, joinName]);

  if (!data) return <Loading />;
  if (needsJoin && joinName && !error) return <Loading text="Joining game" />;
  if (needsJoin) return <JoinForm code={code} error={error} onJoin={join} onExit={onExit} />;
  if (!room) return <Loading text={connected ? "Connecting to game…" : "Reconnecting…"} />;

  const r = room.game.round;
  if (!r) {
    return <Lobby room={room} error={error} onStart={() => socketRef.current?.emit("start", (res) => setError(res.ok ? null : res.error))} />;
  }

  // players still in the round who dropped; the earliest one sets the claim countdown
  const gone = room.seats.filter((s, i) => !s.connected && s.disconnectedAt && r.alive[i] && i !== room.you);
  const goneFor = gone.length ? now - Math.max(...gone.map((s) => s.disconnectedAt!)) : 0;
  const solo = room.seats.length === 2;
  const status: ReactNode[] = room.seats.map((s, i) => (
    <span key={i} className={`dot ${s.connected ? "on" : "off"}`} title={s.connected ? "Connected" : "Disconnected"}>
      {i === room.you ? " (you)" : ""}
    </span>
  ));

  const notice = (
    <>
      {!connected && <div className="notice warn">Connection lost — reconnecting…</div>}
      {gone.length > 0 && (
        <div className="notice warn">
          {gone.map((s) => s.name).join(", ")} disconnected.{" "}
          {r.status === "playing" && (goneFor >= DISCONNECT_CLAIM_MS
            ? <button className="btn small primary" onClick={() => socketRef.current?.emit("claimWin", () => {})}>{solo ? "Claim the win" : "Knock them out"}</button>
            : <>You can {solo ? "claim the win" : "knock them out"} in {Math.ceil((DISCONNECT_CLAIM_MS - goneFor) / 1000)}s.</>)}
        </div>
      )}
    </>
  );

  return (
    <GameView
      data={data} game={room.game} mySeat={room.you} now={now} onMove={onMove} seatStatus={status} notice={notice}
      onNextRound={() => socketRef.current?.emit("nextRound")}
      onNewGame={() => socketRef.current?.emit("newGame")}
    />
  );
}

function JoinForm({ code, error, onJoin, onExit }: { code: string; error: string | null; onJoin: (n: string) => void; onExit: () => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem("name") ?? ""; } catch { return ""; } });
  return (
    <section className="panel narrow">
      <h2>Join game <span className="code">{code}</span></h2>
      <label>Your name
        <input className="input" autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onJoin(name.trim() || "Player 2")} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary big" onClick={() => onJoin(name.trim() || "Player 2")}>Join</button>
        <button className="btn ghost" onClick={onExit}>Cancel</button>
      </div>
    </section>
  );
}

function Lobby({ room, error, onStart }: { room: RoomView; error: string | null; onStart: () => void }) {
  const { code } = room;
  const url = `${location.origin}/game/${code}`;
  const host = room.you === 0;
  const enough = room.seats.length >= MIN_PLAYERS;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <section className="panel narrow center">
      <h2>Game lobby</h2>
      <p className="muted">Send friends the link, or have them tap <b>Play online</b> and enter this code. Up to {room.maxPlayers} players.</p>
      <div className="code big" aria-label={`Game code ${code.split("").join(" ")}`}>{code}</div>
      <div className="share">
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn primary" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
      </div>
      <ol className="lobby-list">
        {room.seats.map((s, i) => (
          <li key={i}>
            <span>{s.name}{i === room.you ? " (you)" : ""}</span>
            <span className="muted small">{i === 0 ? "Host" : ""}<span className={`dot ${s.connected ? "on" : "off"}`} /></span>
          </li>
        ))}
      </ol>
      {error && <div className="error">{error}</div>}
      {host ? (
        <button className="btn primary big" disabled={!enough} onClick={onStart}>
          {enough ? `Start game · ${room.seats.length} players` : "Waiting for players…"}
        </button>
      ) : (
        <p className="muted">Waiting for <b>{room.seats[0].name}</b> to start the game…</p>
      )}
      {!enough && <div className="spinner" />}
    </section>
  );
}
