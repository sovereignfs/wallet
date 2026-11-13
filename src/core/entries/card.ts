import { type Checked, type ShapeBase, invalid, isRecord, text } from './types';

/**
 * A card (DESIGN.md §13): a scannable code with a name. In 0.1.0 the code is a QR code; the format is a field of the body and the shape, so that the
 * other formats of §13.2 need no change of data (decision log, 2026-11-13).
 */
export const CARD_TYPES = [
  'loyalty',
  'transport',
  'membership',
  'library',
  'gift',
  'access',
  'insurance',
  'other',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** The code formats that can be added in 0.1.0. */
export const CODE_FORMATS = ['qr'] as const;
export type CodeFormat = (typeof CODE_FORMATS)[number];

/** Colours a card has, by name: the interface maps each to its own tokens, so that a colour follows the theme and no literal colour is stored. */
export const CARD_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** The longest payload: well inside what a QR code of a size a phone can scan holds (2,953 bytes at the lowest correction level). */
export const MAX_PAYLOAD = 2048;

/** What the server may be told of a card, sealed: enough to list and file it without opening the body (DESIGN.md §8.4). */
export interface CardShape extends ShapeBase {
  readonly kind: 'card';
  /** The family member it belongs to, or null for Me (family members come after 0.1.0). */
  readonly personId: string | null;
  readonly title: string;
  readonly subtitle: string;
  readonly cardType: CardType;
  readonly color: CardColor;
  readonly favourite: boolean;
  /** The person's own order, lower first. */
  readonly position: number;
  readonly archived: boolean;
  /** The format of the code, repeated here so that the list can draw its icon with the body still closed. */
  readonly format: CodeFormat;
}

export interface CardBody {
  readonly v: 1;
  readonly format: CodeFormat;
  /** The exact text the code carries. */
  readonly payload: string;
  /** The number printed under the code, when it is not the payload's own. */
  readonly display: string;
  readonly cardNumber: string;
  readonly website: string;
  readonly phone: string;
  readonly notes: string;
}

export interface Card {
  readonly shape: CardShape;
  readonly body: CardBody;
}

const member = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/** Why a payload cannot be a QR code, or `undefined` when it can. Said as a sentence, for the form. */
export function payloadProblem(format: CodeFormat, payload: string): string | undefined {
  if (format !== 'qr') return 'That kind of code cannot be added yet.';
  if (payload.trim() === '') return 'A code needs something to carry.';
  if (payload.length > MAX_PAYLOAD) return `A code can carry up to ${MAX_PAYLOAD} characters.`;
  // A lone surrogate is not text a QR code can carry as UTF-8.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(payload))
    return 'That text is not valid.';
  return undefined;
}

export function parseCardShape(input: unknown): Checked<CardShape> {
  if (!isRecord(input) || input.kind !== 'card' || input.v !== 1) return invalid('not a card');
  const title = text(input.title, 100);
  const subtitle = text(input.subtitle, 100);
  if (title === undefined || title.trim() === '') return invalid('A card needs a name.');
  if (subtitle === undefined) return invalid('The subtitle is too long.');
  if (!member(CARD_TYPES, input.cardType)) return invalid('That kind of card is not known.');
  if (!member(CARD_COLORS, input.color)) return invalid('That colour is not known.');
  if (!member(CODE_FORMATS, input.format)) return invalid('That kind of code is not known.');
  if (typeof input.favourite !== 'boolean' || typeof input.archived !== 'boolean')
    return invalid('A card is a favourite or not, and archived or not.');
  if (typeof input.position !== 'number' || !Number.isFinite(input.position))
    return invalid('A card needs a place in the order.');
  const personId = input.personId;
  if (personId !== null && typeof personId !== 'string') return invalid('Whose card is it?');
  return {
    ok: true,
    value: {
      v: 1,
      kind: 'card',
      personId,
      title,
      subtitle,
      cardType: input.cardType,
      color: input.color,
      favourite: input.favourite,
      position: input.position,
      archived: input.archived,
      format: input.format,
    },
  };
}

export function parseCardBody(input: unknown): Checked<CardBody> {
  if (!isRecord(input) || input.v !== 1) return invalid('not a card');
  if (!member(CODE_FORMATS, input.format)) return invalid('That kind of code is not known.');
  const payload = text(input.payload, MAX_PAYLOAD);
  if (payload === undefined) return invalid(`A code can carry up to ${MAX_PAYLOAD} characters.`);
  const problem = payloadProblem(input.format, payload);
  if (problem) return invalid(problem);
  const display = text(input.display, 200);
  const cardNumber = text(input.cardNumber, 100);
  const website = text(input.website, 300);
  const phone = text(input.phone, 50);
  const notes = text(input.notes, 5000);
  if (
    display === undefined ||
    cardNumber === undefined ||
    website === undefined ||
    phone === undefined ||
    notes === undefined
  )
    return invalid('One of the fields is too long.');
  return {
    ok: true,
    value: { v: 1, format: input.format, payload, display, cardNumber, website, phone, notes },
  };
}

/** A card with every field at its default, for a form to start from. */
export function newCard(
  input: Partial<Omit<CardShape, 'v' | 'kind'>> & Partial<Omit<CardBody, 'v'>> = {},
): Card {
  const format = input.format ?? 'qr';
  return {
    shape: {
      v: 1,
      kind: 'card',
      personId: input.personId ?? null,
      title: input.title ?? '',
      subtitle: input.subtitle ?? '',
      cardType: input.cardType ?? 'loyalty',
      color: input.color ?? 'slate',
      favourite: input.favourite ?? false,
      position: input.position ?? 0,
      archived: input.archived ?? false,
      format,
    },
    body: {
      v: 1,
      format,
      payload: input.payload ?? '',
      display: input.display ?? '',
      cardNumber: input.cardNumber ?? '',
      website: input.website ?? '',
      phone: input.phone ?? '',
      notes: input.notes ?? '',
    },
  };
}

/** The title and the code that a card shows: the number under the code is `display` when there is one, and the card number otherwise. */
export function printedNumber(body: CardBody): string {
  return body.display !== '' ? body.display : body.cardNumber;
}
