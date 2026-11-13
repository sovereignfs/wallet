import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { pgSchema } from 'drizzle-orm/pg-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import {
  generateDrizzleJson,
  generateMigration,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './client';
import { dbAll, dbGet, dbRun } from './exec';
import * as pgColumns from './schema/postgres/columns';
import * as sqliteColumns from './schema/sqlite/columns';
import { freshDatabase, testTarget } from './test-support';

/**
 * The column vocabulary (DESIGN.md §29.2) is only worth anything if each word means the same thing on both dialects, so this makes a table out of
 * every word, with the SQL the generator really writes for it, and reads values back through each. The tables are the test's own and are dropped
 * afterwards; the app's schema is not touched.
 */
const { leg } = testTarget();

/** A schema of the test's own in PostgreSQL, so that dropping it cannot reach anything else. */
const probeSchema = pgSchema('wallet_probe');

const sqliteProbe = sqliteTable('vocabulary_probe', {
  id: sqliteColumns.id('id'),
  owner: sqliteColumns.ref('owner').notNull(),
  at: sqliteColumns.epochMs('at').notNull(),
  seq: sqliteColumns.counter('seq').notNull(),
  done: sqliteColumns.bool('done').notNull(),
  sealed: sqliteColumns.binary('sealed'),
});

const pgProbe = probeSchema.table('vocabulary_probe', {
  id: pgColumns.id('id'),
  owner: pgColumns.ref('owner').notNull(),
  at: pgColumns.epochMs('at').notNull(),
  seq: pgColumns.counter('seq').notNull(),
  done: pgColumns.bool('done').notNull(),
  sealed: pgColumns.binary('sealed'),
});

/** The statements the generator writes to make the probe, as the migrations of the app are made. */
async function createStatements(dialect: Database['dialect']): Promise<string[]> {
  if (dialect === 'sqlite') {
    return generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson({ sqliteProbe }),
    );
  }
  return generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson({ probeSchema, pgProbe }),
  );
}

let database: Database;
let table: ReturnType<typeof sql.raw>;

beforeAll(async () => {
  ({ database } = await freshDatabase());
  table =
    database.dialect === 'postgres'
      ? sql.raw('"wallet_probe"."vocabulary_probe"')
      : sql.raw('"vocabulary_probe"');
  if (database.dialect === 'postgres') {
    await dbRun(database, sql`DROP SCHEMA IF EXISTS wallet_probe CASCADE`);
  }
  for (const statement of await createStatements(database.dialect)) {
    await dbRun(database, sql.raw(statement));
  }
});

afterAll(async () => {
  if (database.dialect === 'postgres') {
    await dbRun(database, sql`DROP SCHEMA IF EXISTS wallet_probe CASCADE`);
  }
  await database.close();
});

describe(`the column vocabulary (${leg})`, () => {
  it('stores a time in milliseconds and a counter as numbers, exactly, past 2^32', async () => {
    const at = 1_800_000_000_123;
    const seq = 5_000_000_000;
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done) VALUES ('t1', 'a', ${at}, ${seq}, ${true})`,
    );
    const row = await dbGet<{ at: unknown; seq: unknown }>(
      database,
      sql`SELECT at, seq FROM ${table} WHERE id = 't1'`,
    );
    expect(row).toEqual({ at, seq });
    expect(typeof row?.at).toBe('number');
    expect(typeof row?.seq).toBe('number');
  });

  it('stores a boolean that can be read back as true and false', async () => {
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done) VALUES ('t2', 'a', 1, 1, ${false})`,
    );
    const rows = await dbAll<{ id: string; done: unknown }>(
      database,
      sql`SELECT id, done FROM ${table} WHERE id IN ('t1', 't2') ORDER BY id`,
    );
    // SQLite returns 0 and 1 where PostgreSQL returns booleans: raw reads cast where it matters (exec.ts), and a query says `done = ...`.
    expect(rows.map((r) => [r.id, Boolean(r.done)])).toEqual([
      ['t1', true],
      ['t2', false],
    ]);
  });

  // The reason the word exists: sealed values are opaque bytes, and every one of them must come back byte for byte, whatever it holds (zero
  // bytes, bytes that are not UTF-8, bytes that look like text).
  it('round-trips binary byte for byte: every byte value, zeros, and a large random value', async () => {
    const every = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const zeros = Buffer.alloc(1024);
    const large = randomBytes(300_000);
    const empty = Buffer.alloc(0);
    for (const [id, value] of [
      ['b-every', every],
      ['b-zeros', zeros],
      ['b-large', large],
      ['b-empty', empty],
    ] as const) {
      await dbRun(
        database,
        sql`INSERT INTO ${table} (id, owner, at, seq, done, sealed) VALUES (${id}, 'a', 1, 1, ${false}, ${value})`,
      );
      const row = await dbGet<{ sealed: Uint8Array | ArrayBuffer }>(
        database,
        sql`SELECT sealed FROM ${table} WHERE id = ${id}`,
      );
      const got = Buffer.from(
        row?.sealed instanceof ArrayBuffer ? new Uint8Array(row.sealed) : (row?.sealed ?? []),
      );
      expect(got.equals(value), id).toBe(true);
    }
  });

  it('reads the length of a binary value without reading it', async () => {
    const row = await dbGet<{ n: number | string }>(
      database,
      sql`SELECT ${database.dialect === 'postgres' ? sql`octet_length(sealed)` : sql`length(sealed)`} AS n FROM ${table} WHERE id = 'b-large'`,
    );
    expect(Number(row?.n)).toBe(300_000);
  });

  it('has a primary key on the id', async () => {
    await expect(
      dbRun(
        database,
        sql`INSERT INTO ${table} (id, owner, at, seq, done) VALUES ('t1', 'a', 1, 1, ${false})`,
      ),
    ).rejects.toThrow();
  });
});

describe('the generated SQL', () => {
  it('writes a binary column as blob on SQLite and bytea on PostgreSQL', async () => {
    expect((await createStatements('sqlite')).join('\n')).toMatch(/`sealed` blob/);
    expect((await createStatements('postgres')).join('\n')).toMatch(/"sealed" "?bytea"?/);
  });
});
