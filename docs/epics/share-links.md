# Epic 17: Share links

## Status

📋 Planned (phase 3).

## Overview

One-off links that show a summary, a report, a document or a business card to someone without an account, decrypted in their browser with a key the
server never sees.

## Related

[`DESIGN.md`](../../DESIGN.md) §22

## Tasks

#### 📋 17.1 — One-off encrypted links

**Goal:** the mechanism. **Design:** §22. **Depends on:** 3.1, 3.2, 1.6.

**Technical:** a random `K`; the snapshot sealed with §8.2 and §8.3's formats under `K` with the share id as AAD; optional passcode mixed with
Argon2id; `POST /api/shares` (ciphertext under `/data/shares`, `share_link` row, limits `WALLET_SHARE_MAX_DAYS`, `WALLET_LIMIT_SHARES`); `/s/<id>`
public page that fetches and decrypts with the fragment's key, renders read-only with a print button, counts an open; expiry, max opens and revoke; a
job deleting expired ones; Settings > Sharing; the link as a QR code, copied, or shared.

**Accepts when:** the server's request log never contains the fragment; a link stops working after expiry, its last open, or revoking, and its file is
gone; a wrong passcode fails without revealing anything.

#### 📋 17.2 — Sharing a summary, report or document

**Goal:** the share button where it is useful. **Design:** §22, §18. **Depends on:** 17.1, 13.2, 13.3.

**Technical:** "Share as a link" on the medical summary, the doctor's report, a document (pages or a watermarked copy, 16.1), a lab report and a
business card; the snapshot renders with the print layout's components on `/s/<id>`.

**Accepts when:** a doctor's report opened from its link in a fresh browser shows the same content as the print page.
