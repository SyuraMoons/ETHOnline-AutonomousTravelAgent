// Trust strip
import type { ReactNode } from "react";
import { CoinIcon, FaceScanIcon, LinkIcon } from "../ui/icons";

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {icon}
      {children}
    </span>
  );
}

export function TrustStrip() {
  return (
    <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 font-mono text-[12px] uppercase tracking-[0.1em] text-av-muted">
      <Item icon={<CoinIcon className="text-av-ink" />}>x402 · pays as it plans</Item>
      <Item icon={<FaceScanIcon className="text-av-blue" />}>World ID · clears the big spends</Item>
      <Item icon={<LinkIcon className="text-av-ink" />}>on-chain · full audit trail</Item>
    </div>
  );
}
