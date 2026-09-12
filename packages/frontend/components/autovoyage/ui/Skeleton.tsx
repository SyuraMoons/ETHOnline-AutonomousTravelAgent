// Loading-state placeholders shared by route `loading.tsx` files and in-component hydration
// states (client pages whose data arrives after mount, where `loading.tsx` alone would flash
// and disappear too early). Kept dependency-free — just `animate-pulse` over the existing
// `av-*` tokens, matching the card recipe used by X402ActivityRow / AuditList /StatTile.

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-av-border/70 ${className}`} />;
}

/** One card-shaped row placeholder, sized to match X402ActivityRow / AuditList rows. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded border border-av-border bg-av-card px-4 py-3">
      <SkeletonBlock className="h-8 w-8 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-3.5 w-2/5" />
        <SkeletonBlock className="mt-2 h-2.5 w-3/5" />
      </div>
      <div className="flex-shrink-0 text-right">
        <SkeletonBlock className="h-3.5 w-16" />
        <SkeletonBlock className="mt-2 ml-auto h-2.5 w-10" />
      </div>
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** Matches StatTile.tsx's 3-tile grid on /activity. */
export function SkeletonStatTiles() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded border border-av-border bg-av-card px-5 py-4">
          <SkeletonBlock className="h-6 w-16" />
          <SkeletonBlock className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Matches the `<h1> + <p>` page-title pattern every AutoVoyage page opens with. */
export function SkeletonHeader() {
  return (
    <div>
      <SkeletonBlock className="h-6 w-52" />
      <SkeletonBlock className="mt-2 h-3.5 w-80 max-w-full" />
    </div>
  );
}

/** Matches /profile's contact-card layout — shared by its `loading.tsx` and its
 * in-component hydration state, since the page is a client component that fetches
 * after mount and `loading.tsx` alone would flash and disappear too early. */
export function SkeletonProfileForm() {
  return (
    <main className="mx-auto flex w-full max-w-210 flex-col gap-6 px-6 py-8">
      <header>
        <SkeletonBlock className="h-2.5 w-24" />
        <SkeletonBlock className="mt-3 h-7 w-32" />
        <SkeletonBlock className="mt-2 h-3.5 w-96 max-w-full" />
      </header>
      <section className="rounded border border-av-border bg-av-card p-6">
        <div className="flex items-center gap-3 border-b border-av-border pb-4">
          <SkeletonBlock className="h-5 w-5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-48 max-w-full" />
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-10.5 w-full" />
            </div>
          ))}
        </div>
      </section>
      <div className="flex items-center justify-end">
        <SkeletonBlock className="h-10 w-32" />
      </div>
    </main>
  );
}
