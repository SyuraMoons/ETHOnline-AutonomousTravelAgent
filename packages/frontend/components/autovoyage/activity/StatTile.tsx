// Stat tile
import type { StatTile as Tile } from "~~/types/autovoyage/plan";

export function StatTile({ tile }: { tile: Tile }) {
  return (
    <div className="rounded border border-av-border bg-av-card px-5 py-4">
      <p className="m-0 text-[22px] font-semibold text-av-text">{tile.value}</p>
      <p className="m-0 mt-0.5 text-[13px] text-av-muted">{tile.label}</p>
    </div>
  );
}
