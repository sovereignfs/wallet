import { sql } from 'drizzle-orm';
import { fromBase64Url, toBase64Url } from '../../core/encoding';
import {
  BODY_BUCKET,
  FIRST_EPOCH,
  SHAPE_BUCKET,
  SHAPE_MAX_PADDED,
  documentIdBytes,
  maxEnvelopeBytes,
  paddedLengthOk,
} from '../../core/sync/limits';
import { AVAILABLE_TIERS } from '../../core/entries/types';
import type { MutationWire, Refusal, RowWire } from '../../core/sync/protocol';
import type { Limits } from '../../config';
import type { Database } from '../../db/client';
import { dbAll, dbGet, transaction } from '../../db/exec';
import * as postgresSchema from '../../db/schema/postgres';
import * as sqliteSchema from '../../db/schema/sqlite';
import { bytesOf } from '../../db/binary';

/**
 * Applying a mutation (DESIGN.md §11.4), the one door every write to an entry comes through. **The server stores ciphertext and reads nothing of it but
 * its length:** it checks that the entry is the account's, that the tier allows what is sent, that the sizes are within the limits and are what padding
 * makes, that the version is the one the device started from, and it numbers the change. It cannot check meaning, and does not try.
 *
 * Every condition is in a statement or in a transaction of its own: a mutation reads, decides and writes in one short transaction, and the account's
 * counter, the row and the record of the mutation commit together or not at all. A mutation sent twice changes nothing the second time.
 */
export interface ApplyDeps {
  readonly now: number;
  readonly limits: Limits;
}

export type ApplyResult =
  | { readonly status: 'applied'; readonly seq: number; readonly version: number }
  | { readonly status: 'refused'; readonly code: Refusal; readonly current?: RowWire };

interface EntryRow {
  id: string;
  accountId: string;
  tier: string;
  version: number | string;
  seq: number | string;
  keyEpoch: number | string;
  shape: unknown;
  body: unknown;
  deletedAt: number | string | null;
  bytes: number | string;
  createdAt: number | string;
  updatedAt: number | string;
}

const COLUMNS = sql.raw(
  `id, account_id AS "accountId", tier, version, seq, key_epoch AS "keyEpoch", shape, body, deleted_at AS "deletedAt", bytes, created_at AS "createdAt", updated_at AS "updatedAt"`,
);

const tables = (database: Database) =>
  database.dialect === 'postgres'
    ? {
        entry: postgresSchema.entry,
        stream: postgresSchema.accountStream,
        applied: postgresSchema.appliedMutation,
      }
    : {
        entry: sqliteSchema.entry,
        stream: sqliteSchema.accountStream,
        applied: sqliteSchema.appliedMutation,
      };

/** A row as the wire carries it. The body goes to a device only for a `synced` entry: any other tier's is fetched, not pulled (DESIGN.md §11.3). */
export function wireOfRow(row: EntryRow): RowWire {
  const shape = bytesOf(row.shape);
  const body = bytesOf(row.body);
  return {
    id: row.id,
    tier: row.tier as RowWire['tier'],
    version: Number(row.version),
    seq: Number(row.seq),
    keyEpoch: Number(row.keyEpoch),
    shape: shape ? toBase64Url(shape) : null,
    body: body && row.tier === 'synced' ? toBase64Url(body) : null,
    deletedAt: row.deletedAt === null ? null : Number(row.deletedAt),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

/** Thrown inside the transaction to undo it, for the one case a statement found out after the counter was taken: another writer got there first. */
class Undo extends Error {}

const refused = (code: Refusal, current?: RowWire): ApplyResult => ({
  status: 'refused',
  code,
  ...(current ? { current } : {}),
});

/** What can be refused without the database: the sizes of what was sent, which are all the server may look at. */
function checkSizes(
  m: MutationWire,
  accountId: string,
  limits: Limits,
):
  | { ok: true; keyEpoch: number; shape: Buffer; body: Buffer | null }
  | { ok: false; code: Refusal } {
  const shape = fromBase64Url(m.shape ?? '');
  const body = m.body === undefined ? null : fromBase64Url(m.body);
  if (!shape || (m.body !== undefined && !body)) return { ok: false, code: 'invalid' };
  // Only the first epoch of the keyring root exists until rotating everything is built (task 3.10).
  if (m.keyEpoch !== FIRST_EPOCH) return { ok: false, code: 'invalid' };
  // A value that padding did not make is refused: it would show the length of what it holds. The envelope's own size is the suite's, and the document id in it
  // is `<account id>/<entry id>/<part>`, which the server knows.
  const shapeId = documentIdBytes(accountId, m.entryId, 'shape');
  if (!paddedLengthOk(shape.length, SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId))
    return {
      ok: false,
      code: shape.length > maxEnvelopeBytes(shapeId, SHAPE_MAX_PADDED) ? 'too_large' : 'invalid',
    };
  if (body) {
    const max = Math.ceil(limits.entryBodyBytes / BODY_BUCKET) * BODY_BUCKET;
    const bodyId = documentIdBytes(accountId, m.entryId, 'body');
    if (!paddedLengthOk(body.length, BODY_BUCKET, max, bodyId))
      return {
        ok: false,
        code: body.length > maxEnvelopeBytes(bodyId, max) ? 'too_large' : 'invalid',
      };
  }
  return {
    ok: true,
    keyEpoch: m.keyEpoch,
    shape: Buffer.from(shape),
    body: body ? Buffer.from(body) : null,
  };
}

export async function applyMutation(
  database: Database,
  accountId: string,
  m: MutationWire,
  deps: ApplyDeps,
): Promise<ApplyResult> {
  // The tier first: this version holds the Synced tier only (DESIGN.md §10.2), and says so.
  if (!AVAILABLE_TIERS.includes(m.tier)) return refused('tier_unavailable');
  let sized: ReturnType<typeof checkSizes> | undefined;
  if (m.op === 'put') {
    sized = checkSizes(m, accountId, deps.limits);
    if (!sized.ok) return refused(sized.code);
  }
  try {
    return await transaction(database, (tx) => apply(tx, accountId, m, sized, deps));
  } catch (error) {
    if (error instanceof Undo) return refused('stale');
    throw error;
  }
}

async function apply(
  tx: Database,
  accountId: string,
  m: MutationWire,
  sized: ReturnType<typeof checkSizes> | undefined,
  { now, limits }: ApplyDeps,
): Promise<ApplyResult> {
  const t = tables(tx);

  // A mutation already applied: answered as it was, and nothing is written.
  const seen = await dbGet<{ seq: number | string }>(
    tx,
    sql`SELECT seq FROM ${t.applied} WHERE account_id = ${accountId} AND id = ${m.id}`,
  );
  if (seen) {
    const row = await dbGet<{ version: number | string }>(
      tx,
      sql`SELECT version FROM ${t.entry} WHERE id = ${m.entryId} AND account_id = ${accountId}`,
    );
    return { status: 'applied', seq: Number(seen.seq), version: Number(row?.version ?? 0) };
  }

  // The entry, wherever it is: an id that is another account's is told apart here and refused as not found, saying nothing of whose it is.
  const existing = await dbGet<EntryRow>(
    tx,
    sql`SELECT ${COLUMNS} FROM ${t.entry} WHERE id = ${m.entryId}`,
  );
  if (existing && existing.accountId !== accountId) return refused('not_found');
  if (!existing && m.op === 'delete') return refused('not_found');
  if (!existing && m.baseVersion !== 0) return refused('not_found');
  if (existing && Number(existing.version) !== m.baseVersion)
    return refused('stale', wireOfRow(existing));
  if (existing && existing.tier !== m.tier) return refused('tier_unavailable');

  // The account's counter and mode.
  await dbAll(
    tx,
    sql`INSERT INTO ${t.stream} (account_id, seq, mode) VALUES (${accountId}, 0, 'normal') ON CONFLICT (account_id) DO NOTHING RETURNING account_id`,
  );
  const stream = await dbGet<{ mode: string }>(
    tx,
    sql`SELECT mode FROM ${t.stream} WHERE account_id = ${accountId}`,
  );
  if (m.op === 'put' && sized?.ok && sized.body && stream?.mode === 'offline')
    return refused('offline_mode');

  // The limits of the account (DESIGN.md §29.5): the entries it has, and what they take.
  if (m.op === 'put' && sized?.ok) {
    const total = await dbGet<{ n: number | string; c: number | string }>(
      tx,
      sql`SELECT COALESCE(SUM(bytes), 0) AS n, COUNT(*) AS c FROM ${t.entry} WHERE account_id = ${accountId} AND deleted_at IS NULL`,
    );
    const incoming = sized.shape.length + (sized.body?.length ?? 0);
    const outgoing = existing && existing.deletedAt === null ? Number(existing.bytes) : 0;
    if (!existing || existing.deletedAt !== null) {
      if (Number(total?.c ?? 0) >= limits.entries) return refused('limit');
    }
    if (Number(total?.n ?? 0) - outgoing + incoming > limits.storageBytes) return refused('quota');
  }

  // Taken only now that the mutation will be applied, in this transaction: a refusal above takes no number.
  const counted = await dbGet<{ seq: number | string }>(
    tx,
    sql`UPDATE ${t.stream} SET seq = seq + 1 WHERE account_id = ${accountId} RETURNING seq`,
  );
  const seq = Number(counted?.seq);

  let version: number;
  if (m.op === 'delete') {
    version = m.baseVersion + 1;
    const written = await dbAll(
      tx,
      sql`UPDATE ${t.entry} SET shape = NULL, body = NULL, bytes = 0, file_count = 0, deleted_at = ${now}, version = ${version}, seq = ${seq}, updated_at = ${now}
          WHERE id = ${m.entryId} AND account_id = ${accountId} AND version = ${m.baseVersion} RETURNING id`,
    );
    if (written.length === 0) throw new Undo();
  } else {
    if (!sized?.ok) return refused('invalid');
    version = m.baseVersion + 1;
    const bytes = sized.shape.length + (sized.body?.length ?? 0);
    if (existing) {
      const written = await dbAll(
        tx,
        sql`UPDATE ${t.entry} SET key_epoch = ${sized.keyEpoch}, shape = ${sized.shape}, body = ${sized.body}, bytes = ${bytes}, deleted_at = NULL,
            version = ${version}, seq = ${seq}, updated_at = ${now}
            WHERE id = ${m.entryId} AND account_id = ${accountId} AND version = ${m.baseVersion} RETURNING id`,
      );
      if (written.length === 0) throw new Undo();
    } else {
      const written = await dbAll(
        tx,
        sql`INSERT INTO ${t.entry} (id, account_id, tier, holder_device_id, version, seq, key_epoch, shape, body, file_count, bytes, deleted_at, created_at, updated_at)
            VALUES (${m.entryId}, ${accountId}, ${m.tier}, NULL, ${version}, ${seq}, ${sized.keyEpoch}, ${sized.shape}, ${sized.body}, 0, ${bytes}, NULL, ${now}, ${now})
            ON CONFLICT (id) DO NOTHING RETURNING id`,
      );
      if (written.length === 0) throw new Undo();
    }
  }

  await dbAll(
    tx,
    sql`INSERT INTO ${t.applied} (account_id, id, seq, applied_at) VALUES (${accountId}, ${m.id}, ${seq}, ${now}) ON CONFLICT (account_id, id) DO NOTHING RETURNING id`,
  );
  return { status: 'applied', seq, version };
}

/** The account's rows past a cursor, in order, one more than a page so that the caller knows whether there is more. */
export async function pullRows(
  database: Database,
  accountId: string,
  cursor: number,
  pageRows: number,
): Promise<{ rows: RowWire[]; more: boolean }> {
  const t = tables(database);
  const rows = await dbAll<EntryRow>(
    database,
    sql`SELECT ${COLUMNS} FROM ${t.entry} WHERE account_id = ${accountId} AND seq > ${cursor} ORDER BY seq ASC LIMIT ${pageRows + 1}`,
  );
  return { rows: rows.slice(0, pageRows).map(wireOfRow), more: rows.length > pageRows };
}

/** The account's mode, for the answer. An account that has never synced is `normal`. */
export async function modeOf(database: Database, accountId: string): Promise<'normal' | 'offline'> {
  const row = await dbGet<{ mode: string }>(
    database,
    sql`SELECT mode FROM ${tables(database).stream} WHERE account_id = ${accountId}`,
  );
  return row?.mode === 'offline' ? 'offline' : 'normal';
}
