# Epic 19: Native

## Status

📋 Planned (phase 4). Outline: each task is detailed when phase 3 is released.

## Overview

The owner expects Wallet to become a native mobile app once the web version has proven its features. Phases 1–3 keep `src/core/` portable and the
formats specified; this epic turns that into a package and decides the native route.

## Related

[`DESIGN.md`](../../DESIGN.md) §31.2, §31.3 · [research 0001](../research/0001-nfc-bluetooth-and-phone-wallets.md) §5

## Tasks

#### 📋 19.1 — The portable core as a package

**Goal:** `src/core/` usable outside the web app. **Design:** §31.2. **Depends on:** phase 3 released.

**Technical:** move `src/core/` to a workspace package (`@sovereignfs/wallet-core`, private), with its own tests and the three specifications'
vectors; the web app consumes it unchanged.

**Accepts when:** detailed when phase 4 starts.

#### 📋 19.2 — A native shell spike

**Goal:** decide between a Capacitor shell and a native app. **Design:** §31.2. **Depends on:** 19.1.

**Technical:** the PWA in Capacitor on iOS and Android with plugins for Keychain/Keystore unlock, NFC and local notifications; measure what works,
what is lost (the service worker, share target), and the cost of store review; a written recommendation in `docs/research/`.

**Accepts when:** detailed when phase 4 starts.

#### 📋 19.3 — Reading passport chips

**Goal:** what reading an ICAO 9303 chip needs. **Design:** §31.3. **Depends on:** 19.2.

**Technical:** BAC and PACE with the MRZ as the key; data groups 1 and 2 (data and photo); passive authentication against country certificates;
libraries on iOS (Core NFC with an MIT reader) and Android (IsoDep, JMRTD's licence); what Wallet would store.

**Accepts when:** detailed when phase 4 starts.

#### 📋 19.4 — Card emulation and Bluetooth

**Goal:** phone-to-phone transfer natively. **Design:** §31.3. **Depends on:** 19.2.

**Technical:** Android Host Card Emulation serving an NDEF business card; iOS limits; BLE advertising for exchanging a card between two Wallets; what
each platform allows a third-party app.

**Accepts when:** detailed when phase 4 starts.
