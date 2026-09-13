"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import type { ChainNamespace } from "@reown/appkit-common";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { parseHederaAccountId } from "~~/utils/scaffold-hbar/hederaAccountId";

// Hardcoded rather than imported from @hashgraph/hedera-wallet-connect: that package's root
// barrel re-exports a submodule that statically imports the ESM-only @walletconnect/modal,
// which crashes Next's server render (`ERR_REQUIRE_ESM`) the moment any file eagerly mounted
// in the app (like this provider) touches the package at module-eval time. The value is a
// stable literal (`export const hederaNamespace = 'hedera'` in the package's own source).
const HEDERA_NAMESPACE = "hedera" as ChainNamespace;

type HederaWalletConnectContextValue = {
  provider: HederaProvider | null;
  /** Native Hedera account id from the WalletConnect session. */
  hederaAccountId: string | null;
  /** Alias of `hederaAccountId` for display components. */
  accountId: string | null;
  hasHederaSession: boolean;
  isConnected: boolean;
  isInitializing: boolean;
  isBusy: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
};

const HederaWalletConnectContext = createContext<HederaWalletConnectContextValue | undefined>(undefined);

let initPromise: Promise<HederaProvider> | null = null;
// Populated once `ensureInit()` resolves. `appKitHedera.ts` is loaded via dynamic import()
// rather than a top-level one so the real @hashgraph/hedera-wallet-connect package (and its
// @walletconnect/modal dependency) is only ever required client-side, after mount — never
// during server-side render. See the HEDERA_NAMESPACE comment above for why.
let appKitHedera: typeof import("./appKitHedera") | null = null;

/** Initialise AppKit + HederaProvider once for the page lifetime (AppKit is a module singleton). */
function ensureInit(): Promise<HederaProvider> {
  if (!initPromise) {
    initPromise = import("./appKitHedera").then(mod => {
      appKitHedera = mod;
      return mod.initAppKit().then(() => mod.getHederaProvider());
    });
  }
  return initPromise;
}

export const HederaWalletConnectProvider = ({ children }: { children: React.ReactNode }) => {
  const { disconnect } = useDisconnect();
  const [provider, setProvider] = useState<HederaProvider | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  /** Bumps when the WC provider session or AppKit account state changes. */
  const [sessionTick, setSessionTick] = useState(0);
  /** Local override so disconnect reflects immediately even if the SDK never fires its session events. */
  const [forceDisconnected, setForceDisconnected] = useState(false);
  const { address: appKitHederaAddress, isConnected: appKitHederaConnected } = useAppKitAccount({
    namespace: HEDERA_NAMESPACE,
  });

  useEffect(() => {
    if (appKitHederaConnected) setForceDisconnected(false);
  }, [appKitHederaConnected]);

  useEffect(() => {
    let mounted = true;
    void ensureInit()
      .then(hp => {
        if (mounted) setProvider(hp);
      })
      .catch(err => console.error("HederaWalletConnect init failed", err))
      .finally(() => {
        if (mounted) setIsInitializing(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!provider) return;
    const bump = () => setSessionTick(t => t + 1);
    const providerWithEvents = provider as unknown as {
      on?: (event: string, cb: () => void) => void;
      off?: (event: string, cb: () => void) => void;
    };

    if (typeof providerWithEvents.on === "function") {
      providerWithEvents.on("session_update", bump);
      providerWithEvents.on("session_delete", bump);
      providerWithEvents.on("connect", bump);
      providerWithEvents.on("disconnect", bump);
    }
    return () => {
      if (typeof providerWithEvents.off === "function") {
        providerWithEvents.off("session_update", bump);
        providerWithEvents.off("session_delete", bump);
        providerWithEvents.off("connect", bump);
        providerWithEvents.off("disconnect", bump);
      }
    };
  }, [provider]);

  useEffect(() => {
    setSessionTick(t => t + 1);
  }, [appKitHederaConnected, appKitHederaAddress]);

  const disconnectWallet = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await disconnect({ namespace: HEDERA_NAMESPACE });
    } catch (error) {
      console.error("HashPack disconnect failed", error);
    } finally {
      setForceDisconnected(true);
      setSessionTick(t => t + 1);
      setIsBusy(false);
    }
  }, [isBusy, disconnect]);

  const connectWallet = useCallback(async () => Promise.resolve(), []);

  const { hederaAccountId, hederaSessionReady, isConnected } = useMemo(() => {
    void sessionTick;

    if (forceDisconnected) {
      return { hederaAccountId: null, hederaSessionReady: false, isConnected: false };
    }

    const fromProvider = appKitHedera?.getHederaAccountIdFromSession(provider) ?? null;
    const fromAppKit = appKitHederaConnected && appKitHederaAddress ? parseHederaAccountId(appKitHederaAddress) : null;
    const accountId = fromProvider ?? fromAppKit;
    const sessionReady = appKitHedera?.hasHederaSession(provider) ?? false;
    const connected = Boolean(accountId);

    return {
      hederaAccountId: accountId,
      hederaSessionReady: sessionReady,
      isConnected: connected,
    };
  }, [sessionTick, provider, appKitHederaConnected, appKitHederaAddress, forceDisconnected]);

  const value = useMemo<HederaWalletConnectContextValue>(
    () => ({
      provider,
      hederaAccountId,
      accountId: hederaAccountId,
      hasHederaSession: hederaSessionReady,
      isConnected,
      isInitializing,
      isBusy,
      connectWallet,
      disconnectWallet,
    }),
    [
      provider,
      hederaAccountId,
      hederaSessionReady,
      isConnected,
      isInitializing,
      isBusy,
      connectWallet,
      disconnectWallet,
    ],
  );

  return <HederaWalletConnectContext.Provider value={value}>{children}</HederaWalletConnectContext.Provider>;
};

export const useHederaWalletConnect = () => {
  const ctx = useContext(HederaWalletConnectContext);
  if (!ctx) throw new Error("useHederaWalletConnect must be used inside HederaWalletConnectProvider");
  return ctx;
};
