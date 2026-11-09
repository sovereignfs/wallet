# Epic 9: Shell and screens

## Status

📋 Planned.

## Overview

The screens that are not one kind's: setup, the lock screen, Home and search, Settings, the phone's footer and shortcuts, and the controls that say
where an entry lives.

## Related

[`DESIGN.md`](../../DESIGN.md) §26, §27

## Tasks

#### 📋 9.1 — Setup

**Goal:** a new account to a working wallet, and a new device to an unlocked one. **Design:** §26.3. **Depends on:** 3.4, 3.5, 3.7, 3.8.

**Technical:** `/setup` with the step flow (21.3): welcome, wallet key (create with download and the six-character confirm, or import), recovery key
(sheet and confirm, or acknowledged skip), unlock method (passkey first where PRF), where things live (defaults or fully offline), install and
persistence, Me. Resumable if closed midway (the vault exists after step 2). The new-device path: sign in, unlock with a key (file, paste, QR), "same
device?", unlock method, install. Every step at phone width.

**Accepts when:** Playwright completes both paths in Chromium and WebKit (PRF steps in Chromium); closing after step 2 and reopening resumes at
step 3.

#### 📋 9.2 — The lock screen

**Goal:** what a locked Wallet shows. **Design:** §26.2, §9.3. **Depends on:** 3.6.

**Technical:** `/unlock` replacing every signed-in route while locked (with a return address): Unlock (passkey) first, passcode, key file, recovery
key, "I've lost my keys" (3.11); no entry data rendered; the lock button in the header.

**Accepts when:** a signed-in address while locked shows only the lock screen and returns there after unlocking; nothing of an entry is in the DOM
while locked.

#### 📋 9.3 — Home and search

**Goal:** the first screen, and finding anything. **Design:** §26.4. **Depends on:** 4.3.

**Technical:** Home: Due (7.4), favourite cards row, recent entries, the storage message (4.10), the offline-mode backup line (8.7);
`src/core/search/` (normalised, accent-insensitive, prefix, ranked by field) over the index; search in the header and on `/`; results grouped by kind;
Online only results by shape, said.

**Accepts when:** searching a card number finds the card; an accented name is found without its accent; an Online only entry is found by title and
marked.

#### 📋 9.4 — Settings

**Goal:** every setting of §27 reachable. **Design:** §27. **Depends on:** 9.1.

**Technical:** `/settings` with Profile, Security, Storage, Backup, Family, Due, Notifications, Sign-in, Account; panels filled by their tasks (each
task adds its part); the `settings` entry for what follows the person, the device store for what does not.

**Accepts when:** every section renders, with unavailable features explained; a preference in the `settings` entry reaches a second context.

#### 📋 9.5 — The phone

**Goal:** the footer, the Add button and shortcuts. **Design:** §26.2, §26.6. **Depends on:** 9.3.

**Technical:** `MobileFooter` (Home, Cards | launcher | Documents, Family — Health replaces Family in phase 2), the Add floating button with a sheet
of what can be added here, PWA shortcuts, safe-area insets; one tree, rendering forked only.

**Accepts when:** at phone width every screen of phase 1 is reached from the footer or Add; a shortcut opens Add a card.

#### 📋 9.6 — Where it lives, on screen

**Goal:** an entry's tier always visible and changeable. **Design:** §10, §26.1. **Depends on:** 4.7.

**Technical:** a chip component (This device, Synced, Online only, Only on <device>, Lost) and a picker used beside Save and in each entry's menu; the
sentences of §10.4 in its dialog; hidden choices in fully offline mode.

**Accepts when:** every entry screen shows the chip; moving from the picker runs 4.7's steps; in offline mode the picker is replaced by a sentence.
