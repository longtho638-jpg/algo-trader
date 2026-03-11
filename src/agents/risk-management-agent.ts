/**
 * Risk Management Agent — Portfolio risk monitoring and trade gating.
 * Monitors PnL, drawdown, exposure limits, and can block trades.
 */

import { BaseAgent, TradingEvent, ActionPlan, ExecutionResult, VerificationResult } from './base-agent';
import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AutonomyLevel, AgentEventType, RiskAlertEvent } from '../a2ui/types';
import { logger } from '../utils/logger';

/** Risk metrics for a portfolio or position */
export interface RiskMetrics {
  symbol: string;
  timestamp: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  drawdown: number;
  maxDrawdown: number;
  exposure: number;
  exposureLimit: number;
  dailyPnl: number;
  dailyLossLimit: number;
  riskScore: number; // 0-1, higher = riskier
}

/** Risk configuration thresholds */
export interface RiskConfig {
  /** Maximum daily loss in USD */
  dailyLossLimitUsd: number;
  /** Maximum drawdown percentage */
  maxDrawdownPercent: number;
  /** Maximum exposure per symbol */
  maxExposurePerSymbol: number;
  /** Maximum total exposure */
  maxTotalExposure: number;
  /** Risk score threshold to block trades */
  blockThreshold: number;
  /** Autonomy level for risk decisions */
  autonomyLevel: AutonomyLevel;
}

const DEFAULT_RISK_CONFIG: RiskConfig = {
  dailyLossLimitUsd: 1000,
  maxDrawdownPercent: 5,
  maxExposurePerSymbol: 5000,
  maxTotalExposure: 20000,
  blockThreshold: 0.8,
  autonomyLevel: AutonomyLevel.ACT_CONFIRM,
};

/** Risk assessment result */
export interface RiskAssessment {
  approved: boolean;
  reason?: string;
  riskScore: number;
  metrics: RiskMetrics;
  alerts: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }>;
}

export class RiskManagementAgent extends BaseAgent {
  private config: RiskConfig;
  private peakValue = 0;
  private dailyPnl = 0;
  private lastResetDate = new Date().toDateString();

  constructor(eventBus: AgentEventBus, config?: Partial<RiskConfig>) {
    super('risk-management-agent', eventBus, AutonomyLevel.ACT_CONFIRM);
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
  }

  async plan(tradingEvent: TradingEvent): Promise<ActionPlan> {
    logger.debug(`[RiskManagement] Planning risk assessment for ${tradingEvent.symbol}`);

    const actions: ActionPlan['actions'] = [
      {
        type: 'ANALYZE',
        description: 'Calculate current risk metrics',
        params: { metrics: ['pnl', 'drawdown', 'exposure'] },
      },
      {
        type: 'DECIDE',
        description: 'Evaluate against risk thresholds',
        params: { thresholds: this.config },
      },
      {
        type: 'EXECUTE',
        description: 'Generate risk decision (approve/veto)',
        params: { action: 'gate_decision' },
      },
    ];

    return {
      agentId: this.agentId,
      actions,
      confidence: 0.95,
      rationale: 'Risk assessment before trade execution',
    };
  }

  async execute(plan: ActionPlan, tradingEvent?: TradingEvent): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Reset daily PnL if new day
      this.checkDailyReset();

      if (!tradingEvent) {
        return {
          success: false,
          output: {},
          error: 'Trading event required for risk assessment',
          duration: Date.now() - startTime,
        };
      }

      // Extract position data from tradingEvent
      const positionData = (tradingEvent.data.position as Record<string, unknown>) ?? {};
      const currentValue = (positionData.currentValue as number) ?? 0;
      const costBasis = (positionData.costBasis as number) ?? 0;
      const exposure = (positionData.exposure as number) ?? 0;

      // Calculate PnL
      const unrealizedPnl = currentValue - costBasis;
      const realizedPnl = (positionData.realizedPnl as number) ?? 0;
      const totalPnl = unrealizedPnl + realizedPnl;

      // Update peak for drawdown calculation
      if (currentValue > this.peakValue) {
        this.peakValue = currentValue;
      }

      // Calculate drawdown
      const drawdown = this.peakValue > 0 ? (this.peakValue - currentValue) / this.peakValue : 0;
      const maxDrawdown = Math.max(drawdown, (positionData.maxDrawdown as number) ?? 0);

      // Check limits
      const alerts: RiskAssessment['alerts'] = [];

      // Daily loss limit check
      if (this.dailyPnl < -this.config.dailyLossLimitUsd) {
        alerts.push({
          type: 'DAILY_LOSS_LIMIT',
          message: `Daily loss limit breached: $${this.dailyPnl.toFixed(2)} / -$${this.config.dailyLossLimitUsd}`,
          severity: 'critical',
        });
      }

      // Drawdown check
      if (drawdown > this.config.maxDrawdownPercent / 100) {
        alerts.push({
          type: 'DRAWDOWN_LIMIT',
          message: `Drawdown limit breached: ${(drawdown * 100).toFixed(2)}% / ${this.config.maxDrawdownPercent}%`,
          severity: 'critical',
        });
      }

      // Exposure check
      if (exposure > this.config.maxExposurePerSymbol) {
        alerts.push({
          type: 'EXPOSURE_LIMIT',
          message: `Symbol exposure limit breached: $${exposure.toFixed(2)} / $${this.config.maxExposurePerSymbol}`,
          severity: 'warning',
        });
      }

      // Calculate risk score
      const riskScore = this.calculateRiskScore({
        unrealizedPnl,
        drawdown,
        exposure,
        alerts,
      });

      const metrics: RiskMetrics = {
        symbol: tradingEvent.symbol,
        timestamp: Date.now(),
        unrealizedPnl,
        realizedPnl,
        totalPnl,
        drawdown,
        maxDrawdown,
        exposure,
        exposureLimit: this.config.maxExposurePerSymbol,
        dailyPnl: this.dailyPnl,
        dailyLossLimit: this.config.dailyLossLimitUsd,
        riskScore,
      };

      const approved = riskScore < this.config.blockThreshold && alerts.filter(a => a.severity === 'critical').length === 0;
      const assessment: RiskAssessment = {
        approved,
        reason: approved ? 'Risk checks passed' : 'Risk threshold exceeded',
        riskScore,
        metrics,
        alerts,
      };

      return {
        success: true,
        output: { assessment },
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
        findings: [result.error ?? 'Risk assessment failed'],
        recommendations: ['Review position data', 'Check risk configuration'],
      };
    }

    const assessment = result.output.assessment as RiskAssessment | undefined;
    if (!assessment) {
      return {
        passed: false,
        score: 0,
        findings: ['No risk assessment produced'],
        recommendations: ['Review risk pipeline'],
      };
    }

    findings.push(`Risk score: ${assessment.riskScore.toFixed(2)} (threshold: ${this.config.blockThreshold})`);
    findings.push(`Decision: ${assessment.approved ? 'APPROVED' : 'VETOED'}`);

    if (assessment.alerts.length > 0) {
      findings.push(`${assessment.alerts.length} alerts generated`);
      for (const alert of assessment.alerts) {
        findings.push(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
      }
    }

    const passed = assessment.approved || assessment.alerts.filter(a => a.severity === 'critical').length === 0;

    if (!passed) {
      recommendations.push('Critical risk limits breached - halt trading');
    }

    return {
      passed,
      score: assessment.approved ? 1 - assessment.riskScore : assessment.riskScore,
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

    const assessment = result.output.assessment as RiskAssessment | undefined;
    if (!assessment) return;

    // Publish risk alerts
    for (const alert of assessment.alerts) {
      const riskAlert: RiskAlertEvent = {
        type: AgentEventType.RISK_ALERT,
        tenantId: tradingEvent.tenantId,
        timestamp: Date.now(),
        alertType: this.mapAlertType(alert.type),
        value: assessment.metrics.riskScore,
        threshold: this.config.blockThreshold,
        message: alert.message,
      };

      await this.eventBus.emit(riskAlert);
    }
  }

  /** Check if trade should be allowed */
  canExecuteTrade(assessment: RiskAssessment): boolean {
    return assessment.approved && assessment.riskScore < this.config.blockThreshold;
  }

  /** Get current daily PnL */
  getDailyPnl(): number {
    this.checkDailyReset();
    return this.dailyPnl;
  }

  /** Update daily PnL */
  updateDailyPnl(pnl: number): void {
    this.checkDailyReset();
    this.dailyPnl += pnl;
    logger.debug(`[RiskManagement] Daily PnL updated: $${this.dailyPnl.toFixed(2)}`);
  }

  private checkDailyReset(): void {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      logger.info(`[RiskManagement] Resetting daily PnL (was $${this.dailyPnl.toFixed(2)})`);
      this.dailyPnl = 0;
      this.lastResetDate = today;
    }
  }

  private calculateRiskScore(data: {
    unrealizedPnl: number;
    drawdown: number;
    exposure: number;
    alerts: RiskAssessment['alerts'];
  }): number {
    let score = 0;

    // Drawdown component (0-0.4)
    score += Math.min(data.drawdown * 4, 0.4);

    // Exposure component (0-0.3)
    const exposureRatio = data.exposure / this.config.maxExposurePerSymbol;
    score += Math.min(exposureRatio * 0.3, 0.3);

    // Alerts component (0-0.3)
    const criticalAlerts = data.alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = data.alerts.filter(a => a.severity === 'warning').length;
    score += Math.min(criticalAlerts * 0.15 + warningAlerts * 0.05, 0.3);

    return Math.min(score, 1);
  }

  private mapAlertType(type: string): RiskAlertEvent['alertType'] {
    switch (type) {
      case 'DAILY_LOSS_LIMIT':
        return 'daily_loss';
      case 'DRAWDOWN_LIMIT':
        return 'drawdown';
      case 'EXPOSURE_LIMIT':
        return 'volatility';
      default:
        return 'volatility';
    }
  }
}
