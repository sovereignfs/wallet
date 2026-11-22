import { createSovereign } from '@sovereignfs/sdk';
import { sql } from 'drizzle-orm';
import { getConfig } from '../config/current';
import { getAuthDatabase, getDatabase } from '../db/boot';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { accountOfSub } from '../sovereign/identity';
import packageJson from '../../package.json';

type Value = string | number | boolean | null;
export type Record_ = Readonly<Record<string, Value>>;

/** One file of records in a person's export: its path in the archive, its kind, its lines, and whether they are sealed in the browser. */
export interface RecordsPart {
  readonly path: string;
  readonly kind: string;
  readonly records: readonly Record_[];
  readonly endToEnd: boolean;
}

/** What the server keeps for its own work, of no use outside it: the sync's counter and the device that holds an entry. */
const INTERNAL = new Set(['seq', 'holder_device_id', 'account_id']);

/** A stored value as the export format asks: bytes in base64url, a time in milliseconds as ISO 8601 in UTC, anything else as it is. */
function value(name: string, field: unknown): Value {
  if (field === null || field === undefined) return null;
  // Bytes: a `Buffer` from PostgreSQL, an `ArrayBuffer` from libsql's raw rows.
  if (field instanceof Uint8Array) return Buffer.from(field).toString('base64url');
  if (field instanceof ArrayBuffer) return Buffer.from(new Uint8Array(field)).toString('base64url');
  if (name.endsWith('_at') && (typeof field === 'number' || /^\d+$/.test(String(field))))
    return new Date(Number(field)).toISOString();
  if (typeof field === 'bigint') return Number(field);
  return field as Value;
}

/** Rows as records: the server's own columns left out, and every sealed column as the bytes it stores. */
export function toRecords(rows: readonly Record<string, unknown>[]): Record_[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([name]) => !INTERNAL.has(name))
        .map(([name, field]) => [name, value(name, field)]),
    ),
  );
}

/**
 * **A person's part of core's export** (`contracts/export.md` §3), read on the server: their vault (the public recipients and the vault header, an age
 * file only their keys open) and every entry that is not deleted, each as stored: its key wrapped under the vault key, its shape and body sealed. The
 * server cannot read any of it (DESIGN.md §8.5), so every file is marked end to end; it opens with the person's wallet key or recovery key.
 */
export async function personRecords(database: Database, accountId: string): Promise<RecordsPart[]> {
  const t = database.dialect === 'postgres' ? postgresSchema : sqliteSchema;
  const vault = await dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${t.vault} WHERE account_id = ${accountId}`,
  );
  const entries = await dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${t.entry} WHERE account_id = ${accountId} AND deleted_at IS NULL ORDER BY created_at, id`,
  );
  return [
    {
      path: 'apps/wallet/records/vault.jsonl',
      kind: 'vault',
      records: toRecords(vault),
      endToEnd: true,
    },
    {
      path: 'apps/wallet/records/entry.jsonl',
      kind: 'entry',
      records: toRecords(entries),
      endToEnd: true,
    },
  ].filter((each) => each.records.length > 0);
}

/**
 * What the SDK remembers of a token it has seen, so that a replay is refused. Wallet keeps its own sessions with better-auth, so this holds nothing else;
 * it is in memory, since an export asked for twice is the same export (sdk §9.1) and no harm comes of a second.
 */
const seen = new Map<string, { record: unknown; expiresAt: number }>();
const replays = {
  get: (id: string) => {
    const kept = seen.get(id);
    if (!kept || kept.expiresAt < Date.now()) return undefined;
    return kept.record as never;
  },
  set: (id: string, record: unknown, expiresAt: number) => void seen.set(id, { record, expiresAt }),
  delete: (id: string) => void seen.delete(id),
  deleteMatching: () => undefined,
};

/**
 * **Core's export of a person** (`signIn.export`, sdk §9.1): core asks for Wallet's part with a signed token, and the SDK checks it (a replay refused),
 * answers at once with an export in the contract's format, and finishes it as the records are written. A person Wallet does not know gets an empty part.
 * `undefined` where core is not set: the route is then not there.
 */
export async function answerCoreExport(request: Request): Promise<Response | undefined> {
  const config = getConfig();
  const core = config.auth?.sovereign;
  if (!core || !config.url) return undefined;
  const client = createSovereign({
    appUrl: config.url,
    coreUrl: new URL(core.issuer).origin,
    clientId: core.clientId,
    clientSecret: core.clientSecret,
    sessionStore: replays,
  });
  return client.auth.handleExportRequest(
    request,
    { prefix: 'wallet', version: packageJson.version },
    async ({ sub, writer }) => {
      const accountId = await accountOfSub(await getAuthDatabase(), sub);
      if (!accountId) return;
      for (const each of await personRecords(await getDatabase(), accountId))
        await writer.addRecords(each.path, each.kind, [...each.records], {
          endToEnd: each.endToEnd,
        });
    },
  );
}
