/**
 * Multi-Agent Trading System — Index exports.
 * Centralized export point for all agent modules.
 */

// Base classes and types
export {
  BaseAgent,
  type TradingEvent,
  type ActionPlan,
  type ExecutionResult,
  type VerificationResult,
} from './base-agent';

// Communication protocol
export {
  AgentCommunicationManager,
  SharedStateManager,
  createAgentCommunication,
  MessageType,
  type AgentMessage,
  type SharedState,
} from './agent-communication';

// Specialist agents
export {
  MarketAnalysisAgent,
  type MarketAnalysis,
  type MarketAnalysisConfig,
} from './market-analysis-agent';

export {
  RiskManagementAgent,
  type RiskMetrics,
  type RiskConfig,
  type RiskAssessment,
} from './risk-management-agent';

export {
  ExecutionAgent,
  type OrderParams,
  type OrderResult,
  type ExecutionQuality,
  type ExecutionConfig,
} from './execution-agent';

// Orchestrator
export {
  TradingSupervisorAgent,
  type TradingDecision,
  type AgentDecision,
  type SupervisorConfig,
} from './trading-supervisor';
