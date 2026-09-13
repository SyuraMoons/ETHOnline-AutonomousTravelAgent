"use client";

// Profile bar — who is signed in (email/OAuth), merged with wallet connect status
import Link from "next/link";
import { GithubGlyph, GoogleGlyph } from "../ui/brandGlyphs";
import { WalletIcon } from "../ui/icons";
import { ConnectWalletButton } from "../wallet/ConnectWalletButton";
import { useSession } from "next-auth/react";
import { useHbarBalance } from "~~/hooks/autovoyage/useHbarBalance";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

function ProviderGlyph({ provider }: { provider?: string }) {
  if (provider === "google") return <GoogleGlyph size={12} />;
  if (provider === "github") return <GithubGlyph size={12} />;
  return null;
}

function providerLabel(provider?: string) {
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  return null;
}

function UserIdentity() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  const label = providerLabel(session.provider);
  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

  return (
    <Link
      href="/profile"
      className="-mx-1 flex items-center gap-2.5 rounded border-b border-av-border px-1 pb-3 no-underline transition-colors hover:bg-av-bg"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar hosts aren't configured in next/image
        <img src={user.image} alt="" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-full" />
      ) : (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-av-blue-tint text-[13px] font-semibold text-av-blue">
          {initial}
        </span>
      )}
      <div className="min-w-0">
        <p className="m-0 truncate text-[13px] font-medium text-av-text" title={user.name ?? user.email ?? undefined}>
          {user.name ?? user.email}
        </p>
        {label && (
          <p className="m-0 flex items-center gap-1 text-[11px] text-av-muted">
            <ProviderGlyph provider={session.provider} />
            via {label}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProfileBar() {
  const { accountId, isConnected, isBusy, isInitializing, disconnectWallet } = useHederaWalletConnect();
  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : null;
  const { balanceHbar } = useHbarBalance(isConnected ? accountId : null);

  return (
    <div className="rounded border border-av-border p-3">
      <UserIdentity />

      <div className="mt-3">
        {isConnected ? (
          <div>
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
            {isInitializing ? (
              <button
                type="button"
                disabled
                className="flex w-full items-center justify-center gap-2 rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper opacity-60"
              >
                <WalletIcon size={16} />
                Connect wallet
              </button>
            ) : (
              <ConnectWalletButton
                isBusy={isBusy}
                className="flex w-full items-center justify-center gap-2 rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-60"
              />
            )}
            <p className="m-0 mt-2 text-center text-[11px] text-av-muted">HashPack via WalletConnect</p>
          </>
        )}
      </div>
    </div>
  );
}
