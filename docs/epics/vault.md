# Epic 3: Keys and the vault

## Status

📋 Planned.

## Overview

The heart of Wallet: an age key the person holds opens a vault key, which wraps a key per entry, which seals each entry's shape, body and files. This
epic builds the format (with a standalone specification and test vectors, for a native app later), the server's own key for credentials, creating or
importing keys, the recovery key, the keyring and its locks, and the ways to unlock. **It comes before any table of the product**, so that no entry is
ever written readable.

## Related

[`DESIGN.md`](../../DESIGN.md) §7, §8, §9, §31.2 · Tusk's `DESIGN.md` §9 (its personal key) and `src/crypto/` · `age-encryption` (typage)

## Tasks

#### 📋 3.1 — The vault format

**Goal:** sealing and opening shapes and bodies, and wrapping entry keys, exactly as specified. **Design:** §8.1, §8.2, §8.4. **Depends on:** 1.2.

**Technical:** `src/core/vault/`: `createVaultKey()`, `wrapEntryKey(vaultKey, accountId, entryId, vaultKeyId)` / `unwrapEntryKey` (WebCrypto
`wrapKey`/ `unwrapKey` with AES-GCM and the AAD of §8.1, results non-extractable), `seal(entryKey, part, accountId, entryId, json)` / `open(…)` with
version byte, random nonce, AAD and ISO/IEC 7816-4 padding to the part's bucket; typed errors (`TamperedError`, `UnsupportedVersionError`). Runs in
Node (tests) and the browser. **`docs/specs/vault-format.md`** written alongside: every byte, the AAD strings, the buckets, and **test vectors**
(fixed keys and nonces) checked by a test in Node and in Playwright.

**Accepts when:** values round-trip; changing any byte, the AAD's account, entry or part, or the version fails with the typed error; padded lengths
fall on the buckets; the spec's vectors pass in Node and Chromium and WebKit.

#### 📋 3.2 — File encryption

**Goal:** large files encrypted and decrypted in pieces. **Design:** §8.3. **Depends on:** 3.1.

**Technical:** `src/core/vault/stream.ts`: the header, HKDF-SHA-256 file keys, 64 KiB chunks with the counter-and-last-flag nonce, the length prefix
and bucket padding; `encryptFile(entryKey, fileId, ReadableStream | Blob)` returning a `Blob`, `decryptFile(…)` as a `ReadableStream` (so a PDF starts
rendering before the end); test vectors in the spec.

**Accepts when:** files of 0 bytes, one chunk, an exact multiple and 30 MB round-trip; truncating, reordering or dropping the last chunk fails; the
padded size falls on its bucket.

#### 📋 3.3 — The server's key

**Goal:** the server's own secrets encrypted at rest. **Design:** §8.7. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/crypto/` (instance key from `WALLET_ENCRYPTION_KEY`, envelope bound to row and purpose, rotation with `_PREVIOUS`, its
tests) and `credential`; a lint or test that `src/crypto/` is never imported by `src/core/` or used on an entry column.

**Accepts when:** Tusk's tests pass renamed; an envelope moved to another row fails; after rotation and removing the old key everything opens.

#### 📋 3.4 — Creating or importing the wallet key

**Goal:** a vault for an account, from a new or existing age key. **Design:** §7.1, §7.2, §7.4. **Depends on:** 3.1, 2.1.

**Technical:** `age-encryption` in the browser: `generateIdentity`, `identityToRecipient`; the key file (identity with a comment), optionally a
passphrase-protected age file (scrypt); import from a file, pasted text or a passphrase-protected file, validated; the vault header (`age` encryption
of `{ v, vault_key, vault_key_id, created }` to the recipients); `vault` table and `/api/vault` (`GET` the header and recipients; `POST` to create
once, refused if one exists; later `PUT` for 3.9 with the previous `version`); the header copied into the device store. The confirm step (typing six
characters of the identity) is the screen's (9.1).

**Accepts when:** a created key's file opens the header in Node with the `age` reference implementation (the CLI in CI, or typage in Node); a
Tusk-format identity imports; a second `POST` is refused; the server never receives the identity (a request log in the test shows only recipients).

#### 📋 3.5 — The recovery key

**Goal:** a second key that opens everything. **Design:** §7.3. **Depends on:** 3.4.

**Technical:** a second identity made in the browser, added to the header's recipients; the **recovery sheet** as a print page (identity in groups of
four, a QR code of it drawn by `bwip-js`, the date and account name, instructions), shown once; skipping requires the acknowledgement checkbox and is
recorded in the `settings` entry (so Settings can nag gently); unlocking with it by text, and by scanning the sheet's QR code once 6.3's scanner
exists (wired in 6.3).

**Accepts when:** either key opens the header; the sheet prints on one A4 and one Letter page; the identity is not in IndexedDB after the sheet is
confirmed.

#### 📋 3.6 — The keyring and locking

**Goal:** keys in memory only while unlocked, and every lock of §9.2. **Design:** §9.1, §9.2. **Depends on:** 3.4.

**Technical:** `src/keyring/`: state `locked | unlocked`; holds the vault key and a cache of entry keys as non-extractable `CryptoKey`s; an event that
screens and the in-memory index listen to, clearing their state and revoking object URLs on lock; idle timer (activity events), visibility timer, the
lock button, sign-out; BroadcastChannel so tabs share one state; lock timers stored per device. **A raw-dump test:** after a scripted session,
IndexedDB, Cache Storage, the service worker cache, `localStorage` and the server's database and files are searched for every seeded plaintext value,
and none is found.

**Accepts when:** on a mocked clock the idle and hidden locks fire at their settings; after locking, the index is empty and decrypted object URLs
fail; two tabs lock and unlock together; the raw-dump test passes (and fails when sealing is bypassed).

#### 📋 3.7 — Unlocking with a passkey

**Goal:** Face ID, a fingerprint or Windows Hello unlocks, offline. **Design:** §9.3. **Depends on:** 3.6.

**Technical:** feature detection with `PublicKeyCredential.getClientCapabilities()` (`extension:prf`) and a creation-time check
(`getClientExtensionResults().prf.enabled`); a WebAuthn credential created for unlocking (resident, user verification required, `rp.id` the app's
host, not registered with better-auth); at unlock, `get()` with `prf.eval.first = "wallet/v1/unlock"` → HKDF-SHA-256 → AES-256-GCM key → unwraps the
vault key from the device's wrapper; several credentials per device allowed; removing one deletes its wrapper. Re-check real-device support (§33) and
record it in the epic's Done as.

**Accepts when:** in Chromium with the virtual authenticator (PRF on), unlocking offline works; with PRF off the option is not offered; a wrapper from
one credential does not open with another.

#### 📋 3.8 — Unlocking with a device passcode

**Goal:** a passcode where passkeys with PRF are missing. **Design:** §9.3. **Depends on:** 3.6.

**Technical:** `hash-wasm` Argon2id (64 MiB, 3 passes, 1 lane, 16-byte salt) in a worker; the derived key wraps the vault key, and that wrapper is
encrypted again under a non-extractable AES-GCM key generated and kept by the browser; at least 6 characters; a failure counter in the store; at five,
the wrapper is deleted; Settings says a passcode is weaker than a passkey against a copied store.

**Accepts when:** unlocking offline works; the fifth wrong passcode removes the wrapper and the key or a passkey still works; derivation takes under
two seconds on a mid-range phone profile (Playwright's CPU throttling) or the parameters are revisited and the decision logged.

#### 📋 3.9 — Changing keys

**Goal:** replace the wallet key, add, replace or remove the recovery key. **Design:** §7.5. **Depends on:** 3.5.

**Technical:** Settings > Security, unlocked and online; the header re-encrypted to the new recipients and `PUT` with the previous `version` (refused
if stale); every device's copy of the header refreshed at its next sync; `keys_changed` notice (10.1); a sentence that old headers in old backups
still open with old keys.

**Accepts when:** after replacing the wallet key the old file no longer opens the current header and the new one does; a second device unlocks with
the new key after syncing; a stale `PUT` is refused.

#### 📋 3.10 — Rotating everything

**Goal:** new keys for everything, for a key that may have been seen. **Design:** §7.5. **Depends on:** 3.9, 4.7.

**Technical:** a new vault key and header; for each entry a new entry key, its shape, body and files re-sealed and sent through the ordinary sync path
as `put`s (files re-uploaded under new ids, old ones swept), in resumable batches with a cursor kept in the store; `vault.state = rotating` until
done; Device only entries rotated by their holders at their next sync (the server tells them); `rotation_done` notice; progress in Settings.

**Accepts when:** after rotation no entry opens with the old vault key; interrupting the browser halfway and reopening resumes and finishes; a Device
only entry on a second context is rotated when it syncs.

#### 📋 3.11 — Resetting a wallet

**Goal:** a way back for a person who lost every key. **Design:** §7.6. **Depends on:** 3.4, 4.1.

**Technical:** Settings > Security and the unlock screen's "I've lost my keys"; the password or a fresh session and typing "reset"; the server deletes
entries, files and the vault in one routine (shared with 2.5's pieces), and the account's devices erase their stores at their next sync; setup starts
again.

**Accepts when:** after a reset the account has no entries or files and setup runs; a second device's store is emptied at its next sync.

#### 📋 3.12 — One prompt to sign in and unlock

**Goal:** a single passkey prompt when both are needed. **Design:** §9.4. **Depends on:** 3.7, 2.1.

**Technical:** investigate whether better-auth's passkey plugin can pass the PRF extension through its authentication ceremony and return its result
to the browser; if so, a sign-in passkey can also hold an unlock wrapper; if not, record why and close as not now.

**Accepts when:** either one prompt signs in and unlocks in Playwright, or the epic records the finding and the task is marked ➖ with the reason.
