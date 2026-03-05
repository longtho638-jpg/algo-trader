import * as chalk from 'chalk';
import { PerformanceMetrics } from './PerformanceAnalyzer';
import { logger } from '../utils/logger';

export class ConsoleReporter {
  static report(metrics: PerformanceMetrics) {
    logger.info(chalk.bold.blue('\n=== Performance Report ==='));
    logger.info(`Total Trades:   ${metrics.totalTrades}`);
    logger.info(`Win Rate:       ${this.colorValue(metrics.winRate, 50, '%')}`);
    logger.info(`Total Return:   ${this.colorValue(metrics.totalReturn, 0, '%')}`);
    logger.info(`Profit Factor:  ${metrics.profitFactor.toFixed(2)}`);
    logger.info(`Max Drawdown:   ${chalk.red(metrics.maxDrawdown.toFixed(2) + '%')}`);
    logger.info(`Sharpe Ratio:   ${metrics.sharpeRatio.toFixed(3)}`);
    logger.info(`Avg Win:        ${chalk.green(metrics.averageWin.toFixed(2))}`);
    logger.info(`Avg Loss:       ${chalk.red(metrics.averageLoss.toFixed(2))}`);
    logger.info('==========================\n');
  }

  private static colorValue(value: number, threshold: number, suffix: string = ''): string {
    const formatted = value.toFixed(2) + suffix;
    return value >= threshold ? chalk.green(formatted) : chalk.red(formatted);
  }
}
