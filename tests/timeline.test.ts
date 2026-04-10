import { describe, it, expect } from "vitest";
import { getWaitTime } from "../src/lib/timeline";
import timelineData from "../venues/timeline.json";

type TimelineData = Record<string, number[]>;
const data = timelineData as TimelineData;

// Use gate-north as the reference station for generic boundary tests
const REF = "gate-north";
const CURVE = data[REF];

describe("getWaitTime", () => {
  it("returns the exact T=0 value at elapsedMinutes=0", () => {
    expect(getWaitTime(REF, 0)).toBeCloseTo(CURVE[0], 5);
  });

  it("returns the exact T=90 value at elapsedMinutes=90", () => {
    expect(getWaitTime(REF, 90)).toBeCloseTo(CURVE[90], 5);
  });

  it("clamps elapsedMinutes below 0 to T=0", () => {
    expect(getWaitTime(REF, -10)).toBeCloseTo(CURVE[0], 5);
  });

  it("clamps elapsedMinutes above 90 to T=90", () => {
    expect(getWaitTime(REF, 120)).toBeCloseTo(CURVE[90], 5);
  });

  it("linearly interpolates at the midpoint between two integer minutes", () => {
    const lo = 42;
    const hi = 43;
    const expected = (CURVE[lo] + CURVE[hi]) / 2;
    expect(getWaitTime(REF, 42.5)).toBeCloseTo(expected, 5);
  });

  it("interpolates correctly at a non-half-minute fraction", () => {
    const t = 30.3;
    const lo = Math.floor(t);
    const hi = lo + 1;
    const frac = t - lo;
    const expected = CURVE[lo] * (1 - frac) + CURVE[hi] * frac;
    expect(getWaitTime(REF, 30.3)).toBeCloseTo(expected, 5);
  });

  it("returns 0 for an unknown station id", () => {
    expect(getWaitTime("station-xyz-unknown", 45)).toBe(0);
  });

  it("returns 0 for an empty string station id", () => {
    expect(getWaitTime("", 20)).toBe(0);
  });

  it("pavilion café peaks above 15 min at innings break (T=43)", () => {
    // food-south-pavilion has scale 1.3 — should be the highest-wait concession
    const peak = getWaitTime("food-south-pavilion", 43);
    expect(peak).toBeGreaterThan(15);
  });

  it("north gate has significant wait at match start (T=0)", () => {
    // gate-north scale 1.2 — entry rush at T=0
    const wait = getWaitTime("gate-north", 0);
    expect(wait).toBeGreaterThan(10);
  });

  it("north gate wait drops sharply after entry rush clears (T=15)", () => {
    const atStart = getWaitTime("gate-north", 0);
    const settled = getWaitTime("gate-north", 15);
    expect(settled).toBeLessThan(atStart / 2);
  });

  it("restroom peaks are much higher than steady-state wait", () => {
    const peak = getWaitTime("restroom-north", 43);
    const steady = getWaitTime("restroom-north", 60);
    expect(peak).toBeGreaterThan(steady * 2);
  });

  it("all 15 stations return positive values at T=43 (innings break)", () => {
    const stationIds = Object.keys(data);
    expect(stationIds).toHaveLength(15);
    for (const id of stationIds) {
      expect(getWaitTime(id, 43)).toBeGreaterThan(0);
    }
  });

  it("each station curve has 91 data points (T=0 through T=90)", () => {
    for (const [id, curve] of Object.entries(data)) {
      expect(curve).toHaveLength(91);
      // Sanity-check the array label for debugging
      expect(typeof id).toBe("string");
    }
  });
});
