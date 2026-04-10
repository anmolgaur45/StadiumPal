"use client";

import type { StationWithWait } from "@/types/venue";

const CATEGORY_ICON: Record<string, string> = {
  concession: "🍽",
  restroom: "🚻",
  gate: "🚪",
};

function waitColor(minutes: number): string {
  if (minutes <= 5) return "text-green-400";
  if (minutes <= 12) return "text-yellow-400";
  return "text-red-400";
}

function waitLabel(minutes: number): string {
  if (minutes < 1) return "No wait";
  return `${Math.round(minutes)} min`;
}

type Props = {
  station: StationWithWait;
};

export default function QueueTile({ station }: Props) {
  const currentColor = waitColor(station.waitMinutes);
  const forecastColor = waitColor(station.forecastMinutes);
  const icon = CATEGORY_ICON[station.category] ?? "📍";

  return (
    <div
      className="rounded-xl bg-gray-800 border border-gray-700 p-3 flex flex-col gap-1 min-w-[130px]"
      role="listitem"
      aria-label={`${station.name}: ${waitLabel(station.waitMinutes)} wait`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true">{icon}</span>
        <span className="text-xs font-medium text-gray-300 truncate leading-tight">
          {station.name}
        </span>
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none ${currentColor}`}>
        {waitLabel(station.waitMinutes)}
      </div>
      <div className="text-[10px] text-gray-500 leading-tight">
        In 10 min:{" "}
        <span className={forecastColor}>{waitLabel(station.forecastMinutes)}</span>
      </div>
    </div>
  );
}
