import { fromBase64Url } from '../encoding';
import { TIERS, type Tier, isRecord, isUuid } from '../entries/types';

/**
 * The sync protocol (DESIGN.md §11), the types and validators both sides share. **Sealed values travel as base64url text** inside JSON; the server decodes
 * them to bytes and stores the bytes. `docs/specs/sync-protocol.md` is the specification, with example exchanges that `protocol.test.ts` and the endpoint's tests run.
 *
 * A request carries the device's id, its cursor and its outbox in order; the answer says what was applied, what was refused and why, and the rows past the
 * cursor. A refused mutation is never lost: the device keeps it in Couldn't sync.
 */
export const PROTOCOL_VERSION = 1;

/** The most mutations in one request, and the most rows in one answer: the rest follows on the next. */
export const MAX_MUTATIONS = 50;
export const PAGE_ROWS = 100;

export type MutationOp = 'put' | 'delete';

export interface MutationWire {
  /** A UUID made by the device, so that sending a mutation twice changes nothing. */
  readonly id: string;
  readonly op: MutationOp;
  /** The entry's id, made by the device. */
  readonly entryId: string;
  /** The version the device last agreed with the server: 0 for a new entry. */
  readonly baseVersion: number;
  readonly tier: Tier;
  /** `put` only: the entry key, wrapped (base64url). */
  readonly wrappedKey?: string;
  /** `put` only: the sealed shape (base64url). */
  readonly shape?: string;
  /** `put` only: the sealed body, or absent for an entry that has none. */
  readonly body?: string;
}

export interface SyncRequest {
  readonly v: typeof PROTOCOL_VERSION;
  /** A random id the browser makes and keeps in its store. */
  readonly deviceId: string;
  /** The highest `seq` the device has pulled. */
  readonly cursor: number;
  readonly mutations: readonly MutationWire[];
}

/** An entry's row as the server has it, with every sealed value as base64url. A tombstone has neither shape nor body. */
export interface RowWire {
  readonly id: string;
  readonly tier: Tier;
  readonly version: number;
  readonly seq: number;
  readonly wrappedKey: string;
  readonly shape: string | null;
  readonly body: string | null;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Why a mutation was refused. Every one but `stale` ends in Couldn't sync; `stale` is merged on the device (DESIGN.md §11.5). */
export const REFUSALS = [
  'stale',
  'not_found',
  'tier_unavailable',
  'offline_mode',
  'too_large',
  'quota',
  'limit',
  'invalid',
] as const;
export type Refusal = (typeof REFUSALS)[number];

export interface SyncResponse {
  readonly v: typeof PROTOCOL_VERSION;
  readonly applied: readonly {
    readonly mutationId: string;
    readonly seq: number;
    readonly version: number;
  }[];
  readonly refused: readonly {
    readonly mutationId: string;
    readonly code: Refusal;
    /** For `stale`: the row as it is now, so that the device can merge without asking again. */
    readonly current?: RowWire;
  }[];
  /** Rows past the request's cursor, in `seq` order, up to `PAGE_ROWS`. */
  readonly rows: readonly RowWire[];
  /** The `seq` of the last row, or the request's cursor when there are none. */
  readonly cursor: number;
  /** Whether there are more rows past `cursor`. */
  readonly more: boolean;
  readonly mode: 'normal' | 'offline';
  /** The version of the vault header the server holds, or null when there is no vault: a device that has an older one fetches it. */
  readonly vaultVersion: number | null;
}

export type ParsedRequest =
  | { readonly ok: true; readonly request: SyncRequest }
  | { readonly ok: false; readonly code: 'invalid' | 'unsupported' };

const bad = { ok: false, code: 'invalid' } as const;

/** A sealed value as text: base64url, canonical, and not longer than `most` bytes once decoded. */
export function sealedText(value: unknown, most: number): Uint8Array<ArrayBuffer> | undefined {
  if (typeof value !== 'string' || value.length > Math.ceil((most * 4) / 3) + 4) return undefined;
  const bytes = fromBase64Url(value);
  return bytes && bytes.length <= most ? bytes : undefined;
}

/** The structure of a request. Sizes of sealed values are checked by the server against its limits, in the statement that applies them. */
export function parseSyncRequest(text: string): ParsedRequest {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return bad;
  }
  if (!isRecord(input)) return bad;
  if (typeof input.v === 'number' && input.v !== PROTOCOL_VERSION)
    return { ok: false, code: 'unsupported' };
  if (input.v !== PROTOCOL_VERSION) return bad;
  if (!isUuid(input.deviceId)) return bad;
  if (typeof input.cursor !== 'number' || !Number.isSafeInteger(input.cursor) || input.cursor < 0)
    return bad;
  if (!Array.isArray(input.mutations) || input.mutations.length > MAX_MUTATIONS) return bad;
  const mutations: MutationWire[] = [];
  for (const raw of input.mutations as unknown[]) {
    if (!isRecord(raw)) return bad;
    const { id, op, entryId, baseVersion, tier, wrappedKey, shape, body } = raw;
    if (!isUuid(id) || !isUuid(entryId)) return bad;
    if (op !== 'put' && op !== 'delete') return bad;
    if (typeof baseVersion !== 'number' || !Number.isSafeInteger(baseVersion) || baseVersion < 0)
      return bad;
    if (typeof tier !== 'string' || !(TIERS as readonly string[]).includes(tier)) return bad;
    if (op === 'put') {
      if (typeof wrappedKey !== 'string' || typeof shape !== 'string') return bad;
      if (body !== undefined && typeof body !== 'string') return bad;
    } else if (wrappedKey !== undefined || shape !== undefined || body !== undefined) return bad;
    mutations.push({
      id,
      op,
      entryId,
      baseVersion,
      tier: tier as Tier,
      ...(typeof wrappedKey === 'string' ? { wrappedKey } : {}),
      ...(typeof shape === 'string' ? { shape } : {}),
      ...(typeof body === 'string' ? { body } : {}),
    });
  }
  if (new Set(mutations.map((m) => m.id)).size !== mutations.length) return bad;
  return {
    ok: true,
    request: { v: PROTOCOL_VERSION, deviceId: input.deviceId, cursor: input.cursor, mutations },
  };
}

/** The structure of an answer, as the device reads it: a server that answers with something else is not trusted with the device's cursor. */
export function parseSyncResponse(input: unknown): SyncResponse | undefined {
  if (!isRecord(input) || input.v !== PROTOCOL_VERSION) return undefined;
  const { applied, refused, rows, cursor, more, mode, vaultVersion } = input;
  if (!Array.isArray(applied) || !Array.isArray(refused) || !Array.isArray(rows)) return undefined;
  if (typeof cursor !== 'number' || typeof more !== 'boolean') return undefined;
  if (mode !== 'normal' && mode !== 'offline') return undefined;
  if (vaultVersion !== null && typeof vaultVersion !== 'number') return undefined;
  const rowOk = (row: unknown): row is RowWire =>
    isRecord(row) &&
    isUuid(row.id) &&
    typeof row.version === 'number' &&
    typeof row.seq === 'number' &&
    typeof row.wrappedKey === 'string' &&
    (row.shape === null || typeof row.shape === 'string') &&
    (row.body === null || typeof row.body === 'string') &&
    (row.deletedAt === null || typeof row.deletedAt === 'number') &&
    typeof row.tier === 'string' &&
    typeof row.createdAt === 'number' &&
    typeof row.updatedAt === 'number';
  if (!rows.every(rowOk)) return undefined;
  for (const item of applied as unknown[])
    if (
      !isRecord(item) ||
      typeof item.mutationId !== 'string' ||
      typeof item.seq !== 'number' ||
      typeof item.version !== 'number'
    )
      return undefined;
  for (const item of refused as unknown[]) {
    if (!isRecord(item) || typeof item.mutationId !== 'string') return undefined;
    if (!(REFUSALS as readonly unknown[]).includes(item.code)) return undefined;
    if (item.current !== undefined && !rowOk(item.current)) return undefined;
  }
  return input as unknown as SyncResponse;
}
