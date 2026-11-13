# Epic 2: Accounts and devices

## Status

📋 Planned.

## Overview

People sign in locally, through a Sovereign core, or both, exactly as in Tusk; core's notices are honoured; Wallet keeps its own profile; one routine
deletes everything of a person; and every browser is a device the person can see and remove. Signing in never opens the wallet: that is epic 3.

## Related

[`DESIGN.md`](../../DESIGN.md) §6, §11.8, §25, §28 · Tusk's `DESIGN.md` §6, §22

## Tasks

#### ✅ 2.1 — Local sign-in

**Goal:** local accounts with password, passkey and an authenticator app. **Design:** §25.1, §6.2. **Depends on:** 1.5, 1.8.

**Technical:** copy Tusk's `src/auth/` (better-auth in `wallet_auth`, the `Auth` screens, `WALLET_AUTH_LOCAL`, sign-up policy `WALLET_AUTH_SIGNUP`
with `closed` as default when local is on, verification and reset only with mail); sessions with Tusk's lifetime; `/sign-in`, `/sign-up` answering 404
when local is off.

**Accepts when:** the first account can sign up and a second cannot under `closed`; passkey and TOTP sign-in work in Playwright; with local off the
pages answer 404.

**Done as:** `src/auth/`, copied from Tusk (better-auth, passkeys, an authenticator app, the screens, `WALLET_AUTH_LOCAL`, `WALLET_AUTH_SIGNUP` closed by default with local sign-in, mail only with `WALLET_SMTP_*`); `/sign-in` and `/sign-up` are a real 404 when local is off. 381 of Tusk's tests, renamed, pass.

#### ✅ 2.2 — Sign-in through core

**Goal:** a Sovereign core as a way in, with PKCE. **Design:** §25.1. **Depends on:** 2.1.

**Technical:** Tusk's `genericOAuth` provider and fake Sovereign; `WALLET_CORE_*`; scopes `openid profile email`; linking from a signed-in session
only; core's sign-in always gets an account.

**Accepts when:** sign-in against the fake Sovereign makes an account; an email match never links an account; both ways on at once work.

**Done as:** Tusk's `genericOAuth` provider and fake Sovereign, with `WALLET_CORE_*` and the scopes `openid profile email`. `e2e/sovereign.spec.ts` signs a person in through the fake core on an instance that takes only Sovereign; **signing in never opens a wallet**, and the next screen is setup.

#### ✅ 2.3 — Core's notices

**Goal:** back-channel logout and account deletion honoured. **Design:** §25.2. **Depends on:** 2.2, 2.5.

**Technical:** copy Tusk's routes and `notice_seen`; logout ends the session (the browser locks and keeps its store, §11.8); account deleted runs
`People.deletePerson` and answers `200` only after.

**Accepts when:** a replayed notice is refused after a restart; a deletion notice leaves nothing of the person (2.5's test) before `200`.

**Done as:** Tusk's back-channel logout and account-deleted routes, with replay refusal; `e2e/sovereign.spec.ts` shows a forged notice and a logout token refused, and a real deletion notice answered 200 and the session gone.

#### 📋 2.4 — The profile

**Goal:** Wallet's own copy of name and email. **Design:** §6.1. **Depends on:** 2.1, 3.3.

**Technical:** `profile`, made with the account (both ways in), name and email sealed under the server's key; Settings > Profile edits them; the
avatar's initials.

**Accepts when:** a raw read of `profile` shows no name or email; editing the name updates the avatar.

#### ✅ 2.5 — Deleting a person

**Goal:** one routine removes everything of an account. **Design:** §28. **Depends on:** 2.1.

**Technical:** `src/sovereign/people.ts` `People.deletePerson` (Tusk's shape), safe to run twice, the `sub` link last; the files under
`/data/blobs/<account id>` removed; a seeded test with one row of every table for the person and a second person; **Settings > Account > Delete**
after the password or a fresh session and typing "delete", saying git backups stay; the browser erases its store.

**Accepts when:** after deletion nothing of the first person remains, rows or files, and the second is intact; a table added without handling fails
the test.

**Done as:** `src/sovereign/people.ts`, `People.deletePerson`: entries, applied mutations, the vault, the stream counter, credentials, rate counters, then better-auth's rows, the account last; twice without harm. `people.test.ts` fails for a table nobody decided about. Settings, Account deletes after the password (or a fresh session) and typing "delete", and erases this device's store. **Files under `/data/blobs` are not removed because there are none yet (4.6).**

#### 📋 2.6 — Devices

**Goal:** every browser a device the person sees, names and removes. **Design:** §6.3, §11.8. **Depends on:** 4.2, 3.6.

**Technical:** `device` rows (device-made id, the session, a label sealed under the vault key, times); registered at the first sync after unlocking;
`last_seen_at` on each sync; Settings > Security lists them with this device marked; rename; **remove** (ends the session, marks its device-only
entries lost, 4.8); a removed device's requests refused; the **new device** notice (10.1); "Is this the same device?" on a new device whose label
matches one not seen for a while; **sign-out choices** (keep or erase the store, naming device-only entries and unsent changes).

**Accepts when:** a second browser context appears in the list and raises `new_device`; removing it ends its session; signing out with device-only
entries offers both choices and "erase" empties IndexedDB.

#### ✅ 2.7 — The landing page

**Goal:** what a signed-out visitor sees. **Design:** §26.5. **Depends on:** 1.8.

**Technical:** `/` signed out: what Wallet is, the one-line promise ("Only you can read your wallet"), sign-in and, where allowed, sign-up; no
third-party content.

**Accepts when:** the page renders at both widths in both themes, with no request to another origin.

**Done as:** `src/landing/`: plain sentences, no script, no third-party content, and a test that it promises nothing that is not built and uses none of the words DESIGN.md §4 forbids.
