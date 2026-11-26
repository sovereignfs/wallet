# Epics

A domain-first map of the work. An epic groups the tasks of one domain. [`ROADMAP.md`](../../ROADMAP.md) is the same tasks in the order they are
built, with their priority and status. [`DESIGN.md`](../../DESIGN.md) is what they build; where a task and the design disagree, the design wins and
the task is corrected.

## Conventions

- **Task IDs are permanent:** `<epic>.<n>`, for example `4.3`. Use them in dependency lists and cross-references. They never appear in branch names,
  commit messages or PR titles, and an ID is never reused, even for a task that was superseded.
- **One task, one branch, one draft PR.** A task is done when its "Accepts when" holds and its PR is merged.
- **Every task** has a Goal, a Design reference, what it Depends on, Technical detail, and Accepts when. Once done it gains **Done as**: how it was
  done, where, and what was left out.
- **On completion,** the task's heading here and its row in `ROADMAP.md` are marked ✅ in the same PR, and a change in behaviour adds a line to
  `CHANGELOG.md`.
- **Every task holds these without saying so:**
  - a data-layer test passes on sqld, a `file:` database and PostgreSQL;
  - a new route, operation or mutation is in `src/access/routes.ts` with a test calling it as a second person;
  - **no entry content reaches the server unsealed:** a new entry kind declares its shape and body fields in `src/core/entries/` (once 3.1 and 4.1 are
    in), and the raw-dump test (3.6) finds none of its seeded values in the database, the files or IndexedDB;
  - a new table is handled by `People.deletePerson` (once 2.5 is in);
  - an entry write goes through the one path, the outbox and `/api/sync` (once 4.4 is in);
  - a screen works with a keyboard, in light and dark, at a phone's width, locked and unlocked, and offline where `DESIGN.md` §11.7 says it does;
  - pure logic lives in `src/core/` with no React, Next.js or DOM beyond WebCrypto;
  - nothing a person typed reaches a log; no request leaves the browser for another origin;
  - a safeguard's test was seen to fail with it switched off.
- **Epic 21 is done in `sovereign`,** following that repository's conventions; its tasks here record what Wallet needs and are marked done when the
  release that carries it is published. Where Tally or Roam needs the same, one build serves all.

_Status key: ✅ Done · ⏳ In progress · 📋 Planned · 🚧 Waits on a decision or an input · ➖ Superseded_

## Epics

| #   | Epic                                             | What it holds                                                                                             | Phase | Tasks |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 1   | [Foundation](foundation.md)                      | Tooling, CI, configuration, the database, jobs, security headers, the shell, the image, the PWA           | 1     | 11    |
| 2   | [Accounts and devices](accounts.md)              | Local and Sovereign sign-in, core's notices, the profile, deleting a person, devices, the landing page    | 1     | 7     |
| 3   | [Keys and the vault](vault.md)                   | The vault format, files, the server's key, creating keys, recovery, the keyring, unlocking, rotation      | 1     | 12    |
| 4   | [Storage and sync](sync.md)                      | Entries on the server, the endpoint, the device store, the outbox, merging, files, tiers, lost, offline   | 1     | 11    |
| 5   | [Family](family.md)                              | Family members and Me, the switcher                                                                       | 1     | 2     |
| 6   | [Cards](cards.md)                                | The model, drawing and scanning codes, the screens, showing a card, photos                                | 1     | 6     |
| 7   | [Documents](documents.md)                        | The model, pages and the viewer, the screens, Due                                                         | 1     | 4     |
| 8   | [Backup and portability](backup.md)              | The backup format, backup files, readable export, git connection, git backup, restore, reminders          | 1     | 7     |
| 9   | [Shell and screens](screens.md)                  | Setup, the lock screen, search, Settings, the phone, where-it-lives controls                              | 1     | 6     |
| 10  | [Notices](notices.md)                            | The bell, the mail outbox, core's services, Web Push and reminders while closed                           | 1, 3  | 4     |
| 11  | [Health](health.md)                              | Units, measurements, BMI, charts, the test catalogue, lab reports, trends, the medical ID and the rest    | 2     | 10    |
| 12  | [Journal](journal.md)                            | The model, the screens, the charts                                                                        | 2     | 3     |
| 13  | [Summaries and reports](reports.md)              | The print layer, the medical summary, the doctor's report, the share target                               | 2     | 4     |
| 14  | [Business cards and contacts](business-cards.md) | The card, vCard and QR, the share sheet, the public page, received contacts                               | 3     | 5     |
| 15  | [Phone wallets and NFC](passes.md)               | Apple Wallet, Google Wallet, NFC tags                                                                     | 3     | 3     |
| 16  | [More in the wallet](more.md)                    | Watermarked copies, `.pkpass` import, insurance, tickets, secure notes                                    | 3     | 5     |
| 17  | [Share links](share-links.md)                    | One-off encrypted links, sharing a summary or report                                                      | 3     | 2     |
| 18  | [Sharing between accounts](sharing.md)           | Recipients and finding people, sharing an entry, a family space, revoking                                 | 4     | 4     |
| 19  | [Native](native.md)                              | The portable core as a package, a shell spike, chip reading and card emulation research                   | 4     | 4     |
| 20  | [Release](release.md)                            | Seed, security reviews, documents, releases, hosting, the independent review                              | 1–4   | 9     |
| 21  | [Upstream, in `sovereign`](upstream.md)          | A line chart, a document viewer, a passcode input and step flow, a rating scale, the port, VAPID, barcode | 1–3   | 7     |
