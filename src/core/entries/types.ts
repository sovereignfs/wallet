/**
 * What an entry is (DESIGN.md §10). **The kind of an entry is in its sealed shape and in no column** (AGENTS.md): the server sees a tier, a version and
 * sizes, and cannot tell a passport from a loyalty card. Every kind declares its shape and body here, in `src/core/entries/`, and validates both
 * before they are sealed, so the browser never seals what it could not open again.
 */
export const TIERS = ['device', 'synced', 'server'] as const;
/** Where an entry lives (DESIGN.md §10.2): `device` is "This device only", `synced` is "Synced", `server` is "Online only". */
export type Tier = (typeof TIERS)[number];

/** The tiers that exist in 0.1.0. The others are in the format and refused by the server (`tier_unavailable`) until they are built. */
export const AVAILABLE_TIERS: readonly Tier[] = ['synced'];

/** The kinds that exist in 0.1.0 (DESIGN.md §10.1). */
export const KINDS = ['card', 'settings'] as const;
export type Kind = (typeof KINDS)[number];

/** A shape begins with these two fields, whatever the kind, so that a reader can tell what it holds before it reads the rest. */
export interface ShapeBase {
  readonly v: 1;
  readonly kind: Kind;
}

/** The reasons a model is refused, as sentences a person can read. */
export interface Invalid {
  readonly ok: false;
  readonly reason: string;
}

export type Checked<T> = { readonly ok: true; readonly value: T } | Invalid;

export const invalid = (reason: string): Invalid => ({ ok: false, reason });

/** An entry's id and every other id the device makes: a version 4 UUID, in lower case. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, most: number): string | undefined {
  return typeof value === 'string' && value.length <= most ? value : undefined;
}
