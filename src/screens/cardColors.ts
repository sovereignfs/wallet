import type { CardColor, CardType } from '../core/entries';

/** How a card's colour is told, in words (a screen reader does not see a swatch). */
export const COLOR_NAMES: Record<CardColor, string> = {
  slate: 'Grey',
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
  blue: 'Blue',
  accent: 'Accent',
};

export const TYPE_NAMES: Record<CardType, string> = {
  loyalty: 'Loyalty',
  transport: 'Transport',
  membership: 'Membership',
  library: 'Library',
  gift: 'Gift',
  access: 'Access',
  insurance: 'Insurance',
  other: 'Other',
};

/** Favourites first, then the person's own order, then by name: the order of every list of cards (DESIGN.md §13.4). */
export function byCardOrder<
  T extends { shape: { favourite: boolean; position: number; title: string } },
>(a: T, b: T): number {
  if (a.shape.favourite !== b.shape.favourite) return a.shape.favourite ? -1 : 1;
  if (a.shape.position !== b.shape.position) return a.shape.position - b.shape.position;
  return a.shape.title.localeCompare(b.shape.title);
}
