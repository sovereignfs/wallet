import { concat, copy, encoder, randomBytes, withCopy } from './bytes';
import type { SuiteCipher } from './cipher';
import { MalformedError, TamperedError } from './errors';

/**
 * The keyring root and the keys derived from it (DESIGN.md §8.1, RFC 0001).
 *
 *     app key (the suite's, AES-GCM, cannot be exported)
 *       └ wraps the keyring root       32 random bytes per account and epoch; the server keeps it wrapped (`keyring`)
 *           └ HKDF-SHA-256, info "wallet/v2/entry|<account id>|<entry id>"    the entry's key, derived and never stored
 *               └ the SDK's `encryptBytes` / `encryptContent` under it
 *
 * **Once loaded, the root is a non-extractable HKDF key.** Its bytes are in script only when it is made, when it is opened from its wrapper, and when a wrapper
 * is made for it (`src/keyring/wrappers.ts`), and the caller overwrites them each time.
 */
export const ROOT_BYTES = 32;
export const KEY_BYTES = 32;
/** The nonce, the root and its tag. */
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const WRAPPED_ROOT_BYTES = NONCE_BYTES + ROOT_BYTES + TAG_BYTES;
/** The only epoch until rotating everything is built (task 3.10). */
export const FIRST_EPOCH = 1;

/** A fresh root: 32 random bytes, for the account's first device to wrap under the app key and keep. */
export const newRoot = (): Uint8Array<ArrayBuffer> => randomBytes(ROOT_BYTES);

/** What a wrapped root is bound to: the account and the epoch, so the server cannot give one account's root to another or an old root for a new one. */
export const rootAadOf = (accountId: string, epoch: number): Uint8Array<ArrayBuffer> =>
  encoder.encode(`wallet/v2/root|${accountId}|${epoch}`);

/** `AES-256-GCM(app key, nonce, root, AAD = "wallet/v2/root|<account id>|<epoch>")`, the nonce first: 60 bytes, which the server keeps. */
export async function wrapRoot(
  appKey: CryptoKey,
  accountId: string,
  epoch: number,
  root: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (root.length !== ROOT_BYTES) throw new MalformedError();
  const nonce = randomBytes(NONCE_BYTES);
  const sealed = await withCopy(root, async (bytes) =>
    crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: rootAadOf(accountId, epoch) },
      appKey,
      bytes,
    ),
  );
  return concat(nonce, new Uint8Array(sealed));
}

/** The root's bytes, for the caller to import and overwrite. Anything that is not what `wrapRoot` made for this app key, account and epoch is a `TamperedError`. */
export async function unwrapRoot(
  appKey: CryptoKey,
  accountId: string,
  epoch: number,
  wrapped: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (wrapped.length !== WRAPPED_ROOT_BYTES) throw new MalformedError();
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copy(wrapped.subarray(0, NONCE_BYTES)),
        additionalData: rootAadOf(accountId, epoch),
      },
      appKey,
      copy(wrapped.subarray(NONCE_BYTES)),
    );
    return new Uint8Array(plain);
  } catch {
    throw new TamperedError();
  }
}

/** The root, loaded so that it can derive and nothing else, and cannot be read back. */
export async function importRoot(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== ROOT_BYTES) throw new MalformedError();
  return withCopy(raw, (bytes) =>
    crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits']),
  );
}

/** What the key of an entry is derived with: binding the key to the account and the entry, so that one entry's key tells nothing of another's. */
export const entryInfoOf = (accountId: string, entryId: string): Uint8Array<ArrayBuffer> =>
  encoder.encode(`wallet/v2/entry|${accountId}|${entryId}`);

/**
 * The 32 bytes of an entry's key: HKDF-SHA-256 of the root, an empty salt, and `entryInfoOf`. **The caller overwrites them.** Exported for the test vectors and for
 * sharing an entry (phase 4), which carries these bytes and never the root.
 */
export async function deriveEntryBytes(
  root: CryptoKey,
  accountId: string,
  entryId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: entryInfoOf(accountId, entryId),
    },
    root,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** The entry's key as the SDK's document key: derived, imported so that it cannot be exported, and its bytes overwritten. */
export async function deriveEntryKey(
  cipher: SuiteCipher,
  root: CryptoKey,
  accountId: string,
  entryId: string,
): Promise<CryptoKey> {
  const bytes = await deriveEntryBytes(root, accountId, entryId);
  try {
    return await cipher.importDocumentKey(bytes);
  } finally {
    bytes.fill(0);
  }
}
