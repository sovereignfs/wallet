import { fromBase64Url, toBase64Url } from '../core/encoding';
import { FIRST_EPOCH, newRoot, unwrapRoot, wrapRoot } from '../core/vault';
import type { Material } from '../keyring/wrappers';

/**
 * Getting the keyring root onto this device (DESIGN.md §7.4, §8.1), with the suite's app key open: ask the server for the account's wrapped root and open it, or,
 * for the account's first device, make one, wrap it under the app key and have the server keep the first it is given. **The root's bytes are returned to the
 * caller**, who makes an unlock wrapper of them if there is none on this device, imports them as a key that cannot be read back, and overwrites them.
 *
 * Online only: it needs the server. A device that already holds a wrapper does not call it to open the wallet.
 */
type Fetcher = typeof fetch;

interface Roots {
  readonly roots: readonly { readonly epoch: number; readonly wrapped: string }[];
}

export type RootResult =
  | { readonly ok: true; readonly material: Material; readonly created: boolean }
  /** The account has no root yet and the caller did not ask for one to be made. */
  | { readonly ok: false; readonly reason: 'none' }
  /** The wrapped root is not what this app key made for this account: a key from another account or a record that was changed. Nothing is opened. */
  | { readonly ok: false; readonly reason: 'unreadable' }
  | { readonly ok: false; readonly reason: 'offline' };

async function read(fetcher: Fetcher): Promise<Roots | 'offline'> {
  try {
    const response = await fetcher('/api/keys/root', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return 'offline';
    return (await response.json()) as Roots;
  } catch {
    return 'offline';
  }
}

/** The newest root the server has that is the first epoch (the only one until rotating everything is built), as a device may use it. */
const usable = (roots: Roots) => roots.roots.find((root) => root.epoch === FIRST_EPOCH);

export async function openRoot(
  accountId: string,
  appKey: CryptoKey,
  options: { create: boolean },
  fetcher: Fetcher = (...args) => fetch(...args),
): Promise<RootResult> {
  const first = await read(fetcher);
  if (first === 'offline') return { ok: false, reason: 'offline' };
  let stored = usable(first);
  let created = false;
  if (!stored) {
    if (!options.create) return { ok: false, reason: 'none' };
    // The account's first device: a root is made here, wrapped, and offered; the server keeps the first one it is given, and a device that raced answers with the
    // stored one, which is what is used.
    const root = newRoot();
    const wrapped = await wrapRoot(appKey, accountId, FIRST_EPOCH, root);
    root.fill(0);
    let kept: Response;
    try {
      kept = await fetcher('/api/keys/root', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ epoch: FIRST_EPOCH, wrapped: toBase64Url(wrapped) }),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    if (!kept.ok) return { ok: false, reason: 'offline' };
    created = kept.status === 201;
    stored = usable((await kept.json()) as Roots);
    if (!stored) return { ok: false, reason: 'offline' };
  }
  const bytes = fromBase64Url(stored.wrapped);
  if (!bytes) return { ok: false, reason: 'unreadable' };
  try {
    const raw = await unwrapRoot(appKey, accountId, stored.epoch, bytes);
    return { ok: true, material: { raw, epoch: stored.epoch }, created };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
