import { NextResponse } from "next/server";
import { listBookings } from "~~/services/autovoyage/bookingStore";
import { sessionEmail } from "~~/services/autovoyage/profile";

// Every trip the signed-in traveller has booked — the summary shape only, so this never pulls
// every leg/day/searchSpend entry just to render a list of cards (see GET /api/bookings/:id
// for the full BookedTrip).
export async function GET() {
  const email = await sessionEmail();
  if (!email) return NextResponse.json({ error: "Sign in to view your trips." }, { status: 401 });

  try {
    const bookings = await listBookings(email);
    return NextResponse.json({ bookings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read trip history" },
      { status: 500 },
    );
  }
}
