'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { importRoot } from '../core/vault';
import { suiteCipher } from '../keys/cipher';
import { useKeys } from '../keys/keys';
import { type RootResult, openRoot } from '../keys/root';
import { kitPath } from '../keys/vault-client';
import { DEFAULT_TIMERS, Keyring, type LockTimers } from '../keyring/keyring';
import { type Material, unlockMethods } from '../keyring/wrappers';
import { type LocalDatabase, openLocal } from '../local/db';
import { type LoopEnv, SyncLoop, browserEnv } from '../local/loop';
import * as store from '../local/store';
import { fetchTransport } from '../local/transport';
import { type Merged, type OpenEntry, Wallet } from '../local/wallet';

/** What opening with the account came to: the root, or why not. `away` is a page being left (core's release, or the recovery kit). */
export type AccountResult =
  RootResult | { readonly ok: false; readonly reason: 'wrong' | 'limited' | 'signed-out' | 'away' };

/**
 * Everything a signed-in screen shares (DESIGN.md §9.1, §11.1): this account's device store, the keyring, the wallet over them and the sync loop, made once in
 * the browser. **The server renders none of it**: it has nothing it could open. The screens ask `useWallet()` where the wallet stands, and
 * `useEntries()` for what is open.
 *
 *  - `starting`          the store is being opened
 *  - `needs-connection`  this device has no way to unlock (a passkey or passcode) and the suite's key cannot be opened now: the first time on a device needs a network
 *  - `locked`            this device holds no root: a passkey or passcode, or the suite's key, opens it
 *  - `unlocked`
 *
 * **Setting up** (`settingUp`) is the one time the root's bytes are in hand on a device with no way to unlock it: Wallet asks for a passkey or a passcode while it
 * has them, and lets them go (§9.3).
 */
export type Stand = 'starting' | 'needs-connection' | 'locked' | 'unlocked';

export interface WalletContext {
  readonly accountId: string;
  readonly stand: Stand;
  readonly wallet: Wallet;
  readonly keyring: Keyring;
  readonly db: LocalDatabase;
  readonly loop: SyncLoop;
  readonly timers: LockTimers;
  /** Changes this device's lock timers. */
  setTimers(timers: LockTimers): Promise<void>;
  /**
   * Opens the keyring root with the suite's key (the password, for an instance that runs alone; core's release, hosted), which needs the network. **It does not
   * unlock:** it hands back the root's bytes so that a way of unlocking can be made from them, and the caller zeroes them (`unlockWith`).
   */
  openWithAccount(password?: string): Promise<AccountResult>;
  /** The root's bytes to make a way of unlocking from, when this device is setting up (`settingUp`), and nothing otherwise. */
  readonly setupMaterial: Material | null;
  /** Whether setup is on screen: it stays so until its last step, which the stand alone would take away. */
  readonly settingUp: boolean;
  finishSetup(): void;
  /** Unlocks with the root's bytes (and zeroes them). */
  unlockWith(material: Material): Promise<void>;
}

const Context = createContext<WalletContext | null>(null);

export function useWallet(): WalletContext {
  const value = useContext(Context);
  if (!value) throw new Error('no wallet here');
  return value;
}

/** Where the wallet stands, or `starting` outside the provider. */
export function useOptionalWallet(): WalletContext | null {
  return useContext(Context);
}

const EMPTY: readonly OpenEntry[] = [];

/** Said before the page leaves for core's release, so that the wallet opens when the person comes back. Kept for this tab's session, and holds nothing else. */
const ASKED = 'wallet.openWithAccount';
function remember(asked: boolean): void {
  try {
    if (asked) window.sessionStorage.setItem(ASKED, '1');
    else window.sessionStorage.removeItem(ASKED);
  } catch {
    // Without it the wallet comes back locked, and the person asks again.
  }
}
function remembered(): boolean {
  try {
    return window.sessionStorage.getItem(ASKED) === '1';
  } catch {
    return false;
  }
}

/** The entries that are open, re-read when anything changes. */
export function useEntries(): readonly OpenEntry[] {
  const { wallet } = useWallet();
  return useSyncExternalStore(wallet.subscribe, wallet.getSnapshot, () => EMPTY);
}

interface Parts {
  readonly db: LocalDatabase;
  readonly keyring: Keyring;
  readonly wallet: Wallet;
  readonly loop: SyncLoop;
}

export function WalletProvider({
  accountId,
  email,
  children,
  fallback = null,
  onMerged,
}: {
  accountId: string;
  /** The address the person's password is derived with. */
  email: string;
  children: ReactNode;
  fallback?: ReactNode;
  /** Called when a stale edit was merged and this device's value was kept over another's (DESIGN.md §11.5). */
  onMerged?: (merged: Merged) => void;
}) {
  // The latest callback, without opening the store again when it changes.
  const mergedRef = useRef(onMerged);
  mergedRef.current = onMerged;
  const keys = useKeys();
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const [parts, setParts] = useState<Parts | null>(null);
  const [stand, setStand] = useState<Stand>('starting');
  const [timers, setTimersState] = useState<LockTimers>(DEFAULT_TIMERS);
  const [setupMaterial, setSetupMaterial] = useState<Material | null>(null);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    void (async () => {
      const db = await openLocal(accountId);
      const lock = await store.localValue<LockTimers>(db, 'lockTimers', DEFAULT_TIMERS);
      const keyring = new Keyring({ accountId, timers: lock, cipher: suiteCipher });
      const transport = fetchTransport();
      // The wallet asks the loop to sync after a write, and the loop needs the wallet: the loop is put here when it is made.
      const made: { loop?: SyncLoop } = {};
      const wallet = new Wallet({
        accountId,
        db,
        keyring,
        transport,
        onMerged: (merged) => mergedRef.current?.(merged),
        onChange: () => {
          made.loop?.request();
          // Where the browser has Background Sync, a change made with no connection is sent when it returns, even if the page is closed by then.
          void navigator.serviceWorker?.ready
            .then((registration) =>
              (
                registration as ServiceWorkerRegistration & {
                  sync?: { register(tag: string): Promise<void> };
                }
              ).sync?.register('wallet-sync'),
            )
            .catch(() => undefined);
        },
      });
      const env: LoopEnv = browserEnv(accountId);
      const loop = new SyncLoop(wallet, env);
      made.loop = loop;
      if (cancelled) {
        keyring.close();
        db.close();
        return;
      }
      setTimersState(lock);
      setParts({ db, keyring, wallet, loop });
      setStand(keyring.state);
      loop.start();

      const unsubscribe = keyring.subscribe((state) => {
        setStand(state);
        // A lock takes the suite's key with it, so that holding an unlocked device is not enough to open the wallet again: it asks for the password, or for a
        // passkey or passcode this device made (DESIGN.md §9.1).
        if (state === 'locked') {
          void keysRef.current.forget();
          // And a setup that was under way ends here: the root's bytes it held for a new passkey or passcode go too.
          setSetupMaterial((held) => {
            held?.raw.fill(0);
            return null;
          });
          setSettingUp(false);
        }
        // Changes that waited for the keys are merged as soon as they are there.
        if (state === 'unlocked')
          void wallet.mergeWaiting().then((again) => again && loop?.request());
      });
      // Use and visibility: the idle and hidden locks (DESIGN.md §9.2).
      const touch = () => keyring.touch();
      const hidden = () => keyring.setHidden(document.visibilityState === 'hidden');
      for (const event of ['pointerdown', 'keydown', 'touchstart', 'scroll'])
        window.addEventListener(event, touch, { passive: true });
      document.addEventListener('visibilitychange', hidden);
      teardown = () => {
        unsubscribe();
        for (const event of ['pointerdown', 'keydown', 'touchstart', 'scroll'])
          window.removeEventListener(event, touch);
        document.removeEventListener('visibilitychange', hidden);
        loop.stop();
        keyring.close();
        db.close();
      };
    })();
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [accountId]);

  const setTimers = useCallback(
    async (next: LockTimers) => {
      if (!parts) return;
      await store.setLocalValue(parts.db, 'lockTimers', next);
      parts.keyring.setTimers(next);
      setTimersState(next);
    },
    [parts],
  );

  const unlockWith = useCallback<WalletContext['unlockWith']>(
    async (material) => {
      if (!parts) return;
      // The keyring gets a key that cannot be read back; the bytes are dropped.
      parts.keyring.unlock({ key: await importRoot(material.raw), epoch: material.epoch });
      material.raw.fill(0);
    },
    [parts],
  );

  const openWithAccount = useCallback<WalletContext['openWithAccount']>(
    async (password) => {
      // The key is proved every time, even where this browser holds it for the session: what a lock is for is that holding the device is not enough.
      if (keys.kind === 'core') {
        // Core's release leaves the page and comes back to `/keys/return`, which opens the wallet; it is silent while the person's session at Sovereign is unlocked.
        remember(true);
        const proof = await keys.unlock();
        if (proof.outcome === 'away') return { ok: false, reason: 'away' };
        remember(false);
        return { ok: false, reason: 'offline' };
      }
      const proof = await keys.unlock(password, email);
      if (proof.outcome === 'open') return openRoot(accountId, proof.key, { create: true });
      if (proof.outcome === 'kit') {
        window.location.assign(kitPath());
        return { ok: false, reason: 'away' };
      }
      return { ok: false, reason: proof.outcome === 'away' ? 'away' : proof.outcome };
    },
    [keys, accountId, email],
  );

  // The suite's key, once it is open, brings the root to a device that has no way to unlock (the first time on it, or after its wrappers are gone), and to a
  // device that asked it to (it came back from core's release). A device with a wrapper unlocks with that, with no network and no key.
  useEffect(() => {
    if (!parts || parts.keyring.state === 'unlocked' || settingUp) return;
    const state = keys.current.state;
    if (state === 'checking') return;
    let cancelled = false;
    // Whether this run still has the say: not replaced by a newer one, and the wallet not opened meanwhile by a passkey, a passcode or the lock screen.
    const mine = () => !cancelled && parts.keyring.state !== 'unlocked';
    void (async () => {
      const wrappers = await unlockMethods(parts.db);
      if (!mine()) return;
      if (keys.current.state === 'open' && (wrappers.length === 0 || remembered())) {
        // The recovery kit comes before the wallet, for a person who has still to keep it.
        if (await keys.kitPending()) {
          if (mine()) window.location.assign(kitPath());
          return;
        }
        const result = await openRoot(accountId, keys.current.key, { create: true });
        if (!mine()) {
          if (result.ok) result.material.raw.fill(0);
          return;
        }
        remember(false);
        if (result.ok) {
          // With no way to unlock this device yet, setup keeps a copy of the root's bytes for it; with one, the root is only opened.
          if (wrappers.length === 0) {
            const { raw, epoch } = result.material;
            setSetupMaterial({ raw: new Uint8Array(raw), epoch });
            setSettingUp(true);
          }
          await unlockWith(result.material);
          return;
        }
      }
      setStand(wrappers.length > 0 || state === 'locked' ? 'locked' : 'needs-connection');
    })();
    return () => {
      cancelled = true;
    };
  }, [parts, keys, accountId, settingUp, unlockWith]);

  const finishSetup = useCallback(() => {
    setSetupMaterial((held) => {
      held?.raw.fill(0);
      return null;
    });
    setSettingUp(false);
  }, []);

  const value = useMemo<WalletContext | null>(
    () =>
      parts
        ? {
            accountId,
            stand,
            timers,
            ...parts,
            setTimers,
            openWithAccount,
            setupMaterial,
            settingUp,
            finishSetup,
            unlockWith,
          }
        : null,
    [
      accountId,
      stand,
      timers,
      parts,
      setTimers,
      openWithAccount,
      setupMaterial,
      settingUp,
      finishSetup,
      unlockWith,
    ],
  );

  if (!value) return <>{fallback}</>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
