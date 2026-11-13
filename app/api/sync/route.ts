import { accountRoute } from '@/src/access/route';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { handleSync } from '@/src/server/entries/sync';

// The one door every write to an entry comes through (DESIGN.md §11.3): the account is the session's, and the server applies what a device sends only to it.
export const dynamic = 'force-dynamic';

export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  return handleSync(request, accountId, {
    database,
    limiter: new RateLimiter(database),
    limits: getConfig().limits,
    now: Date.now,
  });
});
