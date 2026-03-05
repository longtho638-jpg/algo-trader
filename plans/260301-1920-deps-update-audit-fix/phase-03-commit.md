# Phase 03: Commit

## Context Links
- Plan overview: [plan.md](./plan.md)
- Previous phase: [phase-02-audit-fix-verify.md](./phase-02-audit-fix-verify.md)
- Monorepo root: `/Users/macbookprom1/mekong-cli`

## Overview

- **Priority:** P3
- **Status:** pending (depends on Phase 02)
- **Effort:** 5m
- Stage and commit updated `package.json` and `pnpm-lock.yaml`. Final audit confirmation.

## Key Insights

- Only two files to commit: `apps/algo-trader/package.json` and root `pnpm-lock.yaml`
- Conventional commit format required — no AI references in message
- Final audit run after commit confirms clean state

## Requirements

- Stage only the two relevant files (no unrelated changes)
- Commit message follows conventional format
- Post-commit audit confirms 0 critical vulnerabilities

## Related Code Files

- `apps/algo-trader/package.json` — updated dep versions
- `pnpm-lock.yaml` — regenerated lockfile at monorepo root

## Implementation Steps

1. **Stage specific files only**:
   ```bash
   cd /Users/macbookprom1/mekong-cli
   git add apps/algo-trader/package.json pnpm-lock.yaml
   ```

2. **Verify staged diff** (sanity check):
   ```bash
   git diff --staged --stat
   ```
   Expected: only `apps/algo-trader/package.json` and `pnpm-lock.yaml`.

3. **Commit**:
   ```bash
   git commit -m "chore(algo-trader): update commander & dotenv deps"
   ```

4. **Final audit verification**:
   ```bash
   pnpm audit --filter algo-trader
   ```
   Expected: 0 critical, 0 high.

## Todo List

- [ ] `git add apps/algo-trader/package.json pnpm-lock.yaml`
- [ ] `git diff --staged --stat` — confirm only 2 files staged
- [ ] `git commit -m "chore(algo-trader): update commander & dotenv deps"`
- [ ] `pnpm audit --filter algo-trader` — final confirm 0 critical

## Success Criteria

- Clean commit with only 2 files
- Commit message: `chore(algo-trader): update commander & dotenv deps`
- Post-commit `pnpm audit --filter algo-trader` → 0 critical/high
- `pnpm ls --filter algo-trader --depth=0` shows commander 14.x, dotenv 17.x

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Accidentally staging unrelated files | Low | Use explicit file paths in `git add`, verify with `--stat` |
| Lockfile conflict with other workspace changes | Low | Commit promptly; lockfile is auto-generated |

## Security Considerations

- Do not commit `.env` files or API keys
- `pnpm-lock.yaml` is safe to commit — contains only resolved package metadata

## Next Steps

Task complete. No follow-up phases needed.

**Unresolved Questions:**
- xlsx HIGH vuln in `com-anh-duong-10x` has no patch available — tracked separately, out of scope here.
