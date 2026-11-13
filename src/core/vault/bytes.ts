/**
 * Byte helpers for the vault format (DESIGN.md §8). Portable: no Node and no DOM, only `TextEncoder`, `btoa` and `atob`, which a browser, Node
 * and a native JavaScript runtime all have.
 */
export const encoder = new TextEncoder();
export const decoder = new TextDecoder('utf-8', { fatal: true });

/** Fresh random bytes. WebCrypto's generator, in the browser and in Node. */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Whether two byte strings are equal, in time that does not depend on where they differ. */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/** A copy that WebCrypto's types accept (a view on a plain `ArrayBuffer`). */
export function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(text: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})*$/i.test(text)) throw new Error('not hex');
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

export { fromBase64Url, toBase64Url } from '../encoding';
/** A 32-bit big-endian integer. */
export function u32(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

/** A 64-bit big-endian integer, from a safe JavaScript integer. */
export function u64(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('not a length');
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(value / 2 ** 32), false);
  view.setUint32(4, value % 2 ** 32, false);
  return out;
}

export function readU64(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const high = view.getUint32(0, false);
  const low = view.getUint32(4, false);
  const value = high * 2 ** 32 + low;
  if (!Number.isSafeInteger(value)) throw new RangeError('too large');
  return value;
}
