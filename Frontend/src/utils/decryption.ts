// src/utils/decryption.ts
/**
 * Frontend Decryption Utility
 * 
 * Decrypts encrypted PII fields received from the API.
 * Only works if you have the ENCRYPTION_KEY (same as backend).
 * 
 * Usage:
 *   import { decryptField, decryptObject } from '@/utils/decryption';
 *   const decryptedEmail = await decryptField(encryptedEmail);
 *   const decryptedUser = await decryptObject(user, ['email', 'phone']);
 */

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || '';

// Cache for the derived key to avoid recomputing
let cachedKey: CryptoKey | null = null;

/**
 * Get or derive the encryption key
 */
async function getKey(): Promise<CryptoKey | null> {
  if (!ENCRYPTION_KEY) {
    return null;
  }

  if (cachedKey) {
    return cachedKey;
  }

  try {
    const crypto = window.crypto || (window as any).webkitCrypto;
    if (!crypto || !crypto.subtle) {
      console.error('[Decryption] Web Crypto API not available');
      return null;
    }

    const keyData = new TextEncoder().encode(ENCRYPTION_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
    cachedKey = await crypto.subtle.importKey(
      'raw',
      hashBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    return cachedKey;
  } catch (error) {
    console.error('[Decryption] Failed to derive key:', error);
    return null;
  }
}

/**
 * Decrypt a single encrypted field
 * @param encrypted - Base64 encrypted string from API
 * @returns Decrypted plaintext or null if decryption fails
 */
export async function decryptField(encrypted: string | null | undefined): Promise<string | null> {
  if (!encrypted || encrypted.trim() === '' || encrypted === '[ENCRYPTION_ERROR]') {
    return null;
  }

  const key = await getKey();
  if (!key) {
    // If no key, return encrypted value (for backward compatibility)
    return encrypted;
  }

  try {
    const crypto = window.crypto || (window as any).webkitCrypto;
    if (!crypto || !crypto.subtle) {
      return encrypted;
    }

    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    
    // Extract IV (16 bytes), tag (16 bytes), and ciphertext
    const iv = combined.slice(0, 16);
    const tag = combined.slice(16, 32);
    const ciphertext = combined.slice(32);
    
    // Combine ciphertext + tag for decryption
    const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
    ciphertextWithTag.set(ciphertext);
    ciphertextWithTag.set(tag, ciphertext.length);
    
    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128, // 128 bits = 16 bytes
      },
      key,
      ciphertextWithTag
    );
    
    // Convert to string
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('[Decryption] Failed to decrypt:', error);
    return null;
  }
}

/**
 * Decrypt multiple fields in an object
 * @param obj - Object with encrypted fields
 * @param fieldsToDecrypt - Array of field paths (supports nested like 'user.email')
 * @returns New object with decrypted fields
 */
export async function decryptObject(obj: any, fieldsToDecrypt: string[]): Promise<any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => decryptObject(item, fieldsToDecrypt)));
  }

  const decrypted = { ...obj };

  for (const fieldPath of fieldsToDecrypt) {
    const parts = fieldPath.split('.');
    let current: any = decrypted;
    
    // Navigate to the parent object
    for (let i = 0; i < parts.length - 1; i++) {
      if (current && typeof current === 'object' && parts[i] in current) {
        current = current[parts[i]];
      } else {
        current = null;
        break;
      }
    }
    
    // Decrypt the field if it exists
    const fieldName = parts[parts.length - 1];
    if (current && typeof current === 'object' && fieldName in current) {
      const value = current[fieldName];
      if (typeof value === 'string' && value.trim() !== '') {
        current[fieldName] = await decryptField(value);
      }
    }
  }

  return decrypted;
}

/**
 * Check if decryption is enabled (key is configured)
 */
export function isDecryptionEnabled(): boolean {
  return !!ENCRYPTION_KEY;
}
