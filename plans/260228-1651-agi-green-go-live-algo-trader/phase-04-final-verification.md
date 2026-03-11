# Phase 04: Final GREEN Verification

## Context
- [Plan](plan.md)
- Depends on: Phase 01, 02, 03

## Overview
- **Priority:** P0 — FINAL GATE
- **Status:** ⬜ Pending
- **Effort:** 1h
- **Mô tả:** Chạy full verification pipeline, đảm bảo ALL GREEN trước khi declare go-live.

## Verification Checklist

### 1. Tests (MUST ALL PASS)
```bash
npx jest --verbose --coverage
# Target: 0 failures, coverage > 60%
```

### 2. TypeScript (MUST 0 ERRORS)
```bash
npx tsc --noEmit
# Target: 0 errors
```

### 3. Security Scan (MUST 0 FINDINGS)
```bash
# Hardcoded secrets
grep -rn "sk_live\|pk_live\|AKIA\|AIza\|ghp_\|gho_" src/ --include="*.ts"
# Must return 0 results

# .env in gitignore
grep ".env" .gitignore
# Must be present
```

### 4. Config Validation (MUST WORK)
```bash
# Verify live mode rejects missing keys
node -e "
const { ConfigLoader } = require('./dist/utils/config');
try { ConfigLoader.validate({exchange:{id:'test',testMode:false}}, 'live'); }
catch(e) { console.log('✅ Validation works:', e.message); }
"
```

### 5. Risk Management Review
- [ ] RiskManager.calculatePositionSize: validated with edge cases
- [ ] Trailing stop: tested init + update + stop-hit
- [ ] Drawdown protection: tested in BotEngine
- [ ] Balance check: insufficient balance → warning (not crash)

### 6. Exchange Connection
- [ ] ExchangeClient retry logic tested
- [ ] Health check method available
- [ ] Timeout configured (30s)
- [ ] Rate limiting enabled

## Implementation Steps

1. Build project: `npx tsc`
2. Run full test suite with coverage
3. Run security grep scans
4. Run `npm audit` for dependency vulnerabilities
5. Generate GREEN report

## Report Format
```
## AGI GREEN GO LIVE — Algo Trader
- Date: 2026-02-28
- Build: ✅/❌ tsc 0 errors
- Tests: ✅/❌ X/Y passed, Z% coverage
- Security: ✅/❌ 0 hardcoded secrets
- Config: ✅/❌ validation enforced
- Exchange: ✅/❌ retry + health check
- Risk Mgmt: ✅/❌ position sizing + drawdown + trailing stop
- Dependencies: ✅/❌ npm audit clean
```

## Todo List
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx jest --coverage` → ALL PASS, >60% coverage
- [ ] Security grep → 0 findings
- [ ] npm audit → no high/critical
- [ ] Generate final report
- [ ] Commit with `feat(algo-trader): AGI GREEN GO LIVE verified`

## Success Criteria
- ALL 6 verification areas GREEN
- Final report generated
- No blocking issues remaining
