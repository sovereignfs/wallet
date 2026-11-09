# Epic 16: More in the wallet

## Status

📋 Planned (phase 3).

## Overview

Watermarked copies of documents made in the browser, `.pkpass` files read into cards and tickets, and three more kinds: insurance, tickets and secure
notes.

## Related

[`DESIGN.md`](../../DESIGN.md) §21

## Tasks

#### 📋 16.1 — Watermarked copies

**Goal:** a copy of a document stamped for its recipient. **Design:** §21.1. **Depends on:** 7.2.

**Technical:** choose pages; text and purpose; redaction boxes drawn on each page; canvas rendering (PDF pages rasterised by pdf.js at 200 dpi) with
the text repeated diagonally at a fixed opacity; output JPEGs or one PDF (`pdf-lib`, licence checked); download or share (14.3's helper); optionally
saved to the document as a "copy" page; nothing uploaded.

**Accepts when:** the output's pixels under a redaction box are uniform; the watermark text appears on every page; a network log of the action shows
no request.

#### 📋 16.2 — Importing a `.pkpass`

**Goal:** a pass file becomes a card or a ticket. **Design:** §21.2. **Depends on:** 6.1, 16.4.

**Technical:** `fflate` to unzip in the browser; `pass.json` read for type, barcodes (format mapping), fields, colours, relevant date; logo and strip
images through 4.6; store cards, generic passes and coupons → `card`, event tickets and boarding passes → `ticket`; "imported, not verified" noted;
from the file picker, the share target (13.4) and drag.

**Accepts when:** fixture passes of each type import with the right code and fields.

#### 📋 16.3 — Insurance

**Goal:** policies with their numbers and hotlines. **Design:** §21.3. **Depends on:** 4.6, 5.1.

**Technical:** the `insurance` kind; `/insurance`; an optional code shown like a card (reusing 6.2 and 6.5); renewals into Due.

**Accepts when:** a renewal date appears in Due; a policy with a code shows it full screen.

#### 📋 16.4 — Tickets

**Goal:** tickets shown at the gate and archived after. **Design:** §21.4. **Depends on:** 6.2, 7.4.

**Technical:** the `ticket` kind; `/tickets` by time; shown like a card; archived a day after it ends (the browser sets `archived` on unlock); today's
and tomorrow's in Due.

**Accepts when:** on a mocked clock a ticket appears in Due the day before and is archived the day after.

#### 📋 16.5 — Secure notes

**Goal:** short private text. **Design:** §21.5. **Depends on:** 4.4.

**Technical:** the `note` kind; `/notes`; rendered as text; copy button; no password features.

**Accepts when:** a note with HTML in it renders as text.
