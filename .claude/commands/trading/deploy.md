---
description: 🚀 Deploy trading bot — Docker, PM2, or bare metal
argument-hint: [target: docker|pm2|check]
---

**Think** để deploy trading bot: <args>$ARGUMENTS</args>

## Context

CWD: `apps/algo-trader`
Docker: `Dockerfile` + `docker-compose.yml`
PM2: `ecosystem.config.js`

## Deploy Options

### docker — Full stack with Redis + Postgres
```bash
cd apps/algo-trader
docker compose up -d
docker compose logs -f algo-trader
```

### pm2 — Process manager (bare metal)
```bash
cd apps/algo-trader
pnpm build
pm2 start ecosystem.config.js
pm2 logs algo-trader
```

### check — Verify deployment
```bash
# Docker
docker compose ps
docker compose logs --tail 20 algo-trader

# PM2
pm2 status
pm2 logs algo-trader --lines 20
```

## Pre-deploy Checklist

1. ✅ `.env` configured (API keys, DB URL, Redis URL)
2. ✅ `pnpm build` passes (0 TS errors)
3. ✅ `pnpm test` passes (1216/1216)
4. ✅ Exchange API keys valid
5. ✅ Risk parameters set (max position, stop-loss, daily limit)

## Post-deploy Verification

```bash
# Health check
curl -s http://localhost:3001/health

# Exchange connectivity
curl -s http://localhost:3001/api/exchanges/health

# Dashboard
open http://localhost:5173
```

⚠️ **CRITICAL**: Verify risk parameters TRƯỚC khi enable live trading!
