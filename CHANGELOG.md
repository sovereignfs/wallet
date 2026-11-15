# Changelog

All notable changes to Wallet are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Each release's section is also its GitHub release notes: the release workflow reads this file when a release is cut. Write the notes under
`## [Unreleased]` as you go; a release turns them into the version's section.

## [Unreleased]

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

[Unreleased]: https://github.com/sovereignfs/wallet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sovereignfs/wallet/releases/tag/v0.1.0
