---
title: "Algo Trader Bootstrap"
description: "Implementation of modular algo trading bot with RSI+SMA strategy"
status: pending
priority: P1
effort: 5d
branch: feat/algo-trader-init
tags: [trading, algo, ccxt, typescript]
created: 2026-02-15
---

# Algo Trader Bootstrap Plan

## Context
Create a detailed implementation plan for `apps/algo-trader` within the `mekong-cli` monorepo. The goal is to build a robust, extensible trading bot capable of backtesting and live execution using CCXT, following a modular design where each module has a single responsibility.

## Architecture
Modular design following "Single Responsibility Principle".

- **Core (`src/core/`)**: Engine orchestrating data, strategy, and execution.
- **Strategy (`src/strategies/`)**: Logic for entry/exit signals.
- **Execution (`src/execution/`)**: Interface with exchanges (CCXT).
- **Data (`src/data/`)**: Market data feed (Live/Mock).
- **Analysis (`src/analysis/`)**: Technical indicators.
- **Utils (`src/utils/`)**: Logging, Configuration.
- **UI (`src/ui/`)**: CLI Dashboard.
- **Reporting (`src/reporting/`)**: Performance analysis and reports.

## Phases

### Phase 1: Define Strategy & Backtest
**Goal:** Implement the core strategy logic and verify it against mock data.
**Strategy Details:** RSI + SMA 20/50.
- **Files to Create:**
  - `apps/algo-trader/package.json` (Dependencies: ccxt, technicalindicators, winston, etc.)
  - `apps/algo-trader/tsconfig.json`
  - `apps/algo-trader/src/interfaces/IStrategy.ts`
  - `apps/algo-trader/src/interfaces/IDataProvider.ts`
  - `apps/algo-trader/src/strategies/RsiSmaStrategy.ts`
  - `apps/algo-trader/src/analysis/indicators.ts` (Wrappers for RSI, SMA)
  - `apps/algo-trader/src/data/MockDataProvider.ts` (Generates synthetic OHLCV data)
  - `apps/algo-trader/src/backtest/BacktestRunner.ts`

### Phase 2: Implement Execution Logic
**Goal:** Connect to exchanges via CCXT and handle order execution with risk management.
**Risk Rule:** Position Sizing 1% of account balance per trade.
- **Files to Create:**
  - `apps/algo-trader/src/interfaces/IExchange.ts`
  - `apps/algo-trader/src/execution/ExchangeClient.ts` (CCXT wrapper)
  - `apps/algo-trader/src/core/RiskManager.ts` (Calculates position size)
  - `apps/algo-trader/src/core/BotEngine.ts` (Main event loop processing ticks)
  - `apps/algo-trader/src/core/OrderManager.ts` (Lifecycle of orders)

### Phase 3: Deploy & Monitor
**Goal:** Robust logging and real-time visibility.
- **Files to Create:**
  - `apps/algo-trader/src/utils/logger.ts` (Winston configuration)
  - `apps/algo-trader/src/ui/CliDashboard.ts` (Console UI using `ink` or `blessed`)
  - `apps/algo-trader/src/index.ts` (Application Entry point)

### Phase 4: Optimize & Refine
**Goal:** Make the system configurable and extensible.
- **Files to Create:**
  - `apps/algo-trader/src/interfaces/IConfig.ts`
  - `apps/algo-trader/src/core/StrategyLoader.ts` (Dynamic loading of strategies)
  - `apps/algo-trader/config/default.yaml`
  - `apps/algo-trader/src/utils/config.ts`

### Phase 5: Generate Performance Report
**Goal:** Visualize performance metrics.
- **Files to Create:**
  - `apps/algo-trader/src/reporting/PerformanceAnalyzer.ts` (Calculate ROI, Drawdown, Sharpe)
  - `apps/algo-trader/src/reporting/HtmlReporter.ts` (Generate HTML output)
  - `apps/algo-trader/src/reporting/ConsoleReporter.ts` (Summary to stdout)

## Tasks Checklist

### Setup
- [ ] Initialize `apps/algo-trader` with `package.json` and `tsconfig.json`.
- [ ] Install dependencies: `ccxt`, `winston`, `technicalindicators`, `yaml`, `commander`, `chalk`.

### Phase 1 Implementation
- [ ] Define `IStrategy` interface (onTick, onCandle).
- [ ] Implement `RsiSmaStrategy`:
    - Calculate SMA 20, SMA 50, RSI 14.
    - Logic: Buy if SMA20 > SMA50 AND RSI < 30. Sell if RSI > 70.
- [ ] Implement `MockDataProvider` to stream standard OHLCV candles.

### Phase 2 Implementation
- [ ] Implement `RiskManager`: `calculatePositionSize(balance, riskPercentage)`.
- [ ] Implement `ExchangeClient`: methods for `fetchTicker`, `createOrder`, `fetchBalance`.
- [ ] Implement `BotEngine`: Orchestrate `DataProvider` -> `Strategy` -> `RiskManager` -> `Execution`.

### Phase 3 Implementation
- [ ] Setup Winston logger with file transport (rotation) and console transport.
- [ ] Create `CliDashboard` to show current price, open positions, and last signal.

### Phase 4 Implementation
- [ ] Refactor hardcoded values into `config/default.yaml`.
- [ ] Implement `StrategyFactory` or `Loader` to select strategy from config.

### Phase 5 Implementation
- [ ] Create reporting module to analyze trade history.
- [ ] Generate `report.html` with equity curve chart (using simple JS lib injected).
