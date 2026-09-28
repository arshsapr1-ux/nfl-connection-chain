// 32-slice spinning wheel in team colors (names/abbreviations only, no logos).
import { useEffect, useState } from "react";
import type { Team } from "../engine/dataset.ts";

const SIZE = 320;
const R = SIZE / 2;

function slicePath(i: number, n: number): string {
  const a0 = ((i - 0.5) / n) * 2 * Math.PI;
  const a1 = ((i + 0.5) / n) * 2 * Math.PI;
  const p = (a: number) => `${R + R * Math.sin(a)} ${R - R * Math.cos(a)}`;
  return `M ${R} ${R} L ${p(a0)} A ${R} ${R} 0 0 1 ${p(a1)} Z`;
}

/** Spins to `result`, finishing at `spinUntil` (epoch ms, already clock-corrected). */
export function Wheel({ teams, result, spinUntil, now }: { teams: Team[]; result: string; spinUntil: number; now: number }) {
  const n = teams.length;
  const idx = Math.max(0, teams.findIndex((t) => t.id === result));
  const target = 360 * 6 - (idx * 360) / n;
  const [rotation, setRotation] = useState(0);
  const [duration] = useState(() => Math.max(0, spinUntil - now - 400));

  useEffect(() => {
    // start from 0, then animate to target on the next frame
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRotation(target)));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const team = teams[idx];
  const done = now >= spinUntil - 300;
  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" aria-hidden>▼</div>
      <svg
        className="wheel"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${duration}ms` }}
        role="img"
        aria-label="Team wheel"
      >
        {teams.map((t, i) => (
          <g key={t.id}>
            <path d={slicePath(i, n)} fill={t.colors.primary} stroke={t.colors.secondary} strokeWidth={1.5} />
            <text
              x={R}
              y={20}
              transform={`rotate(${(i * 360) / n} ${R} ${R})`}
              textAnchor="middle"
              fill={contrast(t.colors.primary)}
              fontSize={11}
              fontWeight={800}
            >
              {t.abbreviation}
            </text>
          </g>
        ))}
        <circle cx={R} cy={R} r={26} fill="var(--card)" stroke="var(--border)" strokeWidth={2} />
      </svg>
      <div className={`wheel-result ${done ? "show" : ""}`}>
        {done ? <>🏈 {team.city} {team.nickname}</> : "Spinning…"}
      </div>
    </div>
  );
}

function contrast(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return lum > 150 ? "#111" : "#fff";
}
