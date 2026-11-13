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
import { fromBase64Url } from '../core/encoding';
import { importVaultKey, openHeader, parseIdentity } from '../core/vault';
import { DEFAULT_TIMERS, Keyring, type LockTimers } from '../keyring/keyring';
import type { Material } from '../keyring/wrappers';
import { type LocalDatabase, openLocal } from '../local/db';
import { type LoopEnv, SyncLoop, browserEnv } from '../local/loop';
import * as store from '../local/store';
import { fetchTransport } from '../local/transport';
import { type Merged, type OpenEntry, Wallet } from '../local/wallet';

/**
 * Everything a signed-in screen shares (DESIGN.md §9.1, §11.1): this account's device store, the keyring, the wallet over them and the sync loop, made once in
 * the browser. **The server renders none of it**: it has nothing it could open. The screens ask `useWallet()` where the wallet stands, and
 * `useEntries()` for what is open.
 *
 *  - `starting`          the store is being opened
 *  - `needs-connection`  this device has no copy of the vault header and cannot ask for one: signing in needs a network the first time
 *  - `no-vault`          the account has no wallet yet: setup
 *  - `locked`            there is a vault and this device holds none of its keys
 *  - `unlocked`
 */
export type Stand = 'starting' | 'needs-connection' | 'no-vault' | 'locked' | 'unlocked';

export interface WalletContext {
  readonly accountId: string;
  readonly stand: Stand;
  readonly wallet: Wallet;
  readonly keyring: Keyring;
  readonly db: LocalDatabase;
  readonly loop: SyncLoop;
  readonly vault: store.StoredVault | undefined;
  readonly timers: LockTimers;
  /** Reads the vault header again from the device, and from the server when there is none. */
  refreshVault(): Promise<void>;
  /** Changes this device's lock timers. */
  setTimers(timers: LockTimers): Promise<void>;
  /**
   * Opens the vault header with a wallet key or recovery key, given as a key file's text or pasted. **It does not unlock:** it hands back the vault key's
   * bytes, so that a way of unlocking can be made from them before the wallet opens (\`unlockWith\`), and the caller zeroes them. Or says what went wrong.
   */
  openWithKeyText(text: string): Promise<Material | 'not_a_key' | 'wrong_key' | 'no_vault'>;
  /** Whether setup is on screen: it stays so once the vault is made, until its last step, which the stand alone would take away. */
  readonly settingUp: boolean;
  setSettingUp(on: boolean): void;
  /** Unlocks with the vault key's bytes (and zeroes them). */
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
  children,
  fallback = null,
  onMerged,
}: {
  accountId: string;
  children: ReactNode;
  fallback?: ReactNode;
  /** Called when a stale edit was merged and this device's value was kept over another's (DESIGN.md §11.5). */
  onMerged?: (merged: Merged) => void;
}) {
  // The latest callback, without opening the store again when it changes.
  const mergedRef = useRef(onMerged);
  mergedRef.current = onMerged;
  const [parts, setParts] = useState<Parts | null>(null);
  const [stand, setStand] = useState<Stand>('starting');
  const [vault, setVault] = useState<store.StoredVault | undefined>(undefined);
  const [timers, setTimersState] = useState<LockTimers>(DEFAULT_TIMERS);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    void (async () => {
      const db = await openLocal(accountId);
      const lock = await store.localValue<LockTimers>(db, 'lockTimers', DEFAULT_TIMERS);
      const keyring = new Keyring({ accountId, timers: lock });
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

      // What the device holds, or what the server has when it holds nothing.
      let held = await store.vaultOf(db);
      let without: Stand = 'needs-connection';
      if (!held) {
        const fromServer = await transport.vault();
        if (fromServer) {
          await store.saveVault(db, fromServer);
          held = fromServer;
        } else if (fromServer === null) without = 'no-vault';
      }
      const next: Stand = held ? (keyring.state === 'unlocked' ? 'unlocked' : 'locked') : without;
      if (cancelled) return;
      setVault(held);
      setTimersState(lock);
      setParts({ db, keyring, wallet, loop });
      setStand(next);
      loop.start();

      const unsubscribe = keyring.subscribe((state) => {
        setStand(state);
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

  const refreshVault = useCallback(async () => {
    if (!parts) return;
    let held = await store.vaultOf(parts.db);
    if (!held) {
      const fromServer = await fetchTransport().vault();
      if (fromServer) {
        await store.saveVault(parts.db, fromServer);
        held = fromServer;
      }
    }
    setVault(held);
    if (held && parts.keyring.state === 'locked') setStand('locked');
    if (!held) setStand('no-vault');
  }, [parts]);

  const setTimers = useCallback(
    async (next: LockTimers) => {
      if (!parts) return;
      await store.setLocalValue(parts.db, 'lockTimers', next);
      parts.keyring.setTimers(next);
      setTimersState(next);
    },
    [parts],
  );

  const openWithKeyText = useCallback<WalletContext['openWithKeyText']>(
    async (text) => {
      if (!parts) return 'no_vault';
      const held = await store.vaultOf(parts.db);
      if (!held) return 'no_vault';
      const parsed = await parseIdentity(text);
      if (!parsed.ok) return 'not_a_key';
      const header = fromBase64Url(held.header);
      if (!header) return 'no_vault';
      try {
        const opened = await openHeader(header, parsed.identity);
        // The bytes go back to the caller, who may make an unlock wrapper of them, and must zero them.
        return { raw: opened.raw, id: opened.id };
      } catch {
        return 'wrong_key';
      }
    },
    [parts],
  );

  const unlockWith = useCallback<WalletContext['unlockWith']>(
    async (material) => {
      if (!parts) return;
      // The keyring gets a key that cannot be read back; the bytes are dropped.
      parts.keyring.unlock(await importVaultKey(material.raw, material.id));
      material.raw.fill(0);
    },
    [parts],
  );

  const value = useMemo<WalletContext | null>(
    () =>
      parts
        ? {
            accountId,
            stand,
            vault,
            timers,
            ...parts,
            refreshVault,
            setTimers,
            openWithKeyText,
            unlockWith,
            settingUp,
            setSettingUp,
          }
        : null,
    [
      accountId,
      stand,
      vault,
      timers,
      parts,
      refreshVault,
      setTimers,
      openWithKeyText,
      unlockWith,
      settingUp,
    ],
  );

  if (!value) return <>{fallback}</>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
