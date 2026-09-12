"use client";

// Keeps the chat thread pinned to the newest message inside its own scroll region.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function ChatScroller({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: mounted.current ? "smooth" : "instant" });
    mounted.current = true;
  }, [count]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  );
}
