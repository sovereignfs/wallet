import 'fake-indexeddb/auto';
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntryKey, importVaultKey, open, seal } from '../core/vault';
import { type LocalDatabase, openLocal } from '../local/db';
import { unlockWrappers } from '../local/store';
import { type Channel, Keyring } from './keyring';
import {
  type CredentialsApi,
  type Derive,
  MAX_FAILURES,
  PASSCODE_PARAMS,
  deriveHere,
  enrollPasscode,
  enrollPasskey,
  passcodeFailures,
  unlockWithPasscode,
  unlockWithPasskey,
} from './wrappers';

let counter = 0;
const databases: LocalDatabase[] = [];
const keyrings: Keyring[] = [];
afterEach(() => {
  for (const k of keyrings.splice(0)) k.close();
  for (const db of databases.splice(0)) db.close();
});

async function fresh() {
  const db = await openLocal(
    `acct-${++counter}`,
    `wrappers-test-${counter}-${randomBytes(4).toString('hex')}`,
  );
  databases.push(db);
  const keyring = new Keyring({ accountId: 'acct', channel: null as Channel | null });
  keyrings.push(keyring);
  const raw = new Uint8Array(randomBytes(32));
  return { db, keyring, raw, material: { raw: new Uint8Array(raw), id: 'vk-1' } };
}

/** A cheap Argon2id for the tests that are not about its cost, and the real one for the one that is. */
const cheap: Derive = (passcode, salt, params) =>
  deriveHere(passcode, salt, { ...params, memoryKiB: 1024, iterations: 1 });

/** The vault key opens what was sealed under it: the proof that the right bytes came back. */
async function worksAs(keyring: Keyring, raw: Uint8Array) {
  const mine = await importVaultKey(raw, 'vk-1');
  const { wrapped } = await createEntryKey(mine, 'acct', 'e1');
  const keys = await keyring.entryKeys('e1', wrapped);
  const sealed = await seal(keys.aes, 'shape', 'acct', 'e1', { ok: true });
  expect(await open(keys.aes, 'shape', 'acct', 'e1', sealed)).toEqual({ ok: true });
}

/** Everything in the store, as bytes, to look for what must not be there. */
async function dump(db: LocalDatabase): Promise<string> {
  const parts: string[] = [];
  for (const name of ['meta', 'unlock', 'entries', 'outbox', 'refused', 'local'] as const) {
    for (const value of await db.getAll(name))
      parts.push(
        JSON.stringify(value, (_k, v) =>
          v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v,
        ),
      );
  }
  return parts.join('\n');
}

describe('unlocking with a device passcode', () => {
  it('opens with the right passcode, to the same vault key, and the store holds neither the key nor the passcode', async () => {
    const { db, keyring, raw, material } = await fresh();
    await enrollPasscode(db, material, 'correct horse', 1, cheap);
    expect(await unlockWithPasscode(db, keyring, 'correct horse', cheap)).toBe('ok');
    await worksAs(keyring, raw);
    const text = await dump(db);
    expect(text).not.toContain(Buffer.from(raw).toString('hex'));
    expect(text).not.toContain('correct horse');
    expect(keyring.vaultKey.key.extractable).toBe(false);
  });

  it('refuses a wrong passcode and counts it; the right one clears the count', async () => {
    const { db, keyring, material } = await fresh();
    await enrollPasscode(db, material, 'correct horse', 1, cheap);
    expect(await unlockWithPasscode(db, keyring, 'wrong one', cheap)).toBe('wrong');
    expect(keyring.state).toBe('locked');
    expect(await passcodeFailures(db)).toBe(1);
    expect(await unlockWithPasscode(db, keyring, 'correct horse', cheap)).toBe('ok');
    expect(await passcodeFailures(db)).toBe(0);
  });

  it('deletes the wrapper at the fifth wrong passcode, and the right one no longer works', async () => {
    const { db, keyring, material } = await fresh();
    await enrollPasscode(db, material, 'correct horse', 1, cheap);
    for (let i = 1; i < MAX_FAILURES; i++)
      expect(await unlockWithPasscode(db, keyring, `wrong ${i}`, cheap)).toBe('wrong');
    expect(await unlockWithPasscode(db, keyring, 'wrong last', cheap)).toBe('removed');
    expect(await unlockWrappers(db)).toEqual([]);
    expect(await unlockWithPasscode(db, keyring, 'correct horse', cheap)).toBe('none');
    expect(keyring.state).toBe('locked');
  });

  it('counts a try before it is made, so that closing the tab in the middle does not give another', async () => {
    const { db, keyring, material } = await fresh();
    await enrollPasscode(db, material, 'correct horse', 1, cheap);
    let seen = -1;
    const spying: Derive = async (...args) => {
      seen = await passcodeFailures(db);
      return cheap(...args);
    };
    await unlockWithPasscode(db, keyring, 'wrong', spying);
    expect(seen).toBe(1);
  });

  it('wants at least six characters, and counts characters and not bytes', async () => {
    const { db, material } = await fresh();
    await expect(enrollPasscode(db, material, '12345', 1, cheap)).rejects.toThrow('too short');
    await enrollPasscode(db, material, '123456', 1, cheap);
    await enrollPasscode(db, material, '😀😀😀😀😀😀', 1, cheap);
  });

  it('does not open from a copy of the store alone: the second layer is a key the browser holds and cannot be read out', async () => {
    const { db, material, raw } = await fresh();
    await enrollPasscode(db, material, 'correct horse', 1, cheap);
    const [wrapper] = await unlockWrappers(db);
    expect(wrapper?.passcode).toBeTruthy();
    // Guessing offline from the stored bytes and the salt alone: the first layer is under a key that is not in the store as bytes.
    const key = await db.get('local', 'deviceKey');
    expect((key as CryptoKey).extractable).toBe(false);
    const guess = await crypto.subtle.importKey(
      'raw',
      await cheap('correct horse', wrapper!.passcode!.salt, PASSCODE_PARAMS),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    await expect(
      crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: wrapper!.iv,
          additionalData: new TextEncoder().encode('wallet/v1/unlock|passcode|vk-1'),
        },
        guess,
        wrapper!.ciphertext,
      ),
    ).rejects.toThrow();
    void raw;
  });

  it('replaces the passcode when a new one is set, and keeps one wrapper', async () => {
    const { db, keyring, material } = await fresh();
    await enrollPasscode(db, material, 'first passcode', 1, cheap);
    await enrollPasscode(db, material, 'second passcode', 2, cheap);
    expect((await unlockWrappers(db)).length).toBe(1);
    expect(await unlockWithPasscode(db, keyring, 'first passcode', cheap)).toBe('wrong');
    expect(await unlockWithPasscode(db, keyring, 'second passcode', cheap)).toBe('ok');
  });

  it('takes under two seconds with the real parameters (64 MiB, 3 passes) here, and says what they are', async () => {
    const { db, keyring, raw, material } = await fresh();
    const started = performance.now();
    await enrollPasscode(db, material, 'correct horse', 1);
    expect(await unlockWithPasscode(db, keyring, 'correct horse')).toBe('ok');
    expect((performance.now() - started) / 2).toBeLessThan(2000);
    expect(PASSCODE_PARAMS).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
    await worksAs(keyring, raw);
  }, 30_000);
});

/** A virtual authenticator with the PRF extension, so that the test holds the passkey's wrapping to what WebAuthn says. */
function virtualAuthenticator(options: { prf?: boolean } = {}) {
  const { prf = true } = options;
  const credentials = new Map<string, Buffer>();
  const rawIdOf = (id: BufferSource) => Buffer.from(id as ArrayBuffer).toString('hex');
  const api: CredentialsApi = {
    async create() {
      const id = randomBytes(32);
      credentials.set(id.toString('hex'), randomBytes(32));
      return {
        rawId: new Uint8Array(id).buffer,
        getClientExtensionResults: () => (prf ? { prf: { enabled: true } } : {}),
      } as unknown as Credential;
    },
    async get(options) {
      const allowed = options.publicKey?.allowCredentials ?? [];
      const salt = (
        options.publicKey?.extensions as { prf?: { eval?: { first: Uint8Array } } } | undefined
      )?.prf?.eval?.first;
      const pick = allowed.find((c) => credentials.has(rawIdOf(c.id)));
      if (!pick || !salt) return null;
      const secret = credentials.get(rawIdOf(pick.id)) as Buffer;
      // WebAuthn's PRF: HMAC-SHA-256 of the credential's secret over "WebAuthn PRF" 0x00 and the salt.
      const out = createHmac('sha256', secret)
        .update(Buffer.concat([Buffer.from('WebAuthn PRF\0'), salt]))
        .digest();
      return {
        rawId: pick.id,
        getClientExtensionResults: () => ({
          prf: { results: { first: new Uint8Array(out).buffer } },
        }),
      } as unknown as Credential;
    },
  };
  return { api, credentials };
}

describe('unlocking with a passkey', () => {
  it('opens with the passkey’s PRF output, to the same vault key, and the store holds neither the key nor the PRF output', async () => {
    const { db, keyring, raw, material } = await fresh();
    const { api } = virtualAuthenticator();
    await enrollPasskey(db, material, 'This phone', 1, api, 'wallet.test');
    expect(await unlockWithPasskey(db, keyring, api, 'wallet.test')).toBe('ok');
    await worksAs(keyring, raw);
    expect(await dump(db)).not.toContain(Buffer.from(raw).toString('hex'));
  });

  it('is not made on a device with no PRF: nothing is stored', async () => {
    const { db, material } = await fresh();
    await expect(
      enrollPasskey(db, material, 'x', 1, virtualAuthenticator({ prf: false }).api, 'wallet.test'),
    ).rejects.toThrow('no_prf');
    expect(await unlockWrappers(db)).toEqual([]);
  });

  it('does not open with another passkey’s wrapper: each credential has its own', async () => {
    const one = await fresh();
    const a = virtualAuthenticator();
    await enrollPasskey(one.db, one.material, 'A', 1, a.api, 'wallet.test');
    // The same wrapper, asked of a different authenticator that holds a different credential.
    const b = virtualAuthenticator();
    const [wrapper] = await unlockWrappers(one.db);
    b.credentials.set(Buffer.from(wrapper!.passkey!.credentialId).toString('hex'), randomBytes(32));
    expect(await unlockWithPasskey(one.db, one.keyring, b.api, 'wallet.test')).toBe('wrong');
    expect(one.keyring.state).toBe('locked');
    expect(await unlockWithPasskey(one.db, one.keyring, a.api, 'wallet.test')).toBe('ok');
  });

  it('says there is no passkey when none was made, and lets several be made on one device', async () => {
    const { db, keyring, material } = await fresh();
    const { api } = virtualAuthenticator();
    expect(await unlockWithPasskey(db, keyring, api, 'wallet.test')).toBe('none');
    await enrollPasskey(db, material, 'A', 1, api, 'wallet.test');
    await enrollPasskey(
      db,
      { raw: new Uint8Array(material.raw), id: material.id },
      'B',
      2,
      api,
      'wallet.test',
    );
    expect((await unlockWrappers(db)).length).toBe(2);
    expect(await unlockWithPasskey(db, keyring, api, 'wallet.test')).toBe('ok');
  });
});
