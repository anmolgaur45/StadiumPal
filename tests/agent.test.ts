import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideNudge, type AgentInput } from "@/lib/agent";
import { getModel } from "@/lib/gemini";

vi.mock("@/lib/gemini", () => ({ getModel: vi.fn() }));

// Silence logger output during tests
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

const BASE: AgentInput = {
  user: {
    uid: "u1",
    matchStartedAt: Date.now() - 100 * 60_000,
    seat: { section: "114", row: "G", number: "12" },
    preferences: { dietary: ["veg"], avoidCrowds: false },
  },
  venueState: [
    {
      id: "food-north-a",
      name: "North Stand Kiosk A",
      category: "concession",
      position: { x: 35, y: 15 },
      sections: ["101", "102"],
      waitMinutes: 8,
      forecastMinutes: 18,
    },
  ],
  elapsedMinutes: 100,
  recentNudges: [],
};

describe("decideNudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns wait without calling Gemini when cooldown has not expired", async () => {
    const result = await decideNudge({
      ...BASE,
      elapsedMinutes: 102,
      recentNudges: [{ message: "Head to north kiosk now.", elapsedMinutes: 100 }],
    });
    expect(result.action).toBe("wait");
    expect(result.reasoning).toMatch(/cooldown/);
    expect(getModel).not.toHaveBeenCalled();
  });

  it("returns the Gemini nudge on the happy path", async () => {
    mockGeminiText(
      JSON.stringify({
        action: "nudge",
        message: "Head to North Stand Kiosk A now — only 3 min wait before the innings-break rush.",
        reasoning: "Queue about to spike at innings break",
      })
    );
    const result = await decideNudge(BASE);
    expect(result.action).toBe("nudge");
    if (result.action === "nudge") {
      expect(result.message.length).toBeGreaterThanOrEqual(10);
    }
    expect(getModel).toHaveBeenCalledOnce();
  });

  it("returns wait when Gemini throws", async () => {
    vi.mocked(getModel).mockReturnValue({
      generateContent: vi.fn().mockRejectedValue(new Error("Vertex AI 503")),
    } as unknown as ReturnType<typeof getModel>);
    const result = await decideNudge(BASE);
    expect(result.action).toBe("wait");
    expect(result.reasoning).toBe("decision service unavailable");
  });

  it("returns wait when Gemini returns malformed JSON", async () => {
    mockGeminiText("this is definitely not json {{{{");
    const result = await decideNudge(BASE);
    expect(result.action).toBe("wait");
    expect(result.reasoning).toBe("decision service unavailable");
  });

  it("returns wait when Gemini output fails schema validation (message too short)", async () => {
    mockGeminiText(JSON.stringify({ action: "nudge", message: "Go", reasoning: "short" }));
    const result = await decideNudge(BASE);
    expect(result.action).toBe("wait");
    expect(result.reasoning).toBe("decision service unavailable");
  });
});
