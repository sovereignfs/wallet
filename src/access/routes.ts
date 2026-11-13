/**
 * Every page and route of the app, and who may use it (DESIGN.md §5.2). A route that is not here, or is here with a method it does not have, fails
 * `routes.test.ts`, so that a new endpoint cannot be added without saying who may call it, and a decision in this table cannot outlive the route.
 *
 *  - `public`: anyone, signed in or not. It shows nothing that belongs to an account. A public route that changes something says what stands in
 *    for a session in `because`, and the test refuses one that does not.
 *  - `account`: a signed-in account, and only its own data. A page asks `requireAccount()`; a route is wrapped in `accountRoute` (`route.ts`),
 *    which finds the session, checks `Origin` on a write and hands over the account id. The test holds both to it.
 *
 * Every row of an account carries `account_id`, and the permission is in the statement; a refusal reads as not found. The rules between accounts arrive with sharing (phase 4).
 */
export type RouteAccess = { kind: 'public'; because?: string } | { kind: 'account' };

export interface RouteRule {
  /** The route as the app router spells it: `/api/vault`. */
  route: string;
  /** For an API route, each method it answers. A page has none. */
  methods?: Record<string, RouteAccess>;
  /** For a page. */
  page?: RouteAccess;
}

export const ROUTES: RouteRule[] = [
  // Pages
  { route: '/', page: { kind: 'public' } },
  { route: '/sign-in', page: { kind: 'public' } },
  { route: '/sign-up', page: { kind: 'public' } },
  // Only with mail (DESIGN.md §6): without it they are 404, like the routes under /api/auth that send and use the links.
  { route: '/forgot-password', page: { kind: 'public' } },
  { route: '/reset-password', page: { kind: 'public' } },
  // The page the service worker keeps (DESIGN.md §26.6): the same for everyone, with nothing of an account in it. Who is signed in is read on the device.
  { route: '/shell', page: { kind: 'public' } },
  // The app, for someone signed in: the layout around it (`app/(app)/layout.tsx`) finds who, and each page asks for itself as well. Unlocking is the browser's:
  // these pages hold no entry, and the server could not open one.
  // Home: the front address `/` shows it to someone signed in (the proxy rewrites it), and `/home` itself is sent back to `/`.
  { route: '/home', page: { kind: 'account' } },

  // APIs
  // The one door every write to an entry comes through (DESIGN.md §11.3): the account is the session's, and the server applies what a device sends only to it.
  { route: '/api/sync', methods: { POST: { kind: 'account' } } },
  // The vault header and its recipients (DESIGN.md §7.4, §8.1): read by the account's devices, made once. Only public keys and a sealed header; the account is the session's.
  { route: '/api/vault', methods: { GET: { kind: 'account' }, POST: { kind: 'account' } } },
  // Deleting the account (DESIGN.md §28): what it would do, and doing it with the password; the account is the session's.
  {
    route: '/api/account/delete',
    methods: { GET: { kind: 'account' }, POST: { kind: 'account' } },
  },
  { route: '/api/health', methods: { GET: { kind: 'public' } } },
  // The service worker's text (DESIGN.md §26.6): the same for everyone, the build's version and the names of its files, and nothing of an account.
  { route: '/sw.js', methods: { GET: { kind: 'public' } } },
  // What Sovereign tells the app (DESIGN.md §25.2): a person's session there ended, or they deleted their account. The signed token in the body is the credential, checked
  // against core's keys by the SDK; there is no session and no `Origin`. Absent, with a 404, where Sovereign sign-in is not set up.
  {
    route: '/api/sovereign/backchannel-logout',
    methods: {
      POST: { kind: 'public', because: 'a token signed by Sovereign, checked against its keys' },
    },
  },
  {
    route: '/api/sovereign/account-deleted',
    methods: {
      POST: { kind: 'public', because: 'a token signed by Sovereign, checked against its keys' },
    },
  },
  // better-auth's own: it checks `Origin` and the session cookie itself, and rate-limits sign-in (src/auth/auth.ts). Absent, with a 404, when sign-in is off.
  {
    route: '/api/auth/[...all]',
    methods: {
      GET: { kind: 'public' },
      POST: {
        kind: 'public',
        because: 'better-auth checks Origin, the session cookie and the rate limit',
      },
    },
  },
];
