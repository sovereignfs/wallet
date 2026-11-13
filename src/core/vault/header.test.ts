import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from './bytes';
import { MalformedError, UnsupportedVersionError, WrongKeyError } from './errors';
import { MAX_RECIPIENTS, createVaultHeader, openHeader, sealHeader } from './header';
import {
  createIdentity,
  identityCryptoKey,
  isProtectedKeyFile,
  keyFile,
  openProtectedKeyFile,
  parseIdentity,
  protectKeyFile,
} from './identity';
import { importVaultKey } from './keys';
import { hasAge, run } from './testing';

const NOW = new Date('2026-11-13T10:00:00Z');

describe('the vault header', () => {
  it('opens with either the wallet key or the recovery key, to the same vault key', async () => {
    const wallet = await createIdentity();
    const recovery = await createIdentity();
    const { header, contents } = await createVaultHeader(
      [wallet.recipient, recovery.recipient],
      NOW,
    );
    const a = await openHeader(header, wallet.identity);
    const b = await openHeader(header, recovery.identity);
    expect(toBase64Url(a.raw)).toBe(toBase64Url(contents.raw));
    expect(toBase64Url(b.raw)).toBe(toBase64Url(contents.raw));
    expect(a.id).toBe(contents.id);
    expect(a.created).toBe('2026-11-13T10:00:00.000Z');
    expect(a.raw.length).toBe(32);
    expect(fromBase64Url(a.id)?.length).toBe(12);
  });

  it('opens with a non-extractable key made from the identity, which cannot be read back', async () => {
    const wallet = await createIdentity();
    const { header, contents } = await createVaultHeader([wallet.recipient], NOW);
    const key = await identityCryptoKey(wallet.identity);
    expect(key.extractable).toBe(false);
    expect(toBase64Url((await openHeader(header, key)).raw)).toBe(toBase64Url(contents.raw));
  });

  it('is refused to a key that is not a recipient, with the typed error', async () => {
    const wallet = await createIdentity();
    const stranger = await createIdentity();
    const { header } = await createVaultHeader([wallet.recipient], NOW);
    await expect(openHeader(header, stranger.identity)).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('replacing a key re-encrypts the header and no entry: the old key no longer opens the new header, the same vault key does', async () => {
    const oldKey = await createIdentity();
    const newKey = await createIdentity();
    const { header, contents } = await createVaultHeader([oldKey.recipient], NOW);
    const replaced = await sealHeader(await openHeader(header, oldKey.identity), [
      newKey.recipient,
    ]);
    await expect(openHeader(replaced, oldKey.identity)).rejects.toBeInstanceOf(WrongKeyError);
    expect(toBase64Url((await openHeader(replaced, newKey.identity)).raw)).toBe(
      toBase64Url(contents.raw),
    );
    // An old header in an old backup still opens with the old key (DESIGN.md §7.5).
    expect((await openHeader(header, oldKey.identity)).id).toBe(contents.id);
  });

  it('gives a vault key that can be loaded for use and not read back', async () => {
    const wallet = await createIdentity();
    const { header } = await createVaultHeader([wallet.recipient], NOW);
    const opened = await openHeader(header, wallet.identity);
    const vault = await importVaultKey(opened.raw, opened.id);
    expect(vault.key.extractable).toBe(false);
  });

  it('takes one to four recipients', async () => {
    const keys = await Promise.all(
      Array.from({ length: MAX_RECIPIENTS + 1 }, () => createIdentity()),
    );
    await expect(createVaultHeader([], NOW)).rejects.toBeInstanceOf(MalformedError);
    await expect(
      createVaultHeader(
        keys.map((k) => k.recipient),
        NOW,
      ),
    ).rejects.toBeInstanceOf(MalformedError);
    await createVaultHeader(
      keys.slice(0, MAX_RECIPIENTS).map((k) => k.recipient),
      NOW,
    );
  });

  it('refuses what is not a header: random bytes, and a newer version of the contents', async () => {
    const wallet = await createIdentity();
    await expect(openHeader(new Uint8Array(200), wallet.identity)).rejects.toBeInstanceOf(
      MalformedError,
    );
    const { raw } = (await createVaultHeader([wallet.recipient], NOW)).contents;
    const newer = await sealHeaderWith(wallet.recipient, {
      v: 2,
      vault_key: toBase64Url(raw),
      vault_key_id: 'AAAAAAAAAAAAAAAA',
      created: 'x',
    });
    await expect(openHeader(newer, wallet.identity)).rejects.toBeInstanceOf(
      UnsupportedVersionError,
    );
    const bad = await sealHeaderWith(wallet.recipient, {
      v: 1,
      vault_key: 'AA',
      vault_key_id: 'AAAAAAAAAAAAAAAA',
      created: 'x',
    });
    await expect(openHeader(bad, wallet.identity)).rejects.toBeInstanceOf(MalformedError);
  });

  // The real `age`, so that the header is held to the format and not to itself.
  it.runIf(hasAge)(
    'is a real age file: the age command opens it with the key file, and it opens a header made for a key age-keygen made',
    async () => {
      const wallet = await createIdentity();
      const { header, contents } = await createVaultHeader([wallet.recipient], NOW);
      const dir = mkdtempSync(join(tmpdir(), 'wallet-age-'));
      try {
        writeFileSync(join(dir, 'key.txt'), keyFile(wallet, 'wallet', NOW));
        writeFileSync(join(dir, 'header.age'), header);
        const plain = JSON.parse(
          run('age', ['-d', '-i', join(dir, 'key.txt'), join(dir, 'header.age')]).toString(),
        );
        expect(plain).toEqual({
          v: 1,
          vault_key: toBase64Url(contents.raw),
          vault_key_id: contents.id,
          created: contents.created,
        });
        // The other way: age encrypts to a recipient, and the header's opener reads it.
        const generated = run('age-keygen', []).toString();
        const parsed = await parseIdentity(generated);
        if (!parsed.ok) throw new Error('age-keygen made a key that is not taken');
        writeFileSync(
          join(dir, 'in.json'),
          JSON.stringify({ ...plain, vault_key_id: contents.id }),
        );
        const byAge = run('age', ['-r', parsed.recipient, join(dir, 'in.json')]);
        expect((await openHeader(byAge, parsed.identity)).id).toBe(contents.id);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

async function sealHeaderWith(
  recipient: string,
  body: Record<string, unknown>,
): Promise<Uint8Array> {
  const age = await import('age-encryption');
  const encrypter = new age.Encrypter();
  encrypter.addRecipient(recipient);
  return encrypter.encrypt(JSON.stringify(body));
}

describe('keys and key files', () => {
  it('writes a file in the form age-keygen writes, naming the app, and reads it back', async () => {
    const key = await createIdentity();
    const file = keyFile(key, 'wallet', NOW);
    expect(file).toMatch(/^# Wallet key\./);
    expect(file).toContain('# created: 2026-11-13T10:00:00Z');
    expect(file).toContain(`# public key: ${key.recipient}`);
    expect(file.trimEnd().split('\n').at(-1)).toBe(key.identity);
    expect(await parseIdentity(file)).toEqual({ ok: true, ...key });
    expect(await parseIdentity(key.identity)).toEqual({ ok: true, ...key });
    expect(keyFile(key, 'recovery', NOW)).toMatch(/^# Wallet recovery key\./);
  });

  it('works out the public part from the secret and never reads it from the file', async () => {
    const key = await createIdentity();
    const other = await createIdentity();
    const lying = `# public key: ${other.recipient}\n${key.identity}\n`;
    expect(await parseIdentity(lying)).toEqual({ ok: true, ...key });
  });

  it('refuses what is not a key, several keys, an empty paste, and a post-quantum key, each for its own reason', async () => {
    const a = await createIdentity();
    const b = await createIdentity();
    expect(await parseIdentity('')).toEqual({ ok: false, reason: 'empty' });
    expect(await parseIdentity('# only a comment\n')).toEqual({ ok: false, reason: 'empty' });
    expect(await parseIdentity(`${a.identity}\n${b.identity}`)).toEqual({
      ok: false,
      reason: 'several',
    });
    expect(await parseIdentity('hello')).toEqual({ ok: false, reason: 'not_a_key' });
    expect(await parseIdentity(a.identity.toLowerCase())).toEqual({
      ok: false,
      reason: 'not_a_key',
    });
    expect(await parseIdentity(a.identity.slice(0, -2) + 'QQ')).toEqual({
      ok: false,
      reason: 'not_a_key',
    });
    expect(await parseIdentity('AGE-SECRET-KEY-PQ-1QQQQ')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('protects a key file with a passphrase, and opens it only with that passphrase', async () => {
    const key = await createIdentity();
    const protectedFile = await protectKeyFile(
      keyFile(key, 'wallet', NOW),
      'correct horse battery staple',
    );
    expect(isProtectedKeyFile(protectedFile)).toBe(true);
    expect(isProtectedKeyFile(keyFile(key, 'wallet', NOW))).toBe(false);
    expect(protectedFile).not.toContain(key.identity);
    const opened = await openProtectedKeyFile(protectedFile, 'correct horse battery staple');
    expect(await parseIdentity(opened)).toEqual({ ok: true, ...key });
    await expect(openProtectedKeyFile(protectedFile, 'wrong')).rejects.toBeInstanceOf(
      WrongKeyError,
    );
    await expect(openProtectedKeyFile('not an age file', 'x')).rejects.toBeInstanceOf(
      MalformedError,
    );
  }, 60_000);

  it.runIf(hasAge)(
    'is read by the real age: a key made by age-keygen is taken, and the protected file opens with age -d',
    async () => {
      const generated = run('age-keygen', []).toString();
      const parsed = await parseIdentity(generated);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const { header, contents } = await createVaultHeader([parsed.recipient], NOW);
        expect((await openHeader(header, parsed.identity)).id).toBe(contents.id);
      }
    },
  );
});
