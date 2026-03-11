/**
 * Execution Agent — Order placement and trade management.
 * Handles order routing, fill tracking, and execution quality.
 */

import { BaseAgent, TradingEvent, ActionPlan, ExecutionResult, VerificationResult } from './base-agent';
import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AutonomyLevel, AgentEventType, TradeExecutedEvent } from '../a2ui/types';
import { logger } from '../utils/logger';
import { ExchangeClientBase } from '@agencyos/trading-core/exchanges';

/** Order parameters */
export interface OrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number; // Optional for market orders
  type: 'market' | 'limit';
  tenantId: string;
}

/** Order result */
export interface OrderResult {
  orderId: string;
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledAmount: number;
  filledPrice: number;
  fee: number;
  slippage: number;
  timestamp: number;
}

/** Execution quality metrics */
export interface ExecutionQuality {
  averageSlippage: number;
  fillRate: number;
  averageFee: number;
  executionTime: number;
}

/** Execution configuration */
export interface ExecutionConfig {
  /** Default order type */
  defaultOrderType: 'market' | 'limit';
  /** Maximum slippage tolerance (percentage) */
  maxSlippagePercent: number;
  /** Enable smart order routing */
  smartRouting: boolean;
  /** Auto-retry failed orders */
  autoRetry: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  defaultOrderType: 'market',
  maxSlippagePercent: 0.5,
  smartRouting: true,
  autoRetry: true,
  maxRetries: 3,
};

export class ExecutionAgent extends BaseAgent {
  private exchange: ExchangeClientBase;
  private config: ExecutionConfig;
  private pendingOrders = new Map<string, OrderParams>();
  private completedOrders = new Map<string, OrderResult>();

  constructor(exchange: ExchangeClientBase, eventBus: AgentEventBus, config?: Partial<ExecutionConfig>) {
    super('execution-agent', eventBus, AutonomyLevel.AUTONOMOUS);
    this.exchange = exchange;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async plan(tradingEvent: TradingEvent): Promise<ActionPlan> {
    logger.debug(`[Execution] Planning order execution for ${tradingEvent.symbol}`);

    const orderParams = tradingEvent.data.order as OrderParams | undefined;
    if (!orderParams) {
      throw new Error('No order parameters in trading event');
    }

    const actions: ActionPlan['actions'] = [
      {
        type: 'EXECUTE',
        description: `Place ${orderParams.type} ${orderParams.side} order for ${orderParams.amount} ${orderParams.symbol}`,
        params: { ...orderParams } as unknown as Record<string, unknown>,
      },
      {
        type: 'MONITOR',
        description: 'Track order fill status',
        params: { checkInterval: 100 },
      },
      {
        type: 'EXECUTE',
        description: 'Record execution quality metrics',
        params: { metrics: ['slippage', 'fill_rate', 'fee'] },
      },
    ];

    return {
      agentId: this.agentId,
      actions,
      confidence: 0.9,
      rationale: `Execute ${orderParams.side.toUpperCase()} order for ${orderParams.symbol}`,
    };
  }

  async execute(plan: ActionPlan, tradingEvent?: TradingEvent): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const orderAction = plan.actions.find(a => a.type === 'EXECUTE' && 'symbol' in a.params);
      if (!orderAction) {
        return {
          success: false,
          output: {},
          error: 'No order execution action found',
          duration: Date.now() - startTime,
        };
      }

      if (!tradingEvent) {
        return {
          success: false,
          output: {},
          error: 'Trading event required for execution',
          duration: Date.now() - startTime,
        };
      }

      const params: OrderParams = {
        symbol: String(orderAction.params.symbol),
        side: orderAction.params.side as 'buy' | 'sell',
        amount: Number(orderAction.params.amount),
        type: orderAction.params.type as 'market' | 'limit',
        tenantId: tradingEvent.tenantId,
        price: orderAction.params.price as number | undefined,
      };

      // Store pending order
      const tempOrderId = this.generateOrderId(params);
      this.pendingOrders.set(tempOrderId, params);

      logger.info(`[Execution] Placing ${params.type} ${params.side.toUpperCase()} order: ${params.amount} ${params.symbol}`);

      // Execute order via exchange
      const orderResult = await this.placeOrder(params);

      // Store completed order
      this.completedOrders.set(orderResult.orderId, orderResult);
      this.pendingOrders.delete(tempOrderId);

      // Calculate execution quality
      const quality = this.calculateExecutionQuality(orderResult, startTime);

      return {
        success: orderResult.status === 'filled' || orderResult.status === 'partial',
        output: { order: orderResult, quality },
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
        findings: [result.error ?? 'Order execution failed'],
        recommendations: ['Check exchange connectivity', 'Verify order parameters', 'Review balance/limits'],
      };
    }

    const order = result.output.order as OrderResult | undefined;
    const quality = result.output.quality as ExecutionQuality | undefined;

    if (!order) {
      return {
        passed: false,
        score: 0,
        findings: ['No order result produced'],
        recommendations: ['Review execution pipeline'],
      };
    }

    // Verify order status
    if (order.status === 'rejected') {
      return {
        passed: false,
        score: 0,
        findings: ['Order rejected by exchange'],
        recommendations: ['Check account balance', 'Verify symbol is tradable'],
      };
    }

    findings.push(`Order ${order.orderId}: ${order.status.toUpperCase()}`);
    findings.push(`Filled: ${order.filledAmount} @ $${order.filledPrice.toFixed(2)}`);
    findings.push(`Fee: $${order.fee.toFixed(2)}, Slippage: ${(order.slippage * 100).toFixed(2)}%`);

    // Check slippage tolerance
    if (order.slippage > this.config.maxSlippagePercent / 100) {
      recommendations.push(`Slippage exceeded tolerance: ${(order.slippage * 100).toFixed(2)}% > ${this.config.maxSlippagePercent}%`);
    }

    // Check fill quality
    if (quality) {
      findings.push(`Execution time: ${quality.executionTime}ms`);
      findings.push(`Fill rate: ${(quality.fillRate * 100).toFixed(1)}%`);
    }

    const passed = order.status !== 'cancelled' && order.slippage <= this.config.maxSlippagePercent / 100;

    return {
      passed,
      score: passed ? (quality?.fillRate ?? 0.5) : 0,
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

    const order = result.output.order as OrderResult | undefined;
    if (!order) return;

    const tradeEvent: TradeExecutedEvent = {
      type: AgentEventType.TRADE_EXECUTED,
      tenantId: tradingEvent.tenantId,
      timestamp: Date.now(),
      orderId: order.orderId,
      side: plan?.actions[0]?.params.side as 'buy' | 'sell' ?? 'buy',
      symbol: tradingEvent.symbol,
      amount: order.filledAmount,
      price: order.filledPrice,
      fee: order.fee,
      pnl: undefined,
    };

    await this.eventBus.emit(tradeEvent);
  }

  /** Place order via exchange */
  private async placeOrder(params: OrderParams): Promise<OrderResult> {
    try {
      const startTime = Date.now();

      if (params.type !== 'market') {
        // Limit orders not supported by ExchangeClientBase - fallback to market
        logger.warn(`[Execution] Limit orders not supported, falling back to market order for ${params.symbol}`);
      }

      // ExchangeClientBase only supports createMarketOrder
      const order = await this.exchange.createMarketOrder(params.symbol, params.side, params.amount);

      // Convert ExchangeClient order to OrderResult
      const result: OrderResult = {
        orderId: order.id,
        status: order.status === 'closed' ? 'filled' : order.status === 'open' ? 'pending' : 'cancelled',
        filledAmount: order.amount,
        filledPrice: order.price,
        fee: 0, // Fee would come from exchange response
        slippage: 0, // Calculate based on expected vs actual price
        timestamp: order.timestamp || startTime,
      };

      return result;
    } catch (error) {
      // Auto-retry if enabled
      if (this.config.autoRetry) {
        logger.warn(`[Execution] Order failed, retrying... ${error instanceof Error ? error.message : String(error)}`);
        // Simple retry logic - in production, implement exponential backoff
        for (let i = 0; i < this.config.maxRetries; i++) {
          try {
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
            return await this.placeOrder(params);
          } catch {
            // Continue to next retry
          }
        }
      }
      throw error;
    }
  }

  /** Calculate execution quality metrics */
  private calculateExecutionQuality(order: OrderResult, startTime: number): ExecutionQuality {
    return {
      averageSlippage: order.slippage,
      fillRate: order.filledAmount / (order.filledAmount || 1),
      averageFee: order.fee,
      executionTime: Date.now() - startTime,
    };
  }

  private generateOrderId(params: OrderParams): string {
    return `ord_${params.symbol}_${params.side}_${Date.now()}`;
  }

  /** Get pending orders */
  getPendingOrders(): OrderParams[] {
    return Array.from(this.pendingOrders.values());
  }

  /** Get completed orders */
  getCompletedOrders(): OrderResult[] {
    return Array.from(this.completedOrders.values());
  }

  /** Clear order history */
  clearHistory(): void {
    this.pendingOrders.clear();
    this.completedOrders.clear();
  }
}
