import "server-only";

/**
 * Shared Mirror Node base-URL lookup — the same map was copy-pasted across
 * app/api/hedera/{transaction,account,contract,allowance}/route.ts and
 * packages/hardhat/utils/resolveHederaContractId.ts. Centralized here for the audit reader;
 * those four routes are left as-is (out of scope for this change).
 */
const MIRROR_BASE: Record<string, string> = {
  testnet: process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com",
  mainnet: process.env.HEDERA_MIRROR_MAINNET_URL ?? "https://mainnet.mirrornode.hedera.com",
};

/** Reads the network out of X402_NETWORK (e.g. "hedera:testnet"), same var the x402 buyer/seller use. */
export function mirrorBaseUrl(): string {
  const network = (process.env.X402_NETWORK ?? "hedera:testnet").split(":")[1]?.toLowerCase() ?? "testnet";
  return MIRROR_BASE[network] ?? MIRROR_BASE.testnet;
}

export type MirrorTopicMessage = {
  consensus_timestamp: string;
  message: string; // base64
  sequence_number: number;
};

type TopicMessagesPage = {
  messages: MirrorTopicMessage[];
  links?: { next?: string | null };
};

const MAX_PAGES = 10;

/**
 * Reads every message on an HCS topic straight from Mirror Node, paginating via `links.next`
 * up to a sane cap. No local cache — the whole point of this reader is to reflect on-chain
 * consensus live, not an app-side copy that can drift or go stale.
 */
export async function fetchTopicMessages(
  topicId: string,
  opts: { order?: "asc" | "desc"; limit?: number } = {},
): Promise<MirrorTopicMessage[]> {
  const order = opts.order ?? "asc";
  const limit = opts.limit ?? 100;

  const base = mirrorBaseUrl();
  let path: string | null = `/api/v1/topics/${encodeURIComponent(topicId)}/messages?order=${order}&limit=${limit}`;
  const out: MirrorTopicMessage[] = [];

  for (let page = 0; page < MAX_PAGES && path; page++) {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) break; // topic has no messages yet
      throw new Error(`Mirror node topic messages request failed: ${res.status}`);
    }
    const data = (await res.json()) as TopicMessagesPage;
    out.push(...data.messages);
    path = data.links?.next ?? null;
  }

  return out;
}
