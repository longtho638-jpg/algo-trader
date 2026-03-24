// Temperature Scaler — Platt scaling for calibrated probabilities
// calibrated = sigmoid(a * logit(raw) + b)
// Default: a=1, b=0 (identity). Auto-fit from resolved trades when N >= 20.
// BINH_PHAP v2.0: Research shows ~0.08 Brier improvement from temperature scaling

import { logger } from '../core/logger.js';

export interface ScalerParams {
  /** Logit scale factor (default: 1.0 = identity) */
  a: number;
  /** Logit bias (default: 0.0 = no shift) */
  b: number;
  /** Number of resolved samples used to fit (0 = unfitted) */
  fittedOn: number;
}

const DEFAULT_PARAMS: ScalerParams = { a: 1.0, b: 0.0, fittedOn: 0 };

// Math helpers
function logit(p: number): number {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export class TemperatureScaler {
  private params: ScalerParams;

  constructor(params?: Partial<ScalerParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  /** Apply Platt scaling: sigmoid(a * logit(raw) + b) */
  scale(rawProb: number): number {
    const scaled = sigmoid(this.params.a * logit(rawProb) + this.params.b);
    return Math.max(0.01, Math.min(0.99, scaled));
  }

  /** Check if scaler has been fitted on data */
  isFitted(): boolean {
    return this.params.fittedOn > 0;
  }

  getParams(): ScalerParams {
    return { ...this.params };
  }

  /**
   * Fit params from resolved trades using gradient descent on log-loss.
   * predictions: raw LLM probabilities (0-1)
   * outcomes: actual results (0 or 1)
   * Minimum 20 samples required.
   */
  fit(predictions: number[], outcomes: number[]): boolean {
    if (predictions.length < 20 || predictions.length !== outcomes.length) {
      logger.debug('Not enough data to fit scaler', 'TemperatureScaler', {
        samples: predictions.length,
        required: 20,
      });
      return false;
    }

    // Simple grid search + gradient refinement for a, b
    // Grid: a in [0.5, 2.0], b in [-1.0, 1.0]
    let bestA = 1.0;
    let bestB = 0.0;
    let bestLoss = Infinity;

    for (let a = 0.5; a <= 2.0; a += 0.1) {
      for (let b = -1.0; b <= 1.0; b += 0.1) {
        const loss = this.computeLogLoss(predictions, outcomes, a, b);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestA = a;
          bestB = b;
        }
      }
    }

    // Fine-tune with smaller steps around best
    for (let a = bestA - 0.1; a <= bestA + 0.1; a += 0.01) {
      for (let b = bestB - 0.1; b <= bestB + 0.1; b += 0.01) {
        const loss = this.computeLogLoss(predictions, outcomes, a, b);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestA = a;
          bestB = b;
        }
      }
    }

    this.params = {
      a: Math.round(bestA * 100) / 100,
      b: Math.round(bestB * 100) / 100,
      fittedOn: predictions.length,
    };

    logger.info('Temperature scaler fitted', 'TemperatureScaler', {
      a: this.params.a,
      b: this.params.b,
      samples: predictions.length,
      logLoss: bestLoss.toFixed(4),
    });

    return true;
  }

  private computeLogLoss(preds: number[], outcomes: number[], a: number, b: number): number {
    let totalLoss = 0;
    for (let i = 0; i < preds.length; i++) {
      const calibrated = sigmoid(a * logit(preds[i]) + b);
      const clamped = Math.max(0.001, Math.min(0.999, calibrated));
      const y = outcomes[i];
      totalLoss += -(y * Math.log(clamped) + (1 - y) * Math.log(1 - clamped));
    }
    return totalLoss / preds.length;
  }
}
