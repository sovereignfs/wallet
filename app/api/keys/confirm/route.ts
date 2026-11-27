import { confirmPassword } from '@sovereignfs/auth/server';
import { accountRoute } from '@/src/access/route';
import { authSettings, getAuth } from '@/src/auth/server';
import { getAuthStore } from '@/src/db/boot';
import { confirmResponse } from '@/src/keys/server/confirm';

// The signed-in account's own password again, as its sign-in value, before the page opens or makes the suite's keys with it (DESIGN.md §9.4). Only an instance
// that runs alone has passwords: hosted, this answers 404. The account is the session's.
export const dynamic = 'force-dynamic';

export const POST = accountRoute(async ({ request, accountId }) => {
  const auth = authSettings()?.local ? await getAuth() : null;
  if (!auth) return new Response(null, { status: 404 });
  const store = await getAuthStore();
  return confirmResponse(request, (password) => confirmPassword(store, auth, accountId, password));
});
