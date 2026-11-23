'use client';

import { useRouter, useSearchParams } from './nav';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Tabs,
  Textarea,
} from '@sovereignfs/ui';
import { IDLE_CHOICES, type HiddenLock, type IdleMinutes } from '../keyring/keyring';
import { authClient, signInValue } from '../auth/client';
import { forgetIdentity } from '../identity';
import { type RefusedItem, eraseLocal } from '../local/db';
import { openSealed } from '../local/open';
import { type Material, unlockMethods } from '../keyring/wrappers';
import { classify, openProtected } from './keyFiles';
import screens from './Screens.module.css';
import { useIdentity } from './SignedInArea';
import { UnlockMethods } from './UnlockMethods';
import { useWallet } from './WalletProvider';

/**
 * Settings (DESIGN.md §27), the parts that exist in 0.1.0: **Security** (locking, the ways this device unlocks, the keys), **Storage** (what has not been
 * sent, what the server refused, what this browser keeps) and **Account** (signing out, deleting). Each says in a sentence what it does and what the server can
 * see; a setting that is only for this device says so.
 */
type Tab = 'security' | 'storage' | 'account';

export function SettingsScreen() {
  const { email } = useIdentity();
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab =
    params.get('tab') === 'storage'
      ? 'storage'
      : params.get('tab') === 'account'
        ? 'account'
        : 'security';
  return (
    <main className={screens.page}>
      <div className={screens.column}>
        <h1 className={screens.heading}>Settings</h1>
        <Tabs
          aria-label="Settings"
          value={tab}
          onChange={(next) => router.replace(`/settings?tab=${next}`)}
          items={[
            { value: 'security', label: 'Security' },
            { value: 'storage', label: 'Storage' },
            { value: 'account', label: 'Account' },
          ]}
        />
        {tab === 'security' ? <Security /> : null}
        {tab === 'storage' ? <Storage /> : null}
        {tab === 'account' ? <Account email={email} /> : null}
      </div>
    </main>
  );
}

const HIDDEN_NAMES: Record<HiddenLock, string> = {
  now: 'As soon as it is hidden',
  '1m': 'After a minute hidden',
  never: 'Never when hidden',
};

function Security() {
  const { keyring, timers, setTimers, vault, db, openWithKeyText } = useWallet();
  const [methods, setMethods] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [keyText, setKeyText] = useState('');
  const [protectedText, setProtectedText] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);

  const refresh = useCallback(
    () => void unlockMethods(db).then((found) => setMethods(found.length)),
    [db],
  );
  useEffect(refresh, [refresh]);
  const hasRecovery = vault?.recipients.some((r) => r.label === 'recovery') ?? false;

  async function check(text: string) {
    setError(null);
    if (classify(text).kind === 'protected') return setProtectedText(text);
    const result = await openWithKeyText(text);
    if (result === 'not_a_key') return setError('That is not a key.');
    if (result === 'wrong_key' || result === 'no_vault')
      return setError('That key does not open this wallet.');
    setAsking(false);
    setKeyText('');
    setMaterial(result);
  }

  return (
    <div className={screens.stack}>
      <section className={screens.stack} aria-labelledby="lock-heading">
        <h2 id="lock-heading" className={screens.sectionTitle}>
          Locking
        </h2>
        <p className={screens.muted}>
          These are for this device only. Locking drops the keys from memory; unlocking needs no
          connection.
        </p>
        <FormField label="Lock after no use">
          {(field) => (
            <Select
              {...field}
              value={String(timers.idleMinutes)}
              onChange={(event) =>
                void setTimers({
                  ...timers,
                  idleMinutes: Number(event.target.value) as IdleMinutes,
                })
              }
            >
              {IDLE_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 1 ? '1 minute' : `${minutes} minutes`}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Lock when Wallet is hidden">
          {(field) => (
            <Select
              {...field}
              value={timers.hidden}
              onChange={(event) =>
                void setTimers({ ...timers, hidden: event.target.value as HiddenLock })
              }
            >
              {(Object.keys(HIDDEN_NAMES) as HiddenLock[]).map((key) => (
                <option key={key} value={key}>
                  {HIDDEN_NAMES[key]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <div>
          <Button variant="secondary" onClick={() => keyring.lock('manual')}>
            Lock now
          </Button>
        </div>
      </section>

      <section className={screens.section} aria-labelledby="unlock-heading">
        <h2 id="unlock-heading" className={screens.sectionTitle}>
          Unlocking this device
        </h2>
        {material ? (
          <UnlockMethods
            material={material}
            onDone={() => {
              material.raw.fill(0);
              setMaterial(null);
              refresh();
            }}
            doneLabel="Done"
          />
        ) : (
          <>
            <p className={screens.muted}>
              {methods === null
                ? ' '
                : methods === 0
                  ? 'This device has no quick way to unlock. You use your wallet key each time.'
                  : 'This device unlocks with a passkey or a passcode.'}
            </p>
            {asking ? (
              <div className={screens.stack}>
                {error ? <Alert variant="error">{error}</Alert> : null}
                <FormField
                  label="Your wallet key or recovery key"
                  hint="To change how this device unlocks, prove it is you. The key stays on this device."
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
                  <div className={screens.stack}>
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
                      <Button
                        onClick={async () => {
                          const opened = await openProtected(protectedText, passphrase);
                          if (!opened.ok) return setError('That passphrase is not right.');
                          setProtectedText(null);
                          await check(opened.text);
                        }}
                      >
                        Open key file
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className={screens.row}>
                  <Button disabled={keyText.trim() === ''} onClick={() => void check(keyText)}>
                    Continue
                  </Button>
                  <Button variant="ghost" onClick={() => setAsking(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="secondary" onClick={() => setAsking(true)}>
                  Change how this device unlocks
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={screens.section} aria-labelledby="keys-heading">
        <h2 id="keys-heading" className={screens.sectionTitle}>
          Your keys
        </h2>
        <p className={screens.muted}>
          Your wallet key opens everything.{' '}
          {hasRecovery
            ? 'You made a recovery key too: either one opens your wallet.'
            : 'You skipped the recovery key: if you lose your wallet key, nobody can recover your wallet.'}{' '}
          Replacing keys comes in a later version.
        </p>
      </section>
    </div>
  );
}

function Storage() {
  const { wallet, loop, accountId, keyring } = useWallet();
  const [unsent, setUnsent] = useState(0);
  const [refused, setRefused] = useState<{ item: RefusedItem; title: string }[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number; persisted: boolean } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setUnsent(await wallet.unsentCount());
    const items = await wallet.refusedChanges();
    const named = await Promise.all(
      items.map(async (item) => {
        const last = item.items.at(-1)?.mutation;
        let title = 'An entry';
        if (last?.op === 'put' && last.shape && keyring.state === 'unlocked') {
          const opened = await openSealed(
            accountId,
            keyring,
            { id: last.entryId, wrappedKey: last.wrappedKey ?? '', shape: last.shape, body: null },
            false,
          );
          if (opened.ok && opened.shape.kind === 'card') title = opened.shape.title;
        }
        return { item, title };
      }),
    );
    setRefused(named);
    const estimate = await navigator.storage?.estimate?.();
    setUsage({
      used: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
      persisted: (await navigator.storage?.persisted?.()) ?? false,
    });
  }, [wallet, accountId, keyring]);
  useEffect(() => void refresh(), [refresh]);

  const REASONS: Record<string, string> = {
    limit: 'You have reached the most entries this server allows.',
    quota: 'This would take more space than the server allows you.',
    too_large: 'It is larger than the server allows.',
    invalid: 'The server could not accept it.',
    tier_unavailable: 'This version of the server cannot keep that.',
    offline_mode: 'Your wallet is kept fully offline, so the server takes no content.',
    not_found: 'The server does not have what this change was for.',
    stale: 'It was changed somewhere else.',
  };

  return (
    <div className={screens.stack}>
      <section className={screens.stack} aria-labelledby="sync-heading">
        <h2 id="sync-heading" className={screens.sectionTitle}>
          Sending
        </h2>
        <p className={screens.muted}>
          {unsent === 0
            ? 'Everything on this device has been sent.'
            : unsent === 1
              ? 'One change is waiting to be sent.'
              : `${unsent} changes are waiting to be sent.`}{' '}
          {loop.sessionEnded ? 'Your session has ended: sign in again, and they will be sent.' : ''}
        </p>
        <div>
          <Button variant="secondary" onClick={() => void loop.now().then(refresh)}>
            Send now
          </Button>
        </div>
      </section>

      <section className={screens.section} aria-labelledby="refused-heading">
        <h2 id="refused-heading" className={screens.sectionTitle}>
          Couldn’t sync
        </h2>
        {refused.length === 0 ? (
          <p className={screens.muted}>Nothing was refused.</p>
        ) : (
          <ul className={screens.list}>
            {refused.map(({ item, title }) => (
              <li key={item.entryId} className={screens.item}>
                <span>
                  <strong>{title}</strong>
                  <br />
                  <span className={screens.muted}>
                    {REASONS[item.code] ?? 'The server did not take it.'} It is kept here.
                  </span>
                </span>
                <span className={screens.row}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void wallet.retry(item.entryId).then(refresh)}
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void wallet.discard(item.entryId).then(refresh)}
                  >
                    Discard
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={screens.section} aria-labelledby="device-heading">
        <h2 id="device-heading" className={screens.sectionTitle}>
          This device
        </h2>
        <p className={screens.muted}>
          {usage
            ? `Wallet uses ${(usage.used / 1024 / 1024).toFixed(1)} MB of the ${(usage.quota / 1024 / 1024 / 1024).toFixed(1)} GB this browser allows. `
            : ' '}
          {usage?.persisted
            ? 'The browser has promised not to clear it.'
            : 'The browser may clear what it holds for a site it thinks you have not used, and Safari does so after a week. Your cards are also on the server, locked, so they come back; installing Wallet to your home screen helps.'}
        </p>
        {usage && !usage.persisted ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => void navigator.storage?.persist?.().then(refresh)}
            >
              Ask the browser to keep it
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Account({ email }: { email: string }) {
  const { accountId, keyring, db, loop } = useWallet();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [needsPassword, setNeedsPassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch('/api/account/delete', { credentials: 'same-origin' })
      .then((r) => r.json() as Promise<{ password: boolean }>)
      .then((r) => setNeedsPassword(r.password))
      .catch(() => undefined);
  }, [open]);

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      // The password is never sent (auth.md §4, rule 1): what the server checks is the sign-in value the page makes from it.
      const value = needsPassword && password ? await signInValue(password, email) : '';
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      if (response.status === 403) {
        const body = (await response.json()) as { code?: string };
        setError(
          body.code === 'SESSION_NOT_FRESH'
            ? 'Sign in again, and then delete the account.'
            : 'That password is not right.',
        );
        return;
      }
      if (!response.ok) return setError('The account could not be deleted. Try again.');
      keyring.lock('sign-out');
      // The store cannot be deleted while this page holds it open, and nothing is to be sent for an account that is gone.
      loop.stop();
      db.close();
      await eraseLocal(accountId);
      forgetIdentity();
      // The session's cookie is cleared as well: the account it was for is gone, but the browser still holds the cookie.
      await authClient.signOut().catch(() => undefined);
      window.location.assign('/');
    } catch {
      setError('Deleting needs a connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={screens.stack}>
      <section className={screens.stack}>
        <h2 className={screens.sectionTitle}>Signed in as</h2>
        <p>{email}</p>
        <p className={screens.muted}>
          Your name and address are the only things the server can read about you. Everything you
          keep in your wallet is locked in your browser first.
        </p>
      </section>
      <section className={screens.section}>
        <h2 className={screens.sectionTitle}>Delete my account</h2>
        <p className={screens.muted}>
          This deletes your wallet and everything in it from the server, for good, and erases it
          from this device. Other devices erase it the next time they connect. Nobody can bring it
          back.
        </p>
        <div>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete my account…
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        message={
          <div className={screens.stack}>
            <p>Type “delete” to confirm.</p>
            <Input
              aria-label="Type delete to confirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            {needsPassword ? (
              <FormField label="Your password">
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </FormField>
            ) : null}
          </div>
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete everything'}
        destructive
        pending={
          busy || typed.trim().toLowerCase() !== 'delete' || (needsPassword && password === '')
        }
        error={error}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
