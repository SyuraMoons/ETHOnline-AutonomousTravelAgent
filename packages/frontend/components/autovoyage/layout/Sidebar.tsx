"use client";

// Sidebar
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import type { TripContext } from "~~/types/autovoyage/plan";
import { formatUsd } from "~~/services/autovoyage/currency";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";
import { Wordmark } from "../brand/Wordmark";
import { CompassIcon, PulseIcon, ShieldIcon, WalletIcon } from "../ui/icons";

const NAV = [
  { href: "/plan", label: "Plan trip", icon: CompassIcon },
  { href: "/activity", label: "Activity", icon: PulseIcon },
  { href: "/audit", label: "Audit", icon: ShieldIcon },
];

export function Sidebar({ context }: { context: TripContext }) {
  const pathname = usePathname();
  const { budget, trip } = context;
  const remainingMinor = budget.totalMinor - budget.spentMinor;
  const pct = budget.totalMinor > 0 ? Math.round((budget.spentMinor / budget.totalMinor) * 100) : 0;
  const { open } = useAppKit();
  const { accountId, isConnected, isBusy, disconnectWallet } = useHederaWalletConnect();
  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : null;

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

      <div className="rounded border border-av-border p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
          <span className="text-[13px] font-semibold text-av-blue">{formatUsd(remainingMinor)} left</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-av-blue-tint">
          <div className="h-full rounded-full bg-av-blue" style={{ width: `${pct}%` }} />
        </div>
        <p className="m-0 mt-2 text-[11px] text-av-muted">
          {formatUsd(budget.spentMinor)} of {formatUsd(budget.totalMinor)} spent
        </p>
        <div className="mt-2 flex items-center justify-between border-t border-av-border pt-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Auto-approve</span>
          <span className="text-[12px] font-semibold text-av-text">≤ {formatUsd(budget.autoApproveMinor)}</span>
        </div>
      </div>

      <div className="flex-1" />

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
