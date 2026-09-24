import { shouldApplyIncoming } from '@/features/sync/pullSync';

describe('shouldApplyIncoming', () => {
  it('applies when the row does not exist locally yet', () => {
    expect(shouldApplyIncoming(null, new Date('2026-01-01'))).toBe(true);
  });

  it('applies when the incoming row is newer than the local one', () => {
    const local = new Date('2026-01-01T00:00:00Z');
    const incoming = new Date('2026-01-01T00:00:01Z');
    expect(shouldApplyIncoming(local, incoming)).toBe(true);
  });

  it('skips when the local row is newer than the incoming one', () => {
    const local = new Date('2026-01-01T00:00:01Z');
    const incoming = new Date('2026-01-01T00:00:00Z');
    expect(shouldApplyIncoming(local, incoming)).toBe(false);
  });

  it('skips when local and incoming are exactly equal (nothing to change)', () => {
    const same = new Date('2026-01-01T00:00:00Z');
    expect(shouldApplyIncoming(same, same)).toBe(false);
  });
});
