// Audit page
import { AuditList } from "~~/components/autovoyage/audit/AuditList";
import { getAuditTrail } from "~~/services/autovoyage/tripData";

export default async function AuditPage() {
  const trail = await getAuditTrail();

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col px-6 py-6">
      <h1 className="text-[22px] font-semibold text-av-text">Audit trail</h1>
      <p className="m-0 mb-5 mt-0.5 text-[13px] text-av-muted">
        Every action, payment, and human approval — tamper evident and verifiable on Hedera.
      </p>
      <AuditList trail={trail} />
    </div>
  );
}
