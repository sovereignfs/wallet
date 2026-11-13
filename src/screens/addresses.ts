import { isUuid } from '../core/entries/types';

/**
 * The addresses of the signed-in area (DESIGN.md §26.5). The server renders its one page only for these, and answers anything else with a real 404; the
 * browser chooses the screen from the same list (`AppRoutes`). Pure, so that both read one definition.
 */
export const CARD = /^\/cards\/([0-9a-f-]{36})(\/show)?$/;

export type Address =
  | { readonly screen: 'home' | 'cards' | 'new-card' | 'settings' | 'setup' }
  | { readonly screen: 'card' | 'show'; readonly id: string };

/** What an address is, or `undefined` for one that is not an address of the area. A trailing slash is the same address. */
export function addressOf(raw: string): Address | undefined {
  const path = raw.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/home') return { screen: 'home' };
  if (path === '/cards') return { screen: 'cards' };
  if (path === '/cards/new') return { screen: 'new-card' };
  if (path === '/settings') return { screen: 'settings' };
  if (path === '/setup') return { screen: 'setup' };
  const card = CARD.exec(path);
  if (card && isUuid(card[1])) return { screen: card[2] ? 'show' : 'card', id: card[1] as string };
  return undefined;
}

export function titleOf(address: Address | undefined): string {
  switch (address?.screen) {
    case 'home':
      return 'Home';
    case 'cards':
      return 'Cards';
    case 'new-card':
      return 'Add a card';
    case 'settings':
      return 'Settings';
    case 'setup':
      return 'Set up your wallet';
    case 'card':
    case 'show':
      return 'Card';
    default:
      return 'Not found';
  }
}
