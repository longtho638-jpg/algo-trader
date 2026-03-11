---
description: 🏥 Exchange connectivity & health dashboard
argument-hint: [target: all|binance|okx|bybit|redis|build]
---

**Think** để check trading system health: <target>$ARGUMENTS</target>

## Health Checks

### 1. TypeScript Build
```bash
cd apps/algo-trader && tsc --noEmit 2>&1 | tail -5
echo "TS errors: $(tsc --noEmit 2>&1 | grep -c 'error TS')"
```

### 2. Test Suite
```bash
cd apps/algo-trader && pnpm test 2>&1 | tail -10
```

### 3. Exchange Connectivity (dry-run)
```bash
cd apps/algo-trader && pnpm dev arb:scan 2>&1 | head -20
```

### 4. Redis (BullMQ queues)
```bash
redis-cli ping 2>/dev/null && echo "✅ Redis UP" || echo "❌ Redis DOWN"
redis-cli llen "bull:backtest:wait" 2>/dev/null
redis-cli llen "bull:strategy-scan:wait" 2>/dev/null
```

### 5. Dashboard
```bash
curl -sI http://localhost:5173 2>/dev/null | head -1 || echo "Dashboard not running"
```

### 6. API Server
```bash
curl -s http://localhost:3001/health 2>/dev/null | head -5 || echo "API not running"
```

## Output Format

```
## Trading Health — $(date)
| Component | Status | Details |
|-----------|--------|---------|
| TypeScript | ✅/❌ | N errors |
| Tests | ✅/❌ | N/N pass |
| Exchanges | ✅/❌ | connected count |
| Redis | ✅/❌ | queue depths |
| Dashboard | ✅/❌ | port status |
| API | ✅/❌ | health endpoint |
```
