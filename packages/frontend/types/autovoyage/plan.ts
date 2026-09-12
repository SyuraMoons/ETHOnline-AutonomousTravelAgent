// Trip / plan view-model types
import type { FlightOption, TripDossier } from "@sh/contracts";
import type { RunStep } from "~~/services/autovoyage/autonomousRun";

export type SpendStatus = "auto_approved" | "needs_approval";

export type ProgressStep = { label: string; status: "done" | "active" | "pending"; note?: string };
export type PlanProgress = { title: string; elapsed: string; steps: ProgressStep[] };

export type FlightLeg = { tag: string; airline: string; route: string; meta: string };
export type FlightsSection = { status: SpendStatus; priceMinor: number; legs: FlightLeg[] };

export type StaySection = { status: SpendStatus; name: string; detail: string; note?: string; priceMinor: number };

export type ActivitySuggestion = { id: string; name: string; sub: string; meta: string; priceMinor: number };
export type ActivitiesSection = { paces: string[]; defaultPace: string; items: ActivitySuggestion[] };

// Kept as an alias so older call sites (PlanProvider, AgentPanel) can widen to the richer
// ChatMessage shape below without a rename — the rail and the full-screen chat share one type.
export type AgentMessage = ChatMessage;

// The /plan workspace walks one way through these: you start on "search", the
// agent turn opens "results", and picking an option lands on "plan".
export type PlanStage = "search" | "results" | "plan";

export type CabinClass = "Economy" | "Premium" | "Business";

export type SearchQuery = {
  tripType: "return" | "oneway";
  origin: string;
  destination: string;
  departDate: string; // ISO yyyy-mm-dd
  returnDate: string; // ignored when tripType is "oneway"
  paxCount: number;
  cabin: CabinClass;
};

export type TripPlan = {
  destination: string;
  progress: PlanProgress;
  flights: FlightsSection;
  stay: StaySection;
  activities: ActivitiesSection;
  agent: AgentMessage[];
};

export type CurrentTrip = { destination: string; dates: string; travelers: number };
export type TripContext = { trip: CurrentTrip };

export type ApprovalBooking = { name: string; nights: number; priceMinor: number; note: string };
export type ApprovalState = { booking: ApprovalBooking; agent: AgentMessage[]; statusNote?: string };

export type OnChainProof = { txId: string; hashScanUrl: string };
export type PaymentLine = { label: string; amountMinor: number };
export type BookedActivity = { date: string; name: string; sub: string };

export type Booking = {
  destination: string;
  dates: string;
  nights: number;
  travelers: number;
  reference: string;

  summary: { flight: string; hotel: string; activities: string };
  flights: { priceMinor: number; legs: FlightLeg[] };
  stay: { date: string; name: string; detail: string; priceMinor: number };
  activities: { priceMinor: number; items: BookedActivity[] };
  payment: PaymentLine[];
  totalMinor: number;
  proof: OnChainProof;
};

export type StatTile = { value: string; label: string };
export type ActivityRow = { title: string; ref: string; amount: string; pending?: boolean; time: string };
export type ActivityFeed = { stats: StatTile[]; group: string; rows: ActivityRow[] };

export type AuditCategory = "payment" | "approval";
export type AuditRow = { title: string; ref: string; amount?: string; time: string; category: AuditCategory };
export type AuditTrail = { group: string; rows: AuditRow[] };

/** Rendered as an inline chat card (see ChatBudgetCard) prompting the user to set a budget
 * and approve the HBAR allowance — reasonNote explains why, when triggered by a refusal. */
export type BudgetRequestCard = { reasonNote?: string };

export type BookingResult = {
  status: "booked" | "partial" | "refused";
  bookings: {
    offerId: string;
    bookingId: string;
    confirmationCode?: string;
    amountHbar: string;
    hashscanUrl: string;
  }[];
  totalHbarPaid: string;
  message?: string;
};

// `id` makes a message mutable in place — the autonomous run streams `steps` into one bubble
// as SSE events arrive, rather than appending a new bubble per step.
export type ChatMessage = {
  id?: string;
  from: "agent" | "user";
  time?: string;
  text?: string;
  results?: FlightOption[];
  budgetRequest?: BudgetRequestCard;
  steps?: RunStep[];
  dossier?: TripDossier;
  booking?: BookingResult;
};
export type ChatThread = { messages: ChatMessage[]; approval: ApprovalBooking | null };
