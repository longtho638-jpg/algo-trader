# Phase 01: Enable R2 Buckets

**Parent:** [plan.md](./plan.md) | **Dependencies:** None | **Parallel:** Yes

---

## Overview

Enable R2 storage and create buckets for artifact storage.

**Priority:** High | **Effort:** 15 minutes (manual) + 5 minutes (CLI)

---

## Key Insights

- R2 requires **manual dashboard enablement** first time (billing consent)
- After enablement, buckets can be created via CLI/API
- Cannot be fully automated - requires user browser action

---

## Requirements

1. Enable R2 feature in Cloudflare Dashboard
2. Create `algo-trader-artifacts` bucket
3. Create `algo-trader-audit-logs` bucket
4. Capture bucket names for wrangler.toml
5. Uncomment R2 bindings in wrangler.toml
6. Redeploy Worker

---

## Architecture

```
Cloudflare Dashboard → Enable R2 → Create Buckets → wrangler.toml → Deploy
```

---

## Related Code Files

- `wrangler.toml` (lines 59-66 - currently commented)

---

## File Ownership

| File | Change |
|------|--------|
| `wrangler.toml` | Uncomment R2 bindings |

---

## Implementation Steps

### Step 1: Enable R2 (Manual)

1. Open https://dash.cloudflare.com/?to=/:account/r2
2. Click "Create Bucket" or "Enable R2"
3. Accept R2 pricing ($0.015/GB-month)
4. Verify R2 appears in left sidebar

### Step 2: Create Buckets (CLI)

```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader

# Create production buckets
npx wrangler r2 bucket create algo-trader-artifacts
npx wrangler r2 bucket create algo-trader-audit-logs

# Verify
npx wrangler r2 bucket list
```

### Step 3: Update wrangler.toml

Uncomment R2 bindings:
```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "algo-trader-artifacts"

[[r2_buckets]]
binding = "AUDIT_R2"
bucket_name = "algo-trader-audit-logs"
```

### Step 4: Deploy

```bash
npm run deploy:prod
```

---

## Todo List

- [ ] Enable R2 in dashboard
- [ ] Create `algo-trader-artifacts` bucket
- [ ] Create `algo-trader-audit-logs` bucket
- [ ] Uncomment R2 bindings in wrangler.toml
- [ ] Deploy Worker
- [ ] Verify R2 binding in Worker settings

---

## Success Criteria

- `wrangler r2 bucket list` shows 2 buckets
- Worker deploy succeeds without R2 errors
- `env.R2` available in Worker runtime

---

## Conflict Prevention

No file conflicts - only modifies `wrangler.toml` which is exclusive to this phase.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| R2 enablement fails | Medium | Use KV for metadata, external S3 for files |
| Bucket name taken | Low | Add unique suffix (e.g., `-prod`) |

---

## Security Considerations

- R2 buckets should have private access by default
- Use signed URLs for public artifact access
- Enable R2 access logs for audit trail

---

## Next Steps

After completion:
- Phase 02 can proceed (independent)
- Phase 04 will use R2 for artifact storage
