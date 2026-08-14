import { EscPosBuilder } from '@/features/receipts/escpos';

describe('EscPosBuilder', () => {
  it('encodes plain text lines as their UTF-8 bytes plus a newline', () => {
    const bytes = new EscPosBuilder().line('Hi').toBytes();
    // "Hi" = 0x48, 0x69, then newline 0x0a
    expect(Array.from(bytes)).toEqual([0x48, 0x69, 0x0a]);
  });

  it('prefixes bold-on with ESC E 1 and bold-off with ESC E 0', () => {
    const bytes = new EscPosBuilder().bold(true).text('x').bold(false).toBytes();
    expect(Array.from(bytes)).toEqual([0x1b, 0x45, 1, 0x78, 0x1b, 0x45, 0]);
  });

  it('encodes alignment as ESC a with the correct code for left/center/right', () => {
    const left = new EscPosBuilder().align('left').toBytes();
    const center = new EscPosBuilder().align('center').toBytes();
    const right = new EscPosBuilder().align('right').toBytes();
    expect(Array.from(left)).toEqual([0x1b, 0x61, 0]);
    expect(Array.from(center)).toEqual([0x1b, 0x61, 1]);
    expect(Array.from(right)).toEqual([0x1b, 0x61, 2]);
  });

  it('produces a base64 string that round-trips back to the same bytes', () => {
    const builder = new EscPosBuilder().line('Receipt total: 123.45').cut();
    const bytes = Array.from(builder.toBytes());
    const decoded = Array.from(Buffer.from(builder.toBase64(), 'base64'));
    expect(decoded).toEqual(bytes);
  });

  it('chains multiple commands in call order', () => {
    const bytes = new EscPosBuilder().align('center').bold(true).line('Hi').bold(false).cut().toBytes();
    expect(Array.from(bytes)).toEqual([
      0x1b, 0x61, 1, // align center
      0x1b, 0x45, 1, // bold on
      0x48, 0x69, 0x0a, // "Hi\n"
      0x1b, 0x45, 0, // bold off
      0x1d, 0x56, 0x00, // cut
    ]);
  });
});
