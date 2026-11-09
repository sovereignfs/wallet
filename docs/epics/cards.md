# Epic 6: Cards

## Status

📋 Planned.

## Overview

Cards with scannable codes: every common format drawn in the browser, scanned from the camera or an image, shown full screen with the screen kept
awake, with photos and a logo. The plugin's barcode list is the starting point.

## Related

[`DESIGN.md`](../../DESIGN.md) §13 · the plugin's `app/_lib/barcodeFormats.ts` (for the list only)

## Tasks

#### 📋 6.1 — The card model

**Goal:** the `card` kind with validators. **Design:** §13.1, §13.2. **Depends on:** 4.4, 5.1.

**Technical:** shape and body as §13.1 in `src/core/entries/card.ts`; `src/core/barcode/formats.ts` with each format's allowed payload (digits and
length, check digits for EAN, UPC, ITF; character sets for Code 39, 93, Codabar; binary allowed for QR, Aztec, PDF417, Data Matrix) and a validator
with a reason for each refusal.

**Accepts when:** a table of valid and invalid payloads per format passes; an EAN-13 with a wrong check digit is refused with the reason.

#### 📋 6.2 — Drawing codes

**Goal:** every format drawn crisply, black on white. **Design:** §13.2. **Depends on:** 6.1.

**Technical:** `src/barcode/draw.ts` with `bwip-js` to SVG, quiet zones, scaling to the container, the human-readable text option; licence checked and
shipped; a component `CodeView` with no app dependency (a candidate for 21.7).

**Accepts when:** each format's sample is drawn and **decoded back** by zxing-wasm in a test to the same payload.

#### 📋 6.3 — Scanning

**Goal:** add a card by pointing the camera or choosing an image. **Design:** §13.2. **Depends on:** 6.1.

**Technical:** `src/barcode/scan.ts`: `getUserMedia` (back camera, torch where supported), frames to `BarcodeDetector` when it supports the needed
formats, else `zxing-wasm` in a worker (its `.wasm` served by the app under the CSP's `'wasm-unsafe-eval'`); scanning an image file, a pasted image or
a dropped one; a result maps to format and payload; permission refused or no camera offers typing; licences checked. The same scanner reads the
recovery sheet (3.5) and vCards (14.5).

**Accepts when:** with the fake camera, each format's test image is read to the right format and payload in Chromium; an image file is read in both
browsers; refusing permission shows the typing form.

#### 📋 6.4 — The card screens

**Goal:** list, add, view and edit cards. **Design:** §13.4, §26.5. **Depends on:** 6.2, 9.3.

**Technical:** `/cards` (grid in colours, favourites first, drag to reorder, filters by type and member, archived apart), `/cards/new` (scan or type,
then name, type, colour), `/cards/<id>` (the code, fields, photos, where it lives, menu), edit; the tier chip and picker (9.6).

**Accepts when:** a card is added by scanning in Playwright and appears on a second context; reordering persists across devices.

#### 📋 6.5 — Showing a card

**Goal:** the code full screen at the till. **Design:** §13.3. **Depends on:** 6.4.

**Technical:** `/cards/<id>/show`: full screen (Fullscreen API where allowed), white, the largest code that fits, the number, the title; Screen Wake
Lock held and released; the brightness hint once; swipe between favourites (`SwipeStack`); opening a card from Home's row lands here.

**Accepts when:** the wake lock is held while shown and released on leaving (a test spies on the API); the code fills the width at a phone's size.

#### 📋 6.6 — Card photos and logo

**Goal:** front, back and a logo. **Design:** §13.1. **Depends on:** 4.6, 6.4.

**Technical:** capture or choose for each; processed and encrypted by 4.6; the logo shown on the grid; the photos in the document viewer (21.2).

**Accepts when:** a photo added offline is seen on a second context after sync; the logo appears on the grid.
