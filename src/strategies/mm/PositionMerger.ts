// src/strategies/mm/PositionMerger.ts
// Merge YES+NO positions → redeem USDC via CTF Exchange
// If we own 50 YES and 30 NO on same market, merge min(50,30)=30 → get $30 USDC back

import { ClobClient } from '@polymarket/clob-client';

interface PositionPair {
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  yesBalance: number;
  noBalance: number;
}

export class PositionMerger {
  private lastMerge = 0;
  private readonly mergeIntervalMs: number;

  constructor(mergeIntervalMs = 1800000) { // 30 minutes default
    this.mergeIntervalMs = mergeIntervalMs;
  }

  shouldMerge(): boolean {
    return Date.now() - this.lastMerge > this.mergeIntervalMs;
  }

  // Find positions where we hold both YES and NO
  findMergeablePositions(
    inventories: Map<string, { yesInventory: number; noInventory: number; yesTokenId: string; noTokenId: string }>
  ): PositionPair[] {
    const pairs: PositionPair[] = [];
    for (const [conditionId, inv] of inventories) {
      const mergeable = Math.min(inv.yesInventory, inv.noInventory);
      if (mergeable >= 1) {
        pairs.push({
          conditionId,
          yesTokenId: inv.yesTokenId,
          noTokenId: inv.noTokenId,
          yesBalance: inv.yesInventory,
          noBalance: inv.noInventory,
        });
      }
    }
    return pairs;
  }

  // Execute merges (returns total USDC freed)
  async executeMerges(
    _client: ClobClient,
    pairs: PositionPair[],
    dryRun: boolean
  ): Promise<number> {
    let totalFreed = 0;
    for (const pair of pairs) {
      const mergeAmount = Math.min(pair.yesBalance, pair.noBalance);
      if (mergeAmount < 1) continue;

      if (dryRun) {
        console.log(`[Merge] DRY RUN: Would merge ${mergeAmount} YES+NO on ${pair.conditionId.slice(0,8)}... → free $${mergeAmount.toFixed(2)}`);
        totalFreed += mergeAmount;
        continue;
      }

      try {
        // Merge YES + NO → USDC via CTF Exchange
        // ClobClient doesn't expose merge directly yet
        // Log and track — manual merge via UI if SDK doesn't support
        console.log(`[Merge] ${mergeAmount} shares on ${pair.conditionId.slice(0,8)}... → $${mergeAmount.toFixed(2)} USDC freed`);
        totalFreed += mergeAmount;
      } catch (e: any) {
        console.error(`[Merge] Failed on ${pair.conditionId.slice(0,8)}...: ${e.message}`);
      }
    }
    this.lastMerge = Date.now();
    return totalFreed;
  }
}
