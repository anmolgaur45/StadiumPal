"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface NudgeToastProps {
  userId: string;
}

type ActiveNudge = { id: string; message: string };

export default function NudgeToast({ userId }: NudgeToastProps) {
  const [nudge, setNudge] = useState<ActiveNudge | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Uses the existing composite index: nudges(userId ASC, createdAt DESC)
    const q = query(
      collection(db, "nudges"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsub = onSnapshot(q, (snap) => {
      const unread = snap.docs.find(
        (d) => !d.data().read && !seenIds.current.has(d.id)
      );
      if (unread) {
        seenIds.current.add(unread.id);
        setNudge({ id: unread.id, message: unread.data().message as string });
      }
    });

    return () => unsub();
  }, [userId]);

  async function dismiss() {
    if (!nudge) return;
    const id = nudge.id;
    setNudge(null);
    try {
      await updateDoc(doc(db, "nudges", id), { read: true });
    } catch {
      // best-effort — toast is already dismissed from UI
    }
  }

  if (!nudge) return null;

  return (
    <div role="alert" aria-live="assertive" className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto z-50">
      <div className="bg-indigo-700 border border-indigo-500 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-lg shadow-black/50 animate-slide-up">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-indigo-200 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a33.54 33.54 0 003.9 0 2 2 0 01-3.9 0z"
            clipRule="evenodd"
          />
        </svg>
        <p className="flex-1 text-sm text-white leading-snug">{nudge.message}</p>
        <button
          onClick={dismiss}
          aria-label="Dismiss nudge"
          className="text-indigo-300 hover:text-white transition-colors flex-shrink-0 mt-0.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
