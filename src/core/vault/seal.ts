import { concat, copy, decoder, encoder, randomBytes } from './bytes';
import { MalformedError, TamperedError, UnsupportedVersionError } from './errors';
import { BUCKETS, type Part, pad, unpad } from './padding';

/**
 * A sealed value: an entry's shape or body (DESIGN.md §8.2).
 *
 *     byte 0       version (0x01)
 *     bytes 1–12   nonce (random, 96 bits)
 *     bytes 13–    AES-256-GCM ciphertext and its 16-byte tag
 *     AAD          "wallet/v1/<part>|<account id>|<entry id>"
 *     plaintext    UTF-8 JSON, then 0x80, then 0x00 bytes to the next multiple of the part's bucket
 *
 * **The AAD binds** a value to its account, entry and part, so the server cannot move one to another entry, account or part unnoticed. The version is
 * the first byte and is checked before anything else, so the format can move without guessing. The full specification, with test vectors, is
 * `docs/specs/vault-format.md`.
 */
export const VERSION = 0x01;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;

export function aadOf(part: Part, accountId: string, entryId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`wallet/v1/${part}|${accountId}|${entryId}`);
}

/** Seals a JSON value. A random nonce is made for each call: no nonce is ever chosen by a caller. */
export async function seal(
  entryKey: CryptoKey,
  part: Part,
  accountId: string,
  entryId: string,
  value: unknown,
): Promise<Uint8Array<ArrayBuffer>> {
  return sealWithNonce(entryKey, part, accountId, entryId, value, randomBytes(NONCE_BYTES));
}

/**
 * **For the specification's test vectors only:** the nonce is the caller's. A nonce used twice under one key breaks AES-GCM, which is why `seal` makes its
 * own and nothing but the vectors' test calls this (`index.ts` does not export it).
 */
export async function sealWithNonce(
  entryKey: CryptoKey,
  part: Part,
  accountId: string,
  entryId: string,
  value: unknown,
  nonce: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new MalformedError();
  const padded = pad(encoder.encode(json), BUCKETS[part]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copy(nonce), additionalData: aadOf(part, accountId, entryId) },
    entryKey,
    padded,
  );
  return concat(Uint8Array.of(VERSION), nonce, new Uint8Array(ciphertext));
}

/** Opens a sealed value. Anything that is not exactly what `seal` made for this key, part, entry and account is a `TamperedError`. */
export async function open(
  entryKey: CryptoKey,
  part: Part,
  accountId: string,
  entryId: string,
  sealed: Uint8Array,
): Promise<unknown> {
  if (sealed.length === 0) throw new MalformedError();
  if (sealed[0] !== VERSION) throw new UnsupportedVersionError();
  if (sealed.length < 1 + NONCE_BYTES + TAG_BYTES + 1) throw new MalformedError();
  let padded: ArrayBuffer;
  try {
    padded = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copy(sealed.subarray(1, 1 + NONCE_BYTES)),
        additionalData: aadOf(part, accountId, entryId),
      },
      entryKey,
      copy(sealed.subarray(1 + NONCE_BYTES)),
    );
  } catch {
    throw new TamperedError();
  }
  try {
    return JSON.parse(decoder.decode(unpad(new Uint8Array(padded)))) as unknown;
  } catch (error) {
    if (error instanceof TamperedError) throw error;
    // Sealed by this key and authentic, but not JSON: not something `seal` made.
    throw new MalformedError();
  }
}

/** The padded size a value of this many plaintext bytes has once sealed: what the server sees (DESIGN.md §8.5). */
export function sealedLength(part: Part, plaintextBytes: number): number {
  return (
    1 + NONCE_BYTES + Math.ceil((plaintextBytes + 1) / BUCKETS[part]) * BUCKETS[part] + TAG_BYTES
  );
}
