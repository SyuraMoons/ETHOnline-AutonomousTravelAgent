// Approval card
import { ShieldIcon } from "../../ui/icons";

export function ApprovalCard() {
  return (
    <div className="w-full max-w-[380px] rounded border border-av-border bg-av-card p-6">
      <span className="inline-block rounded bg-av-amber/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-av-amber">
        Needs approval
      </span>
      <h3 className="mt-3 text-[16px] font-semibold text-av-text">Confirm this purchase</h3>
      <p className="m-0 mt-1 text-[13px] text-av-muted">The Park Hotel Tokyo · 3 nights</p>
      <div className="mt-3 rounded bg-av-blue-tint/60 px-4 py-3">
        <p className="m-0 text-[26px] font-semibold tracking-[-0.01em] text-av-text">$612.00</p>
        <p className="m-0 mt-1 text-[12px] text-av-amber">Above your $200 auto-approve limit</p>
      </div>
      <div className="mt-4 flex flex-col items-center rounded border border-dashed border-av-border py-5">
        <ShieldIcon size={30} className="text-av-muted" />
        <p className="m-0 mt-2 text-[12px] text-av-muted">Paying from your approved allowance</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border border-av-border py-2.5 text-[14px] font-medium text-av-text transition-colors hover:bg-av-band"
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex-1 rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Confirm booking
        </button>
      </div>
    </div>
  );
}
