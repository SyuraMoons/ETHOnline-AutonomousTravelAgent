# Meridian Flight Data — the x402-gated supplier.
#
# BUILD CONTEXT IS THE REPO ROOT, not this directory:
#   docker build -f packages/supplier/Dockerfile -t supplier .
# It needs the root lockfile (npm workspaces resolve @sh/contracts) and the
# repo-root data/cache/*.json that src/lib/*Cache.ts read four levels up.
#
# Runs TypeScript directly via tsx, like facilitator/Dockerfile does. A `tsc`
# build would emit dist/*.js whose `import { canonicalJson } from "@sh/contracts"`
# resolves to that package's main — raw TypeScript — which node cannot load.
FROM node:20-alpine

WORKDIR /app

# Root manifest + lock, plus every workspace manifest: npm validates the lockfile
# against the root `workspaces` array, so all four must exist even though only
# two get installed.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/supplier/package.json ./packages/supplier/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/hardhat/package.json ./packages/hardhat/

# Only the supplier + contracts trees; the frontend and hardhat trees are ~1GB
# and nothing here imports them.
RUN npm ci --omit=dev --no-audit --no-fund \
      --include-workspace-root \
      -w @sh/contracts -w @sh/supplier

COPY packages/contracts ./packages/contracts
COPY packages/supplier ./packages/supplier
# src/lib/{flights,stays,activities}Cache.ts resolve ../../../../data/cache/*.json,
# so the repo layout has to survive into the image.
COPY data/cache ./data/cache

WORKDIR /app/packages/supplier

ENV NODE_ENV=production
# Default only — Railway injects its own PORT, which config.ts prefers.
EXPOSE 4100

# Drop root privileges.
USER node

CMD ["npx", "tsx", "src/index.ts"]
