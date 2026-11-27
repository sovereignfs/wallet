/** The bytes of a value read from a binary column, which a driver may hand over as a `Buffer`, a typed array or an `ArrayBuffer`. */
export function bytesOf(value: unknown): Buffer | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('a binary column held something else');
}
