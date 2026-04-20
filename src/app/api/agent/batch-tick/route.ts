import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { decideNudge } from "@/lib/agent";
import { getRemoteConfigValue } from "@/lib/remoteConfig";
import { logger } from "@/lib/logger";
import { getWaitTime } from "@/lib/timeline";
import venueConfig from "../../../../../venues/chinnaswamy.json";
import type { Station, StationWithWait } from "@/types/venue";

const MATCH_DURATION = 210;
// Users active within the last 5 minutes are eligible for nudges
const ACTIVE_WINDOW_MS = 5 * 60_000;

/**
 * Called every minute by Cloud Scheduler.
 * Queries all recently-active users and runs the nudge decision for each.
 *
 * Setup:
 *   gcloud scheduler jobs create http stadiumpal-agent-tick \
 *     --schedule="* * * * *" \
 *     --uri="https://<cloud-run-url>/api/agent/batch-tick" \
 *     --http-method=POST \
 *     --headers="X-CloudScheduler=true" \
 *     --oidc-service-account-email=<sa>@<project>.iam.gserviceaccount.com \
 *     --location=asia-south1
 */
export async function POST(req: NextRequest) {
  // Accept requests from Cloud Scheduler (header set in job config) or internal key
  const isScheduler = req.headers.get("X-CloudScheduler") === "true";
  const internalKey = process.env.INTERNAL_KEY;
  const isInternal = internalKey && req.headers.get("X-Internal-Key") === internalKey;
  if (!isScheduler && !isInternal) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cutoff = Timestamp.fromMillis(Date.now() - ACTIVE_WINDOW_MS);
  const usersSnap = await adminDb
    .collection("users")
    .where("lastSeenAt", ">", cutoff)
    .limit(50)
    .get();

  if (usersSnap.empty) {
    return NextResponse.json({ processed: 0, nudged: 0 });
  }

  const cooldownMinutes = await getRemoteConfigValue("nudgeCooldownMinutes", 5);
  let nudged = 0;

  for (const userDoc of usersSnap.docs) {
    const d = userDoc.data();
    const userId = userDoc.id;
    const matchStartedAt: number = d.matchStartedAt?.toMillis?.() ?? Date.now();
    const elapsed = Math.max(0, Math.min(MATCH_DURATION, (Date.now() - matchStartedAt) / 60_000));
    const seat = d.seat ?? { section: "114", row: "G", number: "12" };
    const preferences = d.preferences ?? { dietary: [], avoidCrowds: false };

    const recentSnap = await adminDb
      .collection("nudges")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const recentNudges = recentSnap.docs.map((doc) => ({
      message: doc.data().message as string,
      elapsedMinutes: doc.data().elapsedMinutes as number,
    }));

    const venueState: StationWithWait[] = (venueConfig.stations as Station[]).map((s) => ({
      ...s,
      waitMinutes: Math.round(getWaitTime(s.id, elapsed) * 10) / 10,
      forecastMinutes: Math.round(getWaitTime(s.id, Math.min(MATCH_DURATION, elapsed + 10)) * 10) / 10,
    }));

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
      logger.info("batch nudge written", { userId, elapsed: Math.round(elapsed), nudgeId: nudgeRef.id });
      nudged++;
    }

    // Small delay between users to stay within Vertex AI quota
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info("batch tick complete", { processed: usersSnap.size, nudged });
  return NextResponse.json({ processed: usersSnap.size, nudged });
}
