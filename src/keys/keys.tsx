'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type Opening, openWithPassword } from './access';
import { coreKeys } from './core-client';
import type { KeySource } from './source';
import { walletVault } from './vault-client';

/**
 * The suite's app key in the page (RFC 0001, DESIGN.md §7.1): one interface over both ways an instance gets it, core's release (hosted) or Wallet's own vault
 * (standalone), chosen by the server from how the instance signs people in (`keySource`) and handed down. **The key is not what opens the wallet day to day:**
 * it opens the wrapped keyring root, and the root is what a device's passkey or passcode holds (§9.3), so Wallet opens with no network, where this key cannot
 * be opened (the SDK keeps it wrapped by the session's secret, which only the server holds). This is for a new device, for a device whose wrappers are gone,
 * and for making a new way to unlock.
 */
export type KeyState =
  | { readonly state: 'checking' }
  | { readonly state: 'open'; readonly key: CryptoKey }
  /** The session has no key now (it has not been opened yet, or it is gone with the session): a password, or core's release, opens it. */
  | { readonly state: 'locked' }
  /** The server could not be asked: no network. Tried again when it returns. */
  | { readonly state: 'offline' }
  /** No way to a key here: an instance whose way of signing in is not set any more. */
  | { readonly state: 'none' };

/** What proving the key came to: `away` is core's release, which leaves the page. */
export type Proof = Opening | { readonly outcome: 'away' };

export interface Keys {
  readonly current: KeyState;
  readonly kind: KeySource['kind'] | undefined;
  /** Opens the key again, **proving it each time**: core's release, or the password for the vault, derived with the address it was made with. */
  unlock(password?: string, email?: string): Promise<Proof>;
  /** Whether the recovery kit of an instance that runs alone is still to be kept. Hosted, the kit is core's. */
  kitPending(): Promise<boolean>;
  /** Forgets what this browser keeps of the key: at sign-out. */
  forget(): Promise<void>;
}

const NONE: Keys = {
  current: { state: 'none' },
  kind: undefined,
  unlock: async () => ({ outcome: 'offline' }),
  kitPending: async () => false,
  forget: async () => undefined,
};

const KeysContext = createContext<Keys>(NONE);

export function useKeys(): Keys {
  return useContext(KeysContext);
}

export function KeysProvider({
  source,
  children,
}: {
  source: KeySource | undefined;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<KeyState>(
    source ? { state: 'checking' } : { state: 'none' },
  );
  const ways = useMemo(() => {
    if (!source) return undefined;
    if (source.kind === 'core') return { kind: 'core', core: coreKeys(source) } as const;
    return { kind: 'vault', vault: walletVault(source.vaultId) } as const;
  }, [source]);

  const open = useCallback(async (): Promise<void> => {
    if (!ways) return;
    try {
      const opened = ways.kind === 'core' ? await ways.core.open() : await ways.vault.open();
      if (opened.state === 'open') return setCurrent({ state: 'open', key: opened.key });
      const offline = ways.kind === 'vault' && ways.vault.unreachable();
      setCurrent({ state: offline ? 'offline' : 'locked' });
    } catch {
      // No network, or the server could not say: tried again when the network is back.
      setCurrent({ state: 'offline' });
    }
  }, [ways]);

  useEffect(() => {
    void open();
    // With no network the key cannot open (the session's secret is the server's): it is tried again when the network is back.
    const retry = () => void open();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [open]);

  const keys = useMemo<Keys>(
    () => ({
      current,
      kind: ways?.kind,
      unlock: async (password, email) => {
        if (!ways) return { outcome: 'offline' };
        if (ways.kind === 'core') {
          if (!navigator.onLine) return { outcome: 'offline' };
          // Core's release leaves the page and comes back to `/keys/return`, which brings the person back here.
          await ways.core.unlock(window.location.pathname + window.location.search);
          return { outcome: 'away' };
        }
        if (!password || !email) return { outcome: 'wrong' };
        const opening = await openWithPassword(ways.vault, password, email);
        if (opening.outcome === 'open') setCurrent({ state: 'open', key: opening.key });
        return opening;
      },
      kitPending: async () => (ways?.kind === 'vault' ? ways.vault.kitPending() : false),
      forget: async () => {
        if (!ways) return;
        await (ways.kind === 'core' ? ways.core.forget() : ways.vault.forget()).catch(
          () => undefined,
        );
        setCurrent({ state: 'locked' });
      },
    }),
    [current, ways],
  );

  return <KeysContext.Provider value={keys}>{children}</KeysContext.Provider>;
}
