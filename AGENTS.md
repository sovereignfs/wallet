# AGENTS.md

Guidance for every AI agent working in this repository (Codex reads this file directly; Claude Code loads it through `CLAUDE.md`). It is the one copy
of the conventions. Do not duplicate them elsewhere, and do not add task history or release narrative to it: those belong in `ROADMAP.md`, the task's
epic and the PR body.

This repository follows the conventions of [`sovereignfs/sovereign`](https://github.com/sovereignfs/sovereign) (its `AGENTS.md`,
`docs/building-an-app.md` and `docs/development-workflow.md`) and of [`sovereignfs/tusk`](https://github.com/sovereignfs/tusk) (its `AGENTS.md`, the
closest model: an app of its own built from a roadmap, whose sync, personal key and git backup Wallet builds on), and takes the mail outbox and
notices from `sovereignfs/tally`. Where this file is silent, do what Tusk does; where they differ, this file says which.

## What this is

**Wallet**, an app of the Sovereign suite exactly as Tusk, Fjord, Ledger, Tally and Roam are: the private things a person carries — cards with
scannable codes, identity documents, and (phase 2) health data, a journal and printable medical summaries; (phase 3) a business card, phone wallet
passes, NFC tags and one-off share links. **Everything is end to end encrypted** under an age key the person creates or imports: the server stores
ciphertext and never holds a key that opens an entry. **Offline first**, with each entry living on this device only, synced, or online only, and a
fully offline mode. A Sovereign instance can host it, and **it runs fully on its own, with every feature, needing no instance**. It replaces the
legacy plugin `sovereignfs/sovereign-plugin-wallet`, none of whose code, data or interface is carried over (its finance track is Ledger's). It is a
full PWA on Next.js, with its own database (sqld, a SQLite file or PostgreSQL) and files under `/data`, signing people in locally, through a Sovereign
core, or both, from one image. Four phases: cards and documents (the MVP), health, out into the world, sharing and native.

**0.1.0 is built** as a cut of phase 1 (`ROADMAP.md`, "The 0.1.0 cut"): the foundation, sign-in locally and through Sovereign, the whole encryption design (the
vault, keys, unlocking, the `synced` tier's sync) and QR cards. `DESIGN.md` is the design of the whole, `ROADMAP.md` the order, and what is not built yet is
marked ⏭ there.

## Source of truth

Read the relevant document before a task. Where two disagree, the earlier one wins and the later one is stale and should be fixed:

1. **The contracts Sovereign publishes**, in the `sovereign` repository: `contracts/app-manifest.md`, `contracts/env.md`, `docs/using-the-sdk.md` and
   `docs/specs/sdk.md`, `docs/specs/design-system.md` and `docs/design-system.md`, `docs/connecting-an-app.md`. A gap is raised in `sovereign`, not
   patched here.
2. **`DESIGN.md`**: what Wallet is and how it is built, with numbered sections that tasks cite.
3. **`docs/specs/`** (written by tasks 3.1, 4.2, 8.1): the vault, sync and backup formats as standalone specifications with test vectors. The code
   follows them; changing a format changes its spec, its version byte and its vectors in the same PR.
4. **`ROADMAP.md`**: the order of work, one row per task, canonical for status.
5. **`docs/epics/`**: each task's detail (goal, "Accepts when", and once done, how it was done and what was left out).

Directories are created when they are needed. Research (`docs/research/`), RFCs (`docs/rfcs/`), ADRs (`docs/adrs/`) and workstreams
(`docs/workstreams/`) are used as Sovereign and Tusk use them. A documented "not now" is a valid outcome.

## Planning workflow

- **The developer assigns the task** at the start of a session. There is no "next task" pointer in any file; read `ROADMAP.md` for the queue and ask
  which to pick up.
- **Task IDs are permanent** (`4.3`): use them in cross-references and dependency lists, never in branch names, commit messages or PR titles.
- **A finished task is marked done in its roadmap row and written up in its epic** (Done as: what, where, what was left out), in the same change as
  the work.
- **Copying from Tusk or Tally is said, not hidden:** a task that copies a file names it in its Done as, and changes in behaviour are stated.
- **Epic 21 is work in `sovereign`;** a Wallet task that depends on it waits for the published release. Where Tally or Roam needs the same part, one
  build serves all.
- **Phase 4 (epics 18, 19) is an outline;** its tasks are detailed when phase 3 is released.
- **`DESIGN.md` §33 lists what still waits on an input** (the medical review, Apple and Google accounts, PRF on real devices, the independent review);
  the task it blocks says so.

## Working conventions

- **One task, one branch, one draft PR.** Branch from an up-to-date `main`, named `feat/<slug>`, `fix/<slug>`, `docs/<slug>` or `chore/<slug>`. Do not
  start a second task on a branch whose PR is not merged.
- **Nothing goes to `main` directly,** except the owner's bypass, which is theirs to use.
- **Never commit or push without being asked.** Prepare changes in the working tree and stop.
- **Commits explain why.** `type(scope): summary` under 72 characters, body wrapped at 100, a `Verified:` line naming what was run, one logical change
  per commit. Every commit an agent makes ends with `Co-Authored-By: Claude Code <noreply@anthropic.com>`: model-agnostic, never a specific model
  name.
- **PRs target `main`, are opened as drafts** (`gh pr create --draft --base main`), and are marked ready only on instruction. The body says what
  changed and why, cites the `DESIGN.md` section, carries no task numbers, and ends with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Merge with rebase and merge,** never squash and never a merge commit. **Never merge a PR automatically.**
- **Verify before claiming done.** Run the commands under Commands and show the output. A regression test is trusted only after it has been seen to
  fail against the code it guards.
- **Docs are part of the change.** A statement a change makes false is fixed in the same PR; a change to behaviour adds a line under `## [Unreleased]`
  in `CHANGELOG.md`.
- **Releases are their own PR,** as Tusk's: `scripts/release.sh`, a `vX.Y.Z` tag publishes the image. A patch has no migration and no setting change.
- **Flag Docker-config impact immediately:** a new setting, port, path or WebAssembly asset updates the `Dockerfile` and `.dockerignore` in the same
  change.

## Rules of an app

Tusk's rules, as they apply here, and Wallet's own. They describe the app as `DESIGN.md` designs it.

- **Every feature works with no Sovereign instance.** Core adds a way in, a bell, email and activity; a feature that only works with core is not done.
  A call to core that fails, is refused or is not supported changes nothing but that call (`DESIGN.md` §25.4). **Files and backups are always Wallet's
  own.**
- **The server never reads an entry.** Every entry's shape, body and files are sealed in the browser through `src/core/vault/` (`DESIGN.md` §8) before
  they leave memory, and opened only in the browser. **No server code imports `src/core/vault/`'s opening functions for entries**, and no route
  accepts an entry field in plain text. The server's own key (`src/crypto/`) seals only the server's secrets (§8.7), never an entry.
- **The kind of an entry is in its sealed shape,** never a column. The server sees only `DESIGN.md` §8.5's list; a new column on `entry` is a design
  change.
- **Keys stay in memory, non-extractable, and go at lock.** The wallet key and recovery key are never stored by Wallet; the vault key and entry keys
  are `CryptoKey`s with `extractable: false` once loaded; locking clears them, the in-memory index, decrypted object URLs and screen state (§9.1).
- **The device's store holds ciphertext only:** IndexedDB, Cache Storage and the service worker cache never hold a plaintext entry, and **never
  anything of an Online only entry** (§10.2). The raw-dump test (3.6) guards this and is extended with every new kind.
- **Tier and mode rules are in the statement:** a body only for `synced` and `server` entries, a `device` tier change only from its holder, no body in
  fully offline mode (§5.2).
- **The format has one implementation and a specification:** the vault (§8), sync (§11) and backup (§23) formats live in `src/core/` and in
  `docs/specs/` with test vectors; a change bumps the version byte and updates both. **Never invent a format beside them.**
- **`src/core/` is portable:** no React, Next.js, `src/server/` or DOM beyond WebCrypto, `TextEncoder`/`TextDecoder` and `fetch` (a lint rule), so a
  native app can take it (§31.2).
- **A pure figure has one implementation,** in `src/core/`: Due, BMI, units, the test catalogue and conversions, trends, flags, journal aggregates,
  vCard, search, merge. The browser runs them; the tests run them in Node.
- **Entries are written only through the one path:** `writeEntry` validates, seals, writes the store and the outbox in one transaction; `/api/sync`
  applies it in one short transaction that increments the account's `seq`. A replayed mutation writes nothing. **Conflicts are merged on the device**
  (§11.5). Nothing anyone typed is thrown away: a refused change goes to Couldn't sync.
- **The vault header, devices, the backup connection, publishing and share links are online operations,** decided by the server at once.
- **A person's rows carry `account_id`; the permission is in the statement.** A refusal reads as not found. A route, operation or mutation finds the
  session first, checks `Origin` on a write, is listed in `src/access/routes.ts`, and has a test calling it as a second person. Phase 3's `/c/<slug>`
  and `/s/<id>` are the only routes without a session.
- **Everything of an account is removed by `People.deletePerson`** (`src/sovereign/people.ts`), files under `/data/blobs` included, safe to run twice.
  **A new table is handled there in the same change,** with a test that seeds one of each.
- **Images are processed in the browser before encryption,** every piece of metadata removed (§11.6); the server never sees a file's name, type or
  dimensions.
- **What leaves the encryption is the person's explicit choice, said in a sentence first:** passes, public cards, Google Wallet, the readable export
  (§19.3, §20, §23.4). Pass routes store and log nothing of what they sign.
- **A share link's key is only ever in the URL fragment;** the server never receives it, logs it or puts it in a redirect.
- **Health is records, not advice:** flags only against the report's own range; no built-in ranges but the adult BMI bands; the "not medical advice"
  line on health screens (§16.9).
- **A job claims its work in the database** and is safe to run twice and from two processes.
- **Logs hold no entry content (the server has none), no names, emails, addresses or file names:** an id and a kind of failure. Credentials and share
  keys never appear in an error, a log, a URL or the browser.
- **The browser talks only to its own server.** No third-party load or request; WebAssembly modules, the pdf.js worker and fonts are served by Wallet.
  The only navigation elsewhere is the person opening a Google Wallet link (§20.2). What people write is rendered as text, never HTML.
- **The database has three forms and two dialects:** a schema and migrations per dialect, generated with `pnpm db:generate`, never written by hand or
  `push`ed; standard SQL, values bound; no `LISTEN/NOTIFY`, trigger, extension or foreign key; every deletion names what it deletes, in a transaction;
  short transactions, nothing held across a call to core, SMTP or GitHub. A data-layer test runs on sqld, a `file:` database and PostgreSQL. **Tests
  read `WALLET_TEST_*` and never the app's variables, and never reach the internet.**
- **A released migration is never edited:** a fix is a new migration.
- **The manifest is the one copy** (`sovereign.manifest.json`) of what an instance reads. `pnpm manifest:check` passes, and the image is built with
  `pnpm exec sovereign-manifest docker-args`. The port is 3006 everywhere.
- **Environment variables carry the prefix `WALLET_`,** declared once through `@sovereignfs/config`; every one is in `.env.example`; the server
  refuses to start on a wrong setting; no secret has a default; never `NEXT_PUBLIC_*` for a value that varies at run time.
- **The design system is imported from `@sovereignfs/ui` directly,** pinned exactly; style with `--sv-*` tokens only (codes are drawn black on white
  by design); Hanken Grotesk served by the app. **Reusable UI is built in `@sovereignfs/ui` in `sovereign`, released, then used** (epic 21), never
  forked here.
- **Never fork a navigation decision by viewport;** fork only what is rendered. Every chart has a list of the same.
- **User-facing words are "wallet", "entry", "card", "document", "family member", "Me", "wallet key", "recovery key", "lock", "unlock", "This device
  only", "Synced", "Online only", "Fully offline", "Due", "backup file", "app"** (`DESIGN.md` §4), never "vault", "tier", "stub", "blob", "DEK",
  "plugin", "tenant", "client", "E2EE" or "dependant".
- **Next.js tracks the latest stable release.** Read the guide bundled with the installed version (`node_modules/next/dist/docs/`) before writing Next
  code.
- **TypeScript is strict.** No `any` without a comment; prefix an intentionally unused identifier with `_`; never disable a lint rule inline without a
  comment.

## pnpm

As Tusk's: `pnpm install --frozen-lockfile` for every routine install; `pnpm-workspace.yaml` carries pnpm's settings and the Dockerfile copies it;
pnpm refuses a release less than a day old and an install script nobody decided on (each in `allowBuilds` is decided in its task); an exception in
`minimumReleaseAgeExclude` only for a package of ours, exact-pinned. Never accept pnpm's offer to add one. **Cryptographic dependencies**
(`age-encryption`, `hash-wasm`) are pinned exactly and updated only in a PR of their own that reruns the format's test vectors.

## Commands

| Command                                                         | What                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                | Install, from the lockfile                                                                                                           |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | Format, lint (including the two import rules), types, unit and data-layer tests (a file; `WALLET_TEST_*` select sqld and PostgreSQL) |
| `pnpm build`                                                    | The standalone build (it copies the scanner's `.wasm` into `public/zxing/` first)                                                    |
| `pnpm e2e`                                                      | Playwright, against a build: Chromium, a phone, WebKit, and Chromium with a fake camera and authenticator                            |
| `pnpm boot-check`                                               | A built server against the database the environment names                                                                            |
| `pnpm db:generate <name>`, `pnpm db:dev`                        | Generate a migration for both dialects and both stores; start sqld or PostgreSQL in Docker                                           |
| `pnpm manifest:check`                                           | `sovereign.manifest.json` is valid                                                                                                   |
| `pnpm seed`, `pnpm seed -- --reset`, `--remove`                 | A development wallet with its key in `seed/` (never in production)                                                                   |
| `scripts/deploy-check.sh`, `scripts/test-release.sh`            | Bring the image up in every documented setup; test the release script                                                                |

## Layout

`app/` routes (one signed-in page for every address of the area, `app/(app)/[...path]`, which the browser turns into a screen from the address), `src/core/`
(portable: `vault/`, `entries/`, `sync/`; no React, Next.js, Node or DOM), `src/keyring/` (keys in memory, locking, unlock wrappers), `src/local/` (the device's
store, the wallet, the sync loop), `src/server/` (entries and the vault header: stores ciphertext, never imports `src/core/vault`), `src/barcode/` (drawing and
scanning codes), `src/screens/` and `src/ui/` (the screens), `src/db/`, `src/auth/`, `src/crypto/` (the server's own key), `src/sovereign/` (core's notices and
`People.deletePerson`), `src/config/`, `src/security/`, `src/sw/`, `src/jobs/`, `src/limits/`, `src/access/` (the table of routes), `docs/specs/` (the
formats), `docs/research/`, `docs/epics/`, `migrations/`, `deploy/`, `e2e/`, `scripts/`.
