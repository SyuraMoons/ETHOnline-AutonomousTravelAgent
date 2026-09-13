"use client";

// Shared 5-per-page pagination: a tiny hook that slices an in-memory list, plus the bar UI.
// Both /activity and /audit already hold their full list in memory (mandate spend log,
// fixture audit trail) — pagination here is a view concern, not a data-fetching one.
import { useState } from "react";

export const PAGE_SIZE = 5;

export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp when the list shrinks under us (a filter tab change, a refetch) rather than
  // stranding the viewer on a page that no longer exists.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { page: current, pageCount, slice, setPage, total: items.length, pageSize };
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="m-0 text-[12px] text-av-muted">
        Showing {start}–{end} of {total}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded px-2.5 py-1 text-[13px] font-medium text-av-muted transition-colors hover:bg-av-bg hover:text-av-text disabled:opacity-40 disabled:hover:bg-transparent"
          >
            ‹ Prev
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? "page" : undefined}
              className={`rounded px-2.5 py-1 text-[13px] font-medium transition-colors ${
                n === page ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:bg-av-bg hover:text-av-text"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="rounded px-2.5 py-1 text-[13px] font-medium text-av-muted transition-colors hover:bg-av-bg hover:text-av-text disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Next ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
