/**
 * Minimal ESC/POS command encoder for 2"/3" thermal receipt printers. Pure byte-building logic,
 * decoupled from any transport (Bluetooth/USB/Wi-Fi) — see printerService.ts for why no Bluetooth
 * transport is wired up yet.
 */

const ESC = 0x1b;
const GS = 0x1d;

export type Alignment = 'left' | 'center' | 'right';

export class EscPosBuilder {
  private bytes: number[] = [];

  text(value: string): this {
    this.bytes.push(...Array.from(new TextEncoder().encode(value)));
    return this;
  }

  line(value = ''): this {
    return this.text(value).newline();
  }

  newline(): this {
    this.bytes.push(0x0a);
    return this;
  }

  align(alignment: Alignment): this {
    const code = alignment === 'left' ? 0 : alignment === 'center' ? 1 : 2;
    this.bytes.push(ESC, 0x61, code);
    return this;
  }

  bold(enabled: boolean): this {
    this.bytes.push(ESC, 0x45, enabled ? 1 : 0);
    return this;
  }

  /** 0 = normal, 1 = double height/width, matching common ESC/POS GS ! sizing. */
  size(scale: 0 | 1): this {
    this.bytes.push(GS, 0x21, scale === 1 ? 0x11 : 0x00);
    return this;
  }

  divider(width = 32, char = '-'): this {
    return this.line(char.repeat(width));
  }

  /** Full cut where supported; falls back to a partial-cut-compatible command byte. */
  cut(): this {
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  feed(lines = 3): this {
    this.bytes.push(ESC, 0x64, lines);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  toBase64(): string {
    return bytesToBase64(this.bytes);
  }
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Manual base64 encoder — avoids relying on Node's Buffer, which isn't available in the Hermes
 * runtime the app actually runs under (only in the Jest/Node test environment). */
function bytesToBase64(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    result += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    result += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return result;
}
