import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import { formatKit } from '@sovereignfs/sdk/keys';
import { AppVault, vaultRoute } from '@sovereignfs/sdk/vault';
import { sql } from 'drizzle-orm';
import { createAuth } from '../src/auth/auth';
import type { AuthSettings } from '../src/auth/config';
import { loadConfig } from '../src/config';
import { processEnv } from '../src/config/env';
import { toBase64Url } from '../src/core/encoding';
import { type CardColor, type CardType, newCard } from '../src/core/entries';
import type { MutationWire } from '../src/core/sync/protocol';
import {
  FIRST_EPOCH,
  deriveEntryKey,
  importRoot,
  newRoot,
  seal,
  unwrapRoot,
  wrapRoot,
} from '../src/core/vault';
import { suiteCipher } from '../src/keys/cipher';
import { keepRoot, readRoots } from '../src/server/keyring';
import type { Database } from '../src/db/client';
import type { DatabaseConfig } from '../src/db/config';
import { getStores } from '../src/db/boot';
import { dbGet } from '../src/db/exec';
import * as postgresSchema from '../src/db/schema/postgres';
import * as sqliteSchema from '../src/db/schema/sqlite';
import { applyMutation } from '../src/server/entries/apply';
import { deletePerson } from '../src/sovereign/people';

/**
 * A wallet for development (DESIGN.md §30, task 20.1). **It is made the way the app makes one:** the SDK's own `localVault` makes the account's keys from the seed
 * password (with an in-process answer where a browser would ask the server), Wallet's format (`src/core/vault`) makes the keyring root and every sealed value, and
 * the same `applyMutation` the sync endpoint uses stores them, so what it makes is what a browser would have, with the checks the server makes. Nothing is
 * written to a table directly except to take it away.
 *
 * - **The password and the recovery kit are for development only:** the password is `SEED_PASSWORD`, and `seed/recovery-kit.txt` is the kit. Signing in with the
 *   password opens the seeded wallet in the browser, which asks for a passcode or a passkey for the device once. It refuses to run when `NODE_ENV=production`, and
 *   on a database that is not on this machine.
 * - **Idempotent.** Every entry's id is derived from the account and a name, so running it again finds them there and changes nothing.
 * - **Removes only its own:** `--reset` and `--remove` delete the seeded account through `People.deletePerson`, and the kit.
 * - It grows with the features: a feature that has a shape worth looking at adds it here, in the task that builds it.
 */
export const SEED_EMAIL = 'seed@example.test';
/** A password for a development database on this machine, and for nothing else. */
export const SEED_PASSWORD = 'wallet-development-only';
export const SEED_NAME = 'Seed Person';
export const SEED_DIR = join(import.meta.dirname, '..', 'seed');

/** Whether a database is on this machine: a file always is, and a service is when its host is. */
export function isLocalDatabase(config: DatabaseConfig): boolean {
  const local = (host: string) =>
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
  if (config.dialect === 'postgres') return local(new URL(config.url).hostname);
  if (config.form === 'file') return true;
  return local(new URL(config.url).hostname) && local(new URL(config.adminUrl).hostname);
}

const schema = (database: Database) =>
  database.dialect === 'postgres' ? postgresSchema : sqliteSchema;

/** An id that is the same for the same account and name every time, in the shape of a version 4 UUID. */
export function derivedId(accountId: string, name: string): string {
  const h = createHash('sha256').update(`wallet-seed|${accountId}|${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

interface Seeded {
  readonly name: string;
  readonly title: string;
  readonly payload: string;
  readonly cardType: CardType;
  readonly color: CardColor;
  readonly favourite?: boolean;
  readonly archived?: boolean;
  readonly cardNumber?: string;
  readonly notes?: string;
}

/** Cards that show what the screens have to cope with: every type and colour, favourites and an archived one, Unicode, and the longest a code may be. */
export const CARDS: readonly Seeded[] = [
  {
    name: 'market',
    title: 'Corner Market',
    payload: 'MARKET-4711-0042',
    cardType: 'loyalty',
    color: 'green',
    favourite: true,
    cardNumber: '4711 0042',
  },
  {
    name: 'metro',
    title: 'City Metro',
    payload: 'https://transit.example.test/pass/9f3a1c',
    cardType: 'transport',
    color: 'blue',
    favourite: true,
  },
  {
    name: 'gym',
    title: 'Riverside Gym',
    payload: 'MEMBER:GYM:882311',
    cardType: 'membership',
    color: 'red',
    notes: 'Bring a towel. Guests on Saturdays.',
  },
  {
    name: 'library',
    title: 'Public Library',
    payload: 'LIB-00031337',
    cardType: 'library',
    color: 'amber',
    cardNumber: '0003 1337',
  },
  {
    name: 'gift',
    title: 'Bookshop gift card',
    payload: 'GIFT-7D4F-22C1-9B0A',
    cardType: 'gift',
    color: 'accent',
    notes: '£25. Expires next June.',
  },
  {
    name: 'office',
    title: 'Office door',
    payload: 'ACCESS:OFFICE:5521',
    cardType: 'access',
    color: 'slate',
  },
  {
    name: 'unicode',
    title: 'カフェ・ドリーム ☕',
    payload: 'Ünïcödé · 日本語 · العربية · 😀',
    cardType: 'loyalty',
    color: 'amber',
  },
  {
    name: 'old',
    title: 'Old supermarket',
    payload: 'OLD-SUPERMARKET-1',
    cardType: 'loyalty',
    color: 'slate',
    archived: true,
  },
  {
    name: 'longest',
    title: 'The longest code a card may carry',
    payload: '0123456789'.repeat(204) + '01234567',
    cardType: 'other',
    color: 'slate',
  },
];

export interface SeedResult {
  readonly created: boolean;
  readonly accountId: string;
  readonly cards: number;
  readonly kitFile: string;
}

async function findUser(auth: AuthStore): Promise<string | undefined> {
  const { rows } = await auth.run('SELECT id FROM users WHERE email = ?', [SEED_EMAIL]);
  return rows[0] ? String(rows[0].id) : undefined;
}

async function makeUser(auth: AuthStore, settings: AuthSettings): Promise<string> {
  const instance = createAuth({
    settings: { ...settings, signUp: 'open' },
    name: 'Wallet',
    database: auth,
  });
  const made = await instance.api.signUpEmail({
    body: { name: SEED_NAME, email: SEED_EMAIL, password: await signInValue(auth) },
  });
  return made.user.id;
}

/**
 * What the sign-in page sends for `SEED_PASSWORD` (auth.md §4, rule 1): the value the page derives from it with this instance's vault id
 * (`/api/sign-in-salt`), so that the account signs in by hand with the password.
 */
async function signInValue(auth: AuthStore): Promise<string> {
  const { localVault } = await import('@sovereignfs/sdk/local-vault');
  const none = {
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
  };
  const vault = localVault({
    clientId: 'wallet',
    vaultId: await new AppVault(auth).vaultId(),
    backend: none,
  });
  return (await vault.derive(SEED_PASSWORD, SEED_EMAIL.trim().toLowerCase())).signIn;
}

/**
 * The seeded account's keyring root, as a browser would have it: the suite's keys set up from the seed password through `localVault` (the first time), the app
 * key opened, and the root made, wrapped under it and kept (the first time) or read back and opened. The session's secret is a random one for this run.
 */
export async function seedRoot(
  stores: { app: Database; authStore: AuthStore },
  accountId: string,
  kitFile: string,
  now: number,
): Promise<CryptoKey> {
  const { localVault } = await import('@sovereignfs/sdk/local-vault');
  const origin = 'http://seed.invalid';
  const vault = new AppVault(stores.authStore);
  const route = vaultRoute(vault, { origin });
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const kept = new Map<string, unknown>();
  const local = localVault({
    clientId: 'wallet',
    vaultId: await vault.vaultId(),
    path: '/api/keys/vault',
    secretPath: '/api/auth/sv/key-secret',
    backend: {
      get: async (key) => kept.get(key),
      set: async (key, value) => void kept.set(key, value),
      delete: async (key) => void kept.delete(key),
    },
    fetch: async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        origin,
      );
      if (url.pathname === '/api/auth/sv/key-secret')
        return Response.json({ sub: accountId, secret });
      if (url.pathname === '/api/keys/vault') {
        const headers = new Headers(init?.headers);
        headers.set('origin', origin);
        return route(new Request(url, { ...init, headers }), accountId);
      }
      return new Response(null, { status: 404 });
    },
  });
  const derived = await local.derive(SEED_PASSWORD, SEED_EMAIL.trim().toLowerCase());
  if ((await local.afterSignIn(derived.secret)) === 'locked')
    throw new Error(
      'the seeded account’s keys do not open with the seed password: run pnpm seed -- --reset',
    );
  if (await local.kitPending()) {
    const kit = crypto.getRandomValues(new Uint8Array(32));
    if (!(await local.keepKit(kit))) throw new Error('the recovery kit could not be kept');
    mkdirSync(dirname(kitFile), { recursive: true });
    writeFileSync(kitFile, `${await formatKit(kit)}\n`, { mode: 0o600 });
  }
  const opened = await local.open();
  if (opened.state !== 'open') throw new Error('the seeded account’s app key did not open');
  const stored = (await readRoots(stores.app, accountId)).find(
    (each) => each.epoch === FIRST_EPOCH,
  );
  if (stored)
    return importRoot(await unwrapRoot(opened.key, accountId, FIRST_EPOCH, stored.wrapped));
  const bytes = newRoot();
  const wrapped = await wrapRoot(opened.key, accountId, FIRST_EPOCH, bytes);
  if (
    !(await keepRoot(
      stores.app,
      accountId,
      { epoch: FIRST_EPOCH, wrapped: Buffer.from(wrapped) },
      now,
    ))
  )
    throw new Error('the keyring root could not be kept');
  const root = await importRoot(bytes);
  bytes.fill(0);
  return root;
}

export async function runSeed(
  stores: { app: Database; authStore: AuthStore },
  settings: AuthSettings,
  options: { now?: number; dir?: string } = {},
): Promise<SeedResult> {
  const now = options.now ?? Date.now();
  const dir = options.dir ?? SEED_DIR;
  const kitFile = join(dir, 'recovery-kit.txt');
  let accountId = await findUser(stores.authStore);
  const created = accountId === undefined;
  accountId ??= await makeUser(stores.authStore, settings);

  // The account's keys: made once, by the SDK's `localVault` over this database, with the answers a browser would get from the server given in this process.
  const root = await seedRoot(stores, accountId, kitFile, now);
  const cipher = suiteCipher;

  let made = 0;
  let position = 0;
  for (const card of CARDS) {
    position += 1;
    const entryId = derivedId(accountId, card.name);
    const exists = await dbGet(
      stores.app,
      sql`SELECT id FROM ${schema(stores.app).entry} WHERE id = ${entryId}`,
    );
    if (exists) continue;
    const model = newCard({
      title: card.title,
      payload: card.payload,
      cardType: card.cardType,
      color: card.color,
      favourite: card.favourite ?? false,
      archived: card.archived ?? false,
      cardNumber: card.cardNumber ?? '',
      notes: card.notes ?? '',
      position,
    });
    const key = await deriveEntryKey(cipher, root, accountId, entryId);
    const mutation: MutationWire = {
      id: derivedId(accountId, `${card.name}:mutation`),
      op: 'put',
      entryId,
      baseVersion: 0,
      tier: 'synced',
      keyEpoch: FIRST_EPOCH,
      shape: toBase64Url(
        await seal(cipher, key, 'shape', accountId, entryId, FIRST_EPOCH, model.shape),
      ),
      body: toBase64Url(
        await seal(cipher, key, 'body', accountId, entryId, FIRST_EPOCH, model.body),
      ),
    };
    const result = await applyMutation(stores.app, accountId, mutation, {
      now,
      limits: { storageBytes: 500 * 1024 * 1024, entryBodyBytes: 256 * 1024, entries: 50_000 },
    });
    if (result.status === 'refused')
      throw new Error(`the seed was refused (${result.code}) for ${card.name}`);
    made += 1;
  }
  return { created, accountId, cards: made, kitFile };
}

export async function removeSeed(
  stores: { app: Database; authStore: AuthStore },
  dir = SEED_DIR,
): Promise<boolean> {
  const accountId = await findUser(stores.authStore);
  rmSync(dir, { recursive: true, force: true });
  if (!accountId) return false;
  await deletePerson(
    { database: stores.app, authDatabase: stores.authStore, now: Date.now },
    accountId,
  );
  return true;
}

export async function main(argv: string[]): Promise<number> {
  if (processEnv().NODE_ENV === 'production') {
    console.error(
      'Refused: the seed makes keys and an account with a password that are written in its source and in seed/.',
    );
    return 1;
  }
  const loaded = loadConfig(processEnv());
  if (!loaded.ok) {
    console.error('The settings are wrong:');
    for (const problem of loaded.problems) console.error(`  - ${problem}`);
    return 1;
  }
  if (!isLocalDatabase(loaded.config.database.database)) {
    console.error(
      'Refused: the database is not on this machine, and the seed makes an account with a password that is written in its source.',
    );
    return 1;
  }
  if (!loaded.config.auth?.local) {
    console.error(
      'Local sign-in is not set up (WALLET_AUTH_LOCAL, WALLET_AUTH_SECRET, WALLET_URL), and the seed needs an account with a password.',
    );
    return 1;
  }
  const stores = await getStores(loaded.config.database);
  try {
    if (argv.includes('--remove') || argv.includes('--reset'))
      console.log(
        (await removeSeed(stores))
          ? 'Removed the seed account and its keys.'
          : 'There was no seed account.',
      );
    if (argv.includes('--remove')) return 0;
    const result = await runSeed(stores, loaded.config.auth);
    console.log(
      `${result.created ? 'Made' : 'Found'} ${SEED_EMAIL}; ${result.cards} cards ${result.cards === 0 ? 'were already there' : 'made'}.`,
    );
    console.log(
      `Sign in with ${SEED_EMAIL} and the password in scripts/seed.ts (SEED_PASSWORD); the recovery kit is in ${result.kitFile}.`,
    );
    console.log('They are for development only and are not committed.');
    return 0;
  } finally {
    await stores.close();
  }
}
