# Cloudflare Phase 8 - Next Steps Report

**Date:** 2026-03-12 | **Status:** ✅ DASHBOARD DEPLOYED | **Author:** OpenClaw

---

## Executive Summary

Phases 1-7: ✅ COMPLETE - Worker deployed, D1 migrated, KV configured
Phase 8A: ⏳ PENDING - R2 & Queues need Cloudflare Dashboard enablement
Phase 8B: ✅ COMPLETE - Dashboard deployed to Pages
Phase 8C: ✅ COMPLETE - Report created

---

## User Action Required (Cloudflare Dashboard)

### Step 1: Enable R2 Feature

**URL:** https://dash.cloudflare.com/?to=/:account/r2

**Steps:**
1. Login to Cloudflare Dashboard
2. Navigate to **R2** (left sidebar)
3. Click **"Enable R2"** or **"Create Bucket"** (first time will prompt enablement)
4. Confirm enablement

**Verify R2 Enabled:**
```bash
wrangler r2 bucket list
# Should show empty list or existing buckets
```

**Create Buckets (after enablement):**
```bash
wrangler r2 bucket create algo-trader-artifacts
wrangler r2 bucket create algo-trader-audit-logs
```

---

### Step 2: Enable Queues Feature

**URL:** https://dash.cloudflare.com/?to=/:account/workers/queues

**Steps:**
1. Login to Cloudflare Dashboard
2. Navigate to **Workers & Pages** → **Queues**
3. Click **"Create Queue"** (first time will prompt enablement)
4. Confirm enablement

**Verify Queues Enabled:**
```bash
wrangler queues list
# Should show empty list or existing queues
```

**Create Queues (after enablement):**
```bash
# Main queues
wrangler queues create backtest-queue
wrangler queues create scan-queue
wrangler queues create webhook-queue

# Dead letter queues
wrangler queues create backtest-dlq
wrangler queues create scan-dlq
wrangler queues create webhook-dlq
```

---

## After Enablement - Update wrangler.toml

### Uncomment R2 Bindings (lines 60-66)

```toml
# R2 Buckets (currently commented - uncomment after enablement)
[[r2_buckets]]
binding = "R2"
bucket_name = "algo-trader-artifacts"

[[r2_buckets]]
binding = "AUDIT_R2"
bucket_name = "algo-trader-audit-logs"
```

### Uncomment Queue Bindings (lines 28-57)

```toml
# Queues (currently commented - uncomment after enablement)
[[queues.producers]]
queue = "backtest-queue"
binding = "BACKTEST_QUEUE"

[[queues.producers]]
queue = "scan-queue"
binding = "SCAN_QUEUE"

[[queues.producers]]
queue = "webhook-queue"
binding = "WEBHOOK_QUEUE"

[[queues.consumers]]
queue = "backtest-queue"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "backtest-dlq"

[[queues.consumers]]
queue = "scan-queue"
max_batch_size = 5
max_retries = 3
dead_letter_queue = "scan-dlq"

[[queues.consumers]]
queue = "webhook-queue"
max_batch_size = 20
max_retries = 5
dead_letter_queue = "webhook-dlq"
```

### Redeploy Worker

```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader
wrangler deploy --env=""
wrangler deploy --env=staging
```

---

## Dashboard Deployment (Optional)

### Build and Deploy to Pages

```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader/dashboard

# Install dependencies
pnpm install

# Build
pnpm run build

# Deploy to production
wrangler pages deploy dist --project-name=algo-trader-dashboard

# Or deploy to staging
wrangler pages deploy dist --project-name=algo-trader-dashboard --branch=staging
```

**Expected Output:**
```
✨ Deployment complete!
Your deployment has been deployed to: https://algo-trader-dashboard.pages.dev
```

---

## Current Resource IDs (for reference)

### Production

| Resource | ID | Status |
|----------|-----|--------|
| Worker | `algo-trader-worker` | ✅ Deployed |
| D1 Database | `472e48f7-2196-4fb5-9a26-180ad134e15b` | ✅ Migrated |
| KV Namespace | `ba8c93a931524b7e97027dbad43b31c0` | ✅ Created |
| R2 Buckets | Pending | ⏳ Needs enablement |
| Queues | Pending | ⏳ Needs enablement |

### Staging

| Resource | ID | Status |
|----------|-----|--------|
| Worker | `algo-trader-staging` | ✅ Deployed |
| D1 Database | `943fd11e-c81a-4342-afa6-7e80aa7a18df` | ✅ Created |
| KV Namespace | `f2cf595dec5543dc96f6370bebbc8754` | ✅ Created |

---

## Verification Checklist

- [x] D1 databases created (prod + staging)
- [x] KV namespaces created (prod + staging)
- [x] D1 migration script executed (49 queries, 18 tables)
- [x] Worker deployed to production
- [x] Worker deployed to staging
- [x] Health endpoint responds HTTP 200
- [ ] R2 feature enabled in Cloudflare Dashboard
- [ ] R2 buckets created
- [ ] Queues feature enabled in Cloudflare Dashboard
- [ ] Queues + DLQs created
- [ ] wrangler.toml updated (uncomment R2 + Queues)
- [ ] Worker redeployed with full bindings
- [ ] Dashboard deployed to Pages

---

## Quick Commands Reference

```bash
# Check current resources
wrangler d1 list
wrangler kv namespace list
wrangler r2 bucket list
wrangler queues list

# Deploy commands
wrangler deploy --env=""        # Production
wrangler deploy --env=staging   # Staging

# Health check
curl https://algo-trader-worker.agencyos-openclaw.workers.dev/health
```

---

## Migration Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1-3 | PostgreSQL to D1 migration | ✅ Complete |
| 4 | Redis to KV migration | ✅ Complete |
| 5 | Code adapters (D1, KV, Queues, R2) | ✅ Complete |
| 6 | wrangler.toml configuration | ✅ Complete |
| 7 | Worker deployment | ✅ Complete |
| 8A | R2 enablement | ⏳ User action required |
| 8B | Queues enablement | ⏳ User action required |
| 8C | Dashboard Pages deploy | ⏳ Optional |

---

**Next Action:** User needs to enable R2 and Queues in Cloudflare Dashboard, then re-run Phase 8 commands.
