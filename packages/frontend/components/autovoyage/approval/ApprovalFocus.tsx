// Approval focus (face check)
"use client";

import { useRef } from "react";
import Link from "next/link";
import { StatusPill } from "../ui/StatusPill";
import { useBeat } from "~~/hooks/autovoyage/useBeat";
import { formatUsd } from "~~/services/autovoyage/currency";
import type { ApprovalBooking } from "~~/types/autovoyage/plan";

// Approval focus (face check)

export function ApprovalFocus({
  booking,
  cancelHref = "/plan",
  confirmHref = "/plan?booked=1",
}: {
  booking: ApprovalBooking;
  cancelHref?: string;
  confirmHref?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useBeat(ref, (gsap, el) => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(el.querySelector("[data-emph]"), { scale: 0.96, opacity: 0, duration: 0.5, transformOrigin: "center" }, 0);
    tl.from(el.querySelector("[data-camera]"), { scale: 0.95, opacity: 0, duration: 0.5 }, 0.1);
    return tl;
  });

  return (
    <div ref={ref} className="beat rounded border border-av-border bg-av-card">
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-14 text-center">
        <StatusPill tone="needs">Needs approval</StatusPill>
        <h1 className="mt-4 text-[24px] font-semibold text-av-text">Confirm this booking</h1>

        <div data-emph className="mt-6 w-full rounded bg-av-bg px-6 py-5">
          <p className="m-0 text-[14px] text-av-muted">
            {booking.name} · {booking.nights} nights
          </p>
          <p className="m-0 mt-1 text-[36px] font-bold tracking-[-0.02em] text-av-text">
            {formatUsd(booking.priceMinor)}
          </p>
          <p className="m-0 mt-1 text-[13px] font-medium text-av-amber">{booking.note}</p>
        </div>

        <div
          data-camera
          className="mt-6 flex aspect-square w-[240px] flex-col items-center justify-end gap-2 overflow-hidden rounded border-2 border-dashed border-av-blue/50 bg-av-blue-tint/40 pb-0"
        >
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
