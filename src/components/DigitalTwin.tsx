"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWaitTime } from "@/lib/timeline";
import { MATCH_DURATION } from "@/lib/crowdFlow";
import QueueTile from "./QueueTile";
import type { AppUser } from "@/lib/user";
import type { Station, StationWithWait } from "@/types/venue";
import venueData from "../../venues/chinnaswamy.json";

function heatColor(waitMinutes: number): string {
  if (waitMinutes <= 5) return "#22c55e";   // green-500
  if (waitMinutes <= 10) return "#eab308";  // yellow-500
  if (waitMinutes <= 18) return "#f97316";  // orange-500
  return "#ef4444";                          // red-500
}

function heatOpacity(waitMinutes: number): number {
  return Math.min(0.85, 0.25 + (waitMinutes / 30) * 0.6);
}

function formatClock(elapsedMinutes: number): string {
  if (elapsedMinutes < 0) return "Pre-match";
  if (elapsedMinutes > MATCH_DURATION) return "Post-match";

  if (elapsedMinutes <= 95) {
    const over = Math.floor(elapsedMinutes / 4.75);
    const ball = Math.floor((elapsedMinutes % 4.75) / (4.75 / 6));
    return `Inn 1 · Ov ${Math.min(over, 20)}.${ball}`;
  }
  if (elapsedMinutes <= 115) return "Innings Break";
  const inn2 = elapsedMinutes - 115;
  const over = Math.floor(inn2 / 4.75);
  const ball = Math.floor((inn2 % 4.75) / (4.75 / 6));
  return `Inn 2 · Ov ${Math.min(over, 20)}.${ball}`;
}

function waitLabel(minutes: number): string {
  return minutes < 1 ? "no wait" : `${Math.round(minutes)} min wait`;
}

const CATEGORY_LETTER: Record<string, string> = {
  gate: "G",
  concession: "F",
  restroom: "R",
};

type Props = { user: AppUser };

export default function DigitalTwin({ user }: Props) {
  const [elapsed, setElapsed] = useState<number>(0);
  const [stations, setStations] = useState<StationWithWait[]>([]);
  const [activeStation, setActiveStation] = useState<string | null>(null);
  const [focusedStation, setFocusedStation] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  function computeElapsed(): number {
    return Math.max(0, (Date.now() - user.matchStartedAt) / 60_000);
  }

  function buildStations(t: number): StationWithWait[] {
    return (venueData.stations as Station[]).map((s) => ({
      ...s,
      waitMinutes: getWaitTime(s.id, t),
      forecastMinutes: getWaitTime(s.id, t + 10),
    }));
  }

  useEffect(() => {
    const tick = () => {
      const t = computeElapsed();
      setElapsed(t);
      setStations(buildStations(t));
    };
    tick();
    intervalRef.current = setInterval(tick, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [user.matchStartedAt]);

  const selectStation = useCallback((id: string) => {
    setActiveStation((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      }
      return next;
    });
  }, []);

  const active = activeStation ? stations.find((s) => s.id === activeStation) ?? null : null;

  const concessionStations = useMemo(
    () => stations.filter((s) => s.category === "concession").sort((a, b) => a.waitMinutes - b.waitMinutes),
    [stations]
  );
  const restroomStations = useMemo(
    () => stations.filter((s) => s.category === "restroom").sort((a, b) => a.waitMinutes - b.waitMinutes),
    [stations]
  );

  const seatX = 50;
  const seatY = 50;

  return (
    <div className="flex flex-col gap-6">
      {/* Match clock */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest" aria-hidden="true">Live</p>
          <h2 className="text-lg font-semibold text-white" aria-live="polite" aria-label={`Match clock: ${formatClock(elapsed)}`}>
            {formatClock(elapsed)}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500" aria-hidden="true">Your seat</p>
          <p className="text-sm font-medium text-indigo-400" aria-label={`Your seat: Section ${user.seat.section}, Row ${user.seat.row}, Seat ${user.seat.number}`}>
            Sec {user.seat.section} · Row {user.seat.row} · {user.seat.number}
          </p>
        </div>
      </div>

      {/* SVG stadium schematic
          The SVG is NOT aria-hidden — station markers are real interactive buttons.
          A <title> provides the overall schematic description for screen readers. */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-gray-700 bg-gray-900"
        style={{ paddingBottom: "100%" }}
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label="M. Chinnaswamy Stadium — interactive queue heat map. Use Tab to navigate stations."
        >
          <title>M. Chinnaswamy Stadium digital twin — live queue heat map</title>

          {/* Background */}
          <ellipse cx="50" cy="50" rx="46" ry="46" fill="#111827" stroke="#374151" strokeWidth="0.5" aria-hidden="true" />
          <ellipse cx="50" cy="50" rx="22" ry="20" fill="#14532d" stroke="#166534" strokeWidth="0.4" aria-hidden="true" />
          <rect x="47.5" y="42" width="5" height="16" rx="0.5" fill="#a16207" opacity="0.7" aria-hidden="true" />
          <ellipse cx="50" cy="50" rx="34" ry="34" fill="none" stroke="#1f2937" strokeWidth="10" aria-hidden="true" />

          {/* Heat blobs — decorative, screen readers don't need these */}
          {stations.map((s) => (
            <ellipse
              key={`heat-${s.id}`}
              cx={s.position.x}
              cy={s.position.y}
              rx="7"
              ry="7"
              fill={heatColor(s.waitMinutes)}
              opacity={heatOpacity(s.waitMinutes)}
              aria-hidden="true"
              style={{ transition: "fill 1s ease, opacity 1s ease" }}
            />
          ))}

          {/* Station markers — interactive buttons */}
          {stations.map((s) => {
            const isSelected = activeStation === s.id;
            const isFocused = focusedStation === s.id;
            return (
              <g
                key={s.id}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${s.name}: ${waitLabel(s.waitMinutes)} now, ${waitLabel(s.forecastMinutes)} in 10 minutes`}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => selectStation(s.id)}
                onFocus={() => setFocusedStation(s.id)}
                onBlur={() => setFocusedStation(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectStation(s.id);
                  }
                }}
              >
                {/* Focus ring */}
                {isFocused && (
                  <circle
                    cx={s.position.x}
                    cy={s.position.y}
                    r="5.5"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1"
                    aria-hidden="true"
                  />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={s.position.x}
                    cy={s.position.y}
                    r="4.2"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="0.8"
                    aria-hidden="true"
                  />
                )}
                <circle
                  cx={s.position.x}
                  cy={s.position.y}
                  r={isSelected ? 4.2 : 3.5}
                  fill={heatColor(s.waitMinutes)}
                  stroke={isSelected ? "#fff" : "#111827"}
                  strokeWidth="0.6"
                  aria-hidden="true"
                  style={{ transition: "r 0.15s ease" }}
                />
                <text
                  x={s.position.x}
                  y={s.position.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="2.8"
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                  fill="#fff"
                  aria-hidden="true"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {CATEGORY_LETTER[s.category]}
                </text>
              </g>
            );
          })}

          {/* User seat pin */}
          <g aria-label={`Your seat: Section ${user.seat.section}, Row ${user.seat.row}, Seat ${user.seat.number}`}>
            <circle cx={seatX} cy={seatY} r="2.5" fill="#6366f1" stroke="#fff" strokeWidth="0.8" aria-hidden="true" />
            <circle cx={seatX} cy={seatY} r="4.5" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.5" aria-hidden="true" />
          </g>
        </svg>
      </div>

      {/* Selected station detail */}
      <div
        ref={detailRef}
        aria-live="polite"
        aria-atomic="true"
        aria-label={active ? `Selected: ${active.name}` : undefined}
      >
        {active && (
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-4">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest" aria-hidden="true">Selected</p>
            <p className="font-semibold text-white">{active.name}</p>
            <div className="flex gap-6 mt-2">
              <div>
                <p className="text-xs text-gray-500" id="label-now">Now</p>
                <p
                  className="text-xl font-bold tabular-nums"
                  style={{ color: heatColor(active.waitMinutes) }}
                  aria-labelledby="label-now"
                >
                  {active.waitMinutes < 1 ? "No wait" : `${Math.round(active.waitMinutes)} min`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500" id="label-forecast">In 10 min</p>
                <p
                  className="text-xl font-bold tabular-nums"
                  style={{ color: heatColor(active.forecastMinutes) }}
                  aria-labelledby="label-forecast"
                >
                  {active.forecastMinutes < 1 ? "No wait" : `${Math.round(active.forecastMinutes)} min`}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">Near sections: {active.sections.join(", ")}</p>
          </div>
        )}
      </div>

      {/* Concessions */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2" aria-hidden="true">Concessions</p>
        <div role="list" aria-label="Concession stand queue times" className="flex gap-3 overflow-x-auto pb-1">
          {concessionStations.map((s) => <QueueTile key={s.id} station={s} />)}
        </div>
      </div>

      {/* Restrooms */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2" aria-hidden="true">Restrooms</p>
        <div role="list" aria-label="Restroom queue times" className="flex gap-3 overflow-x-auto pb-1">
          {restroomStations.map((s) => <QueueTile key={s.id} station={s} />)}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500" aria-label="Map legend">
        <div className="flex gap-3" role="list" aria-label="Wait time colours">
          {[
            { color: "#22c55e", label: "≤5 min" },
            { color: "#eab308", label: "6–10 min" },
            { color: "#f97316", label: "11–18 min" },
            { color: "#ef4444", label: "19+ min" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1" role="listitem">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-gray-600" role="list" aria-label="Marker types">
          {[
            { letter: "G", label: "Gate" },
            { letter: "F", label: "Food" },
            { letter: "R", label: "Restroom" },
          ].map(({ letter, label }) => (
            <div key={letter} className="flex items-center gap-1" role="listitem">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-600 text-white font-bold text-[9px]" aria-hidden="true">
                {letter}
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
