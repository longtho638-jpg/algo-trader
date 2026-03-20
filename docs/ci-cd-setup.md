# CI/CD Configuration for Algo Trader

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Quality Gates (10 min)                            │
│  ├─ TypeScript compile check                                │
│  └─ Unit tests                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2: Build (15 min)                                    │
│  ├─ TypeScript build                                        │
│  ├─ Dashboard build                                         │
│  └─ Upload artifacts                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STAGE 3: Security Scan (10 min)                            │
│  ├─ npm audit                                               │
│  └─ Secrets detection                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STAGE 4: Deploy Staging (auto, 20 min)                     │
│  ├─ Cloudflare Pages (staging branch)                       │
│  └─ Health check                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STAGE 5: Deploy Production (manual approval, 20 min)       │
│  ├─ Cloudflare Pages (main branch)                          │
│  └─ Health check + notification                             │
└─────────────────────────────────────────────────────────────┘
```

## Required Secrets

Configure in GitHub → Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `DATABASE_URL` | PostgreSQL connection string (optional) |
| `REDIS_URL` | Redis connection string (optional) |

## Environments

Configure in GitHub → Settings → Environments:

### staging
- Auto-deploy on push to master/main
- URL: `https://staging.algo-trader.deployments.app`

### production
- **Manual approval required**
- URL: `https://algo-trader.deployments.app`

## Local Testing

```bash
# Run quality gates locally
pnpm run typecheck
pnpm run test

# Build locally
pnpm run build
pnpm run dashboard:build

# Check for secrets
grep -r "sk_live_\|api_key" src/ --include="*.ts"
```

## Deployment Flow

1. **Push to master/main** → Triggers CI/CD
2. **Quality gates** → TypeScript + tests
3. **Build** → Compile TypeScript, build dashboard
4. **Security scan** → npm audit + secrets check
5. **Auto-deploy staging** → Immediate deployment
6. **Manual approval** → Required for production
7. **Deploy production** → Final deployment

## Troubleshooting

### Build fails
- Check TypeScript errors: `pnpm run typecheck`
- Verify dependencies: `pnpm install --frozen-lockfile`

### Tests fail
- Run locally: `pnpm run test`
- Check test coverage: `pnpm run test:coverage`

### Deploy fails
- Verify Cloudflare secrets are set
- Check environment configuration
- Review deployment logs in GitHub Actions

### Health check fails
- Wait 60s for cold start
- Check `/health` endpoint manually
- Review Cloudflare Pages logs
