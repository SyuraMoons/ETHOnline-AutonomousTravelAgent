"use client";

// Consumes a `?brief=` handed off from the landing page or a template chip, firing it
// through the same sendBrief() the composer uses, then stripping the param from the URL.
//
// /api/plan settles a real HBAR transfer per call, so the "fire once" guard here matters:
// `fired` is set *before* the async sendBrief() call (not after), and the param is stripped
// from the URL in the same tick — both, so neither a StrictMode double-mount nor a refresh
// of the still-briefed URL can trigger a second paid search.
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";

/** Mounted on both /plan (the default landing destination) and /chat (the full-screen
 * expand), so the URL it strips back to is whichever page it's actually running on. */
export function useAutoBrief() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { sendBrief } = usePlan();
  const fired = useRef(false);

  useEffect(() => {
    const brief = params.get("brief");
    if (!brief || fired.current) return;
    fired.current = true;
    router.replace(pathname);
    void sendBrief(brief);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
