# Phase 05: Sync IDs + Deploy

**Priority:** Critical | **Status:** Pending | **Sequential (after 01-04)**

---

## Context

- Parent Plan: [[plan.md]]
- Dependencies: Phases 01, 02, 03, 04 must complete first

---

## Overview

Sync all resource IDs to wrangler.toml and deploy to Cloudflare.

---

## Implementation Steps

### Step 1: Collect All Resource IDs

Gather from Phases 01-04:
- D1 database IDs (2)
- KV namespace IDs (3)
- Queue names (6) - no ID needed
- R2 bucket names (2) - no ID needed

### Step 2: Update wrangler.toml

Replace all placeholders with actual IDs.

### Step 3: Run D1 Migration

```bash
wrangler d1 execute algo-trader-prod --remote --file=src/db/migrations/001-initial.sql
```

### Step 4: Deploy Worker

```bash
wrangler deploy
```

### Step 5: Deploy Pages

```bash
cd dashboard
pnpm run build
wrangler pages deploy dist --project-name=algo-trader-dashboard
```

### Step 6: Verify Deployment

```bash
# Check Worker
curl -I https://algo-trader-worker.mekong.workers.dev

# Check Pages
curl -I https://algo-trader-dashboard.pages.dev
```

---

## Success Criteria

- [ ] wrangler.toml updated with all IDs
- [ ] D1 migration successful
- [ ] Worker deployed
- [ ] Pages deployed
- [ ] Both endpoints respond HTTP 200

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrong IDs in wrangler.toml | Deploy fails | Double-check IDs before commit |
| D1 migration fails | No database | Re-run migration script |
| Worker deploy fails | No API | Check wrangler.toml syntax |
