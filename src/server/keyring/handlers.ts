import { readCapped } from '../../access/body';
import type { Database } from '../../db/client';
import type { Limiter } from '../../limits/rate';
import { keepRoot, parseMake, readRoots, wireOf } from './index';

/** `/api/keys/root` (DESIGN.md §7.4, §8.1): the account's wrapped keyring root, which the server cannot open. The account is the session's. */
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** `{ roots: [] }` for an account that has made none yet. */
export async function getRootsResponse(database: Database, accountId: string): Promise<Response> {
  return json(200, { roots: (await readRoots(database, accountId)).map(wireOf) });
}

/**
 * Keeps the root, once per epoch: **201** when this request's was kept, **200** when the account already had that epoch (the answer is the stored roots, which the
 * device that lost a race uses instead of its own); 400 for what is not a wrapped root; 413 for a body that is too large; 429 when tried too often.
 */
export async function postRootResponse(
  request: Request,
  database: Database,
  accountId: string,
  limiter: Limiter,
  now: () => number,
): Promise<Response> {
  const taken = await limiter.take(`keyring:${accountId}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!taken.ok) return json(429, { code: 'RATE_LIMITED' });
  const body = await readCapped(request, 1024);
  if (body === null) return json(413, { code: 'TOO_LARGE' });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  const parsed = parseMake(input);
  if (!parsed.ok) return json(400, { code: 'BAD_REQUEST' });
  const kept = await keepRoot(database, accountId, parsed, now());
  const reply = await getRootsResponse(database, accountId);
  return new Response(await reply.text(), { status: kept ? 201 : 200, headers: reply.headers });
}
