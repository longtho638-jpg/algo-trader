# Phase 03: Create Trading SOPs

**Parent:** [plan.md](./plan.md) | **Dependencies:** None | **Parallel:** Yes

---

## Overview

Create trading strategy SOP definitions in JSON format for AGI SOPs engine.

**Priority:** High | **Effort:** 2-3 hours

---

## Key Insights

- SOPs define trading workflows as step-by-step procedures
- AGI SOPs engine executes steps sequentially
- Each step calls registered actions (trading:scan, backtest:run, etc.)

---

## Requirements

1. Create SOP for daily market scan
2. Create SOP for arbitrage detection
3. Create SOP for backtest execution
4. Create SOP for risk management check
5. Validate SOP syntax with parser
6. Document SOP structure

---

## Architecture

```
SOP JSON → Orchestrator → Parse → Execute Steps → Actions → Results
```

---

## Related Code Files

**Read:**
- `src/agi-sops/orchestrator.js` - Execution engine
- `src/agi-sops/sop-parser.js` - JSON/YAML validator
- `src/agi-sops/index.js` - Registered actions

**Created:**
- `sops/daily-scan.json`
- `sops/arbitrage-detect.json`
- `sops/backtest-run.json`
- `sops/risk-check.json`

---

## File Ownership

| File | Change |
|------|--------|
| `sops/*.json` | Create new SOPs |
| `src/agi-sops/index.js` | Add new actions (if needed) |

---

## Implementation Steps

### Step 1: Daily Market Scan SOP

**sops/daily-scan.json:**
```json
{
  "name": "daily-market-scan",
  "version": "1.0.0",
  "description": "Scan top crypto pairs for trading opportunities",
  "steps": [
    {
      "id": "scan-binance",
      "action": "trading:scan",
      "params": {
        "pairs": ["BTC/USDT", "ETH/USDT", "BNB/USDT"],
        "exchanges": ["binance"]
      }
    },
    {
      "id": "analyze-results",
      "action": "llm:chat",
      "params": {
        "prompt": "Analyze these scanning results and identify top 3 opportunities"
      }
    },
    {
      "id": "save-report",
      "action": "file:write",
      "params": {
        "path": "reports/daily-scan-{{timestamp}}.json",
        "content": "{{scan-results}}"
      }
    }
  ]
}
```

### Step 2: Arbitrage Detection SOP

**sops/arbitrage-detect.json:**
```json
{
  "name": "arbitrage-detection",
  "version": "1.0.0",
  "description": "Find price differences across exchanges",
  "steps": [
    {
      "id": "scan-exchanges",
      "action": "trading:scan",
      "params": {
        "pairs": ["BTC/USDT", "ETH/USDT"],
        "exchanges": ["binance", "coinbase", "kraken"]
      }
    },
    {
      "id": "compare-prices",
      "action": "llm:chat",
      "params": {
        "prompt": "Compare prices across exchanges. Identify arbitrage opportunities >1% spread"
      }
    },
    {
      "id": "execute-if-profitable",
      "action": "trading:execute",
      "params": {
        "condition": "spread > 1%",
        "strategy": "arbitrage"
      }
    }
  ]
}
```

### Step 3: Backtest Execution SOP

**sops/backtest-run.json:**
```json
{
  "name": "backtest-execution",
  "version": "1.0.0",
  "description": "Run backtest on trading strategy",
  "steps": [
    {
      "id": "fetch-data",
      "action": "http:request",
      "params": {
        "url": "https://api.binance.com/api/v3/klines",
        "method": "GET",
        "params": {
          "symbol": "BTCUSDT",
          "interval": "1h",
          "limit": 1000
        }
      }
    },
    {
      "id": "run-backtest",
      "action": "backtest:run",
      "params": {
        "strategy": "momentum",
        "data": "{{fetch-data.response}}",
        "start_date": "2025-01-01",
        "end_date": "2026-03-01"
      }
    },
    {
      "id": "analyze-performance",
      "action": "llm:chat",
      "params": {
        "prompt": "Analyze backtest results: Sharpe ratio, max drawdown, win rate"
      }
    }
  ]
}
```

### Step 4: Risk Management SOP

**sops/risk-check.json:**
```json
{
  "name": "risk-management-check",
  "version": "1.0.0",
  "description": "Verify trades meet risk criteria",
  "steps": [
    {
      "id": "check-position-size",
      "action": "trading:risk-check",
      "params": {
        "max_position": "10% of portfolio",
        "max_loss": "2% per trade"
      }
    },
    {
      "id": "check-correlation",
      "action": "llm:chat",
      "params": {
        "prompt": "Check if new position increases portfolio correlation risk"
      }
    },
    {
      "id": "approve-or-reject",
      "action": "system:wait",
      "params": {
        "condition": "risk-check.passed && correlation.acceptable"
      }
    }
  ]
}
```

### Step 5: Register New Actions (if needed)

Update `src/agi-sops/index.js` if SOPs need new actions.

### Step 6: Validate SOPs

```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader
node -e "
const fs = require('fs');
const { validateSOP } = require('./src/agi-sops/sop-parser');
const files = fs.readdirSync('sops');
files.forEach(f => {
  const sop = JSON.parse(fs.readFileSync('sops/' + f, 'utf8'));
  const valid = validateSOP(sop);
  console.log(f, valid ? '✓' : '✗', valid.errors || '');
});
"
```

---

## Todo List

- [ ] Create sops/daily-scan.json
- [ ] Create sops/arbitrage-detect.json
- [ ] Create sops/backtest-run.json
- [ ] Create sops/risk-check.json
- [ ] Register new actions (if needed)
- [ ] Validate all SOPs with parser
- [ ] Document SOP format in docs/

---

## Success Criteria

- 4 SOP files created in sops/ directory
- All SOPs pass validation
- SOPs use registered actions correctly
- Documentation added for SOP structure

---

## Conflict Prevention

No conflicts - sops/ directory is exclusive to this phase.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Invalid SOP syntax | Low | Parser validates before execution |
| Missing actions | Medium | Register stub actions first |
| Logic errors in SOP | Medium | Test with dry-run mode |

---

## Security Considerations

- Validate all SOP parameters before execution
- Sanitize file paths in file:write actions
- Rate limit HTTP requests

---

## Next Steps

After completion:
- Phase 04 can test SOPs with Ollama
- SOPs ready for production trading
