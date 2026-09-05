# Contributing

This document is the source of truth for how we branch, commit, and open PRs
during the hackathon. Four people are working in parallel — follow this so we
don't collide.

## Branch model

| Branch | Purpose | Who commits directly |
|---|---|---|
| `main` | Always demo-ready. Only receives merges from `development` at checkpoints. | Nobody — only via PR from `development`. |
| `development` | Integration branch. Everyone's `feat/*` branches merge here first. | Nobody — only via PR from `feat/*`. |
| `feat/<short-name>` | One branch per task/feature. | The person doing that task. |

`development` is the default branch — new PRs target it automatically. `main`
has branch protection: no direct pushes, PR required.

## Day-to-day workflow

```bash
# always branch off the latest development
git checkout development
git pull origin development
git checkout -b feat/supplier-x402-endpoint

# ... work, commit ...

git push -u origin feat/supplier-x402-endpoint
# open a PR: feat/supplier-x402-endpoint -> development
```

Example `feat/*` branch names for this project's first tasks:
`feat/monorepo-scaffold`, `feat/supplier-x402-endpoint`,
`feat/web-mandate-engine`, `feat/world-id-consent`,
`feat/hcs-audit-writer`, `feat/flight-data-scraper`.

`development` → `main` only happens at the three checkpoints defined in the
PRD (first real payment / agent end-to-end / demo freeze) — not on every
small merge.

## Commit message convention

Use **Conventional Commits** so the history stays readable with 4 people
committing in parallel:

```
<type>(<scope>): <short description>

feat(supplier): add x402 402-challenge on /v1/flights/search
fix(web): correct itinerary hash recomputation on /api/execute
chore(repo): scaffold pnpm workspace and contracts package
docs(readme): add setup instructions
refactor(agent): extract mandate check into pure function
```

Allowed `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
Allowed `scope`: `web`, `supplier`, `contracts`, `repo`, `agent`, `docs`.

Keep the first line under ~72 characters; add detail in the body if needed.

## PR rules

- PR title follows the same Conventional Commits format as commits.
- PR description must state: what it does, which task/checkpoint it maps to
  (per the PRD task tables), and how to verify it locally.
- At least a self-review before merging into `development` (checkbox in the
  PR template is enough for a hackathon — don't over-engineer this).
- Squash-merge `feat/*` → `development` (keeps `development` history clean).
- Regular merge (not squash) for `development` → `main` (keeps checkpoint
  history visible).
