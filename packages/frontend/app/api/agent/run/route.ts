import { NextRequest, NextResponse } from "next/server";
import { type RunEvent, runAutonomous } from "~~/services/autovoyage/autonomousRun";
import { saveDossier } from "~~/services/autovoyage/dossierStore";
import { getOrCreateDefaultMandate } from "~~/services/autovoyage/mandate";
import { refusalReply } from "~~/services/autovoyage/paidSearch";
import { getSessionTraveler } from "~~/services/autovoyage/profile";

// Node runtime: the Hedera SDK and node:crypto used deep in the payment path aren't
// edge-compatible.
export const runtime = "nodejs";

// Streams the autonomous run's step-by-step progress as Server-Sent Events, one JSON RunEvent
// per `data:` line. POST body: { brief: string, mandateId?: string }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = body as { brief?: unknown; mandateId?: unknown } | null;
  const brief = typeof b?.brief === "string" ? b.brief.trim() : "";
  const requestedMandateId = typeof b?.mandateId === "string" && b.mandateId.trim() !== "" ? b.mandateId.trim() : null;

  if (!brief) {
    return NextResponse.json({ status: "error", message: "brief is required" }, { status: 400 });
  }

  // Same dev-only self-authorization fallback as /api/plan — acceptable only against the
  // agent's own treasury balance, never against a user's account.
  const mandateId =
    requestedMandateId ??
    (process.env.ALLOW_UNAUTHORIZED_MANDATE === "true" ? (await getOrCreateDefaultMandate()).mandateId : null);

  // Read in the request scope, not inside the stream: `start` runs after the response has
  // begun, where the session cookie is no longer in scope.
  const traveler = await getSessionTraveler();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The client only calls /api/execute after seeing the "dossier" event, but the save
      // itself is async — awaited before controller.close() so execute never races an
      // unsaved dossier.
      let dossierSaved: Promise<void> = Promise.resolve();
      const send = (event: RunEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "dossier") {
          dossierSaved = saveDossier(event.dossier);
        }
      };

      // No mandate id means no human ever authorized this spend. Refuse rather than run —
      // same gate as /api/plan; see AGENTS.md "Target Build".
      if (!mandateId) {
        send({ type: "refusal", reason: "consent_missing", reply: refusalReply("consent_missing") });
        controller.close();
        return;
      }

      try {
        await runAutonomous({ brief, mandateId, traveler, onEvent: send });
        await dossierSaved;
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "the run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
