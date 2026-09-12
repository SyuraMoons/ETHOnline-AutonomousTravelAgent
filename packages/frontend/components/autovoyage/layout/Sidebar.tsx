"use client";

// Sidebar
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "../brand/Wordmark";
import { CompassIcon, PulseIcon, ShieldIcon, UserIcon, WalletIcon } from "../ui/icons";
import { BudgetCard } from "./BudgetCard";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { useHbarBalance } from "~~/hooks/autovoyage/useHbarBalance";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import type { TripContext } from "~~/types/autovoyage/plan";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";

const NAV = [
  { href: "/plan", label: "Plan trip", icon: CompassIcon },
  { href: "/activity", label: "Activity", icon: PulseIcon },
  { href: "/audit", label: "Audit", icon: ShieldIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function Sidebar({ context }: { context: TripContext }) {
  const pathname = usePathname();
  const { trip } = context;
  const { open } = useAppKit();
  const { accountId, isConnected, isBusy, disconnectWallet } = useHederaWalletConnect();
  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : null;
  const { balanceHbar } = useHbarBalance(isConnected ? accountId : null);

  return (
    <aside className="sticky top-0 flex h-svh w-[236px] flex-shrink-0 flex-col gap-6 self-start overflow-y-auto border-r border-av-border bg-av-card px-4 py-5">
      <div className="px-1">
        <Wordmark href="/plan" />
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded px-3 py-2 text-[14px] font-medium no-underline transition-colors ${
                active ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:bg-av-bg"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <BudgetCard />

      <div className="rounded border border-av-border p-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Current trip</span>
        <p className="m-0 mt-1 text-[15px] font-semibold text-av-text">{trip.destination}</p>
        <p className="m-0 text-[12px] text-av-muted">
          {trip.dates} · {trip.travelers} travelers
        </p>
      </div>

      <div>
        {isConnected ? (
          <div className="rounded border border-av-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-av-text">
                <WalletIcon size={16} />
                <span className="truncate" title={accountId ?? undefined}>
                  {shortAccount}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void disconnectWallet()}
                disabled={isBusy}
                className="flex-shrink-0 text-[12px] font-medium text-av-muted underline-offset-2 hover:text-av-text hover:underline disabled:opacity-50"
              >
                {isBusy ? "…" : "Disconnect"}
              </button>
            </div>
            <p className="m-0 mt-1 text-[12px] text-av-muted">{balanceHbar ? `${balanceHbar} HBAR` : "…"}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                void open({ view: "Connect", namespace: hederaNamespace }).catch(e => {
                  notification.error(getParsedError(e));
                });
              }}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-60"
            >
              <WalletIcon size={16} />
              {isBusy ? "Connecting…" : "Connect wallet"}
            </button>
            <p className="m-0 mt-2 text-center text-[11px] text-av-muted">HashPack via WalletConnect</p>
          </>
        )}
      </div>
    </aside>
  );
}
