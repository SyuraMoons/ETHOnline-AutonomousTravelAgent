// Trip data layer — swap this file for the real API/dataset
import type { ApprovalState, AuditTrail, Booking, ChatThread, TripContext, TripPlan } from "~~/types/autovoyage/plan";

export async function getCurrentTripContext(): Promise<TripContext> {
  return {
    trip: { destination: "Tokyo", dates: "Nov 12-15", travelers: 2 },
  };
}

export async function getTripPlan(): Promise<TripPlan> {
  return {
    destination: "Tokyo",
    progress: {
      title: "Planning your trip to Tokyo",
      elapsed: "3.2s",
      steps: [
        { label: "Understanding your brief", status: "done" },
        { label: "Searching", status: "done", note: "paid 0.30 HBAR · x402" },
        { label: "Assembling your plan", status: "active" },
      ],
    },
    flights: {
      status: "auto_approved",
      priceMinor: 61200,
      legs: [
        {
          tag: "OUT · 12",
          airline: "Garuda Indonesia",
          route: "07:20 CGK → 15:05 NRT",
          meta: "1 stop · 8h 45m · Economy",
        },
        { tag: "RET · 15", airline: "ANA", route: "18:40 NRT → 23:10 CGK", meta: "nonstop · 7h 30m · Economy" },
      ],
    },
    stay: {
      status: "needs_approval",
      name: "The Park Hotel Tokyo",
      detail: "Deluxe King · Nov 12-15 · 3 nights",
      note: "Above your $200 auto-approve limit · confirm required",
      priceMinor: 98000,
    },
    activities: {
      paces: ["Calm", "Balanced", "Adventurous"],
      defaultPace: "Calm",
      items: [
        {
          id: "forest-bathing",
          name: "Forest bathing",
          sub: "Okutama valley walk",
          meta: "Calm · Half day · Easy",
          priceMinor: 4500,
        },
        {
          id: "teamlab",
          name: "teamLab Planets",
          sub: "Immersive digital art",
          meta: "Calm · 2h · Indoor",
          priceMinor: 2800,
        },
        {
          id: "tea-ceremony",
          name: "Tea ceremony",
          sub: "Asakusa, private host",
          meta: "Calm · 1.5h · Indoor",
          priceMinor: 3500,
        },
      ],
    },
    agent: [],
  };
}

export async function getApproval(): Promise<ApprovalState> {
  return {
    booking: { name: "The Park Hotel Tokyo", nights: 3, priceMinor: 98000, note: "Above your $200 auto-approve limit" },
    agent: [],
    statusNote: "Waiting for you to verify",
  };
}

export async function getBooking(): Promise<Booking> {
  return {
    destination: "Tokyo",
    dates: "Nov 12-15",
    nights: 3,
    travelers: 2,
    reference: "AVY-7F3C-9021",
    summary: { flight: "Garuda · CGK → NRT", hotel: "The Park Hotel Tokyo", activities: "teamLab + city tour" },
    flights: {
      priceMinor: 61200,
      legs: [
        {
          tag: "OUT · 12",
          airline: "Garuda Indonesia",
          route: "07:20 CGK → 15:05 NRT",
          meta: "1 stop · 8h 45m · Economy",
        },
        { tag: "RET · 15", airline: "ANA", route: "18:40 NRT → 23:10 CGK", meta: "nonstop · 7h 30m · Economy" },
      ],
    },
    stay: {
      date: "NOV 12",
      name: "The Park Hotel Tokyo",
      detail: "Deluxe King · 3 nights · human-approved",
      priceMinor: 98000,
    },
    activities: {
      priceMinor: 14000,
      items: [
        { date: "NOV 13", name: "teamLab Planets", sub: "Immersive digital art · 2h" },
        { date: "NOV 14", name: "Tea ceremony", sub: "Asakusa, private host · 1.5h" },
      ],
    },
    payment: [
      { label: "Flights", amountMinor: 61200 },
      { label: "Stay", amountMinor: 98000 },
      { label: "Activities", amountMinor: 14000 },
    ],
    totalMinor: 173200,
    proof: { txId: "0x9f04…c2e7", hashScanUrl: "https://hashscan.io/testnet" },
  };
}

export async function getAuditTrail(): Promise<AuditTrail> {
  return {
    group: "Today · Nov 6",
    rows: [
      {
        title: "Booked Garuda flight · CGK → NRT",
        ref: "0x3d88…c7f1 · auto-approved, within limit",
        amount: "−$612.00",
        time: "2:33 PM",
        category: "payment",
      },
      {
        title: "Agent micro-payments · 5 × x402",
        ref: "0x9a12…4e0b · agent → agent",
        amount: "−0.38 USDC",
        time: "2:34 PM",
        category: "payment",
      },
      {
        title: "Approval requested · hotel $980",
        ref: "0x5f21…b8c4 · exceeds $200 auto-limit",
        time: "2:34 PM",
        category: "approval",
      },
      {
        title: "Booking confirmed · you approved",
        ref: "0x77de…1a09 · human-confirmed",
        time: "2:35 PM",
        category: "approval",
      },
      {
        title: "Booked Park Hotel Tokyo · 3 nights",
        ref: "0x9f04…c2e7 · human-approved",
        amount: "−$980.00",
        time: "2:35 PM",
        category: "payment",
      },
      {
        title: "Booked activities · teamLab + city tour",
        ref: "0x2b71…d5a3 · auto-approved",
        amount: "−$140.00",
        time: "2:36 PM",
        category: "payment",
      },
    ],
  };
}

// Messages now come from PlanProvider (shared with /plan's rail), not this fixture layer —
// only the booking-confirm modal's `approval` sidecar still lives here.
export async function getChat(): Promise<Pick<ChatThread, "approval">> {
  return { approval: null };
}
