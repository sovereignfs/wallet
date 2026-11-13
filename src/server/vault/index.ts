import { sql } from 'drizzle-orm';
import { fromBase64Url, toBase64Url } from '../../core/encoding';
import type { Database } from '../../db/client';
import { dbAll, dbGet } from '../../db/exec';
import * as postgresSchema from '../../db/schema/postgres';
import * as sqliteSchema from '../../db/schema/sqlite';

/**
 * The vault header and its recipients (DESIGN.md §7.4, §8.1), as the server keeps them. **It holds public keys and a sealed header and can open neither:**
 * the header is an age file for the wallet key and the recovery key, which are in the browser. It checks structure and size, and that an account makes a
 * vault once; changing keys is after 0.1.0.
 */
export interface Recipient {
  readonly recipient: string;
  readonly label: 'wallet' | 'recovery';
  readonly addedAt: number;
}

export interface VaultRecord {
  readonly version: number;
  readonly recipients: readonly Recipient[];
  readonly header: Buffer;
  readonly vaultKeyId: string;
  readonly state: 'active' | 'rotating';
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** What a device is told: the header as base64url text. */
export interface VaultWire {
  readonly version: number;
  readonly recipients: readonly Recipient[];
  readonly header: string;
  readonly vaultKeyId: string;
  readonly state: 'active' | 'rotating';
}

const MAGIC = Buffer.from('age-encryption.org/v1\n', 'utf8');
/** A header is one small age file: two recipients make it under 1 KB, and four under 2 KB. */
export const HEADER_MAX_BYTES = 4096;
const RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/;

const table = (database: Database) =>
  database.dialect === 'postgres' ? postgresSchema.vault : sqliteSchema.vault;

/** The bytes of a value read from a binary column, which a driver may hand over as a `Buffer`, a typed array or an `ArrayBuffer`. */
export function bytesOf(value: unknown): Buffer | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('a binary column held something else');
}

export type CreateInput =
  | { ok: true; recipients: Recipient[]; header: Buffer; vaultKeyId: string }
  | { ok: false; reason: string };

/** The structure of a request to make a vault. `now` is the time the recipients are stamped with. */
export function parseCreate(input: unknown, now: number): CreateInput {
  const bad = (reason: string): CreateInput => ({ ok: false, reason });
  if (typeof input !== 'object' || input === null) return bad('not a vault');
  const { recipients, header, vaultKeyId } = input as Record<string, unknown>;
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 2)
    return bad('A vault has a wallet key and, optionally, a recovery key.');
  const checked: Recipient[] = [];
  for (const each of recipients as unknown[]) {
    if (typeof each !== 'object' || each === null) return bad('not a recipient');
    const { recipient, label } = each as Record<string, unknown>;
    if (typeof recipient !== 'string' || !RECIPIENT.test(recipient)) return bad('not a public key');
    if (label !== 'wallet' && label !== 'recovery') return bad('not a kind of key');
    checked.push({ recipient, label, addedAt: now });
  }
  if (checked.filter((r) => r.label === 'wallet').length !== 1)
    return bad('A vault has one wallet key.');
  if (checked.filter((r) => r.label === 'recovery').length > 1)
    return bad('A vault has one recovery key.');
  if (new Set(checked.map((r) => r.recipient)).size !== checked.length)
    return bad('The keys must differ.');
  if (typeof header !== 'string' || header.length > Math.ceil((HEADER_MAX_BYTES * 4) / 3) + 4)
    return bad('not a header');
  const bytes = fromBase64Url(header);
  if (!bytes || bytes.length < MAGIC.length || bytes.length > HEADER_MAX_BYTES)
    return bad('not a header');
  if (!Buffer.from(bytes.subarray(0, MAGIC.length)).equals(MAGIC)) return bad('not a header');
  if (typeof vaultKeyId !== 'string' || fromBase64Url(vaultKeyId)?.length !== 12)
    return bad('not a key id');
  return { ok: true, recipients: checked, header: Buffer.from(bytes), vaultKeyId };
}

interface Row {
  version: number | string;
  recipients: string;
  header: unknown;
  vaultKeyId: string;
  state: string;
  createdAt: number | string;
  updatedAt: number | string;
}

/** The account's vault, or `undefined` when it has none. The account is in the statement. */
export async function readVault(
  database: Database,
  accountId: string,
): Promise<VaultRecord | undefined> {
  const row = await dbGet<Row>(
    database,
    sql`SELECT version, recipients, header, vault_key_id AS "vaultKeyId", state, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM ${table(database)} WHERE account_id = ${accountId}`,
  );
  if (!row) return undefined;
  return {
    version: Number(row.version),
    recipients: JSON.parse(row.recipients) as Recipient[],
    header: bytesOf(row.header) ?? Buffer.alloc(0),
    vaultKeyId: row.vaultKeyId,
    state: row.state === 'rotating' ? 'rotating' : 'active',
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function wireOf(vault: VaultRecord): VaultWire {
  return {
    version: vault.version,
    recipients: vault.recipients,
    header: toBase64Url(vault.header),
    vaultKeyId: vault.vaultKeyId,
    state: vault.state,
  };
}

/**
 * Makes the account's vault, once. Returns false when it already has one: **one vault per account, and a second is refused** (DESIGN.md §7.4), decided by
 * the statement itself, so that two devices making one at once cannot both succeed.
 */
export async function createVault(
  database: Database,
  accountId: string,
  input: { recipients: Recipient[]; header: Buffer; vaultKeyId: string },
  now: number,
): Promise<boolean> {
  const rows = await dbAll<{ account_id: string }>(
    database,
    sql`INSERT INTO ${table(database)} (account_id, version, recipients, header, vault_key_id, state, created_at, updated_at)
        VALUES (${accountId}, 1, ${JSON.stringify(input.recipients)}, ${input.header}, ${input.vaultKeyId}, 'active', ${now}, ${now})
        ON CONFLICT (account_id) DO NOTHING RETURNING account_id`,
  );
  return rows.length > 0;
}
