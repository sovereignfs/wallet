/**
 * Merging a stale edit (DESIGN.md §11.5), on the device, since the server cannot read what it stores. Pure: the shape or body as it was when the edit
 * began (`base`), as this device left it (`mine`), and as the server has it now (`theirs`).
 *
 * **Field by field:** a field changed on one side only takes that side; a field changed on both takes **this device's** value, and is reported, so that a
 * toast can say "also edited elsewhere: kept yours" with Undo. A list is one field (a document's pages are not merged element by element). Nothing a person
 * typed is thrown away: a clash keeps this device's value and tells where the other one was.
 */
export interface Merged<T> {
  readonly merged: T;
  /** The fields both sides changed to different values: this device's was kept, and the other is here, for Undo. */
  readonly clashes: readonly { readonly field: string; readonly theirs: unknown }[];
}

type Fields = Readonly<Record<string, unknown>>;

/** Deep equality of JSON values, with the keys of an object in any order. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => same(value, b[i]));
  const x = a as Fields;
  const y = b as Fields;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const key of keys) if (!same(x[key], y[key])) return false;
  return true;
}

export function merge<T extends Fields>(base: T | null, mine: T, theirs: T): Merged<T> {
  const merged: Record<string, unknown> = {};
  const clashes: { field: string; theirs: unknown }[] = [];
  const keys = [
    ...new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base ?? {})]),
  ];
  for (const field of keys) {
    const m = mine[field];
    const t = theirs[field];
    const b = base?.[field];
    let take: unknown;
    if (same(m, t)) take = m;
    else if (base && same(b, m)) take = t;
    else if (base && same(b, t)) take = m;
    else if (!base && m === undefined) take = t;
    else {
      // Both changed it, or there is no base to say who did: this device's value is kept, and the other is kept for Undo.
      take = m;
      clashes.push({ field, theirs: t });
    }
    // A field that is absent on the side that wins is absent in the result, not `undefined`.
    if (take !== undefined) merged[field] = take;
  }
  return { merged: merged as T, clashes };
}
