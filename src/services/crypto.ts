/**
 * AES-GCM Encryption Service for SalesFlow
 * Uses the Web Crypto API (zero dependencies) to provide:
 * - End-to-end encryption for sync payloads
 * - Field-level encryption for sensitive IndexedDB data
 */

const SALT = new TextEncoder().encode('SalesFlow-E2E-Salt-v1');
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

/**
 * Derive a cryptographic AES-256-GCM key from a user identifier (e.g. Clerk userId)
 * using PBKDF2 with 100,000 iterations.
 */
export async function deriveKeyFromUserId(userId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a JSON-serializable payload using AES-256-GCM.
 * Returns a Base64 string containing [IV (12 bytes) | ciphertext].
 */
export async function encryptPayload(data: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Prepend IV to ciphertext for self-contained decryption
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a Base64-encoded payload that was encrypted with encryptPayload().
 * Returns the original JSON-parsed data.
 */
export async function decryptPayload<T = unknown>(encryptedBase64: string, key: CryptoKey): Promise<T> {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}

/**
 * Encrypt a single string value. Returns base64 encrypted string.
 */
export async function encryptField(value: string, key: CryptoKey): Promise<string> {
  return encryptPayload(value, key);
}

/**
 * Decrypt a single encrypted string field.
 */
export async function decryptField(encrypted: string, key: CryptoKey): Promise<string> {
  return decryptPayload<string>(encrypted, key);
}

// --- Key Management ---

const STORED_KEY_ALIAS = 'salesflow_encryption_key_id';

/**
 * Get or create a session encryption key. When a Clerk userId is available,
 * derive a deterministic key from it. Otherwise, fall back to a cached
 * randomly-generated key stored in localStorage.
 */
export async function getEncryptionKey(clerkUserId?: string): Promise<CryptoKey> {
  if (clerkUserId) {
    return deriveKeyFromUserId(clerkUserId);
  }

  // Fallback: generate and cache a random key for local-only encryption
  const storedKeyB64 = localStorage.getItem(STORED_KEY_ALIAS);
  if (storedKeyB64) {
    const keyData = Uint8Array.from(atob(storedKeyB64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', keyData, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }

  // Generate new random 256-bit key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  localStorage.setItem(STORED_KEY_ALIAS, b64);

  return key;
}
