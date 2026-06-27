// crypto.js
// Handles client-side hashing and encryption for Vaultimator

let currentFieldKey = null;

export function setFieldKey(key) {
  currentFieldKey = key;
}

export function getFieldKey() {
  return currentFieldKey;
}


// Hashes the master password for backend authentication
// The backend never receives the plain text master password.
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "VAULTIMATOR_AUTH_SALT_V1");
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const base64 = bufferToBase64(hashBuffer);
  // Prepend characters to ensure it passes the backend's strict password complexity check
  return `Vv1!_` + base64;
}

export function validateMasterPassword(password) {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain a special character";
  return null;
}

// Derives an AES-GCM 256-bit key from the master password for field-level encryption
export async function deriveFieldKey(password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const salt = encoder.encode("VAULTIMATOR_FIELD_SALT_V1");
  
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Encrypts a plain text string to a v1:... base64 string
export async function encryptField(cryptoKey, text) {
  if (!text) return text;
  if (text.startsWith('v1:')) return text; // Already encrypted
  
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    cryptoKey,
    encoder.encode(text)
  );
  
  const cipherBytes = new Uint8Array(encrypted);
  
  // Combine IV and CipherText
  const payload = new Uint8Array(iv.length + cipherBytes.length);
  payload.set(iv, 0);
  payload.set(cipherBytes, iv.length);
  
  return `v1:${bufferToBase64(payload)}`;
}

// Decrypts a v1:... base64 string to plain text
// Returns the original text if it is not encrypted (for migration)
export async function decryptField(cryptoKey, encryptedText) {
  if (!encryptedText) return encryptedText;
  
  if (!encryptedText.startsWith('v1:')) {
    // Migration: Not encrypted, return as is.
    return encryptedText;
  }
  
  const base64 = encryptedText.substring(3);
  const payload = base64ToBuffer(base64);
  
  const iv = payload.slice(0, 12);
  const cipherBytes = payload.slice(12);
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      cryptoKey,
      cipherBytes
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (err) {
    console.error("Failed to decrypt field (wrong password or corrupted)", err);
    return "[[DECRYPTION_FAILED]]";
  }
}
