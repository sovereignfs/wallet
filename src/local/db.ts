import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { MutationWire, Refusal, RowWire } from '../core/sync/protocol';

/**
 * The device's store (DESIGN.md §11.1, §29.4): IndexedDB through `idb`, **one database per account**, named for it, so that a second account on the same
 * device sees nothing of the first and signing out can delete exactly one. **Everything in it is ciphertext** (AGENTS.md): sealed shapes and bodies, wrapped
 * keys, the vault header, and unlock wrappers that hold the vault key only under a key the person's passkey or passcode makes. The raw-dump test finds no
 * plaintext in it.
 *
 * - `meta`     the device's id, the sync cursor, the vault header as the server gave it, the account's mode.
 * - `unlock`   the ways this device can be unlocked (DESIGN.md §9.3).
 * - `entries`  every entry's row as the server last had it: shape, wrapped key, body (Synced), version. For an entry with unsent changes it is also the
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

/** How a device unlocks (DESIGN.md §9.3): the vault key's bytes, encrypted under a key that only this person on this device can produce. */
export interface UnlockWrapper {
  readonly id: string;
  readonly kind: 'passkey' | 'passcode';
  readonly label: string;
  readonly createdAt: number;
  /** AES-GCM nonce and ciphertext of the vault key (and, for a passcode, the second layer under the device's own key). */
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
  /** The vault key id the wrapper opens, so that a wrapper of an old vault key is not used for a new header. */
  readonly vaultKeyId: string;
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
export const LOCAL_VERSION = 1;

/** The database for an account (DESIGN.md §29.4). */
export const localName = (accountId: string): string => `wallet-${accountId}`;

export async function openLocal(
  accountId: string,
  name = localName(accountId),
): Promise<LocalDatabase> {
  return openDB<LocalSchema>(name, LOCAL_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('meta');
        db.createObjectStore('unlock', { keyPath: 'id' });
        db.createObjectStore('entries', { keyPath: 'id' });
        const outbox = db.createObjectStore('outbox', { autoIncrement: true, keyPath: 'n' });
        outbox.createIndex('byEntry', 'mutation.entryId');
        db.createObjectStore('refused', { keyPath: 'entryId' });
        db.createObjectStore('local');
      }
    },
  });
}

/** Deletes an account's database: signing out and erasing, and deleting the account. */
export async function eraseLocal(accountId: string, name = localName(accountId)): Promise<void> {
  await deleteDB(name);
}
