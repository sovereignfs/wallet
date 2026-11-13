import { describe, expect, it } from 'vitest';
import { BUCKETS } from '../vault/padding';
import { NONCE_BYTES, TAG_BYTES, VERSION, sealedLength } from '../vault/seal';
import { WRAPPED_BYTES } from '../vault/keys';
import {
  BODY_BUCKET,
  SEALED_OVERHEAD,
  SEALED_VERSION,
  SHAPE_BUCKET,
  WRAPPED_KEY_BYTES,
  paddedLengthOk,
} from './limits';

describe('what the server checks, against the vault format', () => {
  it('is the same as the format says', () => {
    expect(SHAPE_BUCKET).toBe(BUCKETS.shape);
    expect(BODY_BUCKET).toBe(BUCKETS.body);
    expect(SEALED_OVERHEAD).toBe(1 + NONCE_BYTES + TAG_BYTES);
    expect(WRAPPED_KEY_BYTES).toBe(WRAPPED_BYTES);
    expect(SEALED_VERSION).toBe(VERSION);
  });

  it('sees which lengths padding made', () => {
    for (const n of [0, 1, 100, 255, 256, 700]) {
      expect(paddedLengthOk(sealedLength('shape', n), SHAPE_BUCKET, 4096), `${n}`).toBe(true);
    }
    expect(paddedLengthOk(sealedLength('shape', 20) - 1, SHAPE_BUCKET, 4096)).toBe(false);
    expect(paddedLengthOk(SEALED_OVERHEAD, SHAPE_BUCKET, 4096)).toBe(false);
    expect(paddedLengthOk(sealedLength('shape', 4096), SHAPE_BUCKET, 4096)).toBe(false);
    expect(paddedLengthOk(sealedLength('shape', 4000), SHAPE_BUCKET, 4096)).toBe(true);
    expect(paddedLengthOk(sealedLength('body', 5), BODY_BUCKET, 262144)).toBe(true);
  });
});
