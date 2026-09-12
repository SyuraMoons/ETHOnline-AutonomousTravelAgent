// Agent progress steps
"use client";

import { useRef } from "react";
import { CheckIcon } from "../ui/icons";
import { useBeat } from "~~/hooks/autovoyage/useBeat";
import type { PlanProgress } from "~~/types/autovoyage/plan";

// Agent progress steps

export function AgentSteps({ progress }: { progress: PlanProgress }) {
  const ref = useRef<HTMLDivElement>(null);
  useBeat(ref, (gsap, el) => {
    const tl = gsap.timeline();
    tl.from(el.querySelectorAll("[data-step]"), {
      y: 8,
      opacity: 0,
      duration: 0.4,
      stagger: 0.12,
      ease: "power2.out",
    });
    tl.to(
      el.querySelectorAll("[data-active-dot]"),
      { scale: 1.35, duration: 0.6, repeat: 3, yoyo: true, ease: "sine.inOut", transformOrigin: "center" },
      ">-0.2",
    );
    return tl;
  });

  return (
    <div ref={ref} className="beat rounded border border-av-border bg-av-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-av-blue" />
          <span className="text-[14px] font-semibold text-av-text">{progress.title}</span>
        </div>
        <span className="font-mono text-[12px] text-av-blue">{progress.elapsed}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        {progress.steps.map(step => (
          <span key={step.label} data-step className="flex items-center gap-1.5 text-av-muted">
            {step.status === "done" ? (
              <CheckIcon size={13} className="text-av-green" />
            ) : (
              <span data-active-dot className="h-2 w-2 rounded-full bg-av-blue" />
            )}
            {step.label}
            {step.note ? <span className="font-mono text-[12px]"> · {step.note}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
