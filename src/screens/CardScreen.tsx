'use client';

import { Link } from './nav';
import { useRouter } from './nav';
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, EmptyState } from '@sovereignfs/ui';
import { CodeView } from '../barcode/CodeView';
import { type Card, type CardBody, type CardShape, printedNumber } from '../core/entries';
import { CardForm } from './CardForm';
import { TYPE_NAMES } from './cardColors';
import styles from './Cards.module.css';
import screens from './Screens.module.css';
import { useUndo } from './Undo';
import { useEntries, useWallet } from './WalletProvider';

/** A card: its code, its fields, and what can be done with it (DESIGN.md §13, §26.5). Its address is its id, and a card that is not here is not found. */
export function CardScreen({ id }: { id: string }) {
  const entries = useEntries();
  const { wallet } = useWallet();
  const router = useRouter();
  const undo = useUndo();
  const entry = entries.find((e) => e.id === id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // The body is opened on demand: the list needs shapes only.
  useEffect(() => {
    void wallet.loadBody(id);
  }, [wallet, id]);

  if (!entry || entry.shape.kind !== 'card')
    return (
      <main className={screens.page}>
        <div className={screens.column}>
          <EmptyState
            icon="search"
            heading="That card is not here"
            description="It may have been deleted, or it has not reached this device yet."
            action={
              <Link href="/cards" tabIndex={-1}>
                <Button>Back to cards</Button>
              </Link>
            }
          />
        </div>
      </main>
    );
  const shape = entry.shape as CardShape;
  const body = entry.body as CardBody | null;
  if (!body)
    return (
      <main className={screens.page}>
        <div className={screens.column}>
          <h1 className={screens.heading}>{shape.title}</h1>
          <p className={screens.muted}>Opening…</p>
        </div>
      </main>
    );
  const card: Card = { shape, body };
  const save = (next: Card) => wallet.update(id, next.shape, next.body);

  if (editing)
    return (
      <main className={screens.page}>
        <div className={`${screens.column} ${screens.narrow}`}>
          <h1 className={screens.heading}>Edit card</h1>
          <CardForm
            initial={card}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (next) => {
              await save(next);
              setEditing(false);
            }}
          />
        </div>
      </main>
    );

  const number = printedNumber(body);
  return (
    <main className={screens.page}>
      <div className={`${screens.column} ${screens.narrow}`}>
        <div className={screens.stack}>
          <h1 className={screens.heading}>{shape.title}</h1>
          <p className={screens.muted}>
            {TYPE_NAMES[shape.cardType]}
            {shape.favourite ? ' · Favourite' : ''}
            {shape.archived ? ' · Archived' : ''}
            {entry.pending ? ' · Not sent yet' : ''}
          </p>
        </div>
        <div className={styles.preview}>
          <CodeView payload={body.payload} label={`The code of ${shape.title}`} />
        </div>
        {number ? <p className={styles.number}>{number}</p> : null}
        <div className={screens.row}>
          <Link href={`/cards/${id}/show`} tabIndex={-1}>
            <Button size="lg">Show</Button>
          </Link>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            onClick={() => void save({ shape: { ...shape, favourite: !shape.favourite }, body })}
          >
            {shape.favourite ? 'Remove from favourites' : 'Make a favourite'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void save({ shape: { ...shape, archived: !shape.archived }, body })}
          >
            {shape.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
        {body.cardNumber || body.website || body.phone || body.notes ? (
          <dl className={screens.stack}>
            {body.cardNumber ? <Field label="Card number" value={body.cardNumber} /> : null}
            {body.website ? <Field label="Website" value={body.website} /> : null}
            {body.phone ? <Field label="Phone" value={body.phone} /> : null}
            {body.notes ? <Field label="Notes" value={body.notes} /> : null}
          </dl>
        ) : null}
        <p className={screens.muted}>
          Locked on this device before it left it. The server holds only scrambled bytes it cannot
          open.
        </p>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this card?"
        message={`“${shape.title}” will be removed from every device. You can undo it for ten seconds.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          setConfirm(false);
          await wallet.remove(id);
          router.replace('/cards');
          undo({
            message: `Deleted “${shape.title}”.`,
            undo: async () => {
              await wallet.update(id, shape, body);
              router.push(`/cards/${id}`);
            },
          });
        }}
      />
    </main>
  );
}

/** A value a person typed, shown as text: it is never put into the page as markup. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={screens.muted}>{label}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</dd>
    </div>
  );
}
