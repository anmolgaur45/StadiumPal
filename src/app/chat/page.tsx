"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initUser, type AppUser } from "@/lib/user";
import ChatUI from "@/components/ChatUI";

export default function ChatPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initUser()
      .then(setUser)
      .catch(() => setError("Failed to start session. Check your connection."));
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
          <div
            className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
            aria-hidden="true"
          />
          <p className="text-gray-400 text-sm">Starting match…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col h-screen bg-gray-950 px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-5 flex-shrink-0">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Back to stadium view"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-white">Concierge</h1>
          <p className="text-xs text-gray-500">
            Section {user.seat.section} · Row {user.seat.row}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <ChatUI user={user} />
      </div>
    </main>
  );
}
