import { z } from "zod";
import { getModel } from "./gemini";
import type { StationWithWait, User } from "@/types/venue";

export type AgentInput = {
  user: User;
  venueState: StationWithWait[];
  elapsedMinutes: number;
  recentNudges: { message: string; elapsedMinutes: number }[];
};

export type AgentDecision =
  | { action: "nudge"; message: string; reasoning: string }
  | { action: "wait"; reasoning: string };

const DecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("nudge"),
    message: z.string().min(10).max(200),
    reasoning: z.string().min(1),
  }),
  z.object({
    action: z.literal("wait"),
    reasoning: z.string().min(1),
  }),
]);

const COOLDOWN_MINUTES = 5;
const MATCH_DURATION = 210;

function matchPhase(elapsed: number): string {
  if (elapsed < 95) {
    const over = Math.min(20, Math.floor((elapsed / 95) * 20));
    return `1st innings, over ${over}/20`;
  }
  if (elapsed < 115) return "innings break";
  const over = Math.min(20, Math.floor(((elapsed - 115) / 95) * 20));
  return `2nd innings, over ${over}/20`;
}

function buildPrompt(input: AgentInput): string {
  const { user, venueState, elapsedMinutes, recentNudges } = input;

  const concessions = venueState
    .filter((s) => s.category === "concession")
    .sort((a, b) => a.waitMinutes - b.waitMinutes);
  const restrooms = venueState
    .filter((s) => s.category === "restroom")
    .sort((a, b) => a.waitMinutes - b.waitMinutes);

  const stateLines = [
    "FOOD STALLS (sorted by wait):",
    ...concessions.map(
      (s) =>
        `  ${s.name}: ${s.waitMinutes.toFixed(1)} min now → ${s.forecastMinutes.toFixed(1)} min in 10 min`
    ),
    "",
    "RESTROOMS:",
    ...restrooms.map(
      (s) =>
        `  ${s.name}: ${s.waitMinutes.toFixed(1)} min now → ${s.forecastMinutes.toFixed(1)} min in 10 min`
    ),
  ].join("\n");

  const recentLines = recentNudges.length
    ? recentNudges.map((n) => `  T=${n.elapsedMinutes}: "${n.message}"`).join("\n")
    : "  (none yet)";

  return `You are a proactive AI concierge for M. Chinnaswamy Stadium, Bangalore.
Decide if the attendee should receive a nudge RIGHT NOW.

MATCH: IPL T20, ${matchPhase(elapsedMinutes)} (T=${Math.round(elapsedMinutes)} of ${MATCH_DURATION} min)
USER: Section ${user.seat.section}, Row ${user.seat.row} | Dietary: ${user.preferences.dietary.join(", ") || "none"}

VENUE STATE:
${stateLines}

RECENT NUDGES (avoid repeating):
${recentLines}

RULES:
- Only nudge if there is a genuinely actionable insight: a queue is about to spike, a short window exists before the innings-break rush, or a nearby stall just cleared
- Do NOT nudge if queues are stable or you already sent similar advice recently
- Be especially alert near the innings break (T=90–110) — crowds surge hardest then
- Messages: 1–2 sentences, mention real station names and actual wait times

Respond with JSON only:
{"action":"nudge","message":"<message>","reasoning":"<why>"}
OR
{"action":"wait","reasoning":"<why>"}`;
}

/**
 * Decides whether to nudge the user based on current venue state and match context.
 * Pure function — cooldown enforced before Gemini is called.
 * Never throws: any failure returns {action: "wait"}.
 */
export async function decideNudge(input: AgentInput): Promise<AgentDecision> {
  // Enforce cooldown before calling Gemini — prevents spam and saves API cost
  const lastNudge = input.recentNudges[0];
  if (lastNudge) {
    const minutesSinceLast = input.elapsedMinutes - lastNudge.elapsedMinutes;
    if (minutesSinceLast < COOLDOWN_MINUTES) {
      return {
        action: "wait",
        reasoning: `cooldown: ${minutesSinceLast.toFixed(1)} min since last nudge`,
      };
    }
  }

  try {
    const model = getModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const text =
      result.response.candidates?.[0]?.content?.parts?.find((p) => "text" in p && p.text)
        ?.text ?? "";

    const parsed = DecisionSchema.parse(JSON.parse(text));
    return parsed;
  } catch (err) {
    console.error("agent decision failed", err);
    return { action: "wait", reasoning: "decision service unavailable" };
  }
}
