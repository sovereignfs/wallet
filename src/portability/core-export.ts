import type { Sovereign } from '@sovereignfs/sdk';
import { sql } from 'drizzle-orm';
import { sovereignClient } from '../auth/server';
import { getConfig } from '../config/current';
import { getAuthStore, getDatabase } from '../db/boot';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { type Limiter, type Rule, RateLimiter } from '../limits/rate';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { accountOfSub } from '../sovereign/identity';
import { guarded } from '../sovereign/notices';
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
 * **A person's part of core's export** (`contracts/export.md` §3), read on the server: their wrapped keyring roots (which only the app key, core's, opens) and
 * every entry that is not deleted, each as stored: its key epoch, its shape and body sealed. The server cannot read any of it (DESIGN.md §8.5), so every
 * file is marked end to end; it opens with the person's account key, as core's own export does (RFC 0008).
 */
export async function personRecords(database: Database, accountId: string): Promise<RecordsPart[]> {
  const t = database.dialect === 'postgres' ? postgresSchema : sqliteSchema;
  const keyring = await dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${t.keyring} WHERE account_id = ${accountId} ORDER BY epoch`,
  );
  const entries = await dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${t.entry} WHERE account_id = ${accountId} AND deleted_at IS NULL ORDER BY created_at, id`,
  );
  return [
    {
      path: 'apps/wallet/records/keyring.jsonl',
      kind: 'keyring',
      records: toRecords(keyring),
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

/** What a caller of the export may ask for in a minute: core asks once for a person's export, so this is generous. */
export const EXPORT_RATE: Rule = { limit: 20, windowMs: 60 * 1000 };

/** What answers core's request, and what stands in front of it. A test gives its own. */
export interface ExportWiring {
  /** The SDK's own answer to a request for an export, which checks the signed token, refuses a replay and streams the person's part. */
  readonly client: Pick<Sovereign, 'auth'>;
  readonly limiter: Limiter | undefined;
  /** `WALLET_AUTH_TRUSTED_PROXIES`, for the count of each caller by its address. */
  readonly trustedProxies: readonly string[];
  /** A person's part, by their `sub`; the server's own reads it from the stores, and a test gives another. */
  readonly records?: (sub: string) => Promise<RecordsPart[]>;
}

/** What the server has of a person Sovereign names: nothing for one that never signed in here. */
async function ownRecords(sub: string): Promise<RecordsPart[]> {
  const accountId = await accountOfSub(await getAuthStore(), sub);
  return accountId ? personRecords(await getDatabase(), accountId) : [];
}

/** The server's own: the process's one SDK client, the database's limits and the settings' proxies; or `undefined` where core is not set. */
async function serverWiring(): Promise<ExportWiring | undefined> {
  const settings = getConfig().auth;
  const client = sovereignClient();
  if (!settings?.sovereign || !client) return undefined;
  return {
    client,
    limiter: new RateLimiter(await getDatabase()),
    trustedProxies: settings.trustedProxies,
  };
}

/**
 * **Core's export of a person** (`signIn.export`, sdk §9.1): core asks for Wallet's part with a signed token, and the SDK checks it, answers at once with an
 * export in the contract's format, and finishes it as the records are written. A person Wallet does not know gets an empty part. `undefined` where core is not
 * set: the route is then not there.
 *
 * **No session or `Origin` stands in front of it, so the guards of core's notices do** (`guarded`): a body over 16 KB is refused unread, and a caller may ask
 * only so many times a minute, counted by its address. It is also **the process's one SDK client**, not one for each request: core's discovery document is
 * fetched once and kept (it was fetched for every request), and core's keys only when a token is well formed enough to be checked, which the limit bounds. A
 * token's `jti` is remembered in the auth store, so a replay is refused after a restart and by every process.
 */
export async function answerCoreExport(
  request: Request,
  wiring?: ExportWiring,
): Promise<Response | undefined> {
  const wired = wiring ?? (await serverWiring());
  if (!wired) return undefined;
  const answer = guarded(
    (guardedRequest) =>
      wired.client.auth.handleExportRequest(
        guardedRequest,
        { prefix: 'wallet', version: packageJson.version },
        async ({ sub, writer }) => {
          for (const each of await (wired.records ?? ownRecords)(sub))
            await writer.addRecords(each.path, each.kind, [...each.records], {
              endToEnd: each.endToEnd,
            });
        },
      ),
    wired.limiter,
    { bucket: 'sovereign-export', rule: EXPORT_RATE, trustedProxies: wired.trustedProxies },
  );
  return answer(request);
}
