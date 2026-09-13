import { SkeletonBlock } from "~~/components/autovoyage/ui/Skeleton";

export default function ChatLoading() {
  return (
    <div className="fixed inset-y-0 left-[236px] right-0 flex flex-col">
      <header className="flex items-center justify-between border-b border-av-border bg-av-card px-4 py-3 sm:px-6">
        <SkeletonBlock className="h-4 w-14" />
        <SkeletonBlock className="h-4 w-20" />
      </header>
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3 px-6 py-6">
        <SkeletonBlock className="ml-auto h-10 w-2/5" />
        <SkeletonBlock className="h-16 w-3/5" />
        <SkeletonBlock className="ml-auto h-10 w-1/3" />
      </div>
    </div>
  );
}
