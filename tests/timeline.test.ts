import { describe, it, expect } from "vitest";
import { getWaitTime } from "../src/lib/timeline";
import timelineData from "../venues/timeline.json";

type TimelineData = Record<string, number[]>;
const data = timelineData as TimelineData;

// Use gate-north as the reference station for generic boundary tests
const REF = "gate-north";
const CURVE = data[REF];

const MATCH_DURATION = 210; // T20 IPL match: first ball → result + exit

describe("getWaitTime", () => {
  it("returns the exact T=0 value at elapsedMinutes=0", () => {
    expect(getWaitTime(REF, 0)).toBeCloseTo(CURVE[0], 5);
  });

  it("returns the exact T=210 value at elapsedMinutes=210", () => {
    expect(getWaitTime(REF, MATCH_DURATION)).toBeCloseTo(CURVE[MATCH_DURATION], 5);
  });

  it("clamps elapsedMinutes below 0 to T=0", () => {
    expect(getWaitTime(REF, -10)).toBeCloseTo(CURVE[0], 5);
  });

  it("clamps elapsedMinutes above 210 to T=210", () => {
    expect(getWaitTime(REF, 300)).toBeCloseTo(CURVE[MATCH_DURATION], 5);
  });

  it("linearly interpolates at the midpoint between two integer minutes", () => {
    const lo = 100;
    const hi = 101;
    const expected = (CURVE[lo] + CURVE[hi]) / 2;
    expect(getWaitTime(REF, 100.5)).toBeCloseTo(expected, 5);
  });

  it("interpolates correctly at a non-half-minute fraction", () => {
    const t = 60.3;
    const lo = Math.floor(t);
    const hi = lo + 1;
    const frac = t - lo;
    const expected = CURVE[lo] * (1 - frac) + CURVE[hi] * frac;
    expect(getWaitTime(REF, 60.3)).toBeCloseTo(expected, 5);
  });

  it("returns 0 for an unknown station id", () => {
    expect(getWaitTime("station-xyz-unknown", 100)).toBe(0);
  });

  it("returns 0 for an empty string station id", () => {
    expect(getWaitTime("", 50)).toBe(0);
  });

  it("pavilion café peaks above 20 min during innings break (T=105)", () => {
    // food-south-pavilion has scale 1.3 — busiest concession at break
    const peak = getWaitTime("food-south-pavilion", 105);
    expect(peak).toBeGreaterThan(20);
  });

  it("north gate has significant entry rush wait at match start (T=0)", () => {
    // gate-north scale 1.2 — gates are busy before first ball
    const wait = getWaitTime("gate-north", 0);
    expect(wait).toBeGreaterThan(12);
  });

  it("north gate wait drops sharply once the crowd is settled (T=30)", () => {
    const atStart = getWaitTime("gate-north", 0);
    const settled = getWaitTime("gate-north", 30);
    expect(settled).toBeLessThan(atStart / 2);
  });

  it("restroom wait at innings break is much higher than mid-innings (T=130)", () => {
    const breakPeak = getWaitTime("restroom-north", 105);
    const steady = getWaitTime("restroom-north", 130);
    expect(breakPeak).toBeGreaterThan(steady * 3);
  });

  it("all 15 stations return positive values during innings break (T=105)", () => {
    const stationIds = Object.keys(data);
    expect(stationIds).toHaveLength(15);
    for (const id of stationIds) {
      expect(getWaitTime(id, 105)).toBeGreaterThan(0);
    }
  });

  it("each station curve has 211 data points (T=0 through T=210)", () => {
    for (const [id, curve] of Object.entries(data)) {
      expect(curve).toHaveLength(211);
      expect(typeof id).toBe("string");
    }
  });
});
