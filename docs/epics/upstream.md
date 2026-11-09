# Epic 21: Upstream, in `sovereign`

## Status

📋 Planned.

## Overview

What Wallet needs from the platform repository: parts of the design system and two platform details. Built and released in `sovereign`, following its
conventions; a Wallet task that depends on one waits for the published release. **Check what already exists first** (Tally and Roam plan some of the
same parts); where one build serves several apps, it is one task.

## Related

[`DESIGN.md`](../../DESIGN.md) §26.7, §32 · Tally's and Roam's upstream epics

## Tasks

#### 📋 21.1 — A line chart with a reference band

**Goal:** time series with a band and markers. **Design:** §16.4, §16.7, §17. **Depends on:** —.

**Technical:** in `@sovereignfs/ui`: a line chart (one or two series), a reference band (constant, or per point for lab ranges), point markers with
tooltips, ranges, tokens only, an accessible table of the same; shared with Tally's charts.

**Accepts when:** released in `@sovereignfs/ui` with a Storybook story; Wallet pins it.

#### 📋 21.2 — A document viewer

**Goal:** images and PDF pages, zoomed, rotated, paged. **Design:** §14.2, §16.6. **Depends on:** —.

**Technical:** a viewer taking object URLs and PDF data (pdf.js as an optional peer, its worker served by the app), with zoom, rotate, pages, a
side-by-side mode for forms; shared with Roam's photo viewer. It never opens a new tab or caches.

**Accepts when:** released with a story; Wallet pins it.

#### 📋 21.3 — A passcode input and a step flow

**Goal:** setup's parts. **Design:** §26.3, §9.3. **Depends on:** —.

**Technical:** a passcode input (digits or characters, masked, paste); a step flow (progress, back, resumable state from the caller).

**Accepts when:** released with stories; Wallet pins them.

#### 📋 21.4 — A rating scale

**Goal:** mood and energy in one tap. **Design:** §17. **Depends on:** —.

**Technical:** a 1–5 scale with labels and icons, keyboard and touch, tokens only.

**Accepts when:** released with a story; Wallet pins it.

#### 📋 21.5 — Port 3006

**Goal:** the port in building-an-app's table. **Design:** §32. **Depends on:** —.

**Technical:** add Wallet (3006) to `docs/building-an-app.md` §2's ports.

**Accepts when:** merged in `sovereign`.

#### 📋 21.6 — A VAPID key in `generate`

**Goal:** a push key an instance makes. **Design:** §15.2, §32. **Depends on:** —.

**Technical:** whether `generate` can make an EC P-256 key, or the app derives one from a random secret; the same question as Roam's and Tally's;
raised in `sovereign` and settled once.

**Accepts when:** the contract says how, and Wallet's 10.4 follows it.

#### 📋 21.7 — Barcode display and scanner (candidate)

**Goal:** offer Wallet's code components to the design system. **Design:** §26.7. **Depends on:** 6.2, 6.3.

**Technical:** once `CodeView` and the scanner have settled in `src/barcode/`, propose them as an optional entry point of `@sovereignfs/ui` (their
dependencies are heavy); the design system's call.

**Accepts when:** accepted and released (Wallet switches to it), or declined with the reason recorded.
