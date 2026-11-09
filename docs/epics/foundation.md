# Epic 1: Foundation

## Status

📋 Planned.

## Overview

The repository can hold the app: tooling, CI, configuration, the database in three forms, jobs, security headers, the design-system shell, browser
tests, the image and the PWA. Most of it is **copied from Tusk** (building-an-app §15), renamed to `WALLET_` and trimmed; each task names what it
copied. Nothing a person would notice.

## Related

[`DESIGN.md`](../../DESIGN.md) §5, §25.3, §26.6, §29.1, §30 · Tusk's `AGENTS.md`, `DESIGN.md` §5, §17.9, §23, §24

## Tasks

#### 📋 1.1 — Repository conventions

**Goal:** the repository's rules and files in place. **Design:** §5.1. **Depends on:** —.

**Technical:** `LICENSE` (AGPL-3.0-or-later), `README.md` (what Wallet is, running it alone and hosted, the limits of what it protects, §8.6),
`CONTRIBUTING.md`, `CHANGELOG.md` with `[Unreleased]`, `RELEASING.md` and `scripts/release.sh` from Tusk, `.gitignore`, `.editorconfig`, `.nvmrc`
(Node 24.15+), `package.json` with pnpm 11 and `pnpm-workspace.yaml` (`minimumReleaseAge`, `allowBuilds`), `sovereign.manifest.json` as §25.3 (port
3006).

**Accepts when:** `pnpm install --frozen-lockfile` works on a clean checkout; the manifest validates with `pnpm exec sovereign-manifest check`.

#### 📋 1.2 — Format, lint and test tooling

**Goal:** one command each for format, lint, types and tests. **Design:** §30. **Depends on:** 1.1.

**Technical:** Prettier and ESLint with the suite's rules (Tusk's configs), `tsc --noEmit` strict, Vitest with a Node project (pure and server) and a
browser-like project (`happy-dom`, `fake-indexeddb`, WebCrypto from Node); an ESLint rule (restricted imports) that keeps `src/core/` free of React,
Next.js, `src/server/` and DOM globals other than `crypto`, `TextEncoder`/`TextDecoder` and `fetch`.

**Accepts when:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass on the empty app; importing `react` from `src/core/` fails
lint.

#### 📋 1.3 — Continuous integration

**Goal:** every PR checked. **Design:** §30. **Depends on:** 1.2.

**Technical:** GitHub Actions as Tusk's: only what a change affects; format, lint, types, unit tests, the data layer on the three databases (services
for sqld and PostgreSQL), the manifest check, the build; Playwright in a later job once 1.9 lands.

**Accepts when:** a PR shows each check; a formatting error fails it.

#### 📋 1.4 — Configuration and start-up

**Goal:** every setting declared once and checked at start-up. **Design:** §29.5, §30 Deployment. **Depends on:** 1.2.

**Technical:** `src/config/` with `@sovereignfs/config` `defineConfig({ prefix: 'WALLET', variables })`: the shared names, `WALLET_WORKER`, every
limit of §29.5, `WALLET_ENCRYPTION_KEY` and `_PREVIOUS`, `WALLET_GITHUB_*`, `WALLET_SMTP_*`; phase 3 names added by their tasks. `_FILE` forms for
secrets; every problem reported at once by name, no value printed; `.env.example` kept in step by a test. `instrumentation.ts` validates before
anything listens.

**Accepts when:** a missing secret stops start-up naming it; `.env.example` and the declaration match (a test); no `NEXT_PUBLIC_*` value varies at run
time.

#### 📋 1.5 — The database layer

**Goal:** three forms, two dialects, migrations at start-up. **Design:** §29.1, §29.2. **Depends on:** 1.4.

**Technical:** copy Tusk's `src/db/` (clients, namespaces and schemas, the start-up lock, retries with `WALLET_DB_CONNECT_TIMEOUT_MS`), Drizzle
configs per dialect for `wallet` and `wallet_auth`, `pnpm db:generate <name>`, `pnpm db:dev`; the binary column type for sealed values
(`blob`/`bytea`) with a round-trip test; a parity test comparing the two dialects' schemas; tests read `WALLET_TEST_*` only.

**Accepts when:** an empty database is migrated on sqld, a `file:` database and PostgreSQL; running start-up twice changes nothing; binary values
round-trip byte for byte on all three.

#### 📋 1.6 — The job runner

**Goal:** jobs that run once even with two processes. **Design:** §5. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/jobs/` (a timer from `instrumentation.ts`, `job_claim` with conditional updates, `WALLET_WORKER=off`); no job yet but
a heartbeat test job.

**Accepts when:** two processes running the test job do its work once; a killed job is reclaimed after its lease.

#### 📋 1.7 — Security headers

**Goal:** a strict CSP and headers from the first page. **Design:** §30 Security. **Depends on:** 1.4.

**Technical:** copy Tusk's `src/security/` and `proxy.ts`: a per-request nonce; `connect-src 'self'`;
`script-src 'self' 'nonce-…' 'wasm-unsafe-eval'`; `worker-src 'self'`; `img-src 'self' blob: data:`; `object-src 'none'`; `frame-ancestors 'none'`;
`Permissions-Policy: camera=(self), screen-wake-lock=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)` (others off);
HSTS; `Referrer-Policy: no-referrer`.

**Accepts when:** a test asserts each header on a page and an API route; an inline script without the nonce is blocked in Playwright.

#### 📋 1.8 — Design system boundary and shell

**Goal:** `@sovereignfs/ui` wired in, with the empty shell. **Design:** §26.2, §26.7. **Depends on:** 1.2.

**Technical:** `@sovereignfs/ui` pinned exactly with its peers; Hanken Grotesk served by the app; `src/theme/` from Tusk (light, dark, system); the
`RootLayout`, `Header` (with the launcher, bell and avatar slots), side navigation and `MobileFooter` as §26.2 with placeholders; no local barrel.

**Accepts when:** the empty shell renders in light and dark at desktop and phone widths; a lint rule refuses literal colours.

#### 📋 1.9 — Browser tests

**Goal:** Playwright in Chromium and WebKit. **Design:** §30 Testing. **Depends on:** 1.5.

**Technical:** Tusk's Playwright setup: a server per run on a fresh `file:` database, desktop and phone projects, helpers for a **virtual WebAuthn
authenticator with PRF** (CDP in Chromium; WebKit's support checked, else the PRF tests run in Chromium only, said in the test) and a **fake camera**
(`--use-file-for-fake-video-capture` with test images of each code format), and a helper that dumps IndexedDB, Cache Storage and the service worker
cache of a context.

**Accepts when:** a smoke test opens the landing page in both browsers at both widths; the authenticator and camera helpers have a test each.

#### 📋 1.10 — The image and deployment setups

**Goal:** one image that boots in every form. **Design:** §30 Deployment. **Depends on:** 1.5, 1.6.

**Technical:** Tusk's Dockerfile (Debian, multi-stage, standalone, `USER node`, `ARG PORT` required, `EXPOSE`), `/data` and `/data/blobs` created and
writable, migrations beside the server, licences in `/usr/share/licenses/`, `.dockerignore`; `deploy/` with Compose for sqld, a file and PostgreSQL;
`/api/health` (database ready, `/data` writable); `scripts/deploy-check.sh` booting each from nothing; built with `sovereign-manifest docker-args`.

**Accepts when:** `scripts/deploy-check.sh` passes all three; the image's label carries the manifest; health answers `503` until the database is
ready.

#### 📋 1.11 — The PWA

**Goal:** installable, opening offline. **Design:** §26.6, §10.8. **Depends on:** 1.8.

**Technical:** copy Tusk's `src/sw/` and PWA manifest code: the shell by allow-list, the offline shell page, update flow; `manifest.webmanifest` with
icons, `display: standalone`, shortcuts (Cards, Add a card); an install prompt helper (Android's `beforeinstallprompt`, iOS instructions); a test that
the service worker caches only allow-listed paths.

**Accepts when:** Lighthouse's installability checks pass; offline, a signed-in address shows the shell; the cache holds nothing outside the
allow-list.
