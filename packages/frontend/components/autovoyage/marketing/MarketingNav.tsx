"use client";

// Marketing nav
import Link from "next/link";
import { Wordmark } from "../brand/Wordmark";
import { WalletIcon } from "../ui/icons";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

export function MarketingNav({ onDark = false }: { onDark?: boolean }) {
  const linkColor = onDark ? "text-av-paper" : "text-av-text";
  const { accountId, isConnected } = useHederaWalletConnect();
  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : null;

  return (
    <nav className="flex items-center justify-between px-6 pt-6 md:px-10">
      <Wordmark variant={onDark ? "onDark" : "onLight"} />
      <div className="flex items-center gap-3 md:gap-5">
        {isConnected ? (
          <Link
            href="/plan"
            className={`hidden items-center gap-2 text-[15px] font-medium no-underline transition-opacity hover:opacity-60 sm:inline-flex ${linkColor}`}
          >
            <WalletIcon size={16} />
            {shortAccount}
          </Link>
        ) : (
          <Link
            href="/login"
            className={`hidden text-[15px] font-medium no-underline transition-opacity hover:opacity-60 sm:inline ${linkColor}`}
          >
            Log in
          </Link>
        )}
        <Link
          href={isConnected ? "/plan" : "/login"}
          className="rounded bg-av-blue px-4 py-2 text-[15px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
        >
          {isConnected ? "Dashboard" : "Get started"}
        </Link>
      </div>
    </nav>
  );
}
