// Calibration Auto-Tuner — computes calibration curve from resolved trades
// and auto-adjusts TemperatureScaler params
// BINH_PHAP Section 7.1: Prompt tuning based on monitoring data

import { TemperatureScaler, type ScalerParams } from './temperature-scaler.js';
import { logger } from '../core/logger.js';

export interface CalibrationBucket {
  range: string;
  predicted: number;
  actual: number;
  count: number;
  gap: number;
}

export interface CalibrationReport {
  buckets: CalibrationBucket[];
  overallGap: number;
  brierScore: number;
  bias: 'overconfident' | 'underconfident' | 'calibrated';
  scalerParams: ScalerParams;
  recommendation: string;
}

interface ResolvedTrade {
  ourProb: number;
  outcome: 0 | 1; // 0 = NO, 1 = YES
}

const BUCKET_RANGES = [
  { label: '0-20%', min: 0, max: 0.2 },
  { label: '20-40%', min: 0.2, max: 0.4 },
  { label: '40-60%', min: 0.4, max: 0.6 },
  { label: '60-80%', min: 0.6, max: 0.8 },
  { label: '80-100%', min: 0.8, max: 1.0 },
];

export class CalibrationTuner {
  private scaler: TemperatureScaler;

  constructor(scaler?: TemperatureScaler) {
    this.scaler = scaler ?? new TemperatureScaler();
  }

  getScaler(): TemperatureScaler {
    return this.scaler;
  }

  /**
   * Analyze resolved trades and produce calibration report.
   * If enough data, auto-fit the temperature scaler.
   */
  analyze(trades: ResolvedTrade[]): CalibrationReport {
    // Compute calibration buckets
    const buckets = BUCKET_RANGES.map(range => {
      const inBucket = trades.filter(t => t.ourProb >= range.min && t.ourProb < range.max);
      const predicted = inBucket.length > 0
        ? inBucket.reduce((s, t) => s + t.ourProb, 0) / inBucket.length
        : (range.min + range.max) / 2;
      const actual = inBucket.length > 0
        ? inBucket.reduce((s, t) => s + t.outcome, 0) / inBucket.length
        : 0;
      return {
        range: range.label,
        predicted: Math.round(predicted * 1000) / 1000,
        actual: Math.round(actual * 1000) / 1000,
        count: inBucket.length,
        gap: Math.round(Math.abs(predicted - actual) * 1000) / 1000,
      };
    });

    // Overall metrics
    const brierScore = trades.reduce((s, t) => s + (t.ourProb - t.outcome) ** 2, 0) / trades.length;
    const avgPredicted = trades.reduce((s, t) => s + t.ourProb, 0) / trades.length;
    const avgActual = trades.reduce((s, t) => s + t.outcome, 0) / trades.length;
    const overallGap = Math.abs(avgPredicted - avgActual);

    // Determine bias
    const bias: CalibrationReport['bias'] =
      avgPredicted > avgActual + 0.05 ? 'overconfident' :
      avgPredicted < avgActual - 0.05 ? 'underconfident' :
      'calibrated';

    // Auto-fit temperature scaler if enough data
    const predictions = trades.map(t => t.ourProb);
    const outcomes = trades.map(t => t.outcome);
    this.scaler.fit(predictions, outcomes);

    // Recommendation
    let recommendation: string;
    if (bias === 'overconfident') {
      recommendation = 'Model is overconfident. Temperature scaler will shrink estimates toward 50%. Consider reducing kellyFraction to 0.125.';
    } else if (bias === 'underconfident') {
      recommendation = 'Model is underconfident. Temperature scaler will expand estimates. Consider increasing kellyFraction toward 0.5.';
    } else {
      recommendation = 'Model is well-calibrated. Continue with current settings.';
    }

    const report: CalibrationReport = {
      buckets,
      overallGap: Math.round(overallGap * 1000) / 1000,
      brierScore: Math.round(brierScore * 1000) / 1000,
      bias,
      scalerParams: this.scaler.getParams(),
      recommendation,
    };

    logger.info('Calibration analysis complete', 'CalibrationTuner', {
      trades: trades.length,
      brierScore: report.brierScore,
      bias,
      scalerA: report.scalerParams.a,
      scalerB: report.scalerParams.b,
    });

    return report;
  }

  /**
   * Load resolved trades from SQLite and run analysis.
   */
  async analyzeFromDb(dbPath: string): Promise<CalibrationReport | null> {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);

      const rows = db.prepare(
        `SELECT ourProb, outcome FROM paper_trades_v3 WHERE resolved = 1 AND direction != 'SKIP'`
      ).all() as Array<{ ourProb: number; outcome: string }>;

      db.close();

      if (rows.length < 10) {
        logger.debug('Not enough resolved trades for calibration', 'CalibrationTuner', { count: rows.length });
        return null;
      }

      const trades: ResolvedTrade[] = rows.map(r => ({
        ourProb: r.ourProb,
        outcome: (r.outcome === 'YES' ? 1 : 0) as 0 | 1,
      }));

      return this.analyze(trades);
    } catch (err) {
      logger.error('Failed to load trades for calibration', 'CalibrationTuner', { err: String(err) });
      return null;
    }
  }
}
