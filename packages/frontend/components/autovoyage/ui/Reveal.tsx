// Reveal wrapper (CSS scroll reveal)
"use client";

import type { ReactNode } from "react";
import { useReveal } from "~~/hooks/autovoyage/useReveal";

// Reveal wrapper (CSS scroll reveal)

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}
