# Epic 3: Keys and the vault

## Status

📋 Planned.

## Overview

The heart of Wallet. **Since [RFC 0001](../rfcs/0001-wallet-on-the-suites-encryption.md) (2026-11-25) Wallet uses the suite's keys and the SDK's cipher**, as core and Shopper do: an app key from core
(hosted) or from a vault of its own (standalone) wraps a key per entry, and the SDK's `encryptBytes` and `encryptContent` seal each entry's shape, body and files. Tasks 3.1 to 3.12 built the
age design of 0.1.x and are superseded (➖) where RFC 0001 replaces them; 3.13 to 3.17 build the new one. **It comes before any table of the product**, so that no entry is ever written readable.

## Related

[`DESIGN.md`](../../DESIGN.md) §7, §8, §9, §31.2 · [RFC 0001](../rfcs/0001-wallet-on-the-suites-encryption.md) · `sovereign`'s RFC 0005 and `docs/encrypting-an-app.md` · Shopper's `DESIGN.md` §13 · Tusk's `src/crypto/` (the server's own key, 3.3)

## Tasks

#### ➖ 3.1 — The vault format

**Superseded by RFC 0001 (the SDK's envelope replaces Wallet's, task 3.15).** What follows is what 0.1.x built.

**Goal:** sealing and opening shapes and bodies, and wrapping entry keys, exactly as specified. **Design:** §8.1, §8.2, §8.4. **Depends on:** 1.2.

**Technical:** `src/core/vault/`: `createVaultKey()`, `wrapEntryKey(vaultKey, accountId, entryId, vaultKeyId)` / `unwrapEntryKey` (WebCrypto
`wrapKey`/ `unwrapKey` with AES-GCM and the AAD of §8.1, results non-extractable), `seal(entryKey, part, accountId, entryId, json)` / `open(…)` with
version byte, random nonce, AAD and ISO/IEC 7816-4 padding to the part's bucket; typed errors (`TamperedError`, `UnsupportedVersionError`). Runs in
Node (tests) and the browser. **`docs/specs/vault-format.md`** written alongside: every byte, the AAD strings, the buckets, and **test vectors**
(fixed keys and nonces) checked by a test in Node and in Playwright.

**Accepts when:** values round-trip; changing any byte, the AAD's account, entry or part, or the version fails with the typed error; padded lengths
fall on the buckets; the spec's vectors pass in Node and Chromium and WebKit.

**Done as:** `src/core/vault/` and `docs/specs/vault-format.md` with `vault-format.vectors.json`: the age header, a wrapped entry key bound to account, entry and vault key id, shapes and bodies in buckets bound to account, entry and part. The vectors are checked against Node's own AES-GCM and HKDF, and the header against the real `age`. Each safeguard's test was seen to fail with it off.

#### ➖ 3.2 — File encryption

**Superseded by RFC 0001 (`encryptContent` replaces Wallet's stream, task 3.15).** What follows is what 0.1.x built.

**Goal:** large files encrypted and decrypted in pieces. **Design:** §8.3. **Depends on:** 3.1.

**Technical:** `src/core/vault/stream.ts`: the header, HKDF-SHA-256 file keys, 64 KiB chunks with the counter-and-last-flag nonce, the length prefix
and bucket padding; `encryptFile(entryKey, fileId, ReadableStream | Blob)` returning a `Blob`, `decryptFile(…)` as a `ReadableStream` (so a PDF starts
rendering before the end); test vectors in the spec.

**Accepts when:** files of 0 bytes, one chunk, an exact multiple and 30 MB round-trip; truncating, reordering or dropping the last chunk fails; the
padded size falls on its bucket.

**Done as:** `src/core/vault/stream.ts`: the 64 KiB STREAM with HKDF file keys, the length prefix and bucket padding, tested for 0 bytes, one chunk, an exact multiple and 30 MB, and for truncation, a dropped last chunk, a swapped chunk, appended data and padding that is not zeros. **The format only:** nothing uploads or fetches a file until 4.6.

#### ✅ 3.3 — The server's key

**Goal:** the server's own secrets encrypted at rest. **Design:** §8.7. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/crypto/` (instance key from `WALLET_ENCRYPTION_KEY`, envelope bound to row and purpose, rotation with `_PREVIOUS`, its
tests) and `credential`; a lint or test that `src/crypto/` is never imported by `src/core/` or used on an entry column.

**Accepts when:** Tusk's tests pass renamed; an envelope moved to another row fails; after rotation and removing the old key everything opens.

**Done as:** `src/crypto/`, copied from Tusk (the instance key, an envelope bound to row and purpose, rotation with `_PREVIOUS`) without the operator key; an ESLint rule keeps server code from the vault format. `WALLET_ENCRYPTION_KEY` seals the server's own secrets and never an entry.

#### ➖ 3.4 — Creating or importing the wallet key

**Superseded by RFC 0001 (no wallet key: the suite's keys, tasks 3.13 and 3.14).** What follows is what 0.1.x built.

**Goal:** a vault for an account, from a new or existing age key. **Design:** §7.1, §7.2, §7.4. **Depends on:** 3.1, 2.1.

**Technical:** `age-encryption` in the browser: `generateIdentity`, `identityToRecipient`; the key file (identity with a comment), optionally a
passphrase-protected age file (scrypt); import from a file, pasted text or a passphrase-protected file, validated; the vault header (`age` encryption
of `{ v, vault_key, vault_key_id, created }` to the recipients); `vault` table and `/api/vault` (`GET` the header and recipients; `POST` to create
once, refused if one exists; later `PUT` for 3.9 with the previous `version`); the header copied into the device store. The confirm step (typing six
characters of the identity) is the screen's (9.1).

**Accepts when:** a created key's file opens the header in Node with the `age` reference implementation (the CLI in CI, or typage in Node); a
Tusk-format identity imports; a second `POST` is refused; the server never receives the identity (a request log in the test shows only recipients).

**Done as:** `createIdentity`, `parseIdentity`, `keyFile`, an optional passphrase (an age scrypt file, armoured), import of a key file, pasted text or a protected file, in `src/core/vault/identity.ts`; `/api/vault` (`GET`, and `POST` once, 409 after); `src/screens/Setup.tsx`. A Tusk-format key imports; the server's request contains recipients and a sealed header and never a secret key (a test reads the request).

#### ➖ 3.5 — The recovery key

**Superseded by RFC 0001 (the recovery kit replaces the recovery key, task 3.14).** What follows is what 0.1.x built.

**Goal:** a second key that opens everything. **Design:** §7.3. **Depends on:** 3.4.

**Technical:** a second identity made in the browser, added to the header's recipients; the **recovery sheet** as a print page (identity in groups of
four, a QR code of it drawn by `bwip-js`, the date and account name, instructions), shown once; skipping requires the acknowledgement checkbox and is
recorded in the `settings` entry (so Settings can nag gently); unlocking with it by text, and by scanning the sheet's QR code once 6.3's scanner
exists (wired in 6.3).

**Accepts when:** either key opens the header; the sheet prints on one A4 and one Letter page; the identity is not in IndexedDB after the sheet is
confirmed.

**Done as:** The recovery key as a second recipient, a printable sheet (`RecoverySheet`: the key in groups of four and a QR code, on one page) or a downloaded file, confirmed by typing its last six characters, or skipped by ticking the acknowledgement. Unlocking with it by text works (`e2e/account.spec.ts`). **Scanning the sheet's QR code with the camera is not wired yet.**

#### ➖ 3.6 — The keyring and locking

**Superseded by RFC 0001 (the key's lifetime and the lock are the suite's, tasks 3.14 and 3.17).** What follows is what 0.1.x built.

**Goal:** keys in memory only while unlocked, and every lock of §9.2. **Design:** §9.1, §9.2. **Depends on:** 3.4.

**Technical:** `src/keyring/`: state `locked | unlocked`; holds the vault key and a cache of entry keys as non-extractable `CryptoKey`s; an event that
screens and the in-memory index listen to, clearing their state and revoking object URLs on lock; idle timer (activity events), visibility timer, the
lock button, sign-out; BroadcastChannel so tabs share one state; lock timers stored per device. **A raw-dump test:** after a scripted session,
IndexedDB, Cache Storage, the service worker cache, `localStorage` and the server's database and files are searched for every seeded plaintext value,
and none is found.

**Accepts when:** on a mocked clock the idle and hidden locks fire at their settings; after locking, the index is empty and decrypted object URLs
fail; two tabs lock and unlock together; the raw-dump test passes (and fails when sealing is bypassed).

**Done as:** `src/keyring/keyring.ts`: locked or unlocked, the idle timer (1, 5, 15, 60 minutes), the hidden timer (at once, a minute, never), the lock button, sign-out, and every tab together through a `BroadcastChannel`, all tested on a mocked clock. The raw-dump test is in `wallet.test.ts` (the server and both stores) and `e2e/wallet.spec.ts` (IndexedDB, Cache Storage, local storage).

#### ➖ 3.7 — Unlocking with a passkey

**Superseded by RFC 0001 (a quick unlock, if it can be had, is task 3.17).** What follows is what 0.1.x built.

**Goal:** Face ID, a fingerprint or Windows Hello unlocks, offline. **Design:** §9.3. **Depends on:** 3.6.

**Technical:** feature detection with `PublicKeyCredential.getClientCapabilities()` (`extension:prf`) and a creation-time check
(`getClientExtensionResults().prf.enabled`); a WebAuthn credential created for unlocking (resident, user verification required, `rp.id` the app's
host, not registered with better-auth); at unlock, `get()` with `prf.eval.first = "wallet/v1/unlock"` → HKDF-SHA-256 → AES-256-GCM key → unwraps the
vault key from the device's wrapper; several credentials per device allowed; removing one deletes its wrapper. Re-check real-device support (§33) and
record it in the epic's Done as.

**Accepts when:** in Chromium with the virtual authenticator (PRF on), unlocking offline works; with PRF off the option is not offered; a wrapper from
one credential does not open with another.

**Done as:** `src/keyring/wrappers.ts`: a WebAuthn credential made for unlocking, the PRF output through HKDF as the key that wraps the vault key; tested against a virtual authenticator that computes PRF as WebAuthn does, and in Chromium with its own. **Real-device PRF support (DESIGN.md §33.3) is not checked yet:** where it is missing the passkey is not offered.

#### ➖ 3.8 — Unlocking with a device passcode

**Superseded by RFC 0001 (the password is the way in; quick unlock is task 3.17).** What follows is what 0.1.x built.

**Goal:** a passcode where passkeys with PRF are missing. **Design:** §9.3. **Depends on:** 3.6.

**Technical:** `hash-wasm` Argon2id (64 MiB, 3 passes, 1 lane, 16-byte salt) in a worker; the derived key wraps the vault key, and that wrapper is
encrypted again under a non-extractable AES-GCM key generated and kept by the browser; at least 6 characters; a failure counter in the store; at five,
the wrapper is deleted; Settings says a passcode is weaker than a passkey against a copied store.

**Accepts when:** unlocking offline works; the fifth wrong passcode removes the wrapper and the key or a passkey still works; derivation takes under
two seconds on a mid-range phone profile (Playwright's CPU throttling) or the parameters are revisited and the decision logged.

**Done as:** Argon2id (64 MiB, three passes, `hash-wasm`) in a worker that falls back to the page, under a second layer from a non-extractable key; five wrong passcodes delete the wrapper, counted before each try. It takes well under two seconds here.

#### ➖ 3.9 — Changing keys

**Superseded by RFC 0001 (a password change is the vault's `prepareChange`; replacing the app key is 3.10).** What follows is what 0.1.x built.

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

#### ➖ 3.12 — One prompt to sign in and unlock

**Superseded by RFC 0001 (signing in unlocks).** What follows is what 0.1.x built.

**Goal:** a single passkey prompt when both are needed. **Design:** §9.4. **Depends on:** 3.7, 2.1.

**Technical:** investigate whether better-auth's passkey plugin can pass the PRF extension through its authentication ceremony and return its result
to the browser; if so, a sign-in passkey can also hold an unlock wrapper; if not, record why and close as not now.

**Accepts when:** either one prompt signs in and unlocks in Playwright, or the epic records the finding and the task is marked ➖ with the reason.

#### 📋 3.13 — The standalone vault and the key's return

**Goal:** the keys' records and the ways to reach them, on the server and in the manifest. **Design:** §7.1, §7.4, §25.1. **Depends on:** 2.8.

**Technical:** `AppVault` over the auth store, `vaultRoute` at `/api/keys/vault` with the session's account id, `keySecrets` among the auth plugins and `vault.deleteAccount` in `People.deletePerson`;
the manifest's `encryption.return` and a `/keys/return` page for core's release; `Referrer-Policy: strict-origin-when-cross-origin`; Wallet's own `vault` table and `/api/vault` go.

**Accepts when:** the route answers only the session's own records and only for `WALLET_URL`'s origin; a deleted account leaves no record of its keys; the manifest check passes.

#### 📋 3.14 — One interface over both modes

**Goal:** the page has a key, however the instance gets it. **Design:** §7, §9. **Depends on:** 3.13.

**Technical:** `src/keys/` (Shopper's pattern): `appKeys` hosted, `localVault` standalone; sign-up, sign-in and reset send `derive(...).signIn` and call `afterSignIn`; the kit once after sign-up;
`LockedState`; Lock forgets the key; Wallet's setup flow is replaced.

**Accepts when:** a standalone sign-up shows the kit once and the wallet opens; a reload and offline still open it; Lock asks for the password; a reset gives back the account and the kit gives back the wallet.

#### 📋 3.15 — Entries under the app key

**Goal:** an entry is encrypted by the SDK under a key of its own, wrapped under the app key. **Design:** §8. **Depends on:** 3.14.

**Technical:** a 32-byte entry key per entry, wrapped (AES-256-GCM, bound to account and entry) in `wrapped_key`; shape and body `encryptBytes` bound to account, entry, part and version; files
`encryptContent`; plaintext padding kept; `src/core/sync/limits.ts` and the server's size check re-derived from the envelope's overhead; sync protocol version bumped; a forward migration clears old-format rows.

**Accepts when:** the marker test finds a random marker in no row and no file, in plain text, base64 or hex; an entry moved to another entry, part or version does not open; an old device is told to update.

#### 📋 3.16 — Retiring age

**Goal:** nothing of 0.1.x's key design is left. **Design:** §7 to §9. **Depends on:** 3.15.

**Technical:** `src/core/vault/` (but padding), `src/keyring/` wrappers, key files, the unlock screens, `src/server/vault/`, the `vault` table, `age-encryption` and `hash-wasm`, the vault spec and vectors (a short statement of what Wallet
binds and pads replaces them), `AGENTS.md`'s rules that named them.

**Accepts when:** `pnpm test`, the e2e specs and the deploy check pass with neither package installed.

#### 🚧 3.17 — Quick unlock

**Goal:** Face ID or a fingerprint, where it can be had. **Design:** §9.3. **Depends on:** 3.14.

**Technical:** standalone, a passkey of Wallet's own with PRF wraps the unlocking value `derive()` gave; hosted, core's lock when it ships (RFC 0006, 14.14). **Waits on a spike on real phones**; where PRF is absent nothing is offered.

**Accepts when:** a device check on an iPhone, an iPad and an Android phone is recorded, and unlocking by it works in a Chromium virtual authenticator; or this task is ➖ with the finding.
