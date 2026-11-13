'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState } from '@sovereignfs/ui';
import { unlockMethods } from '../keyring/wrappers';
import type { CardShape } from '../core/entries';
import { byCardOrder } from './cardColors';
import { CardTile } from './CardsScreen';
import styles from './Cards.module.css';
import screens from './Screens.module.css';
import { useIdentity } from './SignedInArea';
import { useEntries, useWallet } from './WalletProvider';

/** Home (DESIGN.md §26.4): favourite cards first, then the rest, and what needs attention in words. Everything on it is the device's own copy. */
export function HomeScreen() {
  const { name } = useIdentity();
  const entries = useEntries();
  const { db, wallet } = useWallet();
  const [methods, setMethods] = useState<number | null>(null);
  const [couldnt, setCouldnt] = useState(0);
  useEffect(() => {
    void unlockMethods(db).then((found) => setMethods(found.length));
    void wallet.refusedChanges().then((found) => setCouldnt(found.length));
  }, [db, wallet, entries]);

  const cards = useMemo(
    () =>
      entries
        .flatMap((e) =>
          e.shape.kind === 'card' ? [{ id: e.id, shape: e.shape as CardShape }] : [],
        )
        .filter((c) => !c.shape.archived)
        .sort(byCardOrder),
    [entries],
  );
  const favourites = cards.filter((c) => c.shape.favourite);
  const rest = cards.filter((c) => !c.shape.favourite).slice(0, 8);

  return (
    <main className={screens.page}>
      <div className={screens.column}>
        <h1 className={screens.heading}>{name ? `Hello, ${name.split(' ')[0]}` : 'Home'}</h1>
        {methods === 0 ? (
          <Alert variant="info" heading="Unlock faster on this device">
            Set a passkey or a passcode, so that you do not need your key each time.{' '}
            <Link href="/settings">Open Settings</Link>
          </Alert>
        ) : null}
        {couldnt > 0 ? (
          <Alert variant="warning" heading="Some changes could not be sent">
            {couldnt === 1 ? 'One change' : `${couldnt} changes`} could not be sent to the server,
            and are kept here. <Link href="/settings?tab=storage">See what</Link>
          </Alert>
        ) : null}
        {cards.length === 0 ? (
          <EmptyState
            icon="credit-card"
            heading="Add your first card"
            description="Scan a loyalty, transport or membership card’s QR code, and it is here, locked, whenever you need it."
            action={
              <Link href="/cards/new" tabIndex={-1}>
                <Button>Add a card</Button>
              </Link>
            }
          />
        ) : (
          <>
            {favourites.length > 0 ? (
              <section className={screens.stack} aria-labelledby="fav">
                <h2 id="fav" className={screens.sectionTitle}>
                  Favourites
                </h2>
                <ul className={styles.grid}>
                  {favourites.map((c) => (
                    <CardTile key={c.id} id={c.id} shape={c.shape} />
                  ))}
                </ul>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section className={screens.stack} aria-labelledby="more">
                <div className={screens.spread}>
                  <h2 id="more" className={screens.sectionTitle}>
                    Cards
                  </h2>
                  <Link href="/cards">See all</Link>
                </div>
                <ul className={styles.grid}>
                  {rest.map((c) => (
                    <CardTile key={c.id} id={c.id} shape={c.shape} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
