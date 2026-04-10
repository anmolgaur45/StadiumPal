import timelineData from "../../venues/timeline.json";

type TimelineData = Record<string, number[]>;
const data = timelineData as TimelineData;

// Full T20 IPL match window: first ball through result + exit rush
const MATCH_DURATION = 210; // minutes

/**
 * Returns the interpolated wait time (in minutes) for a given station
 * at a given elapsed match-minute (0–210).
 *
 * Inputs outside [0, MATCH_DURATION] are clamped. Unknown station ids return 0.
 */
export function getWaitTime(stationId: string, elapsedMinutes: number): number {
  const curve = data[stationId];
  if (!curve || curve.length < 2) return 0;

  const t = Math.max(0, Math.min(MATCH_DURATION, elapsedMinutes));
  const lo = Math.floor(t);
  const hi = Math.min(MATCH_DURATION, lo + 1);
  const frac = t - lo;

  return curve[lo] * (1 - frac) + curve[hi] * frac;
}
