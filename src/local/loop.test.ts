import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUSY_MS,
  DEBOUNCE_MS,
  EVENT_MS,
  FRESH_MS,
  type LoopEnv,
  RETRY_MOST_MS,
  RETRY_MS,
  SyncLoop,
  browserEnv,
} from './loop';
import type { SyncOutcome, Wallet } from './wallet';

/** A clock and a page of the test's own. */
function fakeEnv() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const handlers = new Map<string, (() => void)[]>();
  const messages: unknown[] = [];
  const heard: ((m: { type: 'changed' }) => void)[] = [];
  const state = { visible: true, otherTabSyncing: false };
  const env: LoopEnv = {
    now: () => now,
    setTimeout: (callback, ms) => {
      timers.set(next, { at: now + ms, callback });
      return next++;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
    on: (event, callback) => {
      handlers.set(event, [...(handlers.get(event) ?? []), callback]);
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((c) => c !== callback),
        );
    },
    visible: () => state.visible,
    exclusive: async (work) => {
      if (state.otherTabSyncing) return false;
      await work();
      return true;
    },
    channel: {
      post: (m) => void messages.push(m),
      onMessage: (callback) => {
        heard.push(callback);
        return () => void heard.splice(heard.indexOf(callback), 1);
      },
    },
  };
  return {
    env,
    state,
    messages,
    heard,
    fire: (event: string) => (handlers.get(event) ?? []).forEach((c) => c()),
    async advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        timers.delete(id);
        timer.callback();
        await settle();
      }
      now = until;
      // What was started by an event, with no timer of its own, finishes too.
      await settle();
    },
  };
}

function fakeWallet(outcomes: SyncOutcome[] = []) {
  const calls = { sync: 0, load: 0 };
  const outbox = { unsent: 0 };
  const wallet = {
    sync: async () => {
      calls.sync++;
      return (
        outcomes.shift() ?? ({ status: 'ok', applied: 0, refused: 0, pulled: 0 } as SyncOutcome)
      );
    },
    load: async () => void calls.load++,
    unsentCount: async () => outbox.unsent,
  } as unknown as Wallet;
  return { wallet, calls, outbox };
}

const HOUR = 60 * 60_000;
const failures = (n: number): SyncOutcome[] =>
  Array.from({ length: n }, () => ({ status: 'failed' }));

/** A loop that has started and made its first request. */
async function started(outcomes: SyncOutcome[] = []) {
  const e = fakeEnv();
  const w = fakeWallet(outcomes);
  const loop = new SyncLoop(w.wallet, e.env);
  loop.start();
  await settle();
  return { e, loop, ...w };
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the sync loop', () => {
  it('syncs once when it starts', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    new SyncLoop(wallet, e.env).start();
    await settle();
    expect(calls.sync).toBe(1);
  });

  it('syncs once for however many writes there are within the debounce', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    const loop = new SyncLoop(wallet, e.env);
    loop.start();
    await settle();
    for (let i = 0; i < 5; i++) {
      loop.request();
      await e.advance(DEBOUNCE_MS / 4);
    }
    expect(calls.sync).toBe(1);
    await e.advance(DEBOUNCE_MS);
    await settle();
    expect(calls.sync).toBe(2);
  });

  it('syncs when the connection comes back, when the page is focused, and when it becomes visible', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    new SyncLoop(wallet, e.env).start();
    await settle();
    for (const event of ['online', 'focus', 'visible']) {
      e.fire(event);
      await e.advance(EVENT_MS);
    }
    expect(calls.sync).toBe(4);
  });

  it('asks nothing while there is nothing to do', async () => {
    const { e, calls } = await started();
    await e.advance(HOUR);
    expect(calls.sync).toBe(1);
  });

  it('asks once when a person comes back, though the page says so twice', async () => {
    const { e, calls } = await started();
    e.fire('visible');
    e.fire('focus');
    await e.advance(EVENT_MS * 5);
    expect(calls.sync).toBe(2);
  });

  it('tries again after an attempt that did not get through, less often each time, until one does', async () => {
    const { e, calls } = await started([
      { status: 'offline' },
      { status: 'failed' },
      { status: 'offline' },
    ]);
    for (const [tries, wait] of [RETRY_MS, RETRY_MS * 2, RETRY_MS * 4].entries()) {
      await e.advance(wait - 1);
      expect(calls.sync).toBe(tries + 1);
      await e.advance(1);
      expect(calls.sync).toBe(tries + 2);
    }
    await e.advance(HOUR);
    expect(calls.sync).toBe(4);
  });

  it('never waits longer than five minutes to try again, and starts short again after a success', async () => {
    const outcomes = failures(40);
    const { e, calls, loop } = await started(outcomes);
    await e.advance(HOUR);
    const before = calls.sync;
    await e.advance(RETRY_MOST_MS);
    expect(RETRY_MOST_MS).toBe(5 * 60_000);
    expect(calls.sync).toBe(before + 1);
    outcomes.length = 0;
    await loop.now();
    outcomes.push({ status: 'failed' });
    await loop.now();
    const again = calls.sync;
    await e.advance(RETRY_MS);
    expect(calls.sync).toBe(again + 1);
  });

  it.each(['unauthorized', 'update'] as const)('does not try again after %s', async (status) => {
    const { e, calls } = await started([{ status }]);
    await e.advance(HOUR);
    expect(calls.sync).toBe(1);
  });

  it('does not try again by itself while the page is hidden, and does when it is seen', async () => {
    const { e, calls } = await started([{ status: 'failed' }]);
    e.state.visible = false;
    await e.advance(HOUR);
    expect(calls.sync).toBe(1);
    e.state.visible = true;
    e.fire('visible');
    await e.advance(EVENT_MS);
    expect(calls.sync).toBe(2);
  });

  it('sends a change that another tab’s sync may have missed', async () => {
    const e = fakeEnv();
    const { wallet, calls, outbox } = fakeWallet();
    const loop = new SyncLoop(wallet, e.env);
    e.state.otherTabSyncing = true;
    loop.start();
    outbox.unsent = 1;
    loop.request();
    await e.advance(DEBOUNCE_MS);
    expect(calls.sync).toBe(0);
    e.state.otherTabSyncing = false;
    await e.advance(BUSY_MS);
    expect(calls.sync).toBe(1);
    await e.advance(HOUR);
    expect(calls.sync).toBe(1);
  });

  it('asks nothing after another tab’s sync when nothing waits', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    e.state.otherTabSyncing = true;
    new SyncLoop(wallet, e.env).start();
    await settle();
    e.state.otherTabSyncing = false;
    await e.advance(HOUR);
    expect(calls.sync).toBe(0);
  });

  it('wakes for Background Sync only when something waits, and sends it once', async () => {
    const { e, loop, calls, outbox } = await started();
    e.fire('woken');
    await settle();
    await e.advance(DEBOUNCE_MS);
    expect(calls.sync).toBe(1);
    outbox.unsent = 1;
    loop.request();
    e.fire('woken');
    await settle();
    await e.advance(DEBOUNCE_MS * 2);
    expect(calls.sync).toBe(2);
    // Woken later, with the page just sitting there: what waits is sent.
    e.fire('woken');
    await settle();
    await e.advance(DEBOUNCE_MS);
    expect(calls.sync).toBe(3);
  });

  it('catches up at an unlock only when the last sync is not recent', async () => {
    const { e, loop, calls } = await started();
    loop.catchUp();
    await e.advance(EVENT_MS);
    expect(calls.sync).toBe(1);
    await e.advance(FRESH_MS);
    loop.catchUp();
    await e.advance(EVENT_MS);
    expect(calls.sync).toBe(2);
  });

  it('leaves the sync to another tab that is syncing, and tells the other tabs when it changed something', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet([{ status: 'ok', applied: 1, refused: 0, pulled: 2 }]);
    const loop = new SyncLoop(wallet, e.env);
    e.state.otherTabSyncing = true;
    loop.start();
    await settle();
    expect(calls.sync).toBe(0);
    e.state.otherTabSyncing = false;
    await loop.now();
    expect(calls.sync).toBe(1);
    expect(e.messages).toContainEqual({ type: 'changed' });
  });

  it('reloads its screens when another tab says the store changed', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    new SyncLoop(wallet, e.env).start();
    await settle();
    e.heard.forEach((h) => h({ type: 'changed' }));
    expect(calls.load).toBe(1);
  });

  it('syncs once more when asked during a sync, and not twice at once', async () => {
    const e = fakeEnv();
    let resolve: () => void = () => undefined;
    let running = 0;
    let most = 0;
    let syncs = 0;
    const wallet = {
      sync: () =>
        new Promise<SyncOutcome>((done) => {
          running++;
          syncs++;
          most = Math.max(most, running);
          resolve = () => {
            running--;
            done({ status: 'ok', applied: 0, refused: 0, pulled: 0 });
          };
        }),
      load: async () => undefined,
    } as unknown as Wallet;
    const loop = new SyncLoop(wallet, e.env);
    loop.start();
    await settle();
    void loop.now();
    void loop.now();
    resolve();
    await settle();
    resolve();
    await settle();
    expect(most).toBe(1);
    expect(syncs).toBe(2);
  });

  it('says the session ended, stops asking while it has, and goes on after start', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet([{ status: 'unauthorized' }]);
    const loop = new SyncLoop(wallet, e.env);
    loop.start();
    await settle();
    expect(loop.sessionEnded).toBe(true);
    expect(loop.last).toEqual({ status: 'unauthorized' });
    expect(calls.sync).toBe(1);
  });

  it('does nothing once stopped', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    const loop = new SyncLoop(wallet, e.env);
    loop.start();
    await settle();
    loop.stop();
    loop.request();
    loop.catchUp();
    e.fire('online');
    await e.advance(HOUR);
    await settle();
    expect(calls.sync).toBe(1);
  });
});

describe('the page’s own events', () => {
  afterEach(() => void vi.unstubAllGlobals());

  it('hear the service worker wake the page for Background Sync, and nothing else it says', () => {
    const worker = new EventTarget();
    vi.stubGlobal('navigator', { serviceWorker: worker });
    vi.stubGlobal('BroadcastChannel', undefined);
    const woken = vi.fn();
    const stop = browserEnv('an-account').on('woken', woken);
    const say = (data: unknown) => worker.dispatchEvent(new MessageEvent('message', { data }));
    say({ type: 'wallet-sync' });
    say({ type: 'something-else' });
    say(null);
    expect(woken).toHaveBeenCalledTimes(1);
    stop();
    say({ type: 'wallet-sync' });
    expect(woken).toHaveBeenCalledTimes(1);
  });
});
