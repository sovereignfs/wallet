import { readCapped } from '../../access/body';
import type { Database } from '../../db/client';
import type { Limiter } from '../../limits/rate';
import { createVault, parseCreate, readVault, wireOf } from './index';

/** `/api/vault` (DESIGN.md §7.4): public keys and a sealed header, which the server cannot open. The account is the session's. */
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** `{ vault: null }` for an account that has made none yet. */
export async function getVaultResponse(database: Database, accountId: string): Promise<Response> {
  const vault = await readVault(database, accountId);
  return json(200, { vault: vault ? wireOf(vault) : null });
}

/** Makes the vault, once: 201; 409 for an account that has one; 400 for what is not a vault; 429 when tried too often. */
export async function postVaultResponse(
  request: Request,
  database: Database,
  accountId: string,
  limiter: Limiter,
  now: () => number,
): Promise<Response> {
  const taken = await limiter.take(`vault:${accountId}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!taken.ok) return json(429, { code: 'RATE_LIMITED' });
  const body = await readCapped(request, 16 * 1024);
  if (body === null) return json(413, { code: 'TOO_LARGE' });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  const parsed = parseCreate(input, now());
  if (!parsed.ok) return json(400, { code: 'BAD_REQUEST' });
  const made = await createVault(database, accountId, parsed, now());
  if (!made) return json(409, { code: 'VAULT_EXISTS' });
  return getVaultResponse(database, accountId).then(
    async (reply) => new Response(await reply.text(), { status: 201, headers: reply.headers }),
  );
}
