import { describe, expect, it } from 'vitest';
import { importDocumentKey } from '@sovereignfs/sdk/keys';
import { toHex } from './bytes';
import {
  MalformedError,
  TamperedError,
  WRAPPED_ROOT_BYTES,
  deriveEntryBytes,
  entryInfoOf,
  importRoot,
  newRoot,
  rootAadOf,
  unwrapRoot,
  wrapRoot,
} from './index';

/** The app key the suite gives: AES-GCM, which cannot be exported. */
const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

describe('the keyring root, wrapped under the app key', () => {
  it('wraps to 60 bytes and opens to the same root', async () => {
    const key = await appKey();
    const root = newRoot();
    const wrapped = await wrapRoot(key, 'acct', 1, root);
    expect(wrapped.length).toBe(WRAPPED_ROOT_BYTES);
    expect(WRAPPED_ROOT_BYTES).toBe(60);
    expect(await unwrapRoot(key, 'acct', 1, wrapped)).toEqual(root);
  });

  it('makes a new nonce each time, so two wraps of one root differ', async () => {
    const key = await appKey();
    const root = newRoot();
    expect(toHex(await wrapRoot(key, 'acct', 1, root))).not.toBe(
      toHex(await wrapRoot(key, 'acct', 1, root)),
    );
  });

  it('opens for the account and epoch it was made for, and for no other', async () => {
    const key = await appKey();
    const wrapped = await wrapRoot(key, 'ada', 1, newRoot());
    await expect(unwrapRoot(key, 'grace', 1, wrapped)).rejects.toBeInstanceOf(TamperedError);
    await expect(unwrapRoot(key, 'ada', 2, wrapped)).rejects.toBeInstanceOf(TamperedError);
    await expect(unwrapRoot(await appKey(), 'ada', 1, wrapped)).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('refuses a byte that was changed, and a length that is not a wrapped root', async () => {
    const key = await appKey();
    const wrapped = await wrapRoot(key, 'ada', 1, newRoot());
    for (const at of [0, 12, 30, 59]) {
      const changed = wrapped.slice();
      changed[at] = (changed[at] ?? 0) ^ 1;
      await expect(unwrapRoot(key, 'ada', 1, changed), `byte ${at}`).rejects.toBeInstanceOf(
        TamperedError,
      );
    }
    await expect(unwrapRoot(key, 'ada', 1, wrapped.slice(1))).rejects.toBeInstanceOf(
      MalformedError,
    );
    await expect(wrapRoot(key, 'ada', 1, new Uint8Array(31))).rejects.toBeInstanceOf(
      MalformedError,
    );
  });

  it('is bound by an AAD that says what it is', () => {
    expect(new TextDecoder().decode(rootAadOf('ada', 1))).toBe('wallet/v2/root|ada|1');
  });
});

describe('an entry’s key, derived from the root', () => {
  const ROOT = new Uint8Array(32).map((_, i) => i);

  it('is the same for the same root, account and entry, and differs for any other', async () => {
    const root = await importRoot(ROOT);
    const a = toHex(await deriveEntryBytes(root, 'ada', 'e1'));
    expect(toHex(await deriveEntryBytes(root, 'ada', 'e1'))).toBe(a);
    expect(toHex(await deriveEntryBytes(root, 'ada', 'e2'))).not.toBe(a);
    expect(toHex(await deriveEntryBytes(root, 'grace', 'e1'))).not.toBe(a);
    const other = await importRoot(ROOT.map((b) => b ^ 0xff));
    expect(toHex(await deriveEntryBytes(other, 'ada', 'e1'))).not.toBe(a);
  });

  it('is 32 bytes that the SDK takes as a document key', async () => {
    const bytes = await deriveEntryBytes(await importRoot(ROOT), 'ada', 'e1');
    expect(bytes.length).toBe(32);
    expect(await importDocumentKey(bytes)).toBeDefined();
  });

  it('has a root that cannot be read back, and info that names the account and entry', async () => {
    const root = await importRoot(ROOT);
    expect(root.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', root)).rejects.toBeDefined();
    expect(new TextDecoder().decode(entryInfoOf('ada', 'e1'))).toBe('wallet/v2/entry|ada|e1');
  });

  it('refuses a root of the wrong length', async () => {
    await expect(importRoot(new Uint8Array(16))).rejects.toBeInstanceOf(MalformedError);
  });
});
