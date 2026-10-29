import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

export class TokenCryptor {
  private readonly key: Buffer;

  constructor(encryptionKeyOrSecret?: string) {
    const rawSecret =
      encryptionKeyOrSecret ||
      process.env.ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      'opensourced-default-fallback-key-32chars!!';

    // Derive a fixed 32-byte (256-bit) key using SHA-256
    this.key = crypto.createHash('sha256').update(rawSecret).digest();
  }

  /**
   * Encrypts plaintext sensitive token using AES-256-GCM.
   * Format: `enc:gcm:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
   */
  encrypt(plaintext?: string | null): string | null {
    if (!plaintext) {
      return plaintext ?? null;
    }

    // If already encrypted, avoid double encryption
    if (plaintext.startsWith('enc:gcm:')) {
      return plaintext;
    }

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return `enc:gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
    } catch (err: any) {
      throw new Error(`Token encryption failed: ${err.message}`);
    }
  }

  /**
   * Decrypts AES-256-GCM encrypted token.
   * Falls back gracefully if plaintext (e.g. pre-existing or test token).
   */
  decrypt(encrypted?: string | null): string | null {
    if (!encrypted) {
      return encrypted ?? null;
    }

    if (!encrypted.startsWith('enc:gcm:')) {
      // Legacy unencrypted string (pass-through fallback)
      return encrypted;
    }

    try {
      const parts = encrypted.split(':');
      if (parts.length !== 5) {
        throw new Error('Malformed encrypted payload format');
      }

      const iv = Buffer.from(parts[2], 'hex');
      const authTag = Buffer.from(parts[3], 'hex');
      const ciphertext = parts[4];

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: any) {
      throw new Error(`Token decryption failed: ${err.message}`);
    }
  }
}
