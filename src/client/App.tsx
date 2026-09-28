import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import {
  applyMove, DEFAULT_SETTINGS, newGame, other, randomTeam, startRound, TURN_OPTIONS,
  type GameState, type Move, type Seat, type Settings,
} from "../engine/engine.ts";
import { DISCONNECT_CLAIM_MS, type ClientToServer, type Intent, type RoomView, type ServerToClient } from "../shared/protocol.ts";
import { loadData, useData, useNow } from "./data.ts";
import { GameView } from "./GameView.tsx";

type Route = { page: "home" } | { page: "local"; names: [string, string]; settings: Settings } | { page: "online"; code: string };

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
        {route.page === "home" && <Home onLocal={(names, settings) => go({ page: "local", names, settings })} onOnline={(code) => go({ page: "online", code }, `/game/${code}`)} />}
        {route.page === "local" && <LocalGame names={route.names} settings={route.settings} onExit={() => go({ page: "home" })} />}
        {route.page === "online" && <OnlineGame code={route.code} onExit={() => go({ page: "home" })} />}
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

function Home({ onLocal, onOnline }: { onLocal: (n: [string, string], s: Settings) => void; onOnline: (code: string) => void }) {
  const [mode, setMode] = useState<"local" | "online">("local");
  const [p1, setP1] = useState(() => { try { return localStorage.getItem("name") ?? ""; } catch { return ""; } });
  const [p2, setP2] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
        <div className="eyebrow">Two-player NFL trivia</div>
        <h1>Build the chain.<br /><span className="hl">Don't break it.</span></h1>
        <p>Players and connections alternate: <b>Randy Moss</b> → <span className="chip small">#84</span> → <b>Antonio Brown</b> → <span className="chip small">🎓 Central Michigan</span> → <b>Cooper Rush</b> → <span className="chip small">🏈 Cowboys</span> → …</p>
        <p className="muted">Connections are only colleges, jersey numbers, and NFL teams. No repeats. First invalid move, timeout, or give-up loses the round.</p>
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
          {mode === "local" && (
            <label>Player 2
              <input className="input" value={p2} maxLength={24} placeholder="Name" onChange={(e) => setP2(e.target.value)} />
            </label>
          )}
        </div>
        <SettingsForm settings={settings} onChange={setSettings} />
        {error && <div className="error">{error}</div>}
        {mode === "local" ? (
          <button className="btn primary big" onClick={() => { saveName(p1.trim()); onLocal([p1.trim() || "Player 1", p2.trim() || "Player 2"], settings); }}>
            Start game
          </button>
        ) : (
          <button className="btn primary big" disabled={creating} onClick={create}>{creating ? "Creating…" : "Create online game"}</button>
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

function LocalGame({ names, settings, onExit }: { names: [string, string]; settings: Settings; onExit: () => void }) {
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

function OnlineGame({ code, onExit }: { code: string; onExit: () => void }) {
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
    try { localStorage.setItem("name", name); } catch { /* ignore */ }
    socketRef.current?.emit("join", { code, name }, (res) => {
      if (!res.ok) return setError(res.error);
      try { localStorage.setItem(tokenKey, res.token); } catch { /* ignore */ }
    });
  };

  const onMove = useCallback((intent: Intent) => new Promise<string | null>((resolve) => {
    socketRef.current?.emit("move", intent, (res) => resolve(res.ok ? null : res.error));
  }), []);

  if (!data) return <Loading />;
  if (needsJoin) return <JoinForm code={code} error={error} onJoin={join} onExit={onExit} />;
  if (!room) return <Loading text={connected ? "Connecting to game…" : "Reconnecting…"} />;

  const opp = room.seats[other(room.you)];
  if (!opp) return <WaitingRoom code={code} />;

  const r = room.game.round;
  const oppGoneFor = opp.disconnectedAt ? now - opp.disconnectedAt : 0;
  const status = room.seats.map((s, i) => (
    <span key={i} className={`dot ${s?.connected ? "on" : "off"}`} title={s?.connected ? "Connected" : "Disconnected"}>
      {i === room.you ? " (you)" : ""}
    </span>
  )) as [ReactNode, ReactNode];

  const notice = (
    <>
      {!connected && <div className="notice warn">Connection lost — reconnecting…</div>}
      {!opp.connected && (
        <div className="notice warn">
          {opp.name} disconnected.{" "}
          {r?.status === "playing" && (oppGoneFor >= DISCONNECT_CLAIM_MS
            ? <button className="btn small primary" onClick={() => socketRef.current?.emit("claimWin", () => {})}>Claim the win</button>
            : <>You can claim the win in {Math.ceil((DISCONNECT_CLAIM_MS - oppGoneFor) / 1000)}s.</>)}
        </div>
      )}
    </>
  );

  if (!r) return <Loading text="Starting…" />;
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

function WaitingRoom({ code }: { code: string }) {
  const url = `${location.origin}/game/${code}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <section className="panel narrow center">
      <h2>Waiting for your opponent…</h2>
      <p className="muted">Send them this link. The game starts as soon as they join.</p>
      <div className="code big">{code}</div>
      <div className="share">
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn primary" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
      </div>
      <div className="spinner" />
    </section>
  );
}
