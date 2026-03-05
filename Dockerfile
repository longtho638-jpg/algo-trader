# Stage 1: Build
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace packages required by algo-trader
COPY packages/trading-core ./packages/trading-core
COPY packages/vibe-arbitrage-engine ./packages/vibe-arbitrage-engine
COPY packages/vibe-billing-trading ./packages/vibe-billing-trading

# App source
COPY apps/algo-trader ./apps/algo-trader

# Install only algo-trader and its workspace deps
RUN pnpm install --frozen-lockfile --filter algo-trader...

# Build
RUN pnpm --filter algo-trader build

# Stage 2: Runner
FROM node:20-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

# Non-root user
RUN addgroup -S trader && adduser -S trader -G trader

# Copy built artifacts
COPY --from=builder /app/apps/algo-trader/dist ./dist
COPY --from=builder /app/apps/algo-trader/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p logs && chown -R trader:trader /app

USER trader

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
