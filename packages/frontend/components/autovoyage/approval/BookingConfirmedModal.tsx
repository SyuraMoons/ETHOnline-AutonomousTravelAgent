// Booking confirmed modal
"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Booking } from "~~/types/autovoyage/plan";
import { formatUsd } from "~~/services/autovoyage/currency";
import { useBeat } from "~~/hooks/autovoyage/useBeat";
import { OnChainProof } from "../ui/OnChainProof";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-av-muted">{label}</span>
      <span className="font-medium text-av-text">{value}</span>
    </div>
  );
}

export function BookingConfirmedModal({ booking }: { booking: Booking }) {
  const ref = useRef<HTMLDivElement>(null);
  useBeat(ref, (gsap, el) => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(el, { scale: 0.98, duration: 0.3, transformOrigin: "center" }, 0);
    tl.from(el.querySelector("[data-chip]"), { scale: 0.8, opacity: 0, duration: 0.35 }, 0.05);
    tl.from(el.querySelectorAll("[data-row]"), { y: 8, opacity: 0, duration: 0.3, stagger: 0.06 }, 0.12);
    return tl;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-av-ink/40 px-4">
      <div ref={ref} className="beat w-full max-w-[520px] rounded-lg border border-av-border bg-av-card p-8">
        <div className="text-center">
          <span
            data-chip
            className="inline-flex items-center gap-1.5 rounded bg-av-green/10 px-2 py-1 text-[11px] font-medium text-av-green"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-av-green" />
            Booking confirmed
          </span>
          <h2 className="mt-3 text-[24px] font-semibold text-av-text">Your trip to {booking.destination} is booked</h2>
          <p className="m-0 mt-1 text-[13px] text-av-muted">
            {booking.dates} · {booking.nights} nights · {booking.travelers} travelers
          </p>
        </div>

        <div data-row className="mt-5 rounded bg-av-bg p-4 text-[13px]">
          <SummaryRow label="Flight" value={booking.summary.flight} />
          <SummaryRow label="Hotel" value={booking.summary.hotel} />
          <SummaryRow label="Activities" value={booking.summary.activities} />
          <div className="mt-2 flex items-center justify-between border-t border-av-border pt-2">
            <span className="font-semibold text-av-text">Total paid</span>
            <span className="font-semibold text-av-text">{formatUsd(booking.totalMinor)}</span>
          </div>
        </div>

        <div data-row className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-av-muted">Booking reference</span>
          <span className="font-mono text-[12px] text-av-text">{booking.reference}</span>
        </div>

        <div data-row className="mt-3">
          <OnChainProof proof={booking.proof} />
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/plan"
            className="flex-1 rounded border border-av-border py-2.5 text-center text-[14px] font-medium text-av-text no-underline transition-colors hover:bg-av-bg"
          >
            Done
          </Link>
          <Link
            href="/itinerary"
            className="flex-1 rounded bg-av-blue py-2.5 text-center text-[14px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
          >
            View itinerary
          </Link>
        </div>
      </div>
    </div>
  );
}
