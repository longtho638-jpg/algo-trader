# Self-Hosted Deployment Guide

Deploy algo-trader on your own infrastructure.

## Prerequisites

- Node.js 22+ (or Docker)
- Redis 7+
- NATS 2.10+ (optional, falls back to Redis pub/sub)
- 2GB RAM minimum, 4GB recommended

## Option A: Docker (Recommended)

```bash
# Pull image
docker pull ghcr.io/longtho638-jpg/algo-trader:latest

# Create .env from example
curl -O https://raw.githubusercontent.com/longtho638-jpg/algo-trader/main/.env.example
cp .env.example .env
# Edit .env with your credentials

# Run full stack
docker compose up -d

# Verify
curl http://localhost:3000/api/health
```

### With Monitoring (Prometheus + Grafana)

```bash
docker compose -f docker-compose.yml -f docker/monitoring/docker-compose.monitoring.yml up -d
# Grafana: http://localhost:3030 (admin/changeme)
```

### With TimescaleDB

```bash
docker compose -f docker-compose.yml -f docker/timescaledb/docker-compose.timescaledb.yml up -d
```

## Option B: Native (PM2)

```bash
git clone https://github.com/longtho638-jpg/algo-trader.git
cd algo-trader
pnpm install --frozen-lockfile
pnpm build

# Start Redis
brew install redis && brew services start redis
# OR: apt install redis-server && systemctl start redis

# Start NATS (optional)
brew install nats-server
nats-server --jetstream --store_dir /tmp/nats -m 8222 -p 4222 &

# Configure
cp .env.example .env
# Edit .env: POLYMARKET_PRIVATE_KEY, POLYMARKET_API_KEY, etc.

# Start
pm2 start ecosystem.config.cjs --env production
pm2 status
```

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Yes | Wallet private key for signing |
| `POLYMARKET_API_KEY` | Yes | CLOB API key |
| `POLYMARKET_API_SECRET` | Yes | CLOB API secret |
| `POLYMARKET_PASSPHRASE` | Yes | CLOB passphrase |
| `PAPER_TRADING` | No | `true` (default) — safe mode |
| `CAPITAL_USDC` | No | Starting capital (default: 200) |
| `REDIS_HOST` | No | Redis host (default: localhost) |
| `NATS_URL` | No | NATS URL (default: none, Redis fallback) |

## License Activation

```bash
# Your license key (from purchase)
export RAAS_LICENSE_KEY=raas-pro-XXXX-XXXX

# Activate
curl -X POST http://localhost:3000/api/v1/activate \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

## Health Checks

```bash
# API
curl http://localhost:3000/api/health

# Redis
redis-cli ping

# NATS
curl http://localhost:8222/healthz

# PM2 status
pm2 status
```

## Security

- **NEVER** commit `.env` to git
- Use `PAPER_TRADING=true` until strategy is validated
- Keep `POLYMARKET_PRIVATE_KEY` secure — consider using `.env` file permissions: `chmod 600 .env`
- Enable NATS auth: add `NATS_TOKEN=your-secret` to `.env`

## Updating

```bash
# Docker
docker compose pull && docker compose up -d

# Native
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart all
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 3000 in use | `lsof -i :3000` then kill process |
| Redis connection refused | `redis-server` or `brew services start redis` |
| NATS not connecting | Check `NATS_URL` env var matches server address |
| Build fails | `rm -rf dist node_modules && pnpm install && pnpm build` |
| Paper trading mode stuck | Set `PAPER_TRADING=false` in `.env` + restart |
