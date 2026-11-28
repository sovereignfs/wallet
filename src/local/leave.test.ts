import 'fake-indexeddb/auto';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openLocal } from './db';
import { leaveDevice, unsentChanges } from './leave';

const named = () => `leave-${randomBytes(4).toString('hex')}`;
const stored = async () => (await indexedDB.databases()).map((db) => db.name);
const change = (entryId: string) => ({ mutation: { entryId }, base: null, queuedAt: 1 }) as never;

describe('leaving a device', () => {
  it('counts the changes the server has not taken: those waiting, and those it refused', async () => {
    const db = await openLocal('acct', named());
    expect(await unsentChanges(db)).toBe(0);
    await db.add('outbox', change('e1'));
    await db.put('refused', {
      entryId: 'e2',
      items: [change('e2'), change('e2')],
      code: 'invalid',
      at: 1,
    });
    expect(await unsentChanges(db)).toBe(3);
    db.close();
  });

  it('erases the store, or keeps it when the person says to', async () => {
    const [gone, kept] = [named(), named()];
    (await openLocal('acct', gone)).close();
    (await openLocal('acct', kept)).close();
    await leaveDevice('acct', { name: gone });
    await leaveDevice('acct', { name: kept, keepData: true });
    expect(await stored()).not.toContain(gone);
    expect(await stored()).toContain(kept);
  });
});
