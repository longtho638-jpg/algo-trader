/**
 * Sliding window error rate monitor - tracks errors per category over time
 * Default window: 5 minutes. Alert threshold: >10 errors/min per category.
 */

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_THRESHOLD_PER_MIN = 10;

interface ErrorEntry {
  timestamp: number;
  message: string;
}

export class ErrorRateMonitor {
  private readonly windowMs: number;
  /** category → list of error timestamps within current window */
  private readonly buckets: Map<string, ErrorEntry[]>;

  constructor(windowMs: number = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  /** Record an error for the given category */
  recordError(category: string, error: Error | string): void {
    const message = typeof error === 'string' ? error : error.message;
    const now = Date.now();

    if (!this.buckets.has(category)) {
      this.buckets.set(category, []);
    }

    const bucket = this.buckets.get(category)!;
    bucket.push({ timestamp: now, message });

    // Evict entries outside the window immediately to bound memory
    this.evict(category, now);
  }

  /** Returns errors per minute for the given category */
  getErrorRate(category: string): number {
    const now = Date.now();
    this.evict(category, now);

    const bucket = this.buckets.get(category);
    if (!bucket || bucket.length === 0) return 0;

    const windowMinutes = this.windowMs / 60_000;
    return bucket.length / windowMinutes;
  }

  /** Returns errors per minute for all tracked categories */
  getAllRates(): Record<string, number> {
    const rates: Record<string, number> = {};
    for (const category of this.buckets.keys()) {
      rates[category] = this.getErrorRate(category);
    }
    return rates;
  }

  /** Returns true if ALL categories are below alert threshold */
  isHealthy(): boolean {
    for (const category of this.buckets.keys()) {
      if (this.getErrorRate(category) > ALERT_THRESHOLD_PER_MIN) {
        return false;
      }
    }
    return true;
  }

  // Remove entries older than the sliding window
  private evict(category: string, now: number): void {
    const bucket = this.buckets.get(category);
    if (!bucket) return;

    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < bucket.length && bucket[i].timestamp < cutoff) i++;
    if (i > 0) bucket.splice(0, i);
  }
}
