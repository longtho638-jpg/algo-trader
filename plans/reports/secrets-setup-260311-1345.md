# Set Production Secrets

## Required Secrets

Run these commands to set secrets for production:

```bash
# Production secrets
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put EXCHANGE_API_KEY
pnpm exec wrangler secret put EXCHANGE_SECRET
pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET

# Staging secrets (if different)
pnpm exec wrangler secret put DATABASE_URL --env staging
pnpm exec wrangler secret put EXCHANGE_API_KEY --env staging
pnpm exec wrangler secret put EXCHANGE_SECRET --env staging
pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET --env staging
```

## Secrets Format

| Secret | Description | Example |
|--------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `EXCHANGE_API_KEY` | Exchange API public key | `your-api-key-from-exchange` |
| `EXCHANGE_SECRET` | Exchange API secret key | `your-secret-key-from-exchange` |
| `POLAR_WEBHOOK_SECRET` | Polar.sh webhook signing secret | `whsec_xxx` |

## R2 Bucket Action Required

**IMPORTANT:** R2 bucket `algo-trader-artifacts` needs to be enabled via Cloudflare Dashboard:

1. Go to https://dash.cloudflare.com
2. Navigate to R2
3. Click "Create bucket" → `algo-trader-artifacts`
4. For staging: create `algo-trader-artifacts-staging`

Or run this after enabling R2:
```bash
pnpm exec wrangler r2 bucket create algo-trader-artifacts
```

## Verification

After setting secrets, verify:

```bash
pnpm exec wrangler secret list
pnpm exec wrangler deploy --dry-run
```
