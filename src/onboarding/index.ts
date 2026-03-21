// Barrel export for onboarding module
export { runSetupWizard } from './setup-wizard.js';
export type { SetupResult, ExchangeName, NotificationChannel } from './setup-wizard.js';

export {
  generateApiKey,
  generateApiSecret,
  generateWebhookSecret,
  hashApiSecret,
} from './api-key-generator.js';

export {
  readEnvFile,
  backupEnvFile,
  mergeEnvFile,
  writeEnvFile,
} from './env-writer.js';
