import { describe, it, expect } from "vitest";
import { buildExitPlan } from "@/lib/exitPlan";
import { FLOW_LENGTH, FLOW_START } from "@/lib/crowdFlow";
import type { GateStation, SectionGateEntry, FlowMatrix } from "@/types/venue";

// Minimal gate fixtures
const GATE_NORTH: GateStation = {
  id: "gate-north",
  name: "North Gate",
  category: "gate",
  position: { x: 50, y: 5 },
  sections: ["101", "102"],
  throughputPerMinute: 100,
  neighbors: ["gate-east", "gate-west"],
};

const GATE_EAST: GateStation = {
  id: "gate-east",
  name: "East Gate",
  category: "gate",
  position: { x: 93, y: 50 },
  sections: ["109"],
  throughputPerMinute: 100,
  neighbors: ["gate-north", "gate-south"],
};

const GATE_SOUTH: GateStation = {
  id: "gate-south",
  name: "South Gate",
  category: "gate",
  position: { x: 50, y: 93 },
  sections: ["115"],
  throughputPerMinute: 100,
  neighbors: ["gate-east", "gate-west"],
};

const GATE_WEST: GateStation = {
  id: "gate-west",
  name: "West Gate",
  category: "gate",
  position: { x: 7, y: 50 },
  sections: ["123"],
  throughputPerMinute: 100,
  neighbors: ["gate-north", "gate-south"],
};

const ALL_GATES = [GATE_NORTH, GATE_EAST, GATE_SOUTH, GATE_WEST];

const SECTION_MAP: SectionGateEntry[] = [
  { section: "114", gate: "gate-east", walkMinutes: 4 },
  { section: "101", gate: "gate-north", walkMinutes: 3 },
];

/** Builds an empty (all-zero) natural matrix */
function emptyMatrix(): FlowMatrix {
  const m: FlowMatrix = {};
  for (const g of ALL_GATES) m[g.id] = new Array(FLOW_LENGTH).fill(0);
  return m;
}

describe("buildExitPlan", () => {
  it("urgency is 'none' before T=170", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 169,
    });
    expect(result.urgency).toBe("none");
  });

  it("urgency is 'low' at T=170", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 170,
    });
    expect(result.urgency).toBe("low");
  });

  it("urgency is 'low' at T=182", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 182,
    });
    expect(result.urgency).toBe("low");
  });

  it("urgency is 'medium' at T=183", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 183,
    });
    expect(result.urgency).toBe("medium");
  });

  it("urgency is 'high' at T=195", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 195,
    });
    expect(result.urgency).toBe("high");
  });

  it("throughput invariant holds when a single gate overflows with neighbor capacity available", () => {
    // North gate gets 200/min at T=190 (index 15), but cap is 100.
    // East and West are empty — they can absorb the 100 overflow within 5 minutes.
    const natural = emptyMatrix();
    const overflowIdx = 190 - FLOW_START; // index 15
    natural["gate-north"][overflowIdx] = 200;

    const result = buildExitPlan({
      userSection: "101",
      naturalMatrix: natural,
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 185,
    });

    const choreo = result.choreographedMatrix;
    // After choreography, gate-north at this index must be ≤ throughput
    expect(choreo["gate-north"][overflowIdx]).toBeLessThanOrEqual(GATE_NORTH.throughputPerMinute);

    // The 100 overflow must appear somewhere in neighbors within 5 minutes
    let neighborAbsorbed = 0;
    for (let delay = 0; delay <= 5; delay++) {
      const idx = overflowIdx + delay;
      if (idx < FLOW_LENGTH) {
        neighborAbsorbed += choreo["gate-east"][idx] + choreo["gate-west"][idx];
      }
    }
    expect(neighborAbsorbed).toBe(100);
  });

  it("overflow is NOT placed at delay > 5 minutes beyond the overloaded minute", () => {
    const natural = emptyMatrix();
    const overflowIdx = 175 - FLOW_START; // T=175, index 0
    // Fill all neighbor slots for delay 0..5, leaving only delay=6 free
    for (const g of [GATE_EAST, GATE_WEST]) {
      for (let d = 0; d <= 5; d++) {
        if (overflowIdx + d < FLOW_LENGTH) {
          natural[g.id][overflowIdx + d] = g.throughputPerMinute; // fully saturate neighbors
        }
      }
    }
    natural["gate-north"][overflowIdx] = GATE_NORTH.throughputPerMinute + 50;

    const result = buildExitPlan({
      userSection: "101",
      naturalMatrix: natural,
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 175,
    });

    // Overflow of 50 that couldn't be absorbed stays at gate-north (best-effort)
    // Verify nothing was placed at delay=6 or beyond for neighbors
    const delay6Idx = overflowIdx + 6;
    if (delay6Idx < FLOW_LENGTH) {
      expect(result.choreographedMatrix["gate-east"][delay6Idx]).toBe(
        natural["gate-east"][delay6Idx]
      );
      expect(result.choreographedMatrix["gate-west"][delay6Idx]).toBe(
        natural["gate-west"][delay6Idx]
      );
    }
  });

  it("returns both naturalMatrix and choreographedMatrix", () => {
    const natural = emptyMatrix();
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: natural,
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 190,
    });
    expect(result.naturalMatrix).toBeDefined();
    expect(result.choreographedMatrix).toBeDefined();
    expect(Object.keys(result.choreographedMatrix)).toContain("gate-north");
  });

  it("user assignment maps to the correct gate from sectionGateMap", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 185,
    });
    expect(result.userAssignment.gate.id).toBe("gate-east");
    expect(result.userAssignment.walkMinutes).toBe(4);
  });

  it("leaveAtElapsed is at least the current elapsed minute", () => {
    const result = buildExitPlan({
      userSection: "114",
      naturalMatrix: emptyMatrix(),
      gates: ALL_GATES,
      sectionGateMap: SECTION_MAP,
      elapsedMinutes: 192,
    });
    expect(result.userAssignment.leaveAtElapsed).toBeGreaterThanOrEqual(192);
  });
});
