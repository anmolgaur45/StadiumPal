"use client";

import { useEffect, useState } from "react";
import type { AppUser } from "@/lib/user";
import type { FlowMatrix } from "@/types/venue";

export interface UserAssignment {
  gateId: string;
  gateName: string;
  gatePosition: { x: number; y: number };
  walkMinutes: number;
  leaveAtElapsed: number;
  predictedWait: number;
}

export interface ExitPlanData {
  urgency: "low" | "medium" | "high";
  naturalMatrix: FlowMatrix;
  choreographedMatrix: FlowMatrix;
  userAssignment: UserAssignment;
  recommendation: string;
}

export function useExitPlanData(user: AppUser): { data: ExitPlanData | null } {
  const [data, setData] = useState<ExitPlanData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlan() {
      try {
        const res = await fetch("/api/exit-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            matchStartedAt: user.matchStartedAt,
            seat: user.seat,
            preferences: user.preferences,
          }),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { urgency: string } & Record<string, unknown>;
        if (json.urgency === "none" || cancelled) return;
        setData(json as unknown as ExitPlanData);
      } catch {
        // best-effort — exit plan is non-critical
      }
    }

    fetchPlan();
    const interval = setInterval(fetchPlan, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  return { data };
}
