# RFC 0001: Wallet on the suite's encryption

|              |                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | **Accepted** by the owner on 2026-11-25, amended the same day (Amendment 1); built by tasks 3.13 to 3.17 (`docs/epics/vault.md`)          |
| **Deciders** | `kasunben` (owner)                                                                                                                        |
| **Context**  | `sovereign`'s RFC 0005 (end-to-end encryption), RFC 0006 (a lock), RFC 0008 (exports); Shopper's `DESIGN.md` §13 and `docs/encryption.md` |
| **Replaces** | `docs/specs/vault-format.md` and the age key design of `DESIGN.md` §7 to §9 as they stood in 0.1.x                                        |

## Summary

Wallet encrypts with **the suite's keys and the SDK's cipher**, as Sovereign core and Shopper do, and **holds no cipher of its own**. The age wallet key, the age recovery key and
the age vault header go. Wallet gets an **app key** from core when it is hosted (`appKeys`) and from a vault of its own when it runs alone (`AppVault`, `vaultRoute`, `localVault`).
The app key wraps one **keyring root** per account, kept on the server; every entry's key is **derived** from the root, as Shopper derives its lists' keys, and an entry's shape,
body and files are encrypted with the SDK's `encryptBytes` and `encryptContent`. Signing in unlocks, as it does across the suite. **A device keeps the root under its passcode or a
passkey**, as 0.1.x kept the vault key, so that Wallet opens offline, which the suite's key alone cannot do (below).

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
2. **A keyring root, and entry keys derived from it.** The account's first device makes 32 random bytes, the **root**, and the server keeps it **wrapped under the app key**
   (AES-256-GCM, bound to the account and the epoch; one row). Every entry's key is `HKDF-SHA-256(root, "wallet/v2/entry|<account id>|<entry id>")`: the SDK's document key.
   Nothing is wrapped per entry any more, so a device can **make and open entries with no signal**, which a key wrapped per entry under a key only the server releases could not.
3. **The SDK's cipher encrypts**: shape and body by `encryptBytes`, bound to a document id (account, entry, part) and the entry's key epoch (as Shopper binds its keyring's epoch); files by `encryptContent` in 64 KiB
   chunks. Wallet keeps its **plaintext padding** (size buckets), which hides lengths from the server and is not a cipher.
4. **The standalone server** keeps the vault's records and nothing it can open: `AppVault` over the auth store, `vaultRoute`, a session key secret (`keySecrets`), and
   `vault.deleteAccount` in `People.deletePerson`.
5. **A device layer, kept from 0.1.x.** A device holds the root wrapped by an unlock wrapper (a **device passcode**, Argon2id, or a **passkey with PRF**: Face ID, a fingerprint),
   so Wallet opens, and cards show, with no signal after a restart. The suite's key is what fetches the root the first time on a device and what signs the person back in
   online; a lock drops the root from memory and the wrapper brings it back.
6. **Start clean.** 0.1.x wallets are not migrated; this is a breaking change with a protocol bump and a forward migration that clears old-format rows.
7. **The words change:** "wallet key" and "recovery key" become the account password and the **recovery kit**, and Wallet stops saying nobody "can" read what it keeps. It says
   what the suite says: encrypted in the browser, **not yet audited**, and not a promise against whoever runs the server.

## Consequences

- **A weak password is now attackable offline** at Argon2id's cost (19 MiB, 3 passes) by someone with a copy of the database, as in every suite app. The wallet key was a 256-bit
  random file independent of the password.
- **Signing in unlocks, and the root is the one thing a device's wrapper protects.** Nothing of the wallet depends on a file the person must keep; the kit is the way back after a reset.
- **Key files and the recovery key go;** the passcode and passkey unlocks stay, now wrapping the root. Hosted also gets core's passkeys, kit and lock for the app key.
- **A new device needs a connection once,** to fetch the root with the suite's key, and a device with no wrapper set cannot open Wallet offline after a restart; setup says so.
- **`src/core/` is no longer portable to a native app** by itself: a native client would implement the suite's format (RFC 0005, suite 1) instead of Wallet's. The suite's own
  native work is where that lives.
- **A person's export** is what RFC 0008 says: the ciphertext as stored, with the vault's records. An age file survives only as the **operator's** export format.
- **Referrer policy:** core releases an app's key silently only when the browser sends the app's origin, so Wallet's `no-referrer` becomes `strict-origin-when-cross-origin`.

## Why a device layer: what the SDK's key cannot do

`appKeys().open()` and `localVault().open()` fetch the session's secret from the **server on every call** (`cache: 'no-store'`), by design: what a browser kept then opens nothing once the
session has ended. Shopper survives that because its device store keeps readable data. Wallet's rule is that the device holds **ciphertext only**, so with the suite's key alone a
restart with no signal could not open one card, which is Wallet's main use. The device layer fixes it without weakening the rule: the root, never the app key (which cannot be
exported), is what a wrapper holds, and what a lock drops.

**Quick unlock** is therefore Wallet's own and standalone or hosted: a platform passkey with PRF wraps the root. It needs a **device check** (the suite's research 0012 found passkeys that
give no PRF output), and where PRF is absent the device passcode is the way in. (Core's own lock, RFC 0006 part B, is separate, and the app's side of it, task 14.14, is not built.)
It could not have been the unlocking secret `derive()` gives: that is a key that cannot be exported, and `AppVault` has no passkey way in (`'password' | 'kit'` only).

## Alternatives considered

- **Keep age and the 0.1.x header, hang the entries under it**, and let core's key release go unused. Smaller, but Wallet would be the one app that cannot be unlocked by core's
  passkeys, recovery kit or lock, or move to core's vault.
- **The pure suite model, no device layer.** Cards would open offline only while the page stays open; after a restart with no signal Wallet would be locked. Rejected: it breaks the main use.
- **Keep readable data on the device, as Shopper does.** Rejected: the device would hold cards, documents and health data in the clear.
- **Take the app key but keep Wallet's own AES-GCM entry format.** Smaller and keeps the sync format, but Wallet keeps a cipher, a spec and vectors the suite's apps do not, and
  an entry could not be read by anything but Wallet.
- **A Wallet key file on top of the suite's keys** (two roots). More to get wrong, and it is the thing the suite retired.

## Amendment 1 (the same day it was accepted)

The first acceptance had an entry key per entry, wrapped under the app key, and no device layer. Reading the SDK showed that its key opens only through the server, which would have broken offline use,
so the owner chose a device layer and full offline use, and the key hierarchy became a **root with derived entry keys** (decision 2), which also lets entries be written offline.

## What waits on an input

- The quick unlock's device check (above), on an iPhone, an iPad and an Android phone.
- Hosted key release against a real core: the SDK's fake core has no key release, so it is tried against a Sovereign instance, not in the tests.

## Spec changes

`DESIGN.md` §4, §7, §8, §9 and §25.1 as this RFC says; `docs/specs/vault-format.md` is replaced by a short statement of what Wallet binds, derives and pads, with its own vectors; the roadmap's
tasks 3.1, 3.2, 3.4, 3.5, 3.9 and 3.12 are superseded (3.6 to 3.8, the keyring and its wrappers, stay and are re-rooted by 3.14); 3.13 to 3.17 are new. `AGENTS.md`'s rules that name `src/core/vault` change with the code that
retires it.

## Amendment 2 (2026-11-26, found while building it)

- **The envelope's overhead is not constant.** The SDK's envelope carries the document id in the clear: **63 bytes and the length of `<account id>/<entry id>/<part>`**, 16 more for
  each further 64 KiB chunk. The first spike measured a short id. The server checks sizes with that sum, knowing the ids (`src/core/sync/limits.ts`), and `limits.test.ts` holds it to
  the SDK's own output.
- **The `version` the SDK binds is the entry's key epoch,** not the row's version: a rebased or merged change then re-seals nothing, and a value made under another root still does not
  open. `entry.key_epoch` replaces `entry.wrapped_key`, and the sync protocol is version 2.
- **A lock takes the suite's key with it,** and unlocking proves the key each time (the password, or Sovereign's release): holding an unlocked device must not be enough to open
  the wallet again. The device's passkey or passcode is the offline way in.

## Amendment 3 (2026-11-26, the owner's decision)

**A reload keeps the wallet open.** Asked after a hard reload locked it, the owner chose to keep it open within the lock times. It does so by the suite's key, which the SDK already keeps for
the session and opens only with the server, so **no key is stored by Wallet**; what the tab keeps is when the wallet was last used and left, in `sessionStorage`. The conditions are DESIGN
§9.2. Two things are narrower than what was put to the owner, which allowed that closing the tab and reopening it within the hidden time might open without asking: the times are kept per
tab, so **a new tab asks**; and a device with no passkey or passcode, which until now opened by the account's key on any later load, now obeys the same times.

Rejected: opening offline after a reload, which needs a usable key kept in the browser, against the rule that a device holds ciphertext only.
