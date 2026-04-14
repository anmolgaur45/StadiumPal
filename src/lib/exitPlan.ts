import { getWaitTime } from "./timeline";
import { FLOW_START, FLOW_END, FLOW_LENGTH } from "./crowdFlow";
import type { GateStation, SectionGateEntry, FlowMatrix } from "@/types/venue";

export type UserAssignment = {
  gate: GateStation;
  walkMinutes: number;
  leaveAtElapsed: number;   // choreographed departure minute
  predictedWait: number;    // getWaitTime(gate.id, leaveAtElapsed + walkMinutes)
};

export type ChoreographerOutput = {
  naturalMatrix: FlowMatrix;
  choreographedMatrix: FlowMatrix;
  userAssignment: UserAssignment;
  urgency: "none" | "low" | "medium" | "high";
};

export type ExitPlanInput = {
  userSection: string;
  naturalMatrix: FlowMatrix;
  gates: GateStation[];
  sectionGateMap: SectionGateEntry[];
  elapsedMinutes: number;
};

function computeUrgency(elapsed: number): ChoreographerOutput["urgency"] {
  if (elapsed < 170) return "none";
  if (elapsed < 183) return "low";
  if (elapsed < 195) return "medium";
  return "high";
}

/**
 * Greedy system-level exit choreographer.
 *
 * Takes the natural-flow matrix and re-assigns overflow fans to neighbor gates
 * and/or later minutes (max 5-minute delay window) to reduce peak load.
 * Produces a choreographed matrix of the same shape and extracts the current
 * user's specific gate + departure time.
 *
 * Pure function — no side effects, no I/O.
 *
 * Key invariant: for any gate-minute where a neighbor has absorption capacity
 * within the 5-minute window, choreographedMatrix[gate][t] ≤ throughputPerMinute.
 * Where total demand persistently exceeds total capacity, overflow remains
 * best-effort and is documented.
 */
export function buildExitPlan(input: ExitPlanInput): ChoreographerOutput {
  const { userSection, naturalMatrix, gates, sectionGateMap, elapsedMinutes } = input;

  const urgency = computeUrgency(elapsedMinutes);

  // Deep-copy natural matrix → working copy
  const choreographed: FlowMatrix = {};
  for (const [gateId, arr] of Object.entries(naturalMatrix)) {
    choreographed[gateId] = [...arr];
  }

  // Gate lookup maps
  const gateMap = new Map(gates.map((g) => [g.id, g]));

  // Greedy per-minute re-assignment: T=175..220
  for (let tIdx = 0; tIdx < FLOW_LENGTH; tIdx++) {
    // Process gates in descending load order so the most-overloaded moves first
    const sortedGates = [...gates].sort(
      (a, b) => (choreographed[b.id]?.[tIdx] ?? 0) - (choreographed[a.id]?.[tIdx] ?? 0)
    );

    for (const gate of sortedGates) {
      const gateArr = choreographed[gate.id];
      if (!gateArr) continue;

      const load = gateArr[tIdx];
      if (load <= gate.throughputPerMinute) continue;

      let overflow = load - gate.throughputPerMinute;
      gateArr[tIdx] = gate.throughputPerMinute;

      // Try each neighbor; for each, scan delay=0..5 (5-minute window)
      for (const neighborId of gate.neighbors) {
        if (overflow <= 0) break;
        const neighbor = gateMap.get(neighborId);
        const neighborArr = choreographed[neighborId];
        if (!neighbor || !neighborArr) continue;

        for (let delay = 0; delay <= 5 && overflow > 0; delay++) {
          const targetIdx = tIdx + delay;
          if (targetIdx >= FLOW_LENGTH) continue;

          const available = neighbor.throughputPerMinute - neighborArr[targetIdx];
          if (available <= 0) continue;

          const shift = Math.min(overflow, available);
          neighborArr[targetIdx] += shift;
          overflow -= shift;
        }
      }

      // Best-effort: remaining overflow that couldn't be absorbed stays at gate
      if (overflow > 0) {
        gateArr[tIdx] += overflow;
      }
    }
  }

  // Extract user assignment
  const userEntry = sectionGateMap.find((e) => e.section === userSection);
  const userGate = userEntry ? gateMap.get(userEntry.gate) ?? gates[0] : gates[0];
  const userWalkMinutes = userEntry?.walkMinutes ?? 5;

  // Find earliest minute in choreographed matrix where the user's gate has
  // capacity, starting from the current elapsed minute
  const searchStart = Math.max(FLOW_START, Math.ceil(elapsedMinutes));
  let leaveAtElapsed = searchStart;

  const userGateArr = choreographed[userGate.id];
  if (userGateArr) {
    for (let i = Math.max(0, searchStart - FLOW_START); i < FLOW_LENGTH; i++) {
      if (userGateArr[i] < userGate.throughputPerMinute) {
        leaveAtElapsed = FLOW_START + i;
        break;
      }
    }
  }

  const arrivalT = leaveAtElapsed + userWalkMinutes;
  const predictedWait = getWaitTime(userGate.id, Math.min(FLOW_END, arrivalT));

  return {
    naturalMatrix,
    choreographedMatrix: choreographed,
    userAssignment: {
      gate: userGate,
      walkMinutes: userWalkMinutes,
      leaveAtElapsed,
      predictedWait,
    },
    urgency,
  };
}
