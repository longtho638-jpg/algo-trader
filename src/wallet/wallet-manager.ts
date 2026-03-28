/**
 * Multi-Wallet Manager
 * Tracks multiple Polygon wallets with strict fund isolation.
 * Own-capital and managed-capital wallets are NEVER commingled.
 * State is persisted to ~/.cashclaw/wallets.json to survive PM2 restarts.
 */

import { logger } from '../utils/logger';
import { writeJsonState, readJsonState, cashclawPath } from '../persistence/file-store';

export type WalletLabel = 'own-capital' | `managed-${string}`;

export interface Wallet {
  address: string;
  label: WalletLabel;
  capitalAllocation: number;
  currentBalance: number;
  isolatedPnl: number;
  createdAt: number;
  lastTradeAt?: number;
}

export interface WalletTrade {
  walletLabel: WalletLabel;
  marketId: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  price: number;
  pnl: number;
  timestamp: number;
}

export interface WalletSummary {
  totalWallets: number;
  totalCapital: number;
  totalPnl: number;
  ownCapital: { balance: number; pnl: number } | null;
  managedWallets: { label: string; balance: number; pnl: number }[];
}

/** Persisted shape stored to disk */
interface WalletPersistedState {
  wallets: Wallet[];
  tradeHistory: Record<string, WalletTrade[]>;
}

export class WalletManager {
  private wallets: Map<WalletLabel, Wallet> = new Map();
  private tradeHistory: Map<WalletLabel, WalletTrade[]> = new Map();
  private readonly statePath: string;

  constructor(statePath?: string) {
    this.statePath = statePath ?? cashclawPath('wallets.json');
    this.loadState();
  }

  /** Register a wallet */
  registerWallet(address: string, label: WalletLabel, capitalAllocation: number): Wallet {
    if (this.wallets.has(label)) {
      throw new Error(`Wallet already registered: ${label}`);
    }

    const wallet: Wallet = {
      address, label, capitalAllocation,
      currentBalance: capitalAllocation,
      isolatedPnl: 0, createdAt: Date.now(),
    };

    this.wallets.set(label, wallet);
    this.tradeHistory.set(label, []);
    this.saveState();
    logger.info(`[WalletManager] Registered ${label} (${address}) with $${capitalAllocation}`);
    return wallet;
  }

  /** Get a wallet by label */
  getWallet(label: WalletLabel): Wallet | undefined {
    return this.wallets.get(label);
  }

  /** Get allocated capital for a wallet (for Kelly sizing) */
  getAllocatedCapital(label: WalletLabel): number {
    const wallet = this.wallets.get(label);
    return wallet?.currentBalance ?? 0;
  }

  /** Record a trade against a specific wallet — enforces isolation.
   * @param trade - The trade to record (trade.walletLabel = intended destination)
   * @param executingWalletLabel - The wallet actually executing this trade (must match trade.walletLabel)
   */
  recordTrade(trade: WalletTrade, executingWalletLabel: WalletLabel): void {
    // Enforce fund isolation: executing wallet must match the trade's destination label
    this.enforceIsolation(executingWalletLabel, trade);

    const wallet = this.wallets.get(trade.walletLabel);
    if (!wallet) {
      throw new Error(`Wallet not found: ${trade.walletLabel}`);
    }

    wallet.currentBalance += trade.pnl;
    wallet.isolatedPnl += trade.pnl;
    wallet.lastTradeAt = trade.timestamp;

    const history = this.tradeHistory.get(trade.walletLabel) || [];
    history.push(trade);
    this.tradeHistory.set(trade.walletLabel, history);

    this.saveState();
    logger.info(`[WalletManager] Trade on ${trade.walletLabel}: ${trade.side} $${trade.sizeUsd} → PnL $${trade.pnl.toFixed(2)}`);
  }

  /** Validate a trade is going to the correct wallet type */
  validateTradeWallet(walletLabel: WalletLabel, isOwnCapitalTrade: boolean): boolean {
    if (isOwnCapitalTrade && walletLabel !== 'own-capital') return false;
    if (!isOwnCapitalTrade && walletLabel === 'own-capital') return false;
    return this.wallets.has(walletLabel);
  }

  /** Get trade history for a wallet */
  getTradeHistory(label: WalletLabel): WalletTrade[] {
    return [...(this.tradeHistory.get(label) || [])];
  }

  /** Get all registered wallets */
  getAllWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }

  /** Get summary across all wallets */
  getSummary(): WalletSummary {
    const wallets = this.getAllWallets();
    const ownWallet = this.wallets.get('own-capital');

    return {
      totalWallets: wallets.length,
      totalCapital: wallets.reduce((sum, w) => sum + w.currentBalance, 0),
      totalPnl: wallets.reduce((sum, w) => sum + w.isolatedPnl, 0),
      ownCapital: ownWallet ? { balance: ownWallet.currentBalance, pnl: ownWallet.isolatedPnl } : null,
      managedWallets: wallets
        .filter(w => w.label !== 'own-capital')
        .map(w => ({ label: w.label, balance: w.currentBalance, pnl: w.isolatedPnl })),
    };
  }

  /** Enforce fund isolation: executing wallet must match trade's intended wallet label */
  private enforceIsolation(executingWalletLabel: WalletLabel, trade: WalletTrade): void {
    if (executingWalletLabel !== trade.walletLabel) {
      throw new Error(
        `Fund isolation violation: executing wallet "${executingWalletLabel}" != trade destination "${trade.walletLabel}"`
      );
    }
  }

  private saveState(): void {
    const state: WalletPersistedState = {
      wallets: Array.from(this.wallets.values()),
      tradeHistory: Object.fromEntries(
        Array.from(this.tradeHistory.entries()).map(([k, v]) => [k, v])
      ),
    };
    writeJsonState(this.statePath, state);
  }

  private loadState(): void {
    const state = readJsonState<WalletPersistedState>(this.statePath);
    if (!state) return;
    for (const wallet of state.wallets) {
      this.wallets.set(wallet.label, wallet);
      this.tradeHistory.set(wallet.label, state.tradeHistory[wallet.label] ?? []);
    }
    logger.info(`[WalletManager] Restored ${state.wallets.length} wallets from ${this.statePath}`);
  }
}
