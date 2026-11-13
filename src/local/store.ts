import type { MutationWire, RowWire } from '../core/sync/protocol';
import { isUuid } from '../core/entries/types';
import type { LocalDatabase, OutboxItem, RefusedItem, UnlockWrapper } from './db';

/**
 * Reading and writing the device's store (DESIGN.md §11.1). Every function does one thing in one transaction, so that closing the tab at any moment
 * loses nothing: **a change is written to the outbox in the same transaction as everything it depends on**, and a response is applied in one.
 */
export type Mode = 'normal' | 'offline';

export async function deviceId(db: LocalDatabase): Promise<string> {
  const existing = await db.get('meta', 'deviceId');
  if (typeof existing === 'string' && isUuid(existing)) return existing;
  const made = crypto.randomUUID();
  await db.put('meta', made, 'deviceId');
  return made;
}

export async function cursorOf(db: LocalDatabase): Promise<number> {
  const value = await db.get('meta', 'cursor');
  return typeof value === 'number' ? value : 0;
}

export async function modeOf(db: LocalDatabase): Promise<Mode> {
  return (await db.get('meta', 'mode')) === 'offline' ? 'offline' : 'normal';
}

/** The vault header and recipients as the server gave them, kept so that unlocking works offline (DESIGN.md §9.3). */
export interface StoredVault {
  readonly version: number;
  readonly header: string;
  readonly vaultKeyId: string;
  readonly recipients: readonly {
    recipient: string;
    label: 'wallet' | 'recovery';
    addedAt: number;
  }[];
}

export async function vaultOf(db: LocalDatabase): Promise<StoredVault | undefined> {
  const value = (await db.get('meta', 'vault')) as StoredVault | undefined;
  return value && typeof value.header === 'string' ? value : undefined;
}

export const saveVault = (db: LocalDatabase, vault: StoredVault) => db.put('meta', vault, 'vault');

export const allRows = (db: LocalDatabase): Promise<RowWire[]> => db.getAll('entries');
export const rowOf = (db: LocalDatabase, id: string): Promise<RowWire | undefined> =>
  db.get('entries', id);
export const outboxItems = (db: LocalDatabase): Promise<OutboxItem[]> => db.getAll('outbox');
export const refusedItems = (db: LocalDatabase): Promise<RefusedItem[]> => db.getAll('refused');

/** What the local view of an entry is built on: the server's row, and the changes made since, in order. */
export async function pendingFor(db: LocalDatabase, entryId: string): Promise<OutboxItem[]> {
  return db.getAllFromIndex('outbox', 'byEntry', entryId);
}

/** Queues a change. The base is the row it started from. Returns the item with its order. */
export async function enqueue(
  db: LocalDatabase,
  mutation: MutationWire,
  base: RowWire | null,
  queuedAt: number,
): Promise<OutboxItem> {
  const item: OutboxItem = { mutation, base, queuedAt };
  const n = await db.add('outbox', item);
  return { ...item, n };
}

/**
 * Applies what the server answered, in one transaction: the rows it applied (as the device now knows them), the rows it sent, the cursor and the mode.
 * A row that is older than the one held is ignored (a page that arrived late), so applying a response twice changes nothing.
 */
export async function applyAnswer(
  db: LocalDatabase,
  answer: {
    applied: readonly { item: OutboxItem; row: RowWire }[];
    rows: readonly RowWire[];
    cursor: number;
    mode: Mode;
    vaultVersion: number | null;
  },
): Promise<void> {
  const tx = db.transaction(['meta', 'entries', 'outbox'], 'readwrite');
  const entries = tx.objectStore('entries');
  const put = async (row: RowWire) => {
    const held = await entries.get(row.id);
    if (!held || row.version >= held.version) await entries.put(row);
  };
  for (const { item, row } of answer.applied) {
    await put(row);
    if (item.n !== undefined) await tx.objectStore('outbox').delete(item.n);
  }
  for (const row of answer.rows) await put(row);
  const meta = tx.objectStore('meta');
  const held = await meta.get('cursor');
  if (answer.cursor > (typeof held === 'number' ? held : 0))
    await meta.put(answer.cursor, 'cursor');
  await meta.put(answer.mode, 'mode');
  if (answer.vaultVersion !== null) await meta.put(answer.vaultVersion, 'vaultVersion');
  await tx.done;
}

/** Moves every pending change of an entry to Couldn't sync: the server refused it, and a person decides what becomes of it. */
export async function refuse(
  db: LocalDatabase,
  entryId: string,
  code: RefusedItem['code'],
  at: number,
): Promise<void> {
  const tx = db.transaction(['outbox', 'refused'], 'readwrite');
  const items = await tx.objectStore('outbox').index('byEntry').getAll(entryId);
  for (const item of items) if (item.n !== undefined) await tx.objectStore('outbox').delete(item.n);
  if (items.length > 0) await tx.objectStore('refused').put({ entryId, items, code, at });
  await tx.done;
}

/** Puts a refused entry's changes back in the outbox, as one change on the row the device now has. */
export async function retryRefused(
  db: LocalDatabase,
  entryId: string,
  now: number,
): Promise<boolean> {
  const tx = db.transaction(['outbox', 'refused', 'entries'], 'readwrite');
  const refused = await tx.objectStore('refused').get(entryId);
  if (!refused) return false;
  const last = refused.items.at(-1);
  if (!last) return false;
  const row = (await tx.objectStore('entries').get(entryId)) ?? null;
  await tx.objectStore('outbox').add({
    mutation: { ...last.mutation, id: crypto.randomUUID(), baseVersion: row?.version ?? 0 },
    base: row,
    queuedAt: now,
  } satisfies OutboxItem);
  await tx.objectStore('refused').delete(entryId);
  await tx.done;
  return true;
}

export const discardRefused = (db: LocalDatabase, entryId: string) => db.delete('refused', entryId);

/** Replaces all of an entry's pending changes with one (a stale change after a merge). */
export async function replacePending(
  db: LocalDatabase,
  entryId: string,
  replacement: OutboxItem,
): Promise<void> {
  const tx = db.transaction('outbox', 'readwrite');
  for (const item of await tx.store.index('byEntry').getAll(entryId))
    if (item.n !== undefined) await tx.store.delete(item.n);
  // The order is the store's to give: a replacement is queued last, with no number of its own.
  const { n: _n, stale: _stale, ...fresh } = replacement;
  await tx.store.add(fresh as OutboxItem);
  await tx.done;
}

/** Remembers that a pending change is stale, with the row to merge it under, until the wallet is unlocked. */
export async function markStale(db: LocalDatabase, n: number, current: RowWire): Promise<void> {
  const tx = db.transaction('outbox', 'readwrite');
  const item = await tx.store.get(n);
  if (item) await tx.store.put({ ...item, stale: current });
  await tx.done;
}

export const unlockWrappers = (db: LocalDatabase): Promise<UnlockWrapper[]> => db.getAll('unlock');
export const saveWrapper = (db: LocalDatabase, wrapper: UnlockWrapper) => db.put('unlock', wrapper);
export const removeWrapper = (db: LocalDatabase, id: string) => db.delete('unlock', id);

/** This device's own settings (lock timers) and counters. */
export async function localValue<T>(db: LocalDatabase, key: string, fallback: T): Promise<T> {
  const value = await db.get('local', key);
  return value === undefined ? fallback : (value as T);
}
export const setLocalValue = (db: LocalDatabase, key: string, value: unknown) =>
  db.put('local', value, key);
