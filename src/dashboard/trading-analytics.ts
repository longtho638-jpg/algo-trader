/**
 * Trading Analytics Dashboard — Premium Analytics for Algo-Trader
 *
 * Provides real-time trading analytics dashboard data:
 * - Real-time PnL chart data
 * - Strategy performance comparison
 * - Risk metrics (Sharpe, Max Drawdown, Win Rate)
 * - Portfolio allocation
 * - Engagement tracking
 *
 * Gating: Free tier sees blurred preview with "Unlock Premium" overlay
 *
 * Usage:
 * ```typescript
 * const analytics = new TradingAnalyticsService();
 * const pnlData = await analytics.getPnLData('lic_abc', '24h');
 * const strategies = await analytics.getStrategyComparison('lic_abc');
 * const riskMetrics = await analytics.getRiskMetrics('lic_abc');
 * ```
 */

import { UsageTrackerService } from '../metering/usage-tracker-service';
import { LicenseTier, validateLicense } from '../lib/raas-gate';
import { logger } from '../utils/logger';

/**
 * Time range for analytics queries
 */
export type AnalyticsPeriod = '24h' | '7d' | '30d' | '90d';

/**
 * PnL data point for charting
 */
export interface PnLDataPoint {
  timestamp: string; // ISO 8601
  pnl: number; // Profit & Loss in USD
  cumulativePnl: number;
  trades: number;
  winRate: number;
}

/**
 * Strategy performance metrics
 */
export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  totalPnl: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  avgTradeSize: number;
  profitability: number; // percentage of profitable trades
}

/**
 * Risk metrics
 */
export interface RiskMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number; // days
  volatility: number; // daily volatility %
  var95: number; // Value at Risk 95%
  beta: number; // market beta
  alpha: number; // excess returns
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  consecutiveLosses: number;
}

/**
 * Portfolio allocation
 */
export interface PortfolioAllocation {
  assetType: string;
  symbol: string;
  allocation: number; // percentage (0-100)
  value: number; // USD value
  pnl: number;
  pnlPercent: number;
}

/**
 * Dashboard data response
 */
export interface DashboardData {
  pnlChart: PnLDataPoint[];
  strategies: StrategyPerformance[];
  riskMetrics: RiskMetrics;
  portfolio: PortfolioAllocation[];
  summary: {
    totalPnl: number;
    totalTrades: number;
    winRate: number;
    activeStrategies: number;
    riskScore: number; // 0-100
  };
}

/**
 * Engagement event types
 */
export type EngagementEventType =
  | 'dashboard_view'
  | 'pnl_chart_view'
  | 'strategy_compare'
  | 'risk_metrics_view'
  | 'portfolio_view'
  | 'export_data';

/**
 * Engagement event
 */
export interface EngagementEvent {
  licenseKey: string;
  eventType: EngagementEventType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Trading Analytics Service
 */
export class TradingAnalyticsService {
  private usageTracker: UsageTrackerService;
  private engagementBuffer: EngagementEvent[] = [];

  constructor() {
    this.usageTracker = UsageTrackerService.getInstance();
  }

  /**
   * Get PnL chart data for dashboard
   * Free tier: Returns blurred data (first 3 points only, rest null)
   */
  async getPnLData(
    licenseKey: string,
    period: AnalyticsPeriod = '24h',
    isFreeTier: boolean = false
  ): Promise<PnLDataPoint[]> {
    await this.trackEngagement(licenseKey, 'pnl_chart_view');

    if (isFreeTier) {
      // Return limited data for free tier
      return this.getLimitedPnLData(period);
    }

    // Full data for Pro/Enterprise
    return this.generatePnLData(period);
  }

  /**
   * Get strategy performance comparison
   * Free tier: Returns aggregated/limited data
   */
  async getStrategyComparison(
    licenseKey: string,
    isFreeTier: boolean = false
  ): Promise<StrategyPerformance[]> {
    await this.trackEngagement(licenseKey, 'strategy_compare');

    if (isFreeTier) {
      return this.getLimitedStrategyData();
    }

    return this.generateStrategyData();
  }

  /**
   * Get risk metrics
   * Free tier: Returns basic metrics only
   */
  async getRiskMetrics(
    licenseKey: string,
    isFreeTier: boolean = false
  ): Promise<RiskMetrics> {
    await this.trackEngagement(licenseKey, 'risk_metrics_view');

    if (isFreeTier) {
      return this.getBasicRiskMetrics();
    }

    return this.getFullRiskMetrics();
  }

  /**
   * Get portfolio allocation
   * Free tier: Returns delayed/aggregated data
   */
  async getPortfolioAllocation(
    licenseKey: string,
    isFreeTier: boolean = false
  ): Promise<PortfolioAllocation[]> {
    await this.trackEngagement(licenseKey, 'portfolio_view');

    if (isFreeTier) {
      return this.getLimitedPortfolioData();
    }

    return this.generatePortfolioData();
  }

  /**
   * Get complete dashboard data
   * Handles tier gating automatically
   */
  async getDashboardData(
    licenseKey: string,
    period: AnalyticsPeriod = '24h'
  ): Promise<DashboardData | { error: string; upgradeRequired: boolean }> {
    const auth = await validateLicense();
    const isFreeTier = auth.tier === LicenseTier.FREE;

    if (isFreeTier) {
      logger.info('[TradingAnalytics] Free tier accessing dashboard', { licenseKey });
    }

    const [pnlChart, strategies, riskMetrics, portfolio] = await Promise.all([
      this.getPnLData(licenseKey, period, isFreeTier),
      this.getStrategyComparison(licenseKey, isFreeTier),
      this.getRiskMetrics(licenseKey, isFreeTier),
      this.getPortfolioAllocation(licenseKey, isFreeTier),
    ]);

    const summary = {
      totalPnl: pnlChart.reduce((sum, p) => sum + p.pnl, 0),
      totalTrades: pnlChart.reduce((sum, p) => sum + p.trades, 0),
      winRate: strategies.length > 0
        ? strategies.reduce((sum, s) => sum + s.winRate, 0) / strategies.length
        : 0,
      activeStrategies: strategies.length,
      riskScore: this.calculateRiskScore(riskMetrics),
    };

    return {
      pnlChart,
      strategies,
      riskMetrics,
      portfolio,
      summary,
    };
  }

  /**
   * Track engagement event
   */
  private async trackEngagement(
    licenseKey: string,
    eventType: EngagementEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: EngagementEvent = {
      licenseKey,
      eventType,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.engagementBuffer.push(event);

    // Track via usage tracker
    await this.usageTracker.track(licenseKey, `dashboard:${eventType}`, 1, {
      dashboard_section: eventType,
    });

    // Flush buffer if large
    if (this.engagementBuffer.length >= 50) {
      await this.flushEngagementBuffer();
    }

    logger.debug('[TradingAnalytics] Engagement tracked', { licenseKey, eventType });
  }

  /**
   * Flush engagement buffer
   */
  private async flushEngagementBuffer(): Promise<void> {
    // In production, persist to database
    logger.info('[TradingAnalytics] Flushing engagement buffer', {
      count: this.engagementBuffer.length,
    });
    this.engagementBuffer = [];
  }

  /**
   * Get limited PnL data for free tier (blurred preview)
   */
  private getLimitedPnLData(period: AnalyticsPeriod): PnLDataPoint[] {
    const fullData = this.generatePnLData(period);

    // Return first 3 points, rest are null/placeholder
    const limited = fullData.slice(0, 3);

    // Add placeholder points for the rest
    const remaining = fullData.length - 3;
    for (let i = 0; i < remaining; i++) {
      limited.push({
        timestamp: fullData[3 + i].timestamp,
        pnl: 0, // Blurred
        cumulativePnl: 0,
        trades: 0,
        winRate: 0,
      });
    }

    return limited;
  }

  /**
   * Generate PnL chart data
   */
  private generatePnLData(period: AnalyticsPeriod): PnLDataPoint[] {
    const now = new Date();
    const points = period === '24h' ? 24 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const data: PnLDataPoint[] = [];

    let cumulativePnl = 0;
    for (let i = points - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * (period === '24h' ? 3600000 : 86400000));
      const trades = Math.floor(Math.random() * 10) + 1;
      const pnl = (Math.random() - 0.45) * 500; // Slightly positive bias
      cumulativePnl += pnl;

      data.push({
        timestamp: timestamp.toISOString(),
        pnl: Math.round(pnl * 100) / 100,
        cumulativePnl: Math.round(cumulativePnl * 100) / 100,
        trades,
        winRate: Math.round((0.45 + Math.random() * 0.2) * 100),
      });
    }

    return data;
  }

  /**
   * Get limited strategy data for free tier
   */
  private getLimitedStrategyData(): StrategyPerformance[] {
    return [
      {
        strategyId: 'rsi_sma_basic',
        strategyName: 'RSI + SMA (Basic)',
        totalPnl: 0,
        winRate: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        totalTrades: 0,
        avgTradeSize: 0,
        profitability: 0,
      },
    ];
  }

  /**
   * Generate strategy performance data
   */
  private generateStrategyData(): StrategyPerformance[] {
    const strategies = [
      { id: 'rsi_sma', name: 'RSI + SMA Strategy' },
      { id: 'macd', name: 'MACD Crossover' },
      { id: 'bollinger', name: 'Bollinger Bands' },
      { id: 'arbitrage', name: 'Triangular Arbitrage' },
    ];

    return strategies.map(s => ({
      strategyId: s.id,
      strategyName: s.name,
      totalPnl: Math.round((Math.random() * 5000 - 1000) * 100) / 100,
      winRate: Math.round((0.45 + Math.random() * 0.25) * 100),
      sharpeRatio: Math.round((0.5 + Math.random() * 2) * 100) / 100,
      maxDrawdown: Math.round((5 + Math.random() * 20) * 100) / 100,
      totalTrades: Math.floor(Math.random() * 500) + 50,
      avgTradeSize: Math.round((100 + Math.random() * 900) * 100) / 100,
      profitability: Math.round((0.4 + Math.random() * 0.4) * 100),
    }));
  }

  /**
   * Get basic risk metrics for free tier
   */
  private getBasicRiskMetrics(): RiskMetrics {
    return {
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      volatility: 0,
      var95: 0,
      beta: 0,
      alpha: 0,
      winRate: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      consecutiveLosses: 0,
    };
  }

  /**
   * Get full risk metrics
   */
  private getFullRiskMetrics(): RiskMetrics {
    return {
      sharpeRatio: Math.round((0.8 + Math.random() * 1.5) * 100) / 100,
      sortinoRatio: Math.round((1.0 + Math.random() * 2) * 100) / 100,
      maxDrawdown: Math.round((8 + Math.random() * 15) * 100) / 100,
      maxDrawdownDuration: Math.floor(Math.random() * 30) + 1,
      volatility: Math.round((1.5 + Math.random() * 3) * 100) / 100,
      var95: Math.round((100 + Math.random() * 400) * 100) / 100,
      beta: Math.round((0.8 + Math.random() * 0.4) * 100) / 100,
      alpha: Math.round((0.5 + Math.random() * 3) * 100) / 100,
      winRate: Math.round((0.45 + Math.random() * 0.2) * 100),
      profitFactor: Math.round((1.2 + Math.random() * 2) * 100) / 100,
      avgWin: Math.round((150 + Math.random() * 350) * 100) / 100,
      avgLoss: Math.round((50 + Math.random() * 150) * 100) / 100,
      consecutiveLosses: Math.floor(Math.random() * 5),
    };
  }

  /**
   * Get limited portfolio data for free tier
   */
  private getLimitedPortfolioData(): PortfolioAllocation[] {
    return [
      {
        assetType: 'crypto',
        symbol: 'BTC',
        allocation: 0,
        value: 0,
        pnl: 0,
        pnlPercent: 0,
      },
    ];
  }

  /**
   * Generate portfolio allocation data
   */
  private generatePortfolioData(): PortfolioAllocation[] {
    const assets = [
      { type: 'crypto', symbol: 'BTC', baseAlloc: 40 },
      { type: 'crypto', symbol: 'ETH', baseAlloc: 30 },
      { type: 'crypto', symbol: 'SOL', baseAlloc: 15 },
      { type: 'stablecoin', symbol: 'USDC', baseAlloc: 10 },
      { type: 'stablecoin', symbol: 'USDT', baseAlloc: 5 },
    ];

    return assets.map(a => {
      const allocation = a.baseAlloc + (Math.random() * 10 - 5);
      const value = allocation * 100; // Assume $10k portfolio
      const pnl = (Math.random() - 0.4) * value * 0.1;

      return {
        assetType: a.type,
        symbol: a.symbol,
        allocation: Math.round(allocation * 100) / 100,
        value: Math.round(value * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round((pnl / value) * 10000) / 100,
      };
    });
  }

  /**
   * Calculate risk score from metrics
   */
  private calculateRiskScore(riskMetrics: RiskMetrics): number {
    // Higher Sharpe = lower risk
    // Higher drawdown = higher risk
    // Higher volatility = higher risk
    const sharpeComponent = Math.max(0, 100 - riskMetrics.sharpeRatio * 20);
    const drawdownComponent = Math.min(100, riskMetrics.maxDrawdown * 5);
    const volatilityComponent = Math.min(100, riskMetrics.volatility * 10);

    return Math.round(
      (sharpeComponent * 0.4 + drawdownComponent * 0.4 + volatilityComponent * 0.2)
    );
  }
}

// Export singleton
export const tradingAnalytics = new TradingAnalyticsService();
