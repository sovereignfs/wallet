# RFC 0001: Wallet on the suite's encryption

|              |                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | **Accepted** by the owner on 2026-11-25; built by tasks 3.13 to 3.17 (`docs/epics/vault.md`)                                              |
| **Deciders** | `kasunben` (owner)                                                                                                                        |
| **Context**  | `sovereign`'s RFC 0005 (end-to-end encryption), RFC 0006 (a lock), RFC 0008 (exports); Shopper's `DESIGN.md` §13 and `docs/encryption.md` |
| **Replaces** | `docs/specs/vault-format.md` and the age key design of `DESIGN.md` §7 to §9 as they stood in 0.1.x                                        |

## Summary

Wallet encrypts with **the suite's keys and the SDK's cipher**, as Sovereign core and Shopper do, and **holds no key scheme or cipher of its own**. The age wallet key,
the age recovery key and the age vault header go. Wallet gets an **app key** from core when it is hosted (`appKeys`) and from a vault of its own when it runs alone
(`AppVault`, `vaultRoute`, `localVault`); an entry's shape, body and files are encrypted with the SDK's `encryptBytes` and `encryptContent` under a key of the entry's own,
wrapped under the app key. Signing in unlocks, as it does across the suite.

## Context

0.1.x gave a person an **age X25519 wallet key** (a key file they held) and an optional recovery key. They opened an age-encrypted **vault header** holding a vault key, which
wrapped one AES-256-GCM key per entry. Unlock was by key file, device passcode (Argon2id) or passkey (PRF), and "signing in never opens the wallet". Age was used **for the
header only** (the spec says so); every field below it was WebCrypto AES-GCM, with Wallet's own envelope, padding, binding, streams, specification and test vectors.

The suite does it differently (Proton's model is its reference). A random **account key** is wrapped by the password (Argon2id, an "unlocking value" the server never sees), by
passkeys, by a **recovery kit** and optionally by escrow; each app gets its own random **app key**, wrapped by the account key. Hosted, core keeps all of that and releases an app's
key to the page; with no core, the app keeps the same records in a vault of its own, unlocked at its sign-in. Shopper is the worked example: one interface (`src/keys/`) over both,
the SDK's `encryptBytes` for every field, and its own keyrings wrapped under the app key with AES-GCM.

Wallet already had the parts: `@sovereignfs/auth` derives the sign-in value with the same function as `localVault.derive`, and `AppVault` already serves the salt at
`/api/sign-in-salt`.

## Decision

1. **Keys come from the suite, by mode** (§25.1): `appKeys` hosted, `localVault` standalone, behind one interface, `src/keys/`.
2. **An entry's key is its own**: 32 random bytes, wrapped under the app key (AES-256-GCM, bound to account and entry) in `entry.wrapped_key`. The SDK calls it a document key.
3. **The SDK's cipher encrypts**: shape and body by `encryptBytes`, bound to a document id (account, entry, part) and the entry's version; files by `encryptContent` in 64 KiB
   chunks. Wallet keeps its **plaintext padding** (size buckets), which hides lengths from the server and is not a cipher.
4. **The standalone server** keeps the vault's records and nothing it can open: `AppVault` over the auth store, `vaultRoute`, a session key secret (`keySecrets`), and
   `vault.deleteAccount` in `People.deletePerson`.
5. **A lock forgets the key**, and unlocking is the password (standalone) or core's key release (hosted). A **quick unlock** (Face ID, a fingerprint) is an option where it can
   be had (below), never required.
6. **Start clean.** 0.1.x wallets are not migrated; this is a breaking change with a protocol bump and a forward migration that clears old-format rows.
7. **The words change:** "wallet key" and "recovery key" become the account password and the **recovery kit**, and Wallet stops saying nobody "can" read what it keeps. It says
   what the suite says: encrypted in the browser, **not yet audited**, and not a promise against whoever runs the server.

## Consequences

- **A weak password is now attackable offline** at Argon2id's cost (19 MiB, 3 passes) by someone with a copy of the database, as in every suite app. The wallet key was a 256-bit
  random file independent of the password.
- **Signing in unlocks.** Nothing of the wallet depends on a file the person must keep; the kit is the way back after a reset.
- **Standalone loses** the passcode and key-file unlocks (and passkey unlock unless the quick unlock below passes its check). Hosted gets core's passkeys, kit and lock.
- **`src/core/` is no longer portable to a native app** by itself: a native client would implement the suite's format (RFC 0005, suite 1) instead of Wallet's. The suite's own
  native work is where that lives.
- **A person's export** is what RFC 0008 says: the ciphertext as stored, with the vault's records. An age file survives only as the **operator's** export format.
- **Referrer policy:** core releases an app's key silently only when the browser sends the app's origin, so Wallet's `no-referrer` becomes `strict-origin-when-cross-origin`.

## Quick unlock (Face ID, Touch ID)

Possible two ways, **neither checked on a device by this RFC**:

- **Hosted:** core's lock (RFC 0006 part B, built in part; the app's side, its task 14.14, is not). Wallet takes it when core ships it.
- **Standalone:** Wallet's own passkey, with the PRF extension, wraps the **unlocking secret** `localVault().derive()` returns (not the app key, which cannot be exported); unlocking
  unwraps it and calls `afterSignIn(secret)`. The suite's research 0012 found passkeys that give no PRF output, so this waits on a spike on real phones, and **where PRF is absent the
  password stays the way in** and nothing is offered.

## Alternatives considered

- **Keep age and the 0.1.x header, hang the entries under it**, and let core's key release go unused. Smaller, but Wallet would be the one app that cannot be unlocked by core's
  passkeys, recovery kit or lock, or move to core's vault.
- **Take the app key but keep Wallet's own AES-GCM entry format.** Smaller and keeps the sync format, but Wallet keeps a cipher, a spec and vectors the suite's apps do not, and
  an entry could not be read by anything but Wallet.
- **A Wallet key file on top of the suite's keys** (two roots). More to get wrong, and it is the thing the suite retired.

## What waits on an input

- The quick unlock's device check (above), on an iPhone, an iPad and an Android phone.
- Hosted key release against a real core: the SDK's fake core has no key release, so it is tried against a Sovereign instance, not in the tests.

## Spec changes

`DESIGN.md` §4, §7, §8, §9 and §25.1 as this RFC says; `docs/specs/vault-format.md` is replaced by a short statement of what Wallet binds and pads, with its own vectors; the roadmap's
tasks 3.1, 3.2, 3.4, 3.5, 3.7, 3.8, 3.9 and 3.12 are superseded and 3.6 is replaced; 3.13 to 3.17 are new. `AGENTS.md`'s rules that name `src/core/vault` change with the code that
retires it.
