import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { decideNudge } from "@/lib/agent";
import { getRemoteConfigValue } from "@/lib/remoteConfig";
import { logger } from "@/lib/logger";
import { MATCH_DURATION } from "@/lib/crowdFlow";
import { buildVenueState } from "@/lib/venueState";

const TickRequestSchema = z.object({
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

  const parsed = TickRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { userId, matchStartedAt, seat, preferences } = parsed.data;
  const elapsed = Math.max(0, Math.min(MATCH_DURATION, (Date.now() - matchStartedAt) / 60_000));

  // Read recent nudges for cooldown enforcement and context
  const recentSnap = await adminDb
    .collection("nudges")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  const recentNudges = recentSnap.docs.map((d) => ({
    message: d.data().message as string,
    elapsedMinutes: d.data().elapsedMinutes as number,
  }));

  const venueState = buildVenueState(elapsed);

  const cooldownMinutes = await getRemoteConfigValue("nudgeCooldownMinutes", 5);
  const decision = await decideNudge(
    { user: { uid: userId, matchStartedAt, seat, preferences }, venueState, elapsedMinutes: elapsed, recentNudges },
    cooldownMinutes
  );

  if (decision.action === "nudge") {
    const nudgeRef = adminDb.collection("nudges").doc();
    await nudgeRef.set({
      userId,
      message: decision.message,
      reasoning: decision.reasoning,
      elapsedMinutes: elapsed,
      stateSnapshot: Object.fromEntries(venueState.map((s) => [s.id, s.waitMinutes])),
      createdAt: Timestamp.now(),
      read: false,
    });
    logger.info("nudge written", { userId, elapsed: Math.round(elapsed), nudgeId: nudgeRef.id });
    return NextResponse.json({ action: "nudge", nudgeId: nudgeRef.id });
  }

  logger.info("agent tick: wait", { userId, elapsed: Math.round(elapsed), reasoning: decision.reasoning });
  return NextResponse.json({ action: "wait", reasoning: decision.reasoning });
}
