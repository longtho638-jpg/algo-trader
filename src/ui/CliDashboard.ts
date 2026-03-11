import * as chalk from 'chalk';
import { IOrder } from '../interfaces/IExchange';
import { logger } from '../utils/logger';

export class CliDashboard {
  private lastPrice: number = 0;
  private lastSignal: string = 'NONE';
  private openPositions: number = 0;
  private balance: number = 0;

  updatePrice(price: number) {
    this.lastPrice = price;
    this.render();
  }

  updateSignal(signal: string) {
    this.lastSignal = signal;
    this.render();
  }

  updateBalance(balance: number) {
    this.balance = balance;
    this.render();
  }

  updatePositions(count: number) {
    this.openPositions = count;
    this.render();
  }

  render() {
    logger.info(''); // Use logger to clear or add empty line if clear is not supported by logger directly. For now just removing the direct console call.
    logger.info(chalk.bold.blue('=== ALGO TRADER DASHBOARD ==='));
    logger.info(`Time: ${new Date().toISOString()}`);
    logger.info('-----------------------------');
    logger.info(`Current Price:  ${chalk.green(this.lastPrice)}`);
    logger.info(`Last Signal:    ${this.getColorForSignal(this.lastSignal)(this.lastSignal)}`);
    logger.info(`Balance:        ${this.balance.toFixed(2)}`);
    logger.info(`Open Positions: ${this.openPositions}`);
    logger.info('-----------------------------');
  }

  private getColorForSignal(signal: string) {
    switch (signal) {
      case 'BUY': return chalk.green;
      case 'SELL': return chalk.red;
      default: return chalk.grey;
    }
  }
}
