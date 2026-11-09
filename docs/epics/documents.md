# Epic 7: Documents

## Status

📋 Planned.

## Overview

Identity documents with their fields and pages, a viewer that pages through images and PDFs, validity computed from expiry, and the **Due** panel that
every later phase adds to.

## Related

[`DESIGN.md`](../../DESIGN.md) §14, §15.1

## Tasks

#### 📋 7.1 — The document model

**Goal:** the `document` kind with validators. **Design:** §14.1. **Depends on:** 4.4, 5.1.

**Technical:** shape and body as §14.1 in `src/core/entries/document.ts`; the type list; ISO 3166-1 country codes and names (a bundled table, licence
checked); default titles ("Passport · Sri Lanka"); a visa's link to a passport by entry id.

**Accepts when:** each type validates with its fields; a default title is made from type and country.

#### 📋 7.2 — Pages and the viewer

**Goal:** capture, order and view pages. **Design:** §14.2. **Depends on:** 4.6, 21.2.

**Technical:** camera capture with a frame guide, files and PDFs; reorder and label; the design system's document viewer (21.2) fed decrypted object
URLs and decrypted PDF streams (pdf.js in memory, never a new tab); object URLs revoked on close and on lock.

**Accepts when:** a two-page document with a photo and a PDF opens in the viewer at both widths; after locking, the pages' URLs fail.

#### 📋 7.3 — The document screens

**Goal:** list, add, view and edit documents. **Design:** §14, §26.5. **Depends on:** 7.1, 7.2, 9.3.

**Technical:** `/documents` (grouped by family member, validity shown), `/documents/new` (type first, then fields, then pages), `/documents/<id>`
(fields with copy buttons, pages, validity, where it lives, menu), edit; the tier chip and picker (9.6).

**Accepts when:** a passport with two pages is added offline and seen on a second context; copying the number puts it on the clipboard.

#### 📋 7.4 — Due

**Goal:** what needs attention, on Home and on the icon. **Design:** §14.3, §15.1. **Depends on:** 6.1, 7.1.

**Technical:** `src/core/due/` pure: `due(entries, settings, today, tz)` returning items with kind, entry, date, severity; phase 1 sources (documents
and cards expiring or expired by the per-type windows, lost entries, overdue backup file in offline mode, stopped git backup); snooze and dismiss in
the `settings` entry; the Home panel; `navigator.setAppBadge(count)` while open; Settings > Due for windows.

**Accepts when:** the pure function's cases at each window's edge pass (time zones included); snoozing hides an item on every device; the badge shows
the count where the API exists.
