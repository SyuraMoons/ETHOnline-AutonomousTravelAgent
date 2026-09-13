// Stay card
import type { StaySection } from "~~/types/autovoyage/plan";

export function StayCard({ stay }: { stay: StaySection }) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center">
      <div>
        <p className="m-0 text-[15px] font-semibold text-av-text">{stay.name}</p>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">{stay.detail}</p>
        {stay.note ? <p className="m-0 mt-1 text-[13px] text-av-amber">{stay.note}</p> : null}
      </div>
    </div>
  );
}
