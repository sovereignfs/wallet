# Wallet

**The private things you carry, readable only by you.** Wallet keeps your cards (loyalty, transport, membership) as scannable codes, in a wallet that is
locked in your browser with a key only you hold. The server stores scrambled bytes it cannot open. It works with no connection: at the till, in the
basement, on a plane. It runs on its own, or on a [Sovereign](https://github.com/sovereignfs/sovereign) instance you already use, signing in the same way as
your other apps.

> **Version 0.1.0** is the foundation: sign-in (with Wallet's own accounts, or through Sovereign), the whole of the encryption design, offline sync, and QR cards. Documents,
> family members, backups, health and more follow, in the order of [`ROADMAP.md`](ROADMAP.md). What 0.1.0 does not do is said at the end of this page.

## What it protects, and what it does not

Everything you keep (a card's name, its code, your notes) is encrypted **in your browser** before it leaves it, with AES-256-GCM under a key made for each
entry, which is itself wrapped under a vault key, which is opened by an [age](https://age-encryption.org) key that only you have: your **wallet key**, a file
or a line of text you save when you set up, and, if you made one, your **recovery key**, printed on a sheet. Day to day you unlock with your face, a
fingerprint (a passkey) or a passcode, which works with no connection. The formats are written down, with test vectors, in
[`docs/specs/vault-format.md`](docs/specs/vault-format.md).

| It protects against                                                                                                     | It does not protect against                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone who reads the database, its dumps or its backups, **including whoever runs the server**                          | **A server that serves altered JavaScript**, which could take your key once the wallet is unlocked: the browser runs what the server sends                    |
| A stolen password: nothing opens without a key                                                                          | **A device that is taken while unlocked**, or malware on it. The wallet locks after a time, when hidden, and by hand                                          |
| The server moving or replaying a value between entries or accounts (each value is bound to its account, entry and part) | **What the server can still see:** how many entries you have, their sizes (to the nearest bucket), when they change, your name and address, network addresses |
| A copy of the browser's data, as far as your unlock method's strength allows                                            | **Losing every key and every unlocked device. Nobody can recover your wallet:** not the operator and not the people who wrote Wallet                          |

Wallet has **not had an independent review yet.** The design, the code and the tests are open to read, and a review before 1.0 is planned
([`DESIGN.md`](DESIGN.md) §33).

## Running it

One image, on port 3006, three ways to keep its data, from [`deploy/`](deploy/):

```bash
cd deploy
cp .env.example .env     # then edit it: at least WALLET_URL, WALLET_AUTH_SECRET and WALLET_ENCRYPTION_KEY
docker compose up -d --build                                                   # an sqld service (the default)
docker compose -f compose.file.yaml up -d --build                              # one SQLite file, the smallest
docker compose -f compose.yaml -f compose.postgres.yaml up -d --build          # PostgreSQL
```

Put a reverse proxy with TLS in front of it and set `WALLET_URL` to the address people use. The first account is the first person to sign up
(`WALLET_AUTH_SIGNUP=closed` is the default with local sign-in). [`deploy/README.md`](deploy/README.md) has the rest, including your own PostgreSQL,
updating, giving someone their account back when mail cannot (`wallet-admin`), and what an operator can and cannot see.

### On a Sovereign instance

`sv app add wallet --image ghcr.io/sovereignfs/wallet` hosts it from [`sovereign.manifest.json`](sovereign.manifest.json). The instance gives it a database
and tells it where it is; **everyone signs in through the instance**, with no password to keep here, no sign-up page and no reset: Wallet's own accounts exist
only when it runs on its own. An instance signs people in one way, never both. **Signing in through Sovereign never opens a wallet:** each person still makes
a key of their own.

### Developing

Node 24.15 or newer and [pnpm](https://pnpm.io), and Docker for the full test suite, which runs against sqld and PostgreSQL as well as a SQLite file:

```bash
pnpm install --frozen-lockfile
pnpm dev                                  # on http://localhost:3006; needs a .env (see .env.example) and a database: pnpm db:dev, or a file
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm exec playwright install chromium webkit && pnpm e2e       # the browser tests
```

A development wallet with a few cards and a key file for it: `pnpm seed` (never in production). [`AGENTS.md`](AGENTS.md) holds the rules of the code,
[`DESIGN.md`](DESIGN.md) what Wallet is and why, and [`CONTRIBUTING.md`](CONTRIBUTING.md) how a change is made.

## Every setting

Settings are environment variables with the prefix `WALLET_`. A secret may be given as `NAME_FILE=/path` instead of `NAME=value`. The server **checks them
all at start-up and stops on a wrong one, naming it and never its value.** [`.env.example`](.env.example) has them with their defaults.

| Setting                                                                                                | What it is                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WALLET_URL`                                                                                           | The address people use: https (http for localhost), no path. Links, cookies, passkeys and the sign-in redirect are made from it                                                                                                                                                                        |
| `WALLET_AUTH_LOCAL`                                                                                    | `1` for email and password, passkeys and an authenticator app, when Wallet runs on its own. Off means off: the pages answer 404. Ignored with a core                                                                                                                                                   |
| `WALLET_AUTH_SECRET`                                                                                   | 32 characters or more, to sign sessions (`openssl rand -base64 48`)                                                                                                                                                                                                                                    |
| `WALLET_AUTH_SIGNUP`                                                                                   | `closed` (the first account only, the default with local sign-in) or `open`                                                                                                                                                                                                                            |
| `WALLET_AUTH_TRUSTED_PROXIES`                                                                          | The reverse proxies in front of Wallet, as addresses or ranges (`10.0.0.0/8`), separated by commas: the only hops of `X-Forwarded-For` that are believed, so that limits kept per address (sign-in, and Sovereign's notices and export) tell clients apart. See [`deploy/README.md`](deploy/README.md) |
| `WALLET_AUTH_PASSWORD_MIN_LENGTH`                                                                      | The shortest password, 8 to 128. Default 10                                                                                                                                                                                                                                                            |
| `WALLET_CORE_URL`, `WALLET_CORE_CLIENT_ID`, `WALLET_CORE_CLIENT_SECRET`                                | Sign-in through a Sovereign instance, instead of Wallet's own accounts: all three, or none. The redirect address to register is `<WALLET_URL>/api/auth/callback/sovereign`                                                                                                                             |
| `WALLET_ENCRYPTION_KEY`, `WALLET_ENCRYPTION_KEY_PREVIOUS`                                              | **The server's own key** (`openssl rand -base64 32`): it seals the server's own secrets and never what is in a wallet. The previous one is for changing it                                                                                                                                             |
| `WALLET_DB_DIALECT`                                                                                    | `sqld` (default), `sqlite` or `postgres`                                                                                                                                                                                                                                                               |
| `WALLET_SQLD_URL`, `WALLET_SQLD_ADMIN_URL`                                                             | The sqld service and the address that makes its namespaces                                                                                                                                                                                                                                             |
| `WALLET_SQLITE_URL`                                                                                    | A `file:` URL for one SQLite file (`file:/data/wallet.db`)                                                                                                                                                                                                                                             |
| `WALLET_POSTGRES_URL`, `WALLET_POSTGRES_POOL_MAX`                                                      | The PostgreSQL address, and the most connections the app may hold                                                                                                                                                                                                                                      |
| `WALLET_DB_CONNECT_TIMEOUT_MS`, `WALLET_MIGRATIONS_DIR`                                                | How long to wait for a database that is starting (30000), and where the migrations are, if not beside the server                                                                                                                                                                                       |
| `WALLET_WORKER`                                                                                        | `on` (default) or `off`: whether this process runs background jobs. With several processes on one database, `off` on all but one                                                                                                                                                                       |
| `WALLET_SMTP_HOST`, `WALLET_SMTP_PORT`, `WALLET_SMTP_FROM`, `WALLET_SMTP_USER`, `WALLET_SMTP_PASSWORD` | Mail: with a host, an address is verified and a password reset by mail. Without one neither is offered, and a reset link has to come from whoever runs the instance                                                                                                                                    |
| `WALLET_STORAGE_MAX_ACCOUNT_MB`, `WALLET_ENTRY_MAX_KB`, `WALLET_LIMIT_ENTRIES`                         | What an account may hold: 500 MB, a body of 256 KB, 50,000 entries. Going over is refused with a sentence                                                                                                                                                                                              |

## Backups, and a lost key

**The operator's backups are the database's and `/data`'s**, and what they hold is ciphertext: as safe as the keys people keep. A person's own backups (a
backup file, an encrypted git repository, a readable export) come in a later version.

**If a person loses their wallet key and has no recovery key, and no device that is unlocked, nobody can open their wallet.** An unlocked device can show
the wallet's cards until it locks. The only way back is **Reset wallet** (a later version), which deletes the wallet's contents and starts again; today an
account can be deleted from Settings.

## What 0.1.0 does not do

Documents and Due, family members, card photos, backups (file, git and readable export), devices and removing one, key changes and rotation, notices and
mail outbox, Online only and This device only entries, fully offline mode, health, the journal, phone-wallet passes, NFC and sharing. The format has room
for them: the vault, the entries' tiers and kinds, and the sync protocol are specified now, so that adding them changes no data. The order is in
[`ROADMAP.md`](ROADMAP.md).

## Licence

AGPL-3.0-or-later, since it bundles [`@sovereignfs/ui`](https://github.com/sovereignfs/sovereign). It uses `age-encryption` (BSD-3-Clause), `bwip-js` (MIT),
`zxing-wasm` (MIT, with zxing-cpp under Apache-2.0), `hash-wasm` (MIT) and `idb` (ISC); their licences travel with the image under
`/usr/share/licenses/`.
