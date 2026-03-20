/**
 * Production Risk Gate — Single entry point for all pre-trade risk checks.
 * Designed for $100K+ portfolios. Composes circuit breakers, position limits,
 * rate limiter, and kill switch into one canTrade() call.
 */

import { logger } from '../utils/logger';
import {
  MaxDrawdownCircuitBreaker,
  ConsecutiveLossLimiter,
  DailyLossCircuitBreaker,
  CircuitBreakerState,
} from './circuit-breakers';

export interface ProductionRiskConfig {
  portfolioValue: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxPerMarketPct: number;
  maxConsecutiveLosses: number;
  maxOrdersPerMinute: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  checks: {
    killSwitch: boolean;
    dailyLoss: boolean;
    drawdown: boolean;
    consecutiveLoss: boolean;
    perMarketCap: boolean;
    rateLimit: boolean;
  };
}

export class ProductionRiskGate {
  private config: ProductionRiskConfig;
  private killSwitch: CircuitBreakerState = { isTripped: false };
  private cbManager: {
    drawdown: MaxDrawdownCircuitBreaker;
    consecutiveLoss: ConsecutiveLossLimiter;
    dailyLoss: DailyLossCircuitBreaker;
  };
  private rateLimiter: {
    windowStart: number;
    count: number;
  };
  private peakValue: number;
  private currentValue: number;
  private dailyPnl: number;

  constructor(config?: Partial<ProductionRiskConfig>) {
    this.config = {
      portfolioValue: config?.portfolioValue ?? 1000,
      maxDailyLossPct: config?.maxDailyLossPct ?? 5,
      maxDrawdownPct: config?.maxDrawdownPct ?? 15,
      maxPerMarketPct: config?.maxPerMarketPct ?? 10,
      maxConsecutiveLosses: config?.maxConsecutiveLosses ?? 8,
      maxOrdersPerMinute: config?.maxOrdersPerMinute ?? 120,
    };

    this.cbManager = {
      drawdown: new MaxDrawdownCircuitBreaker(this.config.maxDrawdownPct),
      consecutiveLoss: new ConsecutiveLossLimiter(this.config.maxConsecutiveLosses),
      dailyLoss: new DailyLossCircuitBreaker(
        (this.config.portfolioValue * this.config.maxDailyLossPct) / 100
      ),
    };

    this.rateLimiter = { windowStart: Date.now(), count: 0 };
    this.peakValue = this.config.portfolioValue;
    this.currentValue = this.config.portfolioValue;
    this.dailyPnl = 0;
  }

  /**
   * Single check before any trade — returns allowed/denied + reason
   */
  canTrade(marketId?: string, positionValueUsd?: number): RiskCheckResult {
    const checks = {
      killSwitch: !this.killSwitch.isTripped,
      dailyLoss: true,
      drawdown: true,
      consecutiveLoss: true,
      perMarketCap: true,
      rateLimit: true,
    };

    // Check kill switch first
    if (this.killSwitch.isTripped) {
      return {
        allowed: false,
        reason: `Kill switch tripped: ${this.killSwitch.reason}`,
        checks,
      };
    }

    // Check daily loss
    const dailyLossLimit = (this.config.portfolioValue * this.config.maxDailyLossPct) / 100;
    if (Math.abs(this.dailyPnl) >= dailyLossLimit && this.dailyPnl < 0) {
      checks.dailyLoss = false;
      return {
        allowed: false,
        reason: `Daily loss limit hit: $${Math.abs(this.dailyPnl).toFixed(2)} >= $${dailyLossLimit.toFixed(2)}`,
        checks,
      };
    }

    // Check drawdown
    const drawdownPct = ((this.peakValue - this.currentValue) / this.peakValue) * 100;
    const drawdownState = this.cbManager.drawdown.check(drawdownPct);
    if (drawdownState.isTripped) {
      checks.drawdown = false;
      return {
        allowed: false,
        reason: drawdownState.reason,
        checks,
      };
    }

    // Check consecutive losses
    const lossState = this.cbManager.consecutiveLoss.getState();
    if (lossState.isTripped) {
      checks.consecutiveLoss = false;
      return {
        allowed: false,
        reason: lossState.reason,
        checks,
      };
    }

    // Check per-market cap
    if (positionValueUsd !== undefined && marketId) {
      const maxPerMarket = (this.config.portfolioValue * this.config.maxPerMarketPct) / 100;
      if (positionValueUsd > maxPerMarket) {
        checks.perMarketCap = false;
        return {
          allowed: false,
          reason: `Position size $${positionValueUsd.toFixed(2)} exceeds max per market $${maxPerMarket.toFixed(2)}`,
          checks,
        };
      }
    }

    // Check rate limit
    const now = Date.now();
    if (now - this.rateLimiter.windowStart >= 60000) {
      // Reset every minute
      this.rateLimiter.windowStart = now;
      this.rateLimiter.count = 0;
    }
    if (this.rateLimiter.count >= this.config.maxOrdersPerMinute) {
      checks.rateLimit = false;
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.rateLimiter.count}/${this.config.maxOrdersPerMinute} orders/min`,
        checks,
      };
    }

    return {
      allowed: true,
      checks,
    };
  }

  /** Record trade outcome for circuit breaker tracking */
  recordTrade(profit: number): void {
    // Update PnL
    this.dailyPnl += profit;
    this.currentValue += profit;

    // Update peak
    if (this.currentValue > this.peakValue) {
      this.peakValue = this.currentValue;
    }

    // Record for consecutive loss tracker
    this.cbManager.consecutiveLoss.recordTrade(profit);

    // Increment rate limiter
    const now = Date.now();
    if (now - this.rateLimiter.windowStart >= 60000) {
      this.rateLimiter.windowStart = now;
      this.rateLimiter.count = 0;
    }
    this.rateLimiter.count++;

    logger.debug(
      `[RiskGate] Trade recorded: PnL=${profit.toFixed(2)}, Daily=${this.dailyPnl.toFixed(2)}, Value=${this.currentValue.toFixed(2)}`
    );
  }

  /** Emergency stop */
  emergencyStop(reason?: string): void {
    this.killSwitch = {
      isTripped: true,
      trippedAt: Date.now(),
      reason: reason || 'Manual emergency stop',
    };
    logger.error('[RiskGate] EMERGENCY STOP ACTIVATED');
  }

  /** Reset all breakers (requires explicit call) */
  reset(): void {
    this.killSwitch = { isTripped: false };
    this.cbManager.drawdown.reset();
    this.cbManager.consecutiveLoss.reset();
    this.cbManager.dailyLoss = new DailyLossCircuitBreaker(
      (this.config.portfolioValue * this.config.maxDailyLossPct) / 100
    );
    this.rateLimiter = { windowStart: Date.now(), count: 0 };
    this.dailyPnl = 0;
    logger.info('[RiskGate] All breakers reset');
  }

  /** Get full status */
  getStatus() {
    const drawdownPct = ((this.peakValue - this.currentValue) / this.peakValue) * 100;
    return {
      portfolioValue: this.currentValue,
      peakValue: this.peakValue,
      dailyPnl: this.dailyPnl,
      drawdownPct,
      ordersThisMinute: this.rateLimiter.count,
      config: this.config,
      maxDrawdown: this.cbManager.drawdown.getState(),
      consecutiveLoss: this.cbManager.consecutiveLoss.getState(),
      dailyLoss: this.cbManager.dailyLoss.getState(),
      killSwitch: this.killSwitch,
      anyTripped:
        this.killSwitch.isTripped ||
        this.cbManager.drawdown.getState().isTripped ||
        this.cbManager.consecutiveLoss.getState().isTripped ||
        this.cbManager.dailyLoss.getState().isTripped,
    };
  }
}
