import { serviceWorkerSource } from '@sovereignfs/pwa';

/**
 * The service worker (DESIGN.md §26.6), as the text served at `/sw.js`: the suite's, from `@sovereignfs/pwa`, with Wallet's version, cache name, built
 * files and shell. It is a string and not a module because a worker is its own script, with no bundler between it and the browser, so that a test
 * evaluates the very text that is served.
 *
 * **What it keeps, and nothing else:** the build's own files (the allow-list `files`, all under `/_next/static/`, the same for everyone), the icons and the
 * manifest, and **the one shell page, `/shell`**, which holds nothing of a person: who is signed in is read from the device by the page itself. Every other
 * request, every API answer and every page with a person's data goes to the network and is never stored. **No entry, decrypted or not, is ever in its
 * cache** (AGENTS.md); an Online only entry will never reach the device at all (after 0.1.0).
 *
 * **With no network,** or none in time, every address is answered with the kept shell page, which carries the policy and the nonce it was sent with (the
 * headers are kept with the body, so the two agree), and which starts the wallet from the device's own store, locked until it is unlocked; an address that
 * is not the wallet's says it needs a connection (`OfflineApp`). Before a shell is kept, the package's own page says the app is offline. A new version
 * waits until a page asks it to take over, which the registration does when the person chooses Reload.
 *
 * **Background Sync** (the package's `sync` option) wakes the open pages, which sync through their own loop (`src/local/loop.ts`, which listens for this
 * message). The worker has none of the store's code, so with no page open the changes wait for the next time Wallet is opened.
 */
export const CACHE_PREFIX = 'wallet-shell-';

export function workerSource(version: string, files: readonly string[] = []): string {
  return serviceWorkerSource({
    version,
    cachePrefix: CACHE_PREFIX,
    precache: files,
    shell: '/shell',
    // The tag a page registers after a write (`src/screens/WalletProvider.tsx`), and what the open pages are then told.
    sync: { tags: ['wallet-sync'], message: 'wallet-sync' },
    // The design system's grey 900 and white, as the manifest's colours are.
    offlineColors: { light: ['#ffffff', '#18181b'], dark: ['#18181b', '#fafafa'] },
  });
}

/**
 * The worker for a server that is not a production build (`next dev`): it keeps nothing, and removes itself and the caches of any other. A worker that kept
 * files there would show yesterday's code, since a development server's files do not change their names when they change.
 */
export function inertWorkerSource(): string {
  return `'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(${JSON.stringify(CACHE_PREFIX)})).map((name) => caches.delete(name))))
      .then(() => self.registration.unregister()),
  );
});
`;
}
