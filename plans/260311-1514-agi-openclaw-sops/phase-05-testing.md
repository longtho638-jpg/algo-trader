# Phase 5: Testing + Validation

**Created:** 2026-03-11
**Priority:** P0
**Status:** Pending
**Owner:** QA

---

## Context Links

- Parent Plan: [plan.md](./plan.md)
- Previous: [phase-04-integration.md](./phase-04-integration.md)

---

## Overview

Test AGI layer with unit tests, backtest, and paper trading.

| Attribute | Value |
|-----------|-------|
| ETA | 2 hours |
| Priority | P0 |
| Status | Pending |

---

## Requirements

**Functional:**
- Unit tests for all AGI components
- Backtest with historical data (30 days)
- Paper trading simulation (48 hours)
- Compare AGI vs rules performance

**Non-Functional:**
- Code coverage > 80%
- Win rate > 55% in backtest
- Max drawdown < 5%
- Latency P95 < 500ms

---

## Implementation Steps

1. Write unit tests for OllamaClient
2. Write unit tests for SOPEngine
3. Write unit tests for CircuitBreaker
4. Run backtest (30 days historical)
5. Generate backtest report
6. Start paper trading (48-hour simulation)
7. Generate validation report

---

## Todo List

- [ ] Unit tests: OllamaClient
- [ ] Unit tests: SOPEngine
- [ ] Unit tests: CircuitBreaker
- [ ] Run backtest (30 days)
- [ ] Generate backtest report
- [ ] Start paper trading (48h)
- [ ] Generate validation report

---

## Success Criteria

**Unit Tests:**
```bash
pnpm test agi
# > 80% coverage
# > 20 tests passing
```

**Backtest:**
```
Win rate: > 55%
Profit factor: > 1.2
Max drawdown: < 5%
Sharpe ratio: > 1.0
```

**Paper Trading:**
- 48 hours uptime
- No critical errors
- Circuit breakers functional

---

## Related Files

- Create: `src/agi/__tests__/ollama-client.test.ts`
- Create: `src/agi/__tests__/sop-engine.test.ts`
- Create: `src/agi/__tests__/circuit-breaker.test.ts`
- Create: `scripts/agi-backtest.ts`
- Create: `plans/reports/agi-backtest-report.md`
- Create: `plans/reports/agi-validation-report.md`

---

## Validation Commands

```bash
# Unit tests
pnpm test agi

# Backtest
pnpm run agi:backtest --days 30

# Paper trading
pnpm run agi:paper --duration 48h

# Generate report
pnpm run agi:report
```

---

## Next Steps

→ **Phase Complete: AGI Ready for Production**

After validation:
- Review performance metrics
- Approve for live trading (small positions)
- Monitor closely first 24 hours
