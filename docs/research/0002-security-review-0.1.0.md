# Security review before 0.1.0

_Note, 2026-11-27:_ the vault format reviewed here is gone since 0.7.0. [`0004`](0004-security-review-0.7.0.md) reviews what replaced it, and corrects what is
said below of the passcode wrapper and a copy of the store (finding 5 there).

**Date:** 2026-11-14. **By:** the author of the code, with the code and tests open, which is **not an independent review** ([`DESIGN.md`](../../DESIGN.md) §33
holds that for before 1.0). **What it covers:** everything 0.1.0 builds: the vault format and keyring, sign-in, the server's rules for entries, the sync loop,
the policy, the service worker, logs, and what the server can read (§8.5), checked against a real database. **How:** each claim of §8 and §30 was matched to
the code that makes it true and to a test that fails when it is not, and the tests were run with the safeguard off where that was cheap
(`seal.test.ts`, `stream.test.ts`: the AAD, the last-chunk flag and the zero padding each failed their test when switched off).

## What was checked, and how it holds

| Claim                                                                                           | Where it is true                                                                     | Checked by                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A sealed value cannot be moved to another entry, part or account                                | the AAD of `seal`, `wrapEntryKey` and the file stream                                | `seal.test.ts`, `stream.test.ts`; the AAD switched off fails                                                      |
| Every key is a non-extractable `CryptoKey` once loaded                                          | `importVaultKey`, `unwrapEntryKey` (unwrapped twice, for AES and for HKDF)           | `seal.test.ts` (`extractable === false`, `exportKey` rejects)                                                     |
| The vault format is held to a specification, and to an independent implementation               | `docs/specs/vault-format.md`, its vectors                                            | the vectors checked against Node's own AES-GCM and HKDF, and the header against the real `age`                    |
| The server never opens an entry                                                                 | `src/server/` and the rest of the server import nothing of `src/core/vault`          | an ESLint rule that fails on the import (seen to fail); the server's tests run on sealed values it cannot read    |
| The server sees no kind, title, number or note                                                  | the kind is in the sealed shape; no column holds it                                  | `wallet.test.ts` and `e2e/wallet.spec.ts`: planted values are in **no** row, **no** IndexedDB store, **no** cache |
| The server refuses what padding did not make                                                    | `paddedLengthOk` in `apply.ts`                                                       | `apply.test.ts`                                                                                                   |
| One account cannot read or change another's entries                                             | `account_id` and the id's owner in every statement of `apply.ts`; pull is by account | `apply.test.ts`, `sync.test.ts` as a second person; `routes.test.ts` holds every route to `accountRoute`          |
| A replayed mutation writes nothing; a stale edit is not lost                                    | `applied_mutation`; the version in the `UPDATE`'s `WHERE`; merging on the device     | `apply.test.ts` (two writers at once), `wallet.test.ts` (a lost answer, two devices)                              |
| Locking drops the keys, the index and the screens' data                                         | `Keyring.lockLocally`, `Wallet.clear`, the gate that renders no page while locked    | `keyring.test.ts`, `wallet.test.ts`, `e2e/wallet.spec.ts` (nothing of the card is on the page locked)             |
| The wallet key is never kept                                                                    | `openHeader` returns the vault key's bytes, which are zeroed after use               | `wrappers.test.ts`, the raw-dump test finds neither key nor passcode                                              |
| A passcode wrapper cannot be guessed at from a copy of the store alone; five failures delete it | the second layer is a non-extractable key; the counter is written before each try    | `wrappers.test.ts`                                                                                                |
| No script runs that the server did not mark; nothing is third-party                             | `src/security/csp.ts`, `proxy.ts`                                                    | `csp.test.ts`, `e2e/smoke.spec.ts` (markup and handlers do not run; no request leaves the origin)                 |
| The service worker keeps the shell and the build's files and nothing of a person                | `src/sw/source.ts`                                                                   | `source.test.ts` (an allow-list test on a worker run in a VM) and `e2e/offline.spec.ts`                           |
| Deleting an account deletes everything of it, twice without harm                                | `People.deletePerson`; a table nobody decided about fails `people.test.ts`           | `people.test.ts` on a file, sqld and PostgreSQL; `e2e/account.spec.ts`                                            |
| Nothing typed reaches a log                                                                     | the server has no content; its logs name an id and a kind of failure                 | read: `grep` of `console.` in `src/` and `app/` finds start-up lines and the job runner's, none with content      |

## What the server can read

Checked against a database that two devices had used (`wallet.test.ts` dumps it): for each entry its id, tier (`synced`), version, `seq`, the padded sizes of
the shape and body, the number of files (0) and times, and the account's name and email (better-auth's, in the sign-in store). **Not** the kind of an
entry, its title, its code or anything in it. The metadata is §8.5's list and no more.

## Findings

None is a way to read an entry. Each is recorded, and has a task or a reason.

1. **A browser that can run script in the origin can use the passcode wrapper's second layer** (the non-extractable device key is usable by script of the
   same origin) and then guess the passcode against Argon2id offline. The passcode's strength is therefore Argon2id's cost (64 MiB, three passes), as
   DESIGN.md §9.3 says; Settings says a passcode is weaker than a passkey. _Accepted._ A long passcode is the answer, and so is a passkey.
2. **The passcode's failure counter is in the device's store,** so it protects against a person at the lock screen and not against someone who edits the
   store. _Accepted, same reason as 1._
3. **A server that serves altered JavaScript can take a key once it is unlocked** (DESIGN.md §8.6). The mitigations are the nonce policy, no third party, and
   running one's own instance. A check of the shell's scripts against a pinned list is §31.4's, not planned.
4. **Tombstones and applied-mutation records are not pruned** (task 4.11, after 0.1.0): they grow with use, and a deleted entry's wrapped key stays on the
   server. Neither opens anything. _Task 4.11._
5. **The vault key is passed between tabs of one origin as a non-extractable `CryptoKey`** (`BroadcastChannel`). Script of that origin could already use the
   keys of the tab it runs in; nothing is added. _Accepted._
6. **Sign-in through Sovereign never opens a wallet:** it is the account only. A person who signs in through core and loses their key has lost their wallet.
   The setup and the README say so. _By design._
7. **Real-device PRF support (DESIGN.md §33.3) has not been checked:** the passkey path is tested against Chromium's virtual authenticator with PRF, and Safari and Firefox
   have no virtual authenticator in the tests. Where `getClientCapabilities` or the PRF extension is missing, the passkey is not offered and the passcode is.
   _To be checked on a phone, by the owner, before the release is announced._
8. **The recovery key is on the page while the setup step is open** (as text and as a QR code, so that it can be printed), and is dropped when the vault is made.
   A person who leaves the step open on a shared screen shows it. _Accepted;_ the step says what the sheet is for.
9. **The browser may clear the device's store** (Safari after a week without use). Synced entries come back from the server; the unlock wrappers do not,
   and the wallet key then opens it. Settings says so and asks the browser to persist. _By design (DESIGN.md §10.8)._
10. **Requests are rate-limited per account and per address,** by `RateLimiter` in the database. Pulling is covered by the sync limit; the vault by its own.
    No limit is set on **sign-up** other than better-auth's; with `WALLET_AUTH_SIGNUP=open` anyone may make accounts. Closed is the default with local sign-in.
    _Note, 2026-11-25:_ what the code does is a little different from "per account and per address". Sync, vault and deleting an account are limited **per account**,
    and only sign-in and sign-up are limited **per address**, by better-auth; the routes Sovereign calls were counted together until 0.5.1, and are now counted per
    address ([`0003`](0003-security-review-0.5.0.md)).

## What would be next

An independent review of the vault format, the keyring and the sync rules before 1.0; a Safari and Firefox check of passkeys with PRF on a real phone; and a
check of the published script list in the service worker (§31.4).
