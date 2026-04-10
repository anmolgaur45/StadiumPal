"use client";

import { signInAnonymously } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Seat, UserPreferences } from "@/types/venue";

export type AppUser = {
  uid: string;
  matchStartedAt: number; // epoch ms, derived from Firestore Timestamp
  seat: Seat;
  preferences: UserPreferences;
};

const DEFAULT_SEAT: Seat = { section: "114", row: "G", number: "12" };
const DEFAULT_PREFS: UserPreferences = { dietary: ["veg"], avoidCrowds: false };

/**
 * Signs in anonymously (idempotent — reuses existing session), then reads or
 * creates the user doc in Firestore. Returns the resolved AppUser.
 */
export async function initUser(): Promise<AppUser> {
  const { user } = await signInAnonymously(auth);
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const d = snap.data();
    return {
      uid: user.uid,
      matchStartedAt: d.matchStartedAt.toMillis(),
      seat: d.seat,
      preferences: d.preferences,
    };
  }

  // First visit — create the user doc and start the match clock
  await setDoc(ref, {
    matchStartedAt: serverTimestamp(),
    seat: DEFAULT_SEAT,
    preferences: DEFAULT_PREFS,
    createdAt: serverTimestamp(),
  });

  // Re-read to get the server-assigned timestamp
  const created = await getDoc(ref);
  const d = created.data()!;
  return {
    uid: user.uid,
    matchStartedAt: d.matchStartedAt.toMillis(),
    seat: d.seat,
    preferences: d.preferences,
  };
}
