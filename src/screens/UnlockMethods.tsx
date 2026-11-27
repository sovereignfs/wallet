'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { deriveInWorker } from '../keyring/derive';
import {
  PASSCODE_MIN_LENGTH,
  type Material,
  enrollPasscode,
  enrollPasskey,
  passkeyAvailable,
  removeUnlockMethod,
  unlockMethods,
} from '../keyring/wrappers';
import type { UnlockWrapper } from '../local/db';
import styles from './Screens.module.css';
import { useWallet } from './WalletProvider';

/**
 * Ways to unlock this device (DESIGN.md §9.3), made at setup, on a new device once the suite's key has brought the root, and from Settings. **A passkey is
 * offered first where the device has one that can do it** (Face ID, a fingerprint, Windows Hello with the PRF extension), and a passcode otherwise or as well.
 * Each keeps the keyring root encrypted on this device, so that the wallet opens with no connection; the suite's key still opens everything online.
 *
 * The root's bytes are in `material` only for as long as this screen is: the caller zeroes them when it is done. The two passcode boxes are read when the button
 * is pressed, since a password manager can fill them without telling the page.
 */
export function UnlockMethods({
  material,
  onDone,
  doneLabel = 'Continue',
  required = false,
}: {
  material: Material;
  onDone: () => void;
  doneLabel?: string;
  /** At least one way is needed to go on: without one, a restart with no signal could not open the wallet. */
  required?: boolean;
}) {
  const { db } = useWallet();
  const [methods, setMethods] = useState<UnlockWrapper[]>([]);
  const [passkey, setPasskey] = useState(false);
  const passcodeBox = useRef<HTMLInputElement>(null);
  const againBox = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'passkey' | 'passcode' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void unlockMethods(db).then(setMethods);
    void passkeyAvailable().then(setPasskey);
  }, [db]);

  const havePasskey = methods.some((m) => m.kind === 'passkey');
  const havePasscode = methods.some((m) => m.kind === 'passcode');

  async function addPasskey() {
    setError(null);
    setBusy('passkey');
    try {
      // The root's bytes are copied, so that making a wrapper cannot spoil the ones the caller still holds.
      await enrollPasskey(
        db,
        { raw: new Uint8Array(material.raw), epoch: material.epoch },
        'This device',
        Date.now(),
      );
      setMethods(await unlockMethods(db));
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === 'no_prf'
          ? 'This device cannot unlock with a passkey. Use a passcode instead.'
          : 'The passkey was not made. You can try again, or use a passcode.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function addPasscode() {
    setError(null);
    const passcode = passcodeBox.current?.value ?? '';
    if ([...passcode].length < PASSCODE_MIN_LENGTH)
      return setError(`A passcode is at least ${PASSCODE_MIN_LENGTH} characters.`);
    if (passcode !== (againBox.current?.value ?? ''))
      return setError('The two passcodes are not the same.');
    setBusy('passcode');
    try {
      await enrollPasscode(
        db,
        { raw: new Uint8Array(material.raw), epoch: material.epoch },
        passcode,
        Date.now(),
        deriveInWorker,
      );
      if (passcodeBox.current) passcodeBox.current.value = '';
      if (againBox.current) againBox.current.value = '';
      setMethods(await unlockMethods(db));
    } catch {
      setError('The passcode was not set. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    await removeUnlockMethod(db, id);
    setMethods(await unlockMethods(db));
  }

  return (
    <div className={styles.stack}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {passkey ? (
        <div className={styles.stack}>
          <p className={styles.lead}>
            Unlock with your face or fingerprint. It works with no connection, and it only unlocks
            this device.
          </p>
          <div>
            <Button
              variant={havePasskey ? 'secondary' : 'primary'}
              loading={busy === 'passkey'}
              onClick={() => void addPasskey()}
            >
              {havePasskey ? 'Add another passkey' : 'Use a passkey'}
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.muted}>
          This device cannot unlock with a passkey, so a passcode is the quick way.
        </p>
      )}
      <div className={styles.stack}>
        <h3 className={styles.sectionTitle}>
          {havePasscode ? 'Change the passcode' : 'A passcode'}
        </h3>
        <FormField
          label="Passcode"
          hint={`At least ${PASSCODE_MIN_LENGTH} characters. Five wrong tries and this passcode is deleted from the device.`}
        >
          {(field) => (
            <Input {...field} ref={passcodeBox} type="password" autoComplete="new-password" />
          )}
        </FormField>
        <FormField label="Passcode again">
          {(field) => (
            <Input {...field} ref={againBox} type="password" autoComplete="new-password" />
          )}
        </FormField>
        <div>
          <Button
            variant="secondary"
            loading={busy === 'passcode'}
            onClick={() => void addPasscode()}
          >
            {havePasscode ? 'Change passcode' : 'Set passcode'}
          </Button>
        </div>
        <p className={styles.muted}>
          A passcode is weaker than a passkey against someone who copies this browser’s data and
          guesses, so choose a long one.
        </p>
      </div>
      {methods.length > 0 ? (
        <ul className={styles.list} aria-label="Ways this device unlocks">
          {methods.map((method) => (
            <li key={method.id} className={styles.item}>
              <span>
                {method.kind === 'passkey' ? `Passkey: ${method.label}` : 'Device passcode'}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void remove(method.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        {required && methods.length === 0 ? (
          <p className={styles.muted}>
            Add a passkey or a passcode to go on: without one, this device could not open your
            wallet with no connection.
          </p>
        ) : null}
        <Button disabled={required && methods.length === 0} onClick={onDone}>
          {methods.length > 0 ? doneLabel : 'Not now'}
        </Button>
      </div>
    </div>
  );
}
