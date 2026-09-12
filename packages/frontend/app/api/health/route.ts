import { NextResponse } from "next/server";

function isPublicHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const privateIpv4 =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      /^169\.254\./.test(hostname);
    const localIpv6 = hostname === "[::1]" || hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("[fe80:");

    return url.protocol === "https:" && !url.username && !url.password && hostname !== "localhost" && hostname !== "127.0.0.1" && !privateIpv4 && !localIpv6;
  } catch {
    return false;
  }
}

export async function GET() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE ?? "live";
  const validDemoMode = demoMode === "offline" || demoMode === "live";
  const network = process.env.X402_NETWORK ?? "hedera:testnet";
  const checks = {
    auth: Boolean(
      process.env.AUTH_SECRET &&
        process.env.AUTH_GOOGLE_ID &&
        process.env.AUTH_GOOGLE_SECRET &&
        process.env.AUTH_GITHUB_ID &&
        process.env.AUTH_GITHUB_SECRET,
    ),
    facilitator: isPublicHttpsUrl(process.env.FACILITATOR_URL),
    hedera: Boolean(process.env.HEDERA_RPC_URL || process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL),
    wallet: Boolean(process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID),
    network: Boolean(process.env.NEXT_PUBLIC_X402_NETWORK && process.env.NEXT_PUBLIC_X402_NETWORK === network),
    hcs: Boolean(process.env.HCS_REGISTRY_TOPIC_ID && process.env.HCS_AUDIT_TOPIC_ID),
    worldId: Boolean(process.env.WORLD_APP_ID && process.env.WORLD_ACTION_ID && process.env.WORLD_API_KEY),
    execution: Boolean(process.env.EXECUTION_TOKEN_SECRET && process.env.EXECUTION_TOKEN_TTL_SECONDS),
    llm: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  const liveConfigurationReady = validDemoMode && (demoMode === "offline" || Object.values(checks).every(Boolean));

  return NextResponse.json(
    {
      ok: liveConfigurationReady,
      phase: demoMode === "offline" ? "demo" : "frontend",
      demoMode,
      network,
      checks,
      liveConfigurationReady,
    },
    { status: liveConfigurationReady ? 200 : 503 },
  );
}
