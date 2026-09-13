import { SkeletonBlock, SkeletonHeader, SkeletonRows, SkeletonStatTiles } from "~~/components/autovoyage/ui/Skeleton";

export default function ActivityLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-6 py-6">
      <SkeletonHeader />
      <SkeletonStatTiles />
      <div>
        <SkeletonBlock className="mb-2 h-3 w-16" />
        <SkeletonRows count={5} />
      </div>
    </div>
  );
}
