# Epic 10: Notices

## Status

📋 Planned.

## Overview

Wallet's few notices are about the account (a new device, changed keys, a stopped backup), since the server cannot read entries. The bell and mail
outbox come from Tally; core's bell, email and activity are added when hosted. Phase 3 adds Web Push for content-free reminders while Wallet is
closed.

## Related

[`DESIGN.md`](../../DESIGN.md) §15.2, §24, §25.4 · Tally's notices and mail outbox

## Tasks

#### 📋 10.1 — The bell

**Goal:** Wallet's own notices. **Design:** §24. **Depends on:** 2.4.

**Technical:** `notice` and `notice_pref` (Tally's), raised in the change's transaction; kinds `new_device`, `keys_changed`, `backup_stopped`,
`rotation_done`; the `NotificationsPanel` in the header; security kinds cannot be turned off.

**Accepts when:** a new device raises `new_device` for the account's other devices and not for itself; marking read syncs.

#### 📋 10.2 — The mail outbox

**Goal:** mail sent reliably without core. **Design:** §24. **Depends on:** 10.1, 1.6.

**Technical:** Tally's `mail_outbox` and Tusk's mailer with `WALLET_SMTP_*`; addresses sealed under the server's key; retries with backoff; templates
for each kind, naming no entry; without mail, Settings says notices are in the bell only.

**Accepts when:** against a fake SMTP server, `new_device` mails once even with two workers; a failure retries and then stops with a recorded reason.

#### 📋 10.3 — Core's services

**Goal:** core's bell, email and activity when hosted. **Design:** §24, §25.4. **Depends on:** 10.2, 2.2.

**Technical:** `@sovereignfs/sdk` app-scope calls (`notifications:send`, `email:send` for linked accounts, `activity:write` for backups, restores,
exports, key changes), each with a `key`; `NotSupportedError` and refusals change nothing else.

**Accepts when:** against `createFakeCore`, a key change logs one activity line and a linked account's mail goes through core; with core absent
everything still works.

#### 📋 10.4 — Web Push and reminders while closed

**Goal:** opt-in, content-free reminders. **Design:** §15.2. **Depends on:** 10.1, 7.4, 21.6.

**Technical:** VAPID key (`WALLET_VAPID_PRIVATE_KEY`, per 21.6's outcome); `push_subscription` per device (sealed under the server's key); `reminder`
rows (`at`, channels) registered by the browser from Due items with a date, updated and removed as items change; a job sending at `at` the fixed text
by push and, if chosen, email; Settings > Notifications with the sentence on what the server learns; off by default.

**Accepts when:** a reminder row carries no text or entry id (a schema test); a due reminder is pushed once with two workers; turning it off removes
every row and subscription.
