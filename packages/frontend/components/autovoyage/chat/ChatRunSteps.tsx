// Chat run steps — the live checklist for an in-progress autonomous run, mutated in place as
// SSE events arrive (see PlanProvider.runAutonomous).
import type { RunStep } from "~~/services/autovoyage/autonomousRun";

function Icon({ status }: { status: RunStep["status"] }) {
  if (status === "done") return <span className="text-[12px] text-av-green">✓</span>;
  if (status === "error") return <span className="text-[12px] text-av-amber">✕</span>;
  return <span className="h-2 w-2 animate-pulse rounded-full bg-av-blue" />;
}

export function ChatRunSteps({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2 rounded border border-av-border bg-av-card px-4 py-3">
      {steps.map(step => (
        <div key={step.id} className="flex items-center gap-2">
          <span className="flex w-4 flex-shrink-0 items-center justify-center">
            <Icon status={step.status} />
          </span>
          <span
            className={`text-[13px] ${step.status === "done" ? "text-av-muted" : "text-av-text"} ${
              step.status === "error" ? "text-av-amber" : ""
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
