import { bigint, boolean, customType, text } from 'drizzle-orm/pg-core';

/**
 * The same column vocabulary as `schema/sqlite/columns.ts`; see there. PostgreSQL returns `bigint` as a string unless it is told a mode, so
 * every 64-bit column declares `mode: 'number'` (and the client parses `int8` the same way for raw SQL).
 */
export const id = (name: string) => text(name).primaryKey();

export const ref = (name: string) => text(name);

export const epochMs = (name: string) => bigint(name, { mode: 'number' });

export const counter = (name: string) => bigint(name, { mode: 'number' });

export const bool = (name: string) => boolean(name);

/** `bytea`, which `pg` returns as a `Buffer`, as the SQLite `blob` does in buffer mode. */
export const binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
