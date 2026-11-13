/**
 * Why something could not be opened (DESIGN.md §8), as a kind and nothing else: **no message, key, value or ciphertext is in it,** since an error is
 * logged and shown. Each is a class of its own, so that a screen can tell a key that is not the one this was made for from a value that was changed or
 * moved, and neither from a format it does not know.
 */
export type VaultErrorKind = 'malformed' | 'tampered' | 'unsupported_version' | 'wrong_key';

export class VaultError extends Error {
  constructor(readonly kind: VaultErrorKind) {
    super(`vault: ${kind}`);
    this.name = 'VaultError';
  }
}

/** The value was changed, moved to another entry, part or account, or was not made with this key: AES-GCM would not open it. */
export class TamperedError extends VaultError {
  constructor() {
    super('tampered');
    this.name = 'TamperedError';
  }
}

/** The first byte names a version this code does not know: it is never guessed at. */
export class UnsupportedVersionError extends VaultError {
  constructor() {
    super('unsupported_version');
    this.name = 'UnsupportedVersionError';
  }
}

/** Not in the form at all: too short, not text, not what was expected. */
export class MalformedError extends VaultError {
  constructor() {
    super('malformed');
    this.name = 'MalformedError';
  }
}

/** A wallet key or recovery key that is not one of the header's recipients. */
export class WrongKeyError extends VaultError {
  constructor() {
    super('wrong_key');
    this.name = 'WrongKeyError';
  }
}
