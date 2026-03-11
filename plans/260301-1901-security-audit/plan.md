---
title: "Security Audit algo-trader"
description: "npm audit fix, .env.example verification, secrets scan, vulnerability check"
status: pending
priority: P2
effort: 1h
branch: master
tags: [security, audit, algo-trader]
created: 2026-03-01
---

# Security Audit — algo-trader

## Dependency Graph

```
Phase 01 (pnpm audit)  ──┐
                          ├──→ Phase 03 (Verification)
Phase 02 (env + secrets) ─┘
```

## Execution Strategy

- **Phases 1-2**: Run in PARALLEL (no file overlap)
- **Phase 3**: Runs AFTER 1+2 complete (verification)

## File Ownership Matrix

| Phase | Files Owned |
|-------|-------------|
| 01 | `pnpm-lock.yaml` (root), `package.json` (root pnpm overrides) |
| 02 | `.env.example`, src/ files (read-only scan) |
| 03 | None (read-only verification) |

## Phases

| # | Name | Status | Parallel Group | Link |
|---|------|--------|----------------|------|
| 01 | pnpm audit fix | pending | A | [phase-01](./phase-01-pnpm-audit-fix.md) |
| 02 | env + secrets hardening | pending | A | [phase-02](./phase-02-env-secrets-hardening.md) |
| 03 | verification | pending | B (after A) | [phase-03](./phase-03-verification.md) |

## Research

- [npm audit & env](./research/researcher-01-npm-audit-env.md)
- [secrets scan](./research/researcher-02-secrets-scan.md)

## Key Findings (Pre-Plan)

- `.env.example` already exists — no creation needed
- No hardcoded secrets in src/ — posture is STRONG
- Must use `pnpm audit` (not npm audit) — monorepo uses pnpm
- No .env file committed — .gitignore correct

## Validation Log

### Session 1 — 2026-03-01
**Trigger:** Initial plan creation validation
**Questions asked:** 3

#### Questions & Answers

1. **[Scope]** Audit scope: chỉ fix critical/high hay fix luôn moderate/low vulnerabilities?
   - Options: Critical + High only (Recommended) | All severities | Critical only
   - **Answer:** All severities
   - **Rationale:** User muốn fix toàn bộ vulns, không chỉ critical/high — Phase 01 cần mở rộng scope

2. **[Risk]** pnpm overrides có thể ảnh hưởng other workspace packages. Cách xử lý?
   - Options: Add overrides + verify build all (Recommended) | Skip cross-check | Document only
   - **Answer:** Add overrides + verify build all
   - **Rationale:** Cần verify cross-package compatibility sau khi thêm overrides — Phase 03 cần thêm step build all

3. **[Architecture]** Dual env var naming (EXCHANGE_API_KEY || API_KEY). Cần standardize không?
   - Options: Keep as-is (Recommended) | Standardize to single name
   - **Answer:** Keep as-is
   - **Rationale:** Fallback pattern hoạt động tốt, không cần breaking change

#### Confirmed Decisions
- Audit scope: ALL severities (not just critical/high)
- Overrides: Add + verify build all workspace packages
- Env naming: Keep dual naming as-is

#### Action Items
- [ ] Update Phase 01 success criteria: 0 vulns ALL severities (not just critical/high)
- [ ] Update Phase 03: add `pnpm build` cross-package verification step

#### Impact on Phases
- Phase 01: Expand scope from critical/high → all severities
- Phase 03: Add `pnpm build` (root) to verify no cross-package breakage
