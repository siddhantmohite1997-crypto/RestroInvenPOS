import { createSalt, hashPin, verifyPin } from '@/features/auth/pin';

describe('PIN hashing', () => {
  it('verifies a correct PIN and rejects an incorrect one', async () => {
    const salt = await createSalt();
    const hash = await hashPin('1234', salt);

    expect(await verifyPin('1234', salt, hash)).toBe(true);
    expect(await verifyPin('0000', salt, hash)).toBe(false);
  });

  it('produces different hashes for different salts', async () => {
    const saltA = await createSalt();
    const saltB = await createSalt();
    const hashA = await hashPin('1234', saltA);
    const hashB = await hashPin('1234', saltB);

    expect(hashA).not.toEqual(hashB);
  });
});
