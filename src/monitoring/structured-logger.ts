/**
 * Structured JSON logger - no external dependencies
 * Output format per line: {"timestamp":"ISO","level":"...","message":"...","context":{...}}
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Rate limiting: track last emit time per message key (60s window)
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(key);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    return true;
  }
  rateLimitMap.set(key, now);
  return false;
}

export class StructuredLogger {
  private readonly context: Record<string, unknown>;
  private readonly minLevel: LogLevel;

  constructor(
    context: Record<string, unknown> = {},
    level: LogLevel = 'info',
  ) {
    this.context = context;
    this.minLevel = level;
  }

  private emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    // Rate limit by "level:message" key
    const rateLimitKey = `${level}:${message}`;
    if (isRateLimited(rateLimitKey)) return;

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...data },
    };

    // Remove empty context to keep output clean
    if (Object.keys(entry.context as object).length === 0) {
      delete entry.context;
    }

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.emit('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.emit('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.emit('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.emit('error', message, data);
  }

  /** Create child logger with additional bound context */
  child(context: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger(
      { ...this.context, ...context },
      this.minLevel,
    );
  }
}

/** Default singleton logger instance */
export const logger = new StructuredLogger();
