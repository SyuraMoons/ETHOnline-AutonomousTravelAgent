"use client";

// Chat dossier card — the autonomous run's final report: the flight pair it chose (real, paid
// x402 data), an agent-authored day plan (free, explicitly NOT bookable), and one button to
// book every flight leg at once via /api/execute. Booking itself costs no HBAR:
// the searches bought the data, and the fare goes to the traveller's card.
import { useEffect, useState } from "react";
import type { TripDossier } from "@sh/contracts";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";
import { formatUsd } from "~~/services/autovoyage/currency";
import type { BookingResult } from "~~/types/autovoyage/plan";

function formatUsdMinor(minor: number, currency: string): string {
  return (minor / 100).toLocaleString("en-US", { style: "currency", currency });
}

export function ChatDossierCard({
  messageId,
  dossier,
  booking,
}: {
  messageId: string;
  dossier: TripDossier;
  booking?: BookingResult;
}) {
  const { bookAll, bookingPendingId } = usePlan();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const pendingThis = bookingPendingId === messageId;

  // Pre-fill from the saved profile so the passenger name/email required by /api/execute
  // doesn't have to be retyped for every booking — still editable per booking below.
  useEffect(() => {
    fetch("/api/profile")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        if (data.fullName) setName(current => current || data.fullName);
        if (data.email) setEmail(current => current || data.email);
      })
      .catch(() => {});
  }, []);

  const legsLabel = dossier.option.legs
    .map(l => `${l.airline} ${l.flightNumber} · ${l.origin} → ${l.destination}`)
    .join("  ·  ");
  const legCount = dossier.option.legs.length;
  const alreadyBooked = booking && booking.status !== "refused";

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-3 rounded border border-av-border bg-av-card px-4 py-4">
      <div>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-av-muted">Trip report</p>
        <p className="m-0 mt-1 text-[15px] font-semibold text-av-text">{legsLabel}</p>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          Fare total {formatUsdMinor(dossier.fareTotalMinor, dossier.currency)} · {dossier.trip.paxCount} traveller
          {dossier.trip.paxCount === 1 ? "" : "s"}
        </p>
      </div>

      {dossier.searchSpend.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[11px] font-medium text-av-muted">x402 spend so far</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {dossier.searchSpend.map((s, i) => (
              <a key={i} href={s.hashscanUrl} target="_blank" rel="noreferrer" className="text-[12px] text-av-blue">
                {s.amountHbar} HBAR ↗
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {dossier.days.length > 0 ? (
        <div>
          <p className="m-0 text-[11px] font-medium text-av-amber">Suggested day plan — ideas only, not bookable</p>
          <div className="mt-1.5 flex flex-col gap-2">
            {dossier.days.map(day => (
              <div key={day.dayNumber} className="rounded bg-av-bg px-3 py-2">
                <p className="m-0 text-[13px] font-semibold text-av-text">
                  Day {day.dayNumber} · {day.title}
                </p>
                {day.notes ? <p className="m-0 mt-0.5 text-[12px] text-av-muted">{day.notes}</p> : null}
                {day.suggestions.length > 0 ? (
                  <ul className="m-0 mt-1 list-disc pl-4 text-[12px] text-av-muted">
                    {day.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!dossier.bookable ? (
        <p className="m-0 text-[12px] text-av-amber">
          {dossier.notBookableReason ?? "This offer isn't in the supplier's real inventory and can't be booked."}
        </p>
      ) : null}

      {alreadyBooked ? (
        <div className="rounded bg-av-bg px-3 py-3">
          <p className="m-0 text-[13px] font-semibold text-av-green">
            {booking.status === "booked" ? "Booked" : "Partially booked"} · {booking.totalHbarPaid} HBAR paid
          </p>
          {booking.bookings.map((b, i) => (
            <a
              key={i}
              href={b.hashscanUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-[12px] text-av-blue"
            >
              {b.confirmationCode ?? b.bookingId} ↗
            </a>
          ))}
          {booking.message ? <p className="m-0 mt-1 text-[12px] text-av-amber">{booking.message}</p> : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!dossier.bookable}
              className="rounded border border-av-border bg-av-bg px-2.5 py-1.5 text-[13px] text-av-text disabled:opacity-60"
            />
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={!dossier.bookable}
              className="rounded border border-av-border bg-av-bg px-2.5 py-1.5 text-[13px] text-av-text disabled:opacity-60"
            />
          </div>
          {booking?.status === "refused" && booking.message ? (
            <p className="m-0 text-[12px] text-av-amber">{booking.message}</p>
          ) : null}
          <button
            type="button"
            disabled={!dossier.bookable || pendingThis || !name.trim() || !email.trim()}
            onClick={() => void bookAll(messageId, dossier, { name: name.trim(), email: email.trim() })}
            className="rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingThis
              ? "Booking…"
              : `Book everything · ${legCount} leg${legCount === 1 ? "" : "s"} · ${formatUsd(dossier.fareTotalMinor)} to your card`}
          </button>
        </>
      )}
    </div>
  );
}
