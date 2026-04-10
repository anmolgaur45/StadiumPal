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

// Base wait-time curves per station category (IPL match, 90-minute window)
// Shape: gate peaks at entry/exit, concessions peak at innings break (T≈43),
// restrooms spike even harder at break then quickly clear.
const CATEGORY_CURVES: Record<string, Keyframe[]> = {
  gate: [
    [0, 14], [5, 9], [12, 3], [40, 3],
    [42, 6], [46, 3], [82, 3], [86, 9], [90, 16],
  ],
  concession: [
    [0, 3], [10, 5], [20, 7], [35, 10],
    [41, 8], [43, 20], [47, 12], [52, 9],
    [65, 9], [72, 12], [78, 11], [86, 6], [90, 4],
  ],
  restroom: [
    [0, 1], [15, 2], [38, 4], [41, 8],
    [43, 24], [47, 14], [52, 5], [65, 5],
    [72, 7], [78, 6], [88, 4], [90, 8],
  ],
};

// Per-station scale factors introduce realistic variation between
// stations sharing the same category curve.
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

  // Sample at every integer minute T=0..90 (91 values)
  timeline[station.id] = Array.from({ length: 91 }, (_, t) => {
    const raw = sampleCurve(keyframes, t) * scale;
    return Math.round(raw * 10) / 10; // one decimal place
  });
}

const outputPath = resolve(__dirname, "../venues/timeline.json");
writeFileSync(outputPath, JSON.stringify(timeline, null, 2) + "\n");

console.log(
  `Generated wait-time timeline for ${Object.keys(timeline).length} stations → venues/timeline.json`
);
