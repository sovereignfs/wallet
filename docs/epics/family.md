# Epic 5: Family

## Status

📋 Planned.

## Overview

A wallet keeps entries for the account holder ("Me") and for family members they look after. A family member is an entry, not an account; sharing with
other accounts is phase 4 (epic 18).

## Related

[`DESIGN.md`](../../DESIGN.md) §12

## Tasks

#### 📋 5.1 — Family members and Me

**Goal:** `person` entries, with Me made at setup. **Design:** §12. **Depends on:** 4.4.

**Technical:** the `person` kind in `src/core/entries/` (shape: name, relationship, colour; body: date of birth, sex, notes); Me made at setup from
the profile's name and protected from deletion; `person_id` required in every other kind's shape, defaulting to Me; Settings > Family and
`/family/<id>`; deleting a member asks to delete or move their entries to Me.

**Accepts when:** Me exists after setup and cannot be deleted; deleting a member with entries offers both choices and each works.

#### 📋 5.2 — The family switcher

**Goal:** every list filtered by family member. **Design:** §12, §26.2. **Depends on:** 5.1, 9.3.

**Technical:** a header control (All, Me, each member) kept per device; the index's queries take it; Due and search follow it; a member's page lists
their entries by kind.

**Accepts when:** switching to a member filters Cards, Documents, Due and search; the choice survives a reload.
