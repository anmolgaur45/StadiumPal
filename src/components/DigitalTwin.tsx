"use client";

import { useEffect, useRef, useState } from "react";
import { getWaitTime } from "@/lib/timeline";
import QueueTile from "./QueueTile";
import type { AppUser } from "@/lib/user";
import type { Station, StationWithWait } from "@/types/venue";
import venueData from "../../venues/chinnaswamy.json";

const MATCH_DURATION = 210; // minutes

// Heat colour interpolated through green → yellow → red
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

  // Innings 1: T=0–95, Innings break: T=95–115, Innings 2: T=115+
  if (elapsedMinutes <= 95) {
    const over = Math.floor(elapsedMinutes / 4.75);
    const ball = Math.floor((elapsedMinutes % 4.75) / (4.75 / 6));
    return `Inn 1 · Ov ${Math.min(over, 20)}.${ball}`;
  }
  if (elapsedMinutes <= 115) {
    return "Innings Break";
  }
  const inn2 = elapsedMinutes - 115;
  const over = Math.floor(inn2 / 4.75);
  const ball = Math.floor((inn2 % 4.75) / (4.75 / 6));
  return `Inn 2 · Ov ${Math.min(over, 20)}.${ball}`;
}

type Props = {
  user: AppUser;
};

export default function DigitalTwin({ user }: Props) {
  const [elapsed, setElapsed] = useState<number>(0);
  const [stations, setStations] = useState<StationWithWait[]>([]);
  const [activeStation, setActiveStation] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute current elapsed minutes from matchStartedAt
  function computeElapsed(): number {
    return Math.max(0, (Date.now() - user.matchStartedAt) / 60_000);
  }

  // Derive station wait data for a given elapsed time
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

    tick(); // immediate first render
    intervalRef.current = setInterval(tick, 60_000); // update every match-minute
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user.matchStartedAt]);

  const active = activeStation
    ? stations.find((s) => s.id === activeStation) ?? null
    : null;

  const seatX = 50;
  const seatY = 50;

  return (
    <div className="flex flex-col gap-6">
      {/* Match clock */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Live</p>
          <h2 className="text-lg font-semibold text-white">{formatClock(elapsed)}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Your seat</p>
          <p className="text-sm font-medium text-indigo-400">
            Sec {user.seat.section} · Row {user.seat.row} · {user.seat.number}
          </p>
        </div>
      </div>

      {/* SVG stadium schematic */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-gray-700 bg-gray-900"
        style={{ paddingBottom: "100%" }}
        role="img"
        aria-label="M. Chinnaswamy Stadium digital twin — live queue heat map"
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          {/* Outer boundary */}
          <ellipse cx="50" cy="50" rx="46" ry="46" fill="#111827" stroke="#374151" strokeWidth="0.5" />
          {/* Playing field */}
          <ellipse cx="50" cy="50" rx="22" ry="20" fill="#14532d" stroke="#166534" strokeWidth="0.4" />
          {/* Pitch */}
          <rect x="47.5" y="42" width="5" height="16" rx="0.5" fill="#a16207" opacity="0.7" />
          {/* Stands — four arcs represented as thick ring segments */}
          <ellipse cx="50" cy="50" rx="34" ry="34" fill="none" stroke="#1f2937" strokeWidth="10" />

          {/* Heat blobs per station */}
          {stations.map((s) => (
            <ellipse
              key={s.id}
              cx={s.position.x}
              cy={s.position.y}
              rx="7"
              ry="7"
              fill={heatColor(s.waitMinutes)}
              opacity={heatOpacity(s.waitMinutes)}
              style={{ transition: "fill 1s ease, opacity 1s ease" }}
            />
          ))}

          {/* Station markers */}
          {stations.map((s) => {
            const isSelected = activeStation === s.id;
            return (
              <g
                key={s.id}
                onClick={() => setActiveStation(isSelected ? null : s.id)}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${s.name}: ${Math.round(s.waitMinutes)} min wait`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveStation(isSelected ? null : s.id);
                  }
                }}
              >
                <circle
                  cx={s.position.x}
                  cy={s.position.y}
                  r={isSelected ? 3.2 : 2.4}
                  fill={heatColor(s.waitMinutes)}
                  stroke={isSelected ? "#fff" : "#111827"}
                  strokeWidth="0.6"
                  style={{ transition: "r 0.15s ease" }}
                />
              </g>
            );
          })}

          {/* User seat pin */}
          <g aria-label={`Your seat: Section ${user.seat.section}, Row ${user.seat.row}, Seat ${user.seat.number}`}>
            <circle cx={seatX} cy={seatY} r="2.5" fill="#6366f1" stroke="#fff" strokeWidth="0.8" />
            <circle cx={seatX} cy={seatY} r="4.5" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.5" />
          </g>
        </svg>
      </div>

      {/* Selected station detail */}
      {active && (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-4">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest">Selected</p>
          <p className="font-semibold text-white">{active.name}</p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-xs text-gray-500">Now</p>
              <p className={`text-xl font-bold tabular-nums`} style={{ color: heatColor(active.waitMinutes) }}>
                {active.waitMinutes < 1 ? "No wait" : `${Math.round(active.waitMinutes)} min`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">In 10 min</p>
              <p className={`text-xl font-bold tabular-nums`} style={{ color: heatColor(active.forecastMinutes) }}>
                {active.forecastMinutes < 1 ? "No wait" : `${Math.round(active.forecastMinutes)} min`}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Near sections: {active.sections.join(", ")}
          </p>
        </div>
      )}

      {/* Queue tiles strip — concessions only */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Concessions</p>
        <div
          className="flex gap-3 overflow-x-auto pb-1"
          role="list"
          aria-label="Concession stand queue times"
        >
          {stations
            .filter((s) => s.category === "concession")
            .sort((a, b) => a.waitMinutes - b.waitMinutes)
            .map((s) => (
              <QueueTile key={s.id} station={s} />
            ))}
        </div>
      </div>

      {/* Restrooms strip */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Restrooms</p>
        <div
          className="flex gap-3 overflow-x-auto pb-1"
          role="list"
          aria-label="Restroom queue times"
        >
          {stations
            .filter((s) => s.category === "restroom")
            .sort((a, b) => a.waitMinutes - b.waitMinutes)
            .map((s) => (
              <QueueTile key={s.id} station={s} />
            ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500" aria-label="Wait time colour legend">
        {[
          { color: "#22c55e", label: "≤5 min" },
          { color: "#eab308", label: "6–10 min" },
          { color: "#f97316", label: "11–18 min" },
          { color: "#ef4444", label: "19+ min" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
