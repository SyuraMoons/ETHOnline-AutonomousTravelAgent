import { NextResponse } from "next/server";
import { getBookingForOwner } from "~~/services/autovoyage/bookingStore";
import { sessionEmail } from "~~/services/autovoyage/profile";

// One booked trip in full — flights, stay, activities, day plan, and the signed
// confirmation. Scoped to the signed-in owner: a booking that exists but belongs to someone
// else reads as 404, same as one that doesn't exist, so this never confirms an id's existence
// to a caller who doesn't own it.
export async function GET(_req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const email = await sessionEmail();
  if (!email) return NextResponse.json({ error: "Sign in to view this trip." }, { status: 401 });

  const { bookingId } = await params;
  try {
    const booking = await getBookingForOwner(email, bookingId);
    if (!booking) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    return NextResponse.json(booking);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read this trip" },
      { status: 500 },
    );
  }
}
