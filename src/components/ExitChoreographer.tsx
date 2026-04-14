"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { AppUser } from "@/lib/user";
import type { FlowMatrix, SectionConfig, SectionGateEntry, GateStation } from "@/types/venue";
import venueConfig from "../../venues/chinnaswamy.json";
import { FLOW_START, FLOW_END, FLOW_LENGTH } from "@/lib/crowdFlow";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAY_SPEED = 1.5;           // match-minutes per wall-second (45 min in 30 sec)
const FANS_PER_DOT: number = (venueConfig.visualization as { fansPerDot: number }).fansPerDot;

const URGENCY_COLOR: Record<string, string> = {
  low: "#eab308",
  medium: "#f97316",
  high: "#ef4444",
};

const URGENCY_LABEL: Record<string, string> = {
  low: "Low — plan your exit",
  medium: "Medium — start moving",
  high: "High — leave now",
};

// Static lookups derived from venue config — computed once at module level
const SECTIONS = venueConfig.sections as SectionConfig[];
const SECTION_GATE_MAP = venueConfig.sectionGateMap as SectionGateEntry[];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserAssignment {
  gateId: string;
  gateName: string;
  gatePosition: { x: number; y: number };
  walkMinutes: number;
  leaveAtElapsed: number;
  predictedWait: number;
}

interface ExitPlanData {
  urgency: "low" | "medium" | "high";
  naturalMatrix: FlowMatrix;
  choreographedMatrix: FlowMatrix;
  userAssignment: UserAssignment;
  recommendation: string;
}

interface DotGroup {
  sectionId: string;
  isUser: boolean;
  dots: Array<{ x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function gateHeatColor(load: number, throughput: number): string {
  const ratio = throughput > 0 ? load / throughput : 0;
  if (ratio <= 0.5) return "#22c55e";
  if (ratio <= 0.8) return "#eab308";
  if (ratio <= 1.0) return "#f97316";
  return "#ef4444";
}

// Fans departing from this section per minute at time t
function getSectionRate(section: SectionConfig, t: number): number {
  if (t < FLOW_START || t > FLOW_END) return 0;
  if (t <= 187) return (section.capacity * section.exitProfile.early) / 13;
  if (t <= 200) return (section.capacity * section.exitProfile.immediate) / 13;
  return (section.capacity * section.exitProfile.late) / 20;
}

// Build animated dot groups for all sections at currentT
function buildDots(
  gates: GateStation[],
  userSectionId: string,
  currentT: number
): DotGroup[] {
  return SECTIONS.flatMap((section) => {
    const entry = SECTION_GATE_MAP.find((m) => m.section === section.id);
    if (!entry) return [];
    const gate = gates.find((g) => g.id === entry.gate);
    if (!gate) return [];

    const rate = getSectionRate(section, currentT);
    if (rate <= 0) return [];

    const numDots = Math.max(1, Math.ceil((rate * entry.walkMinutes) / FANS_PER_DOT));

    // Conveyor-belt: each dot cycles section→gate over walkMinutes match-minutes,
    // staggered by 1/numDots so the path is evenly filled at all times.
    const dots = Array.from({ length: numDots }, (_, i) => {
      const phase = ((currentT - FLOW_START) / entry.walkMinutes + i / numDots) % 1;
      return {
        x: lerp(section.position.x, gate.position.x, phase),
        y: lerp(section.position.y, gate.position.y, phase),
      };
    });

    return [{ sectionId: section.id, isUser: section.id === userSectionId, dots }];
  });
}

// ---------------------------------------------------------------------------
// Stadium schematic — inlined per-panel so each SVG is self-contained
// ---------------------------------------------------------------------------

function StadiumBase() {
  return (
    <>
      <ellipse cx="50" cy="50" rx="46" ry="46" fill="#111827" stroke="#374151" strokeWidth="0.5" aria-hidden="true" />
      <ellipse cx="50" cy="50" rx="22" ry="20" fill="#14532d" stroke="#166534" strokeWidth="0.4" aria-hidden="true" />
      <rect x="47.5" y="42" width="5" height="16" rx="0.5" fill="#a16207" opacity="0.7" aria-hidden="true" />
      <ellipse cx="50" cy="50" rx="34" ry="34" fill="none" stroke="#1f2937" strokeWidth="10" aria-hidden="true" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Flow panel
// ---------------------------------------------------------------------------

interface PanelProps {
  label: "Natural flow" | "Choreographed";
  matrix: FlowMatrix;
  gates: GateStation[];
  sectionDots: DotGroup[];
  userDot: { x: number; y: number } | null;
  assignedGateId: string;
  tIdx: number;
  currentT: number;
}

function FlowPanel({
  label,
  matrix,
  gates,
  sectionDots,
  userDot,
  assignedGateId,
  tIdx,
  currentT,
}: PanelProps) {
  const gateLoadSummary = gates
    .map((g) => {
      const load = matrix[g.id]?.[tIdx] ?? 0;
      return `${g.name}: ${load} fans/min (cap ${g.throughputPerMinute})`;
    })
    .join("; ");

  return (
    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <div
        className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900"
        style={{ paddingBottom: "100%" }}
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label={`${label} at match minute ${Math.round(currentT)} — ${gateLoadSummary}`}
        >
          <title>
            {label} exit flow — match minute {Math.round(currentT)}
          </title>

          <StadiumBase />

          {/* Gate heat rectangles */}
          {gates.map((gate) => {
            const load = matrix[gate.id]?.[tIdx] ?? 0;
            const color = gateHeatColor(load, gate.throughputPerMinute);
            const isAssigned = gate.id === assignedGateId && label === "Choreographed";

            return (
              <g key={gate.id} aria-hidden="true">
                {/* Glow halo */}
                <rect
                  x={gate.position.x - 5}
                  y={gate.position.y - 3.5}
                  width={10}
                  height={7}
                  rx={1.5}
                  fill={color}
                  opacity={0.18}
                />
                {/* Gate body */}
                <rect
                  x={gate.position.x - 3}
                  y={gate.position.y - 2}
                  width={6}
                  height={4}
                  rx={0.5}
                  fill={color}
                  opacity={0.9}
                />
                {/* Assigned-gate marker ring (choreographed panel only) */}
                {isAssigned && (
                  <rect
                    x={gate.position.x - 4}
                    y={gate.position.y - 3}
                    width={8}
                    height={6}
                    rx={1}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={0.6}
                    opacity={0.6}
                  />
                )}
                <text
                  x={gate.position.x}
                  y={gate.position.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="2"
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                  fill="#000"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  G
                </text>
              </g>
            );
          })}

          {/* Fan transit dots */}
          {sectionDots.map(({ sectionId, dots, isUser }) =>
            dots.map((pos, i) => (
              <circle
                key={`${sectionId}-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={1}
                fill={isUser ? "#818cf8" : "#4b5563"}
                opacity={isUser ? 0.8 : 0.5}
                aria-hidden="true"
              />
            ))
          )}

          {/* User dot — RCB red, rendered last so it sits above all others */}
          {userDot && (
            <g aria-hidden="true">
              <circle cx={userDot.x} cy={userDot.y} r={2.8} fill="#e50914" opacity={0.2} />
              <circle cx={userDot.x} cy={userDot.y} r={1.6} fill="#e50914" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = { user: AppUser };

export default function ExitChoreographer({ user }: Props) {
  const [data, setData] = useState<ExitPlanData | null>(null);
  const [currentT, setCurrentT] = useState<number>(FLOW_START);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const hasAutoPlayedRef = useRef(false);
  // Shadow ref keeps RAF closure in sync with isPlaying state
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  // ---------------------------------------------------------------------------
  // Data fetch — on mount and every 5 minutes
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Auto-play once when data first arrives
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (data && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      setCurrentT(FLOW_START);
      setIsPlaying(true);
    }
  }, [data]);

  // ---------------------------------------------------------------------------
  // Stop playback when timeline reaches the end
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentT >= FLOW_END && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentT, isPlaying]);

  // ---------------------------------------------------------------------------
  // requestAnimationFrame loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    function step(now: number) {
      if (!isPlayingRef.current) return;

      if (lastTimeRef.current !== null) {
        const dtSec = (now - lastTimeRef.current) / 1000;
        const dT = dtSec * PLAY_SPEED;
        setCurrentT((prev) => Math.min(FLOW_END, prev + dT));
      }

      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = null;
    };
  }, [isPlaying]);

  // ---------------------------------------------------------------------------
  // Static derived data
  // ---------------------------------------------------------------------------
  const gates = useMemo<GateStation[]>(
    () => (venueConfig.stations as unknown as GateStation[]).filter((s) => s.category === "gate"),
    []
  );

  const userSection = useMemo(
    () => SECTIONS.find((s) => s.id === user.seat.section) ?? null,
    [user.seat.section]
  );

  // ---------------------------------------------------------------------------
  // Per-frame derived data (currentT-dependent)
  // ---------------------------------------------------------------------------
  const tIdx = clamp(Math.floor(currentT) - FLOW_START, 0, FLOW_LENGTH - 1);

  const sectionDots = buildDots(gates, user.seat.section, currentT);

  // User dot: physics-based — at section before leaveAtElapsed, walks to gate after
  const userDot = useMemo(() => {
    if (!data || !userSection) return null;
    const walkProgress = clamp(
      (currentT - data.userAssignment.leaveAtElapsed) / data.userAssignment.walkMinutes,
      0,
      1
    );
    return {
      x: lerp(userSection.position.x, data.userAssignment.gatePosition.x, walkProgress),
      y: lerp(userSection.position.y, data.userAssignment.gatePosition.y, walkProgress),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentT, data, userSection]);

  if (!data) return null;

  const { userAssignment, recommendation, urgency } = data;
  const urgencyColor = URGENCY_COLOR[urgency];

  function togglePlay() {
    if (currentT >= FLOW_END) {
      setCurrentT(FLOW_START);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  }

  function reset() {
    setIsPlaying(false);
    setCurrentT(FLOW_START);
  }

  return (
    <section className="flex flex-col gap-4 mt-4" aria-label="Exit Choreographer">
      {/* Heading */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          Exit Choreographer
        </h2>
        <p className="text-xs text-gray-600 mt-0.5">
          System-coordinated fan exit · T=175 → 220
        </p>
      </div>

      {/* Urgency banner + Gemini recommendation */}
      <div
        className="rounded-xl border p-3 flex flex-col gap-1.5"
        style={{ borderColor: urgencyColor + "50", backgroundColor: urgencyColor + "10" }}
        role="status"
        aria-live="polite"
        aria-label={`Exit urgency: ${URGENCY_LABEL[urgency]}`}
      >
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: urgencyColor }}>
          {URGENCY_LABEL[urgency]}
        </span>
        <p className="text-sm text-gray-200 leading-relaxed">{recommendation}</p>
      </div>

      {/* Two SVG panels */}
      <div className="flex flex-col sm:flex-row gap-3">
        <FlowPanel
          label="Natural flow"
          matrix={data.naturalMatrix}
          gates={gates}
          sectionDots={sectionDots}
          userDot={userDot}
          assignedGateId={userAssignment.gateId}
          tIdx={tIdx}
          currentT={currentT}
        />
        <FlowPanel
          label="Choreographed"
          matrix={data.choreographedMatrix}
          gates={gates}
          sectionDots={sectionDots}
          userDot={userDot}
          assignedGateId={userAssignment.gateId}
          tIdx={tIdx}
          currentT={currentT}
        />
      </div>

      {/* Playback controls + scrubber */}
      <div className="flex items-center gap-3" role="group" aria-label="Playback controls">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause exit timeline" : "Play exit timeline"}
          className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white flex items-center justify-center text-sm transition-colors flex-shrink-0"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        {/* Reset */}
        <button
          onClick={reset}
          aria-label="Reset timeline to T=175"
          className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white flex items-center justify-center text-sm transition-colors flex-shrink-0"
        >
          ↺
        </button>

        {/* Scrubber */}
        <input
          type="range"
          min={FLOW_START}
          max={FLOW_END}
          step={0.1}
          value={currentT}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentT(Number(e.target.value));
          }}
          aria-label="Exit timeline — match minute"
          aria-valuenow={Math.round(currentT)}
          aria-valuemin={FLOW_START}
          aria-valuemax={FLOW_END}
          aria-valuetext={`Match minute ${Math.round(currentT)}`}
          className="flex-1 accent-indigo-500"
        />

        {/* Current time readout */}
        <span
          className="text-xs text-gray-400 tabular-nums w-10 text-right flex-shrink-0"
          aria-hidden="true"
        >
          T+{Math.round(currentT)}
        </span>
      </div>

      {/* User assignment card */}
      <div
        className="rounded-xl bg-gray-800 border border-gray-700 p-4 flex flex-col gap-2"
        aria-label={`Your exit assignment: ${userAssignment.gateName}`}
      >
        <p className="text-xs text-gray-500 uppercase tracking-widest">Your exit</p>
        <p className="text-base font-semibold text-white">{userAssignment.gateName}</p>
        <div className="flex gap-6 mt-1">
          <div>
            <p className="text-xs text-gray-500" id="ec-walk-label">Walk</p>
            <p className="text-lg font-bold tabular-nums text-indigo-400" aria-labelledby="ec-walk-label">
              {userAssignment.walkMinutes} min
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500" id="ec-wait-label">Est. wait</p>
            <p
              className="text-lg font-bold tabular-nums"
              style={{ color: urgencyColor }}
              aria-labelledby="ec-wait-label"
            >
              ~{userAssignment.predictedWait.toFixed(1)} min
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500" id="ec-leave-label">Leave at</p>
            <p className="text-lg font-bold tabular-nums text-gray-300" aria-labelledby="ec-leave-label">
              T+{userAssignment.leaveAtElapsed}
            </p>
          </div>
        </div>
      </div>

      {/* Screen-reader gate load table — updates with scrubber */}
      <table className="sr-only" aria-label={`Gate loads at match minute ${Math.round(currentT)}`}>
        <caption>
          Gate throughput comparison — natural vs choreographed at T={Math.round(currentT)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Gate</th>
            <th scope="col">Natural (fans/min)</th>
            <th scope="col">Choreographed (fans/min)</th>
            <th scope="col">Capacity (fans/min)</th>
          </tr>
        </thead>
        <tbody>
          {gates.map((gate) => (
            <tr key={gate.id}>
              <td>{gate.name}</td>
              <td>{data.naturalMatrix[gate.id]?.[tIdx] ?? 0}</td>
              <td>{data.choreographedMatrix[gate.id]?.[tIdx] ?? 0}</td>
              <td>{gate.throughputPerMinute}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
