# Cloudflare Migration - Phases 2-6

**Status:** In Progress | **Priority:** Critical | **Effort:** High

---

## Overview

Phase 1 (Worker setup + CI/CD) ✅ COMPLETE. Continuing with Phases 2-6 to complete full migration.

---

## Phase 2: Dashboard Pages Deployment

**Status:** Pending | **Owner:** fullstack-developer

### Tasks
- [ ] Create `dashboard/wrangler.toml` for Pages
- [ ] Update `dashboard/package.json` with deploy scripts
- [ ] Configure Vite build output compatibility
- [ ] Update API client base URL
- [ ] Test Pages deployment locally

---

## Phase 3: D1 Database Setup

**Status:** Pending | **Owner:** fullstack-developer

### Tasks
- [ ] Create D1 databases via wrangler CLI (prod + staging)
- [ ] Convert PostgreSQL schema to SQLite (D1)
- [ ] Create migration files in `src/db/migrations/`
- [ ] Update database client to use D1 binding
- [ ] Test migrations locally

---

## Phase 4: KV + Queues

**Status:** Pending | **Owner:** fullstack-developer

### Tasks
- [ ] Create KV namespaces via wrangler CLI
- [ ] Create Queue resources via wrangler CLI
- [ ] Replace ioredis with KV client in source
- [ ] Replace BullMQ with Queues consumer/producer
- [ ] Test KV + Queues integration

---

## Phase 5: R2 Storage

**Status:** Pending | **Owner:** fullstack-developer

### Tasks
- [ ] Create R2 buckets via wrangler CLI
- [ ] Replace S3Client with R2 binding
- [ ] Update file upload/download logic
- [ ] Test R2 operations locally

---

## Phase 6: Source Code Migration

**Status:** Pending | **Owner:** fullstack-developer

### Tasks
- [ ] Update all imports to use Cloudflare bindings
- [ ] Replace `process.env.*` with `vars` from wrangler.toml
- [ ] Update context passing (ctx.env.DB, ctx.env.KV, etc.)
- [ ] Remove Redis, BullMQ, S3 dependencies
- [ ] Run typecheck + tests

---

## Phase 7: Resource ID Sync + Final Deploy

**Status:** Pending | **Owner:** project-manager

### Tasks
- [ ] Run wrangler to create all resources
- [ ] Copy resource IDs to wrangler.toml
- [ ] Update GitHub secrets (CLOUDFLARE_API_TOKEN)
- [ ] Trigger CI/CD pipeline
- [ ] Verify production GREEN

---

## Next Command

```bash
/cook "Execute Cloudflare Migration Phases 2-6" --auto
```
