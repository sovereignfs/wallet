import { type Body, type Kind, type Shape, parseBody, parseShape } from '../core/entries';
import { fromBase64Url } from '../core/encoding';
import { open } from '../core/vault';
import { suiteCipher } from '../keys/cipher';
import type { RowWire } from '../core/sync/protocol';
import type { Keyring } from '../keyring/keyring';

/**
 * Opening what the device holds (DESIGN.md §11.1): a row's shape, and its body, through the entry's own key. **A value that does not open is not shown
 * and not lost:** it stays in the store as it is, and the entry is listed as one that could not be opened. Anything that opens is checked against its
 * kind's model before it is used, so that a value from a newer version, or one that was damaged, never reaches a screen as a half-formed card.
 */
export interface Sealed {
  readonly id: string;
  readonly keyEpoch: number;
  readonly shape: string | null;
  readonly body: string | null;
}

export type Opened =
  | { readonly ok: true; readonly shape: Shape; readonly body: Body | null }
  | { readonly ok: false; readonly reason: 'unreadable' | 'newer' };

export async function openSealed(
  accountId: string,
  keyring: Keyring,
  sealed: Sealed,
  withBody = true,
): Promise<Opened> {
  const shape = sealed.shape === null ? undefined : fromBase64Url(sealed.shape);
  if (!shape) return { ok: false, reason: 'unreadable' };
  try {
    const key = await keyring.entryKey(sealed.id, sealed.keyEpoch);
    const shapeJson = await open(
      suiteCipher,
      key,
      'shape',
      accountId,
      sealed.id,
      sealed.keyEpoch,
      shape,
    );
    const parsed = parseShape(shapeJson);
    if (!parsed.ok) return { ok: false, reason: 'newer' };
    let body: Body | null = null;
    const bodyBytes = sealed.body === null ? undefined : fromBase64Url(sealed.body);
    if (withBody && bodyBytes) {
      const bodyParsed = parseBody(
        parsed.value.kind as Kind,
        await open(suiteCipher, key, 'body', accountId, sealed.id, sealed.keyEpoch, bodyBytes),
      );
      if (!bodyParsed.ok) return { ok: false, reason: 'newer' };
      body = bodyParsed.value;
    }
    return { ok: true, shape: parsed.value, body };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

export const sealedOfRow = (row: RowWire): Sealed => ({
  id: row.id,
  keyEpoch: row.keyEpoch,
  shape: row.shape,
  body: row.body,
});
