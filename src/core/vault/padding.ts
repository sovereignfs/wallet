import { TamperedError } from './errors';

/**
 * ISO/IEC 7816-4 padding (DESIGN.md §8.2): the plaintext, then `0x80`, then `0x00` bytes up to the next multiple of the bucket. The padded length
 * hides small differences in length: a server sees a shape as 256 or 512 bytes and not as the length of a title. A value that already fills a bucket
 * gets a whole bucket more, since the `0x80` must have somewhere to go.
 */
export const BUCKETS = { shape: 256, body: 1024 } as const;

export type Part = keyof typeof BUCKETS;

export function pad(plaintext: Uint8Array, bucket: number): Uint8Array<ArrayBuffer> {
  const length = Math.ceil((plaintext.length + 1) / bucket) * bucket;
  const out = new Uint8Array(length);
  out.set(plaintext);
  out[plaintext.length] = 0x80;
  return out;
}

/** The plaintext of a padded value. A value with no `0x80` marker is not what `pad` made: it is refused as tampered, never guessed at. */
export function unpad(padded: Uint8Array): Uint8Array<ArrayBuffer> {
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0x00) end--;
  if (end === 0 || padded[end - 1] !== 0x80) throw new TamperedError();
  const out = new Uint8Array(end - 1);
  out.set(padded.subarray(0, end - 1));
  return out;
}
