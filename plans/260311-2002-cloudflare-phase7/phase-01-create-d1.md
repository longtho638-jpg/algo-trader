# Phase 01: Create D1 Databases

**Priority:** High | **Status:** Pending | **Parallel Group:** 1

---

## Context

- Parent Plan: [[plan.md]]
- Dependencies: None (can run in parallel with Phases 02-04)
- Docs: ../../reports/cloudflare-migration-260311-1935.md

---

## Overview

Create D1 databases for production and staging environments.

---

## Implementation Steps

### Step 1: Create Production D1

```bash
wrangler d1 create algo-trader-prod --remote
```

**Expected Output:**
```
✅ Successfully created database 'algo-trader-prod' in 'production'
Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Action:** Copy `Database ID` to update `wrangler.toml`

### Step 2: Create Staging D1

```bash
wrangler d1 create algo-trader-staging --remote
```

**Expected Output:**
```
✅ Successfully created database 'algo-trader-staging' in 'production'
Database ID: yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

**Action:** Copy `Database ID` to update `wrangler.toml`

### Step 3: Update wrangler.toml

Replace placeholder IDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "algo-trader-prod"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Replace placeholder

[[d1_databases]]
binding = "DB_STAGING"
database_name = "algo-trader-staging"
database_id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"  # Replace placeholder

[[env.staging.d1_databases]]
binding = "DB"
database_name = "algo-trader-staging"
database_id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"  # Replace placeholder
```

---

## Success Criteria

- [ ] `algo-trader-prod` D1 created
- [ ] `algo-trader-staging` D1 created
- [ ] Database IDs captured
- [ ] wrangler.toml updated

---

## Conflict Prevention

This phase only runs wrangler CLI commands - no file conflicts with other phases.
