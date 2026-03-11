# Phase 02: Security & Config Validation

## Context
- [Plan](plan.md) | [Research: Exchange/Risk Analysis](research/researcher-02-exchange-risk-engine.md)
- Depends on: Phase 01 (test infrastructure)

## Overview
- **Priority:** P0 — BLOCKING
- **Status:** ⬜ Pending
- **Effort:** 1h
- **Mô tả:** Thêm validation cho config + env vars tại startup. Đảm bảo bot không chạy live trading khi thiếu credentials.

## Key Insights
- `config.ts` đọc env vars nhưng KHÔNG validate → bot chạy với undefined keys
- `index.ts` dùng `process.env.EXCHANGE_API_KEY || process.env.API_KEY` → silent undefined nếu thiếu cả 2
- `default.yaml` không có apiKey/secret (đúng, nên lấy từ env)
- `.env.example` có template đầy đủ

## Requirements
1. **Startup validation**: Khi `live` command chạy → PHẢI có EXCHANGE_API_KEY + EXCHANGE_SECRET
2. **Warning log**: Khi backtest mode → warn nếu thiếu keys nhưng KHÔNG crash
3. **Config schema validation**: IConfig fields phải hợp lệ (symbol format, riskPercentage range)
4. **Grep audit**: Scan toàn bộ src/ cho hardcoded secrets patterns

## Related Code Files
- `src/utils/config.ts` — MODIFY: add validation
- `src/index.ts` — MODIFY: add startup check for live mode
- `src/interfaces/IConfig.ts` — REVIEW: ensure all fields typed

## Implementation Steps

1. Thêm `validateConfig()` function vào `config.ts`
   ```typescript
   static validate(config: IConfig, mode: 'live' | 'backtest'): void {
     if (mode === 'live') {
       if (!config.exchange.apiKey) throw new Error('EXCHANGE_API_KEY required for live trading');
       if (!config.exchange.secret) throw new Error('EXCHANGE_SECRET required for live trading');
     }
     if (config.bot.riskPercentage <= 0 || config.bot.riskPercentage > 100)
       throw new Error('riskPercentage must be 0-100');
     if (!config.bot.symbol.includes('/'))
       throw new Error('symbol must be in BASE/QUOTE format');
   }
   ```

2. Update `index.ts` live command → gọi validate trước start

3. Viết tests cho validation logic

4. Chạy grep scan cuối cùng:
   ```bash
   grep -rn "sk_live\|pk_live\|sk_test\|AKIA\|AIza" src/ --include="*.ts"
   ```

## Todo List
- [ ] Thêm validateConfig() vào config.ts
- [ ] Update index.ts live command check
- [ ] Viết config validation tests
- [ ] Grep audit cho hardcoded secrets
- [ ] `npx jest` → ALL PASS

## Success Criteria
- Bot crash rõ ràng nếu thiếu API keys khi chạy live
- Bot KHÔNG crash khi backtest (keys optional)
- 0 hardcoded secrets trong source
- Validation tests PASS

## Risk Assessment
- Breaking existing tests nếu validate quá strict
- Cần đảm bảo backtest mode không bị affect

## Security Considerations
- KHÔNG log giá trị API key/secret (chỉ log "missing" hay "present")
- `.env` file PHẢI nằm trong `.gitignore`
