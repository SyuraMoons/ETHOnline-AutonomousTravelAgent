import { SkeletonBlock } from "~~/components/autovoyage/ui/Skeleton";

export default function ApproveLoading() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-6 py-6">
        <SkeletonBlock className="h-5 w-56" />
        <div className="rounded border border-av-border bg-av-card p-5">
          <SkeletonBlock className="h-4 w-2/5" />
          <SkeletonBlock className="mt-2 h-3.5 w-1/4" />
          <SkeletonBlock className="mt-4 h-6 w-24" />
        </div>
      </div>
      <aside className="sticky top-0 hidden h-svh w-[340px] flex-shrink-0 flex-col border-l border-av-border bg-av-card sm:flex">
        <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
          <SkeletonBlock className="h-4 w-16" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <SkeletonBlock className="h-10 w-4/5" />
          <SkeletonBlock className="ml-auto h-10 w-3/5" />
        </div>
      </aside>
    </div>
  );
}
