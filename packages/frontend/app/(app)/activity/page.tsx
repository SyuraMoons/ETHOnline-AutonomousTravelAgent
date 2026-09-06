// Activity page
import { getActivityFeed } from "~~/services/autovoyage/tripData";
import { StatTile } from "~~/components/autovoyage/activity/StatTile";
import { X402ActivityRow } from "~~/components/autovoyage/activity/X402ActivityRow";

export default async function ActivityPage() {
  const feed = await getActivityFeed();

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-[22px] font-semibold text-av-text">Agent activity</h1>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          Every autonomous action and x402 agent-to-agent payment, streamed as it happens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {feed.stats.map(tile => (
          <StatTile key={tile.label} tile={tile} />
        ))}
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">{feed.group}</p>
        <div className="flex flex-col gap-2">
          {feed.rows.map((row, i) => (
            <X402ActivityRow key={i} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}
