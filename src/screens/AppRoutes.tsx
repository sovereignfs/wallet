'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';
import { CardScreen } from './CardScreen';
import { CardsScreen } from './CardsScreen';
import { addressOf, titleOf } from './addresses';
import { Link, usePathname } from './nav';
import { NewCard } from './NewCard';
import { SettingsScreen } from './SettingsScreen';
import { ShowCard } from './ShowCard';

/**
 * Which screen an address is (DESIGN.md §26.5): the one signed-in page, which the server renders for the addresses of the area and which chooses by the
 * address in the browser. The server cannot say whether `/cards/<id>` is there, and does not try: **a card that is not there is not found, on the device, as
 * one that is not this person's is.** Setup is drawn by the frame, which knows where the wallet stands, so its address shows nothing here.
 */
export function AppRoutes() {
  const address = addressOf(usePathname() ?? '/');
  useEffect(() => {
    document.title = `${titleOf(address)} · Wallet`;
  }, [address]);

  switch (address?.screen) {
    case 'cards':
      return <CardsScreen />;
    case 'new-card':
      return <NewCard />;
    case 'settings':
      return <SettingsScreen />;
    case 'setup':
      return null;
    case 'card':
      return <CardScreen id={address.id} />;
    case 'show':
      return <ShowCard id={address.id} />;
    default:
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
}
