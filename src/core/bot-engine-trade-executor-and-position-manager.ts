/**
 * BotTradeExecutor — handles trade execution, position state sync, and drawdown protection.
 * Extracted from BotEngine to keep BotEngine focused on signal routing and lifecycle.
 * Owns: executeTrade(), syncPositionState(), checkDrawdown().
 */

import { IExchange } from '../interfaces/IExchange';
import { RiskManager } from './RiskManager';
import { OrderManager } from './OrderManager';
import { logger } from '../utils/logger';
import {
  AgentEventBus,
  TradeAuditLogger,
  AutonomyController,
  AgentEventType,
} from '../a2ui';
import { BotConfig, BotPositionState } from './bot-engine-config-and-state-types';

export class BotTradeExecutor {
  private exchange: IExchange;
  private orderManager: OrderManager;
  private config: BotConfig;
  private baseCurrency: string;
  private quoteCurrency: string;
  private eventBus: AgentEventBus;
  private auditLogger: TradeAuditLogger;
  private autonomyController: AutonomyController;

  /** Shared mutable state — BotEngine reads openPosition/entryPrice from here */
  readonly state: BotPositionState;

  constructor(
    exchange: IExchange,
    orderManager: OrderManager,
    config: BotConfig,
    eventBus: AgentEventBus,
    auditLogger: TradeAuditLogger,
    autonomyController: AutonomyController,
  ) {
    this.exchange = exchange;
    this.orderManager = orderManager;
    this.config = config;
    const [base, quote] = config.symbol.split('/');
    this.baseCurrency = base;
    this.quoteCurrency = quote;
    this.eventBus = eventBus;
    this.auditLogger = auditLogger;
    this.autonomyController = autonomyController;
    this.state = { openPosition: false, peakBalance: 0, entryPrice: 0 };
  }

  /**
   * Syncs openPosition state with the actual exchange balance.
   */
  async syncPositionState(): Promise<void> {
    try {
      const balances = await this.exchange.fetchBalance();
      const ticker = await this.exchange.fetchTicker(this.config.symbol);
      const baseBalance = balances[this.baseCurrency]?.total || 0;

      const minValue = this.config.minPositionValueUsd ?? 10;
      const valueInQuote = baseBalance * ticker;
      this.state.openPosition = valueInQuote > minValue;

      if (this.state.openPosition) {
        this.state.entryPrice = ticker; // Approximate entry as current price on startup
      }

      logger.info(`[SYNC] Position: ${this.state.openPosition ? 'OPEN' : 'CLOSED'} (${baseBalance} ${this.baseCurrency} = $${valueInQuote.toFixed(2)}, threshold: $${minValue})`);
    } catch (error) {
      logger.error(`Failed to sync position state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Seeds the initial peak balance for drawdown tracking.
   * Call once after exchange connect when maxDrawdownPercent is configured.
   */
  async seedPeakBalance(): Promise<void> {
    const balances = await this.exchange.fetchBalance();
    this.state.peakBalance = balances[this.quoteCurrency]?.free || 0;
    logger.info(`Drawdown protection active: max ${this.config.maxDrawdownPercent}%, initial balance ${this.state.peakBalance}`);
  }

  /**
   * Checks if current balance has breached the max drawdown threshold.
   * Returns true if drawdown protection triggered (bot should stop).
   */
  async checkDrawdown(): Promise<boolean> {
    if (this.config.maxDrawdownPercent === undefined) return false;

    const balances = await this.exchange.fetchBalance();
    const currentBalance = balances[this.quoteCurrency]?.free || 0;

    if (currentBalance > this.state.peakBalance) {
      this.state.peakBalance = currentBalance;
    }

    if (this.state.peakBalance === 0) return false;

    const drawdown = ((this.state.peakBalance - currentBalance) / this.state.peakBalance) * 100;
    if (drawdown >= this.config.maxDrawdownPercent) {
      logger.warn(`[DRAWDOWN] ${drawdown.toFixed(2)}% drawdown hit (limit: ${this.config.maxDrawdownPercent}%). Stopping bot.`);
      this.eventBus.emit({
        type: AgentEventType.RISK_ALERT,
        tenantId: this.config.tenantId,
        timestamp: Date.now(),
        alertType: 'drawdown',
        value: drawdown,
        threshold: this.config.maxDrawdownPercent,
        message: `Drawdown ${drawdown.toFixed(2)}% exceeded limit ${this.config.maxDrawdownPercent}%`,
      });
      this.eventBus.emit({
        type: AgentEventType.ESCALATION,
        tenantId: this.config.tenantId,
        timestamp: Date.now(),
        severity: 'critical',
        reason: `Max drawdown breached: ${drawdown.toFixed(2)}%`,
        suggestedAction: 'Bot halted. Review positions and risk parameters.',
        autoHalted: true,
      });
      this.autonomyController.escalate(this.config.symbol, 'Drawdown limit breached');
      return true;
    }

    return false;
  }

  /**
   * Executes a market order for the given side and updates position state.
   */
  async executeTrade(side: 'buy' | 'sell', currentPrice: number, strategyName: string): Promise<void> {
    const isBuy = side === 'buy';
    const currency = isBuy ? this.quoteCurrency : this.baseCurrency;

    const balances = await this.exchange.fetchBalance();
    const balance = balances[currency]?.free || 0;

    if (balance === 0) {
      logger.warn(`Insufficient ${currency} balance for ${side}.`);
      return;
    }

    const amount = isBuy
      ? RiskManager.calculatePositionSize(balance, this.config.riskPercentage, currentPrice)
      : balance;

    if (amount <= 0 || !isFinite(amount)) {
      logger.warn(`Invalid position size: ${amount}. Skipping ${side}.`);
      return;
    }

    const feeRate = this.config.feeRate ?? 0.001;
    const estimatedFee = amount * currentPrice * feeRate;
    logger.info(`Executing ${side.toUpperCase()} ${amount} ${this.config.symbol} @ ~$${currentPrice} (est. fee: $${estimatedFee.toFixed(4)})`);

    try {
      const order = await this.exchange.createMarketOrder(this.config.symbol, side, amount);

      if (order.status === 'closed' || order.amount > 0) {
        this.orderManager.addOrder(order);
        this.state.openPosition = isBuy;

        const pnl = isBuy ? undefined : (order.price - this.state.entryPrice) * order.amount;
        this.eventBus.emit({
          type: AgentEventType.TRADE_EXECUTED,
          tenantId: this.config.tenantId,
          timestamp: Date.now(),
          orderId: order.id,
          side,
          symbol: this.config.symbol,
          amount: order.amount,
          price: order.price,
          fee: estimatedFee,
          pnl,
        });
        this.auditLogger.log(
          `TRADE_${side.toUpperCase()}`,
          `${side.toUpperCase()} ${order.amount} ${this.config.symbol} @ $${order.price}`,
          false,
          { orderId: order.id, pnl }
        );

        if (isBuy) {
          this.state.entryPrice = order.price || currentPrice;
        } else {
          const closePnl = (order.price - this.state.entryPrice) * order.amount;
          logger.info(`[P&L] Trade closed: ${closePnl >= 0 ? '+' : ''}$${closePnl.toFixed(2)} (entry: $${this.state.entryPrice}, exit: $${order.price})`);
          this.autonomyController.recordSuccess(strategyName);
          this.state.entryPrice = 0;
        }
      } else {
        logger.warn(`Order ${order.id} status: ${order.status} — position state NOT updated. Manual check required.`);
      }
    } catch (error) {
      logger.error(`${side} order FAILED: ${error instanceof Error ? error.message : String(error)}`);
      await this.syncPositionState();
    }
  }
}
