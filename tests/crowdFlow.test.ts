import { describe, it, expect } from "vitest";
import { buildNaturalMatrix, FLOW_LENGTH, FLOW_START, FLOW_END } from "@/lib/crowdFlow";
import type { SectionConfig, SectionGateEntry } from "@/types/venue";

const GATE_IDS = ["gate-north", "gate-south", "gate-east", "gate-west"];

const SIMPLE_SECTIONS: SectionConfig[] = [
  {
    id: "101",
    capacity: 1000,
    exitProfile: { early: 0.20, immediate: 0.60, late: 0.20 },
    position: { x: 50, y: 14 },
  },
  {
    id: "115",
    capacity: 500,
    exitProfile: { early: 0.10, immediate: 0.50, late: 0.40 },
    position: { x: 50, y: 87 },
  },
];

const SIMPLE_MAP: SectionGateEntry[] = [
  { section: "101", gate: "gate-north", walkMinutes: 4 },
  { section: "115", gate: "gate-south", walkMinutes: 3 },
];

describe("buildNaturalMatrix", () => {
  it("produces an array of FLOW_LENGTH per gate", () => {
    const m = buildNaturalMatrix({ sections: SIMPLE_SECTIONS, sectionGateMap: SIMPLE_MAP, gateIds: GATE_IDS });
    for (const gateId of GATE_IDS) {
      expect(m[gateId]).toHaveLength(FLOW_LENGTH);
      expect(FLOW_LENGTH).toBe(46); // T=175..220 inclusive
    }
  });

  it("population invariant: sum of all matrix cells equals sum of section capacities", () => {
    const m = buildNaturalMatrix({ sections: SIMPLE_SECTIONS, sectionGateMap: SIMPLE_MAP, gateIds: GATE_IDS });
    const matrixTotal = GATE_IDS.reduce((acc, id) => acc + m[id].reduce((s, v) => s + v, 0), 0);
    const sectionTotal = SIMPLE_SECTIONS.reduce((acc, s) => acc + s.capacity, 0);
    expect(matrixTotal).toBe(sectionTotal);
  });

  it("early fans land only in T=175–187 slots", () => {
    const sections: SectionConfig[] = [
      {
        id: "101",
        capacity: 1300,
        exitProfile: { early: 1.0, immediate: 0.0, late: 0.0 },
        position: { x: 50, y: 14 },
      },
    ];
    const map: SectionGateEntry[] = [{ section: "101", gate: "gate-north", walkMinutes: 4 }];
    const m = buildNaturalMatrix({ sections, sectionGateMap: map, gateIds: GATE_IDS });

    // Slots 0–12 = T=175–187, slots 13–45 = T=188–220
    const earlySlots = m["gate-north"].slice(0, 13); // indices 0..12
    const afterSlots = m["gate-north"].slice(13);
    expect(earlySlots.reduce((s, v) => s + v, 0)).toBe(1300);
    expect(afterSlots.every((v) => v === 0)).toBe(true);
  });

  it("immediate fans land only in T=188–200 slots", () => {
    const sections: SectionConfig[] = [
      {
        id: "101",
        capacity: 1300,
        exitProfile: { early: 0.0, immediate: 1.0, late: 0.0 },
        position: { x: 50, y: 14 },
      },
    ];
    const map: SectionGateEntry[] = [{ section: "101", gate: "gate-north", walkMinutes: 4 }];
    const m = buildNaturalMatrix({ sections, sectionGateMap: map, gateIds: GATE_IDS });

    // T=188 → index 13, T=200 → index 25
    const immediateSlots = m["gate-north"].slice(13, 26); // indices 13..25
    const beforeSlots = m["gate-north"].slice(0, 13);
    const afterSlots = m["gate-north"].slice(26);
    expect(immediateSlots.reduce((s, v) => s + v, 0)).toBe(1300);
    expect(beforeSlots.every((v) => v === 0)).toBe(true);
    expect(afterSlots.every((v) => v === 0)).toBe(true);
  });

  it("late fans land only in T=201–220 slots", () => {
    const sections: SectionConfig[] = [
      {
        id: "101",
        capacity: 2000,
        exitProfile: { early: 0.0, immediate: 0.0, late: 1.0 },
        position: { x: 50, y: 14 },
      },
    ];
    const map: SectionGateEntry[] = [{ section: "101", gate: "gate-north", walkMinutes: 4 }];
    const m = buildNaturalMatrix({ sections, sectionGateMap: map, gateIds: GATE_IDS });

    // T=201 → index 26, T=220 → index 45
    const lateSlots = m["gate-north"].slice(26);
    const beforeSlots = m["gate-north"].slice(0, 26);
    expect(lateSlots.reduce((s, v) => s + v, 0)).toBe(2000);
    expect(beforeSlots.every((v) => v === 0)).toBe(true);
  });

  it("section not in sectionGateMap is skipped without error", () => {
    const sections: SectionConfig[] = [
      {
        id: "999",
        capacity: 500,
        exitProfile: { early: 0.20, immediate: 0.60, late: 0.20 },
        position: { x: 50, y: 50 },
      },
    ];
    const m = buildNaturalMatrix({ sections, sectionGateMap: [], gateIds: GATE_IDS });
    const total = GATE_IDS.reduce((acc, id) => acc + m[id].reduce((s, v) => s + v, 0), 0);
    expect(total).toBe(0); // skipped — unmapped section contributes nothing
  });

  it("fans from multiple sections accumulate correctly at the same gate", () => {
    const sections: SectionConfig[] = [
      {
        id: "101",
        capacity: 600,
        exitProfile: { early: 1.0, immediate: 0.0, late: 0.0 },
        position: { x: 19, y: 34 },
      },
      {
        id: "102",
        capacity: 400,
        exitProfile: { early: 1.0, immediate: 0.0, late: 0.0 },
        position: { x: 30, y: 22 },
      },
    ];
    const map: SectionGateEntry[] = [
      { section: "101", gate: "gate-north", walkMinutes: 3 },
      { section: "102", gate: "gate-north", walkMinutes: 3 },
    ];
    const m = buildNaturalMatrix({ sections, sectionGateMap: map, gateIds: GATE_IDS });
    const earlyTotal = m["gate-north"].slice(0, 13).reduce((s, v) => s + v, 0);
    expect(earlyTotal).toBe(1000); // 600 + 400
  });

  it("FLOW_START is 175 and FLOW_END is 220", () => {
    expect(FLOW_START).toBe(175);
    expect(FLOW_END).toBe(220);
  });
});
