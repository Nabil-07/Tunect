// src/common/services/encryption.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Encryption Service for PII (Personally Identifiable Information)
 * 
 * Uses AES-256-GCM encryption for field-level encryption of sensitive data.
 * Only authorized clients (with the encryption key) can decrypt the data.
 * 
 * Features:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Base64 encoding for safe JSON transport
 * - Configurable encryption key via environment variable
 * - Automatic IV (Initialization Vector) generation for each encryption
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly encryptionKey: Buffer;

  constructor(private readonly config: ConfigService) {
    // Get encryption key from environment variable
    const keyString = this.config.get<string>('ENCRYPTION_KEY');
    
    if (!keyString) {
      this.logger.warn(
        'ENCRYPTION_KEY not set. Encryption will use a default key (NOT SECURE FOR PRODUCTION). ' +
        'Set ENCRYPTION_KEY environment variable with a 32-byte (256-bit) key.'
      );
      // Generate a default key (for development only - NOT SECURE)
      this.encryptionKey = crypto.randomBytes(this.keyLength);
    } else {
      // Derive a 32-byte key from the provided string using SHA-256
      this.encryptionKey = crypto.createHash('sha256').update(keyString).digest();
    }
  }

  /**
   * Encrypt a string value
   * @param plaintext - The value to encrypt
   * @returns Encrypted string in format: base64(iv + tag + ciphertext)
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext || plaintext.trim() === '') {
      return null;
    }

    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine IV + tag + ciphertext and encode as base64
      const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'base64')]);
      
      return combined.toString('base64');
    } catch (error) {
      this.logger.error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
      // Return a placeholder instead of failing silently
      return '[ENCRYPTION_ERROR]';
    }
  }

  /**
   * Decrypt an encrypted string
   * @param encrypted - The encrypted string from encrypt()
   * @returns Decrypted plaintext
   */
  decrypt(encrypted: string | null | undefined): string | null {
    if (!encrypted || encrypted.trim() === '' || encrypted === '[ENCRYPTION_ERROR]') {
      return null;
    }

    try {
      // Decode base64
      const combined = Buffer.from(encrypted, 'base64');
      
      // Extract IV, tag, and ciphertext
      const iv = combined.subarray(0, this.ivLength);
      const tag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
      const ciphertext = combined.subarray(this.ivLength + this.tagLength);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Encrypt an object's sensitive fields recursively
   * @param obj - Object to encrypt
   * @param fieldsToEncrypt - Array of field names to encrypt (supports nested paths like 'user.email')
   * @returns New object with encrypted fields
   */
  encryptObject(obj: any, fieldsToEncrypt: string[]): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.encryptObject(item, fieldsToEncrypt));
    }

    // Deep clone to avoid mutating original object
    const encrypted = JSON.parse(JSON.stringify(obj));

    for (const fieldPath of fieldsToEncrypt) {
      const parts = fieldPath.split('.');
      let current: any = encrypted;
      
      // Navigate to the parent object
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && typeof current === 'object' && parts[i] in current) {
          current = current[parts[i]];
        } else {
          current = null;
          break;
        }
      }
      
      // Encrypt the field if it exists
      const fieldName = parts[parts.length - 1];
      if (current && typeof current === 'object' && fieldName in current) {
        const value = current[fieldName];
        if (typeof value === 'string' && value.trim() !== '') {
          const encryptedValue = this.encrypt(value);
          if (encryptedValue) {
            current[fieldName] = encryptedValue;
          }
        }
      }
    }

    return encrypted;
  }

  /**
   * Check if encryption is enabled (key is configured)
   */
  isEncryptionEnabled(): boolean {
    return !!this.config.get<string>('ENCRYPTION_KEY');
  }
}
