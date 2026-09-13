import * as Crypto from 'expo-crypto';

/** PINs are never stored in plaintext — only a salted SHA-256 hash. */
export async function createSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const hash = await hashPin(pin, salt);
  return hash === expectedHash;
}

/** Matches the cloud's unsalted SHA-256(pin) scheme (see /pair, /staff in api/src/index.ts) --
 * used only to verify a cloud-restored staff row's PIN on its first login on this device. */
export async function hashPinForCloud(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}
