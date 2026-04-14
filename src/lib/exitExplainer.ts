import { z } from "zod";
import { getModel } from "./gemini";
import { logger } from "./logger";
import type { UserAssignment } from "./exitPlan";
import type { User } from "@/types/venue";

export type ExplainerInput = {
  user: User;
  assignment: UserAssignment;
  urgency: "low" | "medium" | "high";
  elapsedMinutes: number;
};

export type ExplainerOutput = {
  recommendation: string;
  reasoning: string;
};

const ExplainerSchema = z.object({
  recommendation: z.string().min(10).max(200),
  reasoning: z.string().min(1),
});

function buildPrompt(input: ExplainerInput): string {
  const { user, assignment, urgency, elapsedMinutes } = input;
  const { gate, walkMinutes, leaveAtElapsed, predictedWait } = assignment;

  return `You are a proactive exit concierge at M. Chinnaswamy Stadium, Bangalore.
Give a fan their choreographed exit instructions in 1–2 sentences. Be direct and specific — include the gate name, walk time, and wait estimate.

USER: Section ${user.seat.section}, Row ${user.seat.row}
URGENCY: ${urgency}
MATCH MINUTE NOW: T=${Math.round(elapsedMinutes)}
CHOREOGRAPHED EXIT:
  Gate: ${gate.name}
  Walk time: ${walkMinutes} min
  Leave at: match minute ${Math.round(leaveAtElapsed)}
  Predicted wait at gate: ~${predictedWait.toFixed(0)} min

Respond with JSON only:
{"recommendation":"<1-2 sentences>","reasoning":"<why this gate/time>"}`;
}

function templateFallback(assignment: UserAssignment): ExplainerOutput {
  const { gate, walkMinutes, predictedWait } = assignment;
  return {
    recommendation: `Head to ${gate.name} now — ${walkMinutes}-min walk, ~${predictedWait.toFixed(0)}-min wait before the post-match surge.`,
    reasoning: "template fallback",
  };
}

/**
 * Generates a Gemini-narrated exit recommendation for the user's choreographed assignment.
 * Never throws — any failure returns a template string.
 */
export async function explainExitPlan(input: ExplainerInput): Promise<ExplainerOutput> {
  try {
    const model = getModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const text =
      result.response.candidates?.[0]?.content?.parts?.find(
        (p: { text?: string }) => "text" in p && p.text
      )?.text ?? "";

    const parsed = ExplainerSchema.parse(JSON.parse(text));
    return parsed;
  } catch (err) {
    logger.error("exit explainer failed", { err: String(err) });
    return templateFallback(input.assignment);
  }
}
