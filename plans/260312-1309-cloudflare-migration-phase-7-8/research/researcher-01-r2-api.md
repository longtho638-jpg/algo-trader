---
name: R2 API Enablement Research
description: Cloudflare R2 bucket creation via API/CLI - feasibility and fallback
type: research
---

# R2 API Enablement Research

## 1. Can R2 be enabled via API?

**NO** - R2 requires manual enablement through Cloudflare Dashboard first time.

- R2 is a "feature flag" that must be activated per account
- No API endpoint exists to enable R2 feature itself
- Once enabled, buckets CAN be created via API

## 2. API Endpoint for R2 Bucket Creation

**Endpoint:** `POST /accounts/{account_id}/r2/buckets`

```bash
curl -X POST \
  "https://api.cloudflare.com/v4/accounts/{account_id}/r2/buckets" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "algo-trader-artifacts"}'
```

**Scopes required:** `R2 Storage Edit`

## 3. Wrangler CLI

```bash
# Create bucket (after R2 enabled)
npx wrangler r2 bucket create algo-trader-artifacts

# List buckets
npx wrangler r2 bucket list
```

Wrangler CANNOT enable R2 - only creates buckets after manual enablement.

## 4. Manual Steps (Required)

1. Navigate to https://dash.cloudflare.com/?to=/:account/r2
2. Click "Enable R2" or "Create Bucket" (first time triggers enablement)
3. Accept R2 pricing ($0.015/GB-month storage)
4. Buckets can then be created via API/CLI

## 5. Workaround

**Option A: Use User Browser Script**
```javascript
// Paste in browser console on R2 dashboard page
fetch('/api/v4/accounts/:account_id/r2/buckets', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({name: 'algo-trader-artifacts'})
})
```

**Option B: Continue with KV Storage**
- Use existing KV for artifact metadata
- Store large files externally (S3, GCS)
- Migrate to R2 later

## Conclusion

**R2 CANNOT be fully automated.** Manual dashboard enablement required first time. After enablement, bucket creation is fully automatable via API/CLI.

**Unresolved:** None - limitation is by design (Cloudflare requires explicit user consent for R2 billing).
