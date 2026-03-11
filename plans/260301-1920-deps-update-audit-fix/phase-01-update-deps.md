# Phase 01: Update Dependencies

## Context Links
- Plan overview: [plan.md](./plan.md)
- Research: [reports/](./reports/)
- Package: `/Users/macbookprom1/mekong-cli/apps/algo-trader/package.json`
- Lockfile: `/Users/macbookprom1/mekong-cli/pnpm-lock.yaml`

## Overview

- **Priority:** P3
- **Status:** pending
- **Effort:** 15m
- Update `commander` and `dotenv` via pnpm filter. Skip chalk (ESM breaking). Verify build integrity.

## Key Insights

- pnpm monorepo — all commands run from repo root with `--filter algo-trader`
- chalk v5 is ESM-only; tsconfig uses `"module": "commonjs"` → incompatible without full ESM migration
- commander 11→14 and dotenv 16→17 are safe incremental updates
- algo-trader has 0 direct vulnerabilities before this update

## Requirements

- Update commander to latest (^14)
- Update dotenv to latest (^17)
- Lockfile must be regenerated at root
- TypeScript must compile without errors after update
- Tests must pass after update

## Related Code Files

- `apps/algo-trader/package.json` — dep versions updated here
- `pnpm-lock.yaml` — regenerated at monorepo root

## Implementation Steps

1. **Confirm current state** (monorepo root):
   ```bash
   cd /Users/macbookprom1/mekong-cli
   pnpm outdated --filter algo-trader
   ```

2. **Update commander**:
   ```bash
   pnpm --filter algo-trader update commander
   ```

3. **Update dotenv**:
   ```bash
   pnpm --filter algo-trader update dotenv
   ```

4. **Skip chalk** — keep at v4.1.2. No action needed.

5. **Reinstall at root** to regenerate lockfile:
   ```bash
   pnpm install
   ```

6. **Typecheck**:
   ```bash
   pnpm --filter algo-trader run typecheck
   ```
   Expected: 0 errors.

7. **Run tests**:
   ```bash
   pnpm --filter algo-trader test
   ```
   Expected: all pass.

## Todo List

- [ ] Run `pnpm outdated --filter algo-trader`
- [ ] Update commander
- [ ] Update dotenv
- [ ] Run `pnpm install` at root
- [ ] Run typecheck — confirm 0 errors
- [ ] Run tests — confirm all pass

## Success Criteria

- `package.json` shows commander `^14.x` and dotenv `^17.x`
- `pnpm-lock.yaml` updated with new resolved versions
- `pnpm --filter algo-trader run typecheck` exits 0
- `pnpm --filter algo-trader test` exits 0

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| commander API breaking change | Low | Check changelog; API stable across 11→14 |
| dotenv behavior change | Low | No code changes needed per research |
| chalk accidentally upgraded | None | Explicit skip — not in update commands |

## Security Considerations

- No secrets in package.json or lockfile
- Only updating non-security-sensitive utility deps

## Next Steps

→ [phase-02-audit-fix-verify.md](./phase-02-audit-fix-verify.md)
