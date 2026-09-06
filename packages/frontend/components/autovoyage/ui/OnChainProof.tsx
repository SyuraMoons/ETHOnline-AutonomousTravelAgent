// On-chain proof rows
import type { OnChainProof as Proof } from "~~/types/autovoyage/plan";

export function OnChainProof({ proof }: { proof: Proof }) {
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-av-muted">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-av-green" />
          Recorded on-chain <span className="font-mono text-[12px] text-av-text">{proof.txId}</span>
        </span>
        <a
          href={proof.hashScanUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-av-blue no-underline transition-opacity hover:opacity-70"
        >
          View on HashScan
        </a>
      </div>
      <span className="flex items-center gap-2 text-av-muted">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-av-blue" />
        Human-approved · World ID <span className="font-mono text-[12px] text-av-text">{proof.worldIdNullifier}</span>
      </span>
    </div>
  );
}
