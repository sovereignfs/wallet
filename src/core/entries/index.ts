import { type CardBody, type CardShape, parseCardBody, parseCardShape } from './card';
import { type Checked, type Kind, type ShapeBase, invalid, isRecord } from './types';

export * from './card';
export * from './types';

/** Every shape the app knows. */
export type Shape = CardShape | SettingsShape;
export type Body = CardBody | SettingsBody;

/**
 * The one `settings` entry of an account (DESIGN.md §27): preferences that follow the person. In 0.1.0 it holds the card order's default and nothing
 * else; it exists so that a preference never needs a column.
 */
export interface SettingsShape extends ShapeBase {
  readonly kind: 'settings';
}
export interface SettingsBody {
  readonly v: 1;
}

export function parseShape(input: unknown): Checked<Shape> {
  if (!isRecord(input)) return invalid('not an entry');
  switch (input.kind satisfies unknown) {
    case 'card':
      return parseCardShape(input);
    case 'settings':
      return input.v === 1
        ? { ok: true, value: { v: 1, kind: 'settings' } }
        : invalid('not settings');
    default:
      return invalid('That kind of entry is not known to this version.');
  }
}

export function parseBody(kind: Kind, input: unknown): Checked<Body> {
  switch (kind) {
    case 'card':
      return parseCardBody(input);
    case 'settings':
      return isRecord(input) && input.v === 1
        ? { ok: true, value: { v: 1 } }
        : invalid('not settings');
  }
}
