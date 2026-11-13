import { createCipheriv, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { concat, encoder, fromHex, randomBytes, toHex, u32, u64 } from './bytes';
import { MalformedError, TamperedError, UnsupportedVersionError } from './errors';
import {
  createEntryKey,
  importVaultKey,
  unwrapEntryKey,
  wrapEntryKeyBytes,
  type EntryKeys,
} from './keys';
import {
  CHUNK_BYTES,
  HEADER_BYTES,
  decryptFile,
  decryptFileToBlob,
  encryptFile,
  encryptFileWithSalt,
  encryptedLength,
  paddedLength,
} from './stream';

async function keys(): Promise<EntryKeys> {
  const vault = await importVaultKey(randomBytes(32), 'vk');
  return (await createEntryKey(vault, 'acct', 'entry')).keys;
}

const FILE = 'file-1';

async function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function roundTrip(k: EntryKeys, plain: Uint8Array<ArrayBuffer>) {
  const encrypted = await encryptFile(k, FILE, new Blob([plain]));
  const back = await bytesOf(await decryptFileToBlob(k, FILE, encrypted));
  return { encrypted, back };
}

const pattern = (n: number): Uint8Array<ArrayBuffer> =>
  Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);

describe('file encryption', () => {
  it.each([
    ['an empty file', 0],
    ['one byte', 1],
    ['a file inside one chunk', 1000],
    ['a file that fills the first bucket exactly (16 KiB less the length)', 16 * 1024 - 8],
    ['a file one byte over the bucket', 16 * 1024 - 7],
    ['a file of exactly one chunk', CHUNK_BYTES],
    ['a file whose padded plaintext is a whole number of chunks', 256 * 1024 * 4 - 8],
    ['a file over a megabyte (the large bucket)', 1024 * 1024 + 123],
  ])('round-trips %s, and the size falls on its bucket', async (_name, size) => {
    const k = await keys();
    const plain = pattern(size);
    const { encrypted, back } = await roundTrip(k, plain);
    expect(toHex(back)).toBe(toHex(plain));
    expect(encrypted.size).toBe(encryptedLength(size));
    const padded = paddedLength(size);
    expect(padded % (size + 8 < 1024 * 1024 ? 16 * 1024 : 256 * 1024)).toBe(0);
    expect(padded).toBeGreaterThanOrEqual(size + 8);
  });

  it('round-trips 30 MB', async () => {
    const k = await keys();
    const plain = new Uint8Array(30 * 1024 * 1024);
    for (let i = 0; i < plain.length; i += 4099) plain[i] = i & 0xff;
    const encrypted = await encryptFile(k, FILE, new Blob([plain]));
    expect(encrypted.size).toBe(encryptedLength(plain.length));
    const back = await bytesOf(await decryptFileToBlob(k, FILE, encrypted));
    expect(back.length).toBe(plain.length);
    expect(Buffer.from(back).equals(Buffer.from(plain))).toBe(true);
  }, 120_000);

  it('accepts a stream as the source', async () => {
    const k = await keys();
    const plain = pattern(100_000);
    const stream = new Blob([plain]).stream();
    const encrypted = await encryptFile(k, FILE, stream);
    expect(toHex(await bytesOf(await decryptFileToBlob(k, FILE, encrypted)))).toBe(toHex(plain));
  });

  it('decrypts as a stream: the first bytes arrive before the end is read', async () => {
    const k = await keys();
    const plain = pattern(3 * CHUNK_BYTES);
    const encrypted = await bytesOf(await encryptFile(k, FILE, new Blob([plain])));
    let pulled = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        const piece = encrypted.subarray(pulled, pulled + 10_000);
        if (piece.length === 0) controller.close();
        else controller.enqueue(piece);
        pulled += piece.length;
      },
    });
    const reader = decryptFile(k, FILE, source).getReader();
    const first = await reader.read();
    expect(first.value?.length).toBeGreaterThan(0);
    expect(pulled).toBeLessThan(encrypted.length);
    await reader.cancel();
  });

  it('does not repeat a ciphertext: two encryptions of one file differ', async () => {
    const k = await keys();
    const plain = pattern(5000);
    const a = await bytesOf(await encryptFile(k, FILE, new Blob([plain])));
    const b = await bytesOf(await encryptFile(k, FILE, new Blob([plain])));
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('hides the length: files in one bucket have one encrypted size', async () => {
    const k = await keys();
    const a = await encryptFile(k, FILE, new Blob([pattern(10)]));
    const b = await encryptFile(k, FILE, new Blob([pattern(9000)]));
    expect(a.size).toBe(b.size);
  });
});

describe('a file that was damaged', () => {
  async function encrypted(size: number) {
    const k = await keys();
    const bytes = await bytesOf(await encryptFile(k, FILE, new Blob([pattern(size)])));
    return { k, bytes };
  }
  const attempt = (k: EntryKeys, bytes: Uint8Array<ArrayBuffer>, fileId = FILE) =>
    decryptFileToBlob(k, fileId, new Blob([bytes]));

  it('fails when a byte of any chunk is changed', async () => {
    const { k, bytes } = await encrypted(200_000);
    for (const at of [HEADER_BYTES, HEADER_BYTES + 5000, bytes.length - 1, bytes.length >> 1]) {
      const changed = Uint8Array.from(bytes);
      changed[at] = (changed[at] ?? 0) ^ 1;
      await expect(attempt(k, changed), `byte ${at}`).rejects.toBeInstanceOf(TamperedError);
    }
  });

  it('fails when the last chunk is dropped', async () => {
    const { k, bytes } = await encrypted(200_000);
    const chunk = CHUNK_BYTES + 16;
    const cut = bytes.subarray(
      0,
      HEADER_BYTES + Math.floor((bytes.length - HEADER_BYTES) / chunk) * chunk,
    );
    await expect(attempt(k, cut)).rejects.toBeInstanceOf(TamperedError);
  });

  it('fails when the file is truncated anywhere', async () => {
    const { k, bytes } = await encrypted(200_000);
    for (const length of [
      bytes.length - 1,
      bytes.length - 100,
      bytes.length - 20_000,
      HEADER_BYTES + 100,
    ]) {
      await expect(attempt(k, bytes.subarray(0, length)), `${length}`).rejects.toBeInstanceOf(
        TamperedError,
      );
    }
  });

  it('fails when two chunks are swapped', async () => {
    const { k, bytes } = await encrypted(200_000);
    const chunk = CHUNK_BYTES + 16;
    const first = bytes.subarray(HEADER_BYTES, HEADER_BYTES + chunk);
    const second = bytes.subarray(HEADER_BYTES + chunk, HEADER_BYTES + 2 * chunk);
    const swapped = concat(
      bytes.subarray(0, HEADER_BYTES),
      second,
      first,
      bytes.subarray(HEADER_BYTES + 2 * chunk),
    );
    await expect(attempt(k, swapped)).rejects.toBeInstanceOf(TamperedError);
  });

  it('fails when bytes are appended, including a whole extra chunk', async () => {
    const { k, bytes } = await encrypted(200_000);
    await expect(attempt(k, concat(bytes, new Uint8Array(5)))).rejects.toThrow();
    await expect(attempt(k, concat(bytes, pattern(CHUNK_BYTES + 16)))).rejects.toBeInstanceOf(
      TamperedError,
    );
  });

  it('fails for another file id and another entry key', async () => {
    const { k, bytes } = await encrypted(5000);
    await expect(attempt(k, bytes, 'file-2')).rejects.toBeInstanceOf(TamperedError);
    await expect(attempt(await keys(), bytes)).rejects.toBeInstanceOf(TamperedError);
  });

  it('fails when the salt in the header is changed', async () => {
    const { k, bytes } = await encrypted(5000);
    const changed = Uint8Array.from(bytes);
    changed[3] = (changed[3] ?? 0) ^ 1;
    await expect(attempt(k, changed)).rejects.toBeInstanceOf(TamperedError);
  });

  it('says an unknown version is unsupported, and a header that is cut or has another chunk size is malformed', async () => {
    const { k, bytes } = await encrypted(5000);
    const newer = Uint8Array.from(bytes);
    newer[0] = 2;
    await expect(attempt(k, newer)).rejects.toBeInstanceOf(UnsupportedVersionError);
    await expect(attempt(k, bytes.subarray(0, 10))).rejects.toBeInstanceOf(MalformedError);
    const other = Uint8Array.from(bytes);
    other.set(u32(1024), 17);
    await expect(attempt(k, other)).rejects.toBeInstanceOf(MalformedError);
    await expect(attempt(k, new Uint8Array(0))).rejects.toBeInstanceOf(MalformedError);
  });

  /** An authentic stream (the right keys) of a plaintext of the test's own making, so that what is checked is the layout and not the tag. */
  async function handMade(plaintext: Uint8Array<ArrayBuffer>) {
    const entryKeyBytes = randomBytes(32);
    const vault = await importVaultKey(randomBytes(32), 'vk');
    const wrapped = await wrapEntryKeyBytes(vault, 'acct', 'entry', entryKeyBytes, randomBytes(12));
    const k = await unwrapEntryKey(vault, 'acct', 'entry', wrapped);
    const salt = randomBytes(16);
    const fileKey = Buffer.from(
      hkdfSync('sha256', entryKeyBytes, salt, `wallet/v1/file|${FILE}`, 32),
    );
    const chunks = Math.ceil(plaintext.length / CHUNK_BYTES);
    const parts: Uint8Array[] = [concat(Uint8Array.of(1), salt, u32(CHUNK_BYTES))];
    for (let i = 0; i < chunks; i++) {
      const nonce = new Uint8Array(12);
      nonce[10] = i;
      nonce[11] = i === chunks - 1 ? 1 : 0;
      const cipher = createCipheriv('aes-256-gcm', fileKey, nonce);
      cipher.setAAD(encoder.encode(FILE));
      parts.push(
        concat(
          cipher.update(plaintext.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)),
          cipher.final(),
          cipher.getAuthTag(),
        ),
      );
    }
    return { k, bytes: concat(...parts) };
  }

  it('opens a hand-made stream that follows the layout (so the next two refusals are of the layout and not of the tag)', async () => {
    const plain = new Uint8Array(16 * 1024);
    plain.set(u64(5), 0);
    plain.set(encoder.encode('hello'), 8);
    const { k, bytes } = await handMade(plain);
    expect(new TextDecoder().decode(await bytesOf(await attempt(k, bytes)))).toBe('hello');
  });

  it('fails when the padding is not zeros, though every tag is right', async () => {
    const plain = new Uint8Array(16 * 1024);
    plain.set(u64(5), 0);
    plain.set(encoder.encode('hello'), 8);
    plain[9000] = 1;
    const { k, bytes } = await handMade(plain);
    await expect(attempt(k, bytes)).rejects.toBeInstanceOf(TamperedError);
  });

  it('fails when the stream is not padded to its bucket, though every tag is right', async () => {
    const plain = new Uint8Array(20);
    plain.set(u64(5), 0);
    plain.set(encoder.encode('hello'), 8);
    const { k, bytes } = await handMade(plain);
    await expect(attempt(k, bytes)).rejects.toBeInstanceOf(TamperedError);
  });

  it('fails when the length says more than the stream holds, though every tag is right', async () => {
    const plain = new Uint8Array(16 * 1024);
    plain.set(u64(99_999), 0);
    const { k, bytes } = await handMade(plain);
    await expect(attempt(k, bytes)).rejects.toBeInstanceOf(TamperedError);
  });
});

/**
 * A known answer (`docs/specs/vault-format.md`), checked against Node's own HKDF and AES-GCM and not against this code's WebCrypto path.
 */
describe('known answer', () => {
  it('encrypts a small file as the specification says', async () => {
    const vaultBytes = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    const entryKeyBytes = fromHex(
      '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f',
    );
    const salt = fromHex('c0c1c2c3c4c5c6c7c8c9cacbcccdcecf');
    const vault = await importVaultKey(vaultBytes, 'dmstLWlkLTAwMQ');
    const wrapped = await wrapEntryKeyBytes(
      vault,
      'acct-1',
      'entry-1',
      entryKeyBytes,
      fromHex('a0a1a2a3a4a5a6a7a8a9aaab'),
    );
    const k = await unwrapEntryKey(vault, 'acct-1', 'entry-1', wrapped);
    const file = encoder.encode('hello, wallet');
    const encrypted = await bytesOf(await encryptFileWithSalt(k, 'file-1', new Blob([file]), salt));

    const fileKey = Buffer.from(
      hkdfSync('sha256', entryKeyBytes, salt, 'wallet/v1/file|file-1', 32),
    );
    const plaintext = concat(u64(file.length), file, new Uint8Array(16 * 1024 - 8 - file.length));
    const nonce = concat(new Uint8Array(11), Uint8Array.of(1)); // chunk 0 and the last
    const cipher = createCipheriv('aes-256-gcm', fileKey, nonce);
    cipher.setAAD(encoder.encode('file-1'));
    const body = concat(cipher.update(plaintext), cipher.final(), cipher.getAuthTag());
    const expected = concat(Uint8Array.of(1), salt, u32(65536), body);
    expect(toHex(encrypted)).toBe(toHex(expected));
    expect(encrypted.length).toBe(encryptedLength(file.length));
  });
});
