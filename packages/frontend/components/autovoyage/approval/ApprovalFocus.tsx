// Approval focus (booking confirm)
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusPill } from "../ui/StatusPill";
import { useBeat } from "~~/hooks/autovoyage/useBeat";
import { useAuthorization } from "~~/services/autovoyage/authorizationContext";
import { initiateConsent, verifyConsent } from "~~/services/autovoyage/consentClient";
import { formatUsd } from "~~/services/autovoyage/currency";

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

// Approval focus (booking confirm)

/** What ApprovalFocus confirms — either a real FlightOption (itineraryHash computed
 * server-side by /api/plan) or a fixture booking (hashed client-side as a stand-in;
 * see the `hashBooking` fallback below and AGENTS.md "Itinerary hash" — never accept a
 * client-computed hash server-side for anything that pays). */
export type ApprovalSubject = {
  title: string;
  subtitle: string;
  priceMinor: number;
  currency?: string;
  note?: string;
  itineraryHash?: string;
  /** Correlates the resulting HumanApproval audit event with the plan's DataPayment events. */
  planId?: string;
};

async function hashBooking(subject: ApprovalSubject): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(subject));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

type VerifyStatus = "preparing" | "ready" | "confirming" | "verified" | "error";

export function ApprovalFocus({
  subject,
  cancelHref = "/plan",
  onCancel,
  onConfirmed,
}: {
  subject: ApprovalSubject;
  cancelHref?: string;
  /** When set, Cancel calls this instead of navigating via `cancelHref` — for an
   * in-thread overlay (like /chat's) where cancelling just clears the selection. */
  onCancel?: () => void;
  onConfirmed?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { mandateId, mandate } = useAuthorization();

  const [itineraryHash, setItineraryHash] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerifyStatus>("preparing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useBeat(ref, (gsap, el) => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(el.querySelector("[data-emph]"), { scale: 0.96, opacity: 0, duration: 0.5, transformOrigin: "center" }, 0);
    tl.from(el.querySelector("[data-camera]"), { scale: 0.95, opacity: 0, duration: 0.5 }, 0.1);
    return tl;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = subject.itineraryHash ?? (await hashBooking(subject));
      const data = await initiateConsent(hash, subject.planId);
      if (cancelled) return;
      setItineraryHash(data.itineraryHash);
      setSessionId(data.sessionId);
      setStatus("ready");
    })().catch(() => {
      if (!cancelled) {
        setStatus("error");
        setErrorMessage("Could not start confirmation. Try again.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmBooking() {
    if (status !== "ready" || !sessionId || !itineraryHash) return;
    setStatus("confirming");
    try {
      await verifyConsent({ sessionId, itineraryHash, mandateId: mandateId ?? undefined, planId: subject.planId });
      setStatus("verified");
      onConfirmed?.();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Confirmation failed");
    }
  }

  const verified = status === "verified";

  return (
    <div ref={ref} className="beat rounded border border-av-border bg-av-card">
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-14 text-center">
        <StatusPill tone={verified ? "approved" : "needs"}>{verified ? "Approved" : "Needs approval"}</StatusPill>
        <h1 className="mt-4 text-[24px] font-semibold text-av-text">Confirm this booking</h1>

        <div data-emph className="mt-6 w-full rounded bg-av-bg px-6 py-5">
          <p className="m-0 text-[14px] text-av-muted">
            {subject.title} · {subject.subtitle}
          </p>
          <p className="m-0 mt-1 text-[36px] font-bold tracking-[-0.02em] text-av-text">
            {subject.currency
              ? (subject.priceMinor / 100).toLocaleString("en-US", { style: "currency", currency: subject.currency })
              : formatUsd(subject.priceMinor)}
          </p>
          {subject.note ? <p className="m-0 mt-1 text-[13px] font-medium text-av-amber">{subject.note}</p> : null}
        </div>

        <div
          data-camera
          className="mt-6 flex w-full flex-col items-start gap-2 rounded border border-av-border bg-av-bg px-5 py-4 text-left"
        >
          <span className="text-[12px] uppercase tracking-[0.08em] text-av-muted">Paying from</span>
          <span className="font-mono text-[13px] text-av-text">
            {mandate?.payerAccountId ?? "your connected account"}
          </span>
          {mandate && (
            <span className="text-[12px] text-av-muted">
              {mandate.remainingHbar.toFixed(2)} HBAR remaining on this trip budget
            </span>
          )}
        </div>

        {verified ? (
          <p className="mt-4 text-[15px] font-semibold text-av-green">
            Confirmed — not yet booked. Execution isn&apos;t wired up yet; this only verified your consent.
          </p>
        ) : (
          <p className="mt-4 text-[15px] font-semibold text-av-text">Review the details above, then confirm</p>
        )}
        {status === "error" && <p className="m-0 mt-2 text-[13px] text-av-amber">{errorMessage}</p>}

        <div className="mt-6 flex w-full max-w-[420px] gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded border border-av-border py-2.5 text-center text-[14px] font-medium text-av-text transition-colors hover:bg-av-bg"
            >
              Cancel
            </button>
          ) : (
            <Link
              href={cancelHref}
              className="flex-1 rounded border border-av-border py-2.5 text-center text-[14px] font-medium text-av-text no-underline transition-colors hover:bg-av-bg"
            >
              Cancel
            </Link>
          )}
          <button
            type="button"
            onClick={confirmBooking}
            disabled={verified || status === "preparing" || status === "confirming"}
            className="flex-1 rounded bg-av-blue py-2.5 text-center text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verified ? "Confirmed" : status === "confirming" ? "Confirming…" : "Confirm booking"}
          </button>
        </div>
        <p className="mt-4 text-[12px] text-av-muted">This approval will be recorded on-chain</p>
      </div>
    </div>
  );
}
