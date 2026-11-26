import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { TAKE_OVER_MESSAGE } from '@sovereignfs/pwa';
import { CACHE_PREFIX, workerSource } from './source';

/**
 * The service worker (DESIGN.md §26.6): **what it keeps is an allow-list, and nothing else gets in.** This evaluates the very text that is served, with a
 * cache and a network that the test controls, and looks at what is in the cache after everything a signed-in person does: no page with a person's data, no
 * answer from an API, no card, no Settings.
 */
const ORIGIN = 'https://wallet.test';
const FILES = [
  '/_next/static/chunks/a.js',
  '/_next/static/chunks/b.css',
  '/_next/static/media/font.woff2',
];
const SHELL_HEADERS = {
  'content-type': 'text/html',
  'content-security-policy': "script-src 'nonce-ABC'",
};

interface Listener {
  (event: Record<string, unknown>): void;
}

function load(version = 'v1', files: readonly string[] = FILES) {
  const stores = new Map<string, Map<string, Response>>();
  const requested: string[] = [];
  const state = { online: true, tookOver: false };
  /** What the network says: a page of a person, the shell for `/shell`, and a body for anything else. */
  /** What a browser's fetch gives for a same-origin request: a response of type `basic`, which is the only kind the worker keeps. */
  const network = async (input: Request | string): Promise<Response> =>
    Object.defineProperty(await answer(input), 'type', { value: 'basic' });
  const answer = async (input: Request | string): Promise<Response> => {
    const request = typeof input === 'string' ? new Request(`${ORIGIN}${input}`) : input;
    requested.push(new URL(request.url).pathname);
    if (!state.online) throw new TypeError('no network');
    const path = new URL(request.url).pathname;
    if (path === '/shell')
      return new Response('<html>the shell, for everyone</html>', { headers: SHELL_HEADERS });
    if (/^\/(icons\/|manifest\.webmanifest|icon\.svg|favicon\.ico)/.test(path))
      return new Response('an icon', { headers: { 'content-type': 'image/png' } });
    if (path.startsWith('/_next/static/'))
      return new Response('file', { headers: { 'content-type': 'text/javascript' } });
    if (path.startsWith('/api/'))
      return new Response('{"name":"Ada","email":"ada@example.com"}', {
        headers: { 'content-type': 'application/json' },
      });
    return new Response(`<html>Ada Lovelace, ada@example.com ${path}</html>`, {
      headers: { 'content-type': 'text/html' },
    });
  };
  const cacheOf = (name: string) => {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    // The worker names what it keeps by its whole address (`self.location.origin + path`) or by its request.
    const keyOf = (r: Request | string) =>
      typeof r === 'string' ? new URL(r, ORIGIN).href : r.url;
    return {
      match: async (r: Request | string) => store.get(keyOf(r))?.clone(),
      put: async (r: Request | string, response: Response) => void store.set(keyOf(r), response),
      add: async (r: Request | string) => {
        const request = typeof r === 'string' ? new Request(`${ORIGIN}${r}`) : r;
        const response = await network(request);
        if (!response.ok) throw new TypeError('not ok');
        store.set(keyOf(request), response);
      },
    };
  };
  const listeners: Record<string, Listener> = {};
  const woken: unknown[] = [];
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  /** The windows of the app that are open, which a click on a notice may use. */
  const windows: { url: string }[] = [];
  const clients = {
    matchAll: async () => [
      // A page that can be told things but not taken anywhere (no `focus`): the sync wake-up's, and a click skips it.
      { url: `${ORIGIN}/`, postMessage: (message: unknown) => void woken.push(message) },
      ...windows.map((w) => ({
        url: w.url,
        postMessage: () => undefined,
        focus: async function (this: { navigate: (u: string) => Promise<void> }) {
          return this;
        },
        navigate: async (to: string) => void navigated.push(to),
      })),
    ],
    openWindow: async (to: string) => void opened.push(to),
    claim: async () => undefined,
  };
  const self = {
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) =>
        void shown.push({ title, options }),
    },
    clients,
    skipWaiting: () => void (state.tookOver = true),
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
  };
  const context = vm.createContext({
    self,
    caches: {
      open: async (name: string) => cacheOf(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: network,
    clients,
    Request,
    Response,
    Headers,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    TypeError,
    Promise,
    JSON,
    Math,
  });
  vm.runInContext(workerSource(version, files), context);

  /** Fires an event and settles what it asked to wait for. */
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners[type]?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) => void (answer = p),
    });
    // What it answers first, and then what it asked to wait for, which it may only ask once it has the answer.
    const response = answer ? await answer : undefined;
    await Promise.all(waits);
    return response;
  }
  const fetchEvent = (
    path: string,
    init: { mode?: string; method?: string; origin?: string } = {},
  ) => {
    const request = new Request(`${init.origin ?? ORIGIN}${path}`, {
      method: init.method ?? 'GET',
    });
    Object.defineProperty(request, 'mode', { value: init.mode ?? 'cors' });
    return dispatch('fetch', { request });
  };
  const kept = () =>
    [...stores.entries()].flatMap(([name, store]) =>
      [...store.keys()].map((url) => `${name} ${new URL(url).pathname}`),
    );
  return {
    dispatch,
    fetchEvent,
    kept,
    stores,
    state,
    requested,
    listeners,
    woken,
    shown,
    opened,
    navigated,
    windows,
  };
}

const allowed = (path: string) =>
  path === '/shell' ||
  path.startsWith('/_next/static/') ||
  /^\/(icon\.svg|favicon\.ico|manifest\.webmanifest|icons\/[a-z0-9._-]+)$/.test(path);

describe('the worker’s cache', () => {
  it('holds, once installed, the shell and the build’s files, in a cache named for the version', async () => {
    const w = load('v7');
    await w.dispatch('install');
    expect([...w.stores.keys()]).toEqual([`${CACHE_PREFIX}v7`]);
    expect(
      w
        .kept()
        .map((entry) => entry.split(' ')[1])
        .sort(),
    ).toEqual(['/shell', ...FILES].sort());
  });

  it('keeps nothing of a person after a signed-in tour of the cards, a card, Settings and the APIs', async () => {
    const w = load();
    await w.dispatch('install');
    const id = '11111111-1111-4111-8111-111111111111';
    for (const [path, init] of [
      ['/', { mode: 'navigate' }],
      ['/cards', { mode: 'navigate' }],
      [`/cards/${id}`, { mode: 'navigate' }],
      [`/cards/${id}/show`, { mode: 'navigate' }],
      ['/settings', { mode: 'navigate' }],
      ['/cards?_rsc=abc', {}],
      ['/api/sync', {}],
      ['/api/keys/root', {}],
      ['/api/auth/get-session', {}],
      ['/_next/static/chunks/a.js', {}],
      ['/icons/icon-192.png', {}],
    ] as const) {
      await w.fetchEvent(path, init);
    }
    const strangers = w.kept().filter((entry) => !allowed(entry.split(' ')[1] ?? ''));
    expect(strangers).toEqual([]);
  });

  it('answers a signed-in address with the shell, headers and all, with no network', async () => {
    const w = load();
    await w.dispatch('install');
    w.state.online = false;
    const id = '11111111-1111-4111-8111-111111111111';
    for (const path of [
      '/',
      '/unlock',
      '/cards',
      '/cards/new',
      `/cards/${id}`,
      `/cards/${id}/show`,
    ]) {
      const answer = await w.fetchEvent(path, { mode: 'navigate' });
      expect(await answer?.text(), path).toContain('the shell, for everyone');
      expect(answer?.headers.get('content-security-policy'), path).toBe("script-src 'nonce-ABC'");
    }
  });

  it('answers any other address with the shell too, which says it needs a connection (`OfflineApp`), and nothing of a person', async () => {
    const w = load();
    await w.dispatch('install');
    w.state.online = false;
    for (const path of ['/api/sync', '/cards/not-an-id', '/elsewhere']) {
      const answer = await w.fetchEvent(path, { mode: 'navigate' });
      expect(await answer?.text(), path).toBe('<html>the shell, for everyone</html>');
    }
  });

  it('answers with the suite’s offline page, with no script, when there is no shell yet', async () => {
    const w = load();
    w.state.online = false;
    const answer = await w.fetchEvent('/cards', { mode: 'navigate' });
    const body = (await answer?.text()) ?? '';
    expect(answer?.status).toBe(503);
    expect(body).toContain('You’re offline');
    expect(body).not.toMatch(/<script/i);
  });

  it('does not take over the pages that are open until one asks, which the registration does when the person chooses Reload', async () => {
    const w = load('v2');
    await w.dispatch('install');
    await w.dispatch('message', { data: 'something else' });
    expect(w.state.tookOver).toBe(false);
    await w.dispatch('message', { data: TAKE_OVER_MESSAGE });
    expect(w.state.tookOver).toBe(true);
  });

  it('removes the caches of older versions when it activates, and no other', async () => {
    const w = load('v2');
    w.stores.set(`${CACHE_PREFIX}v1`, new Map());
    w.stores.set('someone-elses', new Map());
    await w.dispatch('install');
    await w.dispatch('activate');
    expect([...w.stores.keys()].sort()).toEqual(['someone-elses', `${CACHE_PREFIX}v2`]);
  });

  it('wakes the pages that are open to sync when the browser says the connection is back, and answers no other tag', async () => {
    const w = load();
    await w.dispatch('sync', { tag: 'other' });
    expect(w.woken).toEqual([]);
    await w.dispatch('sync', { tag: 'wallet-sync' });
    expect(w.woken).toEqual([{ type: 'wallet-sync' }]);
  });

  it('does not touch a request for another origin or a write', async () => {
    const w = load();
    await w.dispatch('install');
    const before = w.requested.length;
    expect(
      await w.fetchEvent('/_next/static/chunks/a.js', { origin: 'https://elsewhere.test' }),
    ).toBeUndefined();
    expect(await w.fetchEvent('/api/sync', { method: 'POST' })).toBeUndefined();
    expect(w.requested.length).toBe(before);
  });
});
