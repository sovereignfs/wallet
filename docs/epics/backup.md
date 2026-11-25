# Epic 8: Backup and portability

## Status

📋 Planned.

## Overview

One encrypted backup format, packaged two ways: a **backup file** the browser makes and the person keeps, and **git snapshots** the server makes from
the ciphertext it holds, with files committed once by hash. A **readable export** lets a person leave. Restores work from either.

## Related

[`DESIGN.md`](../../DESIGN.md) §23, §10.7 · Tusk's `DESIGN.md` §20, §21 and `src/backup/`, `src/providers/`

## Tasks

#### 📋 8.1 — The backup format

**Goal:** building and reading snapshots, specified. **Design:** §23.1. **Depends on:** 3.15.

**Technical:** `src/core/backup/`: `buildSnapshot({ manifest, keyring, entries, files? })` → a stored ZIP (`fflate` or a minimal writer), not encrypted again (§23.1);
`readSnapshot(bytes)` → validated parts, still ciphertext; format version checks; runs in Node (the server builds git snapshots) and the browser. **`docs/specs/backup-format.md`** with a sample snapshot made from fixed keys.

**Accepts when:** a snapshot built in Node opens in the browser and the reverse; its entries open with the account's key and no other; a snapshot
holds no plaintext (the marker test); a newer version is refused with a sentence.

#### 📋 8.2 — Backup files

**Goal:** make a backup file and restore from one. **Design:** §23.2. **Depends on:** 8.1, 4.6.

**Technical:** Settings > Backup and Due: gather everything this device can open (Synced, held Device only, Online only fetched for the purpose) with
files, build, download or share (`navigator.share` with the file); the device remembers the date. Restore: choose a file, open with either key,
validate whole, **everything** or **only what is missing or lost**, keep newer wallet entries, Device only ones held here; a file from another vault
re-keyed into this one with new ids; a summary of what was restored and skipped.

**Accepts when:** a backup file made on one context restores a lost entry on another; a file from a second account restores as new entries; a
corrupted file is refused before anything is written.

#### 📋 8.3 — The readable export and import

**Goal:** leave with readable data, and come back. **Design:** §23.4. **Depends on:** 8.2.

**Technical:** a ZIP of `wallet.json` (format, version, every open entry as plain JSON) and files in folders by member and kind; the warning first;
download only. Import: validate whole, make new entries sealed in the browser, report counts.

**Accepts when:** export then import into a new account reproduces every entry and file (a round-trip test); the warning is shown before the download.

#### 📋 8.4 — Connecting a git repository

**Goal:** a private repository connected, as Tusk does. **Design:** §23.3. **Depends on:** 3.3, 9.4.

**Technical:** copy Tusk's connection and `Provider` (GitHub App with `WALLET_GITHUB_APP_*`, or a fine-grained token; checks in Tusk's order; private
required; credential through `src/crypto/`; the in-memory provider for tests; `WALLET_GITHUB_API_URL`); `backup_connection` and `backup_file`;
Settings > Backup's connection panel saying what is sent and that nothing is ever deleted.

**Accepts when:** connecting a public repository is refused with our sentence; a bad token's error never shows GitHub's text or the token.

#### 📋 8.5 — The git backup job

**Goal:** encrypted snapshots and files committed on schedule. **Design:** §23.3. **Depends on:** 8.4, 8.1, 1.6.

**Technical:** a job claiming due connections; reads the account's rows in a short transaction; builds the snapshot without file contents in Node; commits `wallet/snapshots/<time>.zip` and any `wallet/files/<sha256>` not yet in `backup_file` in **one commit**
(blobs, a tree on the head's, a commit, a fast-forward), never forced; nothing changed (same `seq`), nothing committed; Back up now at most once a
minute; failures kept; stops on a dead token, missing or public repository, raising `backup_stopped` and a Due item; **paused** in fully offline mode.

**Accepts when:** against the in-memory provider, two backups with one new photo between commit the photo's file once; a backup with no change commits
nothing; the snapshot's entries open with the account's key in the browser; offline mode pauses it.

#### 📋 8.6 — Restoring from git

**Goal:** a snapshot back into the wallet. **Design:** §23.3. **Depends on:** 8.5, 8.2.

**Technical:** Settings > Backup lists snapshots through the server; choosing one has the server fetch it and the files it names (streamed) for the
browser, which restores as from a file (8.2's path); Device only entries arrive as shapes, marked lost where their holder lacks them.

**Accepts when:** after deleting an entry, restoring yesterday's snapshot brings it back with its files.

#### 📋 8.7 — Backup reminders

**Goal:** fully offline wallets get backed up. **Design:** §10.7, §23.2. **Depends on:** 8.2, 7.4.

**Technical:** the interval in the `settings` entry (14 days default); Due's item when this device's last backup file is older; Home's line "Last
backup file: 9 days ago" in fully offline mode.

**Accepts when:** on a mocked clock the Due item appears at the interval and clears after making a backup file.
