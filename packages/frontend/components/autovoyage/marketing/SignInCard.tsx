"use client";

// Sign-in card
import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GithubGlyph, GoogleGlyph } from "../ui/brandGlyphs";
import { MailIcon, WalletIcon } from "../ui/icons";
import { ConnectWalletButton } from "../wallet/ConnectWalletButton";
import { signIn } from "next-auth/react";
import { useHbarBalance } from "~~/hooks/autovoyage/useHbarBalance";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getParsedError, notification } from "~~/utils/scaffold-hbar";

type OAuthProvider = "google" | "github";

function OAuthButton({
  icon,
  label,
  provider,
  loading,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  provider: OAuthProvider;
  loading: OAuthProvider | null;
  onClick: (provider: OAuthProvider) => void;
}) {
  const isBusy = loading === provider;
  return (
    <button
      id={`oauth-${provider}`}
      type="button"
      onClick={() => onClick(provider)}
      disabled={loading !== null}
      className="flex items-center justify-center gap-2 rounded-lg border border-av-paper/15 bg-av-paper/5 py-3 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-paper/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isBusy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-av-paper/30 border-t-av-paper" />
      ) : (
        icon
      )}
      {isBusy ? "Signing in…" : label}
    </button>
  );
}

export function SignInCard() {
  const [email, setEmail] = useState("");
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/plan";
  const enterApp = () => router.push(next);

  const { accountId, isConnected, isBusy, isInitializing, disconnectWallet } = useHederaWalletConnect();
  const shortAccount = accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : null;
  const { balanceHbar } = useHbarBalance(isConnected ? accountId : null);

  useEffect(() => {
    if (isConnected) router.push(next);
  }, [isConnected, router, next]);

  const handleOAuth = (provider: OAuthProvider) => {
    setOauthLoading(provider);
    void signIn(provider, { redirectTo: next }).catch(e => {
      notification.error(getParsedError(e));
      setOauthLoading(null);
    });
  };

  return (
    <div className="w-full max-w-[420px] rounded-2xl bg-av-ink p-8 text-av-paper">
      <h1 className="text-[22px] font-semibold">Sign in to your account</h1>
      <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-paper/50">
        Don&apos;t have an account yet?{" "}
        <Link href="/login" className="text-av-paper underline underline-offset-2">
          Register
        </Link>
      </p>

      <form
        className="mt-6"
        onSubmit={e => {
          e.preventDefault();
          enterApp();
        }}
      >
        <label htmlFor="email" className="text-[13px] text-av-paper/70">
          Email
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-av-paper/15 bg-av-paper/5 px-3">
          <MailIcon size={16} className="text-av-paper/50" />
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-transparent py-3 text-[14px] text-av-paper outline-none placeholder:text-av-paper/40"
          />
        </div>
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-av-paper py-3 text-[14px] font-semibold text-av-ink transition-opacity hover:opacity-90"
        >
          Continue
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-av-paper/15" />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-paper/40">or sign in with</span>
        <span className="h-px flex-1 bg-av-paper/15" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <OAuthButton
          icon={<GoogleGlyph size={16} />}
          label="Google"
          provider="google"
          loading={oauthLoading}
          onClick={handleOAuth}
        />
        <OAuthButton
          icon={<GithubGlyph size={15} className="text-av-paper" />}
          label="Github"
          provider="github"
          loading={oauthLoading}
          onClick={handleOAuth}
        />
      </div>

      {isConnected ? (
        <div className="mt-3 w-full rounded-lg border border-av-paper/15 bg-av-paper/5 px-3 py-3 text-[14px] font-medium text-av-paper">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <WalletIcon size={16} className="text-av-paper/80" />
              {shortAccount}
            </span>
            <button
              type="button"
              onClick={() => void disconnectWallet()}
              className="text-[12px] text-av-paper/50 underline underline-offset-2 hover:text-av-paper/80"
            >
              Disconnect
            </button>
          </div>
          <p className="m-0 mt-1 text-[12px] text-av-paper/50">{balanceHbar ? `${balanceHbar} HBAR` : "…"}</p>
        </div>
      ) : isInitializing ? (
        <button
          type="button"
          disabled
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-av-paper/15 bg-av-paper/5 py-3 text-[14px] font-medium text-av-paper opacity-60"
        >
          <WalletIcon size={16} className="text-av-paper/80" />
          Connect wallet
        </button>
      ) : (
        <ConnectWalletButton
          isBusy={isBusy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-av-paper/15 bg-av-paper/5 py-3 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-paper/10 disabled:opacity-60"
        />
      )}
      <p className="mt-2 text-center text-[11px] text-av-paper/40">HashPack via WalletConnect</p>
    </div>
  );
}
