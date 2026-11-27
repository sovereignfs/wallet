import { confirmPassword, readSession } from '@sovereignfs/auth/server';
import { accountRoute } from '@/src/access/route';
import { authSettings, getAuth } from '@/src/auth/server';
import { getAuthStore, getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { deleteAccount, deletionPreview, type DeleteDeps } from '@/src/sovereign/delete-account';

// Deleting the account (DESIGN.md §28): standalone, what it would do and doing it with the password; in suite mode it is core's, and this says where core is.
// The account is the session's.
export const dynamic = 'force-dynamic';

async function deps(): Promise<DeleteDeps> {
  const database = await getDatabase();
  const authDatabase = await getAuthStore();
  return {
    database,
    authDatabase,
    limiter: new RateLimiter(database),
    now: Date.now,
    core: authSettings()?.sovereign?.issuer,
    // The password again (its sign-in value), through the package, which counts wrong answers per account (auth.md §4, rule 3).
    verify: async (request, password) => {
      const auth = await getAuth();
      if (!auth) return false;
      const session = await readSession(auth, request.headers);
      if (!session) return false;
      return (await confirmPassword(authDatabase, auth, session.user.id, password)) === 'ok';
    },
  };
}

export const GET = accountRoute(async () => deletionPreview(await deps()));
export const POST = accountRoute(async ({ request, accountId }) =>
  deleteAccount(request, accountId, await deps()),
);
