---
description: 📐 Strategy management — list, create, compare, analyze
argument-hint: [action: list|create|compare|analyze] [strategy-name]
---

**Think** để quản lý strategies: <args>$ARGUMENTS</args>

## Context

CWD: `apps/algo-trader`
Strategies dir: `src/strategies/`
Interface: `src/interfaces/IStrategy.ts`

## Actions

### list — Liệt kê strategies hiện có
```bash
ls apps/algo-trader/src/strategies/*.ts
```

### create — Tạo strategy mới
1. Read `src/interfaces/IStrategy.ts` for interface contract
2. Create file `src/strategies/{name}-strategy.ts`
3. Implement: `analyze()`, `shouldBuy()`, `shouldSell()`, `getSignals()`
4. Register in `src/core/StrategyLoader.ts`
5. Add test `tests/core/{name}-strategy.test.ts`
6. Run `pnpm test` verify

### compare — So sánh hiệu suất
```bash
cd apps/algo-trader && pnpm dev compare
```
Output: Win rate, Sharpe, Max Drawdown, Total Return per strategy

### analyze — Phân tích strategy cụ thể
1. Read strategy source code
2. Backtest với multiple timeframes
3. Walk-forward analysis
4. Report: signals quality, overfitting risk, market regime sensitivity

## Strategy Template

```typescript
import { IStrategy, Signal } from '../interfaces/IStrategy';

export class MyStrategy implements IStrategy {
  name = 'MyStrategy';

  analyze(candles: Candle[]): Signal {
    // Technical indicator logic
    return { action: 'hold', confidence: 0 };
  }
}
```
