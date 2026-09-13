import { NextResponse } from "next/server";
import { ConsentInitiateRequest, type ConsentInitiateResponse } from "@sh/contracts";
import { randomUUID } from "crypto";
import { createConsentSession } from "~~/services/autovoyage/consentSessions";

// Opens a booking-confirm session whose signal is the plan's itineraryHash — binding the
// confirm click to this exact itinerary, so verify can reject a mismatch.
export async function POST(request: Request) {
  const parsed = ConsentInitiateRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { itineraryHash, mandateId } = parsed.data;
  const sessionId = randomUUID();
  await createConsentSession(sessionId, itineraryHash, mandateId);

  const response: ConsentInitiateResponse = { sessionId, itineraryHash };
  return NextResponse.json(response);
}
