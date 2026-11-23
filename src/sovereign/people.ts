import { sql } from 'drizzle-orm';
import { deleteCredentialsOf } from '../crypto/store';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import type { Database } from '../db/client';
import { dbAll, transaction } from '../db/exec';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';

/**
 * **Everything of an account is deleted by this, and only this** (DESIGN.md §28). One routine, in a fixed order, **safe to run again**: the two
 * stores (the app's and the sign-in store) cannot share a transaction, so a run that stopped part way is finished by running it again, and the
 * row that makes the account findable (the account itself, and the link to a Sovereign identity) goes **last**, so that a run that stopped can
 * still find it.
 *
 *  1. The wallet: every entry, deleted ones included (they are ciphertext, and what is deleted is deleted), the record of applied mutations, the
 *     vault and the account's change counter. **Files under `/data/blobs/<account id>` go here too once files exist (4.6).**
 *  2. What was kept for them: sealed credentials, the rate counters.
 *  3. The sign-in store: sessions and what the package keeps with them, sign-ins (password, passkeys, second factors and a Sovereign
 *     identity), a password still to move, pending verifications, and then the account.
 *
 * `people.test.ts` seeds a row in every table for the person and for a second person, finds nothing of the first after, and the second intact, and
 * fails for a table of the app's store that is in neither list in it: **a new table that holds something of a person is deleted here, in the
 * same change.**
 */
export interface PeopleDeps {
  /** The app's store. */
  readonly database: Database;
  /** The sign-in store, as `@sovereignfs/auth` takes it (`src/auth/store.ts`). */
  readonly authDatabase: AuthStore;
  readonly now: () => number;
}

export interface Deleted {
  /** How many entries the wallet held, tombstones included. */
  readonly entries: number;
}

const appSchema = (database: Database) =>
  database.dialect === 'postgres' ? postgresSchema : sqliteSchema;

export async function deletePerson(deps: PeopleDeps, accountId: string): Promise<Deleted> {
  const { database, authDatabase } = deps;
  const app = appSchema(database);
  let entries = 0;

  // 1 and 2. The wallet and what was kept for the person, in one transaction of the app's store.
  await transaction(database, async (tx) => {
    const gone = await dbAll<{ id: string }>(
      tx,
      sql`DELETE FROM ${app.entry} WHERE account_id = ${accountId} RETURNING id`,
    );
    entries = gone.length;
    await dbAll(
      tx,
      sql`DELETE FROM ${app.appliedMutation} WHERE account_id = ${accountId} RETURNING id`,
    );
    await dbAll(
      tx,
      sql`DELETE FROM ${app.vault} WHERE account_id = ${accountId} RETURNING account_id`,
    );
    await dbAll(
      tx,
      sql`DELETE FROM ${app.accountStream} WHERE account_id = ${accountId} RETURNING account_id`,
    );
    // Counters are keyed `kind:account`.
    await dbAll(
      tx,
      sql`DELETE FROM ${app.rateBucket} WHERE "key" LIKE ${`%:${accountId}`} RETURNING "key"`,
    );
  });
  await deleteCredentialsOf(database, accountId);

  // 3. The sign-in store, `@sovereignfs/auth`'s tables. The address is read first, for the verifications that are named by it; the account goes
  // last. Each table is deleted by name rather than left to a cascade, which sqld does not promise to enforce.
  const user = (await authDatabase.run('SELECT email FROM users WHERE id = ?', [accountId]))
    .rows[0];
  for (const table of ['sv_key_secrets', 'sv_core_sign_ins'])
    await authDatabase.run(
      `DELETE FROM ${table} WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`,
      [accountId],
    );
  await authDatabase.run('DELETE FROM sessions WHERE user_id = ?', [accountId]);
  // Sign-ins (a password, a Sovereign identity), second factors and passkeys, and a password still to move, before the account.
  for (const table of ['accounts', 'two_factors', 'passkeys', 'sv_legacy_passwords'])
    await authDatabase.run(`DELETE FROM ${table} WHERE user_id = ?`, [accountId]);
  if (user)
    await authDatabase.run('DELETE FROM verifications WHERE LOWER(identifier) = ?', [
      String(user.email).toLowerCase(),
    ]);
  await authDatabase.run('DELETE FROM users WHERE id = ?', [accountId]);

  return { entries };
}
