import { decoder, encoder } from './bytes';
import type { SuiteCipher, Target } from './cipher';
import { MalformedError, TamperedError } from './errors';
import { BUCKETS, type Part, pad, unpad } from './padding';

/**
 * A sealed value: an entry's shape or body (DESIGN.md §8.2). The plaintext is UTF-8 JSON padded to the part's bucket (`padding.ts`, which is Wallet's), and the
 * padded bytes are the SDK's envelope (`encryptBytes`), **bound to the account, the entry and the part** by the document id and to the entry's key epoch by the
 * version, so the server cannot move a value to another entry, account or part, or give one made under another root, without it failing to open.
 */
export const documentIdOf = (accountId: string, entryId: string, part: Part): string =>
  `${accountId}/${entryId}/${part}`;

const targetOf = (accountId: string, entryId: string, part: Part, epoch: number): Target => ({
  documentId: documentIdOf(accountId, entryId, part),
  version: epoch,
});

/**
 * What the suite's envelope adds to what is encrypted (suite 1, `@sovereignfs/sdk`): a header of 15 bytes, the document id in the clear, 32 random bytes, and a
 * 16-byte tag for each 64 KiB chunk. So **63 bytes and the document id for a value of one chunk**, and 16 more for each chunk after. The server never imports
 * this: it checks sizes with the same sum in `src/core/sync/limits.ts`, and `limits.test.ts` holds the two to the SDK's own output.
 */
export const ENVELOPE_FIXED_BYTES = 15 + 32 + 16;
export const CHUNK_BYTES = 64 * 1024;
const TAG = 16;

/** The size of the envelope round `plaintextBytes` for a document id of `idBytes` bytes. */
export function envelopeBytes(idBytes: number, plaintextBytes: number): number {
  const chunks = Math.max(1, Math.ceil(plaintextBytes / CHUNK_BYTES));
  return ENVELOPE_FIXED_BYTES + idBytes + plaintextBytes + TAG * (chunks - 1);
}

/** Seals a JSON value. */
export async function seal(
  cipher: SuiteCipher,
  entryKey: CryptoKey,
  part: Part,
  accountId: string,
  entryId: string,
  epoch: number,
  value: unknown,
): Promise<Uint8Array> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new MalformedError();
  const padded = pad(encoder.encode(json), BUCKETS[part]);
  return cipher.encryptBytes(entryKey, targetOf(accountId, entryId, part, epoch), padded);
}

/** Opens a sealed value. Anything that is not exactly what `seal` made for this key, part, entry, account and epoch is a `TamperedError`. */
export async function open(
  cipher: SuiteCipher,
  entryKey: CryptoKey,
  part: Part,
  accountId: string,
  entryId: string,
  epoch: number,
  sealed: Uint8Array,
): Promise<unknown> {
  let padded: Uint8Array;
  try {
    padded = await cipher.decryptBytes(entryKey, targetOf(accountId, entryId, part, epoch), sealed);
  } catch {
    throw new TamperedError();
  }
  try {
    return JSON.parse(decoder.decode(unpad(padded))) as unknown;
  } catch (error) {
    if (error instanceof TamperedError) throw error;
    // Authentic, but not JSON: not something `seal` made.
    throw new MalformedError();
  }
}

/** The size a value of this many plaintext bytes has once padded and sealed: what the server sees (DESIGN.md §8.5). */
export function sealedLength(
  part: Part,
  plaintextBytes: number,
  accountId: string,
  entryId: string,
): number {
  const padded = Math.ceil((plaintextBytes + 1) / BUCKETS[part]) * BUCKETS[part];
  return envelopeBytes(encoder.encode(documentIdOf(accountId, entryId, part)).length, padded);
}
