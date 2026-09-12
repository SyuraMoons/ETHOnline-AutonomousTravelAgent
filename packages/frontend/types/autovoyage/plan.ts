// Trip / plan view-model types
export type SpendStatus = "auto_approved" | "needs_approval";

export type ProgressStep = { label: string; status: "done" | "active" | "pending"; note?: string };
export type PlanProgress = { title: string; elapsed: string; steps: ProgressStep[] };

export type FlightLeg = { tag: string; airline: string; route: string; meta: string };
export type FlightsSection = { status: SpendStatus; priceMinor: number; legs: FlightLeg[] };

export type StaySection = { status: SpendStatus; name: string; detail: string; note?: string; priceMinor: number };

export type ActivitySuggestion = { id: string; name: string; sub: string; meta: string; priceMinor: number };
export type ActivitiesSection = { paces: string[]; defaultPace: string; items: ActivitySuggestion[] };

export type AgentMessage = { from: "agent" | "user"; text: string };

export type TripPlan = {
  destination: string;
  progress: PlanProgress;
  flights: FlightsSection;
  stay: StaySection;
  activities: ActivitiesSection;
  agent: AgentMessage[];
};

export type Budget = { totalMinor: number; spentMinor: number; autoApproveMinor: number; currency: string };
export type CurrentTrip = { destination: string; dates: string; travelers: number };
export type TripContext = { budget: Budget; trip: CurrentTrip };

export type OnChainProof = { txId: string; hashScanUrl: string; worldIdNullifier: string };
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

export type ChatFlightOption = { airline: string; route: string; meta: string; priceMinor: number };
export type ChatMessage = { from: "agent" | "user"; time: string; text?: string; results?: ChatFlightOption[] };
export type ChatThread = { messages: ChatMessage[] };
