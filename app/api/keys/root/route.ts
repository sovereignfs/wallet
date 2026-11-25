import { accountRoute } from '@/src/access/route';
import { getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { getRootsResponse, postRootResponse } from '@/src/server/keyring/handlers';

// The account's wrapped keyring root (DESIGN.md §7.4, §8.1), in both modes: a key wrapped under the suite's app key, which the server cannot open. The account is the session's.
export const dynamic = 'force-dynamic';

export const GET = accountRoute(async ({ accountId }) =>
  getRootsResponse(await getDatabase(), accountId),
);

export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  return postRootResponse(request, database, accountId, new RateLimiter(database), Date.now);
});
