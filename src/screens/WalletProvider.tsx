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
import {
  arrive,
  arrived,
  clearArrival,
  clearMark,
  forgetResume,
  readMark,
  stillOpen,
  writeMark,
} from '../keyring/resume';
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

/** How long a reloaded page is held blank while the account's key is asked for, before it shows the lock screen instead. */
const RESUME_WAIT_MS = 6_000;

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
      // A reload within the lock times, or a page just signed in to, is about to open: it is held blank, so that no lock screen flashes, for as long as the
      // account's key takes to answer and no longer.
      const mark = readMark(accountId);
      const opening =
        keyring.state !== 'unlocked' &&
        (arrived() || (mark !== undefined && stillOpen(mark, lock, Date.now())));
      setStand(opening ? 'starting' : keyring.state);
      const giveUp = opening
        ? setTimeout(() => {
            if (keyring.state === 'unlocked') return;
            clearMark(accountId);
            setStand((now) => (now === 'starting' ? 'locked' : now));
          }, RESUME_WAIT_MS)
        : undefined;
      loop.start();

      // When the wallet was last used, kept for the tab while it is unlocked (`resume.ts`), so that a reload knows whether a lock time has run out.
      let used = Date.now();
      const note = (left?: number) => {
        if (keyring.state === 'unlocked')
          writeMark(accountId, left === undefined ? { used } : { used, left });
      };
      const unsubscribe = keyring.subscribe((state, reason) => {
        setStand(state);
        if (state === 'unlocked') {
          clearArrival();
          used = Date.now();
          note();
        }
        if (state === 'locked') {
          // What a reload would go by goes with every lock: after one, the wallet asks, reload or not (DESIGN.md §9.2). The account's key itself stays for the
          // session, so that a reload can reopen what a passkey or passcode opens next, and goes at sign-out.
          forgetResume(accountId);
          if (reason === 'sign-out') void keysRef.current.forget();
          // And a setup that was under way ends here: the root's bytes it held for a new passkey or passcode go too.
          setSetupMaterial((held) => {
            held?.raw.fill(0);
            return null;
          });
          setSettingUp(false);
        }
        if (state === 'unlocked') {
          // What is shown is brought up to date, if the last sync is not recent: a locked page may not have been returned to since.
          loop.catchUp();
          // Changes that waited for the keys are merged as soon as they are there.
          void wallet.mergeWaiting().then((again) => again && loop.request());
        }
      });
      // Use and visibility: the idle and hidden locks (DESIGN.md §9.2).
      const touch = () => {
        keyring.touch();
        // Once a second is often enough, and a time that is a moment old only locks a moment early.
        if (Date.now() - used >= 1_000) {
          used = Date.now();
          note();
        }
      };
      const hidden = () => {
        const away = document.visibilityState === 'hidden';
        if (away) note(Date.now());
        // For "as soon as it is hidden" this locks, a reload included, and the note goes with the lock.
        keyring.setHidden(away);
        if (!away) {
          used = Date.now();
          note();
        }
      };
      const leaving = () => note(Date.now());
      // A page that comes back, from sleep or from the browser's back and forward cache, is asked what the clock says (§9.2).
      const back = () => void keyring.expire();
      for (const event of ['pointerdown', 'keydown', 'touchstart', 'scroll'])
        window.addEventListener(event, touch, { passive: true });
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', leaving);
      window.addEventListener('pageshow', back);
      window.addEventListener('focus', back);
      teardown = () => {
        clearTimeout(giveUp);
        unsubscribe();
        for (const event of ['pointerdown', 'keydown', 'touchstart', 'scroll'])
          window.removeEventListener(event, touch);
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('pagehide', leaving);
        window.removeEventListener('pageshow', back);
        window.removeEventListener('focus', back);
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
      // With no way to unlock this device yet, setup keeps a copy of the root's bytes to make one from (§9.3).
      if ((await unlockMethods(parts.db)).length === 0) {
        setSetupMaterial({ raw: new Uint8Array(material.raw), epoch: material.epoch });
        setSettingUp(true);
      }
      // The keyring gets a key that cannot be read back; the bytes are dropped.
      parts.keyring.unlock({ key: await importRoot(material.raw), epoch: material.epoch });
      material.raw.fill(0);
    },
    [parts],
  );

  const openWithAccount = useCallback<WalletContext['openWithAccount']>(
    async (password) => {
      // The account is proved every time, even though this browser holds its key for the session: what a lock is for is that holding the device is not enough.
      if (keys.kind === 'core') {
        // Core's release leaves the page and comes back to `/keys/return`; it is silent while the person's session at Sovereign is unlocked. **Leaving proves
        // nothing:** `/keys/return` marks the arrival once it has taken core's answer (`KeyReturn`), so a page that comes back without one stays locked.
        const proof = await keys.unlock();
        return { ok: false, reason: proof.outcome === 'away' ? 'away' : 'offline' };
      }
      const proof = await keys.unlock(password, email);
      if (proof.outcome === 'open') return openRoot(accountId, proof.key, { create: true });
      if (proof.outcome === 'kit') {
        // The password was right: once the kit is kept, the wallet goes on to open.
        arrive();
        window.location.assign(kitPath());
        return { ok: false, reason: 'away' };
      }
      return { ok: false, reason: proof.outcome === 'away' ? 'away' : proof.outcome };
    },
    [keys, accountId, email],
  );

  // The account's key opens the wallet without asking in two cases, and in no other: the person has just proved the account in this tab (signed in, or came back
  // from Sovereign's release), or the page was reloaded within the lock times (DESIGN.md §9.2). Both need the server. Everything else is the lock screen: a
  // passkey or a passcode, with no network, or the account proved again.
  useEffect(() => {
    if (!parts || parts.keyring.state === 'unlocked' || settingUp) return;
    if (keys.current.state === 'checking') return;
    let cancelled = false;
    // Whether this run still has the say: not replaced by a newer one, and the wallet not opened meanwhile by a passkey, a passcode or the lock screen.
    const mine = () => !cancelled && parts.keyring.state !== 'unlocked';
    void (async () => {
      const wrappers = await unlockMethods(parts.db);
      const held = await store.localValue<LockTimers>(parts.db, 'lockTimers', DEFAULT_TIMERS);
      if (!mine()) return;
      const state = keys.current.state;
      const signedIn = arrived();
      const mark = readMark(accountId);
      const reloaded = mark !== undefined && stillOpen(mark, held, Date.now());
      if (keys.current.state === 'open' && (signedIn || reloaded)) {
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
        if (result.ok) {
          clearArrival();
          await unlockWith(result.material);
          return;
        }
      }
      // Not opened: nothing is left that would open it later without being asked. A sign-in that found no network waits for it.
      clearMark(accountId);
      if (state !== 'offline') clearArrival();
      setStand(wrappers.length === 0 && state === 'offline' ? 'needs-connection' : 'locked');
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
