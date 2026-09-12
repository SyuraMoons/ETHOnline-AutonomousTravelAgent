"use client";

// Activity page
import { useEffect, useMemo, useState } from "react";
import { StatTile } from "~~/components/autovoyage/activity/StatTile";
import { X402ActivityRow } from "~~/components/autovoyage/activity/X402ActivityRow";
import { Pagination, usePagination } from "~~/components/autovoyage/ui/Pagination";
import { SkeletonRows, SkeletonStatTiles } from "~~/components/autovoyage/ui/Skeleton";
import { buildActivityFeed } from "~~/services/autovoyage/activityFeed";
import { useAuthorization } from "~~/services/autovoyage/authorizationContext";

export default function ActivityPage() {
  const { mandateId, mandate, refreshMandate } = useAuthorization();
  // True until the mandate's spend log has been (re)fetched at least once, so the page shows
  // a skeleton instead of briefly claiming "No settled payments yet." to a user who has spend.
  const [hydrating, setHydrating] = useState(true);

  // Pick up any spend that settled before this page mounted — the context only refetches the
  // mandate after an action that spends money, not on a timer.
  useEffect(() => {
    if (!mandateId) {
      setHydrating(false);
      return;
    }
    void refreshMandate().finally(() => setHydrating(false));
  }, [mandateId, refreshMandate]);

  const feed = useMemo(() => buildActivityFeed(mandate), [mandate]);
  const { page, pageCount, slice, setPage, total, pageSize } = usePagination(feed.rows);

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-[22px] font-semibold text-av-text">Agent activity</h1>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          Every autonomous action and x402 agent-to-agent payment, streamed as it happens.
        </p>
      </div>

      {hydrating ? (
        <>
          <SkeletonStatTiles />
          <SkeletonRows count={5} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {feed.stats.map(tile => (
              <StatTile key={tile.label} tile={tile} />
            ))}
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">{feed.group}</p>
            {feed.rows.length === 0 ? (
              <p className="m-0 text-[13px] text-av-muted">No settled payments yet.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {slice.map((row, i) => (
                    <X402ActivityRow key={i} row={row} />
                  ))}
                </div>
                <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
