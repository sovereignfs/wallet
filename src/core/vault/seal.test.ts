import { createCipheriv, createDecipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { concat, encoder, fromHex, randomBytes, toHex } from './bytes';
import { MalformedError, TamperedError, UnsupportedVersionError } from './errors';
import {
  type VaultKey,
  createEntryKey,
  importVaultKey,
  unwrapEntryKey,
  WRAPPED_BYTES,
} from './keys';
import { BUCKETS, pad, unpad } from './padding';
import { aadOf, open, seal, sealedLength, sealWithNonce } from './seal';
import { wrapEntryKeyBytes } from './keys';

const ACCOUNT = 'acct-1';
const ENTRY = 'entry-1';

async function vaultKey(id = 'vk1'): Promise<VaultKey> {
  return importVaultKey(randomBytes(32), id);
}

async function entry(vault?: VaultKey) {
  const v = vault ?? (await vaultKey());
  const { keys, wrapped } = await createEntryKey(v, ACCOUNT, ENTRY);
  return { v, keys, wrapped };
}

describe('padding', () => {
  it('fills to the next multiple of the bucket, with 0x80 then zeros', () => {
    const padded = pad(encoder.encode('abc'), 256);
    expect(padded.length).toBe(256);
    expect(Array.from(padded.subarray(0, 5))).toEqual([0x61, 0x62, 0x63, 0x80, 0]);
    expect(Array.from(unpad(padded))).toEqual([0x61, 0x62, 0x63]);
  });

  it('gives a value that exactly fills a bucket a whole bucket more, since the marker needs room', () => {
    expect(pad(new Uint8Array(255), 256).length).toBe(256);
    expect(pad(new Uint8Array(256), 256).length).toBe(512);
    expect(pad(new Uint8Array(0), 256).length).toBe(256);
  });

  it('refuses a value with no marker', () => {
    expect(() => unpad(new Uint8Array(256))).toThrow(TamperedError);
    expect(() => unpad(Uint8Array.of(1, 2, 3))).toThrow(TamperedError);
  });
});

describe('sealing a shape or a body', () => {
  it('round-trips JSON, and pads the sealed value to the bucket', async () => {
    const { keys } = await entry();
    const value = { kind: 'card', title: 'Gym ✓', n: [1, 2, 3], nested: { a: null } };
    for (const part of ['shape', 'body'] as const) {
      const sealed = await seal(keys.aes, part, ACCOUNT, ENTRY, value);
      expect(sealed[0]).toBe(0x01);
      expect(sealed.length - 1 - 12 - 16 + 0).toBe(BUCKETS[part]);
      expect(await open(keys.aes, part, ACCOUNT, ENTRY, sealed)).toEqual(value);
    }
  });

  it('makes a new nonce for every seal', async () => {
    const { keys } = await entry();
    const a = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { x: 1 });
    const b = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { x: 1 });
    expect(toHex(a.subarray(1, 13))).not.toBe(toHex(b.subarray(1, 13)));
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('hides the length of a title: two titles in one bucket seal to the same size', async () => {
    const { keys } = await entry();
    const a = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { title: 'A' });
    const b = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, {
      title: 'A much longer title than the first',
    });
    expect(a.length).toBe(b.length);
  });

  it('predicts the sealed length', async () => {
    const { keys } = await entry();
    for (const [part, size] of [
      ['shape', 10],
      ['shape', 255],
      ['shape', 256],
      ['body', 1023],
      ['body', 1500],
    ] as const) {
      const json = JSON.stringify({ s: 'x'.repeat(size - 8) });
      const sealed = await seal(keys.aes, part, ACCOUNT, ENTRY, JSON.parse(json));
      expect(sealed.length).toBe(sealedLength(part, encoder.encode(json).length));
    }
  });

  it('fails to open when any byte is changed, wherever it is', async () => {
    const { keys } = await entry();
    const sealed = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { title: 'x' });
    for (let i = 1; i < sealed.length; i += 7) {
      const changed = Uint8Array.from(sealed);
      changed[i] = (changed[i] ?? 0) ^ 0x01;
      await expect(
        open(keys.aes, 'shape', ACCOUNT, ENTRY, changed),
        `byte ${i}`,
      ).rejects.toBeInstanceOf(TamperedError);
    }
  });

  it('fails when the part, the entry or the account is not the one it was sealed for', async () => {
    const { keys } = await entry();
    const sealed = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { title: 'x' });
    await expect(open(keys.aes, 'body', ACCOUNT, ENTRY, sealed)).rejects.toBeInstanceOf(
      TamperedError,
    );
    await expect(open(keys.aes, 'shape', ACCOUNT, 'entry-2', sealed)).rejects.toBeInstanceOf(
      TamperedError,
    );
    await expect(open(keys.aes, 'shape', 'acct-2', ENTRY, sealed)).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('fails under another entry key', async () => {
    const one = await entry();
    const two = await entry();
    const sealed = await seal(one.keys.aes, 'shape', ACCOUNT, ENTRY, { title: 'x' });
    await expect(open(two.keys.aes, 'shape', ACCOUNT, ENTRY, sealed)).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('says a version it does not know is unsupported, and a value that is too short is malformed', async () => {
    const { keys } = await entry();
    const sealed = await seal(keys.aes, 'shape', ACCOUNT, ENTRY, { title: 'x' });
    const newer = Uint8Array.from(sealed);
    newer[0] = 0x02;
    await expect(open(keys.aes, 'shape', ACCOUNT, ENTRY, newer)).rejects.toBeInstanceOf(
      UnsupportedVersionError,
    );
    await expect(open(keys.aes, 'shape', ACCOUNT, ENTRY, new Uint8Array(0))).rejects.toBeInstanceOf(
      MalformedError,
    );
    await expect(
      open(keys.aes, 'shape', ACCOUNT, ENTRY, sealed.subarray(0, 20)),
    ).rejects.toBeInstanceOf(MalformedError);
  });

  it('does not seal what is not JSON', async () => {
    const { keys } = await entry();
    await expect(seal(keys.aes, 'shape', ACCOUNT, ENTRY, undefined)).rejects.toBeInstanceOf(
      MalformedError,
    );
  });
});

describe('wrapping an entry key', () => {
  it('unwraps to keys that open what the first sealed', async () => {
    const v = await vaultKey();
    const { keys, wrapped } = await createEntryKey(v, ACCOUNT, ENTRY);
    expect(wrapped.length).toBe(WRAPPED_BYTES);
    const again = await unwrapEntryKey(v, ACCOUNT, ENTRY, wrapped);
    const sealed = await seal(keys.aes, 'body', ACCOUNT, ENTRY, { n: 1 });
    expect(await open(again.aes, 'body', ACCOUNT, ENTRY, sealed)).toEqual({ n: 1 });
  });

  it('gives keys that cannot be read back out', async () => {
    const { keys } = await entry();
    expect(keys.aes.extractable).toBe(false);
    expect(keys.hkdf.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', keys.aes)).rejects.toThrow();
    const v = await vaultKey();
    expect(v.key.extractable).toBe(false);
  });

  it('refuses a wrapped key moved to another entry or account, or under another vault key or id', async () => {
    const v = await vaultKey('vk1');
    const { wrapped } = await createEntryKey(v, ACCOUNT, ENTRY);
    await expect(unwrapEntryKey(v, ACCOUNT, 'entry-2', wrapped)).rejects.toBeInstanceOf(
      TamperedError,
    );
    await expect(unwrapEntryKey(v, 'acct-2', ENTRY, wrapped)).rejects.toBeInstanceOf(TamperedError);
    await expect(
      unwrapEntryKey(await vaultKey('vk1'), ACCOUNT, ENTRY, wrapped),
    ).rejects.toBeInstanceOf(TamperedError);
    const sameKeyOtherId = { key: v.key, id: 'vk2' };
    await expect(unwrapEntryKey(sameKeyOtherId, ACCOUNT, ENTRY, wrapped)).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('refuses a changed byte, an unknown version and a wrong length', async () => {
    const v = await vaultKey();
    const { wrapped } = await createEntryKey(v, ACCOUNT, ENTRY);
    for (let i = 1; i < wrapped.length; i += 5) {
      const changed = Uint8Array.from(wrapped);
      changed[i] = (changed[i] ?? 0) ^ 0x80;
      await expect(unwrapEntryKey(v, ACCOUNT, ENTRY, changed)).rejects.toBeInstanceOf(
        TamperedError,
      );
    }
    const newer = Uint8Array.from(wrapped);
    newer[0] = 9;
    await expect(unwrapEntryKey(v, ACCOUNT, ENTRY, newer)).rejects.toBeInstanceOf(
      UnsupportedVersionError,
    );
    await expect(unwrapEntryKey(v, ACCOUNT, ENTRY, wrapped.subarray(0, 30))).rejects.toBeInstanceOf(
      MalformedError,
    );
  });
});

/**
 * Known-answer vectors (`docs/specs/vault-format.md`). **They are checked against Node's own AES-GCM, not against this code's WebCrypto path,** so that
 * the format is held to the specification and not to itself.
 */
describe('known answers', () => {
  const VAULT_KEY = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const ENTRY_KEY = fromHex('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f');
  const WRAP_NONCE = fromHex('a0a1a2a3a4a5a6a7a8a9aaab');
  const SEAL_NONCE = fromHex('b0b1b2b3b4b5b6b7b8b9babb');
  const VAULT_KEY_ID = 'dmstLWlkLTAwMQ';

  function nodeEncrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plain: Uint8Array) {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    return concat(cipher.update(plain), cipher.final(), cipher.getAuthTag());
  }

  it('wraps an entry key as the specification says', async () => {
    const vault = await importVaultKey(VAULT_KEY, VAULT_KEY_ID);
    const wrapped = await wrapEntryKeyBytes(vault, ACCOUNT, ENTRY, ENTRY_KEY, WRAP_NONCE);
    const aad = encoder.encode(`wallet/v1/key|${ACCOUNT}|${ENTRY}|${VAULT_KEY_ID}`);
    const expected = concat(
      Uint8Array.of(1),
      WRAP_NONCE,
      nodeEncrypt(VAULT_KEY, WRAP_NONCE, aad, ENTRY_KEY),
    );
    expect(toHex(wrapped)).toBe(toHex(expected));
    // And it opens with Node too.
    const decipher = createDecipheriv('aes-256-gcm', VAULT_KEY, WRAP_NONCE);
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(wrapped.subarray(wrapped.length - 16)));
    const opened = concat(
      decipher.update(wrapped.subarray(13, wrapped.length - 16)),
      decipher.final(),
    );
    expect(toHex(opened)).toBe(toHex(ENTRY_KEY));
  });

  it('seals a shape and a body as the specification says', async () => {
    const vault = await importVaultKey(VAULT_KEY, VAULT_KEY_ID);
    const wrapped = await wrapEntryKeyBytes(vault, ACCOUNT, ENTRY, ENTRY_KEY, WRAP_NONCE);
    const keys = await unwrapEntryKey(vault, ACCOUNT, ENTRY, wrapped);
    for (const part of ['shape', 'body'] as const) {
      const value = { kind: 'card', title: 'Gym' };
      const sealed = await sealWithNonce(keys.aes, part, ACCOUNT, ENTRY, value, SEAL_NONCE);
      const plain = pad(encoder.encode(JSON.stringify(value)), BUCKETS[part]);
      const expected = concat(
        Uint8Array.of(1),
        SEAL_NONCE,
        nodeEncrypt(ENTRY_KEY, SEAL_NONCE, aadOf(part, ACCOUNT, ENTRY), plain),
      );
      expect(toHex(sealed), part).toBe(toHex(expected));
      expect(await open(keys.aes, part, ACCOUNT, ENTRY, expected)).toEqual(value);
    }
  });
});
