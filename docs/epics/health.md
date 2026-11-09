# Epic 11: Health

## Status

📋 Planned (phase 2).

## Overview

Measurements over time with BMI and charts, lab reports entered beside the report with each result tracked across reports in one unit, and the medical
ID with allergies, conditions, medications and vaccinations. Everything is computed in the browser; nothing is advice.

## Related

[`DESIGN.md`](../../DESIGN.md) §16

## Tasks

#### 📋 11.1 — Units

**Goal:** canonical storage, chosen display. **Design:** §16.1. **Depends on:** 4.4.

**Technical:** `src/core/health/units.ts`: kg/lb, cm/ft-in, °C/°F, mmol/L/mg/dL for glucose, exact factors, rounding rules per quantity; Settings >
Health's choices in the `settings` entry; a `<QuantityInput>` that takes either unit and stores canonical.

**Accepts when:** worked values round-trip within rounding (a table of cases, including 5 ft 11 in and 154.3 lb).

#### 📋 11.2 — Measurements

**Goal:** readings of every type in §16.2. **Design:** §16.2. **Depends on:** 11.1, 5.1.

**Technical:** the `measurement` kind; validators with plausible bounds per type (refusing 900 kg, warning at the edges); quick forms ("Weigh in",
"Blood pressure") from Health and Add, showing the last value; a list per type; PWA shortcut "Weigh in".

**Accepts when:** each type is added offline and appears on a second context; an implausible value is refused with a sentence.

#### 📋 11.3 — BMI

**Goal:** BMI computed at each weight. **Design:** §16.3. **Depends on:** 11.2.

**Technical:** `src/core/health/bmi.ts` pure: height at or before the moment, else the earliest after; age at the moment from the date of birth; adult
bands from 18; nothing for under 18 or without a date of birth, with the sentence.

**Accepts when:** cases at the 18th birthday's edge, with no height, and with heights before and after pass.

#### 📋 11.4 — Measurement screens and charts

**Goal:** see each measurement over time. **Design:** §16.4, §16.3. **Depends on:** 11.3, 21.1.

**Technical:** `/health` (per family member: latest of each type, BMI, links), `/health/measurements/<type>` (the line chart with week, month, year,
all; blood pressure as two lines; BMI with adult bands behind; the list beneath).

**Accepts when:** a seeded year of weights charts at each range; the chart and list agree; light and dark both legible.

#### 📋 11.5 — The test catalogue

**Goal:** tests, names, panels, units and conversions. **Design:** §16.5. **Depends on:** 4.4.

**Technical:** `src/core/health/catalogue.ts` with §16.5's panels and tests (codes, names, aliases, canonical unit, reported units with factors, LOINC
where clear); `convert(test, value, from, to)`; non-HDL computed; the `test` kind for a person's own tests. Flag the catalogue for the medical review
(§33) in the epic's Done as.

**Accepts when:** every factor has a worked test (including the HbA1c formula); a lookup by any alias finds its test.

#### 📋 11.6 — Lab reports

**Goal:** a report with its results, entered beside it. **Design:** §16.6. **Depends on:** 11.5, 4.6, 21.2.

**Technical:** the `lab_report` kind; `/health/labs` (by date, per member) and `/health/labs/<id>`; the entry screen with the report (viewer) beside
the form (stacked on a phone); panels add rows; test lookup by alias; units offered per test; value as number or text; range as printed (low, high, or
text); printed flag; computed flag against the report's range only (`src/core/health/flags.ts`, pure).

**Accepts when:** a lipid profile is entered beside a PDF at both widths; flags follow the printed range and the printed flag wins; a text range "<
5.0" flags 5.2 as above.

#### 📋 11.7 — Trends per test

**Goal:** each test across reports, in one unit. **Design:** §16.7. **Depends on:** 11.6, 21.1.

**Technical:** `src/core/health/trends.ts` pure (series converted to a chosen unit, each point with its report's range, direction since the previous);
`/health/tests/<code>` (chart with per-point range bands, the list with links to reports); a panel overview (latest, flag, direction).

**Accepts when:** cholesterol entered in mg/dL and mmol/L across reports charts in one unit correctly; ranges that changed between labs show per
point.

#### 📋 11.8 — The medical ID, allergies, conditions and medications

**Goal:** the rest of a person's health record. **Design:** §16.8. **Depends on:** 5.1.

**Technical:** the `medical_id` (one per member), `allergy`, `condition` and `medication` kinds; `/health/medical-id`, `/health/medications` (active
and past), allergy and condition lists; refill dates into Due (7.4's sources).

**Accepts when:** each kind is added and listed per member; a refill date appears in Due on time.

#### 📋 11.9 — Vaccinations

**Goal:** records with next doses. **Design:** §16.8. **Depends on:** 11.8.

**Technical:** the `vaccination` kind with its certificate file; `/health/vaccinations`; next dose into Due; "Keep as a card" for a certificate with a
QR code (makes a `card` entry from a scan of it).

**Accepts when:** a next dose appears in Due; a certificate's QR becomes a card that shows full screen.

#### 📋 11.10 — Measurement reminders in Due

**Goal:** "remind me to weigh in every week". **Design:** §15.1. **Depends on:** 11.2, 7.4.

**Technical:** per member and type, an interval in the `settings` entry; Due shows the item when the last reading is older.

**Accepts when:** on a mocked clock the item appears after the interval and clears with a new reading.
