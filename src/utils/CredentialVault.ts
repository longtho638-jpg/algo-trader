/**
 * Credential Vault — Encrypt/decrypt API keys at rest using AES-256-GCM.
 * Keys are encrypted with a master password and stored in a vault file.
 * Uses Node.js built-in crypto module (no external dependencies).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

interface VaultEntry {
  name: string;
  encrypted: string; // base64 encoded: iv(12) + authTag(16) + ciphertext
}

interface VaultData {
  version: number;
  salt: string; // base64 encoded salt for key derivation
  entries: VaultEntry[];
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export class CredentialVault {
  private vaultPath: string;
  private derivedKey: Buffer | null = null;

  constructor(vaultDir?: string) {
    const dir = vaultDir ?? path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.vaultPath = path.join(dir, '.credentials.vault');
  }

  /**
   * Unlock vault with master password. Derives encryption key via PBKDF2.
   */
  unlock(masterPassword: string): void {
    const vault = this.loadVault();
    const salt = vault ? Buffer.from(vault.salt, 'base64') : crypto.randomBytes(SALT_LENGTH);
    this.derivedKey = crypto.pbkdf2Sync(
      masterPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512'
    );
  }

  /**
   * Store an encrypted credential in the vault.
   */
  set(name: string, value: string): void {
    if (!this.derivedKey) throw new Error('Vault is locked. Call unlock() first.');

    const vault = this.loadVault() ?? this.createEmptyVault();

    // Encrypt value
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.derivedKey, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: iv + authTag + ciphertext → base64
    const packed = Buffer.concat([iv, authTag, encrypted]).toString('base64');

    // Upsert entry
    const existingIdx = vault.entries.findIndex(e => e.name === name);
    if (existingIdx >= 0) {
      vault.entries[existingIdx].encrypted = packed;
    } else {
      vault.entries.push({ name, encrypted: packed });
    }

    this.saveVault(vault);
    logger.info(`[Vault] Credential '${name}' stored securely.`);
  }

  /**
   * Retrieve and decrypt a credential from the vault.
   */
  get(name: string): string | null {
    if (!this.derivedKey) throw new Error('Vault is locked. Call unlock() first.');

    const vault = this.loadVault();
    if (!vault) return null;

    const entry = vault.entries.find(e => e.name === name);
    if (!entry) return null;

    try {
      const packed = Buffer.from(entry.encrypted, 'base64');
      const iv = packed.subarray(0, IV_LENGTH);
      const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, this.derivedKey, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      return decrypted.toString('utf8');
    } catch {
      logger.error(`[Vault] Failed to decrypt '${name}'. Wrong password or corrupted data.`);
      return null;
    }
  }

  /**
   * List all credential names in the vault (names only, not values).
   */
  list(): string[] {
    const vault = this.loadVault();
    return vault ? vault.entries.map(e => e.name) : [];
  }

  /**
   * Remove a credential from the vault.
   */
  remove(name: string): boolean {
    const vault = this.loadVault();
    if (!vault) return false;

    const idx = vault.entries.findIndex(e => e.name === name);
    if (idx < 0) return false;

    vault.entries.splice(idx, 1);
    this.saveVault(vault);
    logger.info(`[Vault] Credential '${name}' removed.`);
    return true;
  }

  /** Check if vault file exists */
  exists(): boolean {
    return fs.existsSync(this.vaultPath);
  }

  /**
   * Re-encrypt all credentials with a new master password.
   * Reads every entry with the current key, then re-encrypts with a fresh salt + new key.
   */
  rotateKey(_masterPassword: string, newMasterPassword: string): void {
    if (!this.derivedKey) throw new Error('Vault is locked. Call unlock() first.');

    const vault = this.loadVault();
    if (!vault) throw new Error('No vault file found to rotate.');

    // Decrypt all values with current key
    const plainEntries: Array<{ name: string; value: string }> = [];
    for (const entry of vault.entries) {
      const value = this.get(entry.name);
      if (value === null) throw new Error(`Failed to decrypt '${entry.name}' during rotation.`);
      plainEntries.push({ name: entry.name, value });
    }

    // Derive new key with a fresh salt
    const newSalt = crypto.randomBytes(SALT_LENGTH);
    const newKey = crypto.pbkdf2Sync(newMasterPassword, newSalt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    // Re-encrypt all entries with new key
    const newEntries: VaultEntry[] = plainEntries.map(({ name, value }) => {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, newKey, iv, { authTagLength: TAG_LENGTH });
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return { name, encrypted: Buffer.concat([iv, authTag, encrypted]).toString('base64') };
    });

    // Persist rotated vault, then switch active key
    this.saveVault({ version: vault.version, salt: newSalt.toString('base64'), entries: newEntries });
    this.derivedKey = newKey;
    logger.info('[Vault] Key rotation complete. All credentials re-encrypted.');
  }

  /**
   * Returns the number of days since the vault salt was last written (proxy for key age).
   * Returns -1 if vault does not exist.
   */
  getKeyAge(): number {
    if (!fs.existsSync(this.vaultPath)) return -1;
    const stat = fs.statSync(this.vaultPath);
    const msPerDay = 86_400_000;
    return Math.floor((Date.now() - stat.mtimeMs) / msPerDay);
  }

  private loadVault(): VaultData | null {
    if (!fs.existsSync(this.vaultPath)) return null;
    try {
      const data = fs.readFileSync(this.vaultPath, 'utf8');
      return JSON.parse(data) as VaultData;
    } catch {
      logger.error('[Vault] Failed to read vault file.');
      return null;
    }
  }

  private saveVault(vault: VaultData): void {
    const tmpPath = this.vaultPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(vault, null, 2));
    fs.renameSync(tmpPath, this.vaultPath);
  }

  private createEmptyVault(): VaultData {
    const salt = crypto.randomBytes(SALT_LENGTH);
    return {
      version: 1,
      salt: salt.toString('base64'),
      entries: []
    };
  }
}
