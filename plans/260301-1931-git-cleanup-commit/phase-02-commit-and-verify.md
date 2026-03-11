## Context
- Parent: [plan.md](./plan.md)
- Depends on: [phase-01](./phase-01-verify-gitignore-and-stage.md)
- Working dir: `/Users/macbookprom1/mekong-cli` (git root)

## Overview
- **Date:** 2026-03-01
- **Priority:** P3
- **Status:** pending
- **Description:** Commit staged changes with conventional message, verify clean tree

## Key Insights
- Changes are modularization refactor: large files split into focused modules
- Commit message should reflect refactoring nature, not just "cleanup"
- Plans directories also included (security-audit + deps-update research)

## Requirements
- Conventional commit format
- Clean git status after commit

## Related Code Files
- All 13 staged files from phase-01

## Implementation Steps
1. Commit with descriptive message:
   ```bash
   git commit -m "$(cat <<'EOF'
   refactor(algo-trader): modularize BotEngine, BacktestEngine, and CLI commands

   - Extract bot-engine-config-and-state-types from BotEngine
   - Extract bot-engine-trade-executor-and-position-manager from BotEngine
   - Extract bot-engine-builtin-plugin-factories from bot-engine-plugins
   - Extract backtest-engine-metrics-and-statistics-calculator from BacktestEngine
   - Extract backtest-engine-result-types from BacktestEngine
   - Extract arb-scan-run-commands from arb-cli-commands
   - Extract arb-engine-orchestrator-commands from arb-cli-commands
   - Extract arb-agi-auto-execution-commands from arb-cli-commands
   - Add security audit and deps update plans
   EOF
   )"
   ```
2. Verify clean tree: `git status -- apps/algo-trader/`
3. Verify commit: `git log --oneline -1`

## Todo
- [ ] Commit with conventional message
- [ ] Verify clean working tree
- [ ] Verify commit hash in log

## Success Criteria
- `git status -- apps/algo-trader/` shows nothing to commit
- `git log --oneline -1` shows new commit with correct message

## Risk Assessment
- **Low:** Standard commit operation, reversible with `git reset HEAD~1`
- **Note:** This commits to `master` branch — user should be aware

## Security Considerations
- Final check: `git diff --cached --name-only` should not contain .env or secrets

## Next Steps
- Run plan 260301-1920-deps-update-audit-fix (dependency updates)
- Or push to remote if ready
