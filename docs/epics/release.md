# Epic 20: Release

## Status

📋 Planned.

## Overview

The seed, the security reviews, the documents a person and an operator read, each phase's release, hosting on the live instance, and an independent
review of the cryptography before 1.0.

## Related

[`DESIGN.md`](../../DESIGN.md) §30, §33 · Tusk's `RELEASING.md`

## Tasks

#### 📋 20.1 — The seed

**Goal:** a realistic wallet for development and tests. **Design:** §30 Testing. **Depends on:** 6.1, 7.1, 5.1.

**Technical:** `pnpm seed` in Node using `src/core/`: an account and a vault whose key file is written to `seed/` (development only, refused when
`NODE_ENV=production`), Me and two family members, cards of every format, documents of every type with sample pages, one entry of each tier, an
expiring passport; extended by phase 2 (years of measurements, lab reports, journal) and phase 3 (business card, tickets, insurance).

**Accepts when:** a fresh database seeds and the key file unlocks it in the browser.

#### 📋 20.2 — Security review before 0.1.0

**Goal:** a written review of phase 1. **Design:** §8.6, §30. **Depends on:** every phase 1 task but 20.3–20.5.

**Technical:** `docs/research/` write-up: the vault format and keyring against the spec, access and tier rules, the raw-dump test's coverage, the CSP,
the git backup's contents, logs, what the server can read (§8.5) checked against a real database; findings fixed or recorded.

**Accepts when:** the review is merged and every finding is fixed or has a task.

#### 📋 20.3 — The documents

**Goal:** a README a person and an operator can follow. **Design:** §30 Deployment, §8.6. **Depends on:** 1.10.

**Technical:** README: what Wallet is, what it protects and does not (§8.6 in plain words), running alone (three forms), hosting, every setting, the
backup and restore procedures, losing a key; the specifications linked.

**Accepts when:** someone new runs Wallet alone from the README without help (checked by the owner).

#### 📋 20.4 — Release 0.1.0

**Goal:** the MVP published. **Design:** §2. **Depends on:** 20.2, 20.3.

**Technical:** `scripts/release.sh check | prepare | propose | tag | verify 0.1.0`; the changelog as release notes; the package made public the first
time.

**Accepts when:** the image for both architectures is published, pulled and booted by the workflow.

#### 📋 20.5 — Hosting on the instance

**Goal:** Wallet on `openfs-suite`. **Design:** §25.3. **Depends on:** 20.4.

**Technical:** `./sv app add wallet --image ghcr.io/sovereignfs/wallet:0.1.0`, the app scopes granted, mail settings, `./sv push && ./sv deploy`,
signed in through core, setup completed on a phone and a laptop.

**Accepts when:** the owner uses Wallet hosted on two devices.

#### 📋 20.6 — Review and release 0.2.0

**Goal:** phase 2 reviewed and published. **Design:** §16.9, §33. **Depends on:** every phase 2 task.

**Technical:** a security review of what phase 2 added; **the medical review of the test catalogue and factors** (§33) recorded; release as 20.4;
update on the instance.

**Accepts when:** both reviews are merged and 0.2.0 is published and hosted.

#### 📋 20.7 — Review and release 0.3.0

**Goal:** phase 3 reviewed and published. **Design:** §19.3, §20, §22. **Depends on:** every phase 3 task.

**Technical:** a security review centred on what leaves the encryption (passes, public cards, share links, push) and the public routes; real-device
tests of passes and NFC recorded (§33); release and host.

**Accepts when:** the review is merged and 0.3.0 is published and hosted.

#### 📋 20.8 — An independent review of the cryptography

**Goal:** someone outside the project checks the vault, keyring and share links. **Design:** §30, §33. **Depends on:** 20.4.

**Technical:** the three specifications, the code and the threat model given to a reviewer the owner arranges; findings tracked as tasks.

**Accepts when:** the review's report is in `docs/research/` and its findings are resolved before 1.0.

#### 📋 20.9 — Release 0.4.0

**Goal:** phase 4 published. **Design:** §31. **Depends on:** epic 18, 19.1.

**Technical:** detailed when phase 4 starts.

**Accepts when:** detailed when phase 4 starts.
