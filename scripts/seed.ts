import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { createAuth } from '../src/auth/auth';
import type { AuthSettings } from '../src/auth/config';
import { loadConfig } from '../src/config';
import { processEnv } from '../src/config/env';
import { toBase64Url } from '../src/core/encoding';
import { type CardColor, type CardType, newCard } from '../src/core/entries';
import type { MutationWire } from '../src/core/sync/protocol';
import {
  createEntryKey,
  createIdentity,
  createVaultHeader,
  importVaultKey,
  keyFile,
  openHeader,
  parseIdentity,
  seal,
} from '../src/core/vault';
import type { Database } from '../src/db/client';
import type { DatabaseConfig } from '../src/db/config';
import { getStores } from '../src/db/boot';
import { dbGet } from '../src/db/exec';
import * as postgresSchema from '../src/db/schema/postgres';
import * as sqliteSchema from '../src/db/schema/sqlite';
import { applyMutation } from '../src/server/entries/apply';
import { createVault, readVault } from '../src/server/vault';
import { deletePerson } from '../src/sovereign/people';

/**
 * A wallet for development (DESIGN.md §30, task 20.1). **It is made the way the app makes one:** the same vault format (`src/core/vault`) makes the keys, the
 * header and every sealed value, and the same `applyMutation` the sync endpoint uses stores them, so what it makes is what a browser would have, with the
 * checks the server makes. Nothing is written to a table directly except to take it away.
 *
 * - **The key is written to `seed/` (development only):** `seed/wallet-key.txt` opens the seeded wallet in the browser, and `seed/recovery-key.txt` does too.
 *   It refuses to run when `NODE_ENV=production`, and on a database that is not on this machine.
 * - **Idempotent.** Every entry's id is derived from the account and a name, so running it again finds them there and changes nothing.
 * - **Removes only its own:** `--reset` and `--remove` delete the seeded account through `People.deletePerson`, and the key files.
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
  readonly keyFile: string;
  readonly recoveryFile: string;
}

async function findUser(auth: Database): Promise<string | undefined> {
  const row = await dbGet<{ id: string }>(
    auth,
    sql`SELECT id FROM ${schema(auth).user} WHERE email = ${SEED_EMAIL}`,
  );
  return row?.id;
}

async function makeUser(auth: Database, settings: AuthSettings): Promise<string> {
  const instance = createAuth({
    settings: { ...settings, signUp: 'open' },
    name: 'Wallet',
    database: auth,
  });
  const made = await instance.api.signUpEmail({
    body: { name: SEED_NAME, email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  return made.user.id;
}

export async function runSeed(
  stores: { app: Database; auth: Database },
  settings: AuthSettings,
  options: { now?: number; dir?: string } = {},
): Promise<SeedResult> {
  const now = options.now ?? Date.now();
  const dir = options.dir ?? SEED_DIR;
  const walletFile = join(dir, 'wallet-key.txt');
  const recoveryFile = join(dir, 'recovery-key.txt');
  let accountId = await findUser(stores.auth);
  const created = accountId === undefined;
  accountId ??= await makeUser(stores.auth, settings);

  // The vault: made once, with a wallet key and a recovery key, written to `seed/` so that a browser can open it.
  let vaultRecord = await readVault(stores.app, accountId);
  if (!vaultRecord) {
    const wallet = await createIdentity();
    const recovery = await createIdentity();
    const header = await createVaultHeader([wallet.recipient, recovery.recipient], new Date(now));
    const made = await createVault(
      stores.app,
      accountId,
      {
        recipients: [
          { recipient: wallet.recipient, label: 'wallet', addedAt: now },
          { recipient: recovery.recipient, label: 'recovery', addedAt: now },
        ],
        header: Buffer.from(header.header),
        vaultKeyId: header.contents.id,
      },
      now,
    );
    if (!made) throw new Error('the vault could not be made');
    mkdirSync(dir, { recursive: true });
    writeFileSync(walletFile, keyFile(wallet, 'wallet', new Date(now)), { mode: 0o600 });
    writeFileSync(recoveryFile, keyFile(recovery, 'recovery', new Date(now)), { mode: 0o600 });
    vaultRecord = await readVault(stores.app, accountId);
  }
  if (!vaultRecord) throw new Error('the vault is not there');
  if (!existsSync(walletFile))
    throw new Error(`the vault exists and ${walletFile} does not: run pnpm seed -- --reset`);
  const parsed = await parseIdentity(readFileSync(walletFile, 'utf8'));
  if (!parsed.ok) throw new Error('the key file is not a key');
  const opened = await openHeader(new Uint8Array(vaultRecord.header), parsed.identity);
  const vault = await importVaultKey(opened.raw, opened.id);

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
    const { keys, wrapped } = await createEntryKey(vault, accountId, entryId);
    const mutation: MutationWire = {
      id: derivedId(accountId, `${card.name}:mutation`),
      op: 'put',
      entryId,
      baseVersion: 0,
      tier: 'synced',
      wrappedKey: toBase64Url(wrapped),
      shape: toBase64Url(await seal(keys.aes, 'shape', accountId, entryId, model.shape)),
      body: toBase64Url(await seal(keys.aes, 'body', accountId, entryId, model.body)),
    };
    const result = await applyMutation(stores.app, accountId, mutation, {
      now,
      limits: { storageBytes: 500 * 1024 * 1024, entryBodyBytes: 256 * 1024, entries: 50_000 },
    });
    if (result.status === 'refused')
      throw new Error(`the seed was refused (${result.code}) for ${card.name}`);
    made += 1;
  }
  return { created, accountId, cards: made, keyFile: walletFile, recoveryFile };
}

export async function removeSeed(
  stores: { app: Database; auth: Database },
  dir = SEED_DIR,
): Promise<boolean> {
  const accountId = await findUser(stores.auth);
  rmSync(dir, { recursive: true, force: true });
  if (!accountId) return false;
  await deletePerson({ database: stores.app, authDatabase: stores.auth, now: Date.now }, accountId);
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
      `Sign in with ${SEED_EMAIL} and the password in scripts/seed.ts (SEED_PASSWORD), then unlock with the key in ${result.keyFile}`,
    );
    console.log(
      `(or the recovery key in ${result.recoveryFile}). They are for development only and are not committed.`,
    );
    return 0;
  } finally {
    await stores.close();
  }
}
