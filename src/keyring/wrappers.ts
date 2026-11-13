import { copy, encoder, randomBytes } from '../core/vault/bytes';
import { importVaultKey } from '../core/vault';
import type { LocalDatabase, UnlockWrapper } from '../local/db';
import {
  localValue,
  removeWrapper,
  saveWrapper,
  setLocalValue,
  unlockWrappers,
} from '../local/store';
import type { Keyring } from './keyring';

/**
 * The ways a device unlocks (DESIGN.md §9.3). Each keeps the **vault key's bytes encrypted under a key that only this person on this device can make**, in
 * the device's store, so that unlocking works with no network and no server. The wallet key and the recovery key open the header itself and need no wrapper.
 *
 *  - **A passkey** (Face ID, a fingerprint, Windows Hello) with the WebAuthn PRF extension: the credential's PRF output for the salt `wallet/v1/unlock`,
 *    through HKDF-SHA-256, is an AES-256-GCM key that wraps the vault key. The credential is made for unlocking and is not the sign-in passkey.
 *  - **A device passcode** (at least six characters): Argon2id (64 MiB, 3 passes, 1 lane) of it and a random salt is the key that wraps the vault key; that
 *    wrapper is then wrapped again under a key the browser keeps and cannot be read out (`extractable: false`), so a copy of the store alone cannot be
 *    guessed at offline. **Five wrong passcodes delete the wrapper;** the counter is written before each try, so that closing the tab cannot dodge it.
 *
 * A wrapper is made when the vault key's bytes are in hand: at setup, or after the person has entered their wallet key again. The bytes are zeroed after.
 */
export const PASSCODE_MIN_LENGTH = 6;
export const MAX_FAILURES = 5;
export const PASSCODE_PARAMS = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 } as const;
export const PRF_SALT = 'wallet/v1/unlock';

/** The vault key's bytes and id, as the header gives them. The caller zeroes the bytes when it has made its wrappers. */
export interface Material {
  readonly raw: Uint8Array<ArrayBuffer>;
  readonly id: string;
}

/** The result of an unlock attempt with a wrapper. */
export type Attempt = 'ok' | 'wrong' | 'removed' | 'none';

const aadOf = (kind: 'passkey' | 'passcode', vaultKeyId: string) =>
  encoder.encode(`wallet/v1/unlock|${kind}|${vaultKeyId}`);

async function encrypt(key: CryptoKey, iv: Uint8Array, aad: Uint8Array, plain: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: copy(iv), additionalData: copy(aad) },
      key,
      copy(plain),
    ),
  );
}

async function decrypt(key: CryptoKey, iv: Uint8Array, aad: Uint8Array, cipher: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: copy(iv), additionalData: copy(aad) },
      key,
      copy(cipher),
    ),
  );
}

const aesKey = (bytes: Uint8Array, usages: KeyUsage[] = ['encrypt', 'decrypt']) =>
  crypto.subtle.importKey('raw', copy(bytes), { name: 'AES-GCM' }, false, usages);

// ---- the passcode ----

/** Derives the 32 bytes of an Argon2id hash. Replaceable: the browser runs it in a worker, a test runs it here. */
export type Derive = (
  passcode: string,
  salt: Uint8Array,
  params: { memoryKiB: number; iterations: number },
) => Promise<Uint8Array<ArrayBuffer>>;

/** Argon2id on this thread (`hash-wasm`, served by the app). The screens use `deriveInWorker`, which does the same where it is not on the page's own thread. */
export const deriveHere: Derive = async (passcode, salt, params) => {
  const { argon2id } = await import('hash-wasm');
  const out = await argon2id({
    password: passcode,
    salt: copy(salt),
    parallelism: PASSCODE_PARAMS.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  return copy(out);
};

/** The key that stays in this browser and cannot be read out: the passcode wrapper's second layer. Made once. */
async function deviceKey(db: LocalDatabase): Promise<CryptoKey> {
  const held = await localValue<CryptoKey | undefined>(db, 'deviceKey', undefined);
  if (held) return held;
  const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await setLocalValue(db, 'deviceKey', made);
  return made;
}

export async function enrollPasscode(
  db: LocalDatabase,
  material: Material,
  passcode: string,
  now: number,
  derive: Derive = deriveHere,
): Promise<UnlockWrapper> {
  if ([...passcode].length < PASSCODE_MIN_LENGTH) throw new Error('too short');
  const salt = randomBytes(16);
  const inner = await aesKey(await derive(passcode, salt, PASSCODE_PARAMS));
  const iv = randomBytes(12);
  const outerIv = randomBytes(12);
  const aad = aadOf('passcode', material.id);
  const first = await encrypt(inner, iv, aad, material.raw);
  const ciphertext = await encrypt(await deviceKey(db), outerIv, aad, first);
  const wrapper: UnlockWrapper = {
    id: crypto.randomUUID(),
    kind: 'passcode',
    label: 'Device passcode',
    createdAt: now,
    iv,
    ciphertext,
    vaultKeyId: material.id,
    passcode: {
      salt,
      memoryKiB: PASSCODE_PARAMS.memoryKiB,
      iterations: PASSCODE_PARAMS.iterations,
      outerIv,
    },
  };
  // One passcode a device: a new one replaces the old.
  for (const old of await unlockWrappers(db))
    if (old.kind === 'passcode') await removeWrapper(db, old.id);
  await saveWrapper(db, wrapper);
  await setLocalValue(db, 'passcodeFailures', 0);
  return wrapper;
}

/** How many wrong passcodes there have been since the last right one. */
export const passcodeFailures = (db: LocalDatabase) =>
  localValue<number>(db, 'passcodeFailures', 0);

export async function unlockWithPasscode(
  db: LocalDatabase,
  keyring: Keyring,
  passcode: string,
  derive: Derive = deriveHere,
): Promise<Attempt> {
  const wrapper = (await unlockWrappers(db)).find((w) => w.kind === 'passcode' && w.passcode);
  if (!wrapper?.passcode) return 'none';
  // The try is counted before it is made, so that closing the tab in the middle of it does not give another.
  const failures = (await passcodeFailures(db)) + 1;
  await setLocalValue(db, 'passcodeFailures', failures);
  let raw: Uint8Array | undefined;
  try {
    const inner = await aesKey(await derive(passcode, wrapper.passcode.salt, wrapper.passcode));
    const aad = aadOf('passcode', wrapper.vaultKeyId);
    const first = await decrypt(
      await deviceKey(db),
      wrapper.passcode.outerIv,
      aad,
      wrapper.ciphertext,
    );
    raw = await decrypt(inner, wrapper.iv, aad, first);
    keyring.unlock(await importVaultKey(raw, wrapper.vaultKeyId));
    await setLocalValue(db, 'passcodeFailures', 0);
    return 'ok';
  } catch {
    if (failures >= MAX_FAILURES) {
      await removeWrapper(db, wrapper.id);
      await setLocalValue(db, 'passcodeFailures', 0);
      return 'removed';
    }
    return 'wrong';
  } finally {
    raw?.fill(0);
  }
}

// ---- the passkey ----

/** The part of `navigator.credentials` this uses, so that a test gives a virtual one. */
export interface CredentialsApi {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}

interface PrfExtensionResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } };
}

const prfOf = (credential: Credential | null): PrfExtensionResults | undefined =>
  (credential as PublicKeyCredential | null)?.getClientExtensionResults?.() as
    PrfExtensionResults | undefined;

/** Whether this browser and device can make a passkey that has the PRF extension: offered first at setup, and not offered where it is not there. */
export async function passkeyAvailable(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false;
  try {
    const caps = (
      PublicKeyCredential as unknown as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      }
    ).getClientCapabilities;
    const capabilities = caps ? await caps.call(PublicKeyCredential) : undefined;
    if (capabilities && capabilities['extension:prf'] === false) return false;
    if (capabilities && capabilities['userVerifyingPlatformAuthenticator'] === false) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const bytesOfPrf = (value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> =>
  copy(
    ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value),
  );

/** HKDF-SHA-256 of a PRF output: the AES-256-GCM key that wraps the vault key. */
async function keyOfPrf(output: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', copy(output), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('wallet/v1/unlock-key'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const evaluation = {
  prf: { eval: { first: encoder.encode(PRF_SALT) } },
} as AuthenticationExtensionsClientInputs;

async function prfOutput(
  api: CredentialsApi,
  credentialId: Uint8Array,
  rpId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const credential = await api.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId,
      allowCredentials: [{ type: 'public-key', id: copy(credentialId) }],
      userVerification: 'required',
      extensions: evaluation,
    },
  });
  const first = prfOf(credential)?.prf?.results?.first;
  if (!first) throw new Error('no_prf');
  return bytesOfPrf(first);
}

/** Makes a passkey for unlocking and wraps the vault key under it. Two prompts: one to make it, one to prove it works. */
export async function enrollPasskey(
  db: LocalDatabase,
  material: Material,
  label: string,
  now: number,
  api: CredentialsApi = navigator.credentials,
  rpId: string = location.hostname,
): Promise<UnlockWrapper> {
  const created = await api.create({
    publicKey: {
      rp: { id: rpId, name: 'Wallet' },
      user: { id: randomBytes(16), name: 'Unlock Wallet', displayName: 'Unlock Wallet' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  });
  if (!created) throw new Error('cancelled');
  // A device that cannot do PRF says so here, and nothing has been stored.
  if (prfOf(created)?.prf?.enabled !== true) throw new Error('no_prf');
  const credentialId = copy(new Uint8Array((created as PublicKeyCredential).rawId));
  const output = await prfOutput(api, credentialId, rpId);
  const iv = randomBytes(12);
  const wrapper: UnlockWrapper = {
    id: crypto.randomUUID(),
    kind: 'passkey',
    label,
    createdAt: now,
    iv,
    ciphertext: await encrypt(
      await keyOfPrf(output),
      iv,
      aadOf('passkey', material.id),
      material.raw,
    ),
    vaultKeyId: material.id,
    passkey: { credentialId },
  };
  output.fill(0);
  await saveWrapper(db, wrapper);
  return wrapper;
}

export async function unlockWithPasskey(
  db: LocalDatabase,
  keyring: Keyring,
  api: CredentialsApi = navigator.credentials,
  rpId: string = location.hostname,
): Promise<Attempt> {
  const wrappers = (await unlockWrappers(db)).filter((w) => w.kind === 'passkey' && w.passkey);
  if (wrappers.length === 0) return 'none';
  const credential = await api.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId,
      allowCredentials: wrappers.map((w) => ({
        type: 'public-key' as const,
        id: copy((w.passkey as NonNullable<UnlockWrapper['passkey']>).credentialId),
      })),
      userVerification: 'required',
      extensions: evaluation,
    },
  });
  if (!credential) return 'wrong';
  const used = new Uint8Array((credential as PublicKeyCredential).rawId);
  const wrapper = wrappers.find((w) => {
    const id = w.passkey?.credentialId;
    return id && id.length === used.length && id.every((byte, i) => byte === used[i]);
  });
  const first = prfOf(credential)?.prf?.results?.first;
  if (!wrapper || !first) return 'wrong';
  let raw: Uint8Array | undefined;
  try {
    raw = await decrypt(
      await keyOfPrf(bytesOfPrf(first)),
      wrapper.iv,
      aadOf('passkey', wrapper.vaultKeyId),
      wrapper.ciphertext,
    );
    keyring.unlock(await importVaultKey(raw, wrapper.vaultKeyId));
    return 'ok';
  } catch {
    return 'wrong';
  } finally {
    raw?.fill(0);
  }
}

/** Removes a way of unlocking from this device. */
export const removeUnlockMethod = removeWrapper;
export const unlockMethods = unlockWrappers;
