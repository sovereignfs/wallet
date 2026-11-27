import { afterEach, describe, expect, it } from 'vitest';
import { deriveEntryBytes, importRoot, newRoot } from '../core/vault';
import { suiteCipher } from '../keys/cipher';
import { type Channel, type Clock, Keyring, type LockReason } from './keyring';

/** A clock the test sets, and tabs that talk to each other through channels of the test's own. */
function fakeClock(): Clock & { advance(ms: number): void; sleep(ms: number): void } {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback, ms) => {
      timers.set(next, { at: now + ms, callback });
      return next++;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
    // Time passes and no timer runs, as for a page the system suspended: what was due stays due, as far ahead as it was.
    sleep(ms) {
      now += ms;
      for (const timer of timers.values()) timer.at += ms;
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = until;
    },
  };
}

function bus() {
  const channels: { listeners: ((event: { data: unknown }) => void)[] }[] = [];
  return (): Channel => {
    const me = { listeners: [] as ((event: { data: unknown }) => void)[] };
    channels.push(me);
    return {
      postMessage: (message) => {
        for (const other of channels)
          if (other !== me) for (const l of other.listeners) l({ data: message });
      },
      addEventListener: (_type, listener) => void me.listeners.push(listener as never),
      close: () => void channels.splice(channels.indexOf(me), 1),
    };
  };
}

const open: Keyring[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});

async function keyring(
  clock: Clock,
  channel: Channel | null = null,
  timers?: ConstructorParameters<typeof Keyring>[0]['timers'],
) {
  const k = new Keyring({
    accountId: 'acct',
    clock,
    channel,
    cipher: suiteCipher,
    ...(timers ? { timers } : {}),
  });
  open.push(k);
  return k;
}
/** A root as the keyring is given one: a key that can only derive, and the epoch it is of. */
const vault = async () => ({ key: await importRoot(newRoot()), epoch: 1 });

describe('the keyring', () => {
  it('is locked until it is given a root, and then holds it as a key that cannot be read', async () => {
    const k = await keyring(fakeClock());
    expect(k.state).toBe('locked');
    expect(() => k.epoch).toThrow();
    const root = await vault();
    k.unlock(root);
    expect(k.state).toBe('unlocked');
    expect(k.epoch).toBe(1);
    expect(root.key.extractable).toBe(false);
  });

  it('derives an entry’s key once, keeps it until it locks, and refuses to while locked', async () => {
    const k = await keyring(fakeClock());
    const root = await vault();
    k.unlock(root);
    const a = await k.entryKey('e1', 1);
    expect(await k.entryKey('e1', 1)).toBe(a);
    expect(a.extractable).toBe(false);
    // Another entry's key is another key, and the same entry's is the same bytes every time.
    expect(await k.entryKey('e2', 1)).not.toBe(a);
    expect((await deriveEntryBytes(root.key, 'acct', 'e1')).length).toBe(32);
    k.lock();
    await expect(k.entryKey('e1', 1)).rejects.toThrow('locked');
  });

  it('opens only the epoch it holds the root of', async () => {
    const k = await keyring(fakeClock());
    k.unlock(await vault());
    await expect(k.entryKey('e1', 2)).rejects.toThrow('epoch');
  });

  it('locks after the idle time, at 5 minutes by default, and any use starts the time again', async () => {
    const clock = fakeClock();
    const k = await keyring(clock);
    const reasons: (LockReason | undefined)[] = [];
    k.subscribe((state, reason) => state === 'locked' && reasons.push(reason));
    k.unlock(await vault());
    clock.advance(4 * 60_000);
    expect(k.state).toBe('unlocked');
    k.touch();
    clock.advance(4 * 60_000);
    expect(k.state).toBe('unlocked');
    clock.advance(60_000);
    expect(k.state).toBe('locked');
    expect(reasons).toEqual(['idle']);
  });

  it.each([1, 15, 60] as const)(
    'locks at the idle time a person chose: %i minutes',
    async (minutes) => {
      const clock = fakeClock();
      const k = await keyring(clock, null, { idleMinutes: minutes, hidden: 'never' });
      k.unlock(await vault());
      clock.advance(minutes * 60_000 - 1);
      expect(k.state).toBe('unlocked');
      clock.advance(1);
      expect(k.state).toBe('locked');
    },
  );

  it('locks when hidden: at once, after a minute, or never, as chosen, and not when it comes back in time', async () => {
    for (const [hidden, after] of [
      ['now', 0],
      ['1m', 60_000],
      ['never', Infinity],
    ] as const) {
      const clock = fakeClock();
      const k = await keyring(clock, null, { idleMinutes: 60, hidden });
      k.unlock(await vault());
      k.setHidden(true);
      if (after === 0) expect(k.state, hidden).toBe('locked');
      else if (after === Infinity) {
        clock.advance(30 * 60_000);
        expect(k.state, hidden).toBe('unlocked');
      } else {
        clock.advance(after - 1);
        expect(k.state, hidden).toBe('unlocked');
        clock.advance(1);
        expect(k.state, hidden).toBe('locked');
      }
    }
    const clock = fakeClock();
    const k = await keyring(clock, null, { idleMinutes: 60, hidden: '1m' });
    k.unlock(await vault());
    k.setHidden(true);
    clock.advance(59_000);
    k.setHidden(false);
    clock.advance(10 * 60_000);
    expect(k.state).toBe('unlocked');
  });

  it('tells everything that holds something opened, with the reason, and drops its keys', async () => {
    const k = await keyring(fakeClock());
    const seen: string[] = [];
    k.subscribe((state, reason) => seen.push(`${state}${reason ? `:${reason}` : ''}`));
    k.unlock(await vault());
    k.lock('manual');
    k.lock('manual');
    expect(seen).toEqual(['unlocked', 'locked:manual']);
    expect(() => k.epoch).toThrow();
  });

  it('locks and unlocks every tab of the account together', async () => {
    const make = bus();
    const clock = fakeClock();
    const one = await keyring(clock, make());
    const two = await keyring(clock, make());
    expect([one.state, two.state]).toEqual(['locked', 'locked']);
    one.unlock(await vault());
    expect([one.state, two.state]).toEqual(['unlocked', 'unlocked']);
    expect(two.epoch).toBe(1);
    two.lock();
    expect([one.state, two.state]).toEqual(['locked', 'locked']);
  });

  it('lets in a tab that opens while another is unlocked', async () => {
    const make = bus();
    const clock = fakeClock();
    const one = await keyring(clock, make());
    one.unlock(await vault());
    const late = await keyring(clock, make());
    expect(late.state).toBe('unlocked');
  });

  it('restarts the idle time when the timers are changed', async () => {
    const clock = fakeClock();
    const k = await keyring(clock);
    k.unlock(await vault());
    k.setTimers({ idleMinutes: 1, hidden: 'never' });
    clock.advance(60_000);
    expect(k.state).toBe('locked');
  });

  /** An unlocked keyring on a clock, and the reasons it was locked for. */
  async function watched(timers?: ConstructorParameters<typeof Keyring>[0]['timers']) {
    const clock = fakeClock();
    const k = await keyring(clock, null, timers);
    const reasons: (LockReason | undefined)[] = [];
    k.subscribe((state, reason) => state === 'locked' && reasons.push(reason));
    k.unlock(await vault());
    return { clock, k, reasons };
  }

  it('locks a page that slept while hidden, as soon as it is shown', async () => {
    const { clock, k, reasons } = await watched();
    k.setHidden(true);
    clock.sleep(60 * 60_000);
    k.setHidden(false);
    expect(k.state).toBe('locked');
    expect(reasons).toEqual(['hidden']);
  });

  it('locks a page that slept past its idle time, at the first touch', async () => {
    const { clock, k, reasons } = await watched();
    clock.sleep(5 * 60_000);
    k.touch();
    expect(k.state).toBe('locked');
    expect(reasons).toEqual(['idle']);
  });

  it('locks a page that slept in view and is told nothing, within a second of running again', async () => {
    const { clock, k, reasons } = await watched();
    clock.sleep(60 * 60_000);
    clock.advance(1_000);
    expect(k.state).toBe('locked');
    expect(reasons).toEqual(['idle']);
  });

  it('keeps a page open that slept for less than its times', async () => {
    const hidden = await watched();
    hidden.k.setHidden(true);
    hidden.clock.sleep(59_000);
    hidden.k.setHidden(false);
    expect(hidden.k.state).toBe('unlocked');
    const idle = await watched();
    idle.clock.sleep(4 * 60_000);
    idle.k.touch();
    idle.clock.advance(4 * 60_000);
    expect(idle.k.state).toBe('unlocked');
  });

  it('does not count time hidden against a page whose person chose never to lock for it', async () => {
    const { clock, k } = await watched({ idleMinutes: 60, hidden: 'never' });
    k.setHidden(true);
    clock.sleep(30 * 60_000);
    k.setHidden(false);
    expect(k.state).toBe('unlocked');
  });

  it('does not count time hidden before it was unlocked, by another tab, against a hidden page', async () => {
    const make = bus();
    const clock = fakeClock();
    const front = await keyring(clock, make());
    const back = await keyring(clock, make());
    back.setHidden(true);
    clock.advance(10 * 60_000);
    front.unlock(await vault());
    clock.advance(2_000);
    expect([front.state, back.state]).toEqual(['unlocked', 'unlocked']);
  });

  it('locks when the clock was set back, since it cannot say how long has passed', async () => {
    const { clock, k } = await watched();
    clock.sleep(-60_000);
    k.touch();
    expect(k.state).toBe('locked');
  });

  it('gives no root to a new tab from a page that slept past its times', async () => {
    const make = bus();
    const clock = fakeClock();
    const slept = await keyring(clock, make());
    slept.unlock(await vault());
    clock.sleep(60 * 60_000);
    const late = await keyring(clock, make());
    expect([late.state, slept.state]).toEqual(['locked', 'locked']);
  });
});
