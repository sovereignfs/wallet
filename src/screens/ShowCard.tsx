'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { CodeView } from '../barcode/CodeView';
import { type CardBody, type CardShape, printedNumber } from '../core/entries';
import { byCardOrder } from './cardColors';
import styles from './Cards.module.css';
import { useEntries, useWallet } from './WalletProvider';

/**
 * Showing a card (DESIGN.md §13.3): the code full screen, on white, as large as fits, with the number under it and the screen kept awake (the Screen Wake
 * Lock, held while it is shown and let go when it is not). A browser cannot raise the screen's brightness, so the page says so once. **It opens from the
 * device's own copy: no connection is needed.** Moving to the next favourite is a swipe, a button or an arrow key.
 */
const HINT_KEY = 'wallet.brightness-hint';

export function ShowCard({ id }: { id: string }) {
  const entries = useEntries();
  const { wallet } = useWallet();
  const router = useRouter();
  const [hint, setHint] = useState(false);
  const touch = useRef<number | null>(null);

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
  const here = entries.find((e) => e.id === id);
  // The next card is among the favourites when this is one, and among all of them otherwise.
  const ring = favourites.some((c) => c.id === id) ? favourites : cards;
  const at = ring.findIndex((c) => c.id === id);
  const go = (step: number) => {
    const next = ring[(at + step + ring.length) % ring.length];
    if (next && ring.length > 1) router.replace(`/cards/${next.id}/show`);
  };

  useEffect(() => {
    void wallet.loadBody(id);
  }, [wallet, id]);

  // The screen stays awake while the code is shown. The lock is lost when the page is hidden, so it is asked for again when it comes back.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let wanted = true;
    const hold = async () => {
      try {
        if (wanted && document.visibilityState === 'visible')
          lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // Refused, for a battery or a browser: the card is still shown.
      }
    };
    void hold();
    document.addEventListener('visibilitychange', hold);
    return () => {
      wanted = false;
      document.removeEventListener('visibilitychange', hold);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HINT_KEY)) {
        setHint(true);
        window.localStorage.setItem(HINT_KEY, '1');
      }
    } catch {
      // No storage: the hint is shown each time, which is harmless.
      setHint(true);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'Escape') router.push(`/cards/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!here || here.shape.kind !== 'card' || !here.body)
    return (
      <div className={styles.show}>
        <p>{here ? 'Opening…' : 'That card is not here.'}</p>
        <Link href="/cards">Back to cards</Link>
      </div>
    );
  const shape = here.shape as CardShape;
  const body = here.body as CardBody;
  const number = printedNumber(body);
  return (
    <div
      className={styles.show}
      onTouchStart={(event) => void (touch.current = event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const start = touch.current;
        const end = event.changedTouches[0]?.clientX;
        touch.current = null;
        if (start !== null && end !== undefined && Math.abs(end - start) > 60)
          go(end < start ? 1 : -1);
      }}
    >
      <h1 className={styles.showTitle}>{shape.title}</h1>
      <div className={styles.showCode}>
        <CodeView payload={body.payload} label={`The code of ${shape.title}`} />
      </div>
      {number ? <p className={styles.showNumber}>{number}</p> : null}
      {hint ? <p className={styles.showHint}>Turn your brightness up if it doesn’t scan.</p> : null}
      <div className={styles.showBar}>
        {ring.length > 1 ? (
          <>
            <Button variant="secondary" onClick={() => go(-1)} aria-label="Previous card">
              Previous
            </Button>
            <Button variant="secondary" onClick={() => go(1)} aria-label="Next card">
              Next
            </Button>
          </>
        ) : null}
        <Button variant="secondary" onClick={() => router.push(`/cards/${id}`)}>
          Done
        </Button>
      </div>
    </div>
  );
}
