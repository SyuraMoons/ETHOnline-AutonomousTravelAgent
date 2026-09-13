"use client";

import { useRef } from "react";
import type { ChainNamespace } from "@reown/appkit-common";
import { useAppKit } from "@reown/appkit/react";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";

// Hardcoded rather than imported from @hashgraph/hedera-wallet-connect — see the same comment
// in services/web3/hederaWalletConnect.tsx for why (its root barrel statically pulls in the
// ESM-only @walletconnect/modal, which crashes Next's server render if touched at module-eval
// time by a component mounted on every page, like this one).
const HEDERA_NAMESPACE = "hedera" as ChainNamespace;

/** HashPack connect via Reown AppKit (native Hedera namespace only). */
export const WalletConnectButton = () => {
  const { open } = useAppKit();
  const { accountId, isConnected, isBusy, disconnectWallet } = useHederaWalletConnect();
  const menuRef = useRef<HTMLDetailsElement>(null);

  if (!isConnected) {
    return (
      <button
        className="btn btn-primary btn-sm"
        onClick={() => {
          void open({ view: "Connect", namespace: HEDERA_NAMESPACE }).catch(e => {
            notification.error(getParsedError(e));
          });
        }}
        disabled={isBusy}
        type="button"
      >
        Connect HashPack
      </button>
    );
  }

  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : "Connected";

  return (
    <div className="dropdown dropdown-end">
      <details ref={menuRef}>
        <summary className="btn btn-secondary btn-sm list-none" title={accountId ?? "Connected"}>
          <span className="hidden sm:inline">HashPack</span>
          <span>{shortAccount}</span>
        </summary>
        <ul className="menu dropdown-content mt-2 z-[60] w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
          <li className="menu-title">
            <span>{accountId}</span>
          </li>
          <li>
            <button
              type="button"
              className="justify-start normal-case"
              onClick={() => {
                if (!accountId || !navigator?.clipboard?.writeText) return;
                void navigator.clipboard.writeText(accountId);
                menuRef.current?.removeAttribute("open");
              }}
            >
              Copy account ID
            </button>
          </li>
          <li>
            <button
              type="button"
              className="text-error justify-start normal-case"
              onClick={() => {
                menuRef.current?.removeAttribute("open");
                void disconnectWallet();
              }}
              disabled={isBusy}
            >
              {isBusy ? "Disconnecting..." : "Disconnect"}
            </button>
          </li>
        </ul>
      </details>
    </div>
  );
};
