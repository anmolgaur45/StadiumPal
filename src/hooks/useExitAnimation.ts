"use client";

import { useEffect, useRef, useState } from "react";
import { FLOW_START, FLOW_END, FLOW_LENGTH } from "@/lib/crowdFlow";
import type { ExitPlanData } from "./useExitPlanData";

const PLAY_SPEED = 1.5; // match-minutes per wall-second (45 min in 30 sec)

/**
 * Manages the RAF-driven animation loop for the exit timeline scrubber.
 * Auto-plays once when data arrives; stops at FLOW_END. Never throws.
 */
export function useExitAnimation(data: ExitPlanData | null) {
  const [currentT, setCurrentT] = useState<number>(FLOW_START);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const hasAutoPlayedRef = useRef(false);
  // Shadow ref keeps RAF closure in sync with isPlaying state without re-scheduling the loop
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  // Auto-play once when data first arrives — start 5 min before departure
  useEffect(() => {
    if (data && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      const startT = Math.max(FLOW_START, data.userAssignment.leaveAtElapsed - 5);
      setCurrentT(startT);
      setIsPlaying(true);
    }
  }, [data]);

  // Stop playback when timeline reaches the end
  useEffect(() => {
    if (currentT >= FLOW_END && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentT, isPlaying]);

  // requestAnimationFrame loop
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
        setCurrentT((prev) => Math.min(FLOW_END, prev + dtSec * PLAY_SPEED));
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

  const tIdx = Math.max(0, Math.min(FLOW_LENGTH - 1, Math.floor(currentT) - FLOW_START));

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

  function scrub(t: number) {
    setIsPlaying(false);
    setCurrentT(t);
  }

  return { currentT, isPlaying, tIdx, togglePlay, reset, scrub };
}
