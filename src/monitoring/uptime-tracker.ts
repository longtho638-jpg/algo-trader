/**
 * Uptime tracker - monitors system start time and component health states
 */

export interface ComponentStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: string;
  detail?: string;
}

export interface UptimeSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  components: Record<string, ComponentStatus>;
  lastRestartReason?: string;
}

export class UptimeTracker {
  private readonly startedAt: Date;
  private readonly components: Map<string, ComponentStatus>;
  private lastRestartReason?: string;

  constructor() {
    this.startedAt = new Date();
    this.components = new Map();
  }

  /** Returns current uptime snapshot */
  getUptime(): UptimeSnapshot {
    const uptimeSeconds = Math.floor(
      (Date.now() - this.startedAt.getTime()) / 1000,
    );

    const components: Record<string, ComponentStatus> = {};
    for (const [name, status] of this.components) {
      components[name] = status;
    }

    const snapshot: UptimeSnapshot = {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds,
      components,
    };

    if (this.lastRestartReason !== undefined) {
      snapshot.lastRestartReason = this.lastRestartReason;
    }

    return snapshot;
  }

  /** Update health status for a named component (engine, api, db, ws, etc.) */
  setComponentStatus(
    name: string,
    status: 'healthy' | 'degraded' | 'down',
    detail?: string,
  ): void {
    const entry: ComponentStatus = {
      status,
      lastChecked: new Date().toISOString(),
    };
    if (detail !== undefined) {
      entry.detail = detail;
    }
    this.components.set(name, entry);
  }

  /** Record the reason for the last restart event */
  recordRestart(reason: string): void {
    this.lastRestartReason = reason;
  }
}
