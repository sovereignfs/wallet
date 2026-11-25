import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { binary, counter, epochMs, id, ref } from './columns';

/**
 * What the server holds of an account's wallet (DESIGN.md §29.3). The account itself is better-auth's, in the other store, so `account_id` is
 * a reference by value and not a foreign key; there are no foreign keys, and every deletion names what it deletes (`People.deletePerson`).
 * **Every sealed column is opaque:** the server stores its bytes and reads their length, never their content (§8.5).
 */

/**
 * The vault of an account (DESIGN.md §7.4, §8.1): the recipients of the wallet key and the recovery key, and the vault header, the vault key
 * encrypted to them with age. One per account. `version` is what a change of keys (after 0.1.0) must repeat to be applied.
 */
export const vault = sqliteTable('vault', {
  accountId: ref('account_id').primaryKey(),
  version: counter('version').notNull(),
  /** JSON: `[{ recipient, label: 'wallet' | 'recovery', addedAt }]`. Public keys only. */
  recipients: text('recipients').notNull(),
  /** The vault header: an age file, sealed to `recipients`. */
  header: binary('header').notNull(),
  vaultKeyId: text('vault_key_id').notNull(),
  /** `active`, or `rotating` while every entry is re-sealed under a new vault key (after 0.1.0). */
  state: text('state').notNull().default('active'),
  createdAt: epochMs('created_at').notNull(),
  updatedAt: epochMs('updated_at').notNull(),
});

/**
 * The keyring root of an account, wrapped (DESIGN.md §7.4, §8.1): 32 random bytes made by the account's first device, kept here **only under the suite's app key**
 * (AES-256-GCM, nonce first), which opens in the browser. One row per epoch of the root (a rotation makes the next, task 3.10). The server can open none of it.
 */
export const keyring = sqliteTable(
  'keyring',
  {
    accountId: ref('account_id').notNull(),
    epoch: counter('epoch').notNull(),
    wrappedRoot: binary('wrapped_root').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.epoch] })],
);

/** The account's change counter and mode (DESIGN.md §11.3): every applied mutation increments `seq`, and rows are stamped with it. */
export const accountStream = sqliteTable('account_stream', {
  accountId: ref('account_id').primaryKey(),
  seq: counter('seq').notNull().default(0),
  /** `normal`, or `offline` for a fully offline wallet (after 0.1.0): the server then refuses any body. */
  mode: text('mode').notNull().default('normal'),
});

/**
 * One thing in the wallet (DESIGN.md §10.1). **Its kind is not a column:** it is in the sealed `shape`, so the server cannot tell a passport from a
 * loyalty card (§8.5). `wrapped_key` is the entry's key under the vault key; `shape` and `body` are sealed, and a tombstone has neither.
 * `file_count` is 0 until files are built. `version` is the number a mutation's `baseVersion` must equal.
 */
export const entry = sqliteTable(
  'entry',
  {
    id: id('id'),
    accountId: ref('account_id').notNull(),
    /** `synced` in 0.1.0; `device` and `server` are refused until their task is built. */
    tier: text('tier').notNull(),
    holderDeviceId: ref('holder_device_id'),
    version: counter('version').notNull(),
    seq: counter('seq').notNull(),
    wrappedKey: binary('wrapped_key').notNull(),
    shape: binary('shape'),
    body: binary('body'),
    fileCount: counter('file_count').notNull().default(0),
    /** The padded sizes of shape, body and files together: what a quota counts. */
    bytes: counter('bytes').notNull().default(0),
    deletedAt: epochMs('deleted_at'),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [
    // Pull is the rows of an account past a cursor; a lookup names the account and the id.
    index('entry_account_seq_idx').on(table.accountId, table.seq),
    index('entry_account_id_idx').on(table.accountId, table.id),
  ],
);

/**
 * A mutation that was applied, so that sending it again changes nothing and is answered as it was (DESIGN.md §11.2). Kept by account: one
 * account's mutation ids are nothing to another's.
 */
export const appliedMutation = sqliteTable(
  'applied_mutation',
  {
    accountId: ref('account_id').notNull(),
    id: ref('id').notNull(),
    /** The `seq` the mutation was applied at, which is what a repeat is told. */
    seq: counter('seq').notNull(),
    appliedAt: epochMs('applied_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

/**
 * Counts for rate limits, in the database so that a limit holds across every process: a key, when its window began, and how many have been
 * counted in it (`src/limits/rate.ts`). Swept when a window is long over.
 */
export const rateBucket = sqliteTable(
  'rate_bucket',
  {
    key: id('key'),
    windowStart: epochMs('window_start').notNull(),
    count: counter('count').notNull(),
  },
  (table) => [index('rate_bucket_window_idx').on(table.windowStart)],
);

/**
 * A secret the server keeps sealed under its own key (DESIGN.md §8.7): after 0.1.0, a git repository's token. **Only `src/crypto/` writes or reads
 * `sealed`**, which is envelope-encrypted under the instance key and bound to this row's `id` and `purpose`. `key_fingerprint` is the fingerprint
 * of the key that wraps it, so that a start-up can tell which keys the rows need and rotation can find the rows it has to move.
 */
export const credential = sqliteTable(
  'credential',
  {
    id: id('id'),
    accountId: ref('account_id').notNull(),
    purpose: text('purpose').notNull(),
    sealed: text('sealed').notNull(),
    keyFingerprint: text('key_fingerprint').notNull(),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [
    index('credential_account_idx').on(table.accountId),
    index('credential_key_idx').on(table.keyFingerprint),
  ],
);
