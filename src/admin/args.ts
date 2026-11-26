/**
 * What `wallet-admin` was asked to do, from its arguments (DESIGN.md §25.1). Pure, so every way of getting it wrong is tested without a process. There is one
 * thing to ask of it, as core's `sovereign-admin` has `accounts reset-link`.
 */
export type Command =
  { readonly kind: 'help' } | { readonly kind: 'reset-link'; readonly email: string };

export type Parsed =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly message: string };

export const USAGE = `usage: node tools/wallet-admin.mjs accounts reset-link EMAIL

  accounts reset-link EMAIL   Print a link that lets the person with this address choose a new password. It works once, for an hour, and ends every session
                              of the account when it is used. For an instance with no mail, or a person who did not move in time. It gives back the account,
                              not the wallet's keys: the recovery kit opens the wallet again. An authenticator app that was lost is not reset by it.

Run it in Wallet's container, where its settings are:

  docker compose exec web node tools/wallet-admin.mjs accounts reset-link person@example.com
`;

export function parseArgs(argv: readonly string[]): Parsed {
  const [first, second, third, ...rest] = argv;
  if (argv.length === 0) return { ok: false, message: 'wallet-admin needs a command.' };
  if (first === '--help' || first === '-h' || first === 'help')
    return { ok: true, command: { kind: 'help' } };
  if (first !== 'accounts' || second !== 'reset-link')
    return { ok: false, message: `wallet-admin has no command "${argv.slice(0, 2).join(' ')}".` };
  if (third === undefined || rest.length > 0)
    return { ok: false, message: 'accounts reset-link takes one address.' };
  const email = third.trim();
  if (email === '' || !email.includes('@') || /\s/.test(email))
    return { ok: false, message: 'that is not an email address.' };
  return { ok: true, command: { kind: 'reset-link', email } };
}
