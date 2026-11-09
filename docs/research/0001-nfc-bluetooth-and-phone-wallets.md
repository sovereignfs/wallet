# Research 0001: NFC, Bluetooth and phone wallets from a PWA

**Status:** written on 2026-11-09 during planning, from what was known of the platforms then. **Re-check each row against current browser releases
when the task that relies on it is built** (15.1–15.3, 14.3, 3.7); the task's Done as records what was found.

**Question (the owner's):** can Wallet, a PWA, reach NFC or RFID, over WebAssembly or another way, to do interesting things: add the business card to
Apple Wallet or Google Wallet, and transfer it over Bluetooth or NFC where the device supports it?

## 1. WebAssembly does not add hardware access

WebAssembly runs inside the same sandbox as JavaScript and reaches the outside world only through the browser's APIs. It makes heavy work fast (Wallet
uses it to decode barcodes, zxing-wasm, and to stretch passcodes, Argon2id), but **it cannot open a radio, a USB device or a smart card that
JavaScript cannot.** So the question is which web APIs exist.

## 2. What each web API offers

| API                        | What it does                                                                        | Where                                                                                                                   | Useful for Wallet                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Web NFC** (`NDEFReader`) | Reads and writes **NDEF** messages on NFC tags, while the page is open and in front | **Chrome on Android only.** Not iOS (any browser), not desktop                                                          | Writing a business card (vCard or a URL) to a sticker or badge; reading cards and links from tags                   |
| Web NFC: low-level access  | ISO-DEP / APDU, MIFARE, FeliCa commands                                             | **Nowhere**: out of the spec's scope                                                                                    | —: transit cards, payment cards and passport chips cannot be read                                                   |
| Card emulation (HCE)       | The phone acting as a tag or card                                                   | **Nowhere** on the web                                                                                                  | —: no phone-to-phone NFC from a PWA. Android Beam, which did this natively, was removed in Android 10               |
| **Web Bluetooth**          | Connects **out** to a BLE peripheral's GATT services (a central only)               | Chrome and Edge on desktop and Android. **Not Safari**, not Firefox                                                     | —: a page cannot advertise, so two phones cannot find each other; no Classic Bluetooth, no file transfer            |
| **Web Share** with files   | Hands a file to the OS share sheet                                                  | Safari on iOS and macOS, Chrome on Android, Chrome and Edge on Windows and ChromeOS (checked with `navigator.canShare`) | **AirDrop and Quick Share**: the OS does the Bluetooth and Wi-Fi transfer. This is how a PWA "sends over Bluetooth" |
| WebUSB, WebHID             | Raw USB and HID devices                                                             | Chromium on desktop and Android; not iOS                                                                                | —: Chrome blocks the smart-card USB class, so a USB NFC reader (ACR122U and the like) cannot be used                |
| Web Smart Card API         | PC/SC readers                                                                       | Chrome **Isolated Web Apps** on ChromeOS only                                                                           | —: not available to a normal PWA                                                                                    |
| **BarcodeDetector**        | Decodes barcodes from images and video                                              | Chrome on Android, ChromeOS and macOS; not Safari, not Firefox, not Chrome on Windows/Linux                             | Scanning cards; zxing-wasm covers the rest                                                                          |
| **WebAuthn PRF**           | A secret from a passkey, for encryption                                             | Chrome and Edge 116+ with a platform authenticator, Safari 18+ with iCloud Keychain, recent Firefox                     | Unlocking with Face ID or a fingerprint (§9.3)                                                                      |
| **Screen Wake Lock**       | Keeps the screen on                                                                 | Every current browser                                                                                                   | Showing a card at the till                                                                                          |
| Screen brightness          | Raising the brightness                                                              | **Nowhere** on the web                                                                                                  | —: a white page and a hint instead                                                                                  |

## 3. Apple Wallet

- **A pass is a signed `.pkpass`**: a ZIP of `pass.json`, images, a `manifest.json` of SHA-1 hashes, and a detached PKCS #7 signature made with a
  **Pass Type ID certificate** from an **Apple Developer Program** membership (paid, yearly), plus Apple's WWDR intermediate certificate.
- **Safari opens it** (`application/vnd.apple.pkpass`) and shows **Add to Apple Wallet**; on other platforms it downloads (Android needs a third-party
  app). A PWA can do this: it is a download, not an API.
- **Pass styles:** generic (a business card fits here), store card (loyalty), event ticket, boarding pass, coupon. **Barcodes:** QR, PDF417, Aztec,
  Code 128 only.
- **Signing needs the private key on a server** (or in the browser, which would mean giving every user the operator's key: not acceptable). So the
  server sees the pass's fields at the moment of signing. Wallet's design (§20.1) keeps nothing and logs nothing, and says so to the person.
- **Updating a pass later** needs a web service and Apple's push; not planned.
- Libraries: `passkit-generator` (Node, MIT), or signing with `node-forge`.

## 4. Google Wallet

- **A "Save to Google Wallet" link** carries a JWT signed with a **service account** of a **Google Wallet issuer account** (free; production use needs
  Google's approval). The JWT can hold a pass class and object inline.
- **Pass types:** generic (a business card), loyalty, gift card, event ticket, boarding pass, transit, offer. **Barcodes:** QR, Aztec, PDF417, Code
  128, Code 39, EAN-13, UPC-A, ITF, Data Matrix and others.
- **The person opens `pay.google.com`** to save it: a top-level navigation they choose, not a background request, so it fits "no third party in the
  browser". **Google stores the pass**, which Wallet says before the first use.
- Works from any browser; the pass lands in the Google Wallet of the signed-in Google account (Android, and the web).

## 5. What only a native app can do

| Capability                                 | iOS                                                        | Android                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Read NDEF tags                             | Core NFC (since iOS 11)                                    | Yes                                                                                            |
| **Read passport and ID chips** (ICAO 9303) | Core NFC ISO 7816 (since iOS 13), BAC or PACE with the MRZ | IsoDep, BAC or PACE (JMRTD and others)                                                         |
| Read transit or payment cards              | Limited (FeliCa, some ISO 7816 with entitlements)          | IsoDep, MIFARE (with the right keys)                                                           |
| **Card emulation**                         | Restricted (regional entitlements for payments and passes) | **Host Card Emulation:** the phone serves an NDEF card, so a business card taps phone to phone |
| Bluetooth LE advertising (phone to phone)  | Core Bluetooth                                             | Yes                                                                                            |
| Add to Apple Wallet                        | PassKit's add sheet (the pass still needs signing)         | —                                                                                              |
| Keys in hardware                           | Secure Enclave, Keychain with biometry                     | Keystore / StrongBox with biometry                                                             |
| Reminders with no server                   | Local notifications                                        | Local notifications                                                                            |

A **Capacitor** shell keeps the PWA's code and adds most of this through plugins; a fully native app is the alternative (epic 19).

## 6. What Wallet does with this

| The owner's ask                | Phase 3, as a PWA                                                                              | Later, native                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Business card to Apple Wallet  | A signed generic pass, when the operator provides Apple's certificate (15.1)                   | The same pass, through PassKit's sheet       |
| Business card to Google Wallet | A save link, when the operator provides an issuer account (15.2)                               | The same                                     |
| Cards to Apple / Google Wallet | The same mechanism for cards whose code format the wallet supports                             | The same                                     |
| Transfer over Bluetooth        | **The share sheet:** AirDrop and Quick Share (14.3)                                            | BLE between two Wallets                      |
| Transfer over NFC              | **Write a tag** (a sticker, a badge) on Android (15.3); the other phone reads the tag natively | Phone to phone with HCE on Android           |
| Read NFC/RFID                  | NDEF tags only, on Android (15.3)                                                              | Passport chips (with the MRZ), transit cards |
| Universal fallback             | **A QR code of the vCard**, offline, read by any phone's camera (14.2)                         | —                                            |

## 7. References

- Web NFC: <https://w3c.github.io/web-nfc/> and <https://developer.chrome.com/docs/capabilities/nfc>
- Web Bluetooth: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API>
- Web Share: <https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share>
- WebAuthn PRF extension: <https://w3c.github.io/webauthn/#prf-extension>
- Apple Wallet passes: <https://developer.apple.com/documentation/walletpasses>
- Google Wallet API: <https://developers.google.com/wallet>
- ICAO Doc 9303 (machine readable travel documents): <https://www.icao.int/publications/pages/publication.aspx?docnum=9303>
