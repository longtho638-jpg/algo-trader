/**
 * Market Analysis Agent — Technical analysis and pattern recognition.
 * Analyzes price action, indicators, and generates trading signals.
 */

import { BaseAgent, TradingEvent, ActionPlan, ExecutionResult, VerificationResult } from './base-agent';
import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AutonomyLevel, AgentEventType, SignalRationaleEvent } from '../a2ui/types';
import { logger } from '../utils/logger';
import { Indicators } from '../analysis/indicators';

/** Market analysis result */
export interface MarketAnalysis {
  symbol: string;
  timestamp: number;
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number };
  bollinger?: { upper: number; middle: number; lower: number };
  trend?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: Array<{ type: 'BUY' | 'SELL' | 'HOLD'; strength: number; reason: string }>;
}

/** Configuration for market analysis thresholds */
export interface MarketAnalysisConfig {
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbPeriod: number;
  bbStdDev: number;
  maPeriods: number[];
}

const DEFAULT_CONFIG: MarketAnalysisConfig = {
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbStdDev: 2,
  maPeriods: [20, 50, 200],
};

export class MarketAnalysisAgent extends BaseAgent {
  private config: MarketAnalysisConfig;

  constructor(eventBus: AgentEventBus, config?: Partial<MarketAnalysisConfig>) {
    super('market-analysis-agent', eventBus, AutonomyLevel.PLAN);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async plan(tradingEvent: TradingEvent): Promise<ActionPlan> {
    logger.debug(`[MarketAnalysis] Planning analysis for ${tradingEvent.symbol}`);

    const actions: ActionPlan['actions'] = [
      {
        type: 'ANALYZE',
        description: 'Calculate RSI indicator',
        params: { indicator: 'RSI', period: this.config.rsiPeriod },
      },
      {
        type: 'ANALYZE',
        description: 'Calculate MACD indicator',
        params: {
          indicator: 'MACD',
          fast: this.config.macdFast,
          slow: this.config.macdSlow,
          signal: this.config.macdSignal,
        },
      },
      {
        type: 'ANALYZE',
        description: 'Calculate Bollinger Bands',
        params: { indicator: 'BB', period: this.config.bbPeriod, stdDev: this.config.bbStdDev },
      },
      {
        type: 'DECIDE',
        description: 'Generate trading signal from indicator confluence',
        params: { method: 'weighted_confluence' },
      },
    ];

    return {
      agentId: this.agentId,
      actions,
      confidence: 0.8,
      rationale: 'Multi-indicator analysis for signal generation',
    };
  }

  async execute(plan: ActionPlan, tradingEvent?: TradingEvent): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prices = (plan.actions[0]?.params?.prices as number[]) ?? [];

    if (!tradingEvent) {
      return {
        success: false,
        output: {},
        error: 'Trading event required for execution',
        duration: Date.now() - startTime,
      };
    }

    if (prices.length === 0) {
      return {
        success: false,
        output: {},
        error: 'No price data provided',
        duration: Date.now() - startTime,
      };
    }

    try {
      // Calculate indicators using Indicators class
      const rsi = Indicators.rsi(prices, this.config.rsiPeriod);
      const macd = Indicators.macd(prices, this.config.macdFast, this.config.macdSlow, this.config.macdSignal);
      const bb = Indicators.bbands(prices, this.config.bbPeriod, this.config.bbStdDev);
      const mas = this.config.maPeriods.map(period => ({
        period,
        value: Indicators.getLast(Indicators.sma(prices, period)),
      }));

      // Analyze trend
      const currentPrice = prices[prices.length - 1];
      const trend = this.analyzeTrend(currentPrice, mas.map(m => m.value));

      // Analyze volatility
      const volatility = this.analyzeVolatility(bb, prices);

      // Generate signals
      const signals = this.generateSignals({ rsi, macd, bb, trend, volatility });

      const analysis: MarketAnalysis = {
        symbol: tradingEvent.symbol,
        timestamp: Date.now(),
        rsi: rsi[rsi.length - 1],
        macd: macd[macd.length - 1] as unknown as { macd: number; signal: number; histogram: number },
        bollinger: bb[bb.length - 1],
        trend,
        volatility,
        signals,
      };

      return {
        success: true,
        output: { analysis },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: {},
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  async verify(result: ExecutionResult): Promise<VerificationResult> {
    const findings: string[] = [];
    const recommendations: string[] = [];

    if (!result.success) {
      return {
        passed: false,
        score: 0,
        findings: [result.error ?? 'Execution failed'],
        recommendations: ['Check input data', 'Verify indicator parameters'],
      };
    }

    const analysis = result.output.analysis as MarketAnalysis | undefined;
    if (!analysis) {
      return {
        passed: false,
        score: 0,
        findings: ['No analysis result produced'],
        recommendations: ['Review analysis pipeline'],
      };
    }

    // Verify indicator calculations
    if (analysis.rsi !== undefined && (analysis.rsi < 0 || analysis.rsi > 100)) {
      findings.push('RSI out of valid range [0-100]');
    }

    // Verify signal consistency
    const buySignals = analysis.signals.filter(s => s.type === 'BUY').length;
    const sellSignals = analysis.signals.filter(s => s.type === 'SELL').length;

    if (buySignals > 0 && sellSignals > 0) {
      recommendations.push('Conflicting signals detected - review indicator weights');
    }

    const score = this.calculateConfidenceScore(analysis);
    const passed = score >= 0.6;

    if (!passed) {
      recommendations.push('Low confidence - consider additional confirmation');
    }

    findings.push(`Analysis complete: ${analysis.signals.length} signals generated`);
    findings.push(`Trend: ${analysis.trend}, Volatility: ${analysis.volatility}`);

    return {
      passed,
      score,
      findings,
      recommendations,
    };
  }

  protected async publish(
    verification: VerificationResult,
    tradingEvent?: TradingEvent,
    plan?: ActionPlan,
    result?: ExecutionResult
  ): Promise<void> {
    if (!tradingEvent || !result?.success) return;

    const analysis = result.output.analysis as MarketAnalysis | undefined;
    if (!analysis) return;

    const primarySignal = analysis.signals[0];
    if (!primarySignal) return;

    const signalEvent: SignalRationaleEvent = {
      type: AgentEventType.SIGNAL_RATIONALE,
      tenantId: tradingEvent.tenantId,
      timestamp: Date.now(),
      strategy: 'market-analysis',
      indicators: {
        rsi: analysis.rsi ?? 0,
        macd: analysis.macd?.macd ?? 0,
        bollinger_upper: analysis.bollinger?.upper ?? 0,
        bollinger_lower: analysis.bollinger?.lower ?? 0,
      },
      reasoning: primarySignal.reason,
      signal: primarySignal.type === 'HOLD' ? 'NONE' : primarySignal.type,
    };

    await this.eventBus.emit(signalEvent);
  }

  private analyzeTrend(price: number, mas: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    const shortMA = mas[0] ?? price;
    const longMA = mas[mas.length - 1] ?? price;

    if (price > shortMA && shortMA > longMA) return 'BULLISH';
    if (price < shortMA && shortMA < longMA) return 'BEARISH';
    return 'SIDEWAYS';
  }

  private analyzeVolatility(
    bb: Array<{ upper: number; middle: number; lower: number }>,
    prices: number[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (bb.length === 0 || prices.length < 2) return 'MEDIUM';

    const lastBB = bb[bb.length - 1];
    const bandwidth = (lastBB.upper - lastBB.lower) / lastBB.middle;

    if (bandwidth < 0.05) return 'LOW';
    if (bandwidth > 0.15) return 'HIGH';
    return 'MEDIUM';
  }

  private generateSignals(analysis: {
    rsi?: number[];
    macd?: import('../analysis/indicators').MacdResult[];
    bb?: import('../analysis/indicators').BBandsResult[];
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  }): MarketAnalysis['signals'] {
    const signals: MarketAnalysis['signals'] = [];

    // RSI signals
    const lastRsi = analysis.rsi?.[analysis.rsi.length - 1];
    if (lastRsi !== undefined) {
      if (lastRsi < this.config.rsiOversold) {
        signals.push({ type: 'BUY', strength: 0.7, reason: `RSI oversold (${lastRsi.toFixed(1)})` });
      } else if (lastRsi > this.config.rsiOverbought) {
        signals.push({ type: 'SELL', strength: 0.7, reason: `RSI overbought (${lastRsi.toFixed(1)})` });
      }
    }

    // MACD signals
    const lastMacd = analysis.macd?.[analysis.macd.length - 1];
    if (lastMacd && (lastMacd.histogram ?? 0) > 0 && (lastMacd.MACD ?? 0) > (lastMacd.signal ?? 0)) {
      signals.push({ type: 'BUY', strength: 0.6, reason: 'MACD bullish crossover' });
    } else if (lastMacd && (lastMacd.histogram ?? 0) < 0 && (lastMacd.MACD ?? 0) < (lastMacd.signal ?? 0)) {
      signals.push({ type: 'SELL', strength: 0.6, reason: 'MACD bearish crossover' });
    }

    // Trend confirmation
    if (analysis.trend === 'BULLISH') {
      signals.push({ type: 'BUY', strength: 0.5, reason: 'Bullish trend confirmed' });
    } else if (analysis.trend === 'BEARISH') {
      signals.push({ type: 'SELL', strength: 0.5, reason: 'Bearish trend confirmed' });
    }

    return signals;
  }

  private calculateConfidenceScore(analysis: MarketAnalysis): number {
    let score = 0.5;

    // More signals = higher confidence
    score += Math.min(analysis.signals.length * 0.1, 0.3);

    // Strong signal strength
    const avgStrength =
      analysis.signals.reduce((sum, s) => sum + s.strength, 0) / analysis.signals.length;
    score += avgStrength * 0.2;

    return Math.min(score, 1);
  }
}
