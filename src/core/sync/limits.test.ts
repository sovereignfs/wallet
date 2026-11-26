import { describe, expect, it } from 'vitest';
import { encryptBytes, importDocumentKey } from '@sovereignfs/sdk/keys';
import { BUCKETS } from '../vault/padding';
import { CHUNK_BYTES, ENVELOPE_FIXED_BYTES, envelopeBytes, sealedLength } from '../vault';
import * as limits from './limits';
import {
  BODY_BUCKET,
  SHAPE_BUCKET,
  SHAPE_MAX_PADDED,
  documentIdBytes,
  maxEnvelopeBytes,
  paddedLengthOk,
} from './limits';

const ACCOUNT = '8f1c2a4e-5b6d-4e7f-9a0b-1c2d3e4f5a6b';
const ENTRY = '3b9d2f6a-1c4e-4a8b-9d7e-5f6a7b8c9d0e';

/** What the SDK really makes for a document id and a plaintext length: the server's sums are held to this, not to a number written down. */
async function made(documentId: string, plainBytes: number): Promise<number> {
  const key = await importDocumentKey(new Uint8Array(32).fill(7));
  return (await encryptBytes(key, { documentId, version: 1 }, new Uint8Array(plainBytes))).length;
}

describe('what the server checks, against the suite’s envelope', () => {
  it('is the same as the format says', () => {
    expect(SHAPE_BUCKET).toBe(BUCKETS.shape);
    expect(BODY_BUCKET).toBe(BUCKETS.body);
    expect(limits.ENVELOPE_FIXED_BYTES).toBe(ENVELOPE_FIXED_BYTES);
    expect(limits.CHUNK_BYTES).toBe(CHUNK_BYTES);
  });

  it('knows the size of the SDK’s envelope for every length it may be given, a chunk or several', async () => {
    for (const part of ['shape', 'body'] as const) {
      const id = `${ACCOUNT}/${ENTRY}/${part}`;
      for (const plain of [1, 256, 1024, 4096, 65535, 65536, 65537, 131072, 262144]) {
        const real = await made(id, plain);
        expect(envelopeBytes(id.length, plain), `${part} ${plain}`).toBe(real);
        expect(documentIdBytes(ACCOUNT, ENTRY, part)).toBe(id.length);
      }
    }
  });

  it('sees which lengths padding made, from the real thing', async () => {
    const shapeId = `${ACCOUNT}/${ENTRY}/shape`;
    for (const n of [0, 1, 100, 255, 256, 700]) {
      const padded = Math.ceil((n + 1) / SHAPE_BUCKET) * SHAPE_BUCKET;
      const real = await made(shapeId, padded);
      expect(real).toBe(sealedLength('shape', n, ACCOUNT, ENTRY));
      expect(paddedLengthOk(real, SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId.length), `${n}`).toBe(
        true,
      );
    }
    const real = await made(shapeId, 512);
    expect(paddedLengthOk(real - 1, SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId.length)).toBe(false);
    expect(paddedLengthOk(real + 1, SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId.length)).toBe(false);
    expect(
      paddedLengthOk(ENVELOPE_FIXED_BYTES, SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId.length),
    ).toBe(false);
    // Over the largest shape, and the largest shape itself.
    expect(
      paddedLengthOk(
        await made(shapeId, 4096 + 256),
        SHAPE_BUCKET,
        SHAPE_MAX_PADDED,
        shapeId.length,
      ),
    ).toBe(false);
    expect(
      paddedLengthOk(await made(shapeId, 4096), SHAPE_BUCKET, SHAPE_MAX_PADDED, shapeId.length),
    ).toBe(true);
  });

  it('sees a body of several chunks, which has a tag for each', async () => {
    const bodyId = `${ACCOUNT}/${ENTRY}/body`;
    const max = 256 * 1024;
    for (const padded of [1024, 65536, 65536 + 1024, 131072, max]) {
      const real = await made(bodyId, padded);
      expect(paddedLengthOk(real, BODY_BUCKET, max, bodyId.length), `${padded}`).toBe(true);
    }
    expect(maxEnvelopeBytes(bodyId.length, max)).toBe(await made(bodyId, max));
    expect(paddedLengthOk(await made(bodyId, max + 1024), BODY_BUCKET, max, bodyId.length)).toBe(
      false,
    );
  });
});
