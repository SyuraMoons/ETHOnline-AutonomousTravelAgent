import type { MandateState } from "~~/services/autovoyage/authorizationContext";
import type { ActivityFeed } from "~~/types/autovoyage/plan";

function truncateTx(tx: string): string {
  return tx.length > 12 ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : tx;
}

function formatGroup(mostRecentAt: string | undefined): string {
  if (!mostRecentAt) return "No activity yet";
  const date = new Date(mostRecentAt);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Builds the Activity feed from the real, current mandate's settled spend log — no mock data. */
export function buildActivityFeed(mandate: MandateState | null): ActivityFeed {
  const spend = mandate?.spend ?? [];

  if (spend.length === 0) {
    return {
      stats: [
        { value: "0", label: "Autonomous actions" },
        { value: "0 HBAR", label: "Spent by agents (x402)" },
        { value: "0", label: "Pending your approval" },
      ],
      group: "No activity yet",
      rows: [],
    };
  }

  const totalHbar = spend.reduce((sum, r) => sum + r.amountHbar, 0);
  const newestFirst = [...spend].reverse();

  return {
    stats: [
      { value: String(spend.length), label: "Autonomous actions" },
      { value: `${totalHbar} HBAR`, label: "Spent by agents (x402)" },
      { value: "0", label: "Pending your approval" },
    ],
    group: formatGroup(newestFirst[0]?.at),
    rows: newestFirst.map(record => ({
      title: "Agent payment",
      ref: `${truncateTx(record.transaction)} · x402 settled`,
      amount: `${record.amountHbar} HBAR`,
      time: new Date(record.at).toLocaleTimeString(),
    })),
  };
}
