/**
 * Suite mode's sign-in (DESIGN.md §25.1): Wallet's `/sign-in` and `/sign-up` render nothing of their own and send the browser to core at once, through
 * `@sovereignfs/auth`'s `/api/auth/sign-in/sovereign`. Pure, so the three outcomes are tested with no server. Taken from Shopper's `src/auth/suite.ts`
 * without its invitations: Wallet has no page a person is sent on to after signing in, so they always come back to the front address.
 */

/**
 * What Wallet asks core to do with the person (OpenID Connect `prompt`): **`create`** opens core's sign-up in place of its sign-in, for _Create an
 * account_ (Prompt Create 1.0, `@sovereignfs/auth` 0.7.0, Sovereign 0.140.0 and later; before it, core shows its sign-in). The package drops any other
 * value.
 */
export type CorePrompt = 'create';

/** The address that starts a sign-in at core, coming back to the front address, asking for `prompt` when there is one. */
export const toCore = (prompt?: CorePrompt): string =>
  `/api/auth/sign-in/sovereign?${prompt ? `prompt=${prompt}&` : ''}returnTo=%2F`;

export type SuiteStep =
  | { readonly kind: 'go'; readonly to: string }
  | { readonly kind: 'show'; readonly error: string; readonly retry: string };

/**
 * What `/sign-in` or `/sign-up` does in suite mode (`/sign-up` asks core for `prompt=create`). Someone with a session goes to the front address; a return
 * from core with `?error=` is shown once, with a way to try again, and is never sent back to core by itself, so a failure at core cannot loop; anyone
 * else is sent to core.
 */
export function suiteStep(
  signedIn: boolean,
  error: string | undefined,
  prompt?: CorePrompt,
): SuiteStep {
  if (signedIn) return { kind: 'go', to: '/' };
  if (error) return { kind: 'show', error, retry: toCore(prompt) };
  return { kind: 'go', to: toCore(prompt) };
}
