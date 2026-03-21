// Barrel export for license module
// Provides license key generation, validation, and SQLite persistence

export type { LicensePayload } from './license-generator.js';
export {
  buildPayload,
  generateLicense,
  parseLicenseKey,
  getTierDefaults,
} from './license-generator.js';

export type { ValidationResult } from './license-validator.js';
export {
  validateLicense,
  isExpired,
  hasFeature,
  canTrade,
  getRemainingDays,
  canAccessMarkets,
} from './license-validator.js';

export type { LicenseRow } from './license-store.js';
export {
  initLicenseStore,
  saveLicense,
  getLicenseByKey,
  getLicensesByUser,
  revokeLicense,
  getActiveLicenses,
  closeLicenseStore,
} from './license-store.js';
