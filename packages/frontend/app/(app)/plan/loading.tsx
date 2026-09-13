import { SkeletonBlock } from "~~/components/autovoyage/ui/Skeleton";

export default function PlanLoading() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-av-border bg-av-card px-6 py-4">
          <div>
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="mt-2 h-3.5 w-72 max-w-full" />
          </div>
          <div className="h-8 w-8 flex-shrink-0 rounded-full border border-av-border bg-av-bg" />
        </header>
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-6 py-6">
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      </div>
      <aside className="sticky top-0 hidden h-svh w-[340px] flex-shrink-0 flex-col border-l border-av-border bg-av-card sm:flex">
        <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
          <SkeletonBlock className="h-4 w-16" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <SkeletonBlock className="h-10 w-4/5" />
          <SkeletonBlock className="ml-auto h-10 w-3/5" />
          <SkeletonBlock className="h-16 w-4/5" />
        </div>
      </aside>
    </div>
  );
}
