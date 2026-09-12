import { SkeletonBlock, SkeletonHeader, SkeletonRows } from "~~/components/autovoyage/ui/Skeleton";

export default function AuditLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col px-6 py-6">
      <SkeletonHeader />
      <div className="mt-5 mb-5 flex w-fit gap-1 rounded border border-av-border p-0.5">
        <SkeletonBlock className="h-7 w-12" />
        <SkeletonBlock className="h-7 w-20" />
        <SkeletonBlock className="h-7 w-24" />
      </div>
      <SkeletonBlock className="mb-2 h-3 w-16" />
      <SkeletonRows count={5} />
    </div>
  );
}
