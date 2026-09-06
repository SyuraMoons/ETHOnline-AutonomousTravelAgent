// Flight row
export function FlightRow({
  tag,
  airline,
  route,
  meta,
  last = false,
  readOnly = false,
}: {
  tag: string;
  airline: string;
  route: string;
  meta: string;
  last?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${last ? "" : "border-b border-av-border"}`}>
      <div className="flex min-w-0 items-start gap-4">
        <span className="w-12 flex-shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-muted">
          {tag}
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-semibold text-av-text">{airline}</p>
          <p className="m-0 mt-0.5 text-[13px] text-av-muted">
            {route} · {meta}
          </p>
        </div>
      </div>
      {readOnly ? null : (
        <button type="button" className="flex-shrink-0 text-[13px] font-medium text-av-blue transition-opacity hover:opacity-70">
          Change
        </button>
      )}
    </div>
  );
}
