import { describe, expect, it } from 'vitest';
import { suiteCipher } from '../../keys/cipher';
import { fromBase64Url, toBase64Url } from './bytes';
import {
  BUCKETS,
  MalformedError,
  TamperedError,
  deriveEntryKey,
  documentIdOf,
  importRoot,
  newRoot,
  open,
  seal,
  sealedLength,
} from './index';

const key = async (account = 'acct', entry = 'e1') =>
  deriveEntryKey(suiteCipher, await importRoot(newRoot()), account, entry);

describe('a sealed value', () => {
  it('opens to what was sealed, for the key, account, entry, part and epoch it was made for', async () => {
    const k = await key();
    const value = { v: 1, kind: 'card', title: 'Gym ☕' };
    const sealed = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, value);
    expect(await open(suiteCipher, k, 'shape', 'acct', 'e1', 1, sealed)).toEqual(value);
  });

  it('is padded to the part’s bucket, so that the length does not say what the title is', async () => {
    const k = await key();
    const lengths = new Set<number>();
    for (const title of ['a', 'Gym', 'A much longer name for a card than the other one'])
      lengths.add((await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { title })).length);
    expect(lengths.size).toBe(1);
    const small = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { title: 'a' });
    expect(small.length).toBe(
      sealedLength('shape', JSON.stringify({ title: 'a' }).length, 'acct', 'e1'),
    );
    expect(BUCKETS).toEqual({ shape: 256, body: 1024 });
    const body = await seal(suiteCipher, k, 'body', 'acct', 'e1', 1, { payload: 'x' });
    expect(body.length).toBe(
      sealedLength('body', JSON.stringify({ payload: 'x' }).length, 'acct', 'e1'),
    );
  });

  it('is never the same twice: the SDK makes a new nonce for each', async () => {
    const k = await key();
    const a = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { same: true });
    const b = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { same: true });
    expect(toBase64Url(a)).not.toBe(toBase64Url(b));
  });

  it('does not open for another entry, account, part or epoch, nor under another key', async () => {
    const k = await key();
    const sealed = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { a: 1 });
    for (const [label, attempt] of [
      ['another entry', () => open(suiteCipher, k, 'shape', 'acct', 'e2', 1, sealed)],
      ['another account', () => open(suiteCipher, k, 'shape', 'other', 'e1', 1, sealed)],
      ['another part', () => open(suiteCipher, k, 'body', 'acct', 'e1', 1, sealed)],
      ['another epoch', () => open(suiteCipher, k, 'shape', 'acct', 'e1', 2, sealed)],
      ['another key', async () => open(suiteCipher, await key(), 'shape', 'acct', 'e1', 1, sealed)],
      [
        'another entry’s key',
        async () => open(suiteCipher, await key('acct', 'e2'), 'shape', 'acct', 'e1', 1, sealed),
      ],
    ] as const)
      await expect(attempt(), label).rejects.toBeInstanceOf(TamperedError);
  });

  it('refuses a byte that was changed anywhere, and one that was cut or added', async () => {
    const k = await key();
    const sealed = await seal(suiteCipher, k, 'shape', 'acct', 'e1', 1, { a: 1 });
    for (const at of [0, 5, 20, sealed.length - 100, sealed.length - 1]) {
      const changed = sealed.slice();
      changed[at] = (changed[at] ?? 0) ^ 1;
      await expect(
        open(suiteCipher, k, 'shape', 'acct', 'e1', 1, changed),
        `byte ${at}`,
      ).rejects.toBeInstanceOf(TamperedError);
    }
    await expect(
      open(suiteCipher, k, 'shape', 'acct', 'e1', 1, sealed.slice(0, -1)),
    ).rejects.toBeInstanceOf(TamperedError);
    await expect(
      open(suiteCipher, k, 'shape', 'acct', 'e1', 1, new Uint8Array()),
    ).rejects.toBeInstanceOf(TamperedError);
  });

  it('refuses a value that is not JSON, and one with no padding marker, as what `seal` did not make', async () => {
    const k = await key();
    const target = { documentId: documentIdOf('acct', 'e1', 'shape'), version: 1 };
    const notJson = await suiteCipher.encryptBytes(
      k,
      target,
      new Uint8Array([...new TextEncoder().encode('nope'), 0x80]),
    );
    await expect(open(suiteCipher, k, 'shape', 'acct', 'e1', 1, notJson)).rejects.toBeInstanceOf(
      MalformedError,
    );
    const unpadded = await suiteCipher.encryptBytes(k, target, new TextEncoder().encode('{"a":1}'));
    await expect(open(suiteCipher, k, 'shape', 'acct', 'e1', 1, unpadded)).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('names its document by account, entry and part', () => {
    expect(documentIdOf('a', 'e', 'body')).toBe('a/e/body');
    expect(fromBase64Url('AAAA')).toEqual(new Uint8Array(3));
  });
});
