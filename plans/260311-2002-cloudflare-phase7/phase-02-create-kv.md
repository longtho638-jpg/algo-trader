# Phase 02: Create KV Namespaces

**Priority:** High | **Status:** Pending | **Parallel Group:** 1

---

## Context

- Parent Plan: [[plan.md]]
- Dependencies: None (can run in parallel with Phases 01, 03, 04)

---

## Overview

Create KV namespaces for caching and session storage.

---

## Implementation Steps

### Step 1: Create Production KV

```bash
wrangler kv:namespace create "KV"
```

**Expected Output:**
```
✅ Successfully created namespace 'KV'
Namespace ID: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### Step 2: Create Staging KV

```bash
wrangler kv:namespace create "KV" --env staging
```

**Expected Output:**
```
✅ Successfully created namespace 'KV' for environment 'staging'
Namespace ID: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

### Step 3: Create BUILD_CACHE KV (shared)

```bash
wrangler kv:namespace create "BUILD_CACHE"
```

**Expected Output:**
```
✅ Successfully created namespace 'BUILD_CACHE'
Namespace ID: cccccccccccccccccccccccccccccccc
```

### Step 4: Update wrangler.toml

```toml
[[kv_namespaces]]
binding = "KV"
id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

[[kv_namespaces]]
binding = "BUILD_CACHE"
id = "95df9f174767429ea6e4d2e8c63c982a"  # Already exists or new ID

[[env.staging.kv_namespaces]]
binding = "KV"
id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

---

## Success Criteria

- [ ] Production KV namespace created
- [ ] Staging KV namespace created
- [ ] BUILD_CACHE namespace created
- [ ] Namespace IDs captured
- [ ] wrangler.toml updated

---

## Conflict Prevention

This phase only runs wrangler CLI commands - no file conflicts with other phases.
