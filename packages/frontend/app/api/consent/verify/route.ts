import { NextResponse } from "next/server";
import { ConsentVerifyRequest, type ConsentVerifyResponse } from "@sh/contracts";
import { consumeConsentSession, getConsentSession } from "~~/services/autovoyage/consentSessions";
import { signExecutionToken } from "~~/services/autovoyage/executionToken";
import { getMandate } from "~~/services/autovoyage/mandate";
import { humanApprovalEvent, submitAuditEvent } from "~~/services/hedera/hcsAudit";

// Confirms the session's signal matches the itineraryHash the user actually approved, then
// mints a short-lived execution token. No proof of humanity is checked here — the mandate's
// on-chain allowance is what actually authorizes any spend.
export async function POST(request: Request) {
  const parsed = ConsentVerifyRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, itineraryHash, mandateId, planId } = parsed.data;

  const session = await getConsentSession(sessionId);
  if (!session) {
    const response: ConsentVerifyResponse = { verified: false, reason: "consent_expired" };
    return NextResponse.json(response, { status: 401 });
  }
  if (session.itineraryHash !== itineraryHash) {
    const response: ConsentVerifyResponse = { verified: false, reason: "itinerary_mismatch" };
    return NextResponse.json(response, { status: 401 });
  }

  await consumeConsentSession(sessionId);
  const executionToken = signExecutionToken({ itineraryHash, mandateId });

  // No ActionRefused audit branch here: consent_expired/itinerary_mismatch recur at
  // /api/execute (which re-checks the same conditions server-side before spending anything),
  // so logging them here too would just duplicate the trail.
  if (planId && mandateId) {
    const mandate = await getMandate(mandateId);
    if (mandate?.payerAccountId) {
      await submitAuditEvent(humanApprovalEvent(planId, { itineraryHash, payerAccountId: mandate.payerAccountId }));
    }
  }

  const response: ConsentVerifyResponse = { verified: true, executionToken };
  return NextResponse.json(response);
}
