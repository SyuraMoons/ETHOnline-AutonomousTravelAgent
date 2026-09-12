import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import type { AuditEvent, AuditRefusalReason } from "@sh/contracts";
import "server-only";

/**
 * The real HCS audit trail writer. Four call sites (app/api/plan, app/api/execute,
 * app/api/consent/verify) build events with the helpers below and submit them here — a genuine
 * TopicMessageSubmitTransaction against HCS_AUDIT_TOPIC_ID, never a dummy/local record.
 *
 * Reuses AGENT_ACCOUNT_ID/AGENT_PRIVATE_KEY (the same server-held key services/x402/agentBuyer.ts
 * pays with) as the topic's submit-key operator, instead of provisioning separate credentials.
 *
 * Best-effort by design: a submit failure (unset topic, unreachable node) must never break a
 * payment, booking, or consent decision that already happened — every call here is wrapped so it
 * logs and resolves rather than throwing into the caller.
 */

let client: Client | null = null;
let warnedMissingTopic = false;

function getClient(): Client {
  if (client) return client;
  const accountId = process.env.AGENT_ACCOUNT_ID;
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY are not configured");
  }
  client = Client.forTestnet().setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(privateKey));
  return client;
}

export async function submitAuditEvent(event: AuditEvent): Promise<void> {
  const topicId = process.env.HCS_AUDIT_TOPIC_ID;
  if (!topicId) {
    if (!warnedMissingTopic) {
      console.warn("[hcsAudit] HCS_AUDIT_TOPIC_ID is not set — audit events are being dropped, not written");
      warnedMissingTopic = true;
    }
    return;
  }

  try {
    const tx = new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(JSON.stringify(event));
    const response = await tx.execute(getClient());
    await response.getReceipt(getClient());
  } catch (err) {
    console.warn("[hcsAudit] submit failed, event not recorded:", event.type, event.eventId, err);
  }
}

function base(planId: string): Pick<AuditEvent, "eventId" | "planId" | "v" | "timestamp"> {
  return { eventId: crypto.randomUUID(), planId, v: 1, timestamp: new Date().toISOString() };
}

export function dataPaymentEvent(
  planId: string,
  fields: { amountHbar: number; payTo: string; txId: string },
): AuditEvent {
  return { ...base(planId), type: "DataPayment", ...fields };
}

export function humanApprovalEvent(
  planId: string,
  fields: { itineraryHash: string; payerAccountId: string },
): AuditEvent {
  return { ...base(planId), type: "HumanApproval", ...fields };
}

export function bookingExecutedEvent(
  planId: string,
  fields: { bookingId: string; fareTotalMinor: number; currency: string },
): AuditEvent {
  return { ...base(planId), type: "BookingExecuted", ...fields };
}

export function actionRefusedEvent(planId: string, reason: AuditRefusalReason): AuditEvent {
  return { ...base(planId), type: "ActionRefused", reason };
}
