import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { MutationWire, Refusal, RowWire } from '../core/sync/protocol';

/**
 * The device's store (DESIGN.md §11.1, §29.4): IndexedDB through `idb`, **one database per account**, named for it, so that a second account on the same
 * device sees nothing of the first and signing out can delete exactly one. **Everything in it is ciphertext** (AGENTS.md): sealed shapes and bodies, and unlock
 * wrappers that hold the keyring root only under a key the person's passkey or passcode makes. The raw-dump test finds no
 * plaintext in it.
 *
 * - `meta`     the device's id, the sync cursor, the account's mode.
 * - `unlock`   the ways this device can be unlocked (DESIGN.md §9.3).
 * - `entries`  every entry's row as the server last had it: shape, key epoch, body (Synced), version. For an entry with unsent changes it is also the
 *              base the changes started from.
 * - `outbox`   the changes not yet answered, in the order they were made, with the row each started from, so that a stale one can be merged (§11.5).
 * - `refused`  changes the server refused for a reason that is not a stale version: "Couldn't sync", kept until the person retries or discards them.
 * - `local`    this device's own settings: lock timers.
 */
export interface OutboxItem {
  /** The order, assigned by the store. */
  n?: number;
  readonly mutation: MutationWire;
  /** The row this change started from (the server's, at `baseVersion`), or null for a new entry. */
  readonly base: RowWire | null;
  readonly queuedAt: number;
  /** Set when the server said this was stale and the merge waits for the wallet to be unlocked. */
  stale?: RowWire;
}

export interface RefusedItem {
  /** The entry's id. */
  readonly entryId: string;
  readonly items: readonly OutboxItem[];
  readonly code: Refusal;
  readonly at: number;
}

/** How a device unlocks (DESIGN.md §9.3): the keyring root's bytes, encrypted under a key that only this person on this device can produce. */
export interface UnlockWrapper {
  readonly id: string;
  readonly kind: 'passkey' | 'passcode';
  readonly label: string;
  readonly createdAt: number;
  /** AES-GCM nonce and ciphertext of the root (and, for a passcode, the second layer under the device's own key). */
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
  /** The epoch of the root the wrapper opens, so that a wrapper of an old root is not used for a new one. */
  readonly epoch: number;
  /** For a passkey: the credential, and for a passcode: its Argon2id parameters and salt. */
  readonly passkey?: { readonly credentialId: Uint8Array<ArrayBuffer> };
  readonly passcode?: {
    readonly salt: Uint8Array<ArrayBuffer>;
    readonly memoryKiB: number;
    readonly iterations: number;
    /** The second layer's nonce. */
    readonly outerIv: Uint8Array<ArrayBuffer>;
  };
}

export interface LocalSchema extends DBSchema {
  meta: { key: string; value: unknown };
  unlock: { key: string; value: UnlockWrapper };
  entries: { key: string; value: RowWire };
  outbox: { key: number; value: OutboxItem; indexes: { byEntry: string } };
  refused: { key: string; value: RefusedItem };
  local: { key: string; value: unknown };
}

export type LocalDatabase = IDBPDatabase<LocalSchema>;

/**
 * The version of the stores. A change to them adds a step to `upgrade` and raises this; it never edits an earlier step (`db.test.ts` upgrades a
 * database made by each earlier version).
 */
export const LOCAL_VERSION = 2;

/** The database for an account (DESIGN.md §29.4). */
export const localName = (accountId: string): string => `wallet-${accountId}`;

export async function openLocal(
  accountId: string,
  name = localName(accountId),
  options: {
    /** Another tab is erasing this store, with its account: it has been let go, and this tab has nothing more to do with it. */
    onErased?: () => void;
  } = {},
): Promise<LocalDatabase> {
  return openDB<LocalSchema>(name, LOCAL_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore('meta');
        db.createObjectStore('unlock', { keyPath: 'id' });
        db.createObjectStore('entries', { keyPath: 'id' });
        const outbox = db.createObjectStore('outbox', { autoIncrement: true, keyPath: 'n' });
        outbox.createIndex('byEntry', 'mutation.entryId');
        db.createObjectStore('refused', { keyPath: 'entryId' });
        db.createObjectStore('local');
      }
      // 0.7.0 starts clean (RFC 0001): what 0.1.x held is sealed under keys that no longer exist and cannot be opened, and a wrapper holds a vault key that no
      // longer means anything. The device keeps its id and its own settings, and starts again from the server (whose old entries are gone too).
      if (oldVersion >= 1 && oldVersion < 2) {
        await Promise.all(
          (['entries', 'outbox', 'refused', 'unlock'] as const).map((store) =>
            transaction.objectStore(store).clear(),
          ),
        );
        const meta = transaction.objectStore('meta');
        for (const key of ['cursor', 'mode', 'vault', 'vaultVersion']) await meta.delete(key);
      }
    },
    // **A store held open cannot be deleted:** the deletion waits for as long as the tab is open. So it is let go as soon as a deletion asks (a transaction under
    // way finishes first). A newer version asking is another matter, and is left as it was.
    blocking(_current, wanted, event) {
      if (wanted !== null) return;
      (event.target as IDBDatabase).close();
      options.onErased?.();
    },
  });
}

/** Deletes an account's database: signing out and erasing, and deleting the account. */
export async function eraseLocal(accountId: string, name = localName(accountId)): Promise<void> {
  await deleteDB(name);
}
