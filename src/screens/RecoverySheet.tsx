'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CodeView } from '../barcode/CodeView';
import styles from './RecoverySheet.module.css';

/** The identity in groups of four, so that it can be read out and typed: `AGE-SECRET-KEY-1ABCD…` → `AGE-SECRET-KEY-1 ABCD EFGH…`. */
export function groupsOf(identity: string): string {
  const body = identity.replace(/^AGE-SECRET-KEY-1/, '');
  return `AGE-SECRET-KEY-1 ${body.match(/.{1,4}/g)?.join(' ') ?? ''}`;
}

/**
 * The recovery sheet (DESIGN.md §7.3): the recovery key as text in groups and as a QR code, with the date, the account's name and what to do with it. It is
 * printed from the browser (nothing is sent anywhere), on one A4 or Letter page, and the browser forgets the key once the sheet has been confirmed.
 * While it is printing, the rest of the page is hidden (`RecoverySheet.module.css`).
 */
export function RecoverySheet({
  identity,
  name,
  date,
  print,
}: {
  identity: string;
  name: string;
  date: string;
  /** Shown only for printing (the page itself shows the key in its own way). */
  print?: boolean;
}) {
  useEffect(() => {
    if (!print) return;
    document.body.classList.add('printing-sheet');
    return () => document.body.classList.remove('printing-sheet');
  }, [print]);
  const sheet = (
    <article className={styles.sheet} aria-label="Recovery sheet">
      <h1 className={styles.title}>Wallet recovery sheet</h1>
      <p className={styles.meta}>
        For {name} · made on {date}
      </p>
      <p>
        This is a second key to your wallet. If you lose your wallet key, this opens everything.
        Anyone who has this sheet can open your wallet, so keep it somewhere safe, like a drawer or
        a safe. Nobody, including the people who run this server, can recover your wallet for you.
      </p>
      <div className={styles.code}>
        <CodeView payload={identity} label="Recovery key as a QR code" size={240} />
      </div>
      <p className={styles.key}>{groupsOf(identity)}</p>
      <h2 className={styles.how}>To use it</h2>
      <ol>
        <li>Open Wallet and choose “Use my wallet key or recovery key” on the lock screen.</li>
        <li>Type the key above, or scan the code, then choose a new wallet key.</li>
      </ol>
    </article>
  );
  // For printing, the sheet is put beside the app and the rest is hidden while the browser prints.
  return print ? createPortal(sheet, document.body) : sheet;
}
