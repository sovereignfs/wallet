import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encoder, fromHex, toHex } from './bytes';
import { importVaultKey, unwrapEntryKey, wrapEntryKeyBytes } from './keys';
import { open, sealWithNonce } from './seal';
import { decryptFileToBlob, encryptFileWithSalt } from './stream';

/**
 * The test vectors of `docs/specs/vault-format.md`: fixed keys and nonces, the exact bytes that follow. **The same file is what a native implementation
 * is held to.** They pass in Node here, and in Chromium and WebKit in `e2e/` (the same code, a different WebCrypto).
 */
type Vectors = Record<string, string | number | { kind: string; title: string }>;
const v = JSON.parse(
  readFileSync(join(__dirname, '../../../docs/specs/vault-format.vectors.json'), 'utf8'),
) as Vectors & { value: { kind: string; title: string } };

const s = (name: string) => v[name] as string;

describe('the specification’s test vectors', () => {
  it('wrap an entry key to the bytes the specification gives, and unwrap them', async () => {
    const vault = await importVaultKey(fromHex(s('vault_key')), s('vault_key_id'));
    const wrapped = await wrapEntryKeyBytes(
      vault,
      s('account_id'),
      s('entry_id'),
      fromHex(s('entry_key')),
      fromHex(s('wrap_nonce')),
    );
    expect(toHex(wrapped)).toBe(s('wrapped_key'));
    await unwrapEntryKey(vault, s('account_id'), s('entry_id'), fromHex(s('wrapped_key')));
  });

  it.each(['shape', 'body'] as const)(
    'seal a %s to the bytes the specification gives, and open them',
    async (part) => {
      const vault = await importVaultKey(fromHex(s('vault_key')), s('vault_key_id'));
      const keys = await unwrapEntryKey(
        vault,
        s('account_id'),
        s('entry_id'),
        fromHex(s('wrapped_key')),
      );
      const sealed = await sealWithNonce(
        keys.aes,
        part,
        s('account_id'),
        s('entry_id'),
        v.value,
        fromHex(s('seal_nonce')),
      );
      expect(toHex(sealed)).toBe(s(`sealed_${part}`));
      expect(sealed.length).toBe(v[`sealed_${part}_bytes`]);
      expect(JSON.stringify(v.value)).toBe(s('value_json'));
      expect(
        await open(keys.aes, part, s('account_id'), s('entry_id'), fromHex(s(`sealed_${part}`))),
      ).toEqual(v.value);
    },
  );

  it('encrypt a file to the bytes the specification gives, and decrypt them', async () => {
    const vault = await importVaultKey(fromHex(s('vault_key')), s('vault_key_id'));
    const keys = await unwrapEntryKey(
      vault,
      s('account_id'),
      s('entry_id'),
      fromHex(s('wrapped_key')),
    );
    const file = await encryptFileWithSalt(
      keys,
      s('file_id'),
      new Blob([encoder.encode(s('file_plaintext'))]),
      fromHex(s('file_salt')),
    );
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(toHex(bytes)).toBe(s('file_encrypted'));
    expect(bytes.length).toBe(v.file_encrypted_bytes);
    const back = await decryptFileToBlob(
      keys,
      s('file_id'),
      new Blob([fromHex(s('file_encrypted'))]),
    );
    expect(await back.text()).toBe(s('file_plaintext'));
  });
});
