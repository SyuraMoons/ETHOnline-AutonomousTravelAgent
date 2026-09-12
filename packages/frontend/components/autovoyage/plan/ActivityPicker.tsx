"use client";

// Activity picker
import { useState } from "react";
import type { ActivitiesSection, ActivitySuggestion } from "~~/types/autovoyage/plan";
import { formatUsd } from "~~/services/autovoyage/currency";
import { MapPinIcon, PlusIcon } from "../ui/icons";

function ActivityCard({ item }: { item: ActivitySuggestion }) {
  return (
    <div className="flex flex-col rounded border border-av-border p-3">
      <div className="flex items-start justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded bg-av-blue-tint text-av-blue">
          <MapPinIcon size={16} />
        </span>
        <span className="text-[14px] font-semibold text-av-text">{formatUsd(item.priceMinor)}</span>
      </div>
      <p className="m-0 mt-3 text-[14px] font-semibold text-av-text">{item.name}</p>
      <p className="m-0 mt-0.5 text-[12px] text-av-muted">{item.sub}</p>
      <p className="m-0 mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-av-muted">{item.meta}</p>
      <button
        type="button"
        className="mt-3 flex items-center justify-center gap-1 rounded border border-av-border py-1.5 text-[13px] font-medium text-av-blue transition-colors hover:bg-av-blue-tint"
      >
        <PlusIcon size={14} />
        Add
      </button>
    </div>
  );
}

export function ActivityPicker({ activities }: { activities: ActivitiesSection }) {
  const [pace, setPace] = useState(activities.defaultPace);

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[13px] text-av-muted">Choose your pace, the agent matches suggestions.</p>
        <div className="flex rounded border border-av-border p-0.5">
          {activities.paces.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPace(p)}
              className={`rounded px-3 py-1 text-[13px] font-medium transition-colors ${
                pace === p ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:text-av-text"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {activities.items.map(item => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
