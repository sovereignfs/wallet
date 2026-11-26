# Wallet — design

**Status:** draft, written on 2026-11-09 from the legacy `sovereign-plugin-wallet` (manifest 0.4.1), Tusk's design (its §8 sync, §9 personal key and
§21 backup), Tally's and Roam's designs, and the owner's direction in planning. Nothing is built. Where this file and a contract Sovereign publishes
disagree, the contract wins (`AGENTS.md`, Source of truth). §33 holds what is still waiting on an input, and §34 what has been decided and why.

[`ROADMAP.md`](ROADMAP.md) puts the work in order, [`docs/epics/`](docs/epics/) holds each task's detail, and
[`docs/research/0001-nfc-bluetooth-and-phone-wallets.md`](docs/research/0001-nfc-bluetooth-and-phone-wallets.md) is what a PWA can and cannot do with
the phone's radios and wallets.

---

## 1. Purpose

Wallet is the private things a person carries: the cards in their pocket, the documents that say who they are, and the record of their health. It
holds **loyalty, transport and membership cards** as scannable codes, **identity documents** (passports, residence permits, ID cards, licences) with
their scans, and **personal health data**: measurements over time with BMI, lab reports with each result tracked from one report to the next, and a
small **journal** of symptoms and mood to take to a doctor. Later it hands out a **business card**, prints a **medical summary**, and adds cards to
the phone's own wallet.

It is an app of the Sovereign suite exactly as Tusk, Tally, Ledger and Roam are: a program of its own, which an instance can host, and which needs no
instance to run.

What it must not give up, whatever the convenience:

- **Encrypted in the browser, under keys that stay there.** Everything is encrypted in the browser under the suite's keys (§7, §8). The server, the
  database, its dumps and the git backups hold ciphertext and nothing else of meaning; there is no "operator key" mode and no plain-text mode. It is
  **not a promise against whoever runs the server**, whose code the browser runs (§8.6), and it is **not yet audited**.
- **It works offline, first.** What is on the device opens and is edited with no network, and syncs later (§11). Signing in needs a network; unlocking
  does not (§9).
- **The person decides where each thing lives** (§10): on this device only, synced to the server and every device, or online only. A whole wallet can
  be kept **fully offline**, with manual backups. The server keeps the encrypted **shape** of what lives only on a device, so a lost browser is
  noticed, never silent.
- **It works alone.** Every feature works on a Wallet with no Sovereign instance: its own accounts, its own mail, its own notices, its own files. An
  instance adds a way to sign in and core's bell, email and activity; never what a feature depends on (§25).
- **No third party in the browser.** Codes are drawn and scanned by Wallet's own code; nothing loads from elsewhere.
- **A person can leave,** with their data readable to them: an encrypted backup file, a readable export, and deletion that leaves nothing (§23, §28).
- **It is not a doctor.** Results are flagged against the range printed on the person's own report; Wallet never diagnoses (§16.9).

What it is not: a password manager (no passwords, no autofill), a bank or payment card holder (no payment cards, no money: that is Ledger), a
government identity verifier, or a medical records system shared with providers.

Wallet replaces the legacy plugin `sovereign-plugin-wallet`. A few of its ideas are kept (§2.1); none of its code is carried over and none of its data
is migrated. Its interface is designed anew (§26).

## 2. Phases

The owner's direction: **everything is planned now, the MVP is phase 1, and the rest follows a release at a time.**

| Phase                               | Release | What it delivers                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1, the MVP: cards and documents** | 0.1.0   | A full PWA, alone or hosted; sign-in, locally and through core; the suite's keys and a recovery kit; locking with a passkey or a device passcode; the three tiers, shapes and fully offline mode; sync; family members; **cards** with every code format, scanning and full-screen display; **ID documents** with scans and expiries; the Due panel; an encrypted backup file, a readable export, and encrypted backup to git; devices; deletion. |
| **2, Health**                       | 0.2.0   | Measurements with BMI and charts; lab reports with structured results, unit conversion and trends per test; the medical ID, allergies, conditions, medications and vaccinations; the **journal** of symptoms and mood; the **medical summary** and the **doctor's report** as printable pages; receiving files from other apps.                                                                                                                   |
| **3, Out into the world**           | 0.3.0   | The **business card** (vCard QR, `.vcf`, the share sheet, an optional public page) and received contacts; **Apple Wallet and Google Wallet** passes for business cards and cards; **NFC tags** on Android; watermarked copies of documents; `.pkpass` import; insurance, tickets and secure notes; **one-off encrypted share links**; reminders while Wallet is closed, opt-in.                                                                   |
| **4, Sharing and native**           | 0.4.0+  | Sharing entries end to end with family members' own accounts; a portable core and a native shell, for what only a native app can do (§31).                                                                                                                                                                                                                                                                                                        |

**0.1.0 is a cut of phase 1** (decision log, 2026-11-13): the foundation, sign-in locally and through core, the whole encryption design (vault, keys,
unlocking, sync of the `synced` tier), and **QR cards**. Family members, files and photos, the other tiers, documents and Due, backups, notices and mail,
devices and key changes follow, in phase 1's order, before phase 2. `ROADMAP.md` lists the cut task by task; the sections below describe the finished
design, and say "after 0.1.0" where the cut matters.

### 2.1 What is carried over from the plugin

| Plugin                                                                         | Here                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Loyalty cards with QR and barcode formats, drawn in the browser                | Cards (§13), with more formats and scanning                                      |
| Front and back images of a card                                                | Card photos (§13.3), encrypted like everything else                              |
| Sensitive documents always encrypted in the browser                            | Every entry, always (§8)                                                         |
| Per-card optional encryption                                                   | **Dropped:** everything is encrypted                                             |
| `sdk.e2ee`, `sdk.storage`, `sdk.portability` of the platform                   | **Dropped:** the vault (§8), Wallet's own files (§11.6), backup and export (§23) |
| The finance ledger track (accounts, transactions, categories, payment intents) | **Dropped:** money is Ledger's                                                   |
| Sovereign ID credentials (planned, never built)                                | Not planned                                                                      |

## 3. User journeys

1. **Setting up.** Ana signs up, and Wallet shows her recovery kit once; she prints it and puts it in a drawer. She turns on Face ID unlock, which is what
   opens Wallet on this phone with or without signal, and installs Wallet to her home screen. Her name becomes "Me".
2. **A card at the till.** At the supermarket she opens Wallet, looks at her phone to unlock, taps the store's card, and the code fills a white screen
   that stays awake. The cashier scans it. It worked without signal in the basement.
3. **Adding a card.** She taps Add, points the camera at a gym card's barcode, Wallet reads the format and number, she names it and picks a colour,
   and takes photos of both sides. A transport QR from an email is added from the screenshot.
4. **A passport kept on one phone only.** Ben keeps his passport scan on his phone only. On his laptop the passport shows as a shape: "Passport — only
   on Ben's iPhone". When his phone's browser data is wiped, the shape says "Lost from Ben's iPhone", and he restores it from last month's backup
   file.
5. **Fully offline.** Chen turns on fully offline for the whole wallet. Everything moves to his phone, the server keeps only shapes, git backup stops,
   and every two weeks Wallet reminds him to download an encrypted backup file.
6. **The Due panel.** Home says Ana's passport expires in five months and her daughter's residence permit in three weeks.
7. **The family.** Ana adds her daughter Mia and her partner Leo as family members. Mia's passport, vaccinations and growth measurements are in Ana's
   wallet, filed under Mia.
8. **A lab report (phase 2).** Ana gets her lipid profile as a PDF. She adds a lab report, attaches the PDF, picks "Lipid profile", and types four
   values with the units and ranges printed on the report while the PDF shows beside the form. Her LDL trend now has six points over four years.
9. **The weekly weigh-in (phase 2).** Leo adds his weight; BMI is worked out from his latest height and charted against the adult bands.
10. **The doctor (phase 2 and 3).** Before an appointment, Ana opens the doctor's report for the last three months: her journal's headaches by week,
    her mood, blood pressure readings and the last two blood counts. She prints it, or (phase 3) shows the doctor a QR code that opens it, end to end
    encrypted, for a day.
11. **A business card (phase 3).** At a conference Leo shows his card's QR; the other person's phone adds him as a contact. He AirDrops the `.vcf` to
    another, writes it onto an NFC sticker for his badge, and adds it to Apple Wallet.

## 4. Terminology

| Word                  | Means                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Wallet**            | The app, and a person's whole collection in it                                                                                     |
| **Entry**             | One thing in the wallet: a card, a document, a measurement, a lab report, a journal entry, a family member… Internally `entry`     |
| **Card**              | An entry with a scannable code: loyalty, transport, membership, library, gift, access, other (§13)                                 |
| **Document**          | An identity document with its pages: passport, ID card, residence permit, licence, visa… (§14)                                     |
| **Family member**     | A person whose entries are kept in this wallet (§12). **"Me"** is the account holder. Never "dependant"                            |
| **Recovery kit**      | The 14 groups of four shown once after sign-up, which open the wallet again after a password reset (§7.2)                          |
| **Locked / unlocked** | Whether this device holds the key in memory right now (§9)                                                                         |
| **Where it lives**    | An entry's tier: **This device only**, **Synced**, **Online only** (§10)                                                           |
| **Fully offline**     | The whole wallet kept on devices, with manual backups (§10.7)                                                                      |
| **Shape**             | What the server keeps of every entry: an encrypted outline (kind, title, family member, where it lives), never its content (§10.3) |
| **Due**               | Things that need attention: expiries, overdue backups, lost entries, later measurements and boosters (§15)                         |
| **Backup**            | An encrypted copy: a **backup file** downloaded by the person, or a **git backup** made by the server (§23)                        |

Never in the interface: "plugin", "tenant", "vault" (an internal word), "DEK", "blob", "tier", "stub", "client", "E2EE" (say "encrypted in your browser").

## 5. Architecture

```
               browser (a PWA)                                         server (one image, one process)
 ┌──────────────────────────────────────────┐              ┌───────────────────────────────────────────────────┐
 │ UI (React 19, @sovereignfs/ui)           │              │ Next.js: the shell, routes                         │
 │ the keyring: app key → root →            │  /api/sync   │ better-auth (§25)                                  │
 │   entry keys, in memory, locks (§9)      │ ◀──────────▶ │ sync: checks owner, tier, sizes, version; orders   │
 │ seals and opens every entry (§8)         │              │   and stores ciphertext; never reads it (§11)       │
 │ device store: IndexedDB, ciphertext      │  /api/blobs  │ files: ciphertext under /data/blobs (§11.6)        │
 │   only, one database per account         │ ◀──────────▶ │ /api/keys: the vault, the wrapped root (§7)        │
 │ in-memory index of what is open: lists,  │  /api/keys   │ /api/devices, /api/ops: online changes             │
 │   search, Due, charts, merge (§11.5)     │  /api/ops    │ backup: git commits of ciphertext (§23)            │
 │ codes: draw (bwip-js), scan (zxing-wasm) │              │ phase 3: passes, public cards, share links, push   │
 │ service worker: the shell only           │              │ jobs: backup, mail, pruning, (3) reminders         │
 └──────────────────────────────────────────┘              └──┬────────────┬────────────┬─────────────┬────────┘
                                                      SQLite (sqld    files under   GitHub REST   SMTP, core,
                                                      or a file) or   /data/blobs   (backup)      (3) push, Apple
                                                      PostgreSQL      (ciphertext)                 signing, Google
```

- **The browser is where meaning lives.** It makes the keys, seals every entry before it leaves memory, opens what it receives, and computes
  everything a person sees: lists, search, Due, BMI, trends, charts, merges, reports. **Every pure computation runs in the browser**, and the tests
  run it in Node.
- **The server is a careful store and courier.** It checks who owns a row, which tier it is in, its sizes and version, orders it, stores ciphertext,
  and hands it to the account's devices. It reaches GitHub for backups, SMTP and core for notices, and in phase 3 Apple's signing (offline, with a
  certificate), Google's pass links and push services. **It never holds a key that opens an entry.**
- **Offline first for entries, online for decisions about the account:** entries are written to the device and synced (§11); the keyring's
  first creation, the suite's key records, devices, the backup connection and (phase 3) publishing are online operations.
- **What the server can read** is exactly §8.5's list, and the threat model is §8.6.
- **Next.js with React 19**, a long-running server, because of the jobs. **SQLite by default, PostgreSQL if the operator prefers** (§29).
- **Jobs run in the web process** on a timer from `instrumentation.ts`, with `WALLET_WORKER=off` for all but one process if several share a database;
  every job claims its work in the database (Tusk §5).
- **The core is portable** (§31.2): the vault format, the sync client, the entry models, validators and every pure computation live in `src/core/`,
  with no React, no Next.js and no DOM beyond WebCrypto and `fetch`, so a native app can take it whole.

### 5.1 Where things go

As Tusk's: `app/` for routes, `src/` for everything else, tests beside the code.

| Path                            | What                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                          | Routes: the landing page, sign-in, setup, unlock, the signed-in area, print pages, `/api/*`; phase 3 `/c/[slug]`, `/s/[id]`          |
| `src/core/vault/`               | What Wallet adds to the SDK's cipher: derived entry keys, document ids, padding (§8) — **portable, browser and Node**                |
| `src/core/entries/`             | Every entry kind's model, its shape and body, validators, defaults (§10, §12–§22) — portable                                         |
| `src/core/sync/`                | The protocol's types and validators (shared by both sides), the client's merge (§11) — portable                                      |
| `src/core/backup/`              | The backup format: building and reading snapshots and files (§23) — portable                                                         |
| `src/core/due/`                 | What is due (§15) — pure                                                                                                             |
| `src/core/health/`              | BMI, units, the test catalogue, conversion, trends (§16) — pure                                                                      |
| `src/core/journal/`             | Symptom vocabulary, aggregates for charts and reports (§17) — pure                                                                   |
| `src/core/vcard/`               | vCard and MECARD writing and reading (§19) — pure                                                                                    |
| `src/core/search/`              | Search over what is open (§26.4) — pure                                                                                              |
| `src/keys/`                     | One interface over both modes: the suite's key (`appKeys` hosted, `localVault` standalone), the keyring root (§7, §9) — browser only |
| `src/keyring/`                  | The browser's keyring: unlock, lock, idle timers, passkey and passcode wrappers (§9) — browser only                                  |
| `src/local/`                    | The device store over IndexedDB, the outbox, the sync loop, file prefetch, the in-memory index (§11) — browser only, **from Tusk**   |
| `src/media/`                    | Images in the browser: decode, orient, strip metadata, re-encode; PDF page rendering (§11.6) — browser only                          |
| `src/barcode/`                  | Drawing (bwip-js) and scanning (BarcodeDetector, then zxing-wasm) codes (§13) — browser only                                         |
| `src/server/entries/`           | Applying mutations, tier rules, sizes, the stream counter (§11) — server only                                                        |
| `src/server/blobs/`             | The file store under `/data/blobs`, quotas, serving (§11.6)                                                                          |
| `src/server/vault/`             | The wrapped root (`keyring`), the suite's key records through the SDK, devices (§7, §6.3)                                            |
| `src/db/`                       | Configuration, clients, schemas per dialect, migrations at start-up (§29) — **copied from Tusk**                                     |
| `src/auth/`                     | the sign-in on `@sovereignfs/auth`: its settings, the store and its move, the screens, the fake Sovereign for tests (§25)            |
| `src/access/`                   | Every page, route and operation with who may use it (§5.2)                                                                           |
| `src/crypto/`                   | **The server's** instance key and envelope encryption, for credentials only (§8.7) — **copied from Tusk**                            |
| `src/backup/`, `src/providers/` | The git connection and job; the git host interface, GitHub's implementation, an in-memory one (§23) — **from Tusk**                  |
| `src/notices/`, `src/mail/`     | The bell, the mail outbox, (3) Web Push (§24) — **from Tally**                                                                       |
| `src/passes/`                   | Phase 3: Apple `.pkpass` signing and Google Wallet links (§20)                                                                       |
| `src/sovereign/`                | Core's notices, `People.deletePerson`, the bell, email and activity calls (§25, §28) — **from Tusk**                                 |
| `src/jobs/`                     | The runner and claims — **copied from Tusk**                                                                                         |
| `src/sw/`                       | The service worker: the shell by allow-list, the offline shell page, share target (§26.6) — **from Tusk**                            |
| `src/screens/`, `src/ui/`       | The signed-in screens and the shell                                                                                                  |
| `docs/specs/`                   | `vault-format.md`, `sync-protocol.md`, `backup-format.md`: the formats as standalone specifications (§31.2)                          |
| `migrations/`, `deploy/`        | Generated SQL (`sqlite/`, `postgres/`, `auth/`); the Compose setups                                                                  |

**Copied** (building-an-app §15: until the kit is published, an app copies, and says which files): from Tusk, `src/db/`, `src/jobs/`, `src/auth/` and
its fake Sovereign, `src/sovereign/`, `src/crypto/` (for the server's credentials only), `src/mail/`, `src/config/`, `src/security/` and `proxy.ts`,
`src/limits/`, `src/sw/`, `src/theme/`, the backup connection and `Provider` (§21 of Tusk), `src/local/`'s store and loop, `scripts/`, the Dockerfile
and `deploy/`; from Tally (once built), the mail outbox, the profile copy of name and email, and notice delivery. Each is renamed to `WALLET_` and
trimmed of what Wallet does not use; none is changed in behaviour without saying so in its task.

### 5.2 Access

**The permission is in the statement**, as in every app of the suite. A refusal reads as not found.

- **Everything belongs to one account until phase 4.** Every row carries `account_id`, and every read and write names it:
  `… WHERE id = ? AND account_id = ?`. There are no shared rows in phases 1–3: family members are entries in one person's wallet (§12), not accounts.
- **Tier rules are conditions too:** a body is accepted only for an entry whose tier is `synced` or `server` (§10.2); a device-tier entry's tier
  changes only from its holder device (§10.4); in fully offline mode the server refuses any body (§10.7). Each is part of the applying statement.
- **Files** are reached only through their entry's owner: `/api/blobs/<id>` reads `… WHERE id = ? AND account_id = ?`.
- **Sync applies the same rule per mutation** (§11.4); pull hands a device only its account's rows.
- **A device is an account's device:** device operations name both. A revoked device's session ends, and its requests are refused.
- `src/access/routes.ts` lists every page, route and operation with who may use it; a test calls each as a second signed-in person and expects not
  found.
- **Phase 3's public routes** (`/c/[slug]` and `/s/[id]`) are the only routes without a session, and serve only what was published to them (§19.5,
  §22).

## 6. People and accounts

### 6.1 A profile

`profile` is Wallet's own copy of an account's **name and email**, made with the account and kept in step from Settings, as Tally keeps `person`. It
is used for mail (a backup that stopped, a new device) and the avatar; the server seals it under its own key (§8.7), since the server must read it to
send mail. **It is the only personal data the server can read,** and Settings says so. A family member's name is an entry, encrypted (§12).

### 6.2 Who may sign up

**Standalone, `closed` (the first account only) unless `WALLET_AUTH_SIGNUP` says `open`.** A closed sign-up answers every address alike, and says
nothing of whether one has an account; an open one with no mail cannot, since it signs the person in at once, and says an address is taken. In suite mode (§25.1) it has nothing to decide: who may sign up is
core's, and signing in through core always gets an account (`app-manifest.md` §4). Wallet has no invitations until phase 4 (§31.1).

### 6.3 Devices

Every browser that signs in becomes a **device**: a random id the browser makes and keeps in its store, a label it seals ("iPhone · Safari",
editable), the session it belongs to, when it was first and last seen. Settings > Security lists them.

- **A new device is noticed:** the account's other devices see "New device: Firefox on Linux" in the bell, and an email goes out (§24). A new device brings the
  root with the account's key (§9.3), so **a stolen password opens the wallet on a new device**: the notice is the person's warning, and it is always on.
- **Removing a device** ends its session; its device-only entries stay as shapes marked "on a removed device" until the person deletes them or
  restores them from a backup (§10.5).
- **A browser that was wiped** comes back as a new device. Setup on it asks: "Is this the same device as _iPhone · Safari_ (last seen 3 days ago)?" If
  yes, the old device is removed and its device-only entries are marked lost (§10.5).

## 7. Keys

**Wallet holds no key scheme and no cipher of its own.** Its keys are the suite's (`sovereign`'s RFC 0005, through `@sovereignfs/sdk`; Shopper's `DESIGN.md` §13 is the model, and
[RFC 0001](docs/rfcs/0001-wallet-on-the-suites-encryption.md) is why), and which of the two ways an instance gets them follows from its mode (§25.1), never from the viewport.
**Not yet audited:** the suite's design and code have not been reviewed by a cryptographer or audited, and wherever Wallet describes the feature it says so.

### 7.1 The account key and the app key

A person has an **account key**: 32 random bytes made in their browser and wrapped once for each way to unlock (standalone, the password and the recovery kit; at core also
passkeys, and escrow where an instance turns it on). Changing a way re-wraps one key and re-encrypts nothing. Wallet is given an **app key**, random and its own, wrapped by the account key, as an AES-GCM `CryptoKey`
that cannot be exported. **Wallet never sees the account key,** so a compromised Wallet exposes Wallet's data and no other app's.

- **Hosted (suite mode):** core keeps the keys. The page gets Wallet's app key from core once a session (`appKeys` from `@sovereignfs/sdk/keys`, answered at `/keys/return`), and core's
  passkeys, recovery kit, escrow and lock work for Wallet as for every encrypted app. The manifest's `encryption` says Wallet uses them, and the operator allows it.
- **Standalone:** Wallet keeps the records in a vault of its own (`AppVault`, `vaultRoute` and `localVault`, sdk §9.5), the **same records as core's**, so a person's keys could later
  move to core. It opens at sign-in: the browser derives two values from the password with Argon2id, the **sign-in value**, sent where the password used to go, and an **unlocking
  value** that never leaves the browser and unwraps the account key.

**The app key wraps one more key, the keyring root** (§8.1): 32 random bytes made by the account's first device, kept on the server only wrapped under the app key, and held by each device
under its own unlock wrapper (§9.3). The app key itself cannot be exported and opens only through the suite (the SDK fetches the session's secret from the server on every open), so **the
root is what lets Wallet open with no signal.**

### 7.2 The recovery kit

Shown once after sign-up, standalone: 14 groups of four, to print or keep, which wraps the account key (`kitPending`, `keepKit`). **A password reset gives back the account, not
the wallet:** after one (by mail, or by an operator's link), the wallet opens again with the kit (`unlockWithKit`), and the new password takes the old one's place. **A forgotten
password and a lost kit lose the wallet for good.** Hosted: core's kit and passkeys, and its owner recovery where the instance has turned it on.

### 7.3 Ways to unlock

- **On a device that has been set up:** a passkey (Face ID, a fingerprint) or a device passcode, offline and every time (§9.3).
- **To bring the root to a new device, or after a reset:** the suite's key. Standalone, the password at sign-in and, after a reset, the kit. Hosted, core's: its password, passkeys (PRF), kit and lock.

### 7.4 What the server keeps

Standalone: the vault's records in the auth store (`sv_key_*`): wrapped keys and public keys, never a key that opens anything, and the **vault id**, which is the salt of the sign-in value.
Hosted: no key of anyone's (core's vault has them). In both, Wallet's own `keyring` holds, for each account, the **wrapped root** and its epoch (one row per epoch), which only the app key
opens. No entry carries a key of its own (§8.1).

### 7.5 Changing keys

A password change re-wraps the account key and replaces the sign-in value in one request (`prepareChange`, `finishChange`); a new kit is made the same way. **Replacing the app key** re-wraps the one
root record and re-encrypts no entry. **Rotating the root** (for a root that may have been seen by someone else) is a new epoch: every entry and file re-encrypted by the browser in resumable batches
through the ordinary sync path, the account marked `rotating`; backups made before stay readable with the old root (task 3.10). Hosted: core's, for the account and app keys.

### 7.6 Resetting a wallet

For a person who has lost the password, the kit and every unlocked device: **Reset wallet**, after a fresh sign-in and typing "reset", deletes every entry and file on the server,
Wallet's wrapped roots and, standalone, the account's key records (the vault's `deleteAccount`), and starts again with new keys. The account, its sign-in and its devices stay.
Device stores are emptied at their next sync (task 3.11).

## 8. Encrypting an entry

### 8.1 Keys

```
 account key  ── wraps ─▶  app key  (AES-GCM, random, Wallet's own; cannot be exported; opens only through the suite)
                              │ AES-256-GCM wrap, bound to account and epoch (the server keeps it: keyring)
                  keyring root  (32 random bytes, one per account and epoch; held by each device under its unlock wrapper, §9.3)
                              │ HKDF-SHA-256, info "wallet/v2/entry|<account id>|<entry id>"
                  entry key  (32 bytes; the SDK's "document key"; derived, never stored)
                              │ importDocumentKey: an HKDF key that cannot be exported
        ┌─────────────────────┼────────────────────────────┐
  shape (encryptBytes)   body (encryptBytes)     files (encryptContent, 64 KiB chunks)
```

- **Wallet holds no cipher:** the SDK's `encryptBytes`, `decryptBytes`, `encryptContent` and `decryptContent` do the encrypting, each bound to a document id and a version, so what they
  check is what the suite checks. What Wallet adds is the **padding** (§8.2), the derivation, and which key and which id each value is bound to.
- **Derived entry keys,** as Shopper derives its lists' keys: one root on a device opens every entry and makes the key of a new one, **offline**, with nothing wrapped per entry for a server to
  release. A key per entry still keeps a future share (phase 4) to one entry: it is the derived 32 bytes that a share carries, never the root. Moving an entry between tiers or devices needs no
  re-encryption.
- **The wrapped root:** `AES-256-GCM(app key, nonce, root, AAD = "wallet/v2/root|<account id>|<epoch>")`, in `keyring`; opened with WebCrypto into raw bytes that are imported as a
  non-extractable HKDF key and overwritten at once. **Made online:** the account's first device makes it and the server keeps the first one it is given (a second device that raced it adopts the stored one).

### 8.2 Envelopes

**A sealed value** (an entry's shape or body) is the SDK's envelope around a padded plaintext:

```
plaintext    UTF-8 JSON, then 0x80, then 0x00 bytes to the next multiple of the bucket
             (shape: 256 bytes; body: 1,024 bytes)  (ISO/IEC 7816-4 padding)
envelope     encryptBytes(entryKey, { documentId: "<account id>/<entry id>/<part>", version: <the entry's key epoch> }, plaintext)
             (part: "shape" or "body")
```

- **The binding** ties each value to its account, entry and part (the document id) and to its key epoch (the version, as Shopper binds its keyring's epoch), so the server cannot move a value to another entry, account or part, or give one made under another root, unnoticed. The row's own version is not bound, so merging and rebasing a change re-seals nothing.
- **Padding** hides small differences in length: a server sees a shape as 256 or 512 bytes plus the envelope, not as the length of a title. **The envelope adds 63 bytes and the document id**, which it carries in the clear and the server knows (16 more for each further 64 KiB chunk), so the server checks that a value has the length padding makes (`docs/specs/vault-format.md`).
- **Versioned by the suite:** the envelope names its suite (RFC 0005 §1), so the algorithm can change without guessing.

### 8.3 Files

A file (a photo, a scan, a PDF, a logo) is encrypted with `encryptContent`, in the suite's 64 KiB chunks as a stream, so a large PDF is encrypted and decrypted in pieces, under the
entry's key and a document id for that file. The plaintext is an 8-byte length, the file's bytes, and zero padding to the next bucket (16 KiB below 1 MiB, 256 KiB above).

Images are re-encoded in the browser before they are encrypted, removing every piece of metadata (location included) (§11.6). The server stores the ciphertext under `/data/blobs` and
never sees a file name, type or dimension.

### 8.4 Where things are encrypted

**Everything a person typed or attached is in a shape, a body or a file, and every one of those is sealed.** Each kind's fields are listed in its
section (§12–§22) as shape or body. The **shape** holds just enough to list and file the entry without opening it: kind, title, a subtitle (an issuer,
a country), the family member, a colour and icon, the dates Due needs, favourite and position, archived, tags, and for a device-only entry its
holder's label and state. The **body** holds the rest.

### 8.5 What the server can read

The account itself (its sign-in, `profile`'s name and email, §6.1), and for each entry: its **id**, **tier**, **holder device** (for device-only), the
**sizes** of its padded shape, body and files, the **number of files**, its **key epoch**, **version** and **sync counter**, and **when** it was created, changed and
deleted. Devices: their ids, sessions and times. The backup connection. **The keys' records** (§7.4): wrapped keys and public keys, which open nothing. **Not** the kind of an entry, its title, its family member, its dates, or
anything in it.

So an operator can see how many entries someone has, roughly how large, which live where, and when they change; not what they are or say.

### 8.6 What this protects against, and what it does not

- **It protects** against someone who reads the server: a copy of its disk, its database, the files under `/data` or a backup holds ciphertext, wrapped keys and public keys. A guessed
  password can be tried against a wrap, at Argon2id's cost, and no other.
- **It does not protect** against **whoever runs the server**: a web app's code comes from the server, so one that sends changed code gets the key at the next unlock. Wallet never says
  the operator "cannot" read what it keeps. Mitigations are the suite's: a strict CSP with nonces, no third-party code, the image's provenance, and running one's own instance. A
  published-script check (the service worker comparing the shell's scripts against a pinned list) is noted in §31.4, not planned.
- **Nor a device taken while unlocked,** or malware on it. The locks (§9.2) shorten the window.
- **The server still sees** §8.5's counts, sizes, tiers and times, and the network addresses it is spoken to from.
- **Losing the password, the kit and every unlocked device loses the wallet.** Nobody can recover it, unless the instance turned escrow on, in which case its owner can open everyone's.
- **What the person chooses to publish** (passes, public cards, Google Wallet: §19.5, §20) leaves the encryption by design, and says so first.

**Not yet audited.** Wallet says so wherever it describes this.

### 8.7 The server's own key

`WALLET_ENCRYPTION_KEY` (32 bytes, generated by the instance) encrypts **the server's own secrets** through Tusk's `src/crypto/` envelope, bound to
row and purpose, rotated with `WALLET_ENCRYPTION_KEY_PREVIOUS`: the git backup's credential, core's refresh token if one is ever kept, `profile`'s
name and email, and in phase 3 push subscriptions and published cards. **It never touches an entry.**

## 9. Locking and unlocking

### 9.1 The keyring

When unlocked, the browser holds in memory the **keyring root**, as a non-extractable HKDF `CryptoKey`, and, as they are used, **entry keys** derived from it (the SDK's document keys, held as
non-extractable `CryptoKey`s), and the **opened entries** in an in-memory index (§11.1). Locking drops all of it: the root, the keys, the index, every rendered page's data (the app navigates to
the lock screen and clears its state), and every object URL of a decrypted file. **A lock takes the suite's app key with it** (the SDK's `forget`),
so opening the wallet again is a passkey, a passcode, or the account proved again (the password, or Sovereign's release): holding an unlocked device is not enough. The root is never kept
in the clear: a device keeps it only under an unlock wrapper (§9.3).

**Sync runs while locked:** the outbox drains and pulls arrive, since the store holds ciphertext only.

### 9.2 When it locks

- **After a time without use:** 1, 5 (the default), 15 or 60 minutes, set per device.
- **When Wallet is hidden** (another app, the screen off): at once, after 1 minute (the default), or never.
- **By hand:** the lock button in the header.
- **At sign-out,** and what the SDK keeps of the app key opens nothing once the session ends. The device's wrappers stay with its ciphertext, as they did.
- **Hosted:** also core's lock (`sovereign`'s RFC 0006), which closes the app key.

Tabs share one lock (BroadcastChannel): unlocking or locking one does the same in every tab of the account. **A device with no wrapper set has nothing to come back with**: its lock needs the
suite's key, which needs a connection, so setup asks for a passkey or a passcode and says why.

**A reload is not a lock** (the owner's decision, 2026-11-26). The keys still live only in the page's memory, so a reloaded page has none; but it opens again **by the suite's key, without
asking, when all of this holds**: it is the same tab; the server can be asked; the SDK still keeps the key for the session (no lock has taken it); and neither lock time has run out, counting
the idle time from the last use and the hidden time from when the page was left. For that the tab keeps two times in `sessionStorage`, written only while the wallet is unlocked, and **no
key** (`src/keyring/resume.ts`). It errs toward locking. So: **closing the tab locks** (a new tab asks), **"at once" when hidden makes a reload lock**, a lock time that ran out while the page
was away is that lock (the suite's key goes with it), and **with no network a reload asks** for the passkey or passcode. What a browser restores with a tab (reopening a closed one) is within
the same times. This asks no more of a device than leaving the page open would: within those times the wallet would still have been unlocked.

### 9.3 Ways to unlock

Each device keeps one or more **unlock wrappers** in its store: the root, wrapped by something only this device and person can produce. They are 0.1.x's wrappers with a new root.

| Way                                                 | How                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Passkey (Face ID, a fingerprint, Windows Hello)** | A WebAuthn credential made for unlocking, with the **PRF extension**. Its output for the salt `"wallet/v1/unlock"`, through HKDF, is an AES-256-GCM key that wraps the root                             |
| **Device passcode**                                 | At least 6 characters (digits allowed). Argon2id (64 MiB, 3 passes, `hash-wasm`) of it and a random salt is a key that wraps the root, which is then wrapped again under a device key kept in the store |
| **The suite's key** (online)                        | Standalone, the password at sign-in; hosted, core's release. It fetches the wrapped root and opens it with the app key, so a new device, or one with no wrapper, gets the root                          |
| **Recovery kit** (standalone, after a reset)        | The typed kit opens the account key again, and with it the app key and the root                                                                                                                         |

- **Setup offers the passkey first** where `PublicKeyCredential.getClientCapabilities()` reports PRF, and the passcode otherwise. A device can have both. **A passkey that gives no PRF output on
  a device is not offered there**; the passcode is. This needs a device check (RFC 0001).
- **Five wrong passcodes** delete that device's passcode wrapper; the person then unlocks with a passkey or the suite's key, and may set a new passcode.
- **A passcode is weaker than a passkey** against someone who copies the browser's store and guesses offline. Settings says so.
- **The unlock passkey is not the sign-in passkey.** A person may have both; Settings lists them apart.

### 9.4 Signing in and unlocking

Signing in proves the account to the server and needs a network, and **signing in also opens the suite's key** (a password derives the unlocking value; hosted, core releases the app key), which is what
fetches the root onto a device. **Unlocking proves the key to the device and happens after every lock** (a reload within the lock times is none, §9.2), offline, with the wrapper. So day to day, **Face ID is the way in**, as the owner asked, and
the password is the way back in after a new device or a reset. Hosted, signing in through Sovereign is one redirect and the key's release another, **one press on the lock screen** (Unlock
through Sovereign), which core answers without asking while its session is unlocked; **for that the page must send its origin as the referrer** (§30). Nothing of the wallet depends on a file the
person must keep: the kit is the way back after a reset.

**A password typed at the lock screen or in Settings is first confirmed by the server** (its sign-in value, `/api/keys/confirm`, wrong ones counted per account), and only then given to the vault:
an account that has no keys yet (one older than 0.7.0 whose session is still alive, or a sign-up that could not reach the vault) is given them from the first secret the vault sees, so a typo
would otherwise become the keys' password.

## 10. Entries and where they live

### 10.1 An entry

Every thing in the wallet is an entry: an id made by the device, a **kind**, a **shape** and a **body** (§8.4), zero or more **files**, a **tier**, a
**version** and a sync counter. Kinds, by phase:

| Phase | Kinds                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `person` (§12), `card` (§13), `document` (§14), `settings` (one per account: preferences that follow the person, §27)                                     |
| 2     | `measurement`, `lab_report`, `test` (a person's own test, §16.5), `medical_id`, `allergy`, `condition`, `medication`, `vaccination`, `journal`, `summary` |
| 3     | `business_card`, `contact`, `insurance`, `ticket`, `note`                                                                                                 |

**The kind is in the shape,** not a column: the server cannot tell a passport from a loyalty card.

### 10.2 Tiers

| Tier                 | Internal | Shape on server | Body and files on server | Body and files on devices                                             | Opens offline |
| -------------------- | -------- | --------------- | ------------------------ | --------------------------------------------------------------------- | ------------- |
| **This device only** | `device` | Yes             | **No**                   | On its **holder** device only, encrypted                              | On the holder |
| **Synced**           | `synced` | Yes             | Yes                      | On every device, encrypted                                            | Yes           |
| **Online only**      | `server` | Yes             | Yes                      | **Never stored:** fetched, opened in memory, dropped on close or lock | No            |

- **Online only** suits a document a person wants on no device they carry; it is fetched with `Cache-Control: no-store`, never written to IndexedDB,
  Cache Storage or the service worker, and its object URLs are revoked on close. It can be created and edited only online; offline its editor says so
  and offers to save it as Synced instead.
- **Synced files are kept on every device** (§11.6), so a synced document opens in a basement. Settings shows how much space that takes.

### 10.3 Shapes

**Every entry has its shape on the server, whatever its tier** (the owner's decision), so every device knows the whole wallet exists, even what it
cannot open:

- On a device that is not the holder, a device-only entry shows its title, kind and family member, greyed, with **"Only on _Ben's iPhone_"**. Opening
  it says how to move it (on the holder) or restore it.
- A shape is also what makes **loss visible** (§10.5).
- A device-only entry's shape is as private as any: sealed, padded.

### 10.4 Moving an entry

From the entry's menu, **Where it lives**:

| From → to                    | Done by                                     | What happens                                                                    |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Device only → Synced         | The holder                                  | Body and files uploaded; every device fetches them                              |
| Device only → Online only    | The holder                                  | Body and files uploaded; the holder deletes its copy once the server has them   |
| Synced → Device only         | Any device that has it (becomes the holder) | The server deletes body and files; other devices delete theirs at the next sync |
| Online only → Device only    | Any device, online (becomes the holder)     | Body and files fetched into the store, then deleted on the server               |
| Synced ↔ Online only         | Any device, online                          | The server keeps them; devices drop or fetch their copies                       |
| Device only → another device | Not directly                                | Move it to Synced, then to Device only on the other device                      |

**Leaving the server is not forgetting:** a git backup made before still holds the ciphertext (§23.3). The dialog says so in a sentence when a move
takes an entry off the server.

### 10.5 Lost entries

An entry is **lost** when its body is gone from its holder: the holder's store was wiped, the holder was removed, or the browser evicted the store.

- **The holder checks itself** each time it opens: a shape that names this device as holder with no body in the store is marked lost (a change to the
  shape, synced).
- **A wiped browser** is a new device; setup's "Is this the same device?" (§6.3) marks the old one's entries lost.
- **A removed device's** entries are marked lost when it is removed.
- Lost entries show in Due (§15) with **Restore from a backup file** and **Delete**. A restore puts back what the file holds (§23.2).

### 10.6 Defaults

The `settings` entry holds **a default tier per kind** (cards: Synced; documents: Synced; health kinds: Synced; journal: Synced; notes: Synced),
changed in Settings > Storage. A new entry starts at its kind's default, and the editor shows the choice beside Save.

### 10.7 Fully offline

**A choice for the whole wallet that overrides every default and every entry's tier** (the owner's decision), in Settings > Storage.

- **Turning it on** (online, unlocked, on the device that will hold everything): every Synced and Online only entry is fetched and moved to Device
  only with this device as holder, in resumable batches; the server deletes their bodies and files; the account's `mode` becomes `offline`. Other
  devices keep only shapes. **Git backup is paused** (§23.3).
- **While it is on:** new entries are Device only; the tier choice is hidden; the server refuses any body (§5.2). Each device in use holds its own
  entries; the others see their shapes. Shapes still sync.
- **Manual backups** are the safety net: Due reminds the person when the last backup file from this device is older than the interval they chose (14
  days by default), and Home says how long ago it was (§23.2).
- **Turning it off** changes nothing at once: entries stay Device only, defaults apply to new ones, git backup may resume, and the person moves what
  they want.

### 10.8 The browser's storage

Every Sovereign app is a full PWA, and Wallet is meant to be used installed. Still:

- **Persistent storage is requested** (`navigator.storage.persist()`) at setup and after each install; Settings > Storage shows whether it was
  granted, the space used and the quota (`navigator.storage.estimate()`).
- **Safari deletes a site's storage after seven days without use unless it is installed to the home screen.** In Safari, not installed, Wallet shows a
  message on Home while any device-only entry is held: "Install Wallet to your home screen, or Safari may delete what is kept only on this device."
  (the owner's decision). The same in any browser that refuses persistence.

## 11. Offline and sync

The design goal is Tusk's: **a person does not feel any of this.** The shape is Tusk's §8, for one stream per account, with ciphertext throughout.

### 11.1 The model

- **The device holds,** in IndexedDB through `idb`, one database per account (`wallet-<account id>`): every entry's row as the server has it (shape,
  key epoch, body for Synced and Device only entries, version), the files of Synced and held Device only entries, the unlock wrappers (the root, wrapped), the
  device's id, the cursor, the outbox, and for each entry the **base** (the last version agreed with the server) for merging (§11.5). **Everything in it is
  ciphertext,** as the owner asked: device-only data is encrypted at rest too, and the root is there only under a wrapper (§9.3).
- **Unlocked, the browser opens what it holds into an in-memory index:** shapes of every entry, bodies as they are needed (all of them for search, in
  the background after unlocking). Screens read the index.
- **A write** is sealed in memory, written to the store and the outbox in one IndexedDB transaction, and applied to the index. The loop sends it.

### 11.2 Mutations

A mutation is one entry's change, made by the device:
`{ id, entry, op (put | delete | move | lost), baseVersion, tier, holder, key_epoch, shape, body?, files: [file id…] }`. Validators in
`src/core/sync/` check structure and sizes on both sides; the browser validates the plaintext model before sealing.

### 11.3 The endpoint

`POST /api/sync`, with the session cookie and `Origin` checked. A request carries the device id, the outbox in order, and the cursor; the answer
carries what was applied, what was refused and why, the account's `mode` and newest key epoch, and the changes since the cursor.

- **Order is a counter per account** (`account_stream.seq`), incremented in the short transaction that applies a mutation and stamped on the row, with
  the mutation id recorded so a replay writes nothing.
- **Pull** returns rows past the cursor, paged: a Synced entry with its body, an Online only or Device only entry with its shape only, and tombstones.
  Files are fetched apart (§11.6).
- **A device syncs** after a write (debounced), on load, on focus, on coming online, every 30 seconds while visible, and through Background Sync where
  there is one; one tab at a time (Web Locks). A protocol version travels with each request; a device too old is told to update and keeps its outbox.

### 11.4 What the server checks

The entry is the account's (a device-made id that belongs to another account is refused); the tier allows a body (§10.2) and the mode allows it
(§10.7); a tier change from Device only comes from the holder; sizes are within limits (§29.5); the account's storage stays under its quota; and
**`baseVersion` is the current version.** It cannot check meaning, and does not try.

### 11.5 Conflicts: merged on the device

The server cannot merge ciphertext, so **a stale edit is refused and the device merges it** (the owner delegated the rule):

1. The server answers `stale` with the current row.
2. The device opens the current version, its own edit, and the base it started from.
3. **Field by field:** a field changed on one side only takes that side; a field changed on both takes **this device's** value; a list (a document's
   pages, a report's results) is one field.
4. The merged entry is sealed with `baseVersion` set to the current version and sent again. If a field was taken from this device over a change made
   elsewhere, a toast says "Also edited on _iPhone_ — kept yours" with **Undo**, which restores the other value.
5. **A delete against an edit:** the edit restores the entry. **Both deleted:** deleted.

Health data is one entry per measurement, report and journal entry, so two devices rarely touch the same entry.

### 11.6 Files

- **Made in the browser:** images are decoded, turned upright, and re-encoded (WebP, longest side 2,560 px; JPEG where WebP encoding is missing) with
  **every piece of metadata removed**; a thumbnail (480 px) is a file of its own. HEIC is read where the browser can decode it (Safari); elsewhere the
  original is kept as it is, with a note that its metadata could not be removed. PDFs are kept as they are, and their first page is rendered (pdf.js)
  as the thumbnail.
- **Encrypted** (§8.3) and uploaded with `PUT /api/blobs/<file id>` (a device-made id, idempotent, the ciphertext's SHA-256 checked) before or after
  the entry's mutation; an entry synced before its files arrive shows a placeholder elsewhere.
- **Stored** under `/data/blobs/<account id>/<first two characters>/<file id>`, ciphertext only, counted against the account's quota.
- **Fetched** with `GET /api/blobs/<file id>` (`Cache-Control: private, no-store` for Online only entries). A Synced entry's files are prefetched into
  the store after each sync; a held Device only entry's are there already.
- **Orphans** (files whose entry is gone, or never arrived after a day) are swept by a job.

### 11.7 What needs a network

Stated in the app and in the documentation: signing in and the first load on a device; creating the vault and changing keys (§7.5); opening, creating
or editing an **Online only** entry; moving entries between tiers (except Synced → Device only, which completes at the next sync); devices; the backup
connection; restoring from git; notices; and in phase 3, passes, public cards and share links. **Everything held on the device opens, is searched and
is edited offline.** On iPhone, sync happens only while Wallet is open.

### 11.8 First load, sign-out, an ended session

- **First load** on a device pulls shapes first, then bodies, then files, in pages; the wallet unlocks as soon as the root is on the device (a wrapper, or fetched once).
- **Sign-out asks** when the device holds device-only entries or unsent changes: **"Sign out and keep this device's encrypted data"** (the default:
  the store stays, for the same account to open after signing in again) or **"Sign out and erase this device"**, which names how many device-only
  entries will be lost. With neither, sign-out erases the store.
- **An ended session** shows sign-in and keeps everything: the store, the outbox.
- **Tombstones** and applied-mutation records go after 90 days; a device behind that gets a fresh snapshot, after sending its outbox.

## 12. Family

A **family member** is a `person` entry in the account holder's wallet: someone whose cards, documents and health the holder keeps (a child, a
partner, a parent). It is not an account and has no sign-in (sharing with another account is phase 4, §31.1).

- **"Me"** is made at setup from the profile's name, and cannot be deleted.
- **Shape:** name, relationship (`me`, `partner`, `child`, `parent`, `sibling`, `other`), colour. **Body:** date of birth, sex (for health ranges and
  BMI bands, §16: `female`, `male`, `unspecified`), notes.
- **Every entry except `settings` names its family member** in its shape (`person_id`), "Me" by default.
- **A family switcher** (All, Me, each member) filters every list, Due and Health. Family members are listed in Settings > Family, and each has a page
  of their entries.
- **Deleting a family member** asks what to do with their entries: delete them, or move them to Me.

## 13. Cards

### 13.1 A card

| Part  | Fields                                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape | kind `card`, `person_id`, title (the store or service), subtitle (the programme), card type (`loyalty`, `transport`, `membership`, `library`, `gift`, `access`, `insurance`, `other`), colour, favourite, position, archived, expires on                                          |
| Body  | the code: `format`, `payload` (the exact text or bytes, base64 for binary), `display` (the number printed under the code, if different); member name; card number; PIN hint (free text, shown masked); balance and currency (gift cards); valid from; notes; website; phone; tags |
| Files | front, back, logo (each with a thumbnail)                                                                                                                                                                                                                                         |

### 13.2 Codes

- **Formats:** QR, Aztec, PDF417, Data Matrix, Code 128, Code 39, Code 93, EAN-13, EAN-8, UPC-A, UPC-E, ITF (Interleaved 2 of 5), Codabar, and
  **none** (a card with only a number).
- **Drawn** by `bwip-js` (MIT) as SVG in the browser, with the format's quiet zone, at the largest size the screen allows, black on white whatever the
  theme. A payload that is not valid for its format is refused when typed, with the reason.
- **Scanned** by the camera (`getUserMedia`, the back camera) through the browser's `BarcodeDetector` where it supports the format, and otherwise
  **`zxing-wasm`** (zxing-cpp compiled to WebAssembly, served by Wallet; licences checked in 6.3). Also **from an image or screenshot** (file picker,
  paste, drag), and the **share target** (phase 2, §26.6). The scan fills format and payload; the person names the card.
- The camera needs permission; refused or missing, typing is offered.

### 13.3 Showing a card

Tapping a card opens it **full screen**: the code, large, on white, the number under it, the title above, with the **Screen Wake Lock** held while it
is shown. A browser cannot raise the screen's brightness, so the page is white and says "Turn your brightness up if it doesn't scan" once. Swiping
moves to the next favourite. The front and back photos are a tap away.

### 13.4 The cards screen

A grid of cards in their colours with the logo or initials, favourites first, then by the person's own order (drag to reorder) or by name; filters by
card type and family member; archived ones apart. Search covers titles, numbers and notes (§26.4).

## 14. ID documents

### 14.1 A document

| Part  | Fields                                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shape | kind `document`, `person_id`, document type (`passport`, `national_id`, `residence_permit`, `driving_licence`, `visa`, `birth_certificate`, `health_insurance`, `other`), title (default from type and country), country (ISO 3166-1 alpha-2), expires on, favourite, archived |
| Body  | number; surname; given names; nationality; date of birth; sex; place of birth; issued on; issuing authority; place of issue; categories (licence); permit type and remarks (residence permit); linked document (a visa's passport); MRZ text; notes                            |
| Files | pages, in order, each labelled (front, back, data page, page N), images or PDFs                                                                                                                                                                                                |

### 14.2 Pages

Added by the camera (one shot per page, with a frame guide), from files, or from a PDF; reordered and labelled; viewed in a viewer that zooms, rotates
and pages through images and PDF pages (pdf.js, Apache-2.0, its worker served by Wallet). A PDF is opened in memory, never in a new tab where the
browser might cache it.

### 14.3 Validity

Computed in the browser from `expires on`: **valid**, **expiring** (within the warning window), **expired**. The warning window is per type: passports
9 months (many countries ask for 6 months' validity on entry), residence permits 3 months, others 2 months; each can be changed in Settings > Due. A
document with no expiry has no status.

### 14.4 Later for documents

Watermarked copies (§21.1, phase 3); reading the MRZ from a photo (on-device OCR, noted in §31.4); reading a passport's chip (native only, §31.3).

## 15. Due and reminders

### 15.1 Due

**Due** is computed in the browser (`src/core/due/`, pure, from the open entries and today's date in the device's time zone), shown on Home and as a
count on the app icon (`navigator.setAppBadge`) while Wallet runs:

| Phase | What                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Documents and cards expiring or expired (§14.3); lost entries (§10.5); a backup file overdue in fully offline mode (§10.7); a git backup that stopped (§23.3) |
| 2     | Vaccinations with a next dose due; medications to refill (a refill date); a measurement the person asked to be reminded of (every N days)                     |
| 3     | Insurance renewing; tickets today and tomorrow                                                                                                                |

Each item opens its entry, and can be **snoozed** (a week, a month) or **dismissed** for that date; snoozes are in the `settings` entry, so they
follow the person. Online-only entries take part, since expiry dates are in their shapes (§8.4).

### 15.2 Reminders while Wallet is closed (phase 3, opt-in)

The owner left this to the design. **Off by default.** A server cannot know a date it cannot read, so the person chooses to tell it **a time and
nothing else**:

- Turning on **Remind me when Wallet is closed** (Settings > Notifications) lets the browser register, for each Due item with a date, a `reminder`
  row: an id, the moment, and nothing about what it is. Changing or dismissing the item updates or removes the row.
- At the moment, the server sends **"You have something due in Wallet"** by **Web Push** (Wallet's own VAPID key; push services carry an encrypted,
  content-free payload) to devices that turned it on, and by email if mail is set up and the person chose it. Opening Wallet shows what it is.
- Settings says exactly what the server learns: "the dates of your reminders, not what they are".

## 16. Health (phase 2)

Every health entry names a family member, so a parent keeps a child's measurements and vaccinations beside their own.

### 16.1 Units

Stored in one canonical unit each (kilograms, centimetres, mmHg, beats a minute, °C, mmol/L for glucose); shown in the person's choice (Settings >
Health: metric or US customary for weight, height and temperature; mg/dL or mmol/L for glucose). Conversions are `src/core/health/units.ts`, pure,
tested against worked values.

### 16.2 Measurements

A `measurement` entry is one reading: **shape:** `person_id`, type, the moment; **body:** values, the unit typed, a note, the context (fasting, after
exercise, morning).

| Type                | Values                     | Canonical unit |
| ------------------- | -------------------------- | -------------- |
| `weight`            | weight                     | kg             |
| `height`            | height                     | cm             |
| `blood_pressure`    | systolic, diastolic, pulse | mmHg, bpm      |
| `heart_rate`        | resting heart rate         | bpm            |
| `waist`             | waist circumference        | cm             |
| `temperature`       | body temperature           | °C             |
| `glucose`           | blood glucose              | mmol/L         |
| `oxygen_saturation` | SpO₂                       | %              |
| `custom`            | a named value and unit     | as typed       |

Adding one is a small form from Health or the Add button ("Weigh in", "Blood pressure"), with the last value shown. Readings are listed and charted
per type (§16.4).

### 16.3 BMI

**Computed, never stored** (`src/core/health/bmi.ts`): weight in kg divided by height in metres squared, using the latest height at or before the
weight's moment (or the earliest after, if none), shown to one decimal.

- **Adults (18 and over at the moment, from the date of birth):** with the WHO bands: under 18.5, 18.5–24.9, 25–29.9, 30 and over, named plainly
  ("below the healthy range", "in the healthy range", "above the healthy range", "well above").
- **Under 18, or no date of birth:** the value alone, with "BMI bands for children depend on age and sex; ask a doctor." (Growth percentiles are noted
  in §31.4.)
- **Age** is computed from the date of birth whenever it is shown; it is never typed.
- A BMI chart over time shows the bands behind the line for adults.

### 16.4 Charts

A line chart per measurement type (two lines for blood pressure), with ranges of a week, a month, a year and all; the readings as a list beneath,
since every chart has a list of the same. Drawn by the design system's chart (§26.7), from the open entries, in the browser.

### 16.5 The test catalogue

`src/core/health/catalogue.ts`, built in: **tests**, each with a code, a name, other names it is printed under, its panel, its canonical unit, the
units it is commonly reported in with exact conversion factors, and its LOINC code where one is clear. **No reference ranges** (labs differ; the
report's own range is used, §16.6).

| Panel            | Tests                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lipid profile    | Total cholesterol, LDL, HDL, triglycerides, VLDL, non-HDL (computed when the others are present)                                                   |
| Full blood count | Haemoglobin, red cells, haematocrit, MCV, MCH, MCHC, RDW, white cells, neutrophils, lymphocytes, monocytes, eosinophils, basophils, platelets, MPV |
| Glucose          | Fasting glucose, HbA1c                                                                                                                             |
| Kidney           | Creatinine, eGFR, urea / BUN, uric acid, sodium, potassium, chloride                                                                               |
| Liver            | ALT, AST, ALP, GGT, bilirubin (total, direct), albumin, total protein                                                                              |
| Thyroid          | TSH, free T4, free T3                                                                                                                              |
| Iron             | Ferritin, serum iron, transferrin saturation, TIBC                                                                                                 |
| Vitamins         | Vitamin D (25-OH), vitamin B12, folate                                                                                                             |
| Inflammation     | CRP, ESR                                                                                                                                           |

- **Conversions** include cholesterol mg/dL ↔ mmol/L (× 0.02586), triglycerides (× 0.01129), glucose (× 0.0555), creatinine mg/dL ↔ µmol/L (× 88.42),
  haemoglobin g/dL ↔ g/L (× 10), and HbA1c % ↔ mmol/mol (IFCC = (NGSP − 2.15) × 10.929). Each factor is tested, and **the catalogue is reviewed by
  someone medically literate before 0.2.0** (§33).
- **A person's own test** (`test` entry): a name, panel, unit; it then behaves as a built-in one.

### 16.6 Lab reports

A `lab_report` entry is one report: **shape:** `person_id`, the date the sample was taken, the lab's name, the panels in it; **body:** the ordering
doctor, notes, and **results**: for each, the test, the value (a number, or text such as "negative"), the unit as printed, the **reference range as
printed** (low, high, or text such as "< 5.0"), the flag as printed (H, L), and a note; **files:** the report's pages or PDF.

- **Entering results** is done **beside the report**: the PDF or photo on one side (stacked on a phone), the form on the other. Picking a panel adds
  its tests as rows; typing a test's name finds it by any of its names; the unit offers what that test is reported in.
- **Flags** are computed only against the report's own range, and the report's printed flag wins when present: **above range**, **below range**, **in
  range**, or nothing when there is no range.
- Reading values from the PDF automatically would need a server or a model in the browser; it is noted in §31.4, not planned.

### 16.7 Trends

A page per test (`/health/tests/<code>`): every result across reports, **converted to one unit** (the person's choice, the canonical by default), on a
line chart with each report's own range drawn as a band behind its point (ranges can change between labs), and the list beneath with the lab and a
link to the report. Panels have an overview: the latest value of each test, its flag and its direction since the previous result.

### 16.8 The medical ID and the rest

| Kind          | Shape                               | Body                                                                                                                                         |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `medical_id`  | `person_id` (one per family member) | blood type, organ donor, implants and devices, emergency contacts (name, relationship, phone), primary doctor (name, practice, phone), notes |
| `allergy`     | `person_id`, the allergen           | reaction, severity (`mild`, `moderate`, `severe`, `life_threatening`), since, notes                                                          |
| `condition`   | `person_id`, the condition          | diagnosed on, status (`active`, `resolved`), resolved on, notes                                                                              |
| `medication`  | `person_id`, the medicine, active   | strength, dose, how often, started, stopped, prescribed by, reason, refill on (Due), notes                                                   |
| `vaccination` | `person_id`, the vaccine, the date  | dose number, product and lot, given by, next dose due (Due), notes; files: the certificate                                                   |

A vaccination certificate with a QR code (an EU Digital COVID Certificate, for example) can also be kept as a **card** (§13), which shows it full
screen. **The medical ID is fully protected** like everything else (the owner's decision): there is no view without unlocking.

### 16.9 Not medical advice

Health screens carry one line: "Wallet records what you enter. It does not give medical advice." Flags say "above the range on your report", never
"abnormal" or "high risk". There are no built-in reference ranges except the adult BMI bands.

## 17. The journal (phase 2)

A `journal` entry is one moment written down: **shape:** `person_id`, the moment; **body:**

- **Mood**, 1 to 5 ("very low", "low", "okay", "good", "very good"), optional.
- **Energy**, 1 to 5, optional. **Sleep**, hours, optional.
- **Symptoms:** each a name (from a built-in list of common ones, or the person's own, remembered), a **severity** 0–10, where in the body (optional,
  free text), and how long it lasted (optional).
- **Notes**, free text; **tags**; **links** to entries (a measurement taken, a medication).

Quick entry from Home, Health or the Add button: mood in one tap, then symptoms, then notes, saved at any point. The journal lists entries by day,
filters by symptom, tag and family member, and shows a **calendar** of mood and a **frequency chart** of symptoms by week. Aggregates are
`src/core/journal/`, pure, shared with the doctor's report.

## 18. The medical summary and the doctor's report (phase 2)

### 18.1 The medical summary

A family member's health on one page, for a new doctor, a trip, or an emergency (the owner's request). A `summary` entry per family member holds what
cannot be computed (**body:** past surgeries and hospital stays, family history, other notes, and which sections to include); the rest is drawn from
the wallet at the moment it is shown:

- Name, date of birth, age, sex; blood type and organ donor; emergency contacts and primary doctor (from the medical ID).
- Allergies (severity first), active conditions, current medications with doses.
- Vaccinations, latest first.
- The latest measurements (height, weight, BMI, blood pressure) with dates.
- The latest result of each test in chosen panels, with its range and flag.
- Surgeries, family history, notes.

### 18.2 The doctor's report

For a date range and a family member, with sections chosen: **journal** (symptoms by week with severity, mood and energy by day, the notes, as
written), **measurements** in the range (charts and tables), **lab results** in the range (and the previous result of each, for comparison),
**medications** started, stopped or taken in the range.

### 18.3 How they are produced

**Print pages, made in the browser:** `/print/summary/<person>` and `/print/report?person=…&from=…&to=…&sections=…` render from the open wallet with a
print style sheet (A4 and Letter, page breaks between sections, charts as SVG, a footer with the date made and "Made with Wallet from information you
entered"). **Save as PDF** is the browser's print dialog, which every platform offers (on iPhone, through Share). Nothing is sent to the server. Phase
3 adds sending either as a one-off encrypted link (§22).

## 19. The business card and contacts (phase 3)

### 19.1 A business card

The owner's request: a personal digital business card. A `business_card` entry (a person may have several: work, personal): **shape:** title (for the
list), colour; **body:** name, pronouns, job title, organisation, department, emails, phones, website, address, social profiles (a label and an
address each), a short note; **files:** a photo, a logo.

### 19.2 Showing and sending it

| Way                      | How                                                                                                                                             | Where it works                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **QR code**              | A vCard 3.0 in a QR code (MECARD if the vCard is too large for a readable code), shown full screen; a phone's camera offers to add the contact  | Everywhere, offline                                                                     |
| **`.vcf` file**          | vCard 3.0 (the version iOS and Android both read), with the photo inline                                                                        | Everywhere                                                                              |
| **Share sheet**          | `navigator.share({ files: [card.vcf] })`: AirDrop, Quick Share, Messages, mail. **This is how a PWA sends over Bluetooth** (§20, research 0001) | iOS Safari, Android Chrome, desktop Safari and Chrome where supported; hidden otherwise |
| **NFC tag**              | Written with Web NFC (§20.3)                                                                                                                    | Chrome on Android                                                                       |
| **Apple, Google Wallet** | A pass (§20.1, §20.2)                                                                                                                           | Where the operator has set them up                                                      |
| **Public page**          | `/c/<slug>` (§19.5); the QR code can point to it instead, which is smaller and always current                                                   | Where the operator allows it                                                            |

`src/core/vcard/` writes vCard 3.0 and 4.0 and MECARD, escaping as the RFCs require, and reads them (§19.4); it is pure and tested against the RFCs'
examples and files exported by iOS and Android.

### 19.3 Leaving the encryption, said plainly

A business card is meant to be given away. **The card in the wallet stays encrypted**; each way of sending it hands a readable copy to whoever
receives it. A pass sends it through the server to Apple's format or Google's servers, and a public page puts it on the server in readable form. Each
says so in a sentence before the first use.

### 19.4 Received contacts

A `contact` entry keeps a card someone gave: from scanning a vCard or MECARD QR code (§13.2's scanner), from a `.vcf` file (opened, shared to Wallet,
or dragged), or from an NFC tag (§20.3). **Shape:** name, organisation; **body:** the vCard's fields as read, where and when met, notes. A contact can
be downloaded as `.vcf` to the device's address book. This is a small list, not an address book.

### 19.5 The public page

`/c/<slug>`, opt-in per business card and only where the operator sets `WALLET_PUBLIC_CARDS=on`: **Publish** sends a readable copy (fields and photo)
to the server, sealed under the server's key at rest (§8.7) and served at a random slug as a simple page with a **Download contact** button, no
tracking, and `noindex` unless the person chooses to be found. **Unpublish** deletes it. Editing the card asks whether to update the published copy.

## 20. Phone wallets, NFC and the share sheet (phase 3)

Research 0001 is the detail. In short: **a PWA cannot reach NFC on iPhone, cannot emulate a card or talk Bluetooth to another phone anywhere, and
WebAssembly adds no hardware access.** What it can do is below.

### 20.1 Apple Wallet

- **A signed `.pkpass`** (a generic pass), made by the server and opened by Safari, which shows **Add to Apple Wallet**; elsewhere it downloads.
- **For a business card** (its QR as the pass's barcode, name, title, organisation, photo) and **for any card** whose code Apple Wallet can show (QR,
  PDF417, Aztec, Code 128); other formats cannot, and the button says so.
- **The browser sends the readable fields** to `POST /api/passes/apple`; the server builds and signs the pass in memory (`passkit-generator`, MIT, or
  PKCS #7 signing directly; checked in 15.1) and returns it. **Nothing is stored and nothing is logged** but the count. Passes are not updated later
  (no web service URL).
- **Needs the operator's Apple Developer account:** a Pass Type ID certificate and key, the team id, and Apple's WWDR certificate
  (`WALLET_APPLE_PASS_TYPE_ID`, `WALLET_APPLE_TEAM_ID`, `WALLET_APPLE_PASS_CERT`, `WALLET_APPLE_PASS_KEY`, `WALLET_APPLE_PASS_KEY_PASSWORD`,
  `WALLET_APPLE_WWDR_CERT`). Without them the button is hidden.

### 20.2 Google Wallet

- **A "Save to Google Wallet" link:** the browser sends the readable fields to `POST /api/passes/google`; the server returns a link carrying a JWT
  signed with the operator's service account, holding a generic pass class and object inline. The browser navigates to `pay.google.com`, a page the
  person chooses to open, not a request Wallet makes in the background.
- **For a business card and any card** whose code Google Wallet can show (QR, Aztec, PDF417, Code 128, Code 39, EAN-13, UPC-A, ITF, Data Matrix).
- **The content is stored by Google** once saved; the dialog says so.
- **Needs the operator's Google Wallet issuer account** and a service account key (`WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_SERVICE_ACCOUNT_KEY`).
  Without them the button is hidden.

### 20.3 NFC tags (Chrome on Android)

Shown only where `NDEFReader` exists:

- **Write a business card to a tag:** a vCard as a `text/vcard` MIME record, or a URL record to the public page if the vCard is too large for the tag
  (an NTAG213 holds 144 bytes, an NTAG215 504, an NTAG216 888); the screen says how large the card is and which tags fit. Optionally made read-only,
  after a warning that this cannot be undone.
- **Read a tag:** a vCard or URL record becomes a received contact (§19.4); a text record can be saved as a note.
- Nothing else: Web NFC reads and writes NDEF only. Transport cards, payment cards and passport chips cannot be read (§31.3).

### 20.4 The share sheet

`navigator.share` with files is the way a PWA reaches **AirDrop and Quick Share**, so it is the transfer used for business cards (`.vcf`), backup
files, watermarked copies and print-to-PDF output, wherever the browser supports sharing files (`navigator.canShare`). Elsewhere, a download.

## 21. More in the wallet (phase 3)

### 21.1 Watermarked copies

From a document, **Make a copy for someone:** choose pages, type who it is for and why ("Copy for Acme Bank, account opening, 2026-11-09"), optionally
cover parts (draw boxes over the number, the MRZ, the photo), and Wallet draws the text diagonally across each page, repeated and semi-transparent, in
the browser (canvas; PDF pages rendered by pdf.js), and makes **JPEG images or one PDF** (`pdf-lib`, MIT). It is downloaded or shared (§20.4), never
uploaded. A copy is not kept, unless the person saves it to the document as a page labelled "copy".

### 21.2 Importing a `.pkpass`

A pass file (from a mail, a site, AirDrop; opened, shared to Wallet or dragged) is read in the browser (`fflate`, MIT): its barcode, its fields,
colours, logo and relevant date become a **card** (store cards, generic passes, coupons) or a **ticket** (event tickets, boarding passes). Its
signature is not checked, and the card says it was imported.

### 21.3 Insurance

An `insurance` entry: **shape:** `person_id`, title, insurance type (`health`, `travel`, `car`, `home`, `life`, `other`), insurer, renews on;
**body:** policy number, member number, who is covered (family members), cover from and to, what it covers (notes), the hotline, the emergency number,
the claims address; **files:** policy documents; optionally a **code**, shown like a card. Renewals are in Due.

### 21.4 Tickets

A `ticket` entry: **shape:** `person_id`, title, starts at, ends at; **body:** venue or route, seat, booking reference, the code, notes; **files:**
the ticket. Shown like a card; listed by time; **archived automatically** a day after it ends; today's and tomorrow's in Due.

### 21.5 Secure notes

A `note` entry: **shape:** title; **body:** text, rendered as text. For recovery codes, a locker combination, a Wi-Fi password to share. Wallet offers
no password generator, no autofill and no browser extension: it is not a password manager.

## 22. One-off encrypted share links (phase 3)

To show a doctor a summary, a report or a document without printing, and without an account (the owner's request to share the medical summary).

- **What can be shared:** the medical summary, a doctor's report (§18), a document's pages or a watermarked copy (§21.1), a lab report, or a business
  card. The browser makes a **frozen snapshot**: the rendered content as JSON and its files.
- **How:** the browser makes a random key `K`, encrypts the snapshot with it (§8.2 and §8.3's formats, with the share's id as AAD), uploads the
  ciphertext to `POST /api/shares`, and makes the link **`https://<wallet>/s/<id>#<K>`**. The key is in the fragment, which browsers never send to a
  server. Optionally a **passcode**, mixed into `K` with Argon2id, for a link sent by a channel the person does not trust.
- **Limits:** an expiry (an hour, a day — the default —, a week; at most `WALLET_SHARE_MAX_DAYS`), an optional number of opens, and **Revoke** at any
  time. The server deletes the ciphertext when it expires, is revoked or reaches its opens.
- **Showing it:** the link as a **QR code** full screen (for a doctor's phone), copied, or sent through the share sheet.
- **Opening it:** `/s/<id>` is a public page that fetches the ciphertext and decrypts it in the recipient's browser, read-only, with a print button.
  The server sees that it was opened, not what it holds.
- Settings > Sharing lists live links with their expiry and opens.

## 23. Backup, export and import

### 23.1 The backup format

`src/core/backup/` and `docs/specs/backup-format.md`. A **snapshot** is a ZIP (stored, not compressed, since ciphertext does not compress) of:

- `manifest.json`: `format: "sovereign-wallet-backup"`, `version`, when it was made, by which app version, the account id, counts.
- `keyring.json`: the account's wrapped roots (§7.4) and the vault's records (RFC 0008's export), which open nothing without the account's key.
- `entries.jsonl`: every entry's row as the server or the device has it: id, tier, holder, version, key epoch, shape, body (when present), file ids
  and each file's SHA-256.
- `files/<sha256>`: the files' ciphertext (in a backup file), or nothing (in git, where files are kept apart, §23.3).

**A snapshot is not encrypted again:** every entry and file in it is already ciphertext, and an outer layer would be a format of Wallet's own beside the suite's (§8). So it
shows how many entries there are, as the server's copy does. **It opens with the account's key:** the password or the recovery kit, standalone; core's release, hosted.

**Core's export of a person** (`signIn.export`, manifest 5): when the person downloads their data from Sovereign, core asks Wallet for its part at
`/api/sovereign/export` with a signed token the SDK checks. The part is what the server holds, as a snapshot holds it: the wrapped roots and every entry that is not
deleted, its shape and body as stored, in base64url, in files marked end to end (`src/portability/core-export.ts`). It opens with the account's key, as core's own export
does (RFC 0008); the server reads none of it.

### 23.2 The backup file

**Made in the browser,** from Settings > Backup or Due: `wallet-backup-<date>.zip`, holding **everything this device can open**: Synced entries, the
Device only entries it holds, and Online only entries fetched for the purpose, with their files. Downloaded or shared (§20.4). A device remembers when
it last made one (for Due, §10.7).

- **Restore** (Settings > Backup, or a lost entry's **Restore**): the file is opened with the account's key (the password or the recovery kit), checked whole, and the
  person chooses **everything** or **only what is missing or lost**. Restored entries keep their ids and tiers (Device only ones become held by this
  device); an entry newer in the wallet than in the file is kept, and the restore says how many it skipped. A file from another account is re-keyed: its
  entries are opened with that account's key, asked for by its password or kit, and sealed into this wallet, with new ids.
- A file from a newer format version is refused with a sentence.

### 23.3 Backup to git

**As Tusk's §21, with what the server holds being ciphertext,** so the backup is as private as the wallet.

- **Connecting:** Settings > Backup, the GitHub App (`WALLET_GITHUB_APP_*`) or a fine-grained token for one repository; checked in Tusk's order; **the
  repository must be private**; the credential kept through `src/crypto/` (§8.7). `WALLET_GITHUB_API_URL` covers Enterprise Server. Any repository
  works, a Fjord one included (`wallet/` is an ordinary folder outside every vault).
- **What is committed:** under `wallet/` on the default branch:
  - `wallet/snapshots/YYYY-mm-dd_hh-mm-ss.zip`: a snapshot (§23.1) **without file contents**. **The server can make it without reading anything:** it holds
    only ciphertext and the wrapped roots.
  - `wallet/files/<sha256>`: each file's ciphertext, **written once, named by its hash, never changed**, so a 300 MB wallet is not committed again
    every day. A file is committed in the first backup after it arrives.
- **Device only entries are in it as shapes only** (which is what the server has), so a restore from git shows them as lost; their content is in
  backup files only. **Online only entries are in it whole.**
- **Manual or auto** (every 6 hours, day — the default —, or week); a job, claimed in the database; nothing changed, nothing committed (the account's
  `seq` is the fingerprint); a moved branch retried once; failures kept and shown; a token that stopped working, a repository gone or made public
  **stops auto backup**, adds a notice (§24) and a Due item.
- **Nothing is ever deleted or rewritten,** as in Tusk: an entry deleted from the wallet or moved off the server stays in older snapshots and its
  files stay in `wallet/files/`. Settings says so when connecting.
- **Paused in fully offline mode** (§10.7), with a sentence saying why.
- **Restore from git:** Settings > Backup lists snapshots (through the server); choosing one has the server fetch it and the files it names and hand
  them to the browser, which opens and restores as from a backup file (§23.2).
- **What GitHub sees:** a private repository with files of random-looking bytes, their sizes and their number, and the times of commits.

### 23.4 The readable export

For leaving Wallet with data a person can read anywhere (building-an-app's "a person can leave"): **Export a readable copy** makes, in the browser, a
ZIP of `wallet.json` (every entry it can open, as plain JSON with a `format` and `version`) and the files in folders by family member and kind, with
their original names where known. A warning comes first: "This file is not encrypted. Anyone who gets it can read everything in it." It is downloaded,
never uploaded. **Import** (Settings > Backup) reads the same format into new entries, sealed in the browser, so a round trip works and other apps can
produce it.

## 24. Notices

Few, and about the account, since the server cannot read entries:

| Kind             | When                                                              | Channels                                 |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| `new_device`     | A device signs in to the account for the first time               | Bell on other devices, email (always on) |
| `keys_changed`   | The password or recovery kit was changed, or the wallet was reset | Bell, email (always on)                  |
| `backup_stopped` | Auto backup stopped (§23.3)                                       | Bell, email                              |
| `rotation_done`  | Rotating everything finished (§7.5)                               | Bell                                     |
| `reminder` (3)   | A reminder's moment (§15.2), content-free                         | Push, email                              |

- **The bell** is Wallet's own (Tally's notices and `NotificationsPanel`), raised in the change's transaction. Hosted, core's bell gets the same
  (`notifications:send`).
- **Mail** goes through `mail_outbox` (Tally's), by core's email for a linked account (`email:send`) or Wallet's SMTP (`WALLET_SMTP_*`); without
  either, bell only, said in Settings. **Security notices cannot be turned off.**
- **Core's activity page** (`activity:write`) gets "Backup made", "Backup file restored", "Readable export made", "Wallet key replaced" — never an
  entry's content.

## 25. Sign-in and core

### 25.1 Sign-in

**The suite's `@sovereignfs/auth`** (since 0.4.0; `sovereign`'s auth.md), with `WALLET_` settings: better-auth on the package's preset, in a
store of its own (`wallet_auth`, opened again in the package's shape, `src/auth/store.ts`). **An instance signs people in one way, never both**, as
Shopper's (its §15.1), from one image:

| Mode                                     | Who signs in, and how                                                                                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suite mode** (`WALLET_CORE_*` are set) | Everyone, through core: the package's `./core` on the SDK's steps (PKCE, matched by `sub`), `WALLET_CORE_URL` being the instance's own address                                                                                                  |
| **Standalone mode** (no core)            | Everyone, with Wallet's own accounts (`WALLET_AUTH_LOCAL=1`): a password, passkeys and an authenticator app with backup codes; verified, and a reset asked for, by mail when set up; a reset link an operator makes (`wallet-admin`) needs none |

- **In suite mode `/sign-in` and `/sign-up` show nothing:** someone with a session goes to the front address, anyone else straight to
  `/api/auth/sign-in/sovereign`, and `/sign-up` asks core to open its sign-up page (`prompt=create`: Sovereign 0.140.0 or later; before it, core shows
  its sign-in, which has no way to make an account). Coming back from core with `?error=` shows a small page with the reason and _Try again_ and does not
  redirect, so that a failure at core cannot loop; a core that cannot be reached is said so. The landing page's button says _Sign in with Sovereign_. There
  is no password, sign-up, reset, passkey or second step here: they are core's, and their routes answer 404. Settings > Account says who core says the
  person is and links to core's profile and security pages; **deleting the account is core's too** (§28).
- **Standalone, the forms are the design system's** (`SignInForm`, `SignUpForm` and the reset pair of `@sovereignfs/ui`, as core renders them). **The
  server never receives a password, with one exception that ends:** the page derives a sign-in value from it, the address and the instance's vault id
  (`/api/sign-in-salt`), and checks the length itself. The exception is a password stored before 0.4.0, which moves at its next sign-in, for 90 days from the
  first start after the upgrade (`movePasswords`, the package's protocol: auth.md §8.1). While one can still move, which the salt document says, a sign-in
  that the derived value does not open sends the password itself, once, with the derived value, over https, to the package's route, limited to five tries an
  hour for an email address and five a minute for a caller, which checks it against the old hash, puts a hash of the derived value in its place and signs nobody in. Wallet logs nothing of a
  request's body. An instance made at 0.4.0 or later has no such window, and neither has one in suite mode. Email is verified, and a reset asked for, only with
  mail set up. **Using a reset link needs no mail:** the pages it leads to are there on every standalone instance, and only asking for one is mail-only (the
  package's own split). **An operator gives an account back with a link** (`docker compose exec web node tools/wallet-admin.mjs accounts reset-link EMAIL`, task 2.9): it works once, for an hour, and ends
  every session of the account when it is used. It is the package's `resetLink` and nothing else: it runs no migration, opens no app store, prints only the link on the standard
  output and says nothing of it that holds the link or the address, and refuses in suite mode, where the passwords are Sovereign's (core has `sovereign-admin accounts
reset-link` for those). **A reset gives back the account, not the wallet's keys:** it replaces the sign-in value but cannot open the account key, so the person unlocks with the recovery kit and chooses the new password for it (§7.5), and a lost authenticator app is not reset by it.
- **An instance configured with both** (`WALLET_CORE_*` and `WALLET_AUTH_LOCAL=1`) **starts in suite mode** and says once at start-up that its local
  sign-in is off and which settings to remove; nothing else changes. Its password accounts cannot sign in while it is in suite mode.
- **There is no linking** of a core account and a local one: an instance has one kind. A person is their better-auth user id; a `sub` is identity; an
  email is never matched to an account at sign-in. A session through core is checked against core every hour, and signing out of one goes through core.
  Wallet keeps none of core's tokens (`src/auth/sdk-stores.ts`). **Signing in unlocks the wallet** (§9.4): a password derives the unlocking value, and core releases the app key (§7.1).

### 25.2 Core's notices

Back-channel logout at `/api/sovereign/backchannel-logout` (ends the session; the device locks and keeps its store) and account deleted at
`/api/sovereign/account-deleted` (running `People.deletePerson`, answering `200` only once rows and files are gone), verified by the package's `coreNotices`,
replays refused by their `jti` in the auth store, behind Wallet's own body cap and rate limit (`src/sovereign/notices.ts`), counted by each caller's address (§30). A logout that names a
core session ends only the sessions that came from it.

Core's request for a person's export (`/api/sovereign/export`, §18) has no session either, so it has the same two guards, in a count of its own, and answers on
the process's one SDK client: core's discovery document is fetched once and kept (it was fetched for every request, by a client made for each), core's keys
only when a token is well formed enough to be checked, which the limit bounds, and a token's `jti` is kept in the auth store, so a replay is refused after a
restart and by every process.

### 25.3 The manifest

```json
{
  "manifest": 2,
  "prefix": "wallet",
  "name": "Wallet",
  "description": "Your cards, documents and health records, encrypted in your browser, and working offline",
  "icon": "/icons/icon.svg",
  "port": 3006,
  "health": "/api/health",
  "launch": "/",
  "signIn": {
    "redirect": ["/api/auth/callback/sovereign"],
    "backChannel": "/api/sovereign/backchannel-logout",
    "accountDeleted": "/api/sovereign/account-deleted",
    "scopes": ["openid", "profile", "email"]
  },
  "database": true,
  "data": ["/data"],
  "generate": ["WALLET_AUTH_SECRET", { "name": "WALLET_ENCRYPTION_KEY", "bytes": 32 }],
  "core": ">=0.57.0 <1.0.0"
}
```

- **`data`:** the files' ciphertext under `/data/blobs`, and the SQLite file form's database.
- **`WALLET_VAPID_PRIVATE_KEY`** joins `generate` in phase 3, if `generate` can make one (§32).
- **Phase 4** adds `directory` and `offline_access` for finding family members on the instance (§31.1).
- `pooling` is not set: the jobs take locks.

### 25.4 Core's services

| What                  | Hosted                                                          | Alone                      |
| --------------------- | --------------------------------------------------------------- | -------------------------- |
| Sign-in               | Core only (suite mode, §25.1)                                   | Local accounts             |
| Notices               | Wallet's bell, and core's bell (`notifications:send`)           | Wallet's bell              |
| Email                 | Core's (`email:send`) for accounts; Wallet's SMTP for addresses | Wallet's (`WALLET_SMTP_*`) |
| Backup, export, keys  | A line on the person's activity page (`activity:write`)         | Nothing                    |
| Files, backup, passes | **Wallet's own, always**                                        | Wallet's own               |

A call to core that fails, is refused or is not supported changes nothing but that call.

## 26. Interface

Designed anew, with `@sovereignfs/ui`.

### 26.1 Principles

- **Fast to the card.** From a locked phone to a code on screen in a glance and a tap.
- **Always say where things live.** Every entry carries a small chip ("This device", "Synced", "Online only") and a lost or elsewhere state; no
  surprise about what a device holds.
- **Say what the server can see** wherever a choice changes it, in one plain sentence.
- **Calm health screens:** values, dates, the report's ranges; no red alarms, no scores.

### 26.2 The shell

- **Header:** the app's name, search, the family switcher, the lock button, the bell, the avatar menu (and the launcher when hosted).
- **Desktop:** a side navigation: Home, Cards, Documents, Health (phase 2), Journal (phase 2), More (phase 3: business cards, contacts, insurance,
  tickets, notes), Settings.
- **Phone:** `MobileFooter` with **Home** and **Cards** left of the launcher, **Documents** and **Health** right (Health holds the journal as a tab in
  phase 2; before phase 2, the right side is Documents and Family). An **Add** floating button opens a sheet of what can be added on the current
  screen.
- **The lock screen** replaces everything when locked: the app's mark, **Unlock** (passkey) and the other ways (§9.3).

### 26.3 Setup

`/setup`, shown after the first sign-in on an account with no keyring root, one step at a time (the design system's step flow, §26.7):

1. **Welcome:** what Wallet is, and "Your wallet is encrypted in your browser. Keep your recovery kit: it is the way back if you forget your password."
2. **Your recovery kit** (standalone; hosted, core's): shown once, to print or save, and confirmed (§7.2).
3. **Unlocking this device:** a passkey (offered first where PRF exists), a passcode, or both, **at least one**, since without one a restart with no signal cannot open the
   wallet (§9.2); the lock timers. This is where the device first makes the keyring root (§8.1).
4. **Where things live:** the defaults per kind, or fully offline (§10.6, §10.7).
5. **Install Wallet:** the platform's way to install, and persistent storage requested.
6. **Me:** the name, from the profile, editable; done.

**A new device** on an account with a wallet: sign in (the password, or core's release) opens the suite's key and fetches the root, then "Is this the same device
as…?" (§6.3), the unlock method, install.

### 26.4 Home and search

Home: **Due** (§15) at the top; **favourite cards** as a swipeable row; **recent** entries; the storage message when it applies (§10.8); and, in fully
offline mode, when the last backup file was made. **Search** (header, or `/` on a keyboard) covers every open entry's shape and body, across kinds, in
memory (`src/core/search/`: normalised, accent-insensitive prefix matching, ranked by field); Online only entries are searched by their shape only,
and results say so.

### 26.5 Screens and addresses

| Address                                                                                                                                                                    | Screen                                              | Phase |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----- |
| `/`                                                                                                                                                                        | Home (signed out: the landing page)                 | 1     |
| `/setup`, `/unlock`                                                                                                                                                        | Setup (§26.3); the lock screen                      | 1     |
| `/cards`, `/cards/new`, `/cards/<id>`, `/cards/<id>/show`                                                                                                                  | Cards, adding (scan or type), a card, full screen   | 1     |
| `/documents`, `/documents/new`, `/documents/<id>`                                                                                                                          | Documents, adding, a document with its pages        | 1     |
| `/family`, `/family/<id>`                                                                                                                                                  | Family members, a member's entries                  | 1     |
| `/settings/…`                                                                                                                                                              | §27                                                 | 1     |
| `/health`, `/health/measurements/<type>`, `/health/labs`, `/health/labs/<id>`, `/health/tests/<code>`, `/health/medical-id`, `/health/medications`, `/health/vaccinations` | Health                                              | 2     |
| `/journal`, `/journal/new`, `/journal/<id>`                                                                                                                                | The journal                                         | 2     |
| `/print/summary/<person>`, `/print/report`                                                                                                                                 | Printable pages (§18)                               | 2     |
| `/business-cards`, `/contacts`, `/insurance`, `/tickets`, `/notes` (and `/<kind>/<id>`)                                                                                    | Phase 3's kinds                                     | 3     |
| `/c/<slug>`, `/s/<id>`                                                                                                                                                     | Public: a published card; a share link (§19.5, §22) | 3     |

An entry's page always shows its family member, where it lives, when it was last changed and on which device, and its menu: edit, **Where it lives**,
favourite, archive, delete (with **Undo** for ten seconds, then a tombstone).

### 26.6 Phone and PWA

**One responsive tree** (the guide's rule): the same routes and decisions at every width, only rendering forked.

- **Installable as a full PWA,** from the suite's `@sovereignfs/pwa` (its manifest, its worker and its registration, which announces a new version
  with Reload): the service worker keeps the shell by allow-list and the one shell page; offline, every address is answered by the shell, which reads
  the store, and says an address that is not the wallet's needs a connection. Background Sync is added after the package's text until its `sync` option
  is released. **No entry, decrypted or not, is ever in the service worker's cache.**
- **The manifest** has shortcuts (Cards, Add a card, and in phase 2 Journal entry, Weigh in), `display: standalone`, theme colours from the tokens.
- **Share target (phase 2, where supported — Android):** sharing an image, a PDF, a `.vcf` or a `.pkpass` to Wallet opens "Add to Wallet" with the
  file; the service worker holds the shared file in memory (or, if the wallet is locked, in a store encrypted under a key wrapped like the unlock
  wrappers, deleted after use) until unlocking.
- **The camera** (scanning, page capture) and **Wake Lock** (showing a card) ask for permission only when used.

### 26.7 Design system

Imported from `@sovereignfs/ui` directly, pinned exactly; style with `--sv-*` tokens only; Hanken Grotesk served by the app. Parts used: layouts,
`Header`, `MobileHeader`, `MobileFooter`, the `Auth` components, forms, `Dialog`, `Sheet`, `Drawer`, `Toast`, `NotificationsPanel`, `DataTable`,
`DatePicker`, `SwipeStack`, `Icon`. **Built in `sovereign` first** (epic 21), checking what already exists:

- **A line chart** with a reference band and markers (measurements, BMI, trends), shared with Tally's charts.
- **A document viewer** for images and PDF pages, with zoom and rotate, shared with Roam's photo viewer.
- **A passcode input** and **a step flow** (setup).
- **A rating scale** (mood, energy).
- **Barcode display and a camera scanner** are built in `src/barcode/` first, as a module with no app dependency, and offered to the design system
  once they settle (21.7).

## 27. Settings

`/settings`, from the avatar menu:

- **Profile:** name and email (§6.1); units for health (phase 2).
- **Security:** the password and the recovery kit (change, make a new kit: the suite's; hosted, core's), rotate everything (a new root, §7.5), reset wallet; this
  device's unlock methods (passkey, passcode) and lock timers (§9.2); devices (rename, remove; §6.3).
- **Storage:** fully offline (§10.7); default tier per kind (§10.6); this device: persistent storage granted or not, space used and quota, entries
  held here, lost entries; the Safari message (§10.8).
- **Backup:** make and restore a backup file, the reminder interval (§23.2); git backup: connect, mode, last and next, restore (§23.3); readable
  export and import (§23.4).
- **Family:** family members (§12).
- **Due:** warning windows per document type (§14.3); snoozed items.
- **Notifications:** each kind by channel, what is unavailable said; phase 3: reminders while closed (§15.2), this device's push.
- **Sharing (phase 3):** published cards, live share links (§19.5, §22).
- **Sign-in:** password, sign-in passkeys, two-factor, linking core, as Tusk's.
- **Account:** sign out (§11.8), delete account (§28).

Preferences that follow the person (defaults, Due windows, snoozes, units, mood labels) are in the `settings` entry, encrypted; preferences of one
device (lock timers, unlock methods) stay on that device.

## 28. Account deletion

**`People.deletePerson`** (`src/sovereign/people.ts`, as Tusk's) removes everything of an account. One routine, safe to run again; the `sub` link goes
last.

- **Removed:** the vault, every entry and tombstone, every file under `/data/blobs/<account id>`, devices, `profile`, settings rows, the backup
  connection and its credential, notices, mail queued, applied mutations, rate counters, and in phase 3 published cards, share links, reminders and
  push subscriptions, and better-auth's rows.
- **Not touched:** the person's git repository and any backup file they downloaded.
- **Standalone**, reached from **Settings > Account**, after the password and typing "delete", saying what goes and that git backups stay. **In suite
  mode deleting the account is core's** (§25.1): Settings > Account links to core's delete page, `/api/account/delete` says where core is and refuses a
  deletion, and nothing here stands in for a password (a session made a moment ago once did, and proved only that core's session was alive). It is reached
  from **core's account-deleted notice** (§25.2), answered `200` only once rows and files are gone. This device's store is erased; other devices learn at
  their next sync and erase theirs.
- A test seeds one row of every table and a file for the person and a second person, and finds nothing of the first after, the second intact. A new
  table that holds something of a person fails it until it is handled.

## 29. Data model and database

### 29.1 Database

**As Tusk's §23.1, with `WALLET_`:** `WALLET_DB_DIALECT` is `sqld` (default; namespaces `wallet` and `wallet_auth`), `sqlite` (`file:/data/wallet.db`,
`wallet_auth.db` beside it) or `postgres` (schemas `wallet` and `wallet_auth`). Drizzle, a schema and a migration set per dialect, generated, applied
at start-up under a lock; a parity test across dialects. Standard SQL, values bound; no `LISTEN/NOTIFY`, trigger, extension or foreign key; every
deletion names what it deletes, in a transaction. Tests run on all three and read `WALLET_TEST_*` only.

### 29.2 Representations

As Tusk's column vocabulary: UUIDs, **made by the device for entries, files and devices** (refused if the id belongs to another account) and by the
server otherwise; moments `epochMs` (`bigint` on PostgreSQL); **sealed values as binary** (`blob` / `bytea`), opaque to the server; `(k)` marks what
is sealed under the server's key (§8.7).

### 29.3 Tables

Beyond better-auth's, in the auth store.

| Table                                                   | Columns                                                                                                                                                                                                                     | Phase |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `profile`                                               | `account_id` (key), `core_sub`, (k) name, email, `created_at`, `updated_at`                                                                                                                                                 | 1     |
| `keyring`                                               | `account_id`, `epoch` (key), `wrapped_root` (binary), `created_at`                                                                                                                                                          | 1     |
| `account_stream`                                        | `account_id` (key), `seq`, `mode` (`normal`, `offline`)                                                                                                                                                                     | 1     |
| `entry`                                                 | `id`, `account_id`, `tier` (`device`, `synced`, `server`), `holder_device_id`, `version`, `seq`, `key_epoch`, `shape`, `body`, `file_count`, `bytes`, `deleted_at`, `created_at`, `updated_at`                              | 1     |
| `entry_file`                                            | `id`, `account_id`, `entry_id`, `bytes`, `sha256`, `state` (`pending`, `ready`), `created_at`                                                                                                                               | 1     |
| `device`                                                | `id`, `account_id`, `session_id`, `label` (sealed by the browser under a key derived from the root), `created_at`, `last_seen_at`, `removed_at`                                                                             | 1     |
| `backup_connection`                                     | As Tusk's: `account_id` (key), `kind`, `repository`, `branch`, `credential_id`, `mode`, `frequency`, `next_backup_at`, `last_backup_at`, `last_backup_path`, `last_seq`, `failure_kind`, `failures`, `stopped_at`, `paused` | 1     |
| `backup_file`                                           | `account_id`, `sha256` (the key): files already in the repository                                                                                                                                                           | 1     |
| `notice`, `notice_pref`, `mail_outbox`                  | As Tally's, with Wallet's kinds; addresses in (k)                                                                                                                                                                           | 1     |
| `applied_mutation`                                      | As Tusk's, per account                                                                                                                                                                                                      | 1     |
| `credential`, `notice_seen`, `job_claim`, `rate_bucket` | As Tusk's                                                                                                                                                                                                                   | 1     |
| `published_card`                                        | `id`, `account_id`, `entry_id`, `slug` (unique), `indexable`, (k) content, `photo_file`, `created_at`, `updated_at`                                                                                                         | 3     |
| `share_link`                                            | `id`, `account_id`, `bytes`, `expires_at`, `max_opens`, `opens`, `revoked_at`, `created_at`; its ciphertext under `/data/shares`                                                                                            | 3     |
| `reminder`                                              | `id`, `account_id`, `at`, `channels`, `sent_at`                                                                                                                                                                             | 3     |
| `push_subscription`                                     | `id`, `account_id`, `device_id`, (k) endpoint and keys, `created_at`                                                                                                                                                        | 3     |

**Tombstones are entries with `deleted_at`,** their shape and body cleared, kept 90 days. Indexes: entries by `(account_id, seq)` and
`(account_id, id)`; files by entry; devices by account; the outbox by `next_attempt_at`; reminders by `at` where not sent; share links by
`expires_at`.

### 29.4 The device's store

IndexedDB `wallet-<account id>`, through `idb`, object stores: `meta` (device id, cursor, mode), `unlock` (wrappers, §9.3), `entries`
(the server's row, the base for merging), `files` (ciphertext as `Blob`s), `outbox`, `pending_files`, `local` (this device's lock timers, last backup
file). A schema version with upgrade steps, tested with fake-indexeddb.

### 29.5 Limits

Every limit is a setting (as Roam), with these defaults: storage per account `WALLET_STORAGE_MAX_ACCOUNT_MB` = 500; a file `WALLET_FILE_MAX_MB` = 25;
an entry's shape 4 KB and body 256 KB (`WALLET_ENTRY_MAX_KB`); entries per account `WALLET_LIMIT_ENTRIES` = 50,000; devices per account
`WALLET_LIMIT_DEVICES` = 20; share links (phase 3) `WALLET_SHARE_MAX_DAYS` = 7 and `WALLET_LIMIT_SHARES` = 50 live. Going over is refused with a
sentence.

## 30. Security, deployment, testing

### Security

As Tusk's §24: a strict CSP with a per-request nonce, `connect-src 'self'`, `script-src` with `'wasm-unsafe-eval'` for zxing-wasm and hash-wasm (and
nothing else unsafe), `worker-src 'self'` for pdf.js's worker, `img-src 'self' blob: data:` for decrypted images, no `'unsafe-inline'`; nothing
third-party loads; what people write is rendered as text, never HTML; `Permissions-Policy` allowing camera and wake lock for the app's own origin
only; `Referrer-Policy: strict-origin-when-cross-origin`, since core releases an app's key silently only when the browser names the app's origin (sdk §9.3), and `no-referrer`
would ask the person every time. **Logs hold no entry content, ever, and no names or addresses:** an id and a kind of failure (and the server has no content to log). Every
route, operation and mutation finds the session and carries the permission in its statement (§5.2); a write checks `Origin`. **Rate limits:** sign-in,
sync, file uploads, key operations, passes, share links and their opening. **Sign-in, and core's notices and export, are counted by the caller's address**, which is
what the reverse proxy says in `X-Forwarded-For` and nothing a client wrote: one address alone is believed, or, behind the proxies `WALLET_AUTH_TRUSTED_PROXIES`
names, the first hop from the right that is not one of them (`src/limits/address.ts`, the rule better-auth uses for the sign-in's own limit). An address
nobody can state is counted with the others like it, never with a named client's. **A security review before each release,** and **an independent review of
the encryption design before 1.0** (§33).

### Licence

AGPL-3.0-or-later, since it bundles `@sovereignfs/ui`. `idb` (ISC), `bwip-js` (MIT), `zxing-wasm` (MIT, with
zxing-cpp Apache-2.0), `hash-wasm` (MIT), `pdfjs-dist` (Apache-2.0), and in phase 3 `pdf-lib` (MIT), `fflate` (MIT) and the pass signer are checked in
the tasks that add them, and their licences shipped in the image.

### Deployment

One image (Debian, for libSQL), not root, on port 3006, and three Compose setups in `deploy/`:

```bash
docker run -v wallet:/data -e WALLET_DB_DIALECT=sqlite -e WALLET_SQLITE_URL=file:/data/wallet.db \
  -e WALLET_URL=https://wallet.example.com -e WALLET_AUTH_LOCAL=1 -e WALLET_AUTH_SECRET=… -e WALLET_ENCRYPTION_KEY=… ghcr.io/sovereignfs/wallet
```

- **Settings:** the shared names of `contracts/env.md`, and Wallet's own: `WALLET_WORKER`; the limits of §29.5; `WALLET_GITHUB_APP_*`,
  `WALLET_GITHUB_API_URL`; phase 3: `WALLET_PUBLIC_CARDS`, `WALLET_APPLE_*`, `WALLET_GOOGLE_*`, `WALLET_VAPID_PRIVATE_KEY`. Each declared once in
  `@sovereignfs/config`, in `.env.example` and in the README.
- **Hosted:** `sv app add wallet`, from the manifest; the operator grants the three app scopes and sets `WALLET_SMTP_*` for mail when not using
  core's.
- **Releases** as every app's: a promotion titled `Release vX.Y.Z` tags and publishes amd64 and arm64 to `ghcr.io` on merge (`RELEASING.md`); a patch has no migration.
- `/api/health` answers `200` once the database is ready and `/data` is writable.
- **The operator's tool,** `tools/wallet-admin.mjs` (§25.1), is one file bundled by `scripts/build-tools.mjs` in the build stage and copied to `/app/tools`, since the image holds
  a traced server and no TypeScript; the database drivers it leaves outside are in the server's own `node_modules`. The deploy check runs it in every setup that comes up.
- **The operator's backups** are the database's and `/data`'s; a person's backups (§23) are theirs. An operator restoring an old database brings back
  old ciphertext, which devices treat as an older server state (the cursor is ahead: a fresh snapshot after sending the outbox).

### Testing

- **The encryption:** known-answer tests for the derivation (a fixed root and ids give fixed entry keys), the document ids and the padding buckets; tampering with a byte,
  the id, the version, or moving a value to another entry, part or account fails to open; **the suite's marker test** (a random marker in a title, a name and a file, in plain,
  base64 and hex, found in no row, file or dump the server or the device keeps); the spec's vectors pass in Node and in the browser (Playwright).
- **The keyring:** each unlock way; the idle and hidden locks on a mocked clock; locking clears the index, object URLs and keys; five wrong passcodes
  remove the wrapper; a raw dump of IndexedDB holds no plaintext (a test greps it for every seeded title and value).
- **Tiers:** every move of §10.4; the server refuses a body for a Device only entry, a tier change from a non-holder, any body in fully offline mode;
  an Online only entry never reaches IndexedDB, Cache Storage or the service worker cache (Playwright inspects each).
- **Sync:** a replay, a lost answer, a stale edit merged field by field with the toast and Undo, an edit against a delete, two devices, a wiped
  device, a device behind the tombstone horizon.
- **Backups:** a backup file round-trips with either key; a git snapshot built by the server opens in the browser; files are committed once; a restore
  of only what is lost; the readable export round-trips.
- **Access:** every route, operation and mutation as a second person; a file of another account is not found.
- **Pure modules:** BMI with the date-of-birth edges, unit conversions against worked values, Due at the edges of each window, vCard against RFC
  examples and real exports, search, journal aggregates.
- **The data layer** on sqld, a `file:` database and PostgreSQL; **jobs** twice and from two processes doing the work once.
- **Sign-in** against the fake Sovereign, **notices** against `createFakeCore`, **mail** against a fake SMTP server, **GitHub** against the in-memory
  provider; no test reaches the internet.
- **Playwright** in Chromium and WebKit, at desktop and phone widths, with a virtual WebAuthn authenticator (PRF on) and a mocked camera stream: sign-up with the recovery kit shown once; unlock by passkey and by passcode, offline after a restart; scan a card from a test image and show it; add a passport with two pages,
  offline, and see it on a second browser context; move it to Device only and see the shape elsewhere; wipe a context's storage and see it lost, then
  restore from a backup file.
- **A seed** (`pnpm seed`, Node, using the same core): an account whose password is in `seed/` for development only, Me and two family
  members, cards of every format, documents of every type with sample pages, one of each tier, an expiring passport, and (phase 2) years of
  measurements, lab reports and journal entries.

## 31. Phase 4 and beyond, in outline

### 31.1 Sharing with family members' own accounts

A family member with their own Wallet account (on the same instance, or later another) can be given entries:

- **Each account is found through the suite:** the app's own directory and invitations by email and link, as Tally does, and core's directory when hosted (`directory`,
  `offline_access`); the SDK's `checkPerson` confirms whose key it is.
- **Sharing an entry** gives the other account the entry's derived key through the SDK's `share` and `openShared` (the key sealed to that person's public key): a `share` row
  (entry, grantee, sealed key, `read` or `edit`). The grantee's devices pull shared entries in a second stream. The root is never shared, and nothing is re-encrypted.
- **A family space:** a set of entries every member reads and edits, with a space key wrapped to each member.
- **Revoking** removes the grant and offers re-keying, since the grantee may have kept a copy: a derived key cannot change for the same entry, so a re-keyed entry is re-encrypted
  under a fresh random key that the root keeps wrapped (designed with phase 4).
- Device-only entries cannot be shared.

### 31.2 The portable core and a native shell

The owner sees Wallet becoming a native mobile app once the web version has proven its features. The design prepares for it:

- **`src/core/` is framework-free** (§5) and becomes a package (`@sovereignfs/wallet-core`, private until needed): the vault format, entry models,
  validators, the sync client, backup, and the pure computations. A native app embeds it (React Native, or a JavaScript engine in Swift and Kotlin),
  or reimplements it against **the three specifications** in `docs/specs/` and their test vectors.
- **A Capacitor shell** is the cheapest first step: the same PWA in a native container, with plugins for NFC, the Secure Enclave or Keystore, and
  background reminders. A spike decides between it and a native app (19.2).

### 31.3 What only a native app can do

Research 0001 §5: reading **passport and ID chips** (ICAO 9303, with the MRZ as the key: iOS Core NFC, Android IsoDep), **card emulation** on Android
(an NDEF tag served by the phone, so a business card is tapped from phone to phone), **Bluetooth LE** between phones, adding to Apple Wallet without a
round trip, keys in the **Secure Enclave or Keystore**, and reminders that need no server.

### 31.4 Noted, not planned

Reading the MRZ and lab values from a photo on the device (OCR in WebAssembly); growth percentiles for children; a published-script check in the
service worker (§8.6); post-quantum protection of the keys, when the suite's settles; importing from Apple Health or Google Health Connect
(native only); CSV export of measurements and results. Recorded so that they are not mistaken for decisions.

## 32. Not settled in the platform

- **Port 3006** is added to building-an-app §2's table (21.5).
- **A VAPID key in `generate`** (phase 3): whether the manifest's `generate` can make an EC P-256 key, or Wallet derives one from a random secret; the
  same question as Roam's and Tally's (21.6).
- **The kit of research 0004** is not published, so the infrastructure is copied (§5.1).
- **`AUTH_LOCAL`** accepts `1` and `true` until the contract and the apps agree.
- **The design system parts** of §26.7 are built in `sovereign` first.

## 33. Open questions

None waits on a decision. These wait on an input:

1. **The test catalogue and its conversion factors** (§16.5) are reviewed by someone medically literate before 0.2.0; the owner arranges it.
2. **An Apple Developer account and a Google Wallet issuer account** are needed to test passes (§20) before 0.3.0; the owner provides them, or the
   tasks are tested against signed fixtures and released marked as untested with real wallets.
3. **WebAuthn PRF support** is checked again on real devices when 3.7 is built (§9.3), and the setup's wording follows what is found.
4. **An independent review** of the vault format and keyring before 1.0 (§30); who does it is the owner's to arrange.

## 34. Decision log

| Date       | Decision                                                                                                                                                 | Why                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | An app of its own, Tusk's shape: local and core sign-in, three database forms; **every feature works alone**                                             | The owner's golden rule for every app                                                                                                                                                               |
| 2026-11-09 | Name **Wallet**, prefix `wallet`, port 3006                                                                                                              | The owner's decision; 3005 is Roam's                                                                                                                                                                |
| 2026-11-09 | Built from scratch; **the finance track is dropped** (Ledger's); nothing of the plugin's code or data carried over                                       | The owner's decision                                                                                                                                                                                |
| 2026-11-09 | **Always end to end encrypted** under an age key created or imported at setup; no plain or operator-key mode                                             | The owner's direction: readable only on the device Superseded 2026-11-25 (RFC 0001).                                                                                                                |
| 2026-11-09 | **age wraps one vault key; the vault key wraps a key per entry;** entries use AES-256-GCM, bound to account, entry and part, and padded                  | Changing keys touches one header; per-entry keys allow sharing later and free tier moves; differs from Tusk, whose age key wraps list keys directly Superseded 2026-11-25 (RFC 0001).               |
| 2026-11-09 | **Three tiers per entry:** this device only, synced, online only                                                                                         | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **The server keeps an encrypted shape of every entry,** device-only ones included, so loss is visible                                                    | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **Fully offline mode** for the whole wallet overrides every default and tier, pauses git backup, and reminds about backup files                          | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **Defaults per kind,** changeable                                                                                                                        | The owner's decision                                                                                                                                                                                |
| 2026-11-09 | **Safari's eviction: a message,** and Wallet is meant to be installed as a PWA                                                                           | The owner's decision; every Sovereign app is a full PWA                                                                                                                                             |
| 2026-11-09 | **A recovery key offered at setup,** printed, skippable only with an explicit acknowledgement                                                            | Left to the design by the owner: losing the only key loses everything Superseded 2026-11-25: the recovery kit (RFC 0001).                                                                           |
| 2026-11-09 | **Idle lock, and unlocking by passkey (PRF), device passcode, or a key;** unlocking is offline and is the daily way in                                   | The owner asked for biometrics where possible; the wallet holds passports and health records Amended 2026-11-25: the key is the suite's.                                                            |
| 2026-11-09 | **Reminders in the app by default; while closed only by opt-in,** telling the server times and nothing else                                              | Left to the design by the owner: a server cannot remind of a date it cannot read                                                                                                                    |
| 2026-11-09 | **The medical ID is fully protected,** with no view without unlocking                                                                                    | The owner's decision, for now                                                                                                                                                                       |
| 2026-11-09 | **"Family member"** for people kept in a wallet; real sharing between accounts in phase 4                                                                | The owner's word; sharing under end to end encryption is a larger step                                                                                                                              |
| 2026-11-09 | **Conflicts merged on the device,** field by field, this device's edit winning a clash, with Undo                                                        | The server cannot read ciphertext; left to the design                                                                                                                                               |
| 2026-11-09 | **Git backup of ciphertext,** snapshots wrapped again in age, files committed once by hash                                                               | The owner asked for git backup, fully encrypted; whole copies would grow the repository daily Amended 2026-11-25: no age layer.                                                                     |
| 2026-11-09 | **A readable export** with a warning, beside encrypted backup files                                                                                      | A person can leave with data they can read                                                                                                                                                          |
| 2026-11-09 | **Lab results flagged only against the report's own range;** no built-in ranges but adult BMI bands                                                      | Labs differ; Wallet is not a doctor                                                                                                                                                                 |
| 2026-11-09 | **Summaries and reports are print pages** made in the browser; Save as PDF is the browser's                                                              | Nothing leaves the device; no PDF engine needed                                                                                                                                                     |
| 2026-11-09 | **A medical summary** and **a business card** added to the scope                                                                                         | The owner's request                                                                                                                                                                                 |
| 2026-11-09 | **Phone wallets, NFC tags and the share sheet** are the reachable parts of the owner's NFC and Bluetooth ask; the rest waits for native                  | Research 0001: a PWA cannot read chips, emulate cards or use Bluetooth between phones                                                                                                               |
| 2026-11-09 | **One-off encrypted share links** with the key in the fragment, in phase 3                                                                               | Showing a doctor a summary without an account or a printout, still unreadable to the server                                                                                                         |
| 2026-11-09 | **Phases:** cards and documents (MVP), health, out into the world, sharing and native                                                                    | The owner asked for everything planned, the MVP identified, and the rest split                                                                                                                      |
| 2026-11-09 | **A portable core and format specifications** from phase 1                                                                                               | The owner expects a native app once the web version validates the features                                                                                                                          |
| 2026-11-09 | **Every limit is a setting;** files default to 500 MB an account                                                                                         | As Roam; operators size their own server                                                                                                                                                            |
| 2026-11-13 | **0.1.0 is a cut of phase 1:** foundation, sign-in (local and core), the full vault and unlocking, `synced`-tier sync, **QR cards** only                 | The owner: "a version 0.1.0, improve everything else later; the foundation should be solid"; nothing deferred changes the format, since `format`, `tier` and kinds are in the design from the start |
| 2026-11-25 | **The suite's encryption instead of age:** the account key, the app key and the SDK's cipher; no key file and no recovery key; 0.1.x wallets start clean | Wallet joins the suite's keys, compatible with core and Shopper (RFC 0001); supersedes the 2026-11-09 rows on the age key, the vault key and the recovery key                                       |
| 2026-11-25 | **A keyring root under the app key, entry keys derived from it, and a device layer (passkey with PRF, or passcode) wrapping the root**                   | The SDK's key cannot open without a connection, and the device holds ciphertext only yet must show cards with no signal (RFC 0001, Amendment 1)                                                     |
| 2026-11-25 | **A snapshot is not encrypted again;** it opens with the account's key                                                                                   | An outer age layer would be a format of Wallet's own beside the suite's                                                                                                                             |
