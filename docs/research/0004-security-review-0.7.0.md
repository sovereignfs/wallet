# Security review of the suite's encryption in Wallet, 0.7.0

**Date:** 2026-11-27. **By:** an AI agent (Claude Code), with the code open, the tests run, safeguards switched off one at a time and probes run in a
scratch copy; **not an independent review** ([`DESIGN.md`](../../DESIGN.md) §33 holds that for before 1.0). **What it covers:** what 0.7.0 built in
place of 0.1.x's encryption ([RFC 0001](../rfcs/0001-wallet-on-the-suites-encryption.md), `DESIGN.md` §7 to §9, §11, §26.6): the keyring root and the
keys derived from it, the format, the unlock wrappers, locking and reopening after a reload, how the key arrives in both modes, the server's routes
for roots and entries, the device's store, deleting an account and the upgrade. The code under `src/core/`, `src/keys/`, `src/keyring/`, `src/server/`
and `src/local/` is the same in 0.7.1 as in 0.7.0 on `main`. **What it does not:** the suite's own cipher and vault (the SDK is used here and has not
been audited), a real core, real phones, Firefox, the sign-in and routes of [`0003`](0003-security-review-0.5.0.md), dependency advisories, and a
cryptographer's judgment (task 20.8).

## What was checked, and how it holds

Run for this review, at 0.7.1 on a Mac: the unit tests (683 passed, 3 skipped, on a SQLite file) and the browser tests (116 of 117 passed; the camera scan
fails there on the code before 0.7.1 too, and was not looked into). sqld and PostgreSQL were not run here.

| Claim                                                                      | Where it is true                                                | Checked by                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A wrapped root opens only for its account and epoch                        | the additional data of `wrapRoot`, `unwrapRoot`                 | `root.test.ts`; with the data emptied, its test fails                                                   |
| A sealed value does not open for another account, entry, part or key epoch | `documentIdOf`, and the epoch as the SDK's version (`entry.ts`) | `entry.test.ts`, `vectors.test.ts`; with the part or the epoch left out, they fail                      |
| Each entry has its own key, bound to account and entry                     | `entryInfoOf` (`root.ts`)                                       | `root.test.ts`, `vectors.test.ts`; with the entry left out, four tests fail                             |
| The root and entry keys cannot be exported once loaded                     | `importRoot`, `deriveEntryKey`                                  | `root.test.ts`, `keyring.test.ts`                                                                       |
| The server keeps one wrapped root an epoch, the first given, per account   | `keepRoot`, `/api/keys/root`                                    | `server/keyring/keyring.test.ts` (a race, a second account, another origin, the limit)                  |
| The server never opens an entry                                            | an ESLint rule on imports of `src/core/vault`                   | an import added to `src/server/` fails the lint                                                         |
| The server and the device's stores hold nothing readable of an entry       | the kind and every field are sealed                             | `wallet.test.ts`, `e2e/wallet.spec.ts` and `e2e/offline.spec.ts` (planted values, dumped)               |
| One account cannot read or change another's entries                        | `account_id` in the statements of `apply.ts`                    | `apply.test.ts`, `sync.test.ts` as a second person                                                      |
| Locking drops the root, the keys and the opened entries                    | `Keyring.lockLocally`, `Wallet.clear`                           | `keyring.test.ts`, `wallet.test.ts` — **when a lock happens** (findings 1 and 2, fixed since)           |
| A reload opens the wallet only within the lock times                       | `resume.ts`                                                     | `resume.test.ts`, `e2e/reload.spec.ts` — standalone (finding 2, fixed since, was a hosted way round it) |
| Five wrong passcodes delete the wrapper; each try is counted first         | `wrappers.ts`                                                   | `wrappers.test.ts` (against someone at the lock screen; see finding 5 for a copied profile)             |
| Deleting an account leaves no key record of it                             | `People.deletePerson`, the vault's `deleteAccount`              | `people.test.ts`                                                                                        |
| The service worker keeps the shell and the build, nothing of a person      | `src/sw/source.ts`                                              | `source.test.ts`, `e2e/offline.spec.ts`                                                                 |

## Findings

None lets someone read an entry from the server's data without a password, a kit or a device's way to unlock. **Findings 1 to 3 were the ones to fix
before 0.7 is published.** Each says how it was seen: **reproduced** (in a browser or by running the code), or **checked** (read in the code), and
whether it is still open.

1. **High. A page that slept comes back unlocked.** The idle and hidden locks were timers and nothing else. Coming back, `setHidden(false)` cancelled
   the hidden timer and started the idle one again, and a touch did the same; neither looked at how long it had been. A system that suspends a page (a
   phone in a pocket, a closed laptop) may run no timer meanwhile. **Reproduced** with a clock moved while no timer ran, in the keyring and in
   Chromium and WebKit: an hour hidden, shown again, and still unlocked, after a tap too; with the timer run, it locked. On a real device, whether the
   overdue timer or the page's own event comes first is the browser's choice, and **was not tried**. §9.2 promises the lock. _Fixed in 0.7.1:_ the
   keyring keeps the times of the last use and of hiding by the clock, and locks when either has run out, or the clock was set back: when the page
   comes back or is focused, at a touch, once a second, and before it gives a new tab the root. Tested with a clock that sleeps (`keyring.test.ts`,
   `e2e/lock.spec.ts`, both seen to fail before). **Still not tried on a phone or a sleeping laptop.**
2. **High, hosted. Starting Sovereign's unlock and coming back opens a locked wallet.** `openWithAccount` marked the person as arrived (`arrive()`)
   **before** leaving for core. A lock keeps the suite's key (RFC 0001, amendment 3), so a page that came back within 15 minutes, with its session and
   a connection, opened with it, whether core answered or not, and core's own sign-in or lock was never asked. **Reproduced** in Chromium and WebKit
   against the fake core, with the app's key placed in the browser as core's release leaves it (the fake releases none): locked and reloaded, it
   stayed locked; locked, off to core and straight back, it was open. _Fixed in 0.7.1:_ the arrival is marked only when `/keys/return` has taken
   core's answer (`KeyReturn`). Tested that leaving for core and coming back unanswered leaves no mark (`e2e/sovereign.spec.ts`, seen to fail before).
   **A real core's release is still not tried.** **Apart from this, and by design (§9.4):** hosted, the lock screen is one press from open while
   core's session is unlocked, since core answers without asking.
3. **High. A password can end up in the address.** Sign-in, sign-up and reset, pressed before the page's scripts run, send a GET with the password in
   it (`@sovereignfs/ui` 0.105.0). **Reproduced** in Chromium and WebKit. It breaks "the password is never sent", and the password is what opens the
   wallet on a new device. _Open, upstream:_ fixed in `ui` 0.107.4, not published when this was written.
4. **Medium. A session alone, with no password, can destroy the ways in, or the wallet.** `/api/keys/vault` takes `confirm-kit` and `put-way-in` from
   any session of the account. **Reproduced:** both replaced with junk; a new device with the right password is then asked for the recovery kit, and
   the right kit does not open the wallet. A device with a passkey or passcode still opens, and nothing offers to make the ways in again. The same
   session reads the wrapped account key records, so can guess the password offline. **Checked:** it can delete every entry through `/api/sync`, which
   clears what was sealed, with no backup to return to; and on an account with no root yet, the first 60 bytes sent as a wrapped root are kept for
   good. The session cookie, the `Origin` check and the content policy stand in front. _Open._ The vault's route is the SDK's: raise in `sovereign`
   that changing a way in should prove the password. Backups (epic 8) are the answer to deletion.
5. **Medium. A copy of the browser's profile gets past the ways of unlocking.** A key that script cannot export is still written to disk.
   **Reproduced** in Chromium 156: the raw bytes of a non-exportable key put in IndexedDB are in the profile's files. Two things rest on such a key.
   _The passcode:_ [0002](0002-security-review-0.1.0.md) said its wrapper cannot be guessed at from a copy of the store alone; whoever copies the
   profile has the salt, the ciphertext and the second layer's key, so its strength is Argon2id's cost (64 MiB, 3 passes) times the number of
   passcodes: for six digits, a million. _The suite's key, with no passcode at all:_ while someone is signed in, locked or not, the SDK keeps the
   account key (hosted, the app key) in IndexedDB under such a key and, inside that, under a secret the server gives to the session's cookie
   (`/api/auth/sv/key-secret`). With the profile, a cookie that can be read and a session that has not ended, both layers open, and the root and the
   entries follow. **Checked** in the SDK's `KeyStore`, not reproduced. Some systems encrypt a browser's cookies with the system's keychain and some
   do not. The README says a copy of the browser's data is guarded as far as the unlock method is strong, which this second case breaks. WebKit and
   Firefox were **not checked**. _Open. Fix:_ correct the claims (README, `wrappers.ts`, its test's name, Settings' words); decide whether a passcode
   must be longer, or not digits alone, and whether a lock should drop the suite's key (amendment 3); raise the kept key in `sovereign`.
6. **Medium. Signing out leaves the wallet openable on the device.** The name and address, the store and the wrappers stay, and `/shell` opens with
   the passcode with no session. **Reproduced** in Chromium and WebKit. §11.8 has signing out erase the store when nothing is unsent. _Open: the
   owner's decision._
7. **Low. Whoever controls the server's data can serve an older value, or drop an entry, unnoticed.** The row's version is not bound into a sealed
   value (RFC 0001, amendment 2), so an earlier shape or body of the same entry opens as the current one. **Reproduced** with the format's own
   functions. The README says the encryption guards against moving or replaying a value between entries or accounts, which is true, and says nothing
   of time; §8.6 does not either. _Said since, in §8.6 and the README. The behaviour is unchanged:_ binding a version would be a change of format.

8. **Low. Deleting an account stalls while another tab is open.** The other tab kept the device's database open, so its deletion waited.
   **Reproduced** in Chromium and WebKit: 15 seconds later the page had not left Settings, and the store and the name were still there; closing the
   other tab finished it. The account is already gone from the server. _Fixed in 0.7.1:_ a tab lets the database go when a deletion asks, and leaves;
   the name is forgotten before the store is deleted; and the page leaves after five seconds even if a tab cannot answer (`db.test.ts`,
   `e2e/account.spec.ts`, both seen to fail before). Whether the store of a frozen tab is then deleted **was not checked.**
9. **Low. The root's bytes are not always overwritten.** Settings keeps them from the password until Done: a lock, or leaving the screen, drops them
   without overwriting; and each way of unlocking made takes a copy that is never overwritten (`SettingsScreen.tsx`, `UnlockMethods.tsx`).
   **Checked.** §9.1 and the rules of the code say they are. _Fixed in 0.7.1:_ every copy made for WebCrypto or for a new way to unlock is overwritten
   (`withCopy`; `root.test.ts` and `wrappers.test.ts`, seen to fail before), and Settings overwrites what it holds when it lets it go or goes. The
   last is **checked** only, with no test, and bytes that arrive after the screen has gone are still not overwritten.

10. **Low. Tabs do not behave as written.** A new tab opened beside an unlocked one opens without asking (**reproduced**), where §9.2 says a new tab
    asks: it does only when no tab is unlocked. And each tab times its own use, so one left hidden, or unused, locks the tab being used
    (**reproduced** in the keyring: after 66 seconds and after 306). The second errs toward locking. _Open. Fix:_ say which is meant, and share the
    time of last use between tabs.
11. **Low. Two statements in the documents are wrong.** §9.3 and `wrappers.ts` give the passkey's PRF salt as `wallet/v1/unlock`; the code and the
    specification use `wallet/v2/unlock`. §9.2 says a hosted wallet also has core's lock, which closes the app key; Wallet's side of that lock is not
    built (RFC 0001). _Open._

## Known and accepted, still true

- A server that serves altered JavaScript can take a key once the wallet is open (§8.6; 0002, 3).
- A weak password can be guessed offline by whoever copies the database (RFC 0001).
- A lock keeps the suite's key until sign-out, so script in the signed-in browser, or a copy of its profile with the session (finding 5), could open
  the wallet (RFC 0001, amendment 3; §9.1). Finding 2 was a way to the same key that the decision did not name.
- The upgrade to 0.7.0 deletes every entry made before it, and 0.1.1 has no export (the changelog says so).
- A tombstone no longer keeps any key (0002, 4); tombstones and applied mutations are still not pruned (task 4.11).
- Not built: changing the password in the app, rotating the root (3.10) and resetting a wallet (3.11), so an account with neither kit nor open device
  is stuck.

## Next

Take `ui` 0.107.4 for finding 3 before publishing, and give findings 4 to 11 a task or a reason. Then check passkeys and the locks on real phones
(task 3.17), try the hosted release against a real core, and have the format and the keyring reviewed by someone outside the project (task 20.8).
