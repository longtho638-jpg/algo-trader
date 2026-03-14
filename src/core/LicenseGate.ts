// src/core/LicenseGate.ts
// Thin wrapper for MM-specific license enforcement
// Tiers: FREE (1 market, 5 trades/day) | PRO (10, unlimited) | ENTERPRISE (999, unlimited)

import { LicenseService, LicenseTier } from '../lib/raas-gate';

interface TierConfig {
  maxMarkets: number;
  maxTradesPerDay: number;       // -1 = unlimited
  canWsRequote: boolean;
  canMicroPrice: boolean;
  canMerge: boolean;
  canRecover: boolean;
  canScore: boolean;
}

const TIER_CONFIG: Record<LicenseTier, TierConfig> = {
  [LicenseTier.FREE]: {
    maxMarkets: 1,
    maxTradesPerDay: 5,
    canWsRequote: false,
    canMicroPrice: false,
    canMerge: false,
    canRecover: false,
    canScore: false,
  },
  [LicenseTier.PRO]: {
    maxMarkets: 10,
    maxTradesPerDay: -1,
    canWsRequote: true,
    canMicroPrice: true,
    canMerge: true,
    canRecover: true,
    canScore: true,
  },
  [LicenseTier.ENTERPRISE]: {
    maxMarkets: 999,
    maxTradesPerDay: -1,
    canWsRequote: true,
    canMicroPrice: true,
    canMerge: true,
    canRecover: true,
    canScore: true,
  },
};

export class LicenseGate {
  private service: LicenseService;
  readonly tier: LicenseTier;
  private config: TierConfig;

  // Daily trade tracking
  private tradeCount = 0;
  private tradeDate = '';       // YYYY-MM-DD

  constructor() {
    this.service = LicenseService.getInstance();
    this.service.validateSync();
    this.tier = this.service.getTier();
    this.config = TIER_CONFIG[this.tier];

    console.log(`[License] Tier: ${this.tier.toUpperCase()}`);
    if (this.isFree()) {
      console.log(
        `[License] FREE limits: ${this.config.maxMarkets} market, ${this.config.maxTradesPerDay} trades/day. Upgrade: https://cashclaw.agencyos.network/upgrade`
      );
    }
  }

  // ─── Tier shortcuts ────────────────────────────────────────────────────────

  isFree(): boolean { return this.tier === LicenseTier.FREE; }
  isPro(): boolean { return this.tier === LicenseTier.PRO; }
  isEnterprise(): boolean { return this.tier === LicenseTier.ENTERPRISE; }

  // ─── Feature flags ─────────────────────────────────────────────────────────

  get maxMarkets(): number { return this.config.maxMarkets; }
  get canWsRequote(): boolean { return this.config.canWsRequote; }
  get canMicroPrice(): boolean { return this.config.canMicroPrice; }
  get canMerge(): boolean { return this.config.canMerge; }
  get canRecover(): boolean { return this.config.canRecover; }
  get canScore(): boolean { return this.config.canScore; }

  // ─── Daily trade gate ──────────────────────────────────────────────────────

  get tradesRemaining(): number {
    if (this.config.maxTradesPerDay === -1) return Infinity;
    this.maybeResetDaily();
    return Math.max(0, this.config.maxTradesPerDay - this.tradeCount);
  }

  canTrade(): boolean {
    if (this.config.maxTradesPerDay === -1) return true;
    this.maybeResetDaily();
    return this.tradeCount < this.config.maxTradesPerDay;
  }

  recordTrade(): void {
    this.maybeResetDaily();
    this.tradeCount++;
    if (this.config.maxTradesPerDay !== -1 && this.tradeCount >= this.config.maxTradesPerDay) {
      console.warn(
        `[License] FREE daily trade limit reached (${this.config.maxTradesPerDay}). Upgrade to PRO for unlimited: https://cashclaw.agencyos.network/upgrade`
      );
    }
  }

  private maybeResetDaily(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.tradeDate !== today) {
      this.tradeDate = today;
      this.tradeCount = 0;
    }
  }
}
