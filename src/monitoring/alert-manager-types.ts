/**
 * AlertManager Types
 *
 * Type definitions for threshold-based alert system
 */

/**
 * Alert condition types
 */
export type AlertCondition =
  | 'daily_loss'
  | 'position_size'
  | 'pnl_target'
  | 'exposure_limit'
  | 'win_rate'
  | 'drawdown'
  | 'custom';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert condition configuration
 */
export interface AlertConfig {
  id: string;
  condition: AlertCondition;
  threshold: number;
  severity: AlertSeverity;
  handler: AlertHandler;
  description?: string;
  enabled: boolean;
}

/**
 * Alert handler callback
 */
export type AlertHandler = (alert: AlertTriggered) => void | Promise<void>;

/**
 * Triggered alert payload
 */
export interface AlertTriggered {
  alertId: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: number;
}
