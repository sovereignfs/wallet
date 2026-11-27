/**
 * The suite's cipher, as Wallet uses it (DESIGN.md §8.2, RFC 0001). **Wallet holds no cipher:** the SDK's `importDocumentKey`, `encryptBytes` and `decryptBytes`
 * (`@sovereignfs/sdk/keys`) do the encrypting, each value bound to a document id and a version, so what they check is what the suite checks. `src/core/` imports
 * nothing of `@sovereignfs/*`, so the cipher is **given**: the browser gives the SDK's (`src/keys/cipher.ts`), a test gives the same, and a native app gives its own
 * implementation of the suite's format (RFC 0005 §1).
 */
export interface Target {
  /** What the value is for: `<account id>/<entry id>/<part>` (`documentIdOf`). */
  readonly documentId: string;
  /** The entry's key epoch: the generation of the root its key was derived from. */
  readonly version: number;
}

export interface SuiteCipher {
  /** A document key's 32 bytes as a key that cannot be exported. The caller overwrites the bytes. */
  importDocumentKey(raw: Uint8Array): Promise<CryptoKey>;
  /** A small value encrypted whole: the suite's envelope, with its constant overhead (`ENVELOPE_OVERHEAD`). */
  encryptBytes(key: CryptoKey, target: Target, bytes: Uint8Array): Promise<Uint8Array>;
  /** Opens what `encryptBytes` made, and nothing made for another document or version. */
  decryptBytes(key: CryptoKey, target: Target, bytes: Uint8Array): Promise<Uint8Array>;
}
