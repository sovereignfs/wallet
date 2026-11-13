import { toBase64Url } from '../../core/encoding';
import type { MutationWire } from '../../core/sync/protocol';
import {
  createEntryKey,
  importVaultKey,
  seal,
  type EntryKeys,
  type VaultKey,
} from '../../core/vault';

/**
 * What the server's tests send: real sealed values, made with the vault format, since what the server checks is their sizes and shape. (Tests may import
 * the vault format; server code may not.)
 */
let vaultKey: Promise<VaultKey> | undefined;
export const testVault = (): Promise<VaultKey> =>
  (vaultKey ??= importVaultKey(crypto.getRandomValues(new Uint8Array(32)), 'AAAAAAAAAAAAAAAA'));

let counter = 0;
export const uuid = (): string =>
  `${(++counter).toString(16).padStart(8, '0')}-0000-4000-8000-${crypto.randomUUID().slice(-12)}`;

export interface MadeEntry {
  readonly entryId: string;
  readonly keys: EntryKeys;
  readonly wrapped: Uint8Array<ArrayBuffer>;
}

export async function makeEntry(accountId: string, entryId = uuid()): Promise<MadeEntry> {
  const { keys, wrapped } = await createEntryKey(await testVault(), accountId, entryId);
  return { entryId, keys, wrapped };
}

/** A `put` of an entry made by `makeEntry`, with a card-like shape and body. */
export async function put(
  accountId: string,
  made: MadeEntry,
  options: {
    baseVersion?: number;
    title?: string;
    body?: unknown | null;
    tier?: MutationWire['tier'];
    id?: string;
  } = {},
): Promise<MutationWire> {
  const { baseVersion = 0, title = 'Gym', tier = 'synced', id = uuid() } = options;
  const shape = await seal(made.keys.aes, 'shape', accountId, made.entryId, {
    v: 1,
    kind: 'card',
    title,
  });
  const bodyValue = options.body === undefined ? { v: 1, payload: 'x' } : options.body;
  const body =
    bodyValue === null
      ? undefined
      : await seal(made.keys.aes, 'body', accountId, made.entryId, bodyValue);
  return {
    id,
    op: 'put',
    entryId: made.entryId,
    baseVersion,
    tier,
    wrappedKey: toBase64Url(made.wrapped),
    shape: toBase64Url(shape),
    ...(body ? { body: toBase64Url(body) } : {}),
  };
}

export const remove = (made: MadeEntry, baseVersion: number): MutationWire => ({
  id: uuid(),
  op: 'delete',
  entryId: made.entryId,
  baseVersion,
  tier: 'synced',
});
