import { NextResponse } from "next/server";
import { ConsentVerifyRequest, type ConsentVerifyResponse } from "@sh/contracts";
import { claimConsentSession } from "~~/services/autovoyage/consentSessions";
import { signExecutionToken } from "~~/services/autovoyage/executionToken";
import { getMandate } from "~~/services/autovoyage/mandate";
import { humanApprovalEvent, submitAuditEvent } from "~~/services/hedera/hcsAudit";

// Confirms the session's signal matches the itineraryHash AND mandateId the user actually
// approved (both pinned at /api/consent/initiate), then mints a short-lived execution token.
// No proof of humanity is checked here — the mandate's on-chain allowance is what actually
// authorizes any spend.
export async function POST(request: Request) {
  const parsed = ConsentVerifyRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, itineraryHash, mandateId } = parsed.data;

  // Atomic claim: only the first caller to consume this sessionId gets a token, so two
  // concurrent verifies for the same session can't both succeed (the old implementation
  // read-then-deleted, which raced). Checked before the hash/mandate compare below, so a
  // stray retry with the WRONG hash still burns the session rather than leaving it open for
  // guessing — the retry itself is one shot, same as a correct one.
  const session = await claimConsentSession(sessionId);
  if (!session) {
    const response: ConsentVerifyResponse = { verified: false, reason: "consent_expired" };
    return NextResponse.json(response, { status: 401 });
  }
  if (session.itineraryHash !== itineraryHash) {
    const response: ConsentVerifyResponse = { verified: false, reason: "itinerary_mismatch" };
    return NextResponse.json(response, { status: 401 });
  }
  // The session was opened for a specific mandate at /api/consent/initiate — verify must name
  // the same one. Previously mandateId was optional here, so a verify call that omitted it
  // skipped the check entirely and the resulting token was redeemable against ANY mandateId
  // at /api/execute (see AGENTS.md refusal reasons; treated as consent_expired, same as
  // /api/execute's own mandate-mismatch branch).
  if (session.mandateId !== mandateId) {
    const response: ConsentVerifyResponse = { verified: false, reason: "consent_expired" };
    return NextResponse.json(response, { status: 401 });
  }

  const planId = parsed.data.planId;
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
