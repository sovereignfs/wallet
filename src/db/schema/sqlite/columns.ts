import { blob, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * The column vocabulary every table is written in, so that a kind of value has one representation on both dialects (DESIGN.md §22.2).
 * `schema/postgres/columns.ts` exports the same names; the schema parity test keeps the two in step. A table names these and never a
 * dialect's own type.
 *
 * - `id`        a row's key: text, a UUID made by the client (§8.2).
 * - `ref`       a reference to another table's `id`: the same text, not a key itself.
 * - `epochMs`   a point in time as milliseconds since the epoch, a JS number: no time zones, no Date parsing, the same on both dialects.
 * - `counter`   a 64-bit whole number that is a JS number: a sequence, a count.
 * - `bool`      a boolean. SQLite stores 0 and 1, and reads it back as a JS boolean through the driver's mode; PostgreSQL has a boolean.
 * - `binary`    sealed bytes, opaque to the server (`blob` on SQLite, `bytea` on PostgreSQL), a Node `Buffer` in both (§29.2).
 */
export const id = (name: string) => text(name).primaryKey();

export const ref = (name: string) => text(name);

export const epochMs = (name: string) => integer(name, { mode: 'number' });

export const counter = (name: string) => integer(name, { mode: 'number' });

export const bool = (name: string) => integer(name, { mode: 'boolean' });

export const binary = (name: string) => blob(name, { mode: 'buffer' });
