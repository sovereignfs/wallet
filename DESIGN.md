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

- **Only the person can read it.** Everything is encrypted in the browser under an age key the person holds (§7, §8). The server, its operator, the
  database, its dumps and the git backups hold ciphertext and nothing else of meaning. There is no "operator key" mode and no plain-text mode.
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

| Phase                               | Release | What it delivers                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1, the MVP: cards and documents** | 0.1.0   | A full PWA, alone or hosted; sign-in, locally and through core; the wallet key, created or imported, and a recovery key; locking with a passkey, a device passcode or the key; the three tiers, shapes and fully offline mode; sync; family members; **cards** with every code format, scanning and full-screen display; **ID documents** with scans and expiries; the Due panel; an encrypted backup file, a readable export, and encrypted backup to git; devices; deletion. |
| **2, Health**                       | 0.2.0   | Measurements with BMI and charts; lab reports with structured results, unit conversion and trends per test; the medical ID, allergies, conditions, medications and vaccinations; the **journal** of symptoms and mood; the **medical summary** and the **doctor's report** as printable pages; receiving files from other apps.                                                                                                                                                |
| **3, Out into the world**           | 0.3.0   | The **business card** (vCard QR, `.vcf`, the share sheet, an optional public page) and received contacts; **Apple Wallet and Google Wallet** passes for business cards and cards; **NFC tags** on Android; watermarked copies of documents; `.pkpass` import; insurance, tickets and secure notes; **one-off encrypted share links**; reminders while Wallet is closed, opt-in.                                                                                                |
| **4, Sharing and native**           | 0.4.0+  | Sharing entries end to end with family members' own accounts; a portable core and a native shell, for what only a native app can do (§31).                                                                                                                                                                                                                                                                                                                                     |

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

1. **Setting up.** Ana signs in, and Wallet asks for a key. She creates one: the browser makes it, she downloads the key file and confirms she kept
   it, prints the recovery sheet and puts it in a drawer, turns on Face ID unlock, and installs Wallet to her home screen. Her name becomes "Me".
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
| **Wallet key**        | The person's age identity, which opens everything (§7). Its file is the **key file**                                               |
| **Recovery key**      | A second age identity, printed, which opens everything too (§7.3)                                                                  |
| **Locked / unlocked** | Whether this device holds the keys in memory right now (§9)                                                                        |
| **Where it lives**    | An entry's tier: **This device only**, **Synced**, **Online only** (§10)                                                           |
| **Fully offline**     | The whole wallet kept on devices, with manual backups (§10.7)                                                                      |
| **Shape**             | What the server keeps of every entry: an encrypted outline (kind, title, family member, where it lives), never its content (§10.3) |
| **Due**               | Things that need attention: expiries, overdue backups, lost entries, later measurements and boosters (§15)                         |
| **Backup**            | An encrypted copy: a **backup file** downloaded by the person, or a **git backup** made by the server (§23)                        |

Never in the interface: "plugin", "tenant", "vault" (an internal word), "DEK", "blob", "tier", "stub", "client", "E2EE" (say "only you can read it").

## 5. Architecture

```
               browser (a PWA)                                         server (one image, one process)
 ┌──────────────────────────────────────────┐              ┌───────────────────────────────────────────────────┐
 │ UI (React 19, @sovereignfs/ui)           │              │ Next.js: the shell, routes                         │
 │ the keyring: wallet key → vault key →    │  /api/sync   │ better-auth (§25)                                  │
 │   entry keys, in memory, locks (§9)      │ ◀──────────▶ │ sync: checks owner, tier, sizes, version; orders   │
 │ seals and opens every entry (§8)         │              │   and stores ciphertext; never reads it (§11)       │
 │ device store: IndexedDB, ciphertext      │  /api/blobs  │ files: ciphertext under /data/blobs (§11.6)        │
 │   only, one database per account         │ ◀──────────▶ │ /api/vault: the vault header, recipients (§8)      │
 │ in-memory index of what is open: lists,  │  /api/vault  │ /api/devices, /api/ops: online changes             │
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
- **Offline first for entries, online for decisions about the account:** entries are written to the device and synced (§11); the vault header,
  devices, the backup connection and (phase 3) publishing are online operations.
- **What the server can read** is exactly §8.5's list, and the threat model is §8.6.
- **Next.js with React 19**, a long-running server, because of the jobs. **SQLite by default, PostgreSQL if the operator prefers** (§29).
- **Jobs run in the web process** on a timer from `instrumentation.ts`, with `WALLET_WORKER=off` for all but one process if several share a database;
  every job claims its work in the database (Tusk §5).
- **The core is portable** (§31.2): the vault format, the sync client, the entry models, validators and every pure computation live in `src/core/`,
  with no React, no Next.js and no DOM beyond WebCrypto and `fetch`, so a native app can take it whole.

### 5.1 Where things go

As Tusk's: `app/` for routes, `src/` for everything else, tests beside the code.

| Path                            | What                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                          | Routes: the landing page, sign-in, setup, unlock, the signed-in area, print pages, `/api/*`; phase 3 `/c/[slug]`, `/s/[id]`        |
| `src/core/vault/`               | The vault format: keys, envelopes, padding, file streams, the vault header (§8) — **portable, browser and Node**                   |
| `src/core/entries/`             | Every entry kind's model, its shape and body, validators, defaults (§10, §12–§22) — portable                                       |
| `src/core/sync/`                | The protocol's types and validators (shared by both sides), the client's merge (§11) — portable                                    |
| `src/core/backup/`              | The backup format: building and reading snapshots and files (§23) — portable                                                       |
| `src/core/due/`                 | What is due (§15) — pure                                                                                                           |
| `src/core/health/`              | BMI, units, the test catalogue, conversion, trends (§16) — pure                                                                    |
| `src/core/journal/`             | Symptom vocabulary, aggregates for charts and reports (§17) — pure                                                                 |
| `src/core/vcard/`               | vCard and MECARD writing and reading (§19) — pure                                                                                  |
| `src/core/search/`              | Search over what is open (§26.4) — pure                                                                                            |
| `src/keyring/`                  | The browser's keyring: unlock, lock, idle timers, passkey and passcode wrappers (§9) — browser only                                |
| `src/local/`                    | The device store over IndexedDB, the outbox, the sync loop, file prefetch, the in-memory index (§11) — browser only, **from Tusk** |
| `src/media/`                    | Images in the browser: decode, orient, strip metadata, re-encode; PDF page rendering (§11.6) — browser only                        |
| `src/barcode/`                  | Drawing (bwip-js) and scanning (BarcodeDetector, then zxing-wasm) codes (§13) — browser only                                       |
| `src/server/entries/`           | Applying mutations, tier rules, sizes, the stream counter (§11) — server only                                                      |
| `src/server/blobs/`             | The file store under `/data/blobs`, quotas, serving (§11.6)                                                                        |
| `src/server/vault/`             | The vault header and recipients, devices (§7, §6.3)                                                                                |
| `src/db/`                       | Configuration, clients, schemas per dialect, migrations at start-up (§29) — **copied from Tusk**                                   |
| `src/auth/`                     | better-auth, its settings, the sign-up policy, the screens, the fake Sovereign for tests (§25) — **copied from Tusk**              |
| `src/access/`                   | Every page, route and operation with who may use it (§5.2)                                                                         |
| `src/crypto/`                   | **The server's** instance key and envelope encryption, for credentials only (§8.7) — **copied from Tusk**                          |
| `src/backup/`, `src/providers/` | The git connection and job; the git host interface, GitHub's implementation, an in-memory one (§23) — **from Tusk**                |
| `src/notices/`, `src/mail/`     | The bell, the mail outbox, (3) Web Push (§24) — **from Tally**                                                                     |
| `src/passes/`                   | Phase 3: Apple `.pkpass` signing and Google Wallet links (§20)                                                                     |
| `src/sovereign/`                | Core's notices, `People.deletePerson`, the bell, email and activity calls (§25, §28) — **from Tusk**                               |
| `src/jobs/`                     | The runner and claims — **copied from Tusk**                                                                                       |
| `src/sw/`                       | The service worker: the shell by allow-list, the offline shell page, share target (§26.6) — **from Tusk**                          |
| `src/screens/`, `src/ui/`       | The signed-in screens and the shell                                                                                                |
| `docs/specs/`                   | `vault-format.md`, `sync-protocol.md`, `backup-format.md`: the formats as standalone specifications (§31.2)                        |
| `migrations/`, `deploy/`        | Generated SQL (`sqlite/`, `postgres/`, `auth/`); the Compose setups                                                                |

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

As Tusk's: **`open` when core is the only way in, `closed` (the first account only) when local accounts are on**, set by `WALLET_AUTH_SIGNUP` (`open`,
`closed`). Wallet has no invitations until phase 4 (§31.1). Signing in through core always gets an account (`app-manifest.md` §4).

### 6.3 Devices

Every browser that signs in becomes a **device**: a random id the browser makes and keeps in its store, a label it seals ("iPhone · Safari",
editable), the session it belongs to, when it was first and last seen. Settings > Security lists them.

- **A new device is noticed:** the account's other devices see "New device: Firefox on Linux" in the bell, and an email goes out (§24). A wallet key
  is needed on it before anything opens (§9), so a stolen password alone reads nothing.
- **Removing a device** ends its session; its device-only entries stay as shapes marked "on a removed device" until the person deletes them or
  restores them from a backup (§10.5).
- **A browser that was wiped** comes back as a new device. Setup on it asks: "Is this the same device as _iPhone · Safari_ (last seen 3 days ago)?" If
  yes, the old device is removed and its device-only entries are marked lost (§10.5).

## 7. Keys

### 7.1 The wallet key

An **age X25519 identity** (`AGE-SECRET-KEY-1…`) with its recipient (`age1…`). `age-encryption` (typage, BSD-3-Clause) does this in the browser. Setup
(§26.3) makes the person choose:

- **Create:** the browser makes the identity, and the person **saves it before going on**: they download the key file (`wallet-key-<date>.txt`, the
  age identity format, with a comment naming the app and date), optionally protected by a passphrase (an age file encrypted with scrypt, which the
  `age` CLI opens too), and confirm by typing the last six characters shown. **Nobody can recover it.**
- **Import:** an existing identity, as a file or pasted text, or a passphrase-protected file. **The same key can be used across the suite:** a Tusk
  personal key or a Fjord identity is the same format.

The identity never leaves the browser. The server stores its **recipient** (public) in `vault.recipients`.

### 7.2 The vault key

The wallet key does not encrypt entries directly. It opens the **vault key** (§8.1), which wraps every entry's key. So adding a recovery key or
replacing the wallet key re-encrypts one small header, not the wallet.

### 7.3 The recovery key

**Offered at setup, strongly recommended, skippable only by ticking "I understand that if I lose my wallet key, nobody can recover my wallet".**

- A second age identity made in the browser, shown once as a **printable recovery sheet**: the identity as text in groups, a QR code of it, the date,
  the account's name, and how to use it. Wallet never stores it, and the browser forgets it after the sheet is shown and confirmed (typing six
  characters).
- Its recipient is added to the vault header, so **either key opens everything**.
- Settings > Security can add one later, replace it, or remove it; each re-encrypts the header (§7.5).
- **Using it:** at unlock, "Use recovery key" takes the text or scans the QR code with the camera. Afterwards Wallet suggests making a new wallet key.

### 7.4 What the server keeps

`vault`: the recipients (wallet key and recovery key, each labelled), the **vault header** (the vault key encrypted to the recipients, §8.1), the
vault key's id, and a version. A device fetches the header from `/api/vault` and keeps a copy in its store, so it can unlock offline.

### 7.5 Changing keys

Online operations from Settings > Security, each needing the wallet unlocked:

- **Replace the wallet key** (create or import a new one): the header is re-encrypted to the new recipient and the recovery key. Old key files stop
  working for the current header — but **an old header in an old backup still opens with the old key**, and Settings says so.
- **Add, replace or remove the recovery key:** the same.
- **Rotate everything** (for a key that may have been seen by someone else): a new vault key, a new key for every entry, and every entry and file
  re-encrypted by the browser in resumable batches through the ordinary sync path, the account marked `rotating`. Device-only entries are rotated on
  their holder devices when those next sync. Settings shows progress and says that backups made before stay readable with the old keys.

### 7.6 Resetting a wallet

For a person who has lost every key and every unlocked device: **Reset wallet**, after the password or a fresh session and typing "reset", deletes
every entry and file on the server, empties the vault, and starts setup again. The account, its sign-in and its devices stay. Device stores are
emptied at their next sync.

## 8. The vault

### 8.1 Keys

```
 wallet key (age X25519)  ─┐
 recovery key (age X25519) ─┴─ age ─▶ vault header  =  age( { v, vault_key, vault_key_id, created } )
                                                          │
                                       vault key (AES-256, 32 random bytes)
                                                          │ AES-256-GCM wrap, bound to account and entry
                                       entry key (AES-256, one per entry, random)
                                                          │
                     ┌────────────────────────────────────┼─────────────────────────────┐
              shape (AES-256-GCM)                  body (AES-256-GCM)          files (AES-256-GCM STREAM,
                                                                                 a key per file by HKDF)
```

- **age is used only for the header and for phase 3 and 4's sharing,** since its per-message overhead is too much per field; entries use AES-256-GCM
  in WebCrypto, so keys can be **non-extractable `CryptoKey`s** once loaded.
- **An entry key per entry** keeps a future share (phase 4) to one entry, and makes moving an entry between tiers or devices free of re-encryption.
- **Wrapped entry key:** `AES-256-GCM(vault key, nonce, entry key, AAD = "wallet/v1/key|<account id>|<entry id>|<vault key id>")`, stored as the
  entry's `wrapped_key`. Unwrapped with WebCrypto `unwrapKey` straight into a non-extractable key.

### 8.2 Envelopes

**A sealed value** (an entry's shape or body) is:

```
byte 0       version (0x01)
bytes 1–12   nonce (random, 96 bits)
bytes 13–    AES-256-GCM ciphertext and 16-byte tag
AAD          "wallet/v1/<part>|<account id>|<entry id>"     (part: "shape" or "body")
plaintext    UTF-8 JSON, then 0x80, then 0x00 bytes to the next multiple of the bucket
             (shape: 256 bytes; body: 1,024 bytes)  — ISO/IEC 7816-4 padding
```

- **The AAD binds** each value to its account, entry and part, so the server cannot move a value to another entry, account or part unnoticed.
- **Padding** hides small differences in length: a server sees a shape as 256 or 512 bytes, not as the length of a title.
- **Versioned** from the first byte, so the format can move (to a post-quantum hybrid recipient for the header, for example) without guessing.

### 8.3 Files

A file (a photo, a scan, a PDF, a logo) is encrypted with the **STREAM construction**, as age does, so a large PDF is encrypted and decrypted in
pieces:

```
header       version (0x01) | 16-byte salt | chunk size (u32, 65,536)
file key     HKDF-SHA-256(entry key, salt, info = "wallet/v1/file|<file id>")
chunk i      AES-256-GCM(file key, nonce = 11-byte big-endian counter ‖ last-chunk flag (0x00 or 0x01), plaintext chunk, AAD = <file id>)
plaintext    an 8-byte length, the file's bytes, zero padding to the next bucket
             (16 KiB below 1 MiB, 256 KiB above)
```

Images are re-encoded in the browser before they are encrypted, removing every piece of metadata (location included) (§11.6). The server stores the
ciphertext under `/data/blobs` and never sees a file name, type or dimension.

### 8.4 Where things are encrypted

**Everything a person typed or attached is in a shape, a body or a file, and every one of those is sealed.** Each kind's fields are listed in its
section (§12–§22) as shape or body. The **shape** holds just enough to list and file the entry without opening it: kind, title, a subtitle (an issuer,
a country), the family member, a colour and icon, the dates Due needs, favourite and position, archived, tags, and for a device-only entry its
holder's label and state. The **body** holds the rest.

### 8.5 What the server can read

The account itself (its sign-in, `profile`'s name and email, §6.1), and for each entry: its **id**, **tier**, **holder device** (for device-only), the
**sizes** of its padded shape, body and files, the **number of files**, its **version** and **sync counter**, and **when** it was created, changed and
deleted. Devices: their ids, sessions and times. The backup connection. **Not** the kind of an entry, its title, its family member, its dates, or
anything in it.

So an operator can see how many entries someone has, roughly how large, which live where, and when they change; not what they are or say.

### 8.6 What this protects against, and what it does not

| Protects against                                                                                     | Does not protect against                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Reading the database, its dumps, the files under `/data`, and git backups, including by the operator | **An operator who serves altered JavaScript** that takes the key once unlocked, since the browser runs what the server sends (Tusk §9.6) |
| A stolen password: nothing opens without a key (§9)                                                  | **A device taken while unlocked**, or malware on it. The idle lock (§9.2) shortens the window                                            |
| The server moving or replaying a value between entries (AAD, §8.2)                                   | **Metadata:** §8.5's counts, sizes, tiers and times, and the network addresses the server sees                                           |
| A copied browser store, as far as the unlock method's strength allows (§9.4)                         | **Losing every key and every unlocked device.** Nobody can recover the wallet                                                            |
| Swapping one person's entries into another's account (the account id in every AAD)                   | **What the person chooses to publish:** passes, public cards and Google Wallet (§19.5, §20) leave the encryption by design, and say so   |

Mitigations of the first row are the suite's: a strict CSP with nonces, no third-party code, the image's provenance; a person can run their own
instance. **A published-script check** (the service worker comparing the shell's scripts against a pinned list and warning on a change) is noted in
§31.4, not planned.

### 8.7 The server's own key

`WALLET_ENCRYPTION_KEY` (32 bytes, generated by the instance) encrypts **the server's own secrets** through Tusk's `src/crypto/` envelope, bound to
row and purpose, rotated with `WALLET_ENCRYPTION_KEY_PREVIOUS`: the git backup's credential, core's refresh token if one is ever kept, `profile`'s
name and email, and in phase 3 push subscriptions and published cards. **It never touches an entry.**

## 9. Locking and unlocking

### 9.1 The keyring

When unlocked, the browser holds in memory the **vault key** and, as they are used, **entry keys**, all as non-extractable `CryptoKey`s, and the
**opened entries** in an in-memory index (§11.1). Locking drops all of it: the keys, the index, every rendered page's data (the app navigates to the
lock screen and clears its state), and every object URL of a decrypted file. **The wallet key itself is never kept:** it opens the header and is
forgotten.

**Sync runs while locked:** the outbox drains and pulls arrive, since the store holds ciphertext only.

### 9.2 When it locks

- **After a time without use:** 1, 5 (the default), 15 or 60 minutes, set per device.
- **When Wallet is hidden** (another app, the screen off): at once, after 1 minute (the default), or never.
- **By hand:** the lock button in the header.
- **At sign-out** and when the session ends.

Tabs share one lock (BroadcastChannel): unlocking or locking one does the same in every tab of the account.

### 9.3 Ways to unlock

Each device keeps one or more **unlock wrappers** in its store: the vault key, wrapped by something only this device and person can produce.

| Way                                                 | How                                                                                                                                                                                                                        | Offline |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Passkey (Face ID, a fingerprint, Windows Hello)** | A WebAuthn credential made for unlocking, with the **PRF extension**. Its output for the salt `"wallet/v1/unlock"`, through HKDF, is an AES-256-GCM key that wraps the vault key                                           | Yes     |
| **Device passcode**                                 | At least 6 characters (digits allowed). Argon2id (64 MiB, 3 passes, `hash-wasm`, MIT) of it and a random salt is a key that wraps the vault key, which is then wrapped again under a non-extractable key the browser keeps | Yes     |
| **Wallet key**                                      | The key file or pasted identity opens the header (a copy is in the store)                                                                                                                                                  | Yes     |
| **Recovery key**                                    | The same, from the sheet's text or QR code                                                                                                                                                                                 | Yes     |

- **Setup offers the passkey first** where `PublicKeyCredential.getClientCapabilities()` reports PRF (Chrome and Edge on Android and desktop with a
  platform authenticator, Safari 18 and later with iCloud Keychain, recent Firefox; checked again when 3.7 is built), and the passcode otherwise. A
  device can have both.
- **Five wrong passcodes** delete that device's passcode wrapper; the person then unlocks with a passkey or a key, and may set a new passcode.
- **A passcode is weaker than a passkey** against someone who copies the browser's store and guesses offline. Settings says so, and suggests a passkey
  where the device supports one.
- **The unlock passkey is not the sign-in passkey.** A person may have both; Settings lists them apart.

### 9.4 Signing in and unlocking

Signing in proves the account to the server and needs a network; it happens rarely, since sessions are long (Tusk's defaults). **Unlocking proves the
key to the device and happens every time,** offline. So day to day, **Face ID is the way in**, as the owner asked.

**One prompt for both (phase 1, P3):** when a session has ended and the person signs in with a passkey that also supports PRF, the same ceremony can
both sign in and unlock, if better-auth's passkey plugin passes the extension through. Investigated in 3.12; until then, two prompts.

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
  wrapped key, body for Synced and Device only entries, version), the files of Synced and held Device only entries, the vault header, the unlock
  wrappers, the device's id, the cursor, the outbox, and for each entry the **base** (the last version agreed with the server) for merging (§11.5).
  **Everything in it is ciphertext,** as the owner asked: device-only data is encrypted at rest too.
- **Unlocked, the browser opens what it holds into an in-memory index:** shapes of every entry, bodies as they are needed (all of them for search, in
  the background after unlocking). Screens read the index.
- **A write** is sealed in memory, written to the store and the outbox in one IndexedDB transaction, and applied to the index. The loop sends it.

### 11.2 Mutations

A mutation is one entry's change, made by the device:
`{ id, entry, op (put | delete | move | lost), baseVersion, tier, holder, wrapped_key, shape, body?, files: [file id…] }`. Validators in
`src/core/sync/` check structure and sizes on both sides; the browser validates the plaintext model before sealing.

### 11.3 The endpoint

`POST /api/sync`, with the session cookie and `Origin` checked. A request carries the device id, the outbox in order, and the cursor; the answer
carries what was applied, what was refused and why, the account's `mode` and vault header version, and the changes since the cursor.

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

- **First load** on a device pulls shapes first, then bodies, then files, in pages; the wallet unlocks as soon as the header arrives.
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
- `vault.age`: the vault header (§7.4), itself an age file to the account's recipients.
- `entries.jsonl`: every entry's row as the server or the device has it: id, tier, holder, version, wrapped key, shape, body (when present), file ids
  and each file's SHA-256.
- `files/<sha256>`: the files' ciphertext (in a backup file), or nothing (in git, where files are kept apart, §23.3).

**The whole snapshot is encrypted again with age to the account's recipients** (wallet key and recovery key): the outer layer hides even how many
entries there are; the inner layer is the entries' own encryption. Either key opens it, in Wallet or, for the outer layer, with the `age` command
line.

### 23.2 The backup file

**Made in the browser,** from Settings > Backup or Due: `wallet-backup-<date>.age`, holding **everything this device can open**: Synced entries, the
Device only entries it holds, and Online only entries fetched for the purpose, with their files. Downloaded or shared (§20.4). A device remembers when
it last made one (for Due, §10.7).

- **Restore** (Settings > Backup, or a lost entry's **Restore**): the file is opened with the wallet key or the recovery key, checked whole, and the
  person chooses **everything** or **only what is missing or lost**. Restored entries keep their ids and tiers (Device only ones become held by this
  device); an entry newer in the wallet than in the file is kept, and the restore says how many it skipped. A file from another account's vault is
  re-keyed: its entries are opened with that file's key and sealed into this vault, with new ids.
- A file from a newer format version is refused with a sentence.

### 23.3 Backup to git

**As Tusk's §21, with what the server holds being ciphertext,** so the backup is as private as the wallet.

- **Connecting:** Settings > Backup, the GitHub App (`WALLET_GITHUB_APP_*`) or a fine-grained token for one repository; checked in Tusk's order; **the
  repository must be private**; the credential kept through `src/crypto/` (§8.7). `WALLET_GITHUB_API_URL` covers Enterprise Server. Any repository
  works, a Fjord one included (`wallet/` is an ordinary folder outside every vault).
- **What is committed:** under `wallet/` on the default branch:
  - `wallet/snapshots/YYYY-mm-dd_hh-mm-ss.age`: a snapshot (§23.1) **without file contents**, encrypted with age to the recipients. **The server can
    make it without reading anything:** it holds only ciphertext and the recipients' public keys.
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

| Kind             | When                                                   | Channels                                 |
| ---------------- | ------------------------------------------------------ | ---------------------------------------- |
| `new_device`     | A device signs in to the account for the first time    | Bell on other devices, email (always on) |
| `keys_changed`   | The wallet key or recovery key was replaced or removed | Bell, email (always on)                  |
| `backup_stopped` | Auto backup stopped (§23.3)                            | Bell, email                              |
| `rotation_done`  | Rotating everything finished (§7.5)                    | Bell                                     |
| `reminder` (3)   | A reminder's moment (§15.2), content-free              | Push, email                              |

- **The bell** is Wallet's own (Tally's notices and `NotificationsPanel`), raised in the change's transaction. Hosted, core's bell gets the same
  (`notifications:send`).
- **Mail** goes through `mail_outbox` (Tally's), by core's email for a linked account (`email:send`) or Wallet's SMTP (`WALLET_SMTP_*`); without
  either, bell only, said in Settings. **Security notices cannot be turned off.**
- **Core's activity page** (`activity:write`) gets "Backup made", "Backup file restored", "Readable export made", "Wallet key replaced" — never an
  entry's content.

## 25. Sign-in and core

### 25.1 Sign-in

**As Tusk's §6, with `WALLET_` for `TUSK_`:** better-auth in a store of its own; local accounts (password, passkey, authenticator app with backup
codes) when `WALLET_AUTH_LOCAL=1`; a Sovereign core through `genericOAuth` with PKCE when `WALLET_CORE_*` are set; either or both, from one image.
Email is verified and passwords reset only with mail set up. A person is their better-auth user id; a `sub` is identity; an email is never matched to
an account at sign-in. **Signing in never opens the wallet: unlocking does** (§9.4).

### 25.2 Core's notices

Back-channel logout at `/api/sovereign/backchannel-logout` (ends the session; the device locks and keeps its store) and account deleted at
`/api/sovereign/account-deleted` (running `People.deletePerson`, answering `200` only once rows and files are gone), verified by the SDK, replays
refused (`notice_seen`). Copied from Tusk.

### 25.3 The manifest

```json
{
  "manifest": 2,
  "prefix": "wallet",
  "name": "Wallet",
  "description": "Your cards, documents and health records, encrypted so only you can read them, and working offline",
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

| What                  | Hosted                                                             | Alone                      |
| --------------------- | ------------------------------------------------------------------ | -------------------------- |
| Sign-in               | Core, and local accounts if `WALLET_AUTH_LOCAL=1`                  | Local accounts             |
| Notices               | Wallet's bell, and core's bell (`notifications:send`)              | Wallet's bell              |
| Email                 | Core's (`email:send`) for linked accounts; Wallet's SMTP otherwise | Wallet's (`WALLET_SMTP_*`) |
| Backup, export, keys  | A line on the person's activity page (`activity:write`)            | Nothing                    |
| Files, backup, passes | **Wallet's own, always**                                           | Wallet's own               |

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

`/setup`, shown after the first sign-in on an account with no vault, one step at a time (the design system's step flow, §26.7):

1. **Welcome:** what Wallet is, and "Only you can read your wallet. That means nobody, including us, can recover it if you lose your key."
2. **Your wallet key:** create (then save the file, optionally with a passphrase, and confirm) or import.
3. **Your recovery key:** print or save the sheet and confirm, or skip with the acknowledgement (§7.3).
4. **Unlocking this device:** a passkey (offered first where PRF exists), a passcode, or both; the lock timers.
5. **Where things live:** the defaults per kind, or fully offline (§10.6, §10.7).
6. **Install Wallet:** the platform's way to install, and persistent storage requested.
7. **Me:** the name, from the profile, editable; done.

**A new device** on an account with a vault: sign in, then "Unlock with your wallet key or recovery key" (file, paste, or the sheet's QR code by
camera), "Is this the same device as…?" (§6.3), the unlock method, install.

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

- **Installable as a full PWA,** as Tusk's §17.9: the service worker keeps the shell by allow-list and the one shell page; offline, a signed-in
  address is answered by the shell, which reads the store. **No entry, decrypted or not, is ever in the service worker's cache.**
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
- **Security:** the wallet key (replace), the recovery key (add, replace, remove), rotate everything, reset wallet; this device's unlock methods
  (passkey, passcode) and lock timers (§9.2); devices (rename, remove; §6.3).
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
- Reached from **Settings > Account**, after the password or a fresh session and typing "delete", saying what goes and that git backups stay; and from
  **core's account-deleted notice** (§25.2), answered `200` only once rows and files are gone. This device's store is erased; other devices learn at
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
| `vault`                                                 | `account_id` (key), `version`, `recipients` (JSON: recipient, label `wallet` or `recovery`, added_at), `header` (age, binary), `vault_key_id`, `state` (`active`, `rotating`), `created_at`, `updated_at`                   | 1     |
| `account_stream`                                        | `account_id` (key), `seq`, `mode` (`normal`, `offline`)                                                                                                                                                                     | 1     |
| `entry`                                                 | `id`, `account_id`, `tier` (`device`, `synced`, `server`), `holder_device_id`, `version`, `seq`, `wrapped_key`, `shape`, `body`, `file_count`, `bytes`, `deleted_at`, `created_at`, `updated_at`                            | 1     |
| `entry_file`                                            | `id`, `account_id`, `entry_id`, `bytes`, `sha256`, `state` (`pending`, `ready`), `created_at`                                                                                                                               | 1     |
| `device`                                                | `id`, `account_id`, `session_id`, `label` (sealed by the browser under the vault key), `created_at`, `last_seen_at`, `removed_at`                                                                                           | 1     |
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

IndexedDB `wallet-<account id>`, through `idb`, object stores: `meta` (device id, cursor, vault header, mode), `unlock` (wrappers, §9.3), `entries`
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
only. **Logs hold no entry content, ever, and no names or addresses:** an id and a kind of failure (and the server has no content to log). Every
route, operation and mutation finds the session and carries the permission in its statement (§5.2); a write checks `Origin`. **Rate limits:** sign-in,
sync, file uploads, vault operations, passes, share links and their opening. **A security review before each release,** and **an independent review of
the vault format and the keyring before 1.0** (§33).

### Licence

AGPL-3.0-or-later, since it bundles `@sovereignfs/ui`. `age-encryption` (BSD-3-Clause), `idb` (ISC), `bwip-js` (MIT), `zxing-wasm` (MIT, with
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
- **Releases** as Tusk's: `scripts/release.sh`, a `vX.Y.Z` tag publishes amd64 and arm64 to `ghcr.io`; a patch has no migration.
- `/api/health` answers `200` once the database is ready and `/data` is writable.
- **The operator's backups** are the database's and `/data`'s; a person's backups (§23) are theirs. An operator restoring an old database brings back
  old ciphertext, which devices treat as an older server state (the cursor is ahead: a fresh snapshot after sending the outbox).

### Testing

- **The vault format:** known-answer tests for every envelope, file stream and header; tampering with a byte, the AAD, the version, or moving a value
  to another entry, part or account fails to open; padding buckets hold; the format spec's test vectors pass in Node and in the browser (Playwright).
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
- **Playwright** in Chromium and WebKit, at desktop and phone widths, with a virtual WebAuthn authenticator (PRF on) and a mocked camera stream: setup
  with a new key and a recovery key; unlock by passkey and by passcode; scan a card from a test image and show it; add a passport with two pages,
  offline, and see it on a second browser context; move it to Device only and see the shape elsewhere; wipe a context's storage and see it lost, then
  restore from a backup file.
- **A seed** (`pnpm seed`, Node, using the same core): an account with a vault whose key file is in `seed/` for development only, Me and two family
  members, cards of every format, documents of every type with sample pages, one of each tier, an expiring passport, and (phase 2) years of
  measurements, lab reports and journal entries.

## 31. Phase 4 and beyond, in outline

### 31.1 Sharing with family members' own accounts

A family member with their own Wallet account (on the same instance, or later another) can be given entries:

- **Each account publishes its wallet key's recipient** (public) for sharing. Finding people is Tally's way: the app's own directory and invitations
  by email and link, and core's directory when hosted (`directory`, `offline_access`).
- **Sharing an entry** wraps its entry key with age to the other account's recipient: a `share` row (entry, grantee, wrapped key, `read` or `edit`).
  The grantee's devices pull shared entries in a second stream. Nothing is re-encrypted; age's multiple recipients do the work.
- **A family space:** a set of entries every member reads and edits, with a space key wrapped to each member.
- **Revoking** removes the wrapped key and offers re-keying the entry (a new entry key, re-encrypted), since the grantee may have kept a copy.
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
service worker (§8.6); a post-quantum hybrid recipient for the header, when age's settles; importing from Apple Health or Google Health Connect
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

| Date       | Decision                                                                                                                                 | Why                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | An app of its own, Tusk's shape: local and core sign-in, three database forms; **every feature works alone**                             | The owner's golden rule for every app                                                                                                                                                               |
| 2026-11-09 | Name **Wallet**, prefix `wallet`, port 3006                                                                                              | The owner's decision; 3005 is Roam's                                                                                                                                                                |
| 2026-11-09 | Built from scratch; **the finance track is dropped** (Ledger's); nothing of the plugin's code or data carried over                       | The owner's decision                                                                                                                                                                                |
| 2026-11-09 | **Always end to end encrypted** under an age key created or imported at setup; no plain or operator-key mode                             | The owner's direction: readable only on the device                                                                                                                                                  |
| 2026-11-09 | **age wraps one vault key; the vault key wraps a key per entry;** entries use AES-256-GCM, bound to account, entry and part, and padded  | Changing keys touches one header; per-entry keys allow sharing later and free tier moves; differs from Tusk, whose age key wraps list keys directly                                                 |
| 2026-11-09 | **Three tiers per entry:** this device only, synced, online only                                                                         | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **The server keeps an encrypted shape of every entry,** device-only ones included, so loss is visible                                    | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **Fully offline mode** for the whole wallet overrides every default and tier, pauses git backup, and reminds about backup files          | The owner's direction                                                                                                                                                                               |
| 2026-11-09 | **Defaults per kind,** changeable                                                                                                        | The owner's decision                                                                                                                                                                                |
| 2026-11-09 | **Safari's eviction: a message,** and Wallet is meant to be installed as a PWA                                                           | The owner's decision; every Sovereign app is a full PWA                                                                                                                                             |
| 2026-11-09 | **A recovery key offered at setup,** printed, skippable only with an explicit acknowledgement                                            | Left to the design by the owner: losing the only key loses everything                                                                                                                               |
| 2026-11-09 | **Idle lock, and unlocking by passkey (PRF), device passcode, or a key;** unlocking is offline and is the daily way in                   | The owner asked for biometrics where possible; the wallet holds passports and health records                                                                                                        |
| 2026-11-09 | **Reminders in the app by default; while closed only by opt-in,** telling the server times and nothing else                              | Left to the design by the owner: a server cannot remind of a date it cannot read                                                                                                                    |
| 2026-11-09 | **The medical ID is fully protected,** with no view without unlocking                                                                    | The owner's decision, for now                                                                                                                                                                       |
| 2026-11-09 | **"Family member"** for people kept in a wallet; real sharing between accounts in phase 4                                                | The owner's word; sharing under end to end encryption is a larger step                                                                                                                              |
| 2026-11-09 | **Conflicts merged on the device,** field by field, this device's edit winning a clash, with Undo                                        | The server cannot read ciphertext; left to the design                                                                                                                                               |
| 2026-11-09 | **Git backup of ciphertext,** snapshots wrapped again in age, files committed once by hash                                               | The owner asked for git backup, fully encrypted; whole copies would grow the repository daily                                                                                                       |
| 2026-11-09 | **A readable export** with a warning, beside encrypted backup files                                                                      | A person can leave with data they can read                                                                                                                                                          |
| 2026-11-09 | **Lab results flagged only against the report's own range;** no built-in ranges but adult BMI bands                                      | Labs differ; Wallet is not a doctor                                                                                                                                                                 |
| 2026-11-09 | **Summaries and reports are print pages** made in the browser; Save as PDF is the browser's                                              | Nothing leaves the device; no PDF engine needed                                                                                                                                                     |
| 2026-11-09 | **A medical summary** and **a business card** added to the scope                                                                         | The owner's request                                                                                                                                                                                 |
| 2026-11-09 | **Phone wallets, NFC tags and the share sheet** are the reachable parts of the owner's NFC and Bluetooth ask; the rest waits for native  | Research 0001: a PWA cannot read chips, emulate cards or use Bluetooth between phones                                                                                                               |
| 2026-11-09 | **One-off encrypted share links** with the key in the fragment, in phase 3                                                               | Showing a doctor a summary without an account or a printout, still unreadable to the server                                                                                                         |
| 2026-11-09 | **Phases:** cards and documents (MVP), health, out into the world, sharing and native                                                    | The owner asked for everything planned, the MVP identified, and the rest split                                                                                                                      |
| 2026-11-09 | **A portable core and format specifications** from phase 1                                                                               | The owner expects a native app once the web version validates the features                                                                                                                          |
| 2026-11-09 | **Every limit is a setting;** files default to 500 MB an account                                                                         | As Roam; operators size their own server                                                                                                                                                            |
| 2026-11-13 | **0.1.0 is a cut of phase 1:** foundation, sign-in (local and core), the full vault and unlocking, `synced`-tier sync, **QR cards** only | The owner: "a version 0.1.0, improve everything else later; the foundation should be solid"; nothing deferred changes the format, since `format`, `tier` and kinds are in the design from the start |
