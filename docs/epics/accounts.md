# Epic 2: Accounts and devices

## Status

📋 Planned.

## Overview

People sign in with Wallet's own accounts when it runs alone, or through a Sovereign core when it is hosted, one way per instance (2.8); core's notices are honoured; Wallet keeps its own profile; one routine
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

**Done as:** Tusk's `genericOAuth` provider and fake Sovereign, with `WALLET_CORE_*` and the scopes `openid profile email`. `e2e/sovereign.spec.ts` signs a person in through the fake core on an instance that takes only Sovereign; **signing in never opens a wallet**, and the next screen is setup. (Both ways on at once, in "Accepts when", is superseded by 2.8: an instance signs people in one way.)

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

**Technical:** `device` rows (device-made id, the session, a label sealed under a key derived from the root, times); registered at the first sync after unlocking;
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

#### ✅ 2.8 — One way in per instance

**Goal:** an instance signs people in one way: through its Sovereign core when it is hosted (suite mode), with Wallet's own accounts when it runs alone
(standalone mode), never both. **Design:** §25.1, §28. **Depends on:** 2.1, 2.2, 2.5.

**Technical:** `WALLET_CORE_*` set is suite mode, and `WALLET_AUTH_LOCAL` is then ignored, with one start-up warning that names what to remove; in suite mode the
proxy sends `/sign-in` and `/sign-up` (asking for `prompt=create`) to core, a page shows a failure at core or an unreachable core with _Try again_, and the
local routes answer 404; the standalone sign-in form has no Sovereign button; deleting the account is core's in suite mode (the route says where core is and
refuses a deletion) and needs the password alone; Settings > Account links to core's pages. `@sovereignfs/auth` 0.7.0 and `@sovereignfs/sdk` 2.12.0.

**Accepts when:** an instance set up both ways starts in suite mode and says so once; in suite mode a visitor to `/sign-in` or `/sign-up` is redirected to
core at once, `/forgot-password` and the password routes are 404, and the account cannot be deleted from Wallet; alone, nothing changes but the missing button.

**Done as:** taken from Shopper (its 0.4.0: the "one way in" and "Create an account opens core's sign-up" commits, its DESIGN §15.1 and §19), without its
invitations, and keeping Wallet's `closed` sign-up default: `src/auth/suite.ts` and `suite-page.tsx`, `localIgnored` in `src/auth/config.ts` and
`src/config/edge.ts`, the redirect in `proxy.ts`, an unreachable core in `app/api/auth/[...all]/route.ts`, `src/auth/core-links.ts`. **Different from
Shopper:** the delete route itself refuses in suite mode (Shopper's still accepts a session made in the last ten minutes, which proves nothing), and the
test for it is new. Left out: `coreSignedInAt` (nothing in Wallet asks for a recent sign-in now), core's picture of the person, and an end-to-end instance set
up both ways (the config, proxy and route tests cover it, and the built server was started both ways by hand). `scripts/deploy-check.sh sovereign` was
changed, and run on the built image with the rest of the script (all five setups, 2026-11-25). It also closes the gap `src/auth/sovereign.test.ts` kept as an expected failure: the SDK did not check the signature of core's ID token before 2.11.1.

#### ✅ 2.9 — An operator's reset link

**Goal:** an operator gives an account back when mail cannot: a password that did not move in time (the 90-day move of 0.4.0), or an instance with no mail.
**Design:** §25.1, §6. **Depends on:** 2.1, 2.8.

**Technical:** `wallet-admin accounts reset-link EMAIL` (`src/admin/`), the package's `resetLink` through `createAuth` and `openAuthStore`, run as
`docker compose exec web node tools/wallet-admin.mjs …`; one file bundled by `scripts/build-tools.mjs` and copied to `/app/tools`; and **using a reset link needs no mail** (the page and
`/api/auth/reset-password`; only the routes that send stay mail-only, which is the package's own split).

**Accepts when:** the link is the only thing on the standard output and neither it nor the address is anywhere else the tool says; it works once, for an hour, and ends every
session; an address with no account exits 1 and makes nothing; suite mode and sign-in off refuse; with no mail the reset page is there and `/forgot-password` is not.

**Done as:** taken from the suite: core's `sovereign-admin accounts reset-link` (its shape, its output rules, its `docker exec`) and Tusk's `scripts/build-tools.mjs` into `tools/`, which
Wallet's ignore files already reserved; esbuild was already a dev dependency. `src/admin/{args,run,main}.ts` (the first two are pure and tested without a process; `bundle.test.ts` builds
the bundle and runs it), the build stage and `COPY` of the Dockerfile, checks in `scripts/deploy-check.sh` for every setup, and the gate's change in `src/auth/mail-routes.ts`
and `app/reset-password/page.tsx`. **Different from core's:** a smaller command (one subcommand), run with `node tools/wallet-admin.mjs` as Tusk's tool is and not by a wrapper in
`PATH`, and it never says the address. Left out: an end-to-end test in the browser (the integration test uses the package's call, and the bundle was tried by hand on a built server);
the image was built and `scripts/deploy-check.sh` run on it in all five setups on 2026-11-25, which also found, and the same change removed, an intermittent failure in the script itself (a
`grep -q` fed by a pipe under `pipefail`). An upstream gap is recorded as finding 11 of
`docs/research/0003-security-review-0.5.0.md`: a reset does not clear the package's legacy-password mark.
