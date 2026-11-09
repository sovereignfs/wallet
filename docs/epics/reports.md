# Epic 13: Summaries and reports

## Status

📋 Planned (phase 2).

## Overview

The medical summary and the doctor's report as print pages made in the browser, saved as PDF by the browser's own dialog; and receiving files shared
from other apps.

## Related

[`DESIGN.md`](../../DESIGN.md) §18, §26.6

## Tasks

#### 📋 13.1 — The print layer

**Goal:** printable pages that look right on paper. **Design:** §18.3. **Depends on:** 9.3.

**Technical:** a print layout (no shell), a print style sheet (A4 and Letter, margins, page breaks, charts as SVG, tables that split cleanly, a footer
with the date and the line of §18.3); a **Print / Save as PDF** button; on iPhone, a sentence on using Share > Print.

**Accepts when:** Playwright's PDF output of a sample page has the footer on every page and no element cut across a page break (checked by eye once,
then by a snapshot).

#### 📋 13.2 — The medical summary

**Goal:** a family member's health on one page. **Design:** §18.1. **Depends on:** 13.1, 11.8, 11.9, 11.7.

**Technical:** the `summary` kind (surgeries, family history, notes, sections chosen); `/print/summary/<person>` composed from the open wallet; an
editor choosing sections and panels.

**Accepts when:** a seeded member's summary shows every section with the right latest values; leaving a section out removes it.

#### 📋 13.3 — The doctor's report

**Goal:** a date range of journal, measurements, labs and medications. **Design:** §18.2. **Depends on:** 13.1, 12.1, 11.4, 11.7.

**Technical:** `/print/report` with person, range and sections in the address (no content in it); journal aggregates (12.1) by week, notes as written;
measurement charts and tables; results in range with the previous result each; medications started, stopped or active.

**Accepts when:** a three-month report of seeded data matches hand-worked aggregates; the address holds no health data.

#### 📋 13.4 — The share target

**Goal:** share a PDF, image, `.vcf` or `.pkpass` to Wallet. **Design:** §26.6. **Depends on:** 1.11, 3.6.

**Technical:** `share_target` in the manifest (POST, files); the service worker receives the files, holds them in memory or, if locked, in a store
encrypted under a key wrapped like the unlock wrappers, opens Wallet's "Add to Wallet" sheet, which offers what fits (lab report, document page, card
from image; phase 3: contact, pass); deleted after use. Android only; elsewhere the file picker.

**Accepts when:** in Chromium's Android emulation a shared PDF reaches the sheet; a locked wallet keeps it until unlocked, and nothing readable of it
is in IndexedDB.
