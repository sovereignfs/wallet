# Epic 15: Phone wallets and NFC

## Status

📋 Planned (phase 3).

## Overview

What a PWA can do with the phone's wallets and radios (research 0001): signed Apple Wallet passes, Google Wallet save links, and NFC tags on Android.
Each leaves the encryption by the person's choice, and says so.

## Related

[`DESIGN.md`](../../DESIGN.md) §20, §19.3 · [research 0001](../research/0001-nfc-bluetooth-and-phone-wallets.md)

## Tasks

#### 📋 15.1 — Apple Wallet passes

**Goal:** a business card or a card into Apple Wallet. **Design:** §20.1. **Depends on:** 14.2, 6.1, 3.3.

**Technical:** settings `WALLET_APPLE_PASS_TYPE_ID`, `WALLET_APPLE_TEAM_ID`, `WALLET_APPLE_PASS_CERT`, `WALLET_APPLE_PASS_KEY`,
`WALLET_APPLE_PASS_KEY_PASSWORD`, `WALLET_APPLE_WWDR_CERT` (all or none, checked at start-up); `src/passes/apple.ts` building a generic pass
(`pass.json`, icons, logo, the barcode in a supported format, `manifest.json` of SHA-1 hashes, a detached PKCS #7 signature) with `passkit-generator`
or `node-forge` (decided by licence and maintenance in the task); `POST /api/passes/apple` taking the readable fields, returning
`application/vnd.apple.pkpass`, storing and logging nothing but a count; rate-limited; the button hidden without settings and for unsupported formats;
the sentence of §19.3 first.

**Accepts when:** a generated pass validates against Apple's structure (a test checks the manifest's hashes and the signature with the test
certificate); the route logs no field; with settings absent the button is hidden. Testing on a real iPhone waits on §33's account and is recorded.

#### 📋 15.2 — Google Wallet passes

**Goal:** a business card or a card into Google Wallet. **Design:** §20.2. **Depends on:** 14.2, 6.1, 3.3.

**Technical:** settings `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_SERVICE_ACCOUNT_KEY`; `src/passes/google.ts` signing a "Save to Google Wallet" JWT
(RS256, `jose`) with a generic class and object inline and the barcode mapped to Google's types; `POST /api/passes/google` returning the link; the
browser navigates to it after the sentence that Google stores the pass.

**Accepts when:** the JWT verifies with the test key and carries the right object; unsupported formats are refused with a sentence. Testing with a
real issuer waits on §33.

#### 📋 15.3 — NFC tags

**Goal:** write a business card to a tag; read cards from tags. **Design:** §20.3. **Depends on:** 14.2, 14.5.

**Technical:** feature detection of `NDEFReader`; write a `text/vcard` MIME record, or a URL record to the public page when too large (the card's size
against common tag capacities shown); optional make-read-only with a warning; read vCard and URL records into contacts, text records into notes;
errors in sentences (no tag, tag too small, write-protected).

**Accepts when:** with a mocked `NDEFReader`, writing produces the right records and reading makes a contact; without the API nothing NFC is shown.
Tested on a real Android phone and tag before release, recorded in the Done as.
