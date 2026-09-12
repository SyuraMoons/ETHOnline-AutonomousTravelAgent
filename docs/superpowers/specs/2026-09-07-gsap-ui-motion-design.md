# AutoVoyage — GSAP UI Motion (design spec)

- **Date:** 2026-09-07
- **Status:** Approved design, ready for implementation planning
- **Scope:** `packages/frontend` only. Motion polish on already-built, already-designed screens.
- **Branch:** `feat/gsap-motion` (off `Frontend`)

## Goal

Add tasteful motion that makes the UI feel alive **without making the app heavier**. The app is
calm/precise by brand and must stay snappy (no lag). Therefore: CSS carries the everyday polish for
free, and GSAP is used **only** on a few signature beats where a sequenced timeline earns its
weight — and even then it is loaded lazily so it never blocks rendering.

## Approach (chosen)

**CSS-first + GSAP lazy-loaded only on the signature beats.**

- The subtle baseline (entrances, hovers, reveals, overlay fades) is **pure CSS/Tailwind** — zero
  JS weight.
- Four signature beats use **GSAP core** timelines, loaded via a **runtime dynamic import** so GSAP
  is in **no initial bundle** and never blocks first paint.
- No ScrollTrigger, no `@gsap/react`, no other plugins — GSAP **core only**.

Rejected alternatives: (2) GSAP everywhere via `useGSAP` — heavier, ships GSAP broadly, does in JS
what CSS does for free; (3) no GSAP at all — lightest but the sequenced beats come out clunky (CSS
is poor at coordinated timelines).

## The four signature beats (GSAP)

Each beat component **renders its final (correct) state on the server/first paint**. The animation
plays only after mount, client-side, when motion is allowed. Animate **transform + opacity only**.

1. **Hero entrance** — `components/autovoyage/marketing/Hero.tsx` (route `/`)
   - On load: eyebrow → headline → subtitle → glass prompt card → trust strip **stagger up + fade
     in** as one timeline. Video + scrim are unaffected.
   - Duration ~0.9s total, per-item stagger ~0.08s, easing `power3.out`. Items start at
     `y: 16, opacity: 0` → `y: 0, opacity: 1`.
   - Trigger: on mount.

2. **Agent "planning" stepper** — `components/autovoyage/plan/AgentSteps.tsx` (route `/plan` only;
   the chat screen has its own thread, no stepper)
   - Steps fade/slide in with a stagger; completed-step checks pop; the active step's dot gives a
     soft repeating pulse (scale 1 ↔ 1.15, ~1.2s, 2–3 iterations then rest); the
     `paid 0.05 USDC · x402` note fades in last.
   - Duration ~1.0–1.2s for the entrance; the pulse is a short, bounded loop (not infinite).
   - Trigger: on mount.

3. **Over-limit approval gate** — `components/autovoyage/approval/ApprovalFocus.tsx` (routes
   `/approve`, `/chat?approve=1`)
   - The `$980` amount + amber "over limit" note get a subtle emphasis (scale 0.96 → 1 + fade); the
     camera-frame dashed border fades/scales in.
   - Duration ~0.6s, easing `power2.out`.
   - Trigger: on mount.

4. **Booking Confirmed reveal** — `components/autovoyage/approval/BookingConfirmedModal.tsx`
   (route `/plan?booked=1`)
   - Modal fades + scales in (0.98 → 1); the green "Booking confirmed" chip pops (scale 0.8 → 1);
     summary rows stagger; on-chain proof rows settle in last.
   - Duration ~0.8s. **Restrained** — no confetti / no bounce overshoot (anti-slop).
   - Trigger: on mount (modal appears when `?booked=1`).

## CSS baseline (no GSAP, zero JS weight)

Handled entirely in Tailwind/`globals.css`, disabled under reduced motion:

- Landing feature-row / section reveals: a shared `.reveal` class toggled by a small
  **IntersectionObserver** helper (`hooks/autovoyage/useReveal.ts` or a tiny client wrapper) —
  fade + `translateY(12px)` → settle. No GSAP, no ScrollTrigger.
- Overlay/modal fade-ins that are **not** beats (wallet modal, generic dim backdrops): CSS fade.
- Hovers, button `active:scale`, tab/pace-toggle switches: existing CSS transitions (unchanged).

## The lazy-load pattern (`hooks/autovoyage/useBeat.ts`)

A single small hook encapsulates the "load GSAP async, play once, clean up" logic so beat
components stay simple.

Contract:

```ts
// useBeat(ref, build): runs `build(gsap, el)` once, after mount, only if motion is allowed.
// - No-op (leaves final state) when: SSR, prefers-reduced-motion: reduce, ref is null,
//   or the dynamic import of gsap fails.
// - Returns nothing; handles cleanup (kills the timeline/tween) on unmount.
export function useBeat(
  ref: RefObject<HTMLElement | null>,
  build: (gsap: GSAPStatic, el: HTMLElement) => gsap.core.Timeline | gsap.core.Tween | void,
): void;
```

Implementation notes:

- `"use client"`; runs in `useEffect`.
- Guards: `if (typeof window === "undefined") return;` and
  `if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;`.
- `const { gsap } = await import("gsap");` inside the effect (runtime, code-split) — GSAP is never
  in an initial bundle; it loads after first paint when a beat mounts.
- Store the returned timeline/tween and `.kill()` it in the effect cleanup.
- Wrap `build` in `gsap.context(..., el)` for scoped selectors + easy cleanup where useful.

Because beat components render their final state first, a failed/slow GSAP load or reduced motion
simply means "no animation" — never a broken or empty UI, never layout shift.

## Reduced motion + performance rules (hard requirements)

- **Reduced motion:** `prefers-reduced-motion: reduce` disables all beats (via `useBeat` guard) and
  all CSS animations (via `@media (prefers-reduced-motion: reduce)` in `globals.css`). Final state
  renders with no motion.
- **GPU-only properties:** animate **only `transform` and `opacity`**. Never animate
  width/height/top/left/margin (layout thrash).
- **`will-change`:** applied only for the duration of a beat, then cleared; not left on statically.
- **Non-blocking:** components are fully interactive the instant they render; GSAP never gates
  interactivity or first paint. Timelines capped at ~1.2s. No infinite loops (the stepper pulse is
  bounded).

## Dependencies

- Add **`gsap`** to `packages/frontend/package.json`, **pinned to an exact version** (confirm the
  current stable `3.x` at install; no `latest`, no `^`).
- Do **not** add `@gsap/react`, ScrollTrigger, or any other plugin.

## Files changed

- **New:** `hooks/autovoyage/useBeat.ts` (the lazy GSAP hook), `hooks/autovoyage/useReveal.ts`
  (IntersectionObserver reveal for the CSS baseline).
- **Edit:** `components/autovoyage/marketing/Hero.tsx`, `components/autovoyage/plan/AgentSteps.tsx`,
  `components/autovoyage/approval/ApprovalFocus.tsx`,
  `components/autovoyage/approval/BookingConfirmedModal.tsx` — attach a `ref` + `useBeat(...)`.
- **Edit:** `styles/globals.css` — reveal keyframes/classes + the `prefers-reduced-motion` guard.
- **Edit:** landing sections (`FeatureRow` / section components) — add the `.reveal` hook where
  wanted.
- `packages/frontend/package.json` — the pinned `gsap` dep.

## Footprint

- GSAP core ≈ 23kb gzipped, **async / non-blocking**, loaded only on routes that mount a beat:
  **`/`, `/plan`, `/approve`, `/chat`**. Zero GSAP on `/login`, `/activity`, `/audit`,
  `/itinerary`.
- No effect on LCP / first paint (final state renders first; GSAP loads after).

## Acceptance criteria

- With motion allowed, each of the four beats plays once on its route and looks restrained/on-brand.
- With `prefers-reduced-motion: reduce`, no beat and no CSS animation runs; all screens render in
  final state and are fully usable.
- `/login`, `/activity`, `/audit`, `/itinerary` network traffic contains **no GSAP chunk**.
- Landing first paint is unchanged (hero visible immediately; entrance plays after).
- All existing routes still return HTTP 200 with no console errors; buttons/flows unaffected.
- Only `transform`/`opacity` are animated (verify no layout-affecting properties in the tweens).

## Non-goals (YAGNI)

- No ScrollTrigger / scroll-scrubbed animation.
- No page-transition animations between routes.
- No animation on `/login`, `/activity`, `/audit`, `/itinerary`.
- No confetti, bounce/overshoot, or decorative looping motion.
- No new animated screens or Figma changes (motion only on existing designs).
