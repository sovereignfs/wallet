import { passwordsMoving } from '@sovereignfs/auth/server';
import { vaultOf } from '@/src/keys/server/vault';
import { authSettings } from '@/src/auth/server';
import { type SaltDocument, cachedSalt } from '@/src/auth/salt';
import { getAuthStore } from '@/src/db/boot';

// The salt a page derives the sign-in value with (auth.md §4, rule 1): the instance's vault id, made once (sdk §9.5). It is no secret.
// `moving` says whether any password stored before the package can still move, so the page sends a password only then (auth.md §8.1).
// Anyone may ask, so what is asked of the database is kept (`src/auth/salt.ts`).
// Without an account of Wallet's own there is no password to derive: 404, as the sign-in's routes answer.
export const dynamic = 'force-dynamic';

// On `globalThis`, because the development server reloads modules and a second copy of this one must not start again from nothing.
const KEY = Symbol.for('wallet.sign-in-salt');
type Holder = { [KEY]?: () => Promise<SaltDocument> };

export async function GET(): Promise<Response> {
  if (!authSettings()?.local) return new Response(null, { status: 404 });
  const store = await getAuthStore();
  const holder = globalThis as Holder;
  holder[KEY] ??= cachedSalt({
    vaultId: () => vaultOf(store).vaultId(),
    moving: () => passwordsMoving(store),
    now: Date.now,
  });
  return Response.json(await holder[KEY](), { headers: { 'cache-control': 'no-store' } });
}
