import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredLogger, type LogLevel } from '../../src/monitoring/structured-logger.js';
import { UptimeTracker } from '../../src/monitoring/uptime-tracker.js';
import { ErrorRateMonitor } from '../../src/monitoring/error-rate-monitor.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let outputs: string[] = [];

  beforeEach(() => {
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') {
        outputs.push(chunk);
      }
      return true;
    });
    logger = new StructuredLogger({ service: 'test' }, 'info');
  });

  it('should output JSON format for info log', () => {
    logger.info('Test message', { userId: '123' });
    expect(outputs.length).toBeGreaterThan(0);
    const line = outputs[0].trim();
    const parsed = JSON.parse(line);
    expect(parsed.message).toBe('Test message');
    expect(parsed.level).toBe('info');
    expect(parsed.timestamp).toBeTruthy();
  });

  it('should include context in all logs', () => {
    logger.info('Test', { extra: 'data' });
    const parsed = JSON.parse(outputs[0].trim());
    expect(parsed.context.service).toBe('test');
    expect(parsed.context.extra).toBe('data');
  });

  it('should output debug logs when level=debug', () => {
    const debugLogger = new StructuredLogger({}, 'debug');
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    debugLogger.debug('Debug msg');
    expect(outputs.length).toBeGreaterThan(0);
  });

  it('should skip debug logs when level=info', () => {
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    logger.debug('Debug msg');
    expect(outputs.length).toBe(0);
  });

  it('should output warn logs', () => {
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    logger.warn('Warning message');
    const parsed = JSON.parse(outputs[0].trim());
    expect(parsed.level).toBe('warn');
  });

  it('should output error logs', () => {
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    logger.error('Error message');
    const parsed = JSON.parse(outputs[0].trim());
    expect(parsed.level).toBe('error');
  });

  it('should create child logger with bound context', () => {
    const child = logger.child({ userId: 'user-456' });
    expect(child).toBeTruthy();
  });

  it('should merge parent and child context', () => {
    const child = logger.child({ userId: 'user-456' });
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    child.info('Child log');
    const parsed = JSON.parse(outputs[0].trim());
    expect(parsed.context.service).toBe('test');
    expect(parsed.context.userId).toBe('user-456');
  });

  it('should not include empty context', () => {
    const emptyLogger = new StructuredLogger();
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });

    emptyLogger.info('Test');
    if (outputs.length > 0) {
      const parsed = JSON.parse(outputs[0].trim());
      expect(parsed.context).toBeUndefined();
    }
  });

  it('should have ISO timestamp', () => {
    vi.spyOn(process.stdout, 'write').mockClear();
    outputs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array | null) => {
      if (typeof chunk === 'string') outputs.push(chunk);
      return true;
    });
    logger.info('Test');
    if (outputs.length > 0) {
      const parsed = JSON.parse(outputs[0].trim());
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('UptimeTracker', () => {
  let tracker: UptimeTracker;

  beforeEach(() => {
    tracker = new UptimeTracker();
  });

  it('should initialize with current start time', () => {
    const snapshot = tracker.getUptime();
    expect(snapshot.startedAt).toBeTruthy();
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should return uptime in seconds', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const tracker1 = new UptimeTracker();
    vi.advanceTimersByTime(5000); // Advance 5 seconds

    const snapshot = tracker1.getUptime();
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(5);

    vi.useRealTimers();
  });

  it('should track component health status', () => {
    tracker.setComponentStatus('engine', 'healthy');
    const snapshot = tracker.getUptime();
    expect(snapshot.components.engine.status).toBe('healthy');
  });

  it('should track degraded status', () => {
    tracker.setComponentStatus('api', 'degraded', 'Response time high');
    const snapshot = tracker.getUptime();
    expect(snapshot.components.api.status).toBe('degraded');
    expect(snapshot.components.api.detail).toBe('Response time high');
  });

  it('should track down status', () => {
    tracker.setComponentStatus('database', 'down');
    const snapshot = tracker.getUptime();
    expect(snapshot.components.database.status).toBe('down');
  });

  it('should track multiple components', () => {
    tracker.setComponentStatus('engine', 'healthy');
    tracker.setComponentStatus('api', 'healthy');
    tracker.setComponentStatus('ws', 'degraded');
    const snapshot = tracker.getUptime();
    expect(Object.keys(snapshot.components)).toHaveLength(3);
  });

  it('should update component status over time', () => {
    tracker.setComponentStatus('api', 'healthy');
    let snapshot = tracker.getUptime();
    const firstCheck = snapshot.components.api.lastChecked;

    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);

    tracker.setComponentStatus('api', 'degraded');
    snapshot = tracker.getUptime();
    expect(snapshot.components.api.lastChecked).not.toBe(firstCheck);

    vi.useRealTimers();
  });

  it('should record restart reason', () => {
    tracker.recordRestart('out of memory');
    const snapshot = tracker.getUptime();
    expect(snapshot.lastRestartReason).toBe('out of memory');
  });

  it('should omit lastRestartReason when not set', () => {
    const snapshot = tracker.getUptime();
    expect(snapshot.lastRestartReason).toBeUndefined();
  });

  it('should return ISO timestamp for started time', () => {
    const snapshot = tracker.getUptime();
    expect(snapshot.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should include ISO timestamp in component status', () => {
    tracker.setComponentStatus('test', 'healthy');
    const snapshot = tracker.getUptime();
    expect(snapshot.components.test.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('ErrorRateMonitor', () => {
  let monitor: ErrorRateMonitor;

  beforeEach(() => {
    monitor = new ErrorRateMonitor(5 * 60 * 1000); // 5 minute window
  });

  it('should record errors', () => {
    monitor.recordError('api', 'Connection timeout');
    const rate = monitor.getErrorRate('api');
    expect(rate).toBeGreaterThan(0);
  });

  it('should calculate error rate per minute', () => {
    const windowMs = 60 * 1000; // 1 minute window
    const testMonitor = new ErrorRateMonitor(windowMs);

    for (let i = 0; i < 10; i++) {
      testMonitor.recordError('api', 'Error');
    }

    const rate = testMonitor.getErrorRate('api');
    expect(rate).toBe(10); // 10 errors in 1 minute = 10/min
  });

  it('should track multiple categories', () => {
    monitor.recordError('api', 'Timeout');
    monitor.recordError('db', 'Connection failed');
    const rates = monitor.getAllRates();
    expect(rates.api).toBeGreaterThan(0);
    expect(rates.db).toBeGreaterThan(0);
  });

  it('should evict errors outside time window', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    monitor.recordError('api', 'Error 1');
    vi.advanceTimersByTime(6 * 60 * 1000); // Advance 6 minutes (past 5 min window)
    monitor.recordError('api', 'Error 2');

    const rate = monitor.getErrorRate('api');
    expect(rate).toBeCloseTo(0.2, 1); // Only 1 error in ~5 min window

    vi.useRealTimers();
  });

  it('should return zero rate for unknown category', () => {
    const rate = monitor.getErrorRate('unknown');
    expect(rate).toBe(0);
  });

  it('should return empty rates for no errors', () => {
    const rates = monitor.getAllRates();
    expect(Object.keys(rates)).toHaveLength(0);
  });

  it('should accept error objects', () => {
    const err = new Error('Test error');
    monitor.recordError('api', err);
    const rate = monitor.getErrorRate('api');
    expect(rate).toBeGreaterThan(0);
  });

  it('should accept error strings', () => {
    monitor.recordError('api', 'Test error string');
    const rate = monitor.getErrorRate('api');
    expect(rate).toBeGreaterThan(0);
  });

  it('should return true for isHealthy when no errors', () => {
    expect(monitor.isHealthy()).toBe(true);
  });

  it('should return false for isHealthy when threshold exceeded', () => {
    const windowMs = 60 * 1000; // 1 minute
    const testMonitor = new ErrorRateMonitor(windowMs);

    // Record 11 errors in 1 minute (threshold is 10/min)
    for (let i = 0; i < 11; i++) {
      testMonitor.recordError('api', `Error ${i}`);
    }

    expect(testMonitor.isHealthy()).toBe(false);
  });

  it('should be healthy when rate equals threshold', () => {
    const windowMs = 60 * 1000;
    const testMonitor = new ErrorRateMonitor(windowMs);

    // Record exactly 10 errors
    for (let i = 0; i < 10; i++) {
      testMonitor.recordError('api', `Error ${i}`);
    }

    expect(testMonitor.isHealthy()).toBe(true);
  });

  it('should track multiple categories for health check', () => {
    const windowMs = 60 * 1000;
    const testMonitor = new ErrorRateMonitor(windowMs);

    // Category 1: healthy
    for (let i = 0; i < 5; i++) {
      testMonitor.recordError('api', `Error ${i}`);
    }

    // Category 2: unhealthy
    for (let i = 0; i < 15; i++) {
      testMonitor.recordError('db', `Error ${i}`);
    }

    expect(testMonitor.isHealthy()).toBe(false);
  });

  it('should handle custom window size', () => {
    const customMonitor = new ErrorRateMonitor(2 * 60 * 1000); // 2 minute window
    customMonitor.recordError('api', 'Error');
    const rate = customMonitor.getErrorRate('api');
    expect(rate).toBeCloseTo(0.5, 1); // 1 error in 2 minutes
  });
});
