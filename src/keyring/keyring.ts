import { type EntryKeys, type VaultKey, unwrapEntryKey } from '../core/vault';

/**
 * The keyring (DESIGN.md §9.1, §9.2): the keys the browser holds while the wallet is unlocked, and nothing else. **The wallet key is never kept:** it opens the
 * vault header and is forgotten. What is held is the vault key and, as they are used, entry keys, all non-extractable `CryptoKey`s, in memory only.
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

/** What crosses between tabs. The vault key is a non-extractable `CryptoKey`, which structured clone carries without making it readable. */
type Message =
  | { readonly type: 'lock' }
  | { readonly type: 'unlock'; readonly key: CryptoKey; readonly id: string }
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
}

export class Keyring {
  readonly accountId: string;
  private readonly clock: Clock;
  private readonly channel: Channel | null;
  private timers: LockTimers;
  private vault: VaultKey | undefined;
  private cache = new Map<string, Promise<EntryKeys>>();
  private readonly listeners = new Set<(state: KeyringState, reason?: LockReason) => void>();
  private idle: unknown;
  private away: unknown;

  constructor(options: KeyringOptions) {
    this.accountId = options.accountId;
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
      else if (message.type === 'unlock') this.hold({ key: message.key, id: message.id });
      else if (message.type === 'hello' && this.vault)
        this.channel?.postMessage({ type: 'unlock', key: this.vault.key, id: this.vault.id });
    });
    // A tab that opens while another is unlocked asks to be let in.
    this.channel?.postMessage({ type: 'hello' });
  }

  get state(): KeyringState {
    return this.vault ? 'unlocked' : 'locked';
  }

  /** Called when the wallet locks or unlocks, in this tab or another. The reason is given for a lock. */
  subscribe(listener: (state: KeyringState, reason?: LockReason) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTimers(timers: LockTimers): void {
    this.timers = timers;
    if (this.vault) this.restartIdle();
  }

  /** Unlocks with a vault key the caller opened (from the header, or an unlock wrapper), and tells the other tabs. */
  unlock(vault: VaultKey): void {
    this.hold(vault);
    this.channel?.postMessage({ type: 'unlock', key: vault.key, id: vault.id });
  }

  private hold(vault: VaultKey): void {
    const was = this.state;
    this.vault = vault;
    this.restartIdle();
    if (was === 'locked') for (const listener of [...this.listeners]) listener('unlocked');
  }

  /** The vault key. Only for what needs it (`entryKeys`, the unlock wrappers); a locked keyring has none. */
  get vaultKey(): VaultKey {
    if (!this.vault) throw new Error('the wallet is locked');
    return this.vault;
  }

  /** The keys of an entry, unwrapped once and kept until the wallet locks. */
  async entryKeys(entryId: string, wrappedKey: Uint8Array): Promise<EntryKeys> {
    const vault = this.vaultKey;
    const held = this.cache.get(entryId);
    if (held) return held;
    const made = unwrapEntryKey(vault, this.accountId, entryId, wrappedKey);
    this.cache.set(entryId, made);
    // A key that could not be unwrapped is not kept, so that a repaired row is tried again.
    made.catch(() => this.cache.delete(entryId));
    return made;
  }

  /** Remembers keys that were made here, for an entry just created. */
  rememberEntryKeys(entryId: string, keys: EntryKeys): void {
    this.cache.set(entryId, Promise.resolve(keys));
  }

  /** The person used the app: the idle timer starts again. */
  touch(): void {
    if (this.vault) this.restartIdle();
  }

  /** The app was hidden or shown (another app, the screen off): the hidden timer runs while it is hidden. */
  setHidden(hidden: boolean): void {
    this.clock.clearTimeout(this.away);
    this.away = undefined;
    if (!hidden || !this.vault) {
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
    const wasUnlocked = this.vault !== undefined;
    this.lockLocally(reason);
    if (wasUnlocked) this.channel?.postMessage({ type: 'lock' });
  }

  private lockLocally(reason: LockReason): void {
    this.clock.clearTimeout(this.idle);
    this.clock.clearTimeout(this.away);
    this.idle = undefined;
    this.away = undefined;
    if (!this.vault) return;
    this.vault = undefined;
    this.cache = new Map();
    for (const listener of [...this.listeners]) listener('locked', reason);
  }

  /** Ends the keyring's use of the channel (a tab closing, a test). */
  close(): void {
    this.lockLocally('sign-out');
    this.channel?.close();
  }
}
