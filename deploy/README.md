# Running Wallet

Wallet is one image that runs on its own or hosted by a Sovereign instance. This folder is the first way: three setups, one for each form of
database. They are the same app; only where it keeps its data differs (`DESIGN.md` §29.1).

| Setup                  | Files                                    | The database                                         | For                                                                                                                                                             |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sqld** (the default) | `compose.yaml`                           | An sqld service (libSQL's server), on its own volume | Most installs. The app holds no state, and operating it is the same as operating Sovereign                                                                      |
| **A file**             | `compose.file.yaml`                      | One SQLite file on a volume                          | The smallest: one container, one person or a small group. A second instance cannot share the file, and it must stay on a local disk, never a network filesystem |
| **PostgreSQL**         | `compose.yaml` + `compose.postgres.yaml` | PostgreSQL, or one you already run                   | An operator who prefers it, or has one                                                                                                                          |

## Start

```bash
cd deploy
cp .env.example .env     # then edit it: at least WALLET_URL, WALLET_AUTH_SECRET and WALLET_ENCRYPTION_KEY
docker compose up -d --build                                                   # sqld
docker compose -f compose.file.yaml up -d --build                              # a file
docker compose -f compose.yaml -f compose.postgres.yaml up -d --build          # PostgreSQL (Compose 2.24 or later)
```

Only the machine itself can reach the port (`127.0.0.1:3006`): put a reverse proxy with TLS in front of it, and set `WALLET_URL` to the address people use.
Passkeys, emailed links and the sign-in redirect are made from it, and the server refuses to start on an address that is not https (localhost aside).

**The proxy must tell Wallet who is calling.** Sign-in, and Sovereign's notices and export, are limited per address, and Wallet learns the address from the
`X-Forwarded-For` header, which a client can write for itself. So Wallet believes a header with **one** address only, unless you name your proxies in
`WALLET_AUTH_TRUSTED_PROXIES` (addresses or ranges, such as `10.0.0.0/8,172.16.0.0/12`), when it reads the chain from the right, past each of them, and
the first address that is not one is the client. What goes wrong without telling it right depends on the proxy:

| What your proxy does with `X-Forwarded-For`                                                                 | Do this                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Replaces** it with the client's address (in nginx, `proxy_set_header X-Forwarded-For $remote_addr;`)      | Nothing: leave the setting out                                                                                                                                  |
| **Adds** to what the client sent (in nginx, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) | Set `WALLET_AUTH_TRUSTED_PROXIES` to the proxy's address. Left out, a client that sends its own header is counted with every other client in the same one place |
| **Passes the client's header through** untouched, or sends none                                             | Make it replace the header. Otherwise a client can write a new address for each try and is never limited, or everyone is counted as one                         |

Which of these your proxy does depends on how it is configured, and on its version: read its documentation, and test it, by sending a request with a header you
made up (`curl -H 'X-Forwarded-For: 198.51.100.9' …`) and looking at what reaches Wallet.

Wallet reached with no proxy at all (not the way to run it) has no one to believe: every request is counted together, and anyone can use up the sign-in's tries
for everyone.

The smallest setup of all is one `docker run`, with no Compose:

```bash
docker run -d -p 127.0.0.1:3006:3006 -v wallet:/data \
  -e WALLET_DB_DIALECT=sqlite -e WALLET_SQLITE_URL=file:/data/wallet.db \
  -e WALLET_URL=https://wallet.example.com -e WALLET_AUTH_LOCAL=1 \
  -e WALLET_AUTH_SECRET="$(openssl rand -base64 48)" -e WALLET_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  ghcr.io/sovereignfs/wallet
```

(Keep the two generated values: they are in no file, so make them once and put them in your own secrets.)

## What the server does when it starts

It checks its settings and stops, naming the one that is wrong and never its value. It then makes the places its database lives in (an sqld
namespace, a directory, a PostgreSQL schema), waits for a database that is still starting (up to `WALLET_DB_CONNECT_TIMEOUT_MS`, 30 seconds), applies
its own migrations, and starts. It does not start if it cannot, and `GET /api/health` answers 200 only when the database does. Migrations apply once
each, and a second process starting at the same time is safe.

It stops on SIGTERM within seconds and exits 143.

## Your own PostgreSQL

Skip `compose.postgres.yaml` and set, in `.env`:

```
WALLET_DB_DIALECT=postgres
WALLET_POSTGRES_URL=postgres://user:password@host:5432/wallet
```

(or `WALLET_POSTGRES_URL_FILE`, a file holding it). The app makes its own schemas, `wallet` and `wallet_auth`, in that database.

## Giving someone their account back

A person who forgot their password asks for a link on the sign-in page, **if the instance sends mail** (`WALLET_SMTP_*`). One who cannot, because there is no mail, or
because their password was stored before 0.4.0 and did not move in time, gets one from you:

```bash
docker compose exec web node tools/wallet-admin.mjs accounts reset-link person@example.com
```

(Or `docker exec <container> node tools/wallet-admin.mjs …` for the one `docker run`.) It prints a link and nothing else to the standard output: **hand it to the person
privately, since whoever holds it can choose that account's password.** It works once, for an hour, and ends every session of the account when it is used. The person
chooses the new password themselves, in their browser, and Wallet never sees it. It says there is no account if there is none, and that it has nothing to do on an instance that
signs people in through Sovereign, whose passwords they are (there, Sovereign's own `sovereign-admin accounts reset-link` does it).

**It gives back the account, not the wallet.** The wallet key is the person's own and is not touched: with it they open everything as before, and without it nobody can, you
included. A lost authenticator app is not reset by this either; backup codes are the way.

## On a Sovereign instance

`sv app add` hosts Wallet from `sovereign.manifest.json`, which is also the image's label: the instance builds nothing of its own, gives the app a database, and
tells it where it is. What it sets is the settings above under Wallet's own names: `WALLET_URL`, `WALLET_CORE_URL`, `WALLET_CORE_CLIENT_ID` and
`WALLET_CORE_CLIENT_SECRET` (or `_FILE`), the database (`WALLET_DB_DIALECT` and its address) and `PORT`, and it makes `WALLET_AUTH_SECRET` and `WALLET_ENCRYPTION_KEY`
once and keeps them. An instance signs people in one way: with the instance's `WALLET_CORE_*` set, people sign in through it only, whatever `WALLET_AUTH_LOCAL` says,
and there is no password, sign-up or reset to find; `/sign-in` and `/sign-up` send the browser to the instance (`/sign-up` asking for its sign-up page, which needs
Sovereign 0.140.0 or later; before it, the instance shows its sign-in). Set both, and Wallet starts that way and says once which settings to remove.

Sign-up is open there without being set: with the instance as the only way in, it already decides who may sign in, so Wallet gives an account to
anyone it signs in (`WALLET_AUTH_SIGNUP` has nothing to decide there). Mail (`WALLET_SMTP_*`) is not used when there is no password. The instance can end a person's sessions here, and delete their account, by
signed notices to `/api/sovereign/backchannel-logout` and `/api/sovereign/account-deleted`; both are answered only when they carry a token the instance
signed.

## What the server keeps, and what only you do

Everything a person keeps in Wallet is **sealed in their browser** under a key they hold, and the server stores ciphertext it cannot open
(`docs/specs/vault-format.md`). So:

- **`WALLET_ENCRYPTION_KEY` is the server's own** (`openssl rand -base64 32`, once). It seals the server's own secrets at rest and **never an entry**.
  Keep it with your other secrets, apart from the database backups. To change it, give the new one and put the old one in `WALLET_ENCRYPTION_KEY_PREVIOUS`
  until the server has started once with both.
- **Nobody can recover a wallet whose key is lost.** Not you, as the operator, and not the people who wrote Wallet. A person's wallet key (and recovery key,
  if they made one) is theirs, and is in no file on the server. Say so to the people you run this for.
- **What an operator can see** is the number of entries an account has, their sizes (in buckets), which tier and when they changed, the account's name and
  address, and the network addresses of requests. Not the kind of an entry, its title, or anything in it (`DESIGN.md` §8.5).
- **What an operator can do to a person** is limited to what the browser lets them: **a server that serves altered JavaScript could take a key once it is
  unlocked.** That is the nature of a web app, and the protections are the policy (a nonce on every script, nothing third-party) and running your own
  instance (`DESIGN.md` §8.6).

## Backups

Back up the database (an sqld volume, the file, or PostgreSQL) and `/data`, like any service: **what you back up is ciphertext**, and is as safe as the
keys people keep are. A person's own backups (a backup file, a git repository) come in a later version of Wallet. An old database restored brings back old
ciphertext, and a device that is ahead of it sends what it has again (`DESIGN.md` §30).

## Updating

A new image applies its own migrations when it starts, once, under a lock. Release notes say when one changes a setting or a migration; **a patch release
never does either.** Pull, restart, and `GET /api/health` answers 200 when the database does.
