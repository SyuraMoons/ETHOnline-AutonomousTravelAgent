"use client";

// Connect-wallet button — isolates the `useAppKit()` hook, which throws
// ("Please call createAppKit before using useAppKit hook") if rendered before
// AppKit finishes its client-only init (see HederaWalletConnectProvider). Callers
// must only mount this once `!isInitializing` on `useHederaWalletConnect()`.
import { WalletIcon } from "../ui/icons";
import type { ChainNamespace } from "@reown/appkit-common";
import { useAppKit } from "@reown/appkit/react";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";

// Hardcoded rather than imported from @hashgraph/hedera-wallet-connect — see the same comment
// in services/web3/hederaWalletConnect.tsx for why (its root barrel statically pulls in the
// ESM-only @walletconnect/modal, which crashes Next's server render if touched at module-eval
// time by a component mounted on every page, like this one).
const HEDERA_NAMESPACE = "hedera" as ChainNamespace;

export function ConnectWalletButton({ isBusy, className }: { isBusy: boolean; className: string }) {
  const { open } = useAppKit();

  return (
    <button
      type="button"
      onClick={() => {
        void open({ view: "Connect", namespace: HEDERA_NAMESPACE }).catch(e => {
          notification.error(getParsedError(e));
        });
      }}
      disabled={isBusy}
      className={className}
    >
      <WalletIcon size={16} />
      {isBusy ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
