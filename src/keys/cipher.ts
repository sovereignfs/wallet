import { decryptBytes, encryptBytes, importDocumentKey } from '@sovereignfs/sdk/keys';
import type { SuiteCipher } from '../core/vault';

/**
 * The suite's cipher, the SDK's own (`@sovereignfs/sdk/keys`, RFC 0001): what `src/core/` is given to seal and open an entry with. Wallet adds the padding, the
 * derivation of each entry's key and the document id a value is bound to; the SDK does the encrypting.
 */
export const suiteCipher: SuiteCipher = {
  importDocumentKey: (raw) => importDocumentKey(raw) as Promise<CryptoKey>,
  encryptBytes: (key, target, bytes) => encryptBytes(key, target, bytes),
  decryptBytes: (key, target, bytes) => decryptBytes(key, target, bytes),
};
