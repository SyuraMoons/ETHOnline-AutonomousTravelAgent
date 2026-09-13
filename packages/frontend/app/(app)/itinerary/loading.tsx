import { SkeletonBlock, SkeletonHeader } from "~~/components/autovoyage/ui/Skeleton";

function SectionSkeleton() {
  return (
    <div className="rounded border border-av-border bg-av-card">
      <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
        <SkeletonBlock className="h-3.5 w-20" />
        <SkeletonBlock className="h-3.5 w-14" />
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <SkeletonBlock className="h-4 w-3/5" />
        <SkeletonBlock className="h-4 w-2/5" />
      </div>
    </div>
  );
}

export default function ItineraryLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <SkeletonHeader />
        <SkeletonBlock className="h-6 w-20 rounded-full" />
      </div>
      <SectionSkeleton />
      <SectionSkeleton />
      <SectionSkeleton />
      <SectionSkeleton />
    </div>
  );
}
