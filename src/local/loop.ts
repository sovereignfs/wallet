import type { SyncOutcome, Wallet } from './wallet';

/**
 * The sync loop (DESIGN.md §11.3): **a person does not feel any of this, and an idle wallet says nothing to its server.** It syncs when there is a reason to:
 * a moment after a write (debounced), when the page loads, when a person comes back to it, when the connection comes back, at an unlock if the last sync is
 * not recent, and when the service worker says Background Sync fired and something waits. **Nothing runs by the clock** but a second try after an attempt that
 * did not get through, less often each time, while the page is seen. **One tab at a time** (a Web Lock, where there is one), and a tab that did not sync is
 * told by a `BroadcastChannel` that the store changed, so that its screens show it. It runs while the wallet is locked, since the store is ciphertext. It
 * stops being busy when the session has ended (`unauthorized`), and keeps everything, so that signing in again picks up where it was.
 *
 * Everything it touches of the page is given, so that a test runs it with a clock of its own and no DOM.
 */
export interface LoopEnv {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Subscribe to the page's own events: `online`, `focus`, `visible`, and `woken` (Background Sync, by way of the service worker); returns the way to stop. */
  readonly on: (
    event: 'online' | 'focus' | 'visible' | 'woken',
    callback: () => void,
  ) => () => void;
  readonly visible: () => boolean;
  /** Runs `work` if no other tab is syncing this account, and returns whether it ran. */
  readonly exclusive: (work: () => Promise<void>) => Promise<boolean>;
  /** Messages between the tabs of one account. */
  readonly channel: {
    post(message: { type: 'changed' }): void;
    onMessage(callback: (message: { type: 'changed' }) => void): () => void;
  } | null;
}

/** A write is sent this long after the last one. */
export const DEBOUNCE_MS = 1_000;
/** Events that come together make one sync: coming back to a tab is both `visible` and `focus`. */
export const EVENT_MS = 200;
/** After an attempt that did not get through: this long, then twice as long each time, up to the most. */
export const RETRY_MS = 30_000;
export const RETRY_MOST_MS = 5 * 60_000;
/** Another tab was syncing: this soon after, a change it may not have taken is looked for. */
export const BUSY_MS = 2_000;
/** A sync this recent is recent enough at an unlock. */
export const FRESH_MS = 30_000;
/** What the service worker says to the pages when Background Sync fires (`src/sw/source.ts`). */
const WOKEN = 'wallet-sync';

export class SyncLoop {
  private readonly wallet: Wallet;
  private readonly env: LoopEnv;
  /** The sync that is about to happen, for the events and writes that asked for one. */
  private soon: unknown;
  /** The second try, after an attempt that did not get through or found another tab busy. */
  private later: unknown;
  private wait = RETRY_MS;
  private through: number | undefined;
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
      this.env.on('online', () => this.syncIn(EVENT_MS)),
      this.env.on('focus', () => this.syncIn(EVENT_MS)),
      this.env.on('visible', () => this.syncIn(EVENT_MS)),
      // Background Sync is there to send what waits. It also fires just after a write made online, which the debounce then covers.
      this.env.on('woken', () => void this.ifUnsent(() => this.syncIn(DEBOUNCE_MS))),
      this.env.channel?.onMessage(() => void this.wallet.load()) ?? (() => undefined),
    ];
    void this.now();
  }

  stop(): void {
    this.stopped = true;
    this.env.clearTimeout(this.soon);
    this.env.clearTimeout(this.later);
    for (const stop of this.stops.splice(0)) stop();
  }

  /** Something was written: sync in a moment, once for however many writes there are by then. */
  request(): void {
    if (this.stopped) return;
    this.env.channel?.post({ type: 'changed' });
    this.syncIn(DEBOUNCE_MS);
  }

  /** The wallet was unlocked, perhaps long after the page was last returned to: sync, unless one is under way or has just got through. */
  catchUp(): void {
    if (this.running) return;
    if (this.through !== undefined && this.env.now() - this.through < FRESH_MS) return;
    this.syncIn(EVENT_MS);
  }

  /** Sync now, unless one is running (then once more when it ends). */
  now(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    // This one covers whatever was about to be asked for.
    this.env.clearTimeout(this.soon);
    if (this.running) {
      this.again = true;
      return Promise.resolve();
    }
    this.running = true;
    this.env.clearTimeout(this.later);
    return (async () => {
      // What is to be done afterwards. An attempt that throws did not get through.
      let then: 'nothing' | 'retry' | 'look' = 'retry';
      try {
        do {
          this.again = false;
          let outcome: SyncOutcome | undefined;
          const ran = await this.env.exclusive(async () => {
            outcome = await this.wallet.sync();
          });
          if (!ran) then = 'look';
          if (ran && outcome) {
            this.last = outcome;
            for (const listener of [...this.listeners]) listener(outcome);
            if (outcome.status === 'unauthorized') this.ended = true;
            if (outcome.status === 'ok') {
              this.through = this.env.now();
              this.wait = RETRY_MS;
              if (outcome.applied > 0 || outcome.pulled > 0)
                this.env.channel?.post({ type: 'changed' });
            }
            then =
              outcome.status === 'offline' || outcome.status === 'failed' ? 'retry' : 'nothing';
          }
        } while (this.again && !this.stopped && !this.ended);
      } finally {
        this.running = false;
        if (!this.stopped && then === 'retry') this.retry();
        if (!this.stopped && then === 'look') this.look();
      }
    })();
  }

  private syncIn(ms: number): void {
    if (this.stopped) return;
    this.env.clearTimeout(this.soon);
    this.soon = this.env.setTimeout(() => void this.now(), ms);
  }

  /** Again later, less often each time. A hidden page does not try by the clock: coming back to it syncs anyway. */
  private retry(): void {
    this.later = this.env.setTimeout(() => {
      if (this.env.visible()) void this.now();
    }, this.wait);
    this.wait = Math.min(this.wait * 2, RETRY_MOST_MS);
  }

  /** Another tab was syncing, and may have read the outbox before this tab's change was in it. */
  private look(): void {
    this.later = this.env.setTimeout(() => void this.ifUnsent(() => void this.now()), BUSY_MS);
  }

  private async ifUnsent(act: () => void): Promise<void> {
    if ((await this.wallet.unsentCount()) > 0 && !this.stopped) act();
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
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    on(event, callback) {
      if (event === 'woken') {
        // No service worker (a context that is not secure, a browser without one) means nothing wakes the page.
        const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
        if (!worker) return () => undefined;
        const heard = (message: Event) => {
          const data = (message as MessageEvent).data as { type?: unknown } | null;
          if (data?.type === WOKEN) callback();
        };
        worker.addEventListener('message', heard);
        // What the worker says is held back until the page asks for it, or has finished loading.
        worker.startMessages?.();
        return () => worker.removeEventListener('message', heard);
      }
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
