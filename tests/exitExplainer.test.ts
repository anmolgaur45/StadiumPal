import { describe, it, expect, vi, beforeEach } from "vitest";
import { explainExitPlan, type ExplainerInput } from "@/lib/exitExplainer";
import { getModel } from "@/lib/gemini";

vi.mock("@/lib/gemini", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockGeminiText(text: string) {
  vi.mocked(getModel).mockReturnValue({
    generateContent: vi.fn().mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text }] } }] },
    }),
  } as unknown as ReturnType<typeof getModel>);
}

const BASE_INPUT: ExplainerInput = {
  user: {
    uid: "u1",
    matchStartedAt: Date.now() - 190 * 60_000,
    seat: { section: "114", row: "G", number: "12" },
    preferences: { dietary: ["veg"], avoidCrowds: false },
  },
  assignment: {
    gate: {
      id: "gate-east",
      name: "East Gate (Cubbon Rd)",
      category: "gate",
      position: { x: 93, y: 50 },
      sections: ["109", "110", "111", "112"],
      throughputPerMinute: 110,
      neighbors: ["gate-north", "gate-south"],
    },
    walkMinutes: 4,
    leaveAtElapsed: 191,
    predictedWait: 2.5,
  },
  urgency: "medium",
  elapsedMinutes: 190,
};

describe("explainExitPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Gemini recommendation on the happy path", async () => {
    mockGeminiText(
      JSON.stringify({
        recommendation: "Head to East Gate now — 4-min walk and only 3-min wait before the surge.",
        reasoning: "East Gate is uncrowded, user needs to leave soon",
      })
    );
    const result = await explainExitPlan(BASE_INPUT);
    expect(result.recommendation.length).toBeGreaterThanOrEqual(10);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(getModel).toHaveBeenCalledOnce();
  });

  it("returns template fallback when Gemini throws", async () => {
    vi.mocked(getModel).mockReturnValue({
      generateContent: vi.fn().mockRejectedValue(new Error("Vertex AI 503")),
    } as unknown as ReturnType<typeof getModel>);
    const result = await explainExitPlan(BASE_INPUT);
    expect(result.recommendation).toContain("East Gate (Cubbon Rd)");
    expect(result.reasoning).toBe("template fallback");
  });

  it("returns template fallback when Gemini returns malformed JSON", async () => {
    mockGeminiText("definitely not json {{{{");
    const result = await explainExitPlan(BASE_INPUT);
    expect(result.recommendation).toContain("East Gate (Cubbon Rd)");
    expect(result.reasoning).toBe("template fallback");
  });

  it("returns template fallback when recommendation is too short (Zod rejection)", async () => {
    mockGeminiText(JSON.stringify({ recommendation: "Go.", reasoning: "short" }));
    const result = await explainExitPlan(BASE_INPUT);
    expect(result.recommendation).toContain("East Gate (Cubbon Rd)");
    expect(result.reasoning).toBe("template fallback");
  });
});
