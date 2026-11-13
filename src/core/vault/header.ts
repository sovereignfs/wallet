import * as age from 'age-encryption';
import { decoder, encoder, fromBase64Url, toBase64Url } from './bytes';
import { MalformedError, UnsupportedVersionError, WrongKeyError } from './errors';
import { KEY_BYTES, newVaultKeyMaterial } from './keys';

/**
 * The vault header (DESIGN.md §8.1): the vault key, encrypted with age to every recipient (the wallet key and the recovery key), so that either opens
 * it. It is a small age file the server stores as it is and a device keeps a copy of, so that unlocking works offline.
 *
 *     header = age( { "v": 1, "vault_key": <base64url, 32 bytes>, "vault_key_id": <base64url, 12 bytes>, "created": <ISO 8601> } )
 *
 * **Replacing a key re-encrypts this one small file and no entry** (§7.2). An old header in an old backup still opens with the old key.
 */
export interface VaultHeaderContents {
  readonly raw: Uint8Array<ArrayBuffer>;
  readonly id: string;
  readonly created: string;
}

const HEADER_VERSION = 1;

/** The most recipients a header carries: a wallet key and a recovery key, with room for a key being replaced. */
export const MAX_RECIPIENTS = 4;

function encode(contents: VaultHeaderContents): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify({
      v: HEADER_VERSION,
      vault_key: toBase64Url(contents.raw),
      vault_key_id: contents.id,
      created: contents.created,
    }),
  );
}

/** Encrypts the vault key to these recipients (`age1…`). */
export async function sealHeader(
  contents: VaultHeaderContents,
  recipients: readonly string[],
): Promise<Uint8Array<ArrayBuffer>> {
  if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS) throw new MalformedError();
  const encrypter = new age.Encrypter();
  for (const recipient of recipients) encrypter.addRecipient(recipient);
  const file = await encrypter.encrypt(encode(contents));
  return Uint8Array.from(file);
}

/** A new vault key and the header that carries it. The raw key is for the caller to import (`importVaultKey`) and drop. */
export async function createVaultHeader(
  recipients: readonly string[],
  now: Date,
): Promise<{ readonly header: Uint8Array<ArrayBuffer>; readonly contents: VaultHeaderContents }> {
  const { raw, id } = newVaultKeyMaterial();
  const contents = { raw, id, created: now.toISOString() };
  return { header: await sealHeader(contents, recipients), contents };
}

/**
 * Opens the header with an identity (`AGE-SECRET-KEY-1…`, or a non-extractable key made from it). A key that is not one of the recipients is a
 * `WrongKeyError`; a header whose contents are not what this version writes is `MalformedError`, or `UnsupportedVersionError` for a newer one.
 */
export async function openHeader(
  header: Uint8Array,
  identity: string | CryptoKey,
): Promise<VaultHeaderContents> {
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(identity);
  let plaintext: Uint8Array;
  try {
    plaintext = await decrypter.decrypt(header);
  } catch (error) {
    if (error instanceof Error && /no identity matched/i.test(error.message))
      throw new WrongKeyError();
    throw new MalformedError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new MalformedError();
  } finally {
    plaintext.fill(0);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new MalformedError();
  const { v, vault_key, vault_key_id, created } = parsed as Record<string, unknown>;
  if (typeof v === 'number' && v > HEADER_VERSION) throw new UnsupportedVersionError();
  if (v !== HEADER_VERSION) throw new MalformedError();
  if (
    typeof vault_key !== 'string' ||
    typeof vault_key_id !== 'string' ||
    typeof created !== 'string'
  )
    throw new MalformedError();
  const raw = fromBase64Url(vault_key);
  if (!raw || raw.length !== KEY_BYTES || fromBase64Url(vault_key_id)?.length !== 12)
    throw new MalformedError();
  return { raw, id: vault_key_id, created };
}
