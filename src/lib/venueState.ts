import { getWaitTime } from "./timeline";
import { MATCH_DURATION } from "./crowdFlow";
import venueConfig from "../../venues/chinnaswamy.json";
import type { Station, StationWithWait } from "@/types/venue";

/**
 * Returns interpolated wait and 10-minute forecast times for every venue station
 * at the given elapsed match minute. Safe to call at any point in the match window.
 */
export function buildVenueState(elapsed: number): StationWithWait[] {
  return (venueConfig.stations as Station[]).map((s) => ({
    ...s,
    waitMinutes: Math.round(getWaitTime(s.id, elapsed) * 10) / 10,
    forecastMinutes: Math.round(getWaitTime(s.id, Math.min(MATCH_DURATION, elapsed + 10)) * 10) / 10,
  }));
}
