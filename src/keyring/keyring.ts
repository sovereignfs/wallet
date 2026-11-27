import { type SuiteCipher, deriveEntryKey } from '../core/vault';

/**
 * The keyring (DESIGN.md §9.1, §9.2): the keys the browser holds while the wallet is unlocked, and nothing else. **The suite's key is not kept here:** it opens the
 * wrapped root and is forgotten (or the device's wrapper opens it). What is held is the root and, as they are used, entry keys derived from it, all
 * non-extractable `CryptoKey`s, in memory only.
 * Locking drops them and tells everything that holds something opened (the in-memory index, decrypted object URLs, the screens) to drop it too.
 *
 * It locks after a time without use, when the app is hidden, by hand, at sign-out, and in every tab at once (a `BroadcastChannel`: unlocking in one tab
 * unlocks the others, locking locks them; a `CryptoKey` crosses between tabs of one origin without becoming readable). **Sync runs while locked,** since
 * the store holds ciphertext only.
 *
 * The clock and the channel are given, so that a test sets the time and has two tabs in one process.
 */
export type LockReason = 'manual' | 'idle' | 'hidden' | 'sign-out' | 'other-tab' | 'attempts';

export type KeyringState = 'locked' | 'unlocked';

/** When to lock for being unused, in minutes. */
export const IDLE_CHOICES = [1, 5, 15, 60] as const;
export type IdleMinutes = (typeof IDLE_CHOICES)[number];
/** When to lock for being hidden: at once, after a minute, or never. */
export type HiddenLock = 'now' | '1m' | 'never';

export interface LockTimers {
  readonly idleMinutes: IdleMinutes;
  readonly hidden: HiddenLock;
}

/** DESIGN.md §9.2: 5 minutes of no use, and 1 minute hidden, unless the person chose otherwise on this device. */
export const DEFAULT_TIMERS: LockTimers = { idleMinutes: 5, hidden: '1m' };

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The keyring root as a device holds it while unlocked: a non-extractable key that can only derive, and the epoch it is of. */
export interface Root {
  readonly key: CryptoKey;
  readonly epoch: number;
}

/** What crosses between tabs. The root is a non-extractable `CryptoKey`, which structured clone carries without making it readable. */
type Message =
  | { readonly type: 'lock' }
  | { readonly type: 'unlock'; readonly key: CryptoKey; readonly epoch: number }
  | { readonly type: 'hello' };

/** The part of `BroadcastChannel` the keyring uses. */
export interface Channel {
  postMessage(message: Message): void;
  addEventListener(type: 'message', listener: (event: { data: Message }) => void): void;
  close(): void;
}

export interface KeyringOptions {
  readonly accountId: string;
  readonly clock?: Clock;
  readonly timers?: LockTimers;
  readonly channel?: Channel | null;
  /** The suite's cipher an entry's key is imported with (`src/keys/cipher.ts`). */
  readonly cipher: SuiteCipher;
}

export class Keyring {
  readonly accountId: string;
  private readonly clock: Clock;
  private readonly channel: Channel | null;
  private timers: LockTimers;
  private readonly cipher: SuiteCipher;
  private root: Root | undefined;
  private cache = new Map<string, Promise<CryptoKey>>();
  private readonly listeners = new Set<(state: KeyringState, reason?: LockReason) => void>();
  private idle: unknown;
  private away: unknown;

  constructor(options: KeyringOptions) {
    this.accountId = options.accountId;
    this.cipher = options.cipher;
    this.clock = options.clock ?? realClock;
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.channel =
      options.channel === undefined
        ? typeof BroadcastChannel === 'undefined'
          ? null
          : (new BroadcastChannel(`wallet-lock-${options.accountId}`) as unknown as Channel)
        : options.channel;
    this.channel?.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'lock') this.lockLocally('other-tab');
      else if (message.type === 'unlock') this.hold({ key: message.key, epoch: message.epoch });
      else if (message.type === 'hello' && this.root)
        this.channel?.postMessage({ type: 'unlock', key: this.root.key, epoch: this.root.epoch });
    });
    // A tab that opens while another is unlocked asks to be let in.
    this.channel?.postMessage({ type: 'hello' });
  }

  get state(): KeyringState {
    return this.root ? 'unlocked' : 'locked';
  }

  /** Called when the wallet locks or unlocks, in this tab or another. The reason is given for a lock. */
  subscribe(listener: (state: KeyringState, reason?: LockReason) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTimers(timers: LockTimers): void {
    this.timers = timers;
    if (this.root) this.restartIdle();
  }

  /** Unlocks with a root the caller opened (from the suite's key, or an unlock wrapper), and tells the other tabs. */
  unlock(root: Root): void {
    this.hold(root);
    this.channel?.postMessage({ type: 'unlock', key: root.key, epoch: root.epoch });
  }

  private hold(root: Root): void {
    const was = this.state;
    this.root = root;
    this.restartIdle();
    if (was === 'locked') for (const listener of [...this.listeners]) listener('unlocked');
  }

  /** The epoch of the root held, which a new entry's key is derived from. A locked keyring has none. */
  get epoch(): number {
    if (!this.root) throw new Error('the wallet is locked');
    return this.root.epoch;
  }

  /** The key of an entry, derived from the root once and kept until the wallet locks. */
  entryKey(entryId: string, epoch: number): Promise<CryptoKey> {
    const root = this.root;
    if (!root) return Promise.reject(new Error('the wallet is locked'));
    // Only the epoch held is open: another epoch's root is not on this device (rotating everything, task 3.10).
    if (epoch !== root.epoch) return Promise.reject(new Error('that epoch is not open'));
    const held = this.cache.get(entryId);
    if (held) return held;
    const made = deriveEntryKey(this.cipher, root.key, this.accountId, entryId);
    this.cache.set(entryId, made);
    // A key that could not be derived is not kept, so that it is tried again.
    made.catch(() => this.cache.delete(entryId));
    return made;
  }

  /** The person used the app: the idle timer starts again. */
  touch(): void {
    if (this.root) this.restartIdle();
  }

  /** The app was hidden or shown (another app, the screen off): the hidden timer runs while it is hidden. */
  setHidden(hidden: boolean): void {
    this.clock.clearTimeout(this.away);
    this.away = undefined;
    if (!hidden || !this.root) {
      if (!hidden) this.touch();
      return;
    }
    if (this.timers.hidden === 'now') this.lock('hidden');
    else if (this.timers.hidden === '1m')
      this.away = this.clock.setTimeout(() => this.lock('hidden'), 60_000);
  }

  private restartIdle(): void {
    this.clock.clearTimeout(this.idle);
    this.idle = this.clock.setTimeout(() => this.lock('idle'), this.timers.idleMinutes * 60_000);
  }

  /** Locks, here and in every tab. */
  lock(reason: LockReason = 'manual'): void {
    const wasUnlocked = this.root !== undefined;
    this.lockLocally(reason);
    if (wasUnlocked) this.channel?.postMessage({ type: 'lock' });
  }

  private lockLocally(reason: LockReason): void {
    this.clock.clearTimeout(this.idle);
    this.clock.clearTimeout(this.away);
    this.idle = undefined;
    this.away = undefined;
    if (!this.root) return;
    this.root = undefined;
    this.cache = new Map();
    for (const listener of [...this.listeners]) listener('locked', reason);
  }

  /** Ends the keyring's use of the channel (a tab closing, a test). */
  close(): void {
    this.lockLocally('sign-out');
    this.channel?.close();
  }
}
