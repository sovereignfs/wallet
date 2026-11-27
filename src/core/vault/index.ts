/**
 * What Wallet adds to the suite's cipher (DESIGN.md §8), the one implementation of it: the keyring root and the keys derived from it, the document ids and the
 * padding. **Portable:** no React, Next.js, `src/server/` or DOM beyond WebCrypto and `TextEncoder`/`TextDecoder` (a lint rule holds `src/core/` to it), and no
 * `@sovereignfs/*`, so the suite's cipher is given (`cipher.ts`) and a native app can take this whole. `docs/specs/vault-format.md` is the specification, with test
 * vectors; a change to it changes its spec, its derivation strings and its vectors in the same pull request.
 *
 * **No server code imports this for an entry.** The server stores what this makes and never opens it.
 */
export * from './errors';
export type { SuiteCipher, Target } from './cipher';
export { BUCKETS, type Part } from './padding';
export {
  seal,
  open,
  sealedLength,
  documentIdOf,
  envelopeBytes,
  ENVELOPE_FIXED_BYTES,
  CHUNK_BYTES,
} from './entry';
export {
  newRoot,
  wrapRoot,
  unwrapRoot,
  importRoot,
  deriveEntryKey,
  deriveEntryBytes,
  entryInfoOf,
  rootAadOf,
  ROOT_BYTES,
  KEY_BYTES,
  WRAPPED_ROOT_BYTES,
  FIRST_EPOCH,
} from './root';
export { toBase64Url, fromBase64Url } from './bytes';
