import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTemplate = vi.fn();

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => [{ name: "default" }]),
  initializeApp: vi.fn(),
  getApp: vi.fn(() => ({ name: "default" })),
}));

vi.mock("firebase-admin/remote-config", () => ({
  getRemoteConfig: vi.fn(() => ({ getTemplate: mockGetTemplate })),
}));

function makeTemplate(params: Record<string, string>) {
  return {
    parameters: Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        { defaultValue: { value } },
      ])
    ),
  };
}

describe("getRemoteConfigValue", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetTemplate.mockReset();
  });

  it("fetches template on first call and coerces numeric string to number", async () => {
    mockGetTemplate.mockResolvedValue(makeTemplate({ nudgeCooldownMinutes: "5" }));
    const { getRemoteConfigValue } = await import("@/lib/remoteConfig");
    const val = await getRemoteConfigValue("nudgeCooldownMinutes", 3);
    expect(val).toBe(5);
    expect(mockGetTemplate).toHaveBeenCalledOnce();
  });

  it("returns cached value without re-fetching on second call within TTL", async () => {
    mockGetTemplate.mockResolvedValue(makeTemplate({ nudgeCooldownMinutes: "7" }));
    const { getRemoteConfigValue } = await import("@/lib/remoteConfig");
    await getRemoteConfigValue("nudgeCooldownMinutes", 3);
    await getRemoteConfigValue("nudgeCooldownMinutes", 3);
    expect(mockGetTemplate).toHaveBeenCalledOnce();
  });

  it("re-fetches template after the 5-minute TTL expires", async () => {
    vi.useFakeTimers();
    mockGetTemplate.mockResolvedValue(makeTemplate({ nudgeCooldownMinutes: "5" }));
    const { getRemoteConfigValue } = await import("@/lib/remoteConfig");

    await getRemoteConfigValue("nudgeCooldownMinutes", 3);
    expect(mockGetTemplate).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(6 * 60_000);

    await getRemoteConfigValue("nudgeCooldownMinutes", 3);
    expect(mockGetTemplate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("returns fallback when Remote Config fetch throws", async () => {
    mockGetTemplate.mockRejectedValue(new Error("Service unavailable"));
    const { getRemoteConfigValue } = await import("@/lib/remoteConfig");
    const val = await getRemoteConfigValue("nudgeCooldownMinutes", 42);
    expect(val).toBe(42);
  });

  it("returns fallback for a key absent from the template", async () => {
    mockGetTemplate.mockResolvedValue(makeTemplate({ otherKey: "10" }));
    const { getRemoteConfigValue } = await import("@/lib/remoteConfig");
    const val = await getRemoteConfigValue("nudgeCooldownMinutes", 99);
    expect(val).toBe(99);
  });
});
