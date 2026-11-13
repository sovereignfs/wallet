import { accountRoute } from '@/src/access/route';
import { getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { getVaultResponse, postVaultResponse } from '@/src/server/vault/handlers';

// The vault header and its recipients (DESIGN.md §7.4): public keys and a sealed header, which the server cannot open. The account is the session's.
export const dynamic = 'force-dynamic';

export const GET = accountRoute(async ({ accountId }) =>
  getVaultResponse(await getDatabase(), accountId),
);

export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  return postVaultResponse(request, database, accountId, new RateLimiter(database), Date.now);
});
