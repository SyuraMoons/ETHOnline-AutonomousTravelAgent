# FRONTEND — read me first

Orientation for anyone picking up the AutoVoyage frontend. Full detail is in
[`FRONTEND.md`](./FRONTEND.md).

## TL;DR

- The frontend **is `packages/nextjs`** (Next.js 15, App Router). There is no separate frontend app.
- All AutoVoyage UI lives under `packages/nextjs/components/autovoyage/<feature>/`. Never restyle
  `components/scaffold-hbar/` — that's payment/wallet plumbing.
- Two design systems, split by route group: `app/(marketing)/` (mono ink/clay: landing + login)
  and `app/(app)/` (light + blue: the product screens). See `DESIGN.md`.
- Shared data shapes (mandate / plan / audit) come from `@sh/contracts` — do not redefine them in
  the frontend.

## Where things are

| Thing | Path |
| --- | --- |
| Frontend app | `packages/nextjs/` |
| This structure doc | `FRONTEND/FRONTEND.md` (repo root) |
| Design source of truth | Figma file `bOAHzbAn1loghbwWw38hpf` |
| Planning docs (system/brand/rules) | `ETH GLOBAL 2026/` — one level above this repo: `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `autovoyage-hero-prompt.md`, `RaybanBuildSpec.md` |

## Current status (frontend)

- **Directory tree:** scaffolded in `packages/nextjs` (empty folders, `.gitkeep` placeholders). No
  pages or components coded yet.
- **Landing page:** design in Figma is being revised; build starts once it's finalized.
- **Everything else:** not started. See `FRONTEND.md §4` for the screen → file map.

## Rules that bite (from `RULES.md`)

- **Design-first (ADR-008):** a page is coded only after it exists in Figma.
- Design tokens, not hardcoded hex. 4px radius everywhere (the hero glass card is the only
  pill-radius exception).
- Branch off `main` (`feat/<slug>`); never commit to `main`. No attribution lines in commits/PRs.
