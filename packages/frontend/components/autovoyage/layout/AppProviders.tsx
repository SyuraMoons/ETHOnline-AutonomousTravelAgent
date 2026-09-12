"use client";

// Wallet/x402 providers for the (app) product shell
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import type { Config } from "wagmi";
import { WagmiProvider } from "wagmi";
import { AuthorizationProvider } from "~~/services/autovoyage/authorizationContext";
import { HederaWalletConnectProvider } from "~~/services/web3/hederaWalletConnect";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig as Config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <HederaWalletConnectProvider>
          {/* Inside the wallet provider: granting an allowance needs the connected account. */}
          <AuthorizationProvider>
            {/* Instant feedback on the click itself, before any route's loading.tsx/skeleton
                even mounts — the only signal client-heavy pages get, since their server wait
                is near zero. */}
            <ProgressBar height="2px" color="#2563eb" shallowRouting />
            {children}
            <Toaster />
          </AuthorizationProvider>
        </HederaWalletConnectProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
