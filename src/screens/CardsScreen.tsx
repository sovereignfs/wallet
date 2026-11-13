'use client';

import { Link } from './nav';
import { useMemo, useState } from 'react';
import { Button, EmptyState, Icon, SegmentedControl } from '@sovereignfs/ui';
import type { CardShape } from '../core/entries';
import { TYPE_NAMES, byCardOrder } from './cardColors';
import styles from './Cards.module.css';
import screens from './Screens.module.css';
import { useEntries, useWallet } from './WalletProvider';

/** Every card as a tile in its colour, favourites first (DESIGN.md §13.4). A tile opens the card; the star and the type are said in words as well as drawn. */
export function CardTile({ id, shape }: { id: string; shape: CardShape }) {
  return (
    <li>
      <Link href={`/cards/${id}`} className={`${styles.tile} ${styles[shape.color]}`}>
        <span>
          <span className={styles.tileTitle}>{shape.title}</span>
          {shape.subtitle ? <span className={styles.tileSub}>{` · ${shape.subtitle}`}</span> : null}
        </span>
        <span className={styles.tileSub}>
          {TYPE_NAMES[shape.cardType]}
          {shape.favourite ? ' · Favourite' : ''}
        </span>
        {shape.favourite ? (
          <Icon name="check" size="sm" aria-hidden className={styles.star} />
        ) : null}
      </Link>
    </li>
  );
}

export function CardsScreen() {
  const entries = useEntries();
  const { wallet } = useWallet();
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const cards = useMemo(
    () =>
      entries
        .flatMap((entry) =>
          entry.shape.kind === 'card'
            ? [{ id: entry.id, shape: entry.shape, pending: entry.pending }]
            : [],
        )
        .sort(byCardOrder),
    [entries],
  );
  const shown = cards.filter((card) => card.shape.archived === (show === 'archived'));
  const hasArchived = cards.some((card) => card.shape.archived);
  const unopened = wallet.unopenedEntries().length;

  return (
    <main className={screens.page}>
      <div className={screens.column}>
        <div className={screens.spread}>
          <h1 className={screens.heading}>Cards</h1>
          <Link href="/cards/new" tabIndex={-1}>
            <Button>Add a card</Button>
          </Link>
        </div>
        {hasArchived ? (
          <SegmentedControl
            aria-label="Which cards"
            value={show}
            onChange={setShow}
            options={[
              { value: 'active', label: 'Cards' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        ) : null}
        {shown.length === 0 ? (
          <EmptyState
            icon="credit-card"
            heading={show === 'archived' ? 'Nothing is archived' : 'No cards yet'}
            description={
              show === 'archived'
                ? 'Cards you archive are kept here.'
                : 'Add a loyalty, transport or membership card by scanning its QR code.'
            }
            action={
              show === 'archived' ? undefined : (
                <Link href="/cards/new" tabIndex={-1}>
                  <Button>Add a card</Button>
                </Link>
              )
            }
          />
        ) : (
          <ul className={styles.grid} aria-label={show === 'archived' ? 'Archived cards' : 'Cards'}>
            {shown.map((card) => (
              <CardTile key={card.id} id={card.id} shape={card.shape} />
            ))}
          </ul>
        )}
        {unopened > 0 ? (
          <p className={screens.muted}>
            {unopened === 1
              ? '1 entry on this device cannot be opened'
              : `${unopened} entries on this device cannot be opened`}{' '}
            with this key, or are from a newer version of Wallet. They are kept.
          </p>
        ) : null}
      </div>
    </main>
  );
}
