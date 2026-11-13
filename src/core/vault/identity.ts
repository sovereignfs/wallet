import * as age from 'age-encryption';
import { bech32Decode } from './bech32';
import { decoder, encoder } from './bytes';
import { MalformedError, WrongKeyError } from './errors';

/**
 * A person's keys (DESIGN.md §7): an age X25519 identity, `AGE-SECRET-KEY-1…`, made in the browser or brought from another place (age's own
 * `age-keygen`, or a Tusk personal key or a Fjord identity, which is the same format). It opens the vault header and does nothing else. **The server never
 * sees it.** Only the native X25519 kind is taken: it can be held as a browser key that script cannot read, which the post-quantum kind cannot.
 */
export interface Identity {
  /** The secret, as `AGE-SECRET-KEY-1…`. Shown once to be saved, and otherwise not kept as text. */
  readonly identity: string;
  /** The public part, `age1…`, which the server may hold: it is what the vault header is encrypted to. */
  readonly recipient: string;
}

export async function createIdentity(): Promise<Identity> {
  const identity = await age.generateX25519Identity();
  return { identity, recipient: await age.identityToRecipient(identity) };
}

export type ParsedIdentity =
  | ({ readonly ok: true } & Identity)
  | { readonly ok: false; readonly reason: 'empty' | 'not_a_key' | 'unsupported' | 'several' };

/**
 * An identity from a key file or from what was pasted: the file `age-keygen` writes (comments, then the key), or the key alone. A line that begins with
 * `#` is a comment and is not trusted: **the public part is worked out from the secret** and is never read from the file. More than one key, a
 * post-quantum key and anything that is not a key with a good checksum are refused, each for its own reason.
 */
export async function parseIdentity(text: string): Promise<ParsedIdentity> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  if (lines.length === 0) return { ok: false, reason: 'empty' };
  if (lines.length > 1) return { ok: false, reason: 'several' };
  const line = lines[0] as string;
  if (/^AGE-SECRET-KEY-PQ-1/i.test(line)) return { ok: false, reason: 'unsupported' };
  const decoded = line.toUpperCase() === line ? bech32Decode(line) : undefined;
  if (!decoded || decoded.hrp !== 'age-secret-key-' || decoded.bytes.length !== 32)
    return { ok: false, reason: 'not_a_key' };
  decoded.bytes.fill(0);
  return { ok: true, identity: line, recipient: await age.identityToRecipient(line) };
}

/**
 * The file to save, in the form `age-keygen` writes, so that the real `age` reads it. The first comment names the app, so that a person who finds the
 * file in a drawer knows what it opens.
 */
export function keyFile(key: Identity, kind: 'wallet' | 'recovery', now: Date): string {
  const created = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const what = kind === 'wallet' ? 'Wallet key' : 'Wallet recovery key';
  return `# ${what}. Anyone who has this file can open your wallet. Keep it safe: nobody can recover it for you.\n# created: ${created}\n# public key: ${key.recipient}\n${key.identity}\n`;
}

/**
 * A key file protected with a passphrase: an age file encrypted with scrypt, in age's armour, which `age -d` opens too. The work factor is age's own
 * default (2^18), about a second on a phone: it is paid once, to save or to open a file.
 */
export async function protectKeyFile(file: string, passphrase: string): Promise<string> {
  const encrypter = new age.Encrypter();
  encrypter.setPassphrase(passphrase);
  return age.armor.encode(await encrypter.encrypt(file));
}

/** Whether what was given is a protected key file (age's armour or its binary form), and not a key. */
export function isProtectedKeyFile(input: string | Uint8Array): boolean {
  if (typeof input === 'string')
    return input.trimStart().startsWith('-----BEGIN AGE ENCRYPTED FILE-----');
  return decoder.decode(input.subarray(0, 21)) === 'age-encryption.org/v1\n';
}

/** Opens a protected key file with its passphrase: the text inside, for `parseIdentity`. A wrong passphrase is a `WrongKeyError`. */
export async function openProtectedKeyFile(
  input: string | Uint8Array,
  passphrase: string,
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = typeof input === 'string' ? age.armor.decode(input.trim()) : input;
  } catch {
    throw new MalformedError();
  }
  const decrypter = new age.Decrypter();
  decrypter.addPassphrase(passphrase);
  try {
    return await decrypter.decrypt(bytes, 'text');
  } catch (error) {
    // age says "no identity matched any of the file's recipients" for a wrong passphrase, and something else for a file that is not one.
    if (
      error instanceof Error &&
      /no identity matched|incorrect passphrase|decrypt/i.test(error.message)
    )
      throw new WrongKeyError();
    throw new MalformedError();
  }
}

/** For callers that need the bytes of a key file as saved. */
export function keyFileBytes(file: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(file);
}

/** The PKCS #8 header of an X25519 private key (RFC 8410), before its 32 bytes. */
const PKCS8_X25519 = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * The identity as a browser key that **script cannot read back** (`extractable: false`): it opens the header and cannot be copied out. The text it was made
 * from is for the caller to let go of.
 */
export async function identityCryptoKey(identity: string): Promise<CryptoKey> {
  const decoded = bech32Decode(identity);
  if (!decoded || decoded.hrp !== 'age-secret-key-' || decoded.bytes.length !== 32)
    throw new MalformedError();
  const pkcs8 = new Uint8Array(PKCS8_X25519.length + 32);
  pkcs8.set(PKCS8_X25519);
  pkcs8.set(decoded.bytes, PKCS8_X25519.length);
  try {
    return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);
  } finally {
    pkcs8.fill(0);
    decoded.bytes.fill(0);
  }
}
