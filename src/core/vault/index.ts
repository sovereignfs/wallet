/**
 * The vault format (DESIGN.md §8), the one implementation of it. **Portable:** no React, Next.js, `src/server/` or DOM beyond WebCrypto,
 * `TextEncoder`/`TextDecoder` and `fetch` (a lint rule holds `src/core/` to it), so a native app can take it whole. `docs/specs/vault-format.md` is the
 * specification, with test vectors; a change to a format changes its spec, its version byte and its vectors in the same pull request.
 *
 * **No server code imports this for an entry.** The server stores what this makes and never opens it.
 */
export * from './errors';
export { BUCKETS, type Part } from './padding';
export { seal, open, sealedLength, aadOf, VERSION, NONCE_BYTES, TAG_BYTES } from './seal';
export {
  createEntryKey,
  unwrapEntryKey,
  importVaultKey,
  newVaultKeyMaterial,
  WRAPPED_BYTES,
  KEY_BYTES,
  type EntryKeys,
  type VaultKey,
} from './keys';
export {
  createVaultHeader,
  sealHeader,
  openHeader,
  MAX_RECIPIENTS,
  type VaultHeaderContents,
} from './header';
export {
  createIdentity,
  parseIdentity,
  keyFile,
  protectKeyFile,
  openProtectedKeyFile,
  isProtectedKeyFile,
  identityCryptoKey,
  type Identity,
  type ParsedIdentity,
} from './identity';
export {
  encryptFile,
  decryptFile,
  decryptFileToBlob,
  encryptedLength,
  paddedLength,
  CHUNK_BYTES,
} from './stream';
export { toBase64Url, fromBase64Url } from './bytes';
