import { describe, expect, it } from 'vitest';
import { NOT_MOVING_FOR_MS, type SaltSource, cachedSalt } from './salt';

/** What the sign-in's salt document asks of the database, and when (src/auth/salt.ts). */
function source(over: { moving?: () => boolean; vaultId?: () => string } = {}) {
  const reads = { vaultId: 0, moving: 0 };
  let clock = 1_000_000;
  const world: SaltSource & { advance(ms: number): void } = {
    vaultId: async () => {
      reads.vaultId++;
      return (over.vaultId ?? (() => 'the-vault-id'))();
    },
    moving: async () => {
      reads.moving++;
      return (over.moving ?? (() => false))();
    },
    now: () => clock,
    advance: (ms) => void (clock += ms),
  };
  return { world, reads };
}

describe('the sign-in salt, as asked of the database', () => {
  it('reads the vault id once, however often it is asked for', async () => {
    const { world, reads } = source();
    const read = cachedSalt(world);
    for (let i = 0; i < 50; i++) expect((await read()).vaultId).toBe('the-vault-id');
    expect(reads.vaultId).toBe(1);
  });

  it('believes "no password can move" for a minute, and asks again after', async () => {
    const { world, reads } = source();
    const read = cachedSalt(world);
    for (let i = 0; i < 20; i++) expect((await read()).moving).toBe(false);
    expect(reads.moving).toBe(1);
    world.advance(NOT_MOVING_FOR_MS - 1);
    await read();
    expect(reads.moving).toBe(1);
    world.advance(2);
    await read();
    expect(reads.moving).toBe(2);
  });

  it('never keeps a "true": every ask while a window is open is a fresh read, so the page never sends a password it need not', async () => {
    let open = true;
    const { world, reads } = source({ moving: () => open });
    const read = cachedSalt(world);
    for (let i = 0; i < 5; i++) expect((await read()).moving).toBe(true);
    expect(reads.moving).toBe(5);
    // The last password moves: the next ask says so at once, and not a minute later.
    open = false;
    expect((await read()).moving).toBe(false);
  });

  it('notices a window that opens after a "false" was kept, when the minute has passed', async () => {
    let open = false;
    const { world } = source({ moving: () => open });
    const read = cachedSalt(world);
    expect((await read()).moving).toBe(false);
    open = true;
    world.advance(NOT_MOVING_FOR_MS + 1);
    expect((await read()).moving).toBe(true);
  });

  it('does not keep a failed read: the next ask tries again', async () => {
    let fail = true;
    const { world, reads } = source({
      vaultId: () => {
        if (fail) throw new Error('the database is not there');
        return 'the-vault-id';
      },
    });
    const read = cachedSalt(world);
    await expect(read()).rejects.toThrow('not there');
    fail = false;
    expect((await read()).vaultId).toBe('the-vault-id');
    expect(reads.vaultId).toBe(2);
  });
});
