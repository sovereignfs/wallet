# Changelog

All notable changes to Wallet are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Each version's section is also its GitHub release notes. It is written in the change that sets the version, dated that day, and a promotion
titled `Release vX.Y.Z` is refused without it (RELEASING.md).

## [0.5.2] - 2026-11-25

**Before upgrading:** nothing to do. One thing to know, which the 0.4.0 notes below now say too: **a password stored before 0.4.0 that has not moved within 90 days of
the upgrade can be given back only by mail**, so an instance with no mail should have everyone sign in by then. Wallet has no command yet for an operator to
make that link.

### Fixed

- **The sign-in's salt is read from the database once, not twice for every request.** It is the document every sign-in and sign-up page reads first, and anyone may
  ask for it. The instance's vault id never changes and is kept; "no password can move" is believed for a minute; "a password can still move" is never kept, so a
  page never sends a password it need not.

### Changed

- **The notes and the design say what the move of an old password does.** For 90 days after the upgrade to 0.4.0, a password an earlier Wallet stored is sent
  itself, once, over https, to move it, when a sign-in with the value derived from it does not open the account and a password can still move. The 0.4.0 notes said
  the password never reaches the server, and promised an operator a link to give a password back; they are corrected.

## [0.5.1] - 2026-11-25

**Before upgrading:** nothing changes unless you set the new `WALLET_AUTH_TRUSTED_PROXIES`, which is optional and needs no change to the compose files or the
image. **Set it if your reverse proxy adds to the `X-Forwarded-For` header instead of replacing it**, or if you cannot tell which it does: without it, Wallet
believes a header with one address only, and counts a client whose header has more with every other client like it. `deploy/README.md` says what to look for
and how to test it.

### Added

- `WALLET_AUTH_TRUSTED_PROXIES`: the reverse proxies in front of Wallet, as IP addresses or ranges (`10.0.0.0/8`), separated by commas. The sign-in's limit, and
  the limits on Sovereign's notices and export, tell one client from another by the address in `X-Forwarded-For`; with the proxies named, the client is the first
  address from the right that is not one of them, and nothing a client writes to the left of that changes who it is. A wrong entry stops Wallet at start-up,
  naming its place in the list and never what it says.

### Fixed

- **A closed sign-up no longer says which addresses have an account.** On an instance with sign-up closed (the default) and no mail, signing up with an address
  that had an account was answered "User already exists", and with one that had none, "Sign-up is closed". Both get the second answer now. An instance open to
  anyone with no mail still has to say an address is taken, to sign the person in at once.
- **Sovereign's export request is guarded.** A body over 16 KB is refused unread, and a caller is limited to 20 requests a minute. It answers on one SDK client for
  the whole process instead of making one for each request, so core's discovery document is fetched once and not for every request, and a request answered
  once is refused the second time even after a restart or by another process, not only by the one that answered it.
- **Sovereign's notices are counted for each caller, not all callers together.** Their limit of 300 a minute was one count for everyone, so anyone who could
  reach the routes could use it up and have Sovereign's own notices (a person's sessions ended, an account deleted) refused.
- The sign-in's limit tells clients apart behind a proxy that adds to `X-Forwarded-For` (see `WALLET_AUTH_TRUSTED_PROXIES` above).

## [0.5.0] - 2026-11-24

**Before upgrading:** an instance now signs people in one way. If yours is set up both ways (`WALLET_CORE_*` and `WALLET_AUTH_LOCAL=1`), it now signs
people in through Sovereign only, and says once at start-up which settings to remove (`WALLET_AUTH_LOCAL`, `WALLET_AUTH_SIGNUP` and
`WALLET_AUTH_PASSWORD_MIN_LENGTH`, whichever you set). **Accounts that only have a password can no longer sign in there**, and a person whose address is the
same as one of them is told to ask whoever runs the instance: their wallets are still on the server, and sign-in comes back if you take `WALLET_CORE_*` out
again. To make the people of such an instance sign in through Sovereign, they need accounts there. The new Create an account link (`/sign-up`) asks
Sovereign for its sign-up page, which needs **Sovereign 0.140.0 or later**; on an older one it shows Sovereign's sign-in page, which has no way to make an
account. The manifest still asks only for Sovereign 0.126.0.

### Changed

- **An instance signs people in one way, never both**: through its Sovereign instance when it is hosted, and with Wallet's own accounts (a password,
  passkeys, an authenticator app) when it runs alone. Hosted, `/sign-in` and `/sign-up` send the browser to Sovereign at once, there is no password, sign-up,
  reset, passkey or authenticator app to find, and the front page says "Sign in with Sovereign". If Sovereign cannot be reached, the sign-in page says so and
  offers to try again; any other failure there is shown once, with the same offer, and never sends the person round again. Alone, nothing changes except
  that the sign-in form no longer has a Sovereign button.
- **Hosted, deleting the account is Sovereign's.** Settings > Account links to Sovereign's page for it, and Wallet deletes everything of the person when
  Sovereign tells it the account is gone, as before. Wallet no longer deletes an account on the strength of a Sovereign session made in the last ten
  minutes, and its address for deleting refuses it. Deleting only a hosted person's Wallet data, and keeping their Sovereign account, is not offered. Alone,
  the password is still asked for.
- Settings > Account links to Sovereign's profile and security pages for a person who signs in there.
- `@sovereignfs/auth` 0.7.0 and `@sovereignfs/sdk` 2.12.0.

### Fixed

- **Signing in through Sovereign checks the signature of the ID token** that Sovereign's token endpoint returns, which the SDK did not do before 2.11.1:
  someone able to answer for that endpoint could sign a person in as anyone.
- **A Sovereign session made a moment ago no longer stands in for a password** when deleting an account (above). It proved only that Sovereign's own session was
  alive, and opening a new one there is silent while it is.

## [0.4.0] - 2026-11-23

**Before upgrading:** take a backup. Every session open at the upgrade ends, and each person signs in once more, and that sign-in moves their password across
(see below); **one who does not sign in within 90 days can be given a new password only by mail**, so an instance with no mail should have everyone sign in by
then. The move of the sign-in's tables
happens by itself at the first start and cannot be undone: an older Wallet cannot read them after it. `WALLET_CORE_URL` is the instance's own address
with no path (`https://sovereign.example.com`); one ending in `/api/auth` now stops Wallet at start, naming the variable. The core it is registered
with must let it come back to `/sign-in` after signing out (the manifest's `postLogout`).

### Changed

- **Sign-in is the suite's `@sovereignfs/auth`**, not better-auth configured by hand: the same rules as Sovereign itself and every app, and its
  tables. **The password does not reach the server any more**: the page sends a value it derives from it. The one exception is a password stored by an
  earlier Wallet, which moves across at its next sign-in, for 90 days after the upgrade: the page then sends it itself, once, over https, to move it. After
  that, it is reset by mail. (Wallet has no command yet for an operator to make that link, which an instance with no mail would need.)
- The sign-in, sign-up and new-password pages are the design system's forms. A password's length is checked on the page.
- **Signing in through Sovereign** follows the person's Sovereign session: an hour after it was last checked, it is checked again on the next page,
  and ends if they have signed out there. Signing out of it goes through Sovereign, which decides whether it signs them out there too. A notice from
  Sovereign that one of its sessions ended ends only the sessions that came from it.
- `WALLET_AUTH_SIGNUP` is for Wallet's own accounts: whoever Sovereign signs in gets an account, closed or not.
- Linking a Sovereign account to an account with a password asks for the password first; the Sovereign account may have another address, as long
  as no other account here has it. Unlinking is no longer offered: there was no page for it.
- Signing in with an address not yet confirmed no longer sends another link by itself; the sign-in page offers **Send the link again**.
- A sign-up refused because sign-up is closed is answered with 422, the package's answer, rather than 403.
- Turning the authenticator app on needs a confirmed address, which without mail no account has: on an instance with no mail it can no longer be
  turned on. One already on stays on.

## [0.3.0] - 2026-11-22

### Added

- Core's export of a person now holds their wallet: Sovereign's "Your data" download includes their vault and every card, sealed as the server holds them, so that it opens only with their wallet key or recovery key. Needs core 0.126.0 or later, which the manifest now asks for.

### Changed

- The service worker, the web manifest and the worker's registration are the suite's, from `@sovereignfs/pwa`. A new version of Wallet is announced with a Reload button instead of waiting for every window to close. With no connection, every page opens the wallet from the device, and an address that is not the wallet's says it needs a connection; before a first visit has kept the wallet, the suite's offline page says so. No entry, decrypted or not, is ever kept in a cache.
- On the suite's current packages: `@sovereignfs/sdk` 2.11.0, `@sovereignfs/ui` 0.105.0, `@sovereignfs/manifest` 0.4.0 (manifest 5) and `@sovereignfs/create` 0.27.1, whose shared rules are now in `AGENTS.md` and `CONTRIBUTING.md`. Wallet keeps its own `Dockerfile`, `.dockerignore` and Compose setups, for its three databases.

- 2026-11-18

### Added

- Opened from Sovereign's launcher, or from any link to it, an installed Wallet now opens as itself on desktop Chrome and Edge and on Android Chrome, on the page the link names, rather than in a browser view. On an iPhone, an iPad and in Safari the link opens a browser view, as before.

## [0.1.1] - 2026-11-15

### Fixed

- The release's own checks pass on the commit they release. 0.1.0 was tagged but never published, because two tests failed only there; this is the same app as 0.1.0 and the first published release.

## [0.1.0] - 2026-11-14

### Added

- Sign in to Wallet with your Sovereign instance, or with an email and password, a passkey and an authenticator app where the operator turns local sign-in on. Signing in never opens your wallet: that needs a key of your own.
- A wallet locked in your browser. Setup makes your **wallet key** here (the server never sees it), has you save it and prove you did, offers a printed **recovery key**, and sets up a passkey (Face ID, a fingerprint, Windows Hello) or a passcode to unlock this device with no connection. The server stores only scrambled bytes it cannot open, and nobody can recover a wallet whose keys are lost.
- Cards with QR codes: add one by pointing the camera at its code, choosing a picture of it, or typing what it says; see them in their colours; mark favourites and archive; edit and delete with ten seconds of Undo; show a code full screen on white with the screen kept awake.
- It works offline: what is on the device opens, is added to and is edited with no connection, and goes to your other devices when the connection returns. Two edits of one card on two devices are merged field by field, and your value is kept when both changed one field, with Undo.
- The wallet locks after a time without use (1, 5, 15 or 60 minutes), when hidden, by hand and at sign-out, in every tab at once. Settings has the lock timers, the ways this device unlocks, what could not be sent, and deleting your account.
- An installable app with its own icons, an offline shell, and the Cards and Add a card shortcuts.
- The formats are written down, with test vectors, in `docs/specs/` (the vault and the sync protocol), and a security review is in `docs/research/`.
- One image on port 3006, three setups (an sqld service, a SQLite file, PostgreSQL), and `pnpm seed` for development.

[0.3.0]: https://github.com/sovereignfs/wallet/compare/v0.1.1...v0.3.0
[0.2.0]: https://github.com/sovereignfs/wallet/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/sovereignfs/wallet/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sovereignfs/wallet/releases/tag/v0.1.0
