# Epic 18: Sharing between accounts

## Status

📋 Planned (phase 4). Outline: each task is detailed when phase 3 is released.

## Overview

Family members with their own Wallet accounts receive entries end to end: an entry's derived key is sealed to their public key by the SDK's `share`. Finding people
follows Tally's invitations and directory.

## Related

[`DESIGN.md`](../../DESIGN.md) §31.1 · Tally's invitations and directory

## Tasks

#### 📋 18.1 — Recipients and finding people

**Goal:** know another account's public key, safely. **Design:** §31.1. **Depends on:** phase 3 released.

**Technical:** each account's public key from the suite (the SDK's `checkPerson`); finding people by the app's own directory and email invitations (Tally's), and
core's directory when hosted (`directory`, `offline_access` added to the manifest); **verifying a person** out of band (a short fingerprint both
people compare, or scanning each other's QR) before the first share.

**Accepts when:** detailed when phase 4 starts.

#### 📋 18.2 — Sharing an entry

**Goal:** read or edit access to one entry. **Design:** §31.1. **Depends on:** 18.1.

**Technical:** `share` rows (entry, grantee, sealed key, `read` or `edit`); a second stream for shared entries on the grantee's devices; the
access rule extended to grants; Device only entries not shareable.

**Accepts when:** detailed when phase 4 starts.

#### 📋 18.3 — A family space

**Goal:** entries every member reads and edits. **Design:** §31.1. **Depends on:** 18.2.

**Technical:** a space key wrapped to each member; entries in the space wrapped under it; joining and leaving.

**Accepts when:** detailed when phase 4 starts.

#### 📋 18.4 — Revoking and re-keying

**Goal:** take access back. **Design:** §31.1. **Depends on:** 18.2.

**Technical:** removing a grant; offering a new entry key and re-encryption, since the grantee may have kept a copy; for a space, rotating its key.

**Accepts when:** detailed when phase 4 starts.
