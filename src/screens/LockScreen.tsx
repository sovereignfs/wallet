'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FormField, Input, Textarea } from '@sovereignfs/ui';
import { deriveInWorker } from '../keyring/derive';
import {
  type Material,
  type Attempt,
  unlockMethods,
  unlockWithPasscode,
  unlockWithPasskey,
} from '../keyring/wrappers';
import type { UnlockWrapper } from '../local/db';
import { classify, openProtected } from './keyFiles';
import styles from './Screens.module.css';
import { UnlockMethods } from './UnlockMethods';
import { WalletMark } from '../ui/WalletMark';
import { useWallet } from './WalletProvider';

/**
 * The lock screen (DESIGN.md §9, §26.2): it replaces everything while the wallet is locked. Unlocking is the daily way in and needs no connection: a
 * passkey (Face ID, a fingerprint), a device passcode, or the wallet key or recovery key, which also opens a new device. Nothing here asks the server.
 */
export function LockScreen() {
  const { db, keyring, unlockWith, openWithKeyText } = useWallet();
  const [methods, setMethods] = useState<UnlockWrapper[] | null>(null);
  const [passcode, setPasscode] = useState('');
  const [keyText, setKeyText] = useState('');
  const [useKey, setUseKey] = useState(false);
  const [protectedText, setProtectedText] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<Material | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void unlockMethods(db).then((found) => {
      setMethods(found);
      // With neither a passkey nor a passcode, the key is the way.
      if (found.length === 0) setUseKey(true);
    });
  }, [db]);

  const hasPasskey = methods?.some((m) => m.kind === 'passkey') ?? false;
  const hasPasscode = methods?.some((m) => m.kind === 'passcode') ?? false;

  async function run(attempt: () => Promise<Attempt>, wrong: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await attempt();
      if (result === 'wrong') setError(wrong);
      if (result === 'removed') {
        setError(
          'That was the fifth wrong passcode, so it was removed from this device. Use your passkey or your wallet key.',
        );
        setMethods(await unlockMethods(db));
      }
      if (result === 'ok') setPasscode('');
    } catch {
      setError('That did not work. Try again, or use your wallet key.');
    } finally {
      setBusy(false);
    }
  }

  async function withKey(text: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await openWithKeyText(text);
      if (result === 'not_a_key')
        return setError('That is not a key. A wallet key starts with AGE-SECRET-KEY-1.');
      if (result === 'wrong_key') return setError('That key does not open this wallet.');
      if (result === 'no_vault')
        return setError('This device has no copy of your wallet’s header. Connect, and try again.');
      // What was pasted is let go of at once: it is not kept in the page once it has opened the header.
      setKeyText('');
      // A way to unlock this device is offered while the bytes are in hand, if it has none yet.
      if ((methods ?? []).length === 0) setOffer(result);
      else await unlockWith(result);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    await submitKey(await file.text());
  }

  /** A key, or a file that needs a passphrase first. */
  async function submitKey(text: string) {
    const input = classify(text);
    if (input.kind === 'protected') {
      setError(null);
      setProtectedText(text);
      return;
    }
    await withKey(text);
  }

  async function withPassphrase() {
    if (protectedText === null) return;
    setBusy(true);
    const opened = await openProtected(protectedText, passphrase);
    setBusy(false);
    if (!opened.ok)
      return setError(
        opened.reason === 'wrong_passphrase'
          ? 'That passphrase is not right.'
          : 'That file is not a key file.',
      );
    setProtectedText(null);
    setPassphrase('');
    await withKey(opened.text);
  }

  if (offer) {
    return (
      <main className={styles.page}>
        <div className={`${styles.column} ${styles.narrow}`}>
          <h1 className={styles.heading}>Make unlocking quick on this device</h1>
          <UnlockMethods
            material={offer}
            doneLabel="Open my wallet"
            onDone={() => {
              const material = offer;
              setOffer(null);
              void unlockWith(material);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} aria-labelledby="lock-heading">
      <div className={`${styles.column} ${styles.narrow}`}>
        <div className={styles.stack}>
          <WalletMark label="Wallet" className="" />
          <h1 id="lock-heading" className={styles.heading}>
            Your wallet is locked
          </h1>
          <p className={styles.lead}>Only you can unlock it, here, with no connection.</p>
        </div>
        {error ? (
          <Alert variant="error" id="lock-error">
            {error}
          </Alert>
        ) : null}
        {methods === null ? null : (
          <>
            {hasPasskey ? (
              <div>
                <Button
                  size="lg"
                  loading={busy}
                  onClick={() =>
                    void run(() => unlockWithPasskey(db, keyring), 'The passkey did not unlock it.')
                  }
                >
                  Unlock with passkey
                </Button>
              </div>
            ) : null}
            {hasPasscode ? (
              <form
                className={styles.stack}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    () => unlockWithPasscode(db, keyring, passcode, deriveInWorker),
                    'That passcode is not right.',
                  );
                }}
              >
                <FormField label="Passcode">
                  {(field) => (
                    <Input
                      {...field}
                      type="password"
                      autoComplete="current-password"
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                    />
                  )}
                </FormField>
                <div>
                  <Button type="submit" loading={busy} disabled={passcode === ''}>
                    Unlock
                  </Button>
                </div>
              </form>
            ) : null}
            {useKey ? (
              <div className={styles.stack}>
                <FormField
                  label="Wallet key or recovery key"
                  hint="Paste it, or choose the key file. It never leaves this device."
                >
                  {(field) => (
                    <Textarea
                      {...field}
                      rows={3}
                      spellCheck={false}
                      autoComplete="off"
                      value={keyText}
                      onChange={(event) => setKeyText(event.target.value)}
                    />
                  )}
                </FormField>
                {protectedText !== null ? (
                  <form
                    className={styles.stack}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void withPassphrase();
                    }}
                  >
                    <FormField label="Passphrase of the key file">
                      {(field) => (
                        <Input
                          {...field}
                          type="password"
                          autoComplete="off"
                          value={passphrase}
                          onChange={(event) => setPassphrase(event.target.value)}
                        />
                      )}
                    </FormField>
                    <div>
                      <Button type="submit" loading={busy} disabled={passphrase === ''}>
                        Open key file
                      </Button>
                    </div>
                  </form>
                ) : null}
                <div className={styles.row}>
                  <Button
                    loading={busy}
                    disabled={keyText.trim() === ''}
                    onClick={() => void submitKey(keyText)}
                  >
                    Unlock with key
                  </Button>
                  <Button variant="secondary" onClick={() => input.current?.click()}>
                    Choose key file
                  </Button>
                  <input
                    ref={input}
                    type="file"
                    hidden
                    onChange={(event) => void chooseFile(event.target.files?.[0])}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Button variant="ghost" onClick={() => setUseKey(true)}>
                  Use my wallet key or recovery key
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
