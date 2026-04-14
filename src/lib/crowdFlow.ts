import type { SectionConfig, SectionGateEntry, FlowMatrix } from "@/types/venue";

export const FLOW_START = 175;  // T=175 (final overs)
export const FLOW_END = 220;    // T=220 (10 min post-match)
export const FLOW_LENGTH = FLOW_END - FLOW_START + 1; // 46 slots

// Exit bucket windows (match minutes)
const EARLY_START = 175;
const EARLY_END = 187;
const IMMEDIATE_START = 188;
const IMMEDIATE_END = 200;
const LATE_START = 201;
const LATE_END = 220;

export type CrowdFlowInput = {
  sections: SectionConfig[];
  sectionGateMap: SectionGateEntry[];
  gateIds: string[];
};

/**
 * Builds the natural-flow matrix: for each gate, for each minute T=175..220,
 * how many fans arrive under the uncoordinated distribution.
 *
 * Pure function — no side effects, no I/O.
 *
 * Invariant: sum of all matrix cells === sum of all section capacities
 * (holds when every section has a gate mapping; unmapped sections are skipped).
 */
export function buildNaturalMatrix(input: CrowdFlowInput): FlowMatrix {
  const { sections, sectionGateMap, gateIds } = input;

  // Initialise empty matrix
  const matrix: FlowMatrix = {};
  for (const gateId of gateIds) {
    matrix[gateId] = new Array(FLOW_LENGTH).fill(0);
  }

  // Index for O(1) section → gate lookup
  const gateForSection = new Map(sectionGateMap.map((e) => [e.section, e.gate]));

  for (const section of sections) {
    const gateId = gateForSection.get(section.id);
    if (!gateId || !matrix[gateId]) continue;

    const arr = matrix[gateId];
    const { capacity, exitProfile } = section;

    // Compute bucket fan counts. Last bucket absorbs rounding remainder.
    const earlyFans = Math.floor(capacity * exitProfile.early);
    const immediateFans = Math.floor(capacity * exitProfile.immediate);
    const lateFans = capacity - earlyFans - immediateFans;

    distributeFans(arr, earlyFans, EARLY_START, EARLY_END);
    distributeFans(arr, immediateFans, IMMEDIATE_START, IMMEDIATE_END);
    distributeFans(arr, lateFans, LATE_START, LATE_END);
  }

  return matrix;
}

/**
 * Distributes `totalFans` uniformly across matrix slots [startT, endT].
 * Remainder fans are appended to the last slot so the total is always exact.
 */
function distributeFans(
  arr: number[],
  totalFans: number,
  startT: number,
  endT: number
): void {
  if (totalFans <= 0) return;

  const startIdx = startT - FLOW_START;
  const endIdx = endT - FLOW_START;
  const windowLen = endIdx - startIdx + 1;

  const perMinute = Math.floor(totalFans / windowLen);
  const remainder = totalFans - perMinute * windowLen;

  for (let i = startIdx; i <= endIdx; i++) {
    arr[i] += perMinute;
  }
  if (remainder > 0) {
    arr[endIdx] += remainder;
  }
}
