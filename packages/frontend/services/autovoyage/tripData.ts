// Trip data layer — swap this file for the real API/dataset
import type {
  ActivityFeed,
  AuditTrail,
  Booking,
  ChatThread,
  TripContext,
  TripPlan,
} from "~~/types/autovoyage/plan";

export async function getCurrentTripContext(): Promise<TripContext> {
  return {
    budget: { totalMinor: 120000, spentMinor: 46000, autoApproveMinor: 20000, currency: "USD" },
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
        { label: "Searching", status: "done", note: "paid 0.05 USDC · x402" },
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
      note: "Above your $200 auto-approve limit · face check required",
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
    agent: [
      {
        from: "agent",
        text: "I put together your Tokyo plan. Flights and activities are within your limit and booked.",
      },
      { from: "user", text: "Great. What about the hotel?" },
      {
        from: "agent",
        text: "The Park Hotel Tokyo is $980, above your $200 limit. Approve it with a face check and I will book it.",
      },
    ],
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
    proof: { txId: "0x9f04…c2e7", hashScanUrl: "https://hashscan.io/testnet", worldIdNullifier: "0x77de…1a09" },
  };
}

export async function getActivityFeed(): Promise<ActivityFeed> {
  return {
    stats: [
      { value: "14", label: "Autonomous actions" },
      { value: "0.38 USDC", label: "Spent by agents (x402)" },
      { value: "1", label: "Pending your approval" },
    ],
    group: "Today",
    rows: [
      {
        title: "Hired FlightSearch agent",
        ref: "0x7f3c…a921 · x402 agent → agent",
        amount: "0.05 USDC",
        time: "2:31:04 PM",
      },
      {
        title: "Paid FlightSearch agent · 3 results",
        ref: "0x9a12…4e0b · x402 agent → agent",
        amount: "0.02 USDC",
        time: "2:31:22 PM",
      },
      {
        title: "Booked Garuda flight · CGK → NRT",
        ref: "0x3d88…c7f1 · settled on-chain",
        amount: "$612.00",
        time: "2:33:10 PM",
      },
      {
        title: "Hired ReviewCheck agent",
        ref: "0x51bb…9d20 · x402 agent → agent",
        amount: "0.03 USDC",
        time: "2:33:41 PM",
      },
      {
        title: "Paid HotelSearch agent · 12 results",
        ref: "0x77ac…1f6a · x402 agent → agent",
        amount: "0.04 USDC",
        time: "2:34:02 PM",
      },
      {
        title: "Hotel booking paused for approval",
        ref: "The Park Hotel Tokyo · $980 over limit",
        amount: "Pending",
        pending: true,
        time: "2:34:20 PM",
      },
    ],
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
        title: "Face check verified · you approved",
        ref: "0x77de…1a09 · liveness human-approved",
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

export async function getChat(): Promise<ChatThread> {
  return {
    messages: [
      { from: "user", time: "2:31 PM", text: "Plan a 3-night Tokyo trip in November, keep it under $1,200." },
      {
        from: "agent",
        time: "2:31 PM",
        text: "On it. I'll research flights, hotels and activities and book anything under your $200 auto-approve limit without asking. Here are 3 flights within budget:",
        results: [
          { airline: "Garuda Indonesia", route: "07:20 CGK → 15:05 NRT", meta: "1 stop · 8h 45m", priceMinor: 61200 },
          { airline: "ANA", route: "09:10 CGK → 17:40 NRT", meta: "nonstop · 7h 30m", priceMinor: 68400 },
          { airline: "Singapore Airlines", route: "13:05 CGK → 22:55 NRT", meta: "1 stop · 9h 50m", priceMinor: 84500 },
        ],
      },
      {
        from: "agent",
        time: "2:33 PM",
        text: "Booked Garuda for $612. The Park Hotel Tokyo is $980, above your $200 limit, so I need your approval to book it.",
      },
    ],
  };
}
