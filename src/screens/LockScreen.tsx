'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { deriveInWorker } from '../keyring/derive';
import {
  type Attempt,
  unlockMethods,
  unlockWithPasscode,
  unlockWithPasskey,
} from '../keyring/wrappers';
import type { UnlockWrapper } from '../local/db';
import { useKeys } from '../keys/keys';
import styles from './Screens.module.css';
import { WalletMark } from '../ui/WalletMark';
import { accountProblem } from './accountProblem';
import { DeleteAccountDialog, WHAT_DELETION_DOES } from './DeleteAccount';
import { useWallet } from './WalletProvider';

/**
 * The lock screen (DESIGN.md §9, §26.2): it replaces everything while the wallet is locked. Unlocking is the daily way in and needs no connection: a passkey
 * (Face ID, a fingerprint) or a device passcode. **With neither on this device, or after five wrong passcodes, the suite's key opens it**: the password, for an
 * instance that runs alone, or Sovereign's release, hosted, which needs the network and brings the root back so that a way to unlock can be made again.
 *
 * **For an instance that runs alone, the password is not the end of it** (§28): a person whose password was reset, with no recovery kit and no device that still
 * unlocks, can delete the account from here, since nothing else would let them. It is offered beside the password only, and not on the everyday way in.
 *
 * **A box is read when its form is sent,** since a password manager can fill it without telling the page; no button waits for the page to hear of it, and an empty
 * box is the browser's to ask for.
 */
export function LockScreen({ email }: { email: string }) {
  const { db, keyring, openWithAccount, unlockWith } = useWallet();
  const keys = useKeys();
  const [methods, setMethods] = useState<UnlockWrapper[] | null>(null);
  const passcodeBox = useRef<HTMLInputElement>(null);
  const passwordBox = useRef<HTMLInputElement>(null);
  const [useAccount, setUseAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void unlockMethods(db).then((found) => {
      setMethods(found);
      // With neither a passkey nor a passcode, the suite's key is the way.
      if (found.length === 0) setUseAccount(true);
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
          'That was the fifth wrong passcode, so it was removed from this device. Use your passkey or your password.',
        );
        setMethods(await unlockMethods(db));
        setUseAccount(true);
      }
      if (result === 'ok' && passcodeBox.current) passcodeBox.current.value = '';
    } catch {
      setError('That did not work. Try again, or use your password.');
    } finally {
      setBusy(false);
    }
  }

  async function withAccount(typed?: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await openWithAccount(typed);
      if (!result.ok) {
        // `away`: the page is leaving, for Sovereign's release or the recovery kit.
        if (result.reason !== 'away') setError(accountProblem(result.reason));
        return;
      }
      if (passwordBox.current) passwordBox.current.value = '';
      // The root goes straight in; a device with no way to unlock it is asked for one, in setup, while the root is in hand (`WalletProvider`).
      await unlockWith(result.material);
    } catch {
      setError(accountProblem('unreadable'));
    } finally {
      setBusy(false);
    }
  }

  const core = keys.kind === 'core';
  return (
    <main className={styles.page} aria-labelledby="lock-heading">
      <div className={`${styles.column} ${styles.narrow}`}>
        <div className={styles.stack}>
          <WalletMark label="Wallet" className={styles.mark} />
          <h1 id="lock-heading" className={styles.heading}>
            Your wallet is locked
          </h1>
          <p className={styles.lead}>
            {methods === null
              ? ' '
              : methods.length > 0
                ? 'Unlock it here, with no connection.'
                : core
                  ? 'This device has no passkey or passcode. Unlock through Sovereign, and then add one.'
                  : 'This device has no passkey or passcode. Your password opens the wallet, and then you add one.'}
          </p>
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
                  const passcode = passcodeBox.current?.value ?? '';
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
                      ref={passcodeBox}
                      type="password"
                      autoComplete="off"
                      required
                    />
                  )}
                </FormField>
                <div>
                  <Button type="submit" loading={busy}>
                    Unlock
                  </Button>
                </div>
              </form>
            ) : null}
            {useAccount ? (
              core ? (
                <div>
                  <Button loading={busy} onClick={() => void withAccount()}>
                    Unlock through Sovereign
                  </Button>
                </div>
              ) : (
                <form
                  className={styles.stack}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void withAccount(passwordBox.current?.value ?? '');
                  }}
                >
                  <FormField
                    label="Your password"
                    hint="Your password is never sent. Unlocking this way needs a connection."
                  >
                    {(field) => (
                      <Input
                        {...field}
                        ref={passwordBox}
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    )}
                  </FormField>
                  <div>
                    <Button type="submit" loading={busy}>
                      Unlock with my password
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <div>
                <Button variant="ghost" onClick={() => setUseAccount(true)}>
                  {core ? 'Unlock through Sovereign' : 'Use my password'}
                </Button>
              </div>
            )}
            {useAccount && keys.kind === 'vault' ? <LostKeys email={email} /> : null}
          </>
        )}
      </div>
    </main>
  );
}

/** What is left when none of the ways opens the wallet: said plainly, and the account can be deleted (DESIGN.md §28). */
function LostKeys({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!shown)
    return (
      <div>
        <Button variant="ghost" onClick={() => setShown(true)}>
          I’ve lost my keys
        </Button>
      </div>
    );
  return (
    <section className={styles.section} aria-labelledby="lost-heading">
      <h2 id="lost-heading" className={styles.sectionTitle}>
        If nothing opens your wallet
      </h2>
      <p className={styles.muted}>
        After a password reset, your recovery kit opens it again: sign out, sign in, and type the
        kit. With no kit, and no device that still unlocks, nobody can bring back what is in it.
      </p>
      <p className={styles.muted}>You can delete your account instead. {WHAT_DELETION_DOES}</p>
      <div>
        <Button variant="destructive" onClick={() => setDeleting(true)}>
          Delete my account…
        </Button>
      </div>
      {deleting ? <DeleteAccountDialog email={email} onClose={() => setDeleting(false)} /> : null}
    </section>
  );
}
