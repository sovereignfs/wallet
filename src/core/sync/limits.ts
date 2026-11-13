/**
 * The sizes the server checks without opening anything (DESIGN.md §11.4, §29.5), from the vault format (`docs/specs/vault-format.md`). They are written
 * here, in the sync module, and not imported from the vault, because **server code never imports the vault format**; `limits.test.ts` holds them equal to it.
 */
/** The version byte, the 12-byte nonce and the 16-byte tag around a sealed value. */
export const SEALED_OVERHEAD = 1 + 12 + 16;
export const SHAPE_BUCKET = 256;
export const BODY_BUCKET = 1024;
/** A wrapped entry key: 1 + 12 + 32 + 16. */
export const WRAPPED_KEY_BYTES = 61;
/** The version byte of every sealed value and wrapped key in this version. */
export const SEALED_VERSION = 1;
/** A sealed shape is at most 4 KB of padded plaintext (DESIGN.md §29.5). */
export const SHAPE_MAX_PADDED = 4096;

/**
 * Whether a sealed value has a length that padding made: at least one bucket, and a whole number of buckets. A server cannot read a value, but it can
 * see that one is not padded, which would leak the length of a title.
 */
export function paddedLengthOk(sealedBytes: number, bucket: number, maxPadded: number): boolean {
  const padded = sealedBytes - SEALED_OVERHEAD;
  return padded >= bucket && padded <= maxPadded && padded % bucket === 0;
}
