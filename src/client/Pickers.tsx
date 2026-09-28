// Typeaheads. They never hint at valid answers: every player/option is listed,
// and validation happens on submit.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ConnectionKind, Dataset, Option, Player } from "../engine/dataset.ts";
import { connKey } from "../engine/engine.ts";
import { searchOptions, searchPlayers } from "../engine/search.ts";

interface Row<T> { key: string; item: T; disabled?: boolean; render: ReactNode }

function Typeahead<T>({ rows, query, setQuery, selected, onSelect, placeholder, autoFocus }: {
  rows: Row<T>[]; query: string; setQuery: (q: string) => void; selected: string | null;
  onSelect: (row: Row<T> | null) => void; placeholder: string; autoFocus?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => setActive(Math.max(0, rows.findIndex((r) => !r.disabled))), [rows]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let i = active;
      for (let step = 0; step < rows.length; step++) {
        i = (i + dir + rows.length) % rows.length;
        if (!rows[i].disabled) break;
      }
      setActive(i);
      listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (open && row && !row.disabled) { onSelect(row); setOpen(false); }
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="typeahead">
      <input
        className="input"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        onChange={(e) => { setQuery(e.target.value); onSelect(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && rows.length > 0 && !selected && (
        <ul className="dropdown" ref={listRef} role="listbox">
          {rows.map((r, i) => (
            <li
              key={r.key}
              role="option"
              aria-selected={i === active}
              aria-disabled={r.disabled}
              className={`${i === active ? "active" : ""} ${r.disabled ? "disabled" : ""}`}
              onMouseEnter={() => !r.disabled && setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); if (!r.disabled) { onSelect(r); setOpen(false); } }}
            >
              {r.render}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function playerMeta(data: Dataset, p: Player): string {
  const years = p.firstYear === p.lastYear ? `${p.firstYear}` : `${p.firstYear}–${p.lastYear}`;
  const teams = p.teams.length ? p.teams.map((t) => data.teamById.get(t)?.abbreviation ?? t).join(", ") : p.defunctTeams.join(", ");
  return [p.positions, years, teams].filter(Boolean).join(" · ");
}

export function PlayerPicker({ data, onSubmit, busy }: { data: Dataset; onSubmit: (id: string) => void; busy: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const rows = useMemo<Row<Player>[]>(() => searchPlayers(data, query, 10).map((p) => ({
    key: p.id, item: p,
    render: <><span className="row-main">{p.name}</span><span className="row-meta">{playerMeta(data, p)}</span></>,
  })), [data, query]);

  const submit = () => {
    if (!selected) return;
    onSubmit(selected.id);
    setQuery(""); setSelected(null);
  };
  return (
    <div className="picker">
      <Typeahead
        rows={rows} query={query} setQuery={setQuery} selected={selected?.id ?? null} autoFocus
        placeholder="Start typing a player's name…"
        onSelect={(r) => { setSelected(r?.item ?? null); if (r) setQuery(r.item.name); }}
      />
      {selected && <div className="selected-meta">{playerMeta(data, selected)}</div>}
      <button className="btn primary big" disabled={!selected || busy} onClick={submit}>Submit turn</button>
    </div>
  );
}

const KINDS: { kind: ConnectionKind; label: string; icon: string; placeholder: string }[] = [
  { kind: "college", label: "College", icon: "🎓", placeholder: "Search colleges (e.g. USC, Ole Miss)…" },
  { kind: "number", label: "Jersey Number", icon: "#", placeholder: "Type a number 0–99…" },
  { kind: "team", label: "NFL Team", icon: "🏈", placeholder: "City, nickname, or abbreviation…" },
];

export function ConnectionPicker({ data, used, onSubmit, busy }: {
  data: Dataset; used: string[]; onSubmit: (kind: ConnectionKind, value: string) => void; busy: boolean;
}) {
  const [kind, setKind] = useState<ConnectionKind | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Option | null>(null);
  const rows = useMemo<Row<Option>[]>(() => {
    if (!kind) return [];
    const limit = kind === "number" && !query ? 100 : kind === "team" && !query ? 32 : 10;
    return searchOptions(data.options[kind], query, limit).map((o) => {
      const isUsed = used.includes(connKey(o.kind, o.value));
      return {
        key: o.value, item: o, disabled: isUsed,
        render: <><span className="row-main">{o.label}</span>{isUsed && <span className="used-tag">used</span>}</>,
      };
    });
  }, [data, kind, query, used]);

  const choose = (k: ConnectionKind) => { setKind(k); setQuery(""); setSelected(null); };
  const submit = () => {
    if (!selected) return;
    onSubmit(selected.kind, selected.value);
    setKind(null); setQuery(""); setSelected(null);
  };
  const meta = KINDS.find((k) => k.kind === kind);
  return (
    <div className="picker">
      <div className="kind-buttons">
        {KINDS.map((k) => (
          <button key={k.kind} className={`btn kind ${kind === k.kind ? "on" : ""}`} onClick={() => choose(k.kind)}>
            <span className="kind-icon">{k.icon}</span>{k.label}
          </button>
        ))}
      </div>
      {meta && (
        <Typeahead
          key={meta.kind}
          rows={rows} query={query} setQuery={setQuery} selected={selected?.value ?? null} autoFocus
          placeholder={meta.placeholder}
          onSelect={(r) => { setSelected(r?.item ?? null); if (r) setQuery(r.item.label); }}
        />
      )}
      <button className="btn primary big" disabled={!selected || busy} onClick={submit}>Submit turn</button>
    </div>
  );
}
