/**
 * The sizes the server checks without opening anything (DESIGN.md §11.4, §29.5), from the suite's envelope (`docs/specs/vault-format.md`). They are written
 * here, in the sync module, and not imported from the vault, because **server code never imports the vault format**; `limits.test.ts` holds them equal to it and
 * to the SDK's own output.
 */
/** An envelope's header (15 bytes), its 32 random bytes and the tag of its last chunk. */
export const ENVELOPE_FIXED_BYTES = 15 + 32 + 16;
/** The suite's chunk: a value longer than this has a tag for each. */
export const CHUNK_BYTES = 64 * 1024;
const TAG_BYTES = 16;
export const SHAPE_BUCKET = 256;
export const BODY_BUCKET = 1024;
/** A sealed shape is at most 4 KB of padded plaintext (DESIGN.md §29.5). */
export const SHAPE_MAX_PADDED = 4096;
/** The only key epoch a device may use until rotating everything is built (task 3.10). */
export const FIRST_EPOCH = 1;

/** The part of a value the document id names: what `<account id>/<entry id>/<part>` is for. */
export type SealedPart = 'shape' | 'body';

/** The length of the document id a value is bound to, which the envelope carries in the clear. The server knows all three. */
export const documentIdBytes = (accountId: string, entryId: string, part: SealedPart): number =>
  new TextEncoder().encode(`${accountId}/${entryId}/${part}`).length;

/**
 * Whether a sealed value has a length that padding made: at least one bucket, and a whole number of buckets, once the envelope's own bytes are taken off. A
 * server cannot read a value, but it can see that one is not padded, which would leak the length of a title.
 */
export function paddedLengthOk(
  sealedBytes: number,
  bucket: number,
  maxPadded: number,
  idBytes: number,
): boolean {
  const maxChunks = Math.max(1, Math.ceil(maxPadded / CHUNK_BYTES));
  for (let chunks = 1; chunks <= maxChunks; chunks++) {
    const padded = sealedBytes - ENVELOPE_FIXED_BYTES - idBytes - TAG_BYTES * (chunks - 1);
    if (Math.max(1, Math.ceil(padded / CHUNK_BYTES)) !== chunks) continue;
    if (padded >= bucket && padded <= maxPadded && padded % bucket === 0) return true;
  }
  return false;
}

/** The most an envelope can be for a value of at most `maxPadded` bytes: past this a value is too large, and not merely not padded. */
export const maxEnvelopeBytes = (idBytes: number, maxPadded: number): number =>
  ENVELOPE_FIXED_BYTES +
  idBytes +
  maxPadded +
  TAG_BYTES * (Math.max(1, Math.ceil(maxPadded / CHUNK_BYTES)) - 1);
