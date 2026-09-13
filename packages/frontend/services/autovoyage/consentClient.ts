// Browser-side wrapper around the booking-confirm gate (POST /api/consent/initiate +
// /api/consent/verify), factored out of ApprovalFocus.tsx so both the single-flight confirm
// overlay and the dossier "Book everything" flow share one implementation instead of two
// fetch call sites that could drift.

export class ConsentError extends Error {
  reason?: string;
  constructor(message: string, reason?: string) {
    super(message);
    this.reason = reason;
  }
}

export async function initiateConsent(
  itineraryHash: string,
  mandateId: string,
  planId?: string,
): Promise<{ sessionId: string; itineraryHash: string }> {
  const res = await fetch("/api/consent/initiate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itineraryHash, mandateId, planId }),
  });
  if (!res.ok) throw new ConsentError("Could not start confirmation. Try again.");
  return (await res.json()) as { sessionId: string; itineraryHash: string };
}

export async function verifyConsent(params: {
  sessionId: string;
  itineraryHash: string;
  mandateId: string;
  planId?: string;
}): Promise<string> {
  const res = await fetch("/api/consent/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { verified: boolean; executionToken?: string; reason?: string };
  if (!res.ok || !data.verified || !data.executionToken) {
    throw new ConsentError(data.reason ?? "Confirmation failed", data.reason);
  }
  return data.executionToken;
}
