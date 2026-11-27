import 'fake-indexeddb/auto';
import { randomBytes } from 'node:crypto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { LOCAL_VERSION, eraseLocal, openLocal } from './db';

/** A device store as 0.1.x made it (version 1): sealed entries under a vault key, a wrapper for it, and a cursor. */
async function version1(name: string) {
  const db = await openDB(name, 1, {
    upgrade(upgrading) {
      upgrading.createObjectStore('meta');
      upgrading.createObjectStore('unlock', { keyPath: 'id' });
      upgrading.createObjectStore('entries', { keyPath: 'id' });
      const outbox = upgrading.createObjectStore('outbox', { autoIncrement: true, keyPath: 'n' });
      outbox.createIndex('byEntry', 'mutation.entryId');
      upgrading.createObjectStore('refused', { keyPath: 'entryId' });
      upgrading.createObjectStore('local');
    },
  });
  await db.put('meta', 'device-id', 'deviceId');
  await db.put('meta', 41, 'cursor');
  await db.put('meta', { version: 1, header: 'age…' }, 'vault');
  await db.put('unlock', { id: 'w1', kind: 'passcode', vaultKeyId: 'AAAA' });
  await db.put('entries', { id: 'e1', wrappedKey: 'AAAA', shape: 'AAAA' });
  await db.add('outbox', { mutation: { entryId: 'e1' } });
  await db.put('refused', { entryId: 'e2' });
  await db.put('local', { idleMinutes: 15 }, 'lockTimers');
  db.close();
}

describe('the device store', () => {
  it('is at version 2', () => {
    expect(LOCAL_VERSION).toBe(2);
  });

  it('starts clean from 0.1.x’s: what it held cannot be opened and is let go, and the device keeps its id and settings', async () => {
    const name = `upgrade-${randomBytes(4).toString('hex')}`;
    await version1(name);
    const db = await openLocal('acct', name);
    expect(await db.getAll('entries')).toEqual([]);
    expect(await db.getAll('outbox')).toEqual([]);
    expect(await db.getAll('refused')).toEqual([]);
    // A wrapper of a vault key means nothing to a keyring root, so it goes: the device asks for the suite's key again.
    expect(await db.getAll('unlock')).toEqual([]);
    expect(await db.get('meta', 'cursor')).toBeUndefined();
    expect(await db.get('meta', 'vault')).toBeUndefined();
    expect(await db.get('meta', 'deviceId')).toBe('device-id');
    expect(await db.get('local', 'lockTimers')).toEqual({ idleMinutes: 15 });
    db.close();
  });

  it('lets go when it is to be erased, so that a tab that has it open does not hold that up', async () => {
    const name = `erase-${randomBytes(4).toString('hex')}`;
    let told = 0;
    const held = await openLocal('acct', name, { onErased: () => (told += 1) });
    await held.put('meta', 'device-id', 'deviceId');
    // With the connection held, the deletion would wait for it, and never be made.
    await eraseLocal('acct', name);
    expect(told).toBe(1);
    expect((await indexedDB.databases()).map((db) => db.name)).not.toContain(name);
  }, 5_000);

  it('keeps what a store of this version holds when it is opened again', async () => {
    const name = `again-${randomBytes(4).toString('hex')}`;
    const first = await openLocal('acct', name);
    await first.put('unlock', {
      id: 'w1',
      kind: 'passcode',
      label: 'x',
      createdAt: 1,
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array(48),
      epoch: 1,
    });
    first.close();
    const second = await openLocal('acct', name);
    expect(await second.getAll('unlock')).toHaveLength(1);
    second.close();
  });
});
