/**
 * AlertManager Tests
 *
 * Tests for threshold-based alert system
 */

import {
  AlertManager,
  getGlobalAlertManager,
  resetGlobalAlertManager,
  type AlertTriggered,
} from './alert-manager';

describe('AlertManager', () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    alertManager = new AlertManager();
    resetGlobalAlertManager();
  });

  afterEach(() => {
    alertManager.reset();
    resetGlobalAlertManager();
  });

  describe('addAlert', () => {
    it('should add alert and return ID', () => {
      const alertId = alertManager.addAlert('daily_loss', -500, () => {});
      expect(alertId).toMatch(/^alert_\d+_[a-z0-9]+$/);
    });

    it('should add alert with custom severity', () => {
      const alertId = alertManager.addAlert('exposure_limit', 1000, () => {}, {
        severity: 'critical',
        description: 'High exposure warning',
      });

      const alerts = alertManager.getActiveAlerts();
      const alert = alerts.find(a => a.id === alertId);
      expect(alert?.severity).toBe('critical');
      expect(alert?.description).toBe('High exposure warning');
    });

    it('should default to warning severity', () => {
      alertManager.addAlert('pnl_target', 100, () => {});
      const alerts = alertManager.getActiveAlerts();
      expect(alerts[0].severity).toBe('warning');
    });
  });

  describe('removeAlert', () => {
    it('should remove alert by ID', () => {
      const alertId = alertManager.addAlert('daily_loss', -500, () => {});
      expect(alertManager.removeAlert(alertId)).toBe(true);
      expect(alertManager.getActiveAlerts().length).toBe(0);
    });

    it('should return false for non-existent alert', () => {
      expect(alertManager.removeAlert('non-existent')).toBe(false);
    });
  });

  describe('setAlertEnabled', () => {
    it('should disable alert', () => {
      const alertId = alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.setAlertEnabled(alertId, false);
      expect(alertManager.getActiveAlerts().length).toBe(0);
    });

    it('should re-enable alert', () => {
      const alertId = alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.setAlertEnabled(alertId, false);
      alertManager.setAlertEnabled(alertId, true);
      expect(alertManager.getActiveAlerts().length).toBe(1);
    });
  });

  describe('checkAlerts', () => {
    it('should trigger daily_loss alert when breached', (done) => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.addAlert('daily_loss', -500, (alert: AlertTriggered) => {
        expect(alert.condition).toBe('daily_loss');
        expect(alert.currentValue).toBe(-600);
        expect(alert.threshold).toBe(-500);
        done();
      });

      alertManager.checkAlerts(stats);
    });

    it('should trigger pnl_target alert when reached', (done) => {
      const stats = {
        totalPositions: 5,
        totalPnl: 150,
        realizedPnl: 100,
        unrealizedPnl: 50,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.addAlert('pnl_target', 100, (alert: AlertTriggered) => {
        expect(alert.condition).toBe('pnl_target');
        expect(alert.currentValue).toBe(150);
        done();
      });

      alertManager.checkAlerts(stats);
    });

    it('should trigger position_size alert when exceeded', (done) => {
      const stats = {
        totalPositions: 12,
        totalPnl: 50,
        realizedPnl: 30,
        unrealizedPnl: 20,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.addAlert('position_size', 10, (alert: AlertTriggered) => {
        expect(alert.condition).toBe('position_size');
        expect(alert.currentValue).toBe(12);
        done();
      });

      alertManager.checkAlerts(stats);
    });

    it('should trigger exposure_limit alert when exceeded', (done) => {
      const stats = {
        totalPositions: 5,
        totalPnl: 50,
        realizedPnl: 30,
        unrealizedPnl: 20,
        totalExposure: 1500,
        marketExposures: [],
      };

      alertManager.addAlert('exposure_limit', 1000, (alert: AlertTriggered) => {
        expect(alert.condition).toBe('exposure_limit');
        expect(alert.currentValue).toBe(1500);
        done();
      });

      alertManager.checkAlerts(stats);
    });

    it('should not trigger alert when threshold not breached', () => {
      const stats = {
        totalPositions: 5,
        totalPnl: 50,
        realizedPnl: 30,
        unrealizedPnl: 20,
        totalExposure: 500,
        marketExposures: [],
      };

      const handler = jest.fn();
      alertManager.addAlert('daily_loss', -500, handler);
      alertManager.checkAlerts(stats);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should respect cooldown period', () => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      const handler = jest.fn();
      alertManager.addAlert('daily_loss', -500, handler);

      // First check should trigger
      alertManager.checkAlerts(stats);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second check immediately should not trigger (cooldown)
      alertManager.checkAlerts(stats);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return triggered alerts array', () => {
      const stats = {
        totalPositions: 15,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 1500,
        marketExposures: [],
      };

      alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.addAlert('position_size', 10, () => {});
      alertManager.addAlert('exposure_limit', 1000, () => {});

      const triggered = alertManager.checkAlerts(stats);
      expect(triggered.length).toBe(3);
    });
  });

  describe('getHistory', () => {
    it('should return triggered alerts history', () => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.checkAlerts(stats);

      const history = alertManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].condition).toBe('daily_loss');
    });

    it('should limit history size', () => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      // Add multiple alerts
      for (let i = 0; i < 10; i++) {
        alertManager.addAlert('daily_loss', -500, () => {});
      }

      alertManager.checkAlerts(stats);
      const history = alertManager.getHistory(5);
      expect(history.length).toBe(5);
    });
  });

  describe('event emission', () => {
    it('should emit alert:triggered event', (done) => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.on('alert:triggered', (alert: AlertTriggered) => {
        expect(alert.condition).toBe('daily_loss');
        done();
      });

      alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.checkAlerts(stats);
    });

    it('should emit alert:daily_loss event', (done) => {
      const stats = {
        totalPositions: 5,
        totalPnl: -600,
        realizedPnl: -300,
        unrealizedPnl: -300,
        totalExposure: 500,
        marketExposures: [],
      };

      alertManager.on('alert:daily_loss', (alert: AlertTriggered) => {
        expect(alert.condition).toBe('daily_loss');
        done();
      });

      alertManager.addAlert('daily_loss', -500, () => {});
      alertManager.checkAlerts(stats);
    });
  });

  describe('getGlobalAlertManager', () => {
    it('should return singleton instance', () => {
      const instance1 = getGlobalAlertManager();
      const instance2 = getGlobalAlertManager();
      expect(instance1).toBe(instance2);
    });

    it('should reset properly', () => {
      const instance1 = getGlobalAlertManager();
      resetGlobalAlertManager();
      const instance2 = getGlobalAlertManager();
      expect(instance1).not.toBe(instance2);
    });
  });
});
