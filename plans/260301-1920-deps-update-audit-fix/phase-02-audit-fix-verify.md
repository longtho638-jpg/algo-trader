# Phase 02: Audit Fix & Verify

## Context Links
- Plan overview: [plan.md](./plan.md)
- Previous phase: [phase-01-update-deps.md](./phase-01-update-deps.md)
- Monorepo root: `/Users/macbookprom1/mekong-cli`

## Overview

- **Priority:** P3
- **Status:** pending (depends on Phase 01)
- **Effort:** 10m
- Confirm 0 critical vulnerabilities in algo-trader. Verify clean dependency tree.

## Key Insights

- algo-trader had 0 direct vulns before update — expect same after
- Monorepo-level vulns (xlsx in com-anh-duong-10x, ai override) are out of scope
- `pnpm audit` without `--filter` shows monorepo total (3 vulns); use filter to isolate algo-trader
- pnpm overrides in root `package.json` already handle the `ai` LOW vulnerability

## Requirements

- `pnpm audit --filter algo-trader` must show 0 critical/high vulnerabilities
- `pnpm ls --filter algo-trader --depth=0` must show clean resolved tree
- `pnpm-lock.yaml` diff must confirm updated versions

## Related Code Files

- `pnpm-lock.yaml` — verify diff shows new commander/dotenv versions
- `apps/algo-trader/package.json` — source of truth for declared versions

## Implementation Steps

1. **Audit algo-trader only**:
   ```bash
   cd /Users/macbookprom1/mekong-cli
   pnpm audit --filter algo-trader
   ```
   Expected: `0 vulnerabilities found` or no critical/high items.

2. **Verify dependency tree**:
   ```bash
   pnpm ls --filter algo-trader --depth=0
   ```
   Expected: clean list showing updated commander and dotenv versions.

3. **Confirm lockfile updated**:
   ```bash
   git diff pnpm-lock.yaml | grep -E "^[+-].*commander|^[+-].*dotenv" | head -20
   ```
   Expected: lines showing old and new resolved versions.

## Todo List

- [ ] Run `pnpm audit --filter algo-trader` — confirm 0 critical
- [ ] Run `pnpm ls --filter algo-trader --depth=0` — verify clean tree
- [ ] Run `git diff pnpm-lock.yaml` — confirm lockfile has new versions

## Success Criteria

- `pnpm audit --filter algo-trader` → 0 critical, 0 high
- Dependency list shows commander 14.x, dotenv 17.x
- Lockfile diff shows version bumps for both packages

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| New vuln introduced by updated dep | Very Low | commander/dotenv have clean audit records |
| pnpm audit reports monorepo vulns instead of filter | None | `--filter` flag isolates scope |

## Security Considerations

- xlsx HIGH vulnerability remains in com-anh-duong-10x — separate concern, not this task
- ai LOW vulnerability already handled by root pnpm overrides

## Next Steps

→ [phase-03-commit.md](./phase-03-commit.md)
