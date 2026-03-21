// Generate platform API keys, secrets, and webhook tokens using node:crypto
import { randomBytes, createHash } from 'node:crypto';

/** Generate a random 32-character hex API key */
export function generateApiKey(): string {
  return randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
}

/** Generate a random 64-character hex API secret */
export function generateApiSecret(): string {
  return randomBytes(32).toString('hex'); // 32 bytes = 64 hex chars
}

/** Generate a random 32-character webhook signing secret */
export function generateWebhookSecret(): string {
  return randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
}

/** SHA-256 hash of a secret for safe storage (never store plaintext secrets) */
export function hashApiSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
