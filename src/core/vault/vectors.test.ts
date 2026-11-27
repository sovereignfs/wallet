import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { suiteCipher } from '../../keys/cipher';
import { fromHex, toHex } from './bytes';
import {
  BUCKETS,
  deriveEntryBytes,
  deriveEntryKey,
  documentIdOf,
  entryInfoOf,
  fromBase64Url,
  importRoot,
  open,
  rootAadOf,
} from './index';

/** The specification's test vectors (`docs/specs/vault-format.vectors.json`): what any implementation of Wallet's use of the suite's cipher must reproduce. */
const vectors = JSON.parse(
  readFileSync(join(__dirname, '../../../docs/specs/vault-format.vectors.json'), 'utf8'),
) as {
  root: string;
  account: string;
  entry: string;
  entryKey: string;
  rootAad: string;
  entryInfo: string;
  documentIds: { shape: string; body: string };
  epoch: number;
  shape: unknown;
  sealedShape: string;
  buckets: { shape: number; body: number };
};

describe('the specification’s test vectors', () => {
  it('derives the entry’s key from the root, as HKDF-SHA-256 over the info string', async () => {
    const root = await importRoot(fromHex(vectors.root));
    expect(toHex(await deriveEntryBytes(root, vectors.account, vectors.entry))).toBe(
      vectors.entryKey,
    );
    expect(new TextDecoder().decode(entryInfoOf(vectors.account, vectors.entry))).toBe(
      vectors.entryInfo,
    );
  });

  it('binds a wrapped root and a value to the strings the specification names', () => {
    expect(new TextDecoder().decode(rootAadOf(vectors.account, vectors.epoch))).toBe(
      vectors.rootAad,
    );
    expect(documentIdOf(vectors.account, vectors.entry, 'shape')).toBe(vectors.documentIds.shape);
    expect(documentIdOf(vectors.account, vectors.entry, 'body')).toBe(vectors.documentIds.body);
    expect(BUCKETS).toEqual(vectors.buckets);
  });

  it('opens a value the SDK sealed when the specification was written: another implementation can read what this one made', async () => {
    const key = await deriveEntryKey(
      suiteCipher,
      await importRoot(fromHex(vectors.root)),
      vectors.account,
      vectors.entry,
    );
    const sealed = fromBase64Url(vectors.sealedShape);
    if (!sealed) throw new Error('not base64url');
    expect(
      await open(suiteCipher, key, 'shape', vectors.account, vectors.entry, vectors.epoch, sealed),
    ).toEqual(vectors.shape);
  });
});
