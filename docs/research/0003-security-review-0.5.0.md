# Security review of sign-in, sessions and Sovereign's routes, at 0.5.0

**Date:** 2026-11-25. **By:** an AI agent (Claude Code), with the code open, the tests run and a few requests tried; **not an independent review** ([`DESIGN.md`](../../DESIGN.md)
§33 holds that for before 1.0). **What it covers:** sign-in in both modes (§25.1), sessions and cookies, the route guards (`src/access/`), the Content-Security-Policy, the
rate limits, the routes Sovereign calls, and account deletion, as of 0.5.0. **What it does not:** the vault format, the keyring, the passcode wrapper, the service worker
and the jobs, which stand on [`0002-security-review-0.1.0.md`](0002-security-review-0.1.0.md) and their tests; a real proxy or a real core (only the SDK's fake one);
dependency advisories (`pnpm audit` sends the dependency list to the registry, and was not run).

## What held up

The password never reaches the server (the page derives a sign-in value, Argon2id then HKDF); sessions are read from the database every time (no cookie cache), last seven
days and use `__Host-` cookies over https; every route finds the session, checks `Origin` on a write and is in `src/access/routes.ts`, and a foreign entry id reads as not
found; deleting an account asks for the password again and is limited; the Content-Security-Policy has a nonce and no `'unsafe-inline'` for scripts; the server's own key
seals with AES-256-GCM bound to the row. The access, auth, security, limits and Sovereign tests passed, and the end-to-end specs for both modes.

## Findings, and what became of them

| #   | Finding                                                                                                                                              | Status                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A closed sign-up with no mail told anyone which addresses have an account (probed: "User already exists" against "Sign-up is closed")                | **Fixed in 0.5.1.** Open sign-up with no mail still must say an address is taken, to sign the person in at once: accepted, and said in §6.2      |
| 2   | Core's export route had no body cap or limit, and made a client, and so a discovery call to core, for every request                                  | **Fixed in 0.5.1** (the guard, the one client, replays from the database)                                                                        |
| 3   | The sign-in's per-address limit depended on what the operator's proxy does to `X-Forwarded-For`, with no setting and no guidance                     | **Fixed in 0.5.1** (`WALLET_AUTH_TRUSTED_PROXIES`, the deploy guide). Not tried against a real proxy                                             |
| 4   | Core's notices shared one count among all callers, so anyone could use it up and have real notices refused                                           | **Fixed in 0.5.1** (counted by address, by kind of request)                                                                                      |
| 5   | Deleting a Sovereign-only account asked only for a session made in the last ten minutes, which proves nothing about the person                       | **Fixed in 0.5.0:** in suite mode deleting is core's, and the route refuses                                                                      |
| 6   | The SDK did not check the signature of core's ID token (kept as an expected-failure test, not written down here)                                     | **Fixed in 0.5.0** by `@sovereignfs/sdk` 2.12.0 (2.11.1 and later)                                                                               |
| 7   | For 90 days after the 0.4.0 upgrade the page sends the password itself, once, to move one stored before the package                                  | Accepted: by the package's design (auth.md §8.1), and it ends                                                                                    |
| 8   | The first account on a fresh instance is the first person to sign up, and the check is a read then a write: two at once could both succeed           | Open. The README says who is first; create the account before the instance is reachable                                                          |
| 9   | `WALLET_AUTH_SECRET` is checked for length only; `/api/health` and `/api/sign-in-salt` are public and unlimited, and health says the database's kind | Open, low. The 0.1.0 review says requests are limited "per account and per address": sync, vault and delete are per account, sign-in per address |

## Next

An independent review before 1.0 ([`DESIGN.md`](../../DESIGN.md) §33), `pnpm audit` run by someone who accepts what it sends, and the fixes above tried behind the proxy and the
Sovereign instance a person actually runs.
