// Run with: npx tsx scripts/generate-timeline.ts
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Keyframe = [number, number]; // [elapsedMinutes, waitMinutes]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Linear interpolation over a list of [T, wait] keyframes
function sampleCurve(keyframes: Keyframe[], t: number): number {
  if (t <= keyframes[0][0]) return keyframes[0][1];
  const last = keyframes[keyframes.length - 1];
  if (t >= last[0]) return last[1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const [t0, v0] = keyframes[i];
    const [t1, v1] = keyframes[i + 1];
    if (t >= t0 && t <= t1) {
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return last[1];
}

// IPL T20 match timeline (all times in minutes from first ball):
//
//   T=0       First ball, Innings 1 begins
//   T=0–90    Innings 1 (20 overs, ~4.5 min/over with TV timeouts)
//   T=90–95   Last few overs of Innings 1, crowd watching
//   T=95–115  Innings break (20 min) — peak concession & restroom rush
//   T=115     Innings 2 begins
//   T=115–200 Innings 2
//   T=195–210 Final overs + result + exit rush
//
// NOTE: these timings are assumptions used for development and testing purposes.
// Real IPL match durations vary significantly — a 20-over innings can run
// 75–110+ minutes depending on bowling pace, DRS reviews, strategic timeouts,
// and rain delays. In production, this curve data would come from live POS
// systems, gate scanners, and queue-detection cameras.
//
// Base wait-time curves per category:
const CATEGORY_CURVES: Record<string, Keyframe[]> = {
  gate: [
    // Entry rush at match start, settled by T=25; exit surge at end
    [0, 18], [10, 11], [25, 3], [90, 3],
    [95, 5], [115, 3], [185, 4], [198, 10], [210, 20],
  ],
  concession: [
    // Moderate activity during innings 1, massive spike at break,
    // another surge in death overs innings 2
    [0, 4], [15, 6], [40, 9], [80, 12],
    [90, 9], [100, 22], [112, 18], [120, 10],
    [130, 8], [155, 9], [175, 13], [195, 8], [210, 5],
  ],
  restroom: [
    // Quiet during play, sharp spike at innings break, quick clear
    [0, 2], [40, 3], [85, 6], [95, 10],
    [100, 28], [112, 24], [120, 7], [130, 4],
    [160, 5], [185, 7], [210, 11],
  ],
};

// Per-station scale factors introduce realistic variation within each category
const STATION_SCALES: Record<string, number> = {
  "gate-north": 1.2,
  "gate-south": 0.9,
  "gate-east": 1.1,
  "gate-west": 0.8,
  "food-north-a": 1.1,
  "food-north-b": 0.9,
  "food-south-pavilion": 1.3,
  "food-south-kiosk": 1.0,
  "food-east-beverages": 1.1,
  "food-east-snacks": 0.85,
  "food-west-counter": 0.9,
  "food-corner-ne": 0.75,
  "restroom-north": 1.2,
  "restroom-south": 1.1,
  "restroom-east": 0.9,
};

interface Station {
  id: string;
  category: string;
}

interface Venue {
  stations: Station[];
}

const MATCH_DURATION = 210; // minutes, T20 IPL match (first ball → result + exit)

const venuePath = resolve(__dirname, "../venues/chinnaswamy.json");
const venue: Venue = JSON.parse(readFileSync(venuePath, "utf-8"));

const timeline: Record<string, number[]> = {};

for (const station of venue.stations) {
  const keyframes = CATEGORY_CURVES[station.category];
  if (!keyframes) {
    console.warn(`Unknown category "${station.category}" for station "${station.id}" — skipping`);
    continue;
  }

  const scale = STATION_SCALES[station.id] ?? 1.0;

  // Sample at every integer minute T=0..MATCH_DURATION (MATCH_DURATION+1 values)
  timeline[station.id] = Array.from({ length: MATCH_DURATION + 1 }, (_, t) => {
    const raw = sampleCurve(keyframes, t) * scale;
    return Math.round(raw * 10) / 10; // one decimal place
  });
}

const outputPath = resolve(__dirname, "../venues/timeline.json");
writeFileSync(outputPath, JSON.stringify(timeline, null, 2) + "\n");

console.log(
  `Generated ${MATCH_DURATION}-minute T20 timeline for ${Object.keys(timeline).length} stations → venues/timeline.json`
);
