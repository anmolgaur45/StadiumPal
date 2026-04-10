"use client";

import { useEffect, useState } from "react";
import { initUser } from "@/lib/user";
import type { AppUser } from "@/lib/user";
import dynamic from "next/dynamic";
import Link from "next/link";

// DigitalTwin uses SVG + intervals — skip SSR
const DigitalTwin = dynamic(() => import("@/components/DigitalTwin"), { ssr: false });

export default function Home() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initUser()
      .then(setUser)
      .catch((e) => {
        console.error("auth init failed", e);
        setError("Failed to start session. Check your connection.");
      });
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-red-400 text-sm">{error}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" aria-hidden="true" />
          <p className="text-gray-400 text-sm">Starting match…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">StadiumPal</h1>
          <p className="text-xs text-gray-500">M. Chinnaswamy Stadium · Bangalore</p>
        </div>
        <Link
          href="/chat"
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
          aria-label="Open concierge chat"
        >
          Ask AI
        </Link>
      </header>

      <DigitalTwin user={user} />
    </main>
  );
}
