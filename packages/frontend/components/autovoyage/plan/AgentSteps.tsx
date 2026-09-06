// Agent progress steps
import type { PlanProgress } from "~~/types/autovoyage/plan";
import { CheckIcon } from "../ui/icons";

export function AgentSteps({ progress }: { progress: PlanProgress }) {
  return (
    <div className="rounded border border-av-border bg-av-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-av-blue" />
          <span className="text-[14px] font-semibold text-av-text">{progress.title}</span>
        </div>
        <span className="font-mono text-[12px] text-av-blue">{progress.elapsed}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        {progress.steps.map(step => (
          <span key={step.label} className="flex items-center gap-1.5 text-av-muted">
            {step.status === "done" ? (
              <CheckIcon size={13} className="text-av-green" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-av-blue" />
            )}
            {step.label}
            {step.note ? <span className="font-mono text-[12px]"> · {step.note}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
