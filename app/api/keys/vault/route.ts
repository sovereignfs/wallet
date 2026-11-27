import { vaultRoute } from '@sovereignfs/sdk/vault';
import { type AccountHandler, accountRoute } from '@/src/access/route';
import { authSettings } from '@/src/auth/server';
import { getVault } from '@/src/keys/server/current';

/**
 * Wallet's own vault (RFC 0001, sdk §9.5), for the page's `localVault`: `GET` the signed-in account's own wrapped keys, `POST` one change to them. The account is
 * the session's, never the request's, and nothing here opens anything. **Only an instance that runs alone has one:** hosted, the keys are core's, and this
 * answers 404.
 */
export const dynamic = 'force-dynamic';

const handle: AccountHandler = async ({ request, accountId }) => {
  const settings = authSettings();
  if (!settings?.local) return new Response(null, { status: 404 });
  return vaultRoute(await getVault(), { origin: settings.url })(request, accountId);
};

export const GET = accountRoute(handle);
export const POST = accountRoute(handle);
