import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildNaturalMatrix } from "@/lib/crowdFlow";
import { buildExitPlan } from "@/lib/exitPlan";
import { explainExitPlan } from "@/lib/exitExplainer";
import { logger } from "@/lib/logger";
import { MATCH_DURATION } from "@/lib/crowdFlow";
import venueConfig from "../../../../venues/chinnaswamy.json";
import type { SectionConfig, SectionGateEntry, GateStation } from "@/types/venue";

const ExitPlanRequestSchema = z.object({
  userId: z.string().min(1),
  matchStartedAt: z.number().int().positive(),
  seat: z.object({ section: z.string(), row: z.string(), number: z.string() }),
  preferences: z.object({ dietary: z.array(z.string()), avoidCrowds: z.boolean() }),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = ExitPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { userId, matchStartedAt, seat, preferences } = parsed.data;
  const elapsed = Math.max(0, Math.min(MATCH_DURATION, (Date.now() - matchStartedAt) / 60_000));

  if (elapsed < 170) {
    return NextResponse.json({ urgency: "none" });
  }

  const sections = venueConfig.sections as SectionConfig[];
  const sectionGateMap = venueConfig.sectionGateMap as SectionGateEntry[];
  const gates = (venueConfig.stations as unknown as GateStation[]).filter(
    (s) => s.category === "gate"
  );
  const gateIds = gates.map((g) => g.id);

  const naturalMatrix = buildNaturalMatrix({ sections, sectionGateMap, gateIds });

  const { choreographedMatrix, userAssignment, urgency } = buildExitPlan({
    userSection: seat.section,
    naturalMatrix,
    gates,
    sectionGateMap,
    elapsedMinutes: elapsed,
  });

  // urgency cannot be "none" here — we returned early at elapsed < 170
  const explanation = await explainExitPlan({
    user: { uid: userId, matchStartedAt, seat, preferences },
    assignment: userAssignment,
    urgency: urgency as "low" | "medium" | "high",
    elapsedMinutes: elapsed,
  });

  logger.info("exit plan generated", {
    userId,
    elapsed: Math.round(elapsed),
    urgency,
    assignedGate: userAssignment.gate.id,
    leaveAt: Math.round(userAssignment.leaveAtElapsed),
  });

  return NextResponse.json({
    urgency,
    naturalMatrix,
    choreographedMatrix,
    userAssignment: {
      gateId: userAssignment.gate.id,
      gateName: userAssignment.gate.name,
      gatePosition: userAssignment.gate.position,
      walkMinutes: userAssignment.walkMinutes,
      leaveAtElapsed: Math.round(userAssignment.leaveAtElapsed),
      predictedWait: Math.round(userAssignment.predictedWait * 10) / 10,
    },
    recommendation: explanation.recommendation,
  });
}
