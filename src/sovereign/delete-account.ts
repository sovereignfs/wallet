import type { Database as AuthStore } from '@sovereignfs/auth/database';
import type { Database } from '../db/client';
import type { Limiter, Rule } from '../limits/rate';
import { readCapped } from '../access/body';
import { deletePerson } from './people';

/**
 * `/api/account/delete` (DESIGN.md §28): what deleting the account would do, and doing it. **Standalone it asks for the password** (a stolen session cannot
 * delete an account), counted, and runs `People.deletePerson` for the session's account and no other. **In suite mode deleting the account is core's** (DESIGN.md
 * §25.1): the person does it at core, which tells Wallet by its account-deleted notice, so there is nothing here to do it with: the preview says where core is,
 * and a POST is not there. No session made a few minutes ago stands in for a password any more: that proved only that core's session was alive.
 */
export interface DeleteDeps {
  readonly database: Database;
  readonly authDatabase: AuthStore;
  readonly limiter: Limiter;
  readonly now: () => number;
  /** Core's address in suite mode, where the account is deleted; `undefined` alone. */
  readonly core: string | undefined;
  /** Whether this is the password of the account the request is for. */
  verify(request: Request, password: string): Promise<boolean>;
}

const RATE: Rule = { limit: 5, windowMs: 10 * 60_000 };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/** Whether it asks for the password (alone), or says where core is, which deletes the account (suite mode). */
export function deletionPreview(deps: DeleteDeps): Response {
  return json(200, { password: deps.core === undefined, core: deps.core ?? null });
}

/**
 * `POST { password }`: 204 when it is done; 400 for what is not a request; 403 for a password that is not this account's (`WRONG_PASSWORD`, which is also what an
 * account with no password gets: nothing can prove it); 429 when tried too often; 404 in suite mode, where it is core's to do.
 */
export async function deleteAccount(
  request: Request,
  accountId: string,
  deps: DeleteDeps,
): Promise<Response> {
  // Not here in suite mode: before anything is read or counted.
  if (deps.core !== undefined) return new Response(null, { status: 404 });
  const body = await readCapped(request, 1024);
  if (body === null) return json(413, { code: 'TOO_LARGE' });
  const taken = await deps.limiter.take(`delete-account:${accountId}`, RATE);
  if (!taken.ok)
    return json(
      429,
      { code: 'RATE_LIMITED' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  let password: unknown;
  try {
    password = (JSON.parse(body) as { password?: unknown } | null)?.password;
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  if (typeof password !== 'string' || password === '' || password.length > 1000)
    return json(400, { code: 'BAD_REQUEST' });
  if (!(await deps.verify(request, password))) return json(403, { code: 'WRONG_PASSWORD' });
  await deletePerson(deps, accountId);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
