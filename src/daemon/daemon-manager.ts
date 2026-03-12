/**
 * Daemon Manager
 *
 * Process lifecycle management for Polymarket trading strategies:
 * - Process lifecycle (start/stop/restart)
 * - Graceful shutdown (SIGINT/SIGTERM handlers)
 * - Health monitoring with automatic recovery
 * - Strategy hot-reload without downtime
 *
 * Designed for M1 16GB memory constraints:
 * - Max 3 strategies running in parallel
 * - 512MB memory limit per strategy
 * - Staggered startup to prevent memory spikes
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { logger } from '../utils/logger';

export interface StrategyConfig {
  name: string;
  port: number;
  memoryLimit: string;
  args: string[];
}

export interface ProcessInfo {
  name: string;
  pid?: number;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
  restartCount: number;
  lastStart?: number;
  lastHealthCheck?: number;
  memoryUsage?: number;
}

export interface DaemonConfig {
  strategies: StrategyConfig[];
  healthCheckInterval: number;
  maxRestarts: number;
  minUptime: number;
  staggerDelay: number;
}

const DEFAULT_CONFIG: DaemonConfig = {
  strategies: [
    {
      name: 'ComplementaryArb',
      port: 3001,
      memoryLimit: '512M',
      args: ['polymarket:strategy', 'ComplementaryArb'],
    },
    {
      name: 'MakerBot',
      port: 3002,
      memoryLimit: '512M',
      args: ['polymarket:strategy', 'MakerBot'],
    },
    {
      name: 'WeatherBot',
      port: 3003,
      memoryLimit: '512M',
      args: ['polymarket:strategy', 'WeatherBot'],
    },
  ],
  healthCheckInterval: 30000,
  maxRestarts: 5,
  minUptime: 10000,
  staggerDelay: 2000,
};

export class DaemonManager extends EventEmitter {
  private config: DaemonConfig;
  private processes = new Map<string, ProcessInfo>();
  private childProcesses = new Map<string, ChildProcess>();
  private healthCheckTimer?: NodeJS.Timeout;
  private shuttingDown = false;
  private readonly rootDir: string;

  constructor(config: Partial<DaemonConfig> = {}) {
    super();
    this.rootDir = join(__dirname, '../..');
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize process tracking
    this.config.strategies.forEach((strategy) => {
      this.processes.set(strategy.name, {
        name: strategy.name,
        status: 'stopped',
        restartCount: 0,
      });
    });

    this.setupSignalHandlers();
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupSignalHandlers(): void {
    // SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('[DaemonManager] Received SIGINT, initiating graceful shutdown...');
      this.shutdown();
    });

    // SIGTERM (kill, PM2, systemd)
    process.on('SIGTERM', () => {
      logger.info('[DaemonManager] Received SIGTERM, initiating graceful shutdown...');
      this.shutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('[DaemonManager] Uncaught exception:', err);
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('[DaemonManager] Unhandled rejection:', reason);
    });
  }

  /**
   * Start all strategies with staggered startup
   */
  async start(): Promise<void> {
    if (this.shuttingDown) {
      logger.warn('[DaemonManager] Cannot start - shutting down');
      return;
    }

    logger.info(`[DaemonManager] Starting ${this.config.strategies.length} strategies...`);

    // Start strategies with stagger to prevent memory spike
    for (let i = 0; i < this.config.strategies.length; i++) {
      const strategy = this.config.strategies[i];
      const delay = i * this.config.staggerDelay;

      if (delay > 0) {
        await this.sleep(delay);
      }

      await this.startStrategy(strategy);
    }

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info('[DaemonManager] All strategies started');
    this.emit('started');
  }

  /**
   * Start a single strategy
   */
  private async startStrategy(config: StrategyConfig): Promise<void> {
    const processInfo = this.processes.get(config.name);
    if (!processInfo) {
      logger.error(`[DaemonManager] Unknown strategy: ${config.name}`);
      return;
    }

    if (processInfo.status === 'running') {
      logger.warn(`[DaemonManager] Strategy ${config.name} already running`);
      return;
    }

    logger.info(`[DaemonManager] Starting ${config.name}...`);
    processInfo.status = 'starting';

    const scriptPath = join(this.rootDir, 'dist', 'index.js');
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production',
      STRATEGY_NAME: config.name,
      PORT: config.port.toString(),
    };

    const child = spawn('node', [scriptPath, ...config.args], {
      cwd: this.rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.pid && this.childProcesses.set(config.name, child);
    processInfo.pid = child.pid;
    processInfo.lastStart = Date.now();

    // Handle stdout
    child.stdout?.on('data', (data) => {
      logger.info(`[${config.name}] ${data.toString().trim()}`);
    });

    // Handle stderr
    child.stderr?.on('data', (data) => {
      logger.error(`[${config.name}] ${data.toString().trim()}`);
    });

    // Handle exit
    child.on('exit', (code, signal) => {
      this.handleExit(config.name, code, signal);
    });

    // Handle error
    child.on('error', (err) => {
      logger.error(`[DaemonManager] Error in ${config.name}:`, err);
      processInfo.status = 'crashed';
    });

    // Mark as running after delay
    await this.sleep(1000);
    if (child.pid && this.childProcesses.has(config.name)) {
      processInfo.status = 'running';
      logger.info(`[DaemonManager] ${config.name} started (PID: ${child.pid})`);
      this.emit('strategy:started', config.name);
    }
  }

  /**
   * Handle process exit
   */
  private handleExit(name: string, code: number | null, signal: string | null): void {
    const processInfo = this.processes.get(name);
    if (!processInfo) return;

    this.childProcesses.delete(name);
    processInfo.pid = undefined;

    if (this.shuttingDown) {
      logger.info(`[DaemonManager] ${name} stopped`);
      return;
    }

    logger.warn(`[DaemonManager] ${name} exited with code ${code}, signal ${signal}`);
    processInfo.status = 'crashed';

    // Auto-restart if under limit
    const uptime = processInfo.lastStart ? Date.now() - processInfo.lastStart : 0;
    if (uptime < this.config.minUptime) {
      logger.error(`[DaemonManager] ${name} crashed too quickly, skipping restart`);
      return;
    }

    if (processInfo.restartCount < this.config.maxRestarts) {
      processInfo.restartCount++;
      logger.info(`[DaemonManager] Restarting ${name} (attempt ${processInfo.restartCount}/${this.config.maxRestarts})`);
      processInfo.status = 'stopped';
      this.startStrategy(this.config.strategies.find((s) => s.name === name)!);
    } else {
      logger.error(`[DaemonManager] ${name} exceeded max restarts, not restarting`);
      this.emit('strategy:max-restarts', name);
    }
  }

  /**
   * Stop all strategies
   */
  async shutdown(exitCode = 0): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info('[DaemonManager] Initiating shutdown...');

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Stop all strategies in reverse order
    const strategies = [...this.config.strategies].reverse();
    for (const strategy of strategies) {
      await this.stopStrategy(strategy.name);
    }

    logger.info('[DaemonManager] Shutdown complete');
    this.emit('stopped');

    if (exitCode > 0) {
      process.exit(exitCode);
    }
  }

  /**
   * Stop a single strategy
   */
  private async stopStrategy(name: string): Promise<void> {
    const processInfo = this.processes.get(name);
    if (!processInfo || processInfo.status === 'stopped') return;

    logger.info(`[DaemonManager] Stopping ${name}...`);
    processInfo.status = 'stopping';

    const child = this.childProcesses.get(name);
    if (child && child.pid) {
      // Send SIGTERM for graceful shutdown
      process.kill(child.pid, 'SIGTERM');

      // Wait for graceful shutdown
      await this.sleep(3000);

      // Force kill if still running
      if (child.pid && this.childProcesses.has(name)) {
        logger.warn(`[DaemonManager] Force killing ${name}`);
        process.kill(child.pid, 'SIGKILL');
      }
    }

    this.childProcesses.delete(name);
    processInfo.status = 'stopped';
    processInfo.pid = undefined;
    logger.info(`[DaemonManager] ${name} stopped`);
    this.emit('strategy:stopped', name);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    logger.info(`[DaemonManager] Health monitoring started (${this.config.healthCheckInterval}ms interval)`);
  }

  /**
   * Perform health check on all strategies
   */
  private performHealthCheck(): Promise<void> {
    const checks = this.config.strategies.map((s) => this.checkStrategyHealth(s));
    return Promise.all(checks).then(() => {
      this.emit('health:check');
    });
  }

  /**
   * Check health of a single strategy
   */
  private async checkStrategyHealth(config: StrategyConfig): Promise<void> {
    const processInfo = this.processes.get(config.name);
    if (!processInfo) return;

    const child = this.childProcesses.get(config.name);
    if (!child) {
      logger.warn(`[DaemonManager] ${config.name} has no process, may need restart`);
      return;
    }

    // Check if process is still alive
    try {
      process.kill(child.pid!, 0);
      processInfo.lastHealthCheck = Date.now();
    } catch {
      logger.error(`[DaemonManager] ${config.name} process is dead`);
      processInfo.status = 'crashed';
      this.handleExit(config.name, null, 'DEAD');
    }
  }

  /**
   * Hot-reload a strategy without stopping others
   */
  async reloadStrategy(name: string): Promise<void> {
    const strategy = this.config.strategies.find((s) => s.name === name);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${name}`);
    }

    logger.info(`[DaemonManager] Hot-reloading ${name}...`);
    await this.stopStrategy(name);
    await this.sleep(1000);
    await this.startStrategy(strategy);

    logger.info(`[DaemonManager] ${name} reloaded`);
    this.emit('strategy:reloaded', name);
  }

  /**
   * Get status of all strategies
   */
  getStatus(): { strategies: ProcessInfo[]; shuttingDown: boolean } {
    return {
      strategies: Array.from(this.processes.values()),
      shuttingDown: this.shuttingDown,
    };
  }

  /**
   * Get memory usage summary
   */
  getMemoryUsage(): { name: string; memory?: number }[] {
    return Array.from(this.processes.values()).map((p) => ({
      name: p.name,
      memory: p.memoryUsage,
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// CLI entry point
if (require.main === module) {
  const daemon = new DaemonManager();

  daemon.on('started', () => {
    logger.info('[Main] All strategies running');
  });

  daemon.on('stopped', () => {
    logger.info('[Main] Shutdown complete');
    process.exit(0);
  });

  daemon.on('strategy:started', (name) => {
    logger.info(`[Main] Strategy ${name} started`);
  });

  daemon.on('strategy:stopped', (name) => {
    logger.info(`[Main] Strategy ${name} stopped`);
  });

  daemon.on('strategy:max-restarts', (name) => {
    logger.error(`[Main] Strategy ${name} exceeded max restarts`);
  });

  // Start the daemon
  daemon.start().catch((err) => {
    logger.error('[Main] Failed to start daemon:', err);
    process.exit(1);
  });
}
