import { sql } from 'drizzle-orm';
import { fromBase64Url, toBase64Url } from '../../core/encoding';
import { bytesOf } from '../../db/binary';
import type { Database } from '../../db/client';
import { dbAll } from '../../db/exec';
import * as postgresSchema from '../../db/schema/postgres';
import * as sqliteSchema from '../../db/schema/sqlite';

/**
 * The keyring root of an account, wrapped (DESIGN.md §7.4, §8.1), as the server keeps it. **It holds a wrapped key and can open nothing:** the root is 32 random
 * bytes made by the account's first device and wrapped there under the suite's app key (AES-256-GCM, the nonce first), which only the person's browser can open.
 * The server checks the length, that an account has one per epoch, and who is asking (the session's account, in the statement).
 */

/** 12 bytes of nonce, 32 of root, 16 of tag. */
export const WRAPPED_ROOT_BYTES = 12 + 32 + 16;

/**
 * The epochs a device may make. **Only the first until rotating everything is built** (task 3.10): a second epoch would be the rotation's, with every entry re-sealed,
 * and a route that took one now would leave an account with entries that no root opens.
 */
export const FIRST_EPOCH = 1;

export interface WrappedRoot {
  readonly epoch: number;
  readonly wrapped: Buffer;
}

/** What a device is told: the wrapped root as base64url text. */
export interface WrappedRootWire {
  readonly epoch: number;
  readonly wrapped: string;
}

const table = (database: Database) =>
  database.dialect === 'postgres' ? postgresSchema.keyring : sqliteSchema.keyring;

export type MakeInput = { ok: true; epoch: number; wrapped: Buffer } | { ok: false };

/** The structure of a request to keep a wrapped root: the first epoch, and exactly the bytes of a wrapped 32-byte key. */
export function parseMake(input: unknown): MakeInput {
  if (typeof input !== 'object' || input === null) return { ok: false };
  const { epoch, wrapped } = input as Record<string, unknown>;
  if (epoch !== FIRST_EPOCH) return { ok: false };
  if (typeof wrapped !== 'string' || wrapped.length > Math.ceil((WRAPPED_ROOT_BYTES * 4) / 3) + 4)
    return { ok: false };
  const bytes = fromBase64Url(wrapped);
  if (!bytes || bytes.length !== WRAPPED_ROOT_BYTES) return { ok: false };
  return { ok: true, epoch, wrapped: Buffer.from(bytes) };
}

interface Row {
  epoch: number | string;
  wrappedRoot: unknown;
}

/** The account's wrapped roots, oldest epoch first. The account is in the statement. */
export async function readRoots(database: Database, accountId: string): Promise<WrappedRoot[]> {
  const rows = await dbAll<Row>(
    database,
    sql`SELECT epoch, wrapped_root AS "wrappedRoot" FROM ${table(database)}
        WHERE account_id = ${accountId} ORDER BY epoch`,
  );
  return rows.map((row) => ({
    epoch: Number(row.epoch),
    wrapped: bytesOf(row.wrappedRoot) ?? Buffer.alloc(0),
  }));
}

export const wireOf = (root: WrappedRoot): WrappedRootWire => ({
  epoch: root.epoch,
  wrapped: toBase64Url(root.wrapped),
});

/**
 * Keeps the account's wrapped root for an epoch, **the first one it is given.** Returns false when the account already has that epoch: decided by the statement
 * itself, so that two devices making the root at once cannot both succeed, and the one that lost reads the stored one and uses that.
 */
export async function keepRoot(
  database: Database,
  accountId: string,
  input: { epoch: number; wrapped: Buffer },
  now: number,
): Promise<boolean> {
  const rows = await dbAll<{ epoch: number | string }>(
    database,
    sql`INSERT INTO ${table(database)} (account_id, epoch, wrapped_root, created_at)
        VALUES (${accountId}, ${input.epoch}, ${input.wrapped}, ${now})
        ON CONFLICT (account_id, epoch) DO NOTHING RETURNING epoch`,
  );
  return rows.length > 0;
}
