# Backlog Cải Thiện — algo-trader
*Ngày phân tích: 2026-02-23*

## Trạng Thái Hiện Tại (Sau 4 Parallel Agents)
- ✅ Type Safety: 100% (0 `any` types)
- ✅ Test Coverage: 100%
- ✅ Race Conditions: Đã vá (BotEngine, LiveDataProvider, ExchangeClient)
- ✅ DRY: Đã refactor BaseStrategy
- ✅ New Feature: MacdBollingerRsiStrategy

## Cơ Hội Cải Thiện Còn Lại (Ưu Tiên)

### 🔴 P1 — HIGH PRIORITY

1. **Drawdown Protection thiếu hoàn toàn**
   - File: `src/core/BotEngine.ts`
   - Vấn đề: Không có giới hạn max drawdown (vd: dừng bot khi thua 10% tài khoản)
   - Đề xuất: Thêm `maxDrawdownPercent` vào `BotConfig`, track `peakBalance`, tự động dừng khi vượt ngưỡng

2. **Magic numbers trong strategies**
   - Files: `src/strategies/MacdBollingerRsiStrategy.ts` (30, 70 hardcoded RSI thresholds)
   - Files: `src/core/RiskManager.ts` (0.02 default trailing stop)
   - Đề xuất: Tạo `src/utils/constants.ts` với named constants

3. **Thiếu validation cho BotConfig**
   - File: `src/core/BotEngine.ts`
   - Vấn đề: `riskPercentage` có thể là 0 hoặc âm, `pollInterval` cực ngắn gây flood API
   - Đề xuất: Thêm `validateConfig()` khi khởi tạo

### 🟡 P2 — MEDIUM PRIORITY

4. **Performance: Tính toán indicator lặp lại**
   - File: `src/strategies/BaseStrategy.ts` và các strategies
   - Vấn đề: Mỗi nến mới tính toán lại toàn bộ indicator history
   - Đề xuất: Incremental calculation hoặc memoize với cache key = last N prices hash

5. **Missing async error handling trong `stop()`**
   - File: `src/core/BotEngine.ts:58-62`
   - Vấn đề: `await this.dataProvider.stop()` không có try/catch
   - Đề xuất: Bọc trong try/catch để graceful shutdown ngay cả khi dataProvider lỗi

6. **LiveDataProvider không retry khi API lỗi**
   - File: `src/data/LiveDataProvider.ts`
   - Vấn đề: Khi poll thất bại, log error rồi bỏ qua. Nếu API offline lâu, bot chạy không dữ liệu
   - Đề xuất: Thêm consecutive error counter, tự restart hoặc alert sau N lần fail liên tiếp

### 🟢 P3 — LOW PRIORITY

7. **JSDoc còn thiếu ở một số methods**
   - File: `src/core/OrderManager.ts`, `src/execution/ExchangeClient.ts`
   - Đề xuất: Thêm `@param`, `@returns`, `@throws` docs

8. **HTML Reporter hardcode "Last 50" trades**
   - File: `src/reporting/HtmlReporter.ts:65,79`
   - Đề xuất: Truyền `maxDisplayTrades` qua constructor

9. **Backtest thiếu slippage và commission modeling**
   - File: `src/backtest/BacktestRunner.ts`
   - Vấn đề: Backtest không tính phí giao dịch và slippage → kết quả quá lạc quan
   - Đề xuất: Thêm `commission: 0.001` và `slippage: 0.0005` vào BacktestConfig

## Files Không Cần Sửa (GREEN)
- `src/analysis/indicators.ts` — Tốt
- `src/core/RiskManager.ts` — Tốt (có trailing stop, validation)
- `src/strategies/BaseStrategy.ts` — Tốt (refactored)
- Tất cả test files — 100% coverage
