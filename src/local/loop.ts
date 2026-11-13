import type { SyncOutcome, Wallet } from './wallet';

/**
 * The sync loop (DESIGN.md §11.3): **a person does not feel any of this.** It syncs a moment after a write (debounced), when the page loads, when it
 * comes back into view, when the connection comes back, every 30 seconds while the page is visible, and when the service worker says Background Sync
 * fired. **One tab at a time** (a Web Lock, where there is one), and a tab that did not sync is told by a `BroadcastChannel` that the store changed, so
 * that its screens show it. It runs while the wallet is locked, since the store is ciphertext. It stops being busy when the session has ended
 * (`unauthorized`), and keeps everything, so that signing in again picks up where it was.
 *
 * Everything it touches of the page is given, so that a test runs it with a clock of its own and no DOM.
 */
export interface LoopEnv {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly setInterval: (callback: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  /** Subscribe to the page's own events: `online`, `focus`, `visibilitychange`; returns the way to stop. */
  readonly on: (event: 'online' | 'focus' | 'visible', callback: () => void) => () => void;
  readonly visible: () => boolean;
  /** Runs `work` if no other tab is syncing this account, and returns whether it ran. */
  readonly exclusive: (work: () => Promise<void>) => Promise<boolean>;
  /** Messages between the tabs of one account. */
  readonly channel: {
    post(message: { type: 'changed' }): void;
    onMessage(callback: (message: { type: 'changed' }) => void): () => void;
  } | null;
}

export const DEBOUNCE_MS = 1_000;
export const EVERY_MS = 30_000;

export class SyncLoop {
  private readonly wallet: Wallet;
  private readonly env: LoopEnv;
  private debounce: unknown;
  private interval: unknown;
  private stops: (() => void)[] = [];
  private running = false;
  private again = false;
  private stopped = true;
  private ended = false;
  private readonly listeners = new Set<(outcome: SyncOutcome | { status: 'idle' }) => void>();
  /** The last thing that happened, for a screen that wants to say. */
  last: SyncOutcome | { status: 'idle' } = { status: 'idle' };

  constructor(wallet: Wallet, env: LoopEnv) {
    this.wallet = wallet;
    this.env = env;
  }

  onResult(listener: (outcome: SyncOutcome | { status: 'idle' }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.ended = false;
    this.stops = [
      this.env.on('online', () => this.now()),
      this.env.on('focus', () => this.now()),
      this.env.on('visible', () => this.now()),
      this.env.channel?.onMessage(() => void this.wallet.load()) ?? (() => undefined),
    ];
    this.interval = this.env.setInterval(() => {
      if (this.env.visible()) this.now();
    }, EVERY_MS);
    this.now();
  }

  stop(): void {
    this.stopped = true;
    this.env.clearTimeout(this.debounce);
    this.env.clearInterval(this.interval);
    for (const stop of this.stops.splice(0)) stop();
  }

  /** Something was written: sync in a moment, once for however many writes there are by then. */
  request(): void {
    if (this.stopped) return;
    this.env.channel?.post({ type: 'changed' });
    this.env.clearTimeout(this.debounce);
    this.debounce = this.env.setTimeout(() => this.now(), DEBOUNCE_MS);
  }

  /** Sync now, unless one is running (then once more when it ends). */
  now(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return Promise.resolve();
    }
    this.running = true;
    return (async () => {
      try {
        do {
          this.again = false;
          let outcome: SyncOutcome | undefined;
          const ran = await this.env.exclusive(async () => {
            outcome = await this.wallet.sync();
          });
          if (ran && outcome) {
            this.last = outcome;
            for (const listener of [...this.listeners]) listener(outcome);
            if (outcome.status === 'unauthorized') this.ended = true;
            if (outcome.status === 'ok' && (outcome.applied > 0 || outcome.pulled > 0))
              this.env.channel?.post({ type: 'changed' });
          }
        } while (this.again && !this.stopped && !this.ended);
      } finally {
        this.running = false;
      }
    })();
  }

  /** Whether the session has ended, so that the app says to sign in. */
  get sessionEnded(): boolean {
    return this.ended;
  }
}

/** The page's own environment, for the browser. */
export function browserEnv(accountId: string): LoopEnv {
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`wallet-data-${accountId}`);
  return {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    on(event, callback) {
      if (event === 'online') {
        window.addEventListener('online', callback);
        return () => window.removeEventListener('online', callback);
      }
      if (event === 'focus') {
        window.addEventListener('focus', callback);
        return () => window.removeEventListener('focus', callback);
      }
      const onVisible = () => {
        if (document.visibilityState === 'visible') callback();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    },
    visible: () => document.visibilityState === 'visible',
    async exclusive(work) {
      if (!('locks' in navigator)) {
        await work();
        return true;
      }
      return navigator.locks.request(
        `wallet-sync-${accountId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return false;
          await work();
          return true;
        },
      );
    },
    channel: channel
      ? {
          post: (message) => channel.postMessage(message),
          onMessage(callback) {
            const listener = (event: MessageEvent) => callback(event.data as { type: 'changed' });
            channel.addEventListener('message', listener);
            return () => channel.removeEventListener('message', listener);
          },
        }
      : null,
  };
}
