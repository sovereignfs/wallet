'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Checkbox, FormField, Input, Textarea } from '@sovereignfs/ui';
import { toBase64Url } from '../core/encoding';
import {
  type Identity,
  createIdentity,
  createVaultHeader,
  keyFile,
  parseIdentity,
  protectKeyFile,
} from '../core/vault';
import type { Material } from '../keyring/wrappers';
import { fetchTransport } from '../local/transport';
import * as store from '../local/store';
import { classify, download, openProtected } from './keyFiles';
import { RecoverySheet } from './RecoverySheet';
import styles from './Screens.module.css';
import { UnlockMethods } from './UnlockMethods';
import { useWallet } from './WalletProvider';

/**
 * Setup (DESIGN.md §26.3, §7): one step at a time, after the first sign-in on an account with no wallet. **The keys are made here, in the browser, and the
 * server is told only their public halves** and a sealed header. The person saves the key before going on and proves they did by typing its last six
 * characters; the recovery key is printed, and can be skipped only by saying what that means.
 *
 *   welcome → wallet key (create or import) → recovery key → unlocking this device → done
 */
type Step = 'welcome' | 'key' | 'recovery' | 'making' | 'methods' | 'done';

const tail = (identity: string) => identity.slice(-6);
const today = () => new Date().toISOString().slice(0, 10);

export function Setup({ name }: { name: string }) {
  const { unlockWith, refreshVault, db, setSettingUp } = useWallet();
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [wallet, setWallet] = useState<Identity | null>(null);
  const [recovery, setRecovery] = useState<Identity | null>(null);
  const [skipRecovery, setSkipRecovery] = useState(false);
  const [material, setMaterial] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Making the vault changes where the wallet stands, and setup stays on screen until its last step.
  useEffect(() => {
    setSettingUp(true);
  }, [setSettingUp]);

  async function make() {
    if (!wallet) return;
    setError(null);
    setStep('making');
    const recipients = [
      wallet.recipient,
      ...(recovery && !skipRecovery ? [recovery.recipient] : []),
    ];
    const made = await createVaultHeader(recipients, new Date());
    const result = await fetchTransport().createVault({
      recipients: [
        { recipient: wallet.recipient, label: 'wallet' },
        ...(recovery && !skipRecovery
          ? [{ recipient: recovery.recipient, label: 'recovery' }]
          : []),
      ],
      header: toBase64Url(made.header),
      vaultKeyId: made.contents.id,
    });
    if (result === 'created') {
      const vault = await fetchTransport().vault();
      if (vault) await store.saveVault(db, vault);
      await refreshVault();
      setMaterial({ raw: made.contents.raw, id: made.contents.id });
      // The secrets of the setup are let go of: the wallet key was saved by the person, and the recovery key was printed.
      setWallet(null);
      setRecovery(null);
      setStep('methods');
    } else if (result === 'exists') {
      await refreshVault();
      setError(
        'This account already has a wallet, made on another device. Unlock it with your wallet key.',
      );
      setStep('recovery');
    } else {
      setError(
        result === 'offline'
          ? 'Making your wallet needs a connection. Connect, and try again.'
          : 'Your wallet could not be made. Try again.',
      );
      setStep('recovery');
    }
  }

  async function finish() {
    if (material) await unlockWith(material);
    setMaterial(null);
    // Keeping what is on this device matters: the browser is asked not to clear it (DESIGN.md §10.8).
    void navigator.storage?.persist?.().catch(() => undefined);
    setStep('done');
  }

  return (
    <Page>
      <p className={styles.muted}>
        {step === 'welcome'
          ? ' '
          : `Step ${['key', 'recovery', 'making', 'methods', 'done'].indexOf(step) + 1} of 5`}
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}

      {step === 'welcome' ? (
        <>
          <h1 className={styles.heading}>Set up your wallet</h1>
          <p className={styles.lead}>
            Only you can read your wallet. That means nobody, including us, can recover it if you
            lose your key. You will make a key, keep it somewhere safe, and use it, or your face or
            fingerprint, to open the wallet.
          </p>
          <div>
            <Button size="lg" onClick={() => setStep('key')}>
              Get started
            </Button>
          </div>
        </>
      ) : null}

      {step === 'key' ? (
        <WalletKeyStep
          onDone={(identity) => {
            setWallet(identity);
            setStep('recovery');
          }}
        />
      ) : null}

      {step === 'recovery' && wallet ? (
        <RecoveryStep
          name={name}
          recovery={recovery}
          setRecovery={setRecovery}
          skip={skipRecovery}
          setSkip={setSkipRecovery}
          onDone={() => void make()}
        />
      ) : null}

      {step === 'making' ? <p className={styles.lead}>Making your wallet…</p> : null}

      {step === 'methods' && material ? (
        <>
          <h1 className={styles.heading}>Unlock this device</h1>
          <UnlockMethods material={material} onDone={() => void finish()} />
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <h1 className={styles.heading}>Your wallet is ready</h1>
          <p className={styles.lead}>
            Add your first card. Everything you add is locked in your browser before it leaves it.
          </p>
          <div className={styles.row}>
            <Button
              onClick={() => {
                setSettingUp(false);
                router.replace('/cards/new');
              }}
            >
              Add a card
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSettingUp(false);
                router.replace('/');
              }}
            >
              Go to Home
            </Button>
          </div>
        </>
      ) : null}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={`${styles.column} ${styles.narrow}`}>{children}</div>
    </main>
  );
}

/** Make a wallet key, save it, and prove it was saved; or bring one that already exists. */
function WalletKeyStep({ onDone }: { onDone: (identity: Identity) => void }) {
  const [mode, setMode] = useState<'create' | 'import'>('create');
  return (
    <>
      <h1 className={styles.heading}>Your wallet key</h1>
      <p className={styles.lead}>
        The key opens your wallet. It is made here, in your browser, and the server never sees it.{' '}
        <strong>Nobody can recover it.</strong>
      </p>
      <div className={styles.row}>
        <Button
          variant={mode === 'create' ? 'primary' : 'secondary'}
          onClick={() => setMode('create')}
        >
          Make a new key
        </Button>
        <Button
          variant={mode === 'import' ? 'primary' : 'secondary'}
          onClick={() => setMode('import')}
        >
          I already have one
        </Button>
      </div>
      {mode === 'create' ? <CreateKey onDone={onDone} /> : <ImportKey onDone={onDone} />}
    </>
  );
}

function CreateKey({ onDone }: { onDone: (identity: Identity) => void }) {
  const [key, setKey] = useState<Identity | null>(null);
  const [saved, setSaved] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void createIdentity().then((made) => current && setKey(made));
    return () => {
      current = false;
    };
  }, []);

  if (!key) return <p className={styles.muted}>Making your key…</p>;
  const file = () => keyFile(key, 'wallet', new Date());
  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Save the key file somewhere safe: a password manager, a drive that is not this phone.
      </p>
      <div className={styles.row}>
        <Button
          onClick={() => {
            download(`wallet-key-${today()}.txt`, file());
            setSaved(true);
          }}
        >
          Download the key file
        </Button>
      </div>
      <FormField
        label="Protect the file with a passphrase (optional)"
        hint="You will need the passphrase to open the file."
      >
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button
          variant="secondary"
          loading={busy}
          disabled={passphrase.length < 8}
          onClick={async () => {
            setBusy(true);
            download(`wallet-key-${today()}.age.txt`, await protectKeyFile(file(), passphrase));
            setBusy(false);
            setSaved(true);
          }}
        >
          Download a protected file
        </Button>
        {passphrase !== '' && passphrase.length < 8 ? (
          <span className={styles.muted}>At least 8 characters.</span>
        ) : null}
      </div>
      <p className={styles.muted}>Or write the key down. This is it, shown once:</p>
      <div className={styles.secret} aria-label="Your wallet key">
        {key.identity}
      </div>
      <FormField label={`To show you kept it, type the last six characters: ${tail(key.identity)}`}>
        {(field) => (
          <Input
            {...field}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button
          disabled={!saved || typed.trim().toUpperCase() !== tail(key.identity)}
          onClick={() => onDone(key)}
        >
          I have saved my key
        </Button>
        {!saved ? (
          <p className={styles.muted}>
            Download the file first (or write the key down and download it anyway to continue).
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ImportKey({ onDone }: { onDone: (identity: Identity) => void }) {
  const [text, setText] = useState('');
  const [protectedText, setProtectedText] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function use(keyText: string) {
    setError(null);
    if (classify(keyText).kind === 'protected') return setProtectedText(keyText);
    const parsed = await parseIdentity(keyText);
    if (!parsed.ok)
      return setError(
        parsed.reason === 'unsupported'
          ? 'That kind of key is not supported here.'
          : parsed.reason === 'several'
            ? 'That has more than one key in it. Paste one.'
            : 'That is not a key. A wallet key starts with AGE-SECRET-KEY-1.',
      );
    onDone({ identity: parsed.identity, recipient: parsed.recipient });
  }

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Paste a key, or choose a key file. A key from Tusk, Fjord or the age tool works.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Key">
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </FormField>
      <input
        type="file"
        aria-label="Key file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) void use(await file.text());
        }}
      />
      {protectedText !== null ? (
        <div className={styles.stack}>
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
                if (!opened.ok)
                  return setError(
                    opened.reason === 'wrong_passphrase'
                      ? 'That passphrase is not right.'
                      : 'That file is not a key file.',
                  );
                setProtectedText(null);
                await use(opened.text);
              }}
            >
              Open key file
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button disabled={text.trim() === ''} onClick={() => void use(text)}>
          Use this key
        </Button>
      </div>
    </div>
  );
}

/** A second key on a printed sheet, or a skip that says what it means. */
function RecoveryStep({
  name,
  recovery,
  setRecovery,
  skip,
  setSkip,
  onDone,
}: {
  name: string;
  recovery: Identity | null;
  setRecovery: (identity: Identity | null) => void;
  skip: boolean;
  setSkip: (skip: boolean) => void;
  onDone: () => void;
}) {
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    let current = true;
    void createIdentity().then((made) => current && setRecovery(made));
    return () => {
      current = false;
    };
  }, [setRecovery]);

  return (
    <>
      <h1 className={styles.heading}>Your recovery key</h1>
      <p className={styles.lead}>
        A second key, on paper, in a drawer. If you lose your wallet key, this opens everything. We
        strongly recommend it.
      </p>
      {recovery && !skip ? (
        <div className={styles.stack}>
          <RecoverySheet identity={recovery.identity} name={name} date={today()} />
          {printing ? (
            <RecoverySheet identity={recovery.identity} name={name} date={today()} print />
          ) : null}
          <div className={styles.row}>
            <Button
              onClick={() => {
                setPrinting(true);
                // The sheet is put on the page first, and the browser prints what is there.
                setTimeout(() => {
                  window.print();
                  setPrinting(false);
                  setPrinted(true);
                }, 50);
              }}
            >
              Print the sheet
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                download(
                  `wallet-recovery-key-${today()}.txt`,
                  keyFile(recovery, 'recovery', new Date()),
                );
                setPrinted(true);
              }}
            >
              Download it instead
            </Button>
          </div>
          <FormField
            label={`To show you kept it, type the last six characters: ${tail(recovery.identity)}`}
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </FormField>
        </div>
      ) : null}
      <Checkbox
        checked={skip}
        onChange={setSkip}
        label="I understand that if I lose my wallet key, nobody can recover my wallet"
      />
      <div>
        <Button
          disabled={
            skip
              ? false
              : !recovery || !printed || typed.trim().toUpperCase() !== tail(recovery.identity)
          }
          onClick={onDone}
        >
          {skip ? 'Continue without a recovery key' : 'I have kept my recovery key'}
        </Button>
      </div>
    </>
  );
}
