import { concat, copy, encoder, randomBytes, u32, u64, readU64 } from './bytes';
import { MalformedError, TamperedError, UnsupportedVersionError } from './errors';
import type { EntryKeys } from './keys';
import { TAG_BYTES, VERSION } from './seal';

/**
 * File encryption (DESIGN.md §8.3): the STREAM construction, as age uses it, so that a large PDF is encrypted and decrypted in pieces and starts
 * rendering before the end.
 *
 *     header      version (0x01) | 16-byte salt | chunk size (u32 big-endian, 65,536)
 *     file key    HKDF-SHA-256(entry key, salt, info = "wallet/v1/file|<file id>")  → an AES-256-GCM key
 *     chunk i     AES-256-GCM(file key, nonce = 11-byte big-endian counter ‖ last-chunk flag (0x00 or 0x01), plaintext chunk, AAD = <file id>)
 *     plaintext   an 8-byte big-endian length n, the file's n bytes, then zeros to the next bucket of the whole
 *                 (16 KiB while the 8 + n bytes are under 1 MiB, 256 KiB from there)
 *
 * The last chunk carries flag `0x01` and no other does, so **truncating, dropping the last chunk or reordering chunks fails**; the length prefix and the
 * zero padding are checked, so what was appended or cut inside the padding fails too. The server stores the ciphertext and never sees a file's name,
 * type or dimension. `docs/specs/vault-format.md` is the specification, with test vectors.
 */
export const CHUNK_BYTES = 65_536;
export const SALT_BYTES = 16;
export const HEADER_BYTES = 1 + SALT_BYTES + 4;
const SMALL_BUCKET = 16 * 1024;
const LARGE_BUCKET = 256 * 1024;
const THRESHOLD = 1024 * 1024;

/** The bytes of the plaintext as the stream carries it: the length, the file and the zeros that fill the bucket. */
export function paddedLength(fileBytes: number): number {
  const total = 8 + fileBytes;
  const bucket = total < THRESHOLD ? SMALL_BUCKET : LARGE_BUCKET;
  return Math.ceil(total / bucket) * bucket;
}

/** The size of the encrypted file, which is what the server sees and a quota counts. */
export function encryptedLength(fileBytes: number): number {
  const padded = paddedLength(fileBytes);
  return HEADER_BYTES + padded + Math.ceil(padded / CHUNK_BYTES) * TAG_BYTES;
}

async function fileKeyOf(keys: EntryKeys, salt: Uint8Array, fileId: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: copy(salt),
      info: encoder.encode(`wallet/v1/file|${fileId}`),
    },
    keys.hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function nonceOf(counter: number, last: boolean): Uint8Array<ArrayBuffer> {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  view.setUint32(3, Math.floor(counter / 2 ** 32), false);
  view.setUint32(7, counter % 2 ** 32, false);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

/** Encrypts a file. A stream is read to its end first, since the length goes before the bytes; hand a `Blob` where the file is large. */
export async function encryptFile(
  keys: EntryKeys,
  fileId: string,
  source: Blob | ReadableStream<Uint8Array>,
): Promise<Blob> {
  return encryptFileWithSalt(keys, fileId, source, randomBytes(SALT_BYTES));
}

/** **For the specification's test vectors only:** the salt is the caller's. Not exported by `index.ts`. */
export async function encryptFileWithSalt(
  keys: EntryKeys,
  fileId: string,
  source: Blob | ReadableStream<Uint8Array>,
  salt: Uint8Array,
): Promise<Blob> {
  const blob = source instanceof Blob ? source : await new Response(source).blob();
  const length = blob.size;
  const padded = paddedLength(length);
  const key = await fileKeyOf(keys, salt, fileId);
  const aad = encoder.encode(fileId);
  const prefix = u64(length);
  const parts: BlobPart[] = [concat(Uint8Array.of(VERSION), salt, u32(CHUNK_BYTES))];
  const chunks = Math.ceil(padded / CHUNK_BYTES);
  for (let index = 0; index < chunks; index++) {
    const start = index * CHUNK_BYTES;
    const end = Math.min(start + CHUNK_BYTES, padded);
    // The slice of the virtual plaintext (length, file, zeros) that this chunk covers.
    const plain = new Uint8Array(end - start);
    if (start < 8) plain.set(prefix.subarray(start, Math.min(8, end)), 0);
    const fileFrom = Math.max(start, 8);
    const fileTo = Math.min(end, 8 + length);
    if (fileTo > fileFrom) {
      const bytes = new Uint8Array(await blob.slice(fileFrom - 8, fileTo - 8).arrayBuffer());
      plain.set(bytes, fileFrom - start);
    }
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonceOf(index, index === chunks - 1), additionalData: aad },
      key,
      plain,
    );
    parts.push(new Uint8Array(ciphertext));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

/** The bytes waiting to be read, in the pieces they arrived in. */
class Queue {
  private pieces: Uint8Array[] = [];
  length = 0;
  push(piece: Uint8Array): void {
    if (piece.length === 0) return;
    this.pieces.push(piece);
    this.length += piece.length;
  }
  take(count: number): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(count);
    let at = 0;
    while (at < count) {
      const piece = this.pieces[0] as Uint8Array;
      const used = Math.min(piece.length, count - at);
      out.set(piece.subarray(0, used), at);
      at += used;
      if (used === piece.length) this.pieces.shift();
      else this.pieces[0] = piece.subarray(used);
    }
    this.length -= count;
    return out;
  }
}

/**
 * Decrypts a file as a stream of its bytes, a chunk at a time. An error in the stream (`TamperedError`, `MalformedError`, `UnsupportedVersionError`) is
 * raised when the bad chunk is reached, so bytes before it have been delivered: a caller that must not show a damaged file reads it whole first.
 */
export function decryptFile(
  keys: EntryKeys,
  fileId: string,
  source: Blob | ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = (source instanceof Blob ? source.stream() : source).getReader();
  const queue = new Queue();
  const aad = encoder.encode(fileId);
  let finished = false;
  let key: CryptoKey | undefined;
  let counter = 0;
  let sawLast = false;
  // The plaintext: its first eight bytes are the length, then that many of the file, then zeros.
  let received = 0;
  let prefix: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let fileLength: number | undefined;
  let delivered = 0;

  async function fill(until: number): Promise<void> {
    while (queue.length < until && !finished) {
      const { done, value } = await reader.read();
      if (done) finished = true;
      else queue.push(value);
    }
  }

  /** Splits a chunk's plaintext into what is the file and checks the rest. Returns the file's bytes in it. */
  function consume(plain: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    let from = 0;
    if (fileLength === undefined) {
      const need = 8 - prefix.length;
      const used = Math.min(need, plain.length);
      prefix = concat(prefix, plain.subarray(0, used));
      from = used;
      if (prefix.length === 8) fileLength = readU64(prefix);
    }
    received += plain.length;
    if (fileLength === undefined) return new Uint8Array(0);
    const wanted = fileLength - delivered;
    const used = Math.min(wanted, plain.length - from);
    const file = plain.subarray(from, from + used);
    delivered += used;
    // Whatever follows the file is zeros.
    for (let i = from + used; i < plain.length; i++) if (plain[i] !== 0) throw new TamperedError();
    return file;
  }

  async function next(): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (!key) {
      await fill(HEADER_BYTES);
      if (queue.length < HEADER_BYTES) throw new MalformedError();
      const header = queue.take(HEADER_BYTES);
      if (header[0] !== VERSION) throw new UnsupportedVersionError();
      const size = new DataView(header.buffer).getUint32(17, false);
      if (size !== CHUNK_BYTES) throw new MalformedError();
      key = await fileKeyOf(keys, header.subarray(1, 1 + SALT_BYTES), fileId);
    }
    const sealedChunk = CHUNK_BYTES + TAG_BYTES;
    // One byte beyond a full chunk says that this one is not the last.
    await fill(sealedChunk + 1);
    if (queue.length === 0) {
      if (!sawLast) throw new TamperedError();
      return undefined;
    }
    if (sawLast) throw new TamperedError();
    const last = finished && queue.length <= sealedChunk;
    const size = last ? queue.length : sealedChunk;
    if (size < TAG_BYTES) throw new MalformedError();
    let plain: Uint8Array<ArrayBuffer>;
    try {
      plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonceOf(counter, last), additionalData: aad },
          key,
          queue.take(size),
        ),
      );
    } catch {
      throw new TamperedError();
    }
    counter++;
    if (last) sawLast = true;
    const file = consume(plain);
    if (last) {
      if (fileLength === undefined || delivered !== fileLength) throw new TamperedError();
      if (received !== paddedLength(fileLength)) throw new TamperedError();
    }
    return file;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const file = await next();
          if (file === undefined) {
            controller.close();
            return;
          }
          if (file.length > 0) {
            controller.enqueue(file);
            return;
          }
        }
      } catch (error) {
        controller.error(error);
        await reader.cancel().catch(() => undefined);
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    },
  });
}

/** A whole file, decrypted. For a file small enough to hold; a large one is read from `decryptFile`. */
export async function decryptFileToBlob(
  keys: EntryKeys,
  fileId: string,
  source: Blob | ReadableStream<Uint8Array>,
  type = 'application/octet-stream',
): Promise<Blob> {
  const response = await new Response(decryptFile(keys, fileId, source)).blob();
  return new Blob([response], { type });
}
