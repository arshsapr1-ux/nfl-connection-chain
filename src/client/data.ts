// Lazy-loads the compact dataset once (started early so it downloads while the user sets up).
import { useEffect, useState } from "react";
import { Dataset } from "../engine/dataset.ts";

let promise: Promise<Dataset> | null = null;
export function loadData(): Promise<Dataset> {
  promise ??= fetch("/data/game-data.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load player data (${r.status})`);
      return r.json();
    })
    .then((file) => new Dataset(file));
  return promise;
}

export function useData(): Dataset | null {
  const [data, setData] = useState<Dataset | null>(null);
  useEffect(() => {
    let live = true;
    loadData().then((d) => live && setData(d));
    return () => { live = false; };
  }, []);
  return data;
}

/** Re-render on an interval (for countdowns). */
export function useNow(ms = 250, offset = 0): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(id);
  }, [ms, offset]);
  return now;
}
