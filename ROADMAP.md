# Roadmap

The order of work. **This file tracks progress; it does not define behaviour.** [`DESIGN.md`](DESIGN.md) says what Wallet does, and where it disagrees
with this file, this file is stale and should be corrected. The detail of every task, with its technical notes and what makes it done, is in
[`docs/epics/`](docs/epics/). How a task is run is in [`AGENTS.md`](AGENTS.md).

State as of 2026-11-15: **0.1.0 is built, as a cut of phase 1 (below), and tagged `v0.1.0`, but its checks failed on the tagged commit and it was never published; the same app goes out as 0.1.1 (see 20.4).** The developer assigns each task; the first row not done, with its
dependencies met, is what the order recommends.

_Status key: ✅ Done · ⏳ In progress · 📋 Planned · ⏭ Planned, after 0.1.0 · 🚧 Waits on a decision or an input · ➖ Superseded_

## The 0.1.0 cut

On 2026-11-13 the owner cut 0.1.0 down to **a solid foundation with sign-in through Sovereign, the whole encryption design, and QR cards**; "improve
everything else later". Phase 1 as `DESIGN.md` §2 describes it is still the plan, and it now ships over more than one release.

**In 0.1.0:** Milestone A whole; sign-in, local and through core, core's notices and deleting a person (2.1, 2.2, 2.3, 2.5, 2.7); the vault whole but
rotation and reset (3.1–3.8), the lock and setup screens (9.1, 9.2); entries on the server, the sync endpoint, the device store, the outbox and loop,
merging, files' format only (3.2) and the browser's storage (4.1–4.5, 4.10); the shell, Home and Settings, trimmed to what exists (9.3, 9.4); **QR
cards** (6.1–6.5, the `format` kept in the card so other formats need no migration); the seed, the review, the documents and the release (20.1–20.4).

**⏭ After 0.1.0 (still planned):** family members (5.1, 5.2; every entry is "Me"), files and card photos (4.6, 6.6), the other two tiers and moving
between them (4.7, 4.8, 4.9), devices (2.6), the profile (2.4), pruning (4.11), documents and Due (epic 7, 21.2), every backup (epic 8), notices and mail
(epic 10), changing and rotating keys and resetting (3.9–3.12), the phone's extras and where-it-lives controls (9.5, 9.6), a step flow and passcode
input from the design system (21.3: setup uses what `@sovereignfs/ui` has today) and hosting (20.5). In 0.1.0 the server accepts only the `synced` tier
and says `tier_unavailable` to the others; files are refused until 4.6. Version numbers of later releases, and the "(0.2.0)" labels on later phases
below, are assigned when each is cut.

_Priority:_ **P0** nothing else can stand without it · **P1** the product · **P2** needed before the phase's release · **P3** can follow the release
if it must

## How this is ordered

Four phases, each a release (`DESIGN.md` §2): **cards and documents, the MVP** (0.1.0), **health** (0.2.0), **out into the world** (0.3.0), **sharing
and native** (0.4.0+, in outline). Within phase 1, Tusk's order (building-an-app §14): conventions, configuration, database, sign-in, the shell, then
the product, then the image and the release. Within the product:

1. **The vault before any table of the product** (B). No entry is ever written readable, not even in a first draft, and the format's specification and
   test vectors exist from the start, for a native app later.
2. **Storage, tiers and sync before the screens** (C), because the screens read the device's store and the in-memory index: building them on server
   reads first would mean building them twice. This is Tusk's and Tally's order.
3. **The shell, then cards, then documents** (D–F). Cards are the daily use and prove the whole path (seal, store, sync, show offline); documents add
   pages and files at size, and Due.
4. **Backups, the rest of the keys, notices and core** (G), then the release. Sign-in through core is P0 but comes late, as in Tusk, Ledger, Tally and
   Roam: nothing before it depends on it.

Phase 2 builds measurements and lab reports first (I), the rest of the health record (J), then the journal and the printed reports that draw on all of
it (K). Phase 3 builds the business card before the passes and tags that carry it (M), then the smaller kinds (N), then share links and push (O).
Phase 4 is detailed when phase 3 is released.

**Epic 21 is work in `sovereign`**, tracked here because Wallet waits on it: a step flow and passcode input (setup), a document viewer (shared with
Roam), a line chart (shared with Tally), a rating scale, the port, and a VAPID key. Each is started early enough to be released before the task that
needs it.

## Phase 1 — Cards and documents, the MVP (0.1.0)

### Milestone A — Foundation

The repository can hold the app. **Done when** an empty database boots on all three forms from the image, the PWA installs, and CI proves it.

| #   | ID                               | Task                             | Priority | Depends on | Status |
| --- | -------------------------------- | -------------------------------- | -------- | ---------- | ------ |
| 1   | [1.1](docs/epics/foundation.md)  | Repository conventions           | P0       | —          | ✅     |
| 2   | [1.2](docs/epics/foundation.md)  | Format, lint and test tooling    | P0       | 1.1        | ✅     |
| 3   | [1.3](docs/epics/foundation.md)  | Continuous integration           | P0       | 1.2        | ✅     |
| 4   | [1.4](docs/epics/foundation.md)  | Configuration and start-up       | P0       | 1.2        | ✅     |
| 5   | [1.5](docs/epics/foundation.md)  | The database layer               | P0       | 1.4        | ✅     |
| 6   | [1.8](docs/epics/foundation.md)  | Design system boundary and shell | P0       | 1.2        | ✅     |
| 7   | [1.7](docs/epics/foundation.md)  | Security headers                 | P0       | 1.4        | ✅     |
| 8   | [1.6](docs/epics/foundation.md)  | The job runner                   | P0       | 1.5        | ✅     |
| 9   | [1.9](docs/epics/foundation.md)  | Browser tests                    | P0       | 1.5        | ✅     |
| 10  | [1.10](docs/epics/foundation.md) | The image and deployment setups  | P0       | 1.5, 1.6   | ✅     |
| 11  | [1.11](docs/epics/foundation.md) | The PWA                          | P0       | 1.8        | ✅     |

### Milestone B — Accounts and the vault

A person signs in, creates or imports a key, and unlocks with a passkey or passcode. **Done when** setup runs end to end in Playwright, and a raw dump
of the database and the browser's storage holds nothing readable.

| #   | ID                             | Task                                 | Priority | Depends on         | Status |
| --- | ------------------------------ | ------------------------------------ | -------- | ------------------ | ------ |
| 12  | [2.1](docs/epics/accounts.md)  | Local sign-in                        | P0       | 1.5, 1.8           | ✅     |
| 13  | [3.3](docs/epics/vault.md)     | The server's key                     | P0       | 1.5                | ✅     |
| 14  | [2.4](docs/epics/accounts.md)  | The profile                          | P1       | 2.1, 3.3           | ⏭      |
| 15  | [2.5](docs/epics/accounts.md)  | Deleting a person                    | P0       | 2.1                | ✅     |
| 16  | [3.1](docs/epics/vault.md)     | The vault format                     | P0       | 1.2                | ✅     |
| 17  | [3.2](docs/epics/vault.md)     | File encryption                      | P0       | 3.1                | ✅     |
| 18  | [3.4](docs/epics/vault.md)     | Creating or importing the wallet key | P0       | 3.1, 2.1           | ✅     |
| 19  | [3.5](docs/epics/vault.md)     | The recovery key                     | P1       | 3.4                | ✅     |
| 20  | [3.6](docs/epics/vault.md)     | The keyring and locking              | P0       | 3.4                | ✅     |
| 21  | [3.7](docs/epics/vault.md)     | Unlocking with a passkey             | P1       | 3.6                | ✅     |
| 22  | [3.8](docs/epics/vault.md)     | Unlocking with a device passcode     | P1       | 3.6                | ✅     |
| 23  | [21.3](docs/epics/upstream.md) | A passcode input and a step flow     | P1       | —                  | ⏭      |
| 24  | [9.2](docs/epics/screens.md)   | The lock screen                      | P0       | 3.6                | ✅     |
| 25  | [9.1](docs/epics/screens.md)   | Setup                                | P0       | 3.4, 3.5, 3.7, 3.8 | ✅     |

### Milestone C — Storage and sync

Entries are written offline, sealed, synced, merged and moved between tiers. **Done when** an entry written offline on one browser appears on another,
each tier behaves as `DESIGN.md` §10.2 says, and a wiped browser's entries show as lost.

| #   | ID                            | Task                                 | Priority | Depends on    | Status |
| --- | ----------------------------- | ------------------------------------ | -------- | ------------- | ------ |
| 26  | [4.1](docs/epics/sync.md)     | Entries and files on the server      | P0       | 3.3, 1.5      | ✅     |
| 27  | [4.2](docs/epics/sync.md)     | The sync endpoint                    | P0       | 4.1           | ✅     |
| 28  | [4.3](docs/epics/sync.md)     | The device store and in-memory index | P0       | 3.6           | ✅     |
| 29  | [4.4](docs/epics/sync.md)     | The outbox and the sync loop         | P0       | 4.2, 4.3      | ✅     |
| 30  | [4.5](docs/epics/sync.md)     | Merging a stale edit                 | P1       | 4.4           | ✅     |
| 31  | [4.6](docs/epics/sync.md)     | Files                                | P0       | 3.2, 4.4, 1.6 | ⏭      |
| 32  | [4.7](docs/epics/sync.md)     | Tiers and moving between them        | P0       | 4.6           | ⏭      |
| 33  | [2.6](docs/epics/accounts.md) | Devices                              | P1       | 4.2, 3.6      | ⏭      |
| 34  | [4.8](docs/epics/sync.md)     | Holders and lost entries             | P1       | 4.7, 2.6      | ⏭      |
| 35  | [4.10](docs/epics/sync.md)    | The browser's storage                | P1       | 4.3           | ✅     |
| 36  | [4.11](docs/epics/sync.md)    | Pruning                              | P2       | 4.2, 1.6      | ⏭      |

### Milestone D — The shell and family

Home, search, Settings and the phone's navigation, with family members. **Done when** every phase 1 screen is reachable at both widths and filtered by
family member.

| #   | ID                            | Task                      | Priority | Depends on | Status |
| --- | ----------------------------- | ------------------------- | -------- | ---------- | ------ |
| 37  | [9.3](docs/epics/screens.md)  | Home and search           | P1       | 4.3        | ✅     |
| 38  | [9.4](docs/epics/screens.md)  | Settings                  | P1       | 9.1        | ✅     |
| 39  | [9.6](docs/epics/screens.md)  | Where it lives, on screen | P1       | 4.7        | ⏭      |
| 40  | [5.1](docs/epics/family.md)   | Family members and Me     | P1       | 4.4        | ⏭      |
| 41  | [5.2](docs/epics/family.md)   | The family switcher       | P1       | 5.1, 9.3   | ⏭      |
| 42  | [9.5](docs/epics/screens.md)  | The phone                 | P1       | 9.3        | ⏭      |
| 43  | [2.7](docs/epics/accounts.md) | The landing page          | P2       | 1.8        | ✅     |

### Milestone E — Cards

**Done when** a card is scanned with the camera, shown full screen offline, and seen on a second device.

| #   | ID                         | Task                 | Priority | Depends on | Status |
| --- | -------------------------- | -------------------- | -------- | ---------- | ------ |
| 44  | [6.1](docs/epics/cards.md) | The card model       | P1       | 4.4, 5.1   | ✅     |
| 45  | [6.2](docs/epics/cards.md) | Drawing codes        | P1       | 6.1        | ✅     |
| 46  | [6.3](docs/epics/cards.md) | Scanning             | P1       | 6.1        | ✅     |
| 47  | [6.4](docs/epics/cards.md) | The card screens     | P1       | 6.2, 9.3   | ✅     |
| 48  | [6.5](docs/epics/cards.md) | Showing a card       | P1       | 6.4        | ✅     |
| 49  | [6.6](docs/epics/cards.md) | Card photos and logo | P1       | 4.6, 6.4   | ⏭      |

### Milestone F — Documents and Due

**Done when** a passport with its pages is added offline, opens on a second device, and its expiry shows in Due.

| #   | ID                             | Task                 | Priority | Depends on    | Status |
| --- | ------------------------------ | -------------------- | -------- | ------------- | ------ |
| 50  | [21.2](docs/epics/upstream.md) | A document viewer    | P1       | —             | ⏭      |
| 51  | [7.1](docs/epics/documents.md) | The document model   | P1       | 4.4, 5.1      | ⏭      |
| 52  | [7.2](docs/epics/documents.md) | Pages and the viewer | P1       | 4.6, 21.2     | ⏭      |
| 53  | [7.3](docs/epics/documents.md) | The document screens | P1       | 7.1, 7.2, 9.3 | ⏭      |
| 54  | [7.4](docs/epics/documents.md) | Due                  | P1       | 6.1, 7.1      | ⏭      |

### Milestone G — Backups, keys, notices and core

**Done when** a backup file restores a lost entry, a git backup holds only ciphertext and opens with the recovery key, fully offline mode leaves the
server no body, and sign-in through core works.

| #   | ID                            | Task                             | Priority | Depends on    | Status |
| --- | ----------------------------- | -------------------------------- | -------- | ------------- | ------ |
| 55  | [8.1](docs/epics/backup.md)   | The backup format                | P0       | 3.1, 3.2      | ⏭      |
| 56  | [8.2](docs/epics/backup.md)   | Backup files                     | P1       | 8.1, 4.6      | ⏭      |
| 57  | [4.9](docs/epics/sync.md)     | Fully offline mode               | P1       | 4.7, 8.2      | ⏭      |
| 58  | [8.7](docs/epics/backup.md)   | Backup reminders                 | P2       | 8.2, 7.4      | ⏭      |
| 59  | [8.3](docs/epics/backup.md)   | The readable export and import   | P2       | 8.2           | ⏭      |
| 60  | [10.1](docs/epics/notices.md) | The bell                         | P1       | 2.4           | ⏭      |
| 61  | [10.2](docs/epics/notices.md) | The mail outbox                  | P1       | 10.1, 1.6     | ⏭      |
| 62  | [8.4](docs/epics/backup.md)   | Connecting a git repository      | P1       | 3.3, 9.4      | ⏭      |
| 63  | [8.5](docs/epics/backup.md)   | The git backup job               | P1       | 8.4, 8.1, 1.6 | ⏭      |
| 64  | [8.6](docs/epics/backup.md)   | Restoring from git               | P1       | 8.5, 8.2      | ⏭      |
| 65  | [3.9](docs/epics/vault.md)    | Changing keys                    | P2       | 3.5           | ⏭      |
| 66  | [3.11](docs/epics/vault.md)   | Resetting a wallet               | P2       | 3.4, 4.1      | ⏭      |
| 67  | [3.10](docs/epics/vault.md)   | Rotating everything              | P2       | 3.9, 4.7      | ⏭      |
| 68  | [2.2](docs/epics/accounts.md) | Sign-in through core             | P0       | 2.1           | ✅     |
| 69  | [2.3](docs/epics/accounts.md) | Core's notices                   | P0       | 2.2, 2.5      | ✅     |
| 70  | [10.3](docs/epics/notices.md) | Core's services                  | P2       | 10.2, 2.2     | ⏭      |
| 71  | [3.12](docs/epics/vault.md)   | One prompt to sign in and unlock | P3       | 3.7, 2.1      | ⏭      |

### Milestone H — Release 0.1.0

| #   | ID                             | Task                         | Priority | Depends on               | Status |
| --- | ------------------------------ | ---------------------------- | -------- | ------------------------ | ------ |
| 72  | [21.5](docs/epics/upstream.md) | Port 3006                    | P2       | —                        | 📋     |
| 73  | [20.1](docs/epics/release.md)  | The seed                     | P1       | 6.1, 7.1, 5.1            | ✅     |
| 74  | [20.3](docs/epics/release.md)  | The documents                | P2       | 1.10                     | ✅     |
| 75  | [20.2](docs/epics/release.md)  | Security review before 0.1.0 | P2       | every phase 1 task above | ✅     |
| 76  | [20.4](docs/epics/release.md)  | Release 0.1.0                | P2       | 20.2, 20.3               | ⏳     |
| 77  | [20.5](docs/epics/release.md)  | Hosting on the instance      | P2       | 20.4                     | ⏭      |

## Phase 2 — Health (0.2.0)

### Milestone I — Measurements and lab reports

**Done when** a year of weights charts with BMI, and a test entered in two units across reports trends in one.

| #   | ID                             | Task                               | Priority | Depends on      | Status |
| --- | ------------------------------ | ---------------------------------- | -------- | --------------- | ------ |
| 78  | [21.1](docs/epics/upstream.md) | A line chart with a reference band | P1       | —               | 📋     |
| 79  | [11.1](docs/epics/health.md)   | Units                              | P1       | 4.4             | 📋     |
| 80  | [11.2](docs/epics/health.md)   | Measurements                       | P1       | 11.1, 5.1       | 📋     |
| 81  | [11.3](docs/epics/health.md)   | BMI                                | P1       | 11.2            | 📋     |
| 82  | [11.4](docs/epics/health.md)   | Measurement screens and charts     | P1       | 11.3, 21.1      | 📋     |
| 83  | [11.5](docs/epics/health.md)   | The test catalogue                 | P1       | 4.4             | 🚧     |
| 84  | [11.6](docs/epics/health.md)   | Lab reports                        | P1       | 11.5, 4.6, 21.2 | 📋     |
| 85  | [11.7](docs/epics/health.md)   | Trends per test                    | P1       | 11.6, 21.1      | 📋     |

11.5 can be built now; it is marked 🚧 because the catalogue's medical review (`DESIGN.md` §33) must happen before 0.2.0.

### Milestone J — The health record

| #   | ID                            | Task                                                  | Priority | Depends on | Status |
| --- | ----------------------------- | ----------------------------------------------------- | -------- | ---------- | ------ |
| 86  | [11.8](docs/epics/health.md)  | The medical ID, allergies, conditions and medications | P1       | 5.1        | 📋     |
| 87  | [11.9](docs/epics/health.md)  | Vaccinations                                          | P2       | 11.8       | 📋     |
| 88  | [11.10](docs/epics/health.md) | Measurement reminders in Due                          | P2       | 11.2, 7.4  | 📋     |

### Milestone K — The journal and the reports

**Done when** a doctor's report for three months prints with journal, measurements and labs, and a medical summary prints for a family member.

| #   | ID                             | Task                | Priority | Depends on             | Status |
| --- | ------------------------------ | ------------------- | -------- | ---------------------- | ------ |
| 89  | [21.4](docs/epics/upstream.md) | A rating scale      | P1       | —                      | 📋     |
| 90  | [12.1](docs/epics/journal.md)  | The journal model   | P1       | 4.4, 5.1               | 📋     |
| 91  | [12.2](docs/epics/journal.md)  | The journal screens | P1       | 12.1, 21.4             | 📋     |
| 92  | [12.3](docs/epics/journal.md)  | The journal charts  | P2       | 12.2, 21.1             | 📋     |
| 93  | [13.1](docs/epics/reports.md)  | The print layer     | P1       | 9.3                    | 📋     |
| 94  | [13.2](docs/epics/reports.md)  | The medical summary | P1       | 13.1, 11.8, 11.9, 11.7 | 📋     |
| 95  | [13.3](docs/epics/reports.md)  | The doctor's report | P1       | 13.1, 12.1, 11.4, 11.7 | 📋     |
| 96  | [13.4](docs/epics/reports.md)  | The share target    | P2       | 1.11, 3.6              | 📋     |

### Milestone L — Release 0.2.0

| #   | ID                            | Task                                      | Priority | Depends on         | Status |
| --- | ----------------------------- | ----------------------------------------- | -------- | ------------------ | ------ |
| 97  | [20.6](docs/epics/release.md) | Review and release 0.2.0                  | P2       | every phase 2 task | 🚧     |
| 98  | [20.8](docs/epics/release.md) | An independent review of the cryptography | P2       | 20.4               | 🚧     |

20.6 waits on the medical review and 20.8 on a reviewer, both the owner's to arrange (`DESIGN.md` §33). 20.8 must be resolved before 1.0, not before
0.2.0.

## Phase 3 — Out into the world (0.3.0)

### Milestone M — The business card, phone wallets and NFC

**Done when** a business card is sent by QR, `.vcf` and the share sheet, written to an NFC tag on Android, and added to Apple and Google Wallet where
configured.

| #   | ID                                   | Task                 | Priority | Depends on     | Status |
| --- | ------------------------------------ | -------------------- | -------- | -------------- | ------ |
| 99  | [14.1](docs/epics/business-cards.md) | The business card    | P1       | 4.6, 9.3       | 📋     |
| 100 | [14.2](docs/epics/business-cards.md) | vCard and QR         | P1       | 14.1           | 📋     |
| 101 | [14.3](docs/epics/business-cards.md) | The share sheet      | P1       | 14.2           | 📋     |
| 102 | [14.5](docs/epics/business-cards.md) | Received contacts    | P2       | 14.2, 6.3      | 📋     |
| 103 | [14.4](docs/epics/business-cards.md) | The public page      | P2       | 14.1, 3.3      | 📋     |
| 104 | [15.1](docs/epics/passes.md)         | Apple Wallet passes  | P2       | 14.2, 6.1, 3.3 | 🚧     |
| 105 | [15.2](docs/epics/passes.md)         | Google Wallet passes | P2       | 14.2, 6.1, 3.3 | 🚧     |
| 106 | [15.3](docs/epics/passes.md)         | NFC tags             | P2       | 14.2, 14.5     | 📋     |

15.1 and 15.2 can be built against test certificates and keys; real-wallet testing waits on the owner's accounts (`DESIGN.md` §33).

### Milestone N — More in the wallet

| #   | ID                         | Task                  | Priority | Depends on | Status |
| --- | -------------------------- | --------------------- | -------- | ---------- | ------ |
| 107 | [16.1](docs/epics/more.md) | Watermarked copies    | P1       | 7.2        | 📋     |
| 108 | [16.4](docs/epics/more.md) | Tickets               | P2       | 6.2, 7.4   | 📋     |
| 109 | [16.2](docs/epics/more.md) | Importing a `.pkpass` | P2       | 6.1, 16.4  | 📋     |
| 110 | [16.3](docs/epics/more.md) | Insurance             | P2       | 4.6, 5.1   | 📋     |
| 111 | [16.5](docs/epics/more.md) | Secure notes          | P3       | 4.4        | 📋     |

### Milestone O — Share links and reminders

**Done when** a doctor's report opens from a link in a fresh browser and expires, and an opt-in reminder arrives while Wallet is closed.

| #   | ID                                | Task                                    | Priority | Depends on       | Status |
| --- | --------------------------------- | --------------------------------------- | -------- | ---------------- | ------ |
| 112 | [17.1](docs/epics/share-links.md) | One-off encrypted links                 | P1       | 3.1, 3.2, 1.6    | 📋     |
| 113 | [17.2](docs/epics/share-links.md) | Sharing a summary, report or document   | P1       | 17.1, 13.2, 13.3 | 📋     |
| 114 | [21.6](docs/epics/upstream.md)    | A VAPID key in `generate`               | P2       | —                | ✅     |
| 115 | [10.4](docs/epics/notices.md)     | Web Push and reminders while closed     | P2       | 10.1, 7.4, 21.6  | 📋     |
| 116 | [21.7](docs/epics/upstream.md)    | Barcode display and scanner (candidate) | P3       | 6.2, 6.3         | 📋     |

### Milestone P — Release 0.3.0

| #   | ID                            | Task                     | Priority | Depends on         | Status |
| --- | ----------------------------- | ------------------------ | -------- | ------------------ | ------ |
| 117 | [20.7](docs/epics/release.md) | Review and release 0.3.0 | P2       | every phase 3 task | 📋     |

## Phase 4 — Sharing and native (0.4.0+), in outline

Detailed when phase 3 is released (`DESIGN.md` §31).

### Milestone Q — Sharing between accounts

| #   | ID                            | Task                          | Priority | Depends on       | Status |
| --- | ----------------------------- | ----------------------------- | -------- | ---------------- | ------ |
| 118 | [18.1](docs/epics/sharing.md) | Recipients and finding people | P1       | phase 3 released | 📋     |
| 119 | [18.2](docs/epics/sharing.md) | Sharing an entry              | P1       | 18.1             | 📋     |
| 120 | [18.3](docs/epics/sharing.md) | A family space                | P2       | 18.2             | 📋     |
| 121 | [18.4](docs/epics/sharing.md) | Revoking and re-keying        | P1       | 18.2             | 📋     |

### Milestone R — Native

| #   | ID                            | Task                           | Priority | Depends on       | Status |
| --- | ----------------------------- | ------------------------------ | -------- | ---------------- | ------ |
| 122 | [19.1](docs/epics/native.md)  | The portable core as a package | P1       | phase 3 released | 📋     |
| 123 | [19.2](docs/epics/native.md)  | A native shell spike           | P1       | 19.1             | 📋     |
| 124 | [19.3](docs/epics/native.md)  | Reading passport chips         | P2       | 19.2             | 📋     |
| 125 | [19.4](docs/epics/native.md)  | Card emulation and Bluetooth   | P3       | 19.2             | 📋     |
| 126 | [20.9](docs/epics/release.md) | Release 0.4.0                  | P2       | epic 18, 19.1    | 📋     |
