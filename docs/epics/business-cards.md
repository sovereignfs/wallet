# Epic 14: Business cards and contacts

## Status

📋 Planned (phase 3).

## Overview

A personal digital business card, sent by QR code, `.vcf`, the share sheet and an optional public page; and the small list of cards others give. Phone
wallets and NFC tags are epic 15.

## Related

[`DESIGN.md`](../../DESIGN.md) §19, §20.4 · research 0001

## Tasks

#### 📋 14.1 — The business card

**Goal:** one or more cards with their fields and photo. **Design:** §19.1. **Depends on:** 4.6, 9.3.

**Technical:** the `business_card` kind; `/business-cards` and `/business-cards/<id>`; a card preview in its colour; photo and logo through 4.6.

**Accepts when:** two cards (work and personal) are made and synced.

#### 📋 14.2 — vCard and QR

**Goal:** a card any phone can read. **Design:** §19.2. **Depends on:** 14.1.

**Technical:** `src/core/vcard/` pure: write vCard 3.0 and 4.0 and MECARD with RFC escaping and folding; read the same; size estimate; the QR full
screen (vCard, falling back to MECARD past a readable size); tests against RFC examples and files exported by iOS and Android (fixtures).

**Accepts when:** the QR of a sample card is decoded (zxing-wasm) to a vCard that reads back to the same fields; an iOS-exported fixture reads
correctly.

#### 📋 14.3 — The share sheet

**Goal:** send the card by AirDrop, Quick Share or a message. **Design:** §19.2, §20.4. **Depends on:** 14.2.

**Technical:** `.vcf` with the photo inline; `navigator.canShare({ files })` then `navigator.share`; a download elsewhere; the same helper used for
backup files, copies and PDFs.

**Accepts when:** the share call receives a `text/vcard` file (spied in Playwright); without the API, a download starts.

#### 📋 14.4 — The public page

**Goal:** an opt-in page for a card. **Design:** §19.5. **Depends on:** 14.1, 3.3.

**Technical:** `WALLET_PUBLIC_CARDS`; `published_card` (content sealed under the server's key); Publish and Unpublish with the sentence of §19.3;
`/c/<slug>` (random slug, no session, `noindex` unless chosen, Download contact, no tracking, the CSP of the rest); editing asks to update the copy;
rate limits.

**Accepts when:** a published card is served at its slug and gone after unpublishing; with the setting off the button and route do not exist.

#### 📋 14.5 — Received contacts

**Goal:** keep cards others give. **Design:** §19.4. **Depends on:** 14.2, 6.3.

**Technical:** the `contact` kind; from scanning a vCard or MECARD QR (6.3's scanner), a `.vcf` (file, share target 13.4, drag), or an NFC tag (15.3);
`/contacts`; download as `.vcf`.

**Accepts when:** scanning another person's card QR makes a contact with the right fields; a `.vcf` file does the same.
