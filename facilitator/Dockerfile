# Self-hosted x402 Hedera facilitator
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies first for better layer caching (includes tsx).
# Uses the committed lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

# No ENV PORT: src/server.ts already defaults to 4020, and a hosted runtime
# (Railway et al.) injects its own PORT which must win.
EXPOSE 4020

# Drop root privileges.
USER node

CMD ["npx", "tsx", "src/server.ts"]
