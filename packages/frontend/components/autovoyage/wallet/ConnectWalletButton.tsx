"use client";

// Connect-wallet button — isolates the `useAppKit()` hook, which throws
// ("Please call createAppKit before using useAppKit hook") if rendered before
// AppKit finishes its client-only init (see HederaWalletConnectProvider). Callers
// must only mount this once `!isInitializing` on `useHederaWalletConnect()`.
import { WalletIcon } from "../ui/icons";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";

export function ConnectWalletButton({ isBusy, className }: { isBusy: boolean; className: string }) {
  const { open } = useAppKit();

  return (
    <button
      type="button"
      onClick={() => {
        void open({ view: "Connect", namespace: hederaNamespace }).catch(e => {
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
