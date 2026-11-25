import type { AuthSettings } from '../auth/config';
import { USAGE, parseArgs } from './args';

/**
 * `wallet-admin` (DESIGN.md §25.1): what it does with the arguments and the settings, and what it says. It is given what it needs, so a test gives it a real
 * auth store and the package's own `resetLink`, and `main.ts` gives it the server's.
 *
 * **The link is the answer, and it goes to `out` alone** (the standard output, which an operator hands on); what is said about it goes to `log` (the standard
 * error), and says neither the address nor the token: a credential and an address stay out of any log (AGENTS.md).
 */
export interface AdminDeps {
  /** The sign-in settings, or `undefined` when sign-in is off. */
  readonly settings: AuthSettings | undefined;
  /** A reset link for the account with this address, or `undefined` if there is none. */
  resetLink(email: string): Promise<string | undefined>;
  out(line: string): void;
  log(line: string): void;
}

/** The exit code: 0 done, 1 not done and why, 2 not understood. */
export async function run(argv: readonly string[], deps: AdminDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.log(`wallet-admin: ${parsed.message}`);
    deps.log(USAGE);
    return 2;
  }
  const { command } = parsed;
  if (command.kind === 'help') {
    deps.out(USAGE);
    return 0;
  }
  if (!deps.settings) {
    deps.log('wallet-admin: sign-in is not set up on this instance, so there are no accounts.');
    return 1;
  }
  // Suite mode: the people are Sovereign's, and so are their passwords.
  if (deps.settings.sovereign || !deps.settings.local) {
    deps.log(
      'wallet-admin: this instance signs people in through Sovereign, whose passwords they are: there is nothing to reset here. Make the link in Sovereign.',
    );
    return 1;
  }
  const link = await deps.resetLink(command.email);
  if (link === undefined) {
    deps.log('wallet-admin: there is no account with that address.');
    return 1;
  }
  deps.log('wallet-admin: made a reset link, which works once, for an hour.');
  deps.out(link);
  return 0;
}
