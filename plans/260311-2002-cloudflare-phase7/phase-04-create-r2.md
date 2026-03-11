# Phase 04: Create R2 Buckets

**Priority:** High | **Status:** Pending | **Parallel Group:** 1

---

## Context

- Parent Plan: [[plan.md]]
- Dependencies: None (can run in parallel with Phases 01, 02, 03)

---

## Overview

Create R2 buckets for artifact and audit log storage.

---

## Implementation Steps

### Step 1: Create Artifacts Bucket

```bash
wrangler r2 bucket create algo-trader-artifacts
```

**Expected Output:**
```
✅ Created bucket 'algo-trader-artifacts'
```

### Step 2: Create Audit Logs Bucket

```bash
wrangler r2 bucket create algo-trader-audit-logs
```

**Expected Output:**
```
✅ Created bucket 'algo-trader-audit-logs'
```

### Step 3: Verify wrangler.toml

Bucket names already configured - no ID sync needed:

```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "algo-trader-artifacts"

[[r2_buckets]]
binding = "AUDIT_R2"
bucket_name = "algo-trader-audit-logs"
```

---

## Success Criteria

- [ ] `algo-trader-artifacts` bucket created
- [ ] `algo-trader-audit-logs` bucket created
- [ ] Bucket names verified in wrangler.toml

---

## Conflict Prevention

This phase only runs wrangler CLI commands - no file conflicts with other phases.
