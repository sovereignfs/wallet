import { concat, copy, encoder, randomBytes, toBase64Url } from './bytes';
import { MalformedError, TamperedError, UnsupportedVersionError } from './errors';
import { NONCE_BYTES, TAG_BYTES, VERSION } from './seal';

/**
 * The keys below the age header (DESIGN.md §8.1).
 *
 *     vault key (AES-256, 32 random bytes)        opened from the header with the wallet key or the recovery key
 *       └ wraps, per entry:  entry key (AES-256, 32 random bytes)
 *           ├ seals the entry's shape and body     AES-256-GCM
 *           └ derives the key of each file         HKDF-SHA-256
 *
 * **Once loaded, every key is a non-extractable `CryptoKey`.** The only time key bytes are in script is the moment an entry key is made, before it is
 * wrapped and the bytes dropped, and the moment the header is opened.
 */
export const KEY_BYTES = 32;

/** The wrapped entry key: version, nonce, and the 32 key bytes with their tag. */
export const WRAPPED_BYTES = 1 + NONCE_BYTES + KEY_BYTES + TAG_BYTES;

/** The two forms an entry key is loaded as, since WebCrypto will not use one key for both AES-GCM and HKDF. Both are non-extractable. */
export interface EntryKeys {
  /** Seals and opens the shape and body. */
  readonly aes: CryptoKey;
  /** Derives each file's key. */
  readonly hkdf: CryptoKey;
}

/** The vault key as a person's device holds it while unlocked, and the id the wrapped keys are bound to. */
export interface VaultKey {
  readonly key: CryptoKey;
  readonly id: string;
}

/** Fresh vault key material, for the header to carry. The caller seals it into the header and drops it. */
export function newVaultKeyMaterial(): {
  readonly raw: Uint8Array<ArrayBuffer>;
  readonly id: string;
} {
  return { raw: randomBytes(KEY_BYTES), id: toBase64Url(randomBytes(12)) };
}

/** The vault key, loaded so that it can wrap and unwrap and nothing else, and cannot be read back. */
export async function importVaultKey(raw: Uint8Array, id: string): Promise<VaultKey> {
  if (raw.length !== KEY_BYTES) throw new MalformedError();
  const key = await crypto.subtle.importKey('raw', copy(raw), { name: 'AES-GCM' }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  return { key, id };
}

export function wrapAadOf(
  accountId: string,
  entryId: string,
  vaultKeyId: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(`wallet/v1/key|${accountId}|${entryId}|${vaultKeyId}`);
}

/**
 * Makes a new entry key and wraps it for this entry: `AES-256-GCM(vault key, nonce, entry key, AAD = "wallet/v1/key|<account>|<entry>|<vault key id>")`.
 * Returns the wrapped bytes, which the server stores as `wrapped_key`, and the key loaded non-extractable. The bytes the key was made from are never
 * read: it is generated as a key, wrapped, and a second, non-extractable copy is what the caller gets.
 */
export async function createEntryKey(
  vault: VaultKey,
  accountId: string,
  entryId: string,
): Promise<{ readonly wrapped: Uint8Array<ArrayBuffer>; readonly keys: EntryKeys }> {
  const wrapped = await wrapNewEntryKey(vault, accountId, entryId, randomBytes(NONCE_BYTES));
  return { wrapped, keys: await unwrapEntryKey(vault, accountId, entryId, wrapped) };
}

/** **For the specification's test vectors only:** the nonce is the caller's, and the entry key's bytes are given. Not exported by `index.ts`. */
export async function wrapEntryKeyBytes(
  vault: VaultKey,
  accountId: string,
  entryId: string,
  entryKeyBytes: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const entryKey = await crypto.subtle.importKey(
    'raw',
    copy(entryKeyBytes),
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt'],
  );
  return wrap(vault, accountId, entryId, entryKey, nonce);
}

async function wrapNewEntryKey(
  vault: VaultKey,
  accountId: string,
  entryId: string,
  nonce: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  // Extractable only so that it can be wrapped, and only in this function: it is never returned or kept.
  const entryKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  return wrap(vault, accountId, entryId, entryKey, nonce);
}

async function wrap(
  vault: VaultKey,
  accountId: string,
  entryId: string,
  entryKey: CryptoKey,
  nonce: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const wrapped = await crypto.subtle.wrapKey('raw', entryKey, vault.key, {
    name: 'AES-GCM',
    iv: copy(nonce),
    additionalData: wrapAadOf(accountId, entryId, vault.id),
  });
  return concat(Uint8Array.of(VERSION), nonce, new Uint8Array(wrapped));
}

/**
 * Unwraps an entry's key into two non-extractable keys. Anything that is not exactly what `createEntryKey` made for this vault key, account and entry is
 * a `TamperedError`: a wrapped key moved to another entry or account, or wrapped under another vault key, does not open.
 */
export async function unwrapEntryKey(
  vault: VaultKey,
  accountId: string,
  entryId: string,
  wrapped: Uint8Array,
): Promise<EntryKeys> {
  if (wrapped.length === 0) throw new MalformedError();
  if (wrapped[0] !== VERSION) throw new UnsupportedVersionError();
  if (wrapped.length !== WRAPPED_BYTES) throw new MalformedError();
  const params = {
    name: 'AES-GCM',
    iv: copy(wrapped.subarray(1, 1 + NONCE_BYTES)),
    additionalData: wrapAadOf(accountId, entryId, vault.id),
  };
  const body = copy(wrapped.subarray(1 + NONCE_BYTES));
  try {
    const aes = await crypto.subtle.unwrapKey(
      'raw',
      body,
      vault.key,
      params,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const hkdf = await crypto.subtle.unwrapKey('raw', body, vault.key, params, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    return { aes, hkdf };
  } catch {
    throw new TamperedError();
  }
}
