# Epic 12: Journal

## Status

📋 Planned (phase 2).

## Overview

A small journal of symptoms, mood, energy and sleep, quick to write and easy to read back, with aggregates shared with the doctor's report.

## Related

[`DESIGN.md`](../../DESIGN.md) §17, §18.2

## Tasks

#### 📋 12.1 — The journal model

**Goal:** the `journal` kind and the symptom vocabulary. **Design:** §17. **Depends on:** 4.4, 5.1.

**Technical:** the kind's shape and body; `src/core/journal/symptoms.ts` with a built-in list of common symptoms and the person's own (remembered in
the `settings` entry); `src/core/journal/aggregate.ts` pure: by day and week, mood and energy averages, symptom counts and maximum severity.

**Accepts when:** aggregates over a seeded month match hand-worked values; a new symptom is offered next time.

#### 📋 12.2 — The journal screens

**Goal:** write in seconds, read by day. **Design:** §17. **Depends on:** 12.1, 21.4.

**Technical:** quick entry (`/journal/new`, from the first screen, Health and Add): mood in one tap (the rating scale, 21.4), then symptoms with severity, then
notes, saved at any point; `/journal` by day with filters by symptom, tag and member; `/journal/<id>`; links to measurements and medications; PWA
shortcut.

**Accepts when:** an entry with only a mood is saved in two taps; filtering by a symptom lists only those days.

#### 📋 12.3 — The journal charts

**Goal:** mood and symptoms over time. **Design:** §17. **Depends on:** 12.2, 21.1.

**Technical:** a calendar of mood by day; a weekly symptom frequency chart; both with a list of the same.

**Accepts when:** a seeded quarter draws both; the list matches the chart.
