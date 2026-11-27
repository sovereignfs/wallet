import { toBase64Url } from '../../core/encoding';
import type { MutationWire } from '../../core/sync/protocol';
import { FIRST_EPOCH, deriveEntryKey, importRoot, newRoot, seal } from '../../core/vault';
import { suiteCipher } from '../../keys/cipher';

/**
 * What the server's tests send: real sealed values, made with Wallet's format and the SDK's cipher, since what the server checks is their sizes and shape.
 * (Tests may import the vault format; server code may not.)
 */
let root: Promise<CryptoKey> | undefined;
export const testRoot = (): Promise<CryptoKey> => (root ??= importRoot(newRoot()));

let counter = 0;
export const uuid = (): string =>
  `${(++counter).toString(16).padStart(8, '0')}-0000-4000-8000-${crypto.randomUUID().slice(-12)}`;

export interface MadeEntry {
  readonly entryId: string;
  readonly key: CryptoKey;
  readonly accountId: string;
}

export async function makeEntry(accountId: string, entryId = uuid()): Promise<MadeEntry> {
  return {
    entryId,
    accountId,
    key: await deriveEntryKey(suiteCipher, await testRoot(), accountId, entryId),
  };
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
    keyEpoch?: number;
  } = {},
): Promise<MutationWire> {
  const { baseVersion = 0, title = 'Gym', tier = 'synced', id = uuid() } = options;
  const keyEpoch = options.keyEpoch ?? FIRST_EPOCH;
  const shape = await seal(suiteCipher, made.key, 'shape', accountId, made.entryId, FIRST_EPOCH, {
    v: 1,
    kind: 'card',
    title,
  });
  const bodyValue = options.body === undefined ? { v: 1, payload: 'x' } : options.body;
  const body =
    bodyValue === null
      ? undefined
      : await seal(suiteCipher, made.key, 'body', accountId, made.entryId, FIRST_EPOCH, bodyValue);
  return {
    id,
    op: 'put',
    entryId: made.entryId,
    baseVersion,
    tier,
    keyEpoch,
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
