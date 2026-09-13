"use client";

// The whole /plan workspace runs off this one context.
//
// Both ways into a plan — typing a brief in the agent rail, and submitting the
// search form — funnel through `post()` and hit POST /api/plan. Keeping a single
// fetch here is the point: the rail and the form must never drift into two
// different notions of what "the current trip" is.
//
// A free-text brief (sendBrief) now runs the AUTONOMOUS multi-step loop
// (POST /api/agent/run, streamed) instead of the old one-shot /api/plan call — the agent
// searches both directions, drafts a day plan, and reports a TripDossier on its own. The
// structured search form (submitSearch) is unchanged and still goes through post()/`/api/plan`
// directly, since it already has everything the model would otherwise have to extract from
// free text.
//
// Stage transitions are driven by the agent turn, not by the UI:
//   kind:"chat" -> stay on "search" (the agent still needs a detail)
//   kind:"plan" -> "results"        (it searched, here are the options)
//   selectOption -> "plan"          (you picked; build the itinerary around it)
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ExecuteResponse, FlightOption, Plan, TripDossier } from "@sh/contracts";
import { useAuthorization } from "~~/services/autovoyage/authorizationContext";
import type { RunEvent } from "~~/services/autovoyage/autonomousRun";
import { initiateConsent, verifyConsent } from "~~/services/autovoyage/consentClient";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import type { BookingResult, ChatMessage, PlanStage, SearchQuery } from "~~/types/autovoyage/plan";

type TurnMessage = { role: "user" | "assistant"; content: string };

type PlanTrip = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  paxCount: number;
  cabin?: string;
};

type PaymentLeg = { amountHbar: string; transaction: string; hashscanUrl: string };

type SearchPayment = {
  amountHbar: string;
  supplier: string;
  payTo: string;
  resultCount: number;
  quoteId: string;
  transaction: string;
  hashscanUrl: string;
  outbound: PaymentLeg;
  inbound?: PaymentLeg;
};

// Local mirror of app/api/plan/route.ts's response shape — that route is the
// source of truth; keep this in sync by hand rather than sharing a type,
// since the route also emits the LLM-only `kind: "chat"` arm this client
// doesn't otherwise need to import from a server module.
type PlanResponse =
  | { kind: "chat"; reply: string }
  | { kind: "refusal"; reply: string; reason: string; detail?: string; trip: PlanTrip }
  | {
      kind: "plan";
      reply: string;
      trip: PlanTrip;
      plan: Plan;
      options: FlightOption[];
      payment: SearchPayment;
    };

const HISTORY_LIMIT = 10;

/** Mirrors app/api/plan/route.ts's refusalReply() mandate_expired copy, for the local
 * pre-flight check that never round-trips to the server. */
function budgetReasonNote(detail?: string): string {
  switch (detail) {
    case "not_found":
      return "I don't have an active budget for this session anymore — let's set a new one.";
    case "revoked":
      return "Your spending allowance was revoked. Set a new budget and approve a fresh allowance.";
    case "exhausted":
      return "The spending mandate is used up. Set a new budget to keep going.";
    case "ttl_expired":
      return "Your spending window ran out. Set a fresh budget and I'll pick up where we left off.";
    default:
      return "I need your authorization before I can spend anything. Set a trip budget and approve the allowance, and I'll take it from there.";
  }
}

/** The x402 receipt line shown under the results — makes the "agent pays as it goes"
 * story visible instead of leaving the payment implicit in state. */
function receiptLine(payment: SearchPayment): string {
  const legs = [`${payment.outbound.amountHbar} HBAR (${payment.outbound.hashscanUrl})`];
  if (payment.inbound) legs.push(`${payment.inbound.amountHbar} HBAR (${payment.inbound.hashscanUrl})`);
  return `Paid ${payment.amountHbar} HBAR to ${payment.payTo} for this search — ${legs.join(" + ")}`;
}

function toBookingResult(data: ExecuteResponse): BookingResult {
  return {
    status: data.status,
    bookings: data.bookings.map(b => ({
      offerId: b.offerId,
      bookingId: b.bookingId,
      confirmationCode: b.confirmationCode,
      amountHbar: b.amountHbar,
      hashscanUrl: b.hashscanUrl,
    })),
    totalHbarPaid: data.totalHbarPaid,
    message: data.refusal?.message ?? data.failed?.reason,
  };
}

type PlanContextValue = {
  stage: PlanStage;
  trip: PlanTrip | null;
  options: FlightOption[];
  selected: FlightOption | null;
  payment: SearchPayment | null;
  planId: string | null;
  messages: ChatMessage[];
  pending: boolean;
  bookingPendingId: string | null;
  sendBrief: (text: string) => Promise<void>;
  submitSearch: (query: SearchQuery) => Promise<void>;
  selectOption: (optionId: string) => void;
  backToResults: () => void;
  clearSelection: () => void;
  bookAll: (messageId: string, dossier: TripDossier) => Promise<void>;
  threadId: string | null;
  switchThread: (id: string) => Promise<void>;
  startNewThread: () => void;
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside <PlanProvider>");
  return ctx;
}

/** The sentence the search form hands the agent, so the rail reads like a conversation. */
function briefFromQuery(q: SearchQuery): string {
  const pax = `${q.paxCount} traveller${q.paxCount === 1 ? "" : "s"}`;
  const dates =
    q.tripType === "return" && q.returnDate
      ? `departing ${q.departDate}, returning ${q.returnDate}`
      : `departing ${q.departDate}`;
  const kind = q.tripType === "return" ? "return flight" : "one-way flight";
  return `Find a ${kind} from ${q.origin} to ${q.destination}, ${dates}, for ${pax} in ${q.cabin}.`;
}

function tripFromQuery(q: SearchQuery): PlanTrip {
  return {
    origin: q.origin,
    destination: q.destination,
    departDate: q.departDate,
    returnDate: q.tripType === "return" && q.returnDate ? q.returnDate : undefined,
    paxCount: q.paxCount,
    cabin: q.cabin,
  };
}

export function PlanProvider({ initialMessages, children }: { initialMessages: ChatMessage[]; children: ReactNode }) {
  const [stage, setStage] = useState<PlanStage>("search");
  const [trip, setTrip] = useState<PlanTrip | null>(null);
  const [options, setOptions] = useState<FlightOption[]>([]);
  const [selected, setSelected] = useState<FlightOption | null>(null);
  const [payment, setPayment] = useState<SearchPayment | null>(null);
  // The planId POST /api/plan minted for the current results — carried into the confirm overlay
  // so the eventual HumanApproval audit event correlates with this plan's DataPayment events.
  const [planId, setPlanId] = useState<string | null>(null);

  // Bubbles shown in the rail and the full-screen chat — both read from this one list, seeded
  // with the fixture demo content.
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // The conversation actually exchanged with the model — kept separate, since
  // the seeded fixture messages are things the agent never said.
  const [turns, setTurns] = useState<TurnMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [bookingPendingId, setBookingPendingId] = useState<string | null>(null);

  // The spending authority granted in the authorize flow; null until the user has verified
  // set a budget and approved an allowance.
  const { stage: authStage, agent: authAgent, mandateId, refreshMandate } = useAuthorization();

  // The brief that was refused for want of authorization, held so it can be replayed the
  // moment the user finishes authorizing. Without this the agent goes silent after the
  // approval and the user has to retype what they already asked for. `trip` set means it came
  // from submitSearch (replay via post()); unset means it came from sendBrief (replay via
  // runAutonomous()).
  const [blockedBrief, setBlockedBrief] = useState<{ text: string; trip?: PlanTrip; awaitingAuth?: boolean } | null>(
    null,
  );

  // Server-side session persistence: refreshing the page (or restarting the server) used to
  // lose the whole conversation and any in-flight plan/results. threadId is null until either
  // an existing thread is found for this wallet, or a new one is created on first save.
  const { accountId } = useHederaWalletConnect();
  const [threadId, setThreadId] = useState<string | null>(null);
  // Gates the save effect below until hydration has actually run (or been skipped for lack of
  // a connected wallet) — otherwise the very first render would immediately overwrite a
  // wallet's saved thread with the empty/fixture initial state.
  const [hydrated, setHydrated] = useState(false);
  const savedAccountRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accountId || savedAccountRef.current === accountId) return;
    savedAccountRef.current = accountId;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/threads?payerAccountId=${encodeURIComponent(accountId)}`);
        if (cancelled) return;
        if (res.ok) {
          const thread = (await res.json()) as {
            threadId: string;
            messages: ChatMessage[];
            stage: PlanStage | null;
            trip: PlanTrip | null;
            options: FlightOption[] | null;
            selected: FlightOption | null;
            payment: SearchPayment | null;
          };
          setThreadId(thread.threadId);
          if (thread.messages.length > 0) setMessages(thread.messages);
          if (thread.stage) setStage(thread.stage);
          if (thread.trip) setTrip(thread.trip);
          if (thread.options) setOptions(thread.options);
          if (thread.selected) setSelected(thread.selected);
          if (thread.payment) setPayment(thread.payment);
        }
        // A 404 means this wallet has no saved thread yet — one is created lazily on first save.
      } catch {
        // Offline/unreachable: fall back to the in-memory fixture state rather than blocking the UI.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Debounced whole-snapshot save — see services/autovoyage/chatThreads.ts for why this writes
  // the complete session rather than appending individual messages.
  useEffect(() => {
    if (!hydrated || !accountId) return;
    const timer = setTimeout(() => {
      (async () => {
        try {
          let id = threadId;
          if (!id) {
            const res = await fetch("/api/threads", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ payerAccountId: accountId }),
            });
            if (!res.ok) return;
            const created = (await res.json()) as { threadId: string };
            id = created.threadId;
            setThreadId(id);
          }
          await fetch(`/api/threads/${id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payerAccountId: accountId, messages, stage, trip, options, selected, payment }),
          });
        } catch {
          // Best-effort — a failed save just means the next refresh replays from the last
          // successful snapshot, not a broken session right now.
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadId is read, not a trigger; including it would re-save on the POST-created id, which is harmless but redundant
  }, [hydrated, accountId, messages, stage, trip, options, selected, payment]);

  // True exactly while a wallet is connected but we don't yet know if it's authorized — waiting
  // on /api/agent, or the resume-on-load mandate/allowance check itself. Distinguishing this from
  // a genuine "idle" (checked, not authorized) is what stops the nudge below from flashing in
  // ahead of a valid mandate that just hasn't finished reconciling yet.
  const authPending = Boolean(accountId) && (authStage === "resuming" || (authStage === "idle" && !authAgent));

  // Tracks whether the currently-shown budget nudge is the one this effect injected, so the
  // authorized-branch below only clears a nudge it put there itself, never real conversation.
  const nudgeInjectedRef = useRef(false);

  // First-run seed: nudge straight into the budget card before the user has to hit a refusal.
  // Suppressed while `authPending` so a wallet with a valid mandate never flashes this message
  // during the resume-on-load check; cleared once authorization resolves, so it never gets stuck
  // showing after the mandate is actually confirmed.
  useEffect(() => {
    if (authPending) return;
    if (authStage === "authorized") {
      if (nudgeInjectedRef.current) {
        setMessages(prev => (prev.length === 1 && prev[0]?.budgetRequest ? [] : prev));
        nudgeInjectedRef.current = false;
      }
      return;
    }
    setMessages(prev => {
      if (prev.length === 0) {
        nudgeInjectedRef.current = true;
        return [{ from: "agent", budgetRequest: {} }];
      }
      return prev;
    });
  }, [authStage, authPending]);

  // Authorization ended (revoked, or the wallet disconnected) — drop any held brief so it can't
  // fire later against a mandate the user has since replaced.
  useEffect(() => {
    if (authStage === "idle") setBlockedBrief(null);
  }, [authStage]);

  const post = useCallback(
    // `replay` re-runs a brief that was already shown and already recorded in `turns` — the
    // authorization retry. Echoing the user's bubble a second time would make it look like they
    // asked twice.
    async (text: string, structuredTrip?: PlanTrip, replay = false) => {
      const history = replay
        ? turns.slice(-HISTORY_LIMIT)
        : [...turns, { role: "user" as const, content: text }].slice(-HISTORY_LIMIT);
      if (!replay) {
        setMessages(prev => [...prev, { from: "user", text }]);
        setTurns(history);
      }
      setPending(true);

      try {
        if (!replay && authPending) {
          // Authorization is still resolving (resume-on-load reconciling the mandate against
          // the live allowance) — queue rather than flash a false "not authorized" nudge at an
          // already-authorized wallet. `pending` stays true; the effect below resolves this
          // once authPending clears, either by replaying it (authorized) or nudging (not).
          setBlockedBrief({ text, trip: structuredTrip, awaitingAuth: true });
          return;
        }

        // Pre-empt: no authorization at all yet — skip the round trip entirely rather than
        // let the server's consent_missing refusal do the same work over the network. This is
        // what turns the auto-run landing brief straight into the budget card, instantly.
        if (!replay && authStage !== "authorized") {
          setMessages(prev => [...prev, { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(undefined) } }]);
          setBlockedBrief({ text, trip: structuredTrip });
          setPending(false);
          return;
        }

        // Pre-flight: if we think we're authorized, confirm the mandate is still good before
        // spending anything on a round trip that would only fail server-side anyway.
        if (mandateId) {
          const fresh = await refreshMandate();
          const invalid = !fresh || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() <= Date.now();
          if (invalid) {
            const detail = !fresh
              ? "not_found"
              : fresh.status === "exhausted"
                ? "exhausted"
                : fresh.status !== "active"
                  ? "revoked"
                  : "ttl_expired";
            setMessages(prev => [...prev, { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(detail) } }]);
            // Only auto-arm a retry for a first attempt — a replay that fails again for the
            // same persistent reason would otherwise re-trigger the replay effect immediately,
            // looping silently instead of waiting for the user to act again.
            if (!replay) setBlockedBrief({ text, trip: structuredTrip });
            setPending(false);
            return;
          }
        }

        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // mandateId is the agent's authority to spend. Without it /api/plan refuses with
          // consent_missing rather than spending unauthorized.
          body: JSON.stringify({
            messages: history,
            ...(structuredTrip ? { trip: structuredTrip } : {}),
            ...(mandateId ? { mandateId } : {}),
          }),
        });
        const data: PlanResponse & { message?: string } = await res.json();
        if (!res.ok) throw new Error(data?.message ?? "Something went wrong");

        setMessages(prev => [...prev, { from: "agent", text: data.reply }]);
        setTurns(prev => [...prev, { role: "assistant" as const, content: data.reply }].slice(-HISTORY_LIMIT));

        if (data.kind === "plan") {
          setTrip(data.trip);
          setOptions(data.options);
          setPayment(data.payment);
          setPlanId(data.plan.planId);
          setSelected(null);
          setStage("results");
          setMessages(prev => [...prev, { from: "agent", results: data.options }]);
          setMessages(prev => [...prev, { from: "agent", text: receiptLine(data.payment) }]);
          // Spend just happened — pull the updated ceiling so the UI reflects it.
          void refreshMandate();
        } else if (
          data.kind === "refusal" &&
          (data.reason === "consent_missing" || data.reason === "mandate_expired")
        ) {
          setMessages(prev => [
            ...prev,
            { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(data.detail) } },
          ]);
          // Same anti-loop guard as the pre-flight branch above.
          if (!replay) setBlockedBrief({ text, trip: structuredTrip });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setMessages(prev => [...prev, { from: "agent", text: `I couldn't plan that: ${message}` }]);
      } finally {
        setPending(false);
      }
    },
    [turns, authStage, authPending, mandateId, refreshMandate],
  );

  const runAutonomous = useCallback(
    async (text: string, replay = false) => {
      const history = replay
        ? turns.slice(-HISTORY_LIMIT)
        : [...turns, { role: "user" as const, content: text }].slice(-HISTORY_LIMIT);
      if (!replay) {
        setMessages(prev => [...prev, { from: "user", text }]);
        setTurns(history);
      }
      setPending(true);

      try {
        if (!replay && authPending) {
          setBlockedBrief({ text, awaitingAuth: true });
          return;
        }

        if (!replay && authStage !== "authorized") {
          setMessages(prev => [...prev, { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(undefined) } }]);
          setBlockedBrief({ text });
          setPending(false);
          return;
        }

        if (mandateId) {
          const fresh = await refreshMandate();
          const invalid = !fresh || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() <= Date.now();
          if (invalid) {
            const detail = !fresh
              ? "not_found"
              : fresh.status === "exhausted"
                ? "exhausted"
                : fresh.status !== "active"
                  ? "revoked"
                  : "ttl_expired";
            setMessages(prev => [...prev, { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(detail) } }]);
            if (!replay) setBlockedBrief({ text });
            setPending(false);
            return;
          }
        }

        const messageId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: messageId, from: "agent", steps: [] }]);

        const updateMessage = (updater: (m: ChatMessage) => ChatMessage) => {
          setMessages(prev => prev.map(m => (m.id === messageId ? updater(m) : m)));
        };

        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: text, ...(mandateId ? { mandateId } : {}) }),
        });
        if (!res.ok || !res.body) throw new Error("Something went wrong");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (event: RunEvent) => {
          if (event.type === "step") {
            updateMessage(m => {
              const steps = m.steps ?? [];
              const idx = steps.findIndex(s => s.id === event.step.id);
              const nextSteps = idx >= 0 ? steps.map((s, i) => (i === idx ? event.step : s)) : [...steps, event.step];
              return { ...m, steps: nextSteps };
            });
          } else if (event.type === "payment") {
            void refreshMandate();
          } else if (event.type === "dossier") {
            updateMessage(m => ({ ...m, dossier: event.dossier }));
            void refreshMandate();
          } else if (event.type === "chat") {
            updateMessage(m => ({ ...m, text: event.reply }));
            setTurns(prev => [...prev, { role: "assistant" as const, content: event.reply }].slice(-HISTORY_LIMIT));
          } else if (event.type === "refusal") {
            updateMessage(m => ({ ...m, text: event.reply }));
            if (event.reason === "consent_missing" || event.reason === "mandate_expired") {
              setMessages(prev => [
                ...prev,
                { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(event.detail) } },
              ]);
              if (!replay) setBlockedBrief({ text });
            }
          } else if (event.type === "error") {
            updateMessage(m => ({ ...m, text: `I couldn't plan that: ${event.message}` }));
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find(l => l.startsWith("data: "));
            if (!line) continue;
            handleEvent(JSON.parse(line.slice(6)) as RunEvent);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setMessages(prev => [...prev, { from: "agent", text: `I couldn't plan that: ${message}` }]);
      } finally {
        setPending(false);
      }
    },
    [turns, authStage, authPending, mandateId, refreshMandate],
  );

  // The payoff of the whole authorize flow: the moment the allowance lands, pick the refused
  // brief back up on the user's behalf.
  //
  // Strictly conditional on a non-null `blockedBrief`, which is per-provider state. That matters
  // because /approve mounts a second PlanProvider nested inside the layout's, both sharing this
  // one auth context — an unconditional "authorized, so post" branch would fire in both and buy
  // the flight data twice. Only the instance that actually recorded the refusal replays it.
  useEffect(() => {
    if (authStage !== "authorized" || !mandateId || !blockedBrief || pending) return;
    const brief = blockedBrief;
    setBlockedBrief(null);
    if (brief.trip) void post(brief.text, brief.trip, true);
    else void runAutonomous(brief.text, true);
  }, [authStage, mandateId, blockedBrief, pending, post, runAutonomous]);

  // A brief submitted while authorization was still resolving (authPending) was queued above
  // rather than shown a false nudge. Once resolution lands: if it turned out authorized, the
  // replay effect above already handles it (it doesn't care about `awaitingAuth`). If it
  // resolved to anything else, only now do we know for sure there's no authorization — show
  // the nudge for real.
  useEffect(() => {
    if (authPending || !blockedBrief?.awaitingAuth || authStage === "authorized") return;
    setMessages(prev => [...prev, { from: "agent", budgetRequest: { reasonNote: budgetReasonNote(undefined) } }]);
    setBlockedBrief(prev => (prev ? { ...prev, awaitingAuth: false } : prev));
    setPending(false);
  }, [authPending, authStage, blockedBrief]);

  const sendBrief = useCallback(
    async (text: string) => {
      const brief = text.trim();
      if (!brief || pending) return;
      await runAutonomous(brief);
    },
    [pending, runAutonomous],
  );

  const submitSearch = useCallback(
    async (query: SearchQuery) => {
      if (pending) return;
      await post(briefFromQuery(query), tripFromQuery(query));
    },
    [pending, post],
  );

  const selectOption = useCallback(
    (optionId: string) => {
      const option = options.find(o => o.optionId === optionId);
      if (!option) return;

      setSelected(option);
      setStage("plan");

      const airline = option.legs[0]?.airline ?? "that flight";
      const total = (option.totalMinor / 100).toLocaleString("en-US", { style: "currency", currency: option.currency });
      setMessages(prev => [
        ...prev,
        { from: "agent", text: `Locked in ${airline} at ${total}. Building the rest of the trip around it now.` },
      ]);
    },
    [options],
  );

  const backToResults = useCallback(() => {
    if (options.length > 0) setStage("results");
  }, [options.length]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    if (options.length > 0) setStage("results");
  }, [options.length]);

  const bookAll = useCallback(
    // No passenger argument: /api/execute resolves the traveller from the signed-in
    // session's own profile, so nothing here can name someone else.
    async (messageId: string, dossier: TripDossier) => {
      if (!mandateId) return;
      setBookingPendingId(messageId);
      try {
        const { sessionId, itineraryHash } = await initiateConsent(dossier.itineraryHash, mandateId, dossier.dossierId);
        const executionToken = await verifyConsent({ sessionId, itineraryHash, mandateId, planId: dossier.dossierId });
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierId: dossier.dossierId, executionToken, mandateId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          const detail = typeof body?.error === "string" ? body.error : null;
          throw new Error(detail ?? "Booking request was rejected.");
        }
        const data = (await res.json()) as ExecuteResponse;
        setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, booking: toBookingResult(data) } : m)));
        void refreshMandate();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Booking failed";
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId
              ? { ...m, booking: { status: "refused" as const, bookings: [], totalHbarPaid: "0.0000", message } }
              : m,
          ),
        );
      } finally {
        setBookingPendingId(null);
      }
    },
    [mandateId, refreshMandate],
  );

  // Chat history: switching into a past thread, or starting a fresh one. Both just replace the
  // in-memory state the hydration/save effects above already react to — switching reuses the
  // same per-field shape the hydration fetch applies on mount; starting fresh clears threadId so
  // the debounced save effect lazily POSTs a brand-new row on the next change, exactly like a
  // first-ever visit.
  const switchThread = useCallback(
    async (id: string) => {
      if (!accountId) return;
      const res = await fetch(`/api/threads/${id}?payerAccountId=${encodeURIComponent(accountId)}`);
      if (!res.ok) return;
      const thread = (await res.json()) as {
        threadId: string;
        messages: ChatMessage[];
        stage: PlanStage | null;
        trip: PlanTrip | null;
        options: FlightOption[] | null;
        selected: FlightOption | null;
        payment: SearchPayment | null;
      };
      setThreadId(thread.threadId);
      setMessages(thread.messages);
      setStage(thread.stage ?? "search");
      setTrip(thread.trip ?? null);
      setOptions(thread.options ?? []);
      setSelected(thread.selected ?? null);
      setPayment(thread.payment ?? null);
      // Not persisted in chat_threads — a restored thread's plan predates this field.
      setPlanId(null);
      setTurns([]);
      setBlockedBrief(null);
    },
    [accountId],
  );

  const startNewThread = useCallback(() => {
    setThreadId(null);
    if (authPending) {
      // Don't know yet whether this wallet is authorized — leave it empty and let the seed
      // effect above inject the right thing once the resume check resolves.
      setMessages([]);
    } else if (authStage === "authorized") {
      nudgeInjectedRef.current = false;
      setMessages([]);
    } else {
      nudgeInjectedRef.current = true;
      setMessages([{ from: "agent", budgetRequest: {} }]);
    }
    setStage("search");
    setTrip(null);
    setOptions([]);
    setSelected(null);
    setPayment(null);
    setPlanId(null);
    setTurns([]);
    setBlockedBrief(null);
  }, [authStage, authPending]);

  const value = useMemo(
    () => ({
      stage,
      trip,
      options,
      selected,
      payment,
      planId,
      messages,
      pending,
      bookingPendingId,
      sendBrief,
      submitSearch,
      selectOption,
      backToResults,
      clearSelection,
      bookAll,
      threadId,
      switchThread,
      startNewThread,
    }),
    [
      stage,
      trip,
      options,
      selected,
      payment,
      planId,
      messages,
      pending,
      bookingPendingId,
      sendBrief,
      submitSearch,
      selectOption,
      backToResults,
      clearSelection,
      bookAll,
      threadId,
      switchThread,
      startNewThread,
    ],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
