// Approval focus (face check)
import Link from "next/link";
import type { ApprovalBooking } from "~~/types/autovoyage/plan";
import { formatUsd } from "~~/services/autovoyage/currency";
import { StatusPill } from "../ui/StatusPill";

export function ApprovalFocus({
  booking,
  cancelHref = "/plan",
  confirmHref = "/plan?booked=1",
}: {
  booking: ApprovalBooking;
  cancelHref?: string;
  confirmHref?: string;
}) {
  return (
    <div className="rounded border border-av-border bg-av-card">
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-14 text-center">
        <StatusPill tone="needs">Needs approval</StatusPill>
        <h1 className="mt-4 text-[24px] font-semibold text-av-text">Confirm this booking</h1>

        <div className="mt-6 w-full rounded bg-av-bg px-6 py-5">
          <p className="m-0 text-[14px] text-av-muted">
            {booking.name} · {booking.nights} nights
          </p>
          <p className="m-0 mt-1 text-[36px] font-bold tracking-[-0.02em] text-av-text">{formatUsd(booking.priceMinor)}</p>
          <p className="m-0 mt-1 text-[13px] font-medium text-av-amber">{booking.note}</p>
        </div>

        <div className="mt-6 flex aspect-square w-[240px] flex-col items-center justify-end gap-2 overflow-hidden rounded border-2 border-dashed border-av-blue/50 bg-av-blue-tint/40 pb-0">
          <span className="h-16 w-16 rounded-full bg-av-border/70" />
          <span className="h-20 w-32 rounded-t-full bg-av-border/70" />
        </div>
        <p className="mt-4 text-[15px] font-semibold text-av-text">Look at your camera to verify</p>
        <p className="m-0 mt-1 text-[13px] text-av-muted">privacy preserving liveness check</p>

        <div className="mt-6 flex w-full max-w-[420px] gap-3">
          <Link
            href={cancelHref}
            className="flex-1 rounded border border-av-border py-2.5 text-center text-[14px] font-medium text-av-text no-underline transition-colors hover:bg-av-bg"
          >
            Cancel
          </Link>
          <Link
            href={confirmHref}
            className="flex-1 rounded bg-av-blue py-2.5 text-center text-[14px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
          >
            Verify to confirm
          </Link>
        </div>
        <p className="mt-4 text-[12px] text-av-muted">This approval will be recorded on-chain</p>
      </div>
    </div>
  );
}
