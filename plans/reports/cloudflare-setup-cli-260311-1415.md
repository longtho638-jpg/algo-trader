# Cloudflare Setup - CLI Automation

**Date:** 2026-03-11
**Status:** Scripts created, Dashboard action required for R2

---

## 📦 Available Scripts

### 1. R2 Bucket Creation

**File:** `scripts/create-r2-buckets.sh`

**Usage:**
```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader
./scripts/create-r2-buckets.sh
```

**⚠️ IMPORTANT:** R2 bucket creation **REQUIRES** Cloudflare Dashboard action first:

1. Go to https://dash.cloudflare.com
2. Navigate to R2
3. Click "Create bucket" → `algo-trader-artifacts`
4. Create staging bucket → `algo-trader-artifacts-staging`

After enabling R2 via dashboard, run the script to auto-create buckets.

---

### 2. Secrets Setup

**File:** `scripts/setup-secrets.sh`

**Usage:**
```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader
./scripts/setup-secrets.sh
```

**Interactive prompts for:**
- `DATABASE_URL`
- `EXCHANGE_API_KEY`
- `EXCHANGE_SECRET`
- `POLAR_WEBHOOK_SECRET`

Then optionally set staging secrets (different values if needed).

---

## 🔧 Manual CLI Commands

If you prefer manual setup:

### R2 Buckets (after dashboard enable)
```bash
pnpm exec wrangler r2 bucket create algo-trader-artifacts
pnpm exec wrangler r2 bucket create algo-trader-artifacts-staging
```

### Secrets
```bash
# Production
echo "your-database-url" | pnpm exec wrangler secret put DATABASE_URL
echo "your-api-key" | pnpm exec wrangler secret put EXCHANGE_API_KEY
echo "your-api-secret" | pnpm exec wrangler secret put EXCHANGE_SECRET
echo "your-webhook-secret" | pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET

# Staging (if different)
echo "staging-db-url" | pnpm exec wrangler secret put DATABASE_URL --env staging
echo "staging-api-key" | pnpm exec wrangler secret put EXCHANGE_API_KEY --env staging
echo "staging-api-secret" | pnpm exec wrangler secret put EXCHANGE_SECRET --env staging
echo "staging-webhook-secret" | pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET --env staging
```

---

## ✅ Verification

```bash
# List secrets
pnpm exec wrangler secret list
pnpm exec wrangler secret list --env staging

# List R2 buckets
pnpm exec wrangler r2 bucket list

# Deploy dry-run
pnpm exec wrangler deploy --dry-run

# Deploy
pnpm exec wrangler deploy
pnpm exec wrangler deploy --env staging
```

---

## 🚨 Cloudflare API Limitation

**R2 bucket creation cannot be fully automated via API/CLI for new accounts.**

Error message: `Please enable R2 through the Cloudflare Dashboard [code: 10042]`

This is a Cloudflare platform requirement - R2 must be "enabled" for the account first by:
1. Visiting Cloudflare Dashboard
2. Navigating to R2 section
3. Creating at least one bucket manually

After this one-time setup, CLI/API commands work normally.

---

## 📋 Checklist

- [ ] Enable R2 via Cloudflare Dashboard (one-time)
- [ ] Run `./scripts/create-r2-buckets.sh` OR manual commands
- [ ] Run `./scripts/setup-secrets.sh` OR manual commands
- [ ] Verify: `pnpm exec wrangler deploy --dry-run`
- [ ] Deploy: `pnpm exec wrangler deploy`

---

**Scripts created:** 2026-03-11 14:15 ICT
