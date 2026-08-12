import { createHash, randomBytes, randomUUID as nodeRandomUUID } from 'crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA256' } as const;

export async function digestStringAsync(_algorithm: string, data: string): Promise<string> {
  return createHash('sha256').update(data).digest('hex');
}

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return new Uint8Array(randomBytes(byteCount));
}

export function randomUUID(): string {
  return nodeRandomUUID();
}
