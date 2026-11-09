# Epic 4: Storage and sync

## Status

📋 Planned.

## Overview

Entries live on the server as ciphertext with their tier, and on devices in an encrypted IndexedDB store, synced through Tusk's outbox-and-cursor
shape. Conflicts are merged on the device, since the server cannot read them. Files travel apart. The three tiers, shapes, holders, lost entries and
fully offline mode are built here. **The screens of epics 6 and 7 read the device's store, so this comes before them.**

## Related

[`DESIGN.md`](../../DESIGN.md) §10, §11, §29.3, §29.4 · Tusk's `DESIGN.md` §8 and `src/sync/`, `src/local/`

## Tasks

#### 📋 4.1 — Entries and files on the server

**Goal:** the tables and the rules that apply a mutation. **Design:** §10.2, §11.4, §29.3, §29.5. **Depends on:** 3.3, 1.5.

**Technical:** `entry`, `entry_file`, `account_stream`, `applied_mutation`; `src/server/entries/apply.ts`: in one short transaction, the owner check
(a device-made id belonging to another account refused), the tier rule (body only for `synced`/`server`), the holder rule (a `device` tier change only
from `holder_device_id`), the mode rule (no body in `offline`), sizes and quota, `baseVersion` equal to `version` or `stale` with the current row;
increments `seq`, stamps the row, records the mutation id; deletes become tombstones (shape and body cleared). Every condition is in the statement.

**Accepts when:** each rule has a test that it refuses; a replay writes nothing; a stale `baseVersion` returns the current row; nothing is read of the
sealed columns but their length.

#### 📋 4.2 — The sync endpoint

**Goal:** `POST /api/sync` as specified, and its specification. **Design:** §11.2, §11.3. **Depends on:** 4.1.

**Technical:** `src/core/sync/` types and validators (shared); the route with session, `Origin`, device id, protocol version; push in order then pull
past the cursor, paged (bodies for `synced`, shapes only otherwise, tombstones); the answer carries applied, refused (with a reason code), `mode`, the
vault header's version; a device too old is told to update. **`docs/specs/sync-protocol.md`** written alongside with example exchanges.

**Accepts when:** two simulated devices converge; a refused mutation carries its reason; a removed device is refused; the spec's examples are tests.

#### 📋 4.3 — The device store and the in-memory index

**Goal:** the encrypted store and what screens read. **Design:** §11.1, §29.4. **Depends on:** 3.6.

**Technical:** copy Tusk's `src/local/` store over `idb`, reshaped to §29.4's object stores; a schema version with upgrades (fake-indexeddb tests);
the **in-memory index** built on unlock (all shapes at once, bodies in the background), with typed queries per kind, cleared on lock; a React binding
(`useEntries(kind, filter)`) that re-renders on change.

**Accepts when:** after unlocking, lists render from shapes before bodies finish; locking empties the index; the raw-dump test (3.6) finds no
plaintext in the store.

#### 📋 4.4 — The outbox and the sync loop

**Goal:** writes never wait, and reach the server. **Design:** §11.1, §11.3. **Depends on:** 4.2, 4.3.

**Technical:** `writeEntry(kind, model, tier)` validates, seals, and writes store and outbox in one IndexedDB transaction; the loop from Tusk
(debounce, load, focus, online, 30 seconds while visible, Background Sync where available, Web Locks for one tab, BroadcastChannel to others), running
while locked; refusals other than `stale` go to a **Couldn't sync** list (Settings > Storage) with the reason in a sentence and Retry or Discard.

**Accepts when:** an entry written offline appears on a second context after going online; a refused write appears in Couldn't sync and is not lost;
the loop keeps running while locked.

#### 📋 4.5 — Merging a stale edit

**Goal:** conflicts resolved on the device, field by field. **Design:** §11.5. **Depends on:** 4.4.

**Technical:** `src/core/sync/merge.ts`, pure: `merge(base, mine, theirs)` with the rules of §11.5 (lists as one field); the loop, on `stale`, opens
the current row, merges, re-seals with the new `baseVersion`, and resends; the toast with Undo when a field of this device's won over another's; a
delete against an edit restores; bases kept in the store.

**Accepts when:** the pure function's table of cases passes; two contexts editing different fields of one entry both keep their change; the same field
shows the toast and Undo restores the other value.

#### 📋 4.6 — Files

**Goal:** photos, scans and PDFs encrypted, uploaded, fetched and kept. **Design:** §11.6, §8.3. **Depends on:** 3.2, 4.4, 1.6.

**Technical:** `src/media/`: decode (`createImageBitmap`, with EXIF orientation), re-encode to WebP (JPEG fallback) at 2,560 px and a 480 px
thumbnail, no metadata; HEIC where decodable, else the original with a note; PDF first-page thumbnail with pdf.js (worker served by the app). Encrypt
(3.2), store in `files` and `pending_files`, upload `PUT /api/blobs/<id>` (idempotent, SHA-256 checked, quota), download `GET /api/blobs/<id>` (owner
in the statement; `no-store` for Online only), prefetch of Synced files after sync, an orphan sweep job on the server, the file store under
`/data/blobs`.

**Accepts when:** a JPEG with GPS data has none after processing (checked by decrypting and reading the output); a file of another account is not
found; an upload repeated is stored once; going over the quota is refused with a sentence; an orphan is swept.

#### 📋 4.7 — Tiers and moving between them

**Goal:** every tier and every move of §10.4. **Design:** §10.2, §10.4, §10.6. **Depends on:** 4.6.

**Technical:** the `move` mutation and the browser's steps for each row of §10.4 (upload before switching, download before switching, delete local
copies on pull); Online only entries opened through a fetch-open-drop path that never writes to the store or a cache, with object URLs revoked on
close; creating or editing an Online only entry offline refused with the offer to save as Synced; default tiers from the `settings` entry; the
sentence when an entry leaves the server.

**Accepts when:** each move has a Playwright test across two contexts; after opening an Online only entry, the dump helper finds nothing of it in
IndexedDB, Cache Storage or the service worker cache.

#### 📋 4.8 — Holders and lost entries

**Goal:** shapes elsewhere, and loss made visible. **Design:** §10.3, §10.5. **Depends on:** 4.7, 2.6.

**Technical:** device-only entries show "Only on <device label>" on other devices; the holder's self-check on unlock (a shape naming this device with
no body in the store → `lost`); marking lost on removing a device and on "same device" at setup; lost entries in Due (7.4) with Restore (8.2) and
Delete.

**Accepts when:** clearing a context's IndexedDB and signing in again as "the same device" shows its entries as lost on both contexts; restoring from
a backup file clears the state.

#### 📋 4.9 — Fully offline mode

**Goal:** the whole wallet on devices, with manual backups. **Design:** §10.7. **Depends on:** 4.7, 8.2.

**Technical:** Settings > Storage; turning on: online, unlocked, a confirmation naming what moves; every Synced and Online only entry fetched and
moved to this device in resumable batches; `account_stream.mode = offline` set by an operation once all are moved; the server refusing bodies from
then; tier choices hidden; git backup paused (8.5); turning off: mode back, nothing moved. Backup reminders are 8.7.

**Accepts when:** after turning on, the server holds no body or file for the account (a test reads the tables and `/data/blobs`); a second context
sees shapes only; a body sent by an old client is refused.

#### 📋 4.10 — The browser's storage

**Goal:** persistence requested and the risk said. **Design:** §10.8. **Depends on:** 4.3.

**Technical:** `navigator.storage.persist()` at setup and after install; Settings > Storage shows granted or not, `estimate()` usage and quota,
entries held here and their size; the Safari-not-installed message on Home while device-only entries are held (detecting standalone display mode and
the browser).

**Accepts when:** in WebKit not installed, with a device-only entry, Home shows the message; usage in Settings grows after adding a large file.

#### 📋 4.11 — Pruning

**Goal:** tombstones and records do not grow forever. **Design:** §11.8. **Depends on:** 4.2, 1.6.

**Technical:** a job removing tombstones and applied mutations older than 90 days; a device whose cursor is older is answered "snapshot", sends its
outbox, and pulls fresh.

**Accepts when:** a device behind the horizon converges after a snapshot without losing its outbox.
