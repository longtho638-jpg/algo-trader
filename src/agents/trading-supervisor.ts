/**
 * Trading Supervisor Agent — Orchestrator for multi-agent trading system.
 * Coordinates specialist agents, resolves conflicts, and reports to dashboard.
 */

import { BaseAgent, TradingEvent, ActionPlan, ExecutionResult, VerificationResult } from './base-agent';
import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AutonomyLevel, AgentEventType, EscalationEvent } from '../a2ui/types';
import { logger } from '../utils/logger';
import { MarketAnalysisAgent, MarketAnalysis } from './market-analysis-agent';
import { RiskManagementAgent, RiskAssessment } from './risk-management-agent';
import { ExecutionAgent, OrderParams, OrderResult } from './execution-agent';
import { AgentCommunicationManager, SharedStateManager, MessageType } from './agent-communication';

/** Decision from a specialist agent */
export interface AgentDecision {
  agentId: string;
  decision: 'BUY' | 'SELL' | 'HOLD' | 'VETO';
  confidence: number;
  reasoning: string;
  data?: Record<string, unknown>;
}

/** Orchestrated trading decision */
export interface TradingDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | 'VETO';
  symbol: string;
  amount?: number;
  price?: number;
  confidence: number;
  reasoning: string;
  agentDecisions: AgentDecision[];
  conflicts: Array<{ agents: string[]; disagreement: string }>;
}

/** Supervisor configuration */
export interface SupervisorConfig {
  /** Require unanimous approval for trades */
  unanimousApproval: boolean;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Auto-escalate conflicts */
  autoEscalate: boolean;
  /** Risk agent has veto power */
  riskVetoPower: boolean;
}

const DEFAULT_CONFIG: SupervisorConfig = {
  unanimousApproval: false,
  minConfidence: 0.6,
  autoEscalate: true,
  riskVetoPower: true,
};

export class TradingSupervisorAgent extends BaseAgent {
  private marketAgent: MarketAnalysisAgent;
  private riskAgent: RiskManagementAgent;
  private executionAgent: ExecutionAgent;
  private commManager: AgentCommunicationManager;
  private stateManager: SharedStateManager;
  private config: SupervisorConfig;

  constructor(
    eventBus: AgentEventBus,
    marketAgent: MarketAnalysisAgent,
    riskAgent: RiskManagementAgent,
    executionAgent: ExecutionAgent,
    config?: Partial<SupervisorConfig>
  ) {
    super('trading-supervisor', eventBus, AutonomyLevel.ACT_CONFIRM);
    this.marketAgent = marketAgent;
    this.riskAgent = riskAgent;
    this.executionAgent = executionAgent;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize communication
    const comm = new AgentCommunicationManager(eventBus);
    const state = new SharedStateManager(eventBus);
    this.commManager = comm;
    this.stateManager = state;
  }

  async plan(event: TradingEvent): Promise<ActionPlan> {
    logger.info(`[Supervisor] Orchestrating decision for ${event.symbol}`);

    const actions: ActionPlan['actions'] = [
      {
        type: 'ANALYZE',
        description: 'Request market analysis from Market Agent',
        params: { agent: 'market-analysis', request: 'signal' },
      },
      {
        type: 'ANALYZE',
        description: 'Request risk assessment from Risk Agent',
        params: { agent: 'risk-management', request: 'approval' },
      },
      {
        type: 'DECIDE',
        description: 'Aggregate agent decisions and resolve conflicts',
        params: { method: 'weighted_voting' },
      },
      {
        type: 'EXECUTE',
        description: 'Execute trade if approved by all gates',
        params: { agent: 'execution', condition: 'all_gates_passed' },
      },
    ];

    return {
      agentId: this.agentId,
      actions,
      confidence: 0.85,
      rationale: 'Multi-agent orchestrated trading decision',
    };
  }

  async execute(plan: ActionPlan, event: TradingEvent): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Step 1: Get market analysis
      logger.debug('[Supervisor] Requesting market analysis...');
      const marketPlan = await this.marketAgent.plan(event);
      const marketResult = await this.marketAgent.execute(marketPlan);
      const marketVerification = await this.marketAgent.verify(marketResult);

      if (!marketVerification.passed) {
        return {
          success: false,
          output: { veto: 'Market analysis failed verification' },
          duration: Date.now() - startTime,
        };
      }

      const marketAnalysis = marketResult.output.analysis as MarketAnalysis | undefined;

      // Step 2: Get risk assessment
      logger.debug('[Supervisor] Requesting risk assessment...');
      const riskPlan = await this.riskAgent.plan(event);
      const riskResult = await this.riskAgent.execute(riskPlan);
      const riskVerification = await this.riskAgent.verify(riskResult);

      const riskAssessment = riskResult.output.assessment as RiskAssessment | undefined;

      // Risk veto check
      if (this.config.riskVetoPower && riskAssessment && !riskAssessment.approved) {
        return {
          success: false,
          output: { veto: 'Risk management vetoed trade', riskAssessment },
          duration: Date.now() - startTime,
        };
      }

      // Step 3: Aggregate decisions
      const decisions: AgentDecision[] = this.aggregateDecisions(marketAnalysis, riskAssessment);
      const tradingDecision = this.resolveDecision(decisions, event);

      // Step 4: Execute if approved
      if (tradingDecision.action !== 'HOLD' && tradingDecision.action !== 'VETO') {
        logger.info(`[Supervisor] Executing ${tradingDecision.action} for ${event.symbol}`);

        const orderParams: OrderParams = {
          symbol: event.symbol,
          side: tradingDecision.action.toLowerCase() as 'buy' | 'sell',
          amount: tradingDecision.amount ?? 0,
          price: tradingDecision.price,
          type: tradingDecision.price ? 'limit' : 'market',
          tenantId: event.tenantId,
        };

        const executionEvent: TradingEvent = {
          ...event,
          type: 'SIGNAL',
          data: { order: orderParams },
        };

        const executionPlan = await this.executionAgent.plan(executionEvent);
        const executionResult = await this.executionAgent.execute(executionPlan);
        const executionVerification = await this.executionAgent.verify(executionResult);

        if (!executionVerification.passed) {
          return {
            success: false,
            output: { decision: tradingDecision, executionError: executionVerification.findings },
            duration: Date.now() - startTime,
          };
        }

        return {
          success: true,
          output: { decision: tradingDecision, execution: executionResult.output },
          duration: Date.now() - startTime,
        };
      }

      return {
        success: true,
        output: { decision: tradingDecision },
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
        findings: [result.error ?? 'Supervisor execution failed'],
        recommendations: ['Review agent coordination', 'Check veto conditions'],
      };
    }

    const decision = result.output.decision as TradingDecision | undefined;
    if (!decision) {
      return {
        passed: false,
        score: 0,
        findings: ['No trading decision produced'],
        recommendations: ['Review supervisor logic'],
      };
    }

    findings.push(`Decision: ${decision.action}`);
    findings.push(`Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    findings.push(`Reasoning: ${decision.reasoning}`);

    // Report agent decisions
    for (const agentDecision of decision.agentDecisions) {
      findings.push(`  ${agentDecision.agentId}: ${agentDecision.decision} (${(agentDecision.confidence * 100).toFixed(0)}%)`);
    }

    // Report conflicts
    if (decision.conflicts.length > 0) {
      findings.push(`${decision.conflicts.length} conflicts detected`);
      for (const conflict of decision.conflicts) {
        findings.push(`  ${conflict.agents.join(' vs ')}: ${conflict.disagreement}`);
      }
      recommendations.push('Review conflicting agent signals');
    }

    const passed = decision.action !== 'VETO' || decision.conflicts.length === 0;

    return {
      passed,
      score: decision.confidence,
      findings,
      recommendations,
    };
  }

  protected async publish(
    verification: VerificationResult,
    event?: TradingEvent,
    plan?: ActionPlan,
    result?: ExecutionResult
  ): Promise<void> {
    if (!event || !result?.success) return;

    const decision = result.output.decision as TradingDecision | undefined;
    if (!decision) return;

    // Publish escalation if conflicts detected
    if (decision.conflicts.length > 0 && this.config.autoEscalate) {
      const escalation: EscalationEvent = {
        type: AgentEventType.ESCALATION,
        tenantId: event.tenantId,
        timestamp: Date.now(),
        severity: decision.conflicts.some(c => c.disagreement.includes('VETO')) ? 'critical' : 'warning',
        reason: `Agent conflict: ${decision.conflicts.map(c => c.disagreement).join(', ')}`,
        suggestedAction: 'Manual review required',
        autoHalted: decision.action === 'VETO',
      };

      await this.eventBus.emit(escalation);
    }
  }

  /** Aggregate decisions from specialist agents */
  private aggregateDecisions(
    marketAnalysis?: MarketAnalysis,
    riskAssessment?: RiskAssessment
  ): AgentDecision[] {
    const decisions: AgentDecision[] = [];

    // Market agent decision
    if (marketAnalysis && marketAnalysis.signals.length > 0) {
      const primarySignal = marketAnalysis.signals[0];
      decisions.push({
        agentId: 'market-analysis',
        decision: primarySignal.type === 'HOLD' ? 'HOLD' : primarySignal.type,
        confidence: primarySignal.strength,
        reasoning: primarySignal.reason,
        data: { analysis: marketAnalysis },
      });
    } else {
      decisions.push({
        agentId: 'market-analysis',
        decision: 'HOLD',
        confidence: 0.5,
        reasoning: 'No clear market signal',
      });
    }

    // Risk agent decision
    if (riskAssessment) {
      decisions.push({
        agentId: 'risk-management',
        decision: riskAssessment.approved ? ('BUY' as const) : 'VETO',
        confidence: 1 - riskAssessment.riskScore,
        reasoning: riskAssessment.reason ?? 'Risk assessment complete',
        data: { assessment: riskAssessment },
      });
    }

    return decisions;
  }

  /** Resolve final decision from agent votes */
  private resolveDecision(decisions: AgentDecision[], event: TradingEvent): TradingDecision {
    const conflicts: TradingDecision['conflicts'] = [];

    // Check for veto
    const vetoDecision = decisions.find(d => d.decision === 'VETO');
    if (vetoDecision && this.config.riskVetoPower) {
      return {
        action: 'VETO',
        symbol: event.symbol,
        confidence: vetoDecision.confidence,
        reasoning: `Vetoed by ${vetoDecision.agentId}: ${vetoDecision.reasoning}`,
        agentDecisions: decisions,
        conflicts,
      };
    }

    // Check for unanimous approval requirement
    const buyDecisions = decisions.filter(d => d.decision === 'BUY');
    const sellDecisions = decisions.filter(d => d.decision === 'SELL');

    if (this.config.unanimousApproval) {
      if (buyDecisions.length > 0 && sellDecisions.length > 0) {
        conflicts.push({
          agents: ['market-analysis', 'risk-management'],
          disagreement: 'Buy and sell signals present - unanimous approval not met',
        });

        if (this.config.autoEscalate) {
          return {
            action: 'VETO',
            symbol: event.symbol,
            confidence: 0,
            reasoning: 'Conflicting signals - manual review required',
            agentDecisions: decisions,
            conflicts,
          };
        }
      }
    }

    // Weighted voting
    const buyScore = buyDecisions.reduce((sum, d) => sum + d.confidence, 0);
    const sellScore = sellDecisions.reduce((sum, d) => sum + d.confidence, 0);

    if (buyScore > sellScore && buyScore >= this.config.minConfidence) {
      return {
        action: 'BUY',
        symbol: event.symbol,
        confidence: buyScore / buyDecisions.length,
        reasoning: `Majority buy signal (confidence: ${(buyScore * 100).toFixed(1)}%)`,
        agentDecisions: decisions,
        conflicts,
      };
    }

    if (sellScore > buyScore && sellScore >= this.config.minConfidence) {
      return {
        action: 'SELL',
        symbol: event.symbol,
        confidence: sellScore / sellDecisions.length,
        reasoning: `Majority sell signal (confidence: ${(sellScore * 100).toFixed(1)}%)`,
        agentDecisions: decisions,
        conflicts,
      };
    }

    return {
      action: 'HOLD',
      symbol: event.symbol,
      confidence: Math.max(buyScore, sellScore),
      reasoning: 'No clear majority signal',
      agentDecisions: decisions,
      conflicts,
    };
  }
}
