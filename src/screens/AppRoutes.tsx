'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';
import { isUuid } from '../core/entries/types';
import { CardScreen } from './CardScreen';
import { CardsScreen } from './CardsScreen';
import { HomeScreen } from './HomeScreen';
import { Link, usePathname } from './nav';
import { NewCard } from './NewCard';
import { SettingsScreen } from './SettingsScreen';
import { ShowCard } from './ShowCard';

/**
 * Which screen an address is (DESIGN.md §26.5): the one signed-in page, which the server renders for any address of the area and which chooses by the
 * address in the browser. The server cannot say whether `/cards/<id>` is there, and does not try: **a card that is not there is not found, on the
 * device, as one that is not this person's is.** Setup is drawn by the frame, which knows where the wallet stands, so its address shows nothing here.
 */
const CARD = /^\/cards\/([0-9a-f-]{36})(\/show)?$/;

export function titleOf(path: string): string {
  if (path === '/' || path === '/home') return 'Home';
  if (path === '/cards') return 'Cards';
  if (path === '/cards/new') return 'Add a card';
  if (path === '/settings') return 'Settings';
  if (path === '/setup') return 'Set up your wallet';
  return CARD.test(path) ? 'Card' : 'Not found';
}

export function AppRoutes() {
  const path = (usePathname() ?? '/').replace(/\/+$/, '') || '/';
  useEffect(() => {
    document.title = `${titleOf(path)} · Wallet`;
  }, [path]);

  if (path === '/' || path === '/home') return <HomeScreen />;
  if (path === '/cards') return <CardsScreen />;
  if (path === '/cards/new') return <NewCard />;
  if (path === '/settings') return <SettingsScreen />;
  if (path === '/setup') return null;
  const card = CARD.exec(path);
  if (card && isUuid(card[1]))
    return card[2] ? <ShowCard id={card[1]} /> : <CardScreen id={card[1]} />;
  return (
    <EmptyState
      icon="search"
      heading="That is not here"
      description="The address may be wrong."
      action={
        <Link href="/" tabIndex={-1}>
          <Button>Go back to Wallet</Button>
        </Link>
      }
    />
  );
}
