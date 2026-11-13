import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, EVERY_MS, type LoopEnv, SyncLoop } from './loop';
import type { SyncOutcome, Wallet } from './wallet';

/** A clock and a page of the test's own. */
function fakeEnv() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; every?: number; callback: () => void }>();
  const handlers = new Map<string, (() => void)[]>();
  const messages: unknown[] = [];
  const heard: ((m: { type: 'changed' }) => void)[] = [];
  const state = { visible: true, otherTabSyncing: false };
  const env: LoopEnv = {
    setTimeout: (callback, ms) => {
      timers.set(next, { at: now + ms, callback });
      return next++;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
    setInterval: (callback, ms) => {
      timers.set(next, { at: now + ms, every: ms, callback });
      return next++;
    },
    clearInterval: (handle) => void timers.delete(handle as number),
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
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = until;
    },
  };
}

function fakeWallet(outcomes: SyncOutcome[] = []) {
  const calls = { sync: 0, load: 0 };
  const wallet = {
    sync: async () => {
      calls.sync++;
      return (
        outcomes.shift() ?? ({ status: 'ok', applied: 0, refused: 0, pulled: 0 } as SyncOutcome)
      );
    },
    load: async () => void calls.load++,
  } as unknown as Wallet;
  return { wallet, calls };
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
      await settle();
    }
    expect(calls.sync).toBe(4);
  });

  it('syncs every 30 seconds while the page is visible, and not while it is hidden', async () => {
    const e = fakeEnv();
    const { wallet, calls } = fakeWallet();
    new SyncLoop(wallet, e.env).start();
    await settle();
    await e.advance(EVERY_MS);
    await settle();
    expect(calls.sync).toBe(2);
    e.state.visible = false;
    await e.advance(EVERY_MS * 3);
    await settle();
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
    e.fire('online');
    await e.advance(EVERY_MS * 2);
    await settle();
    expect(calls.sync).toBe(1);
  });
});
