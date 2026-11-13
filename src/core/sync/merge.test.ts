import { describe, expect, it } from 'vitest';
import { merge, same } from './merge';

const base = { title: 'Gym', color: 'slate', favourite: false, tags: ['a', 'b'], n: { x: 1 } };

describe('merging a stale edit, field by field', () => {
  it('takes a field changed on one side only, from that side', () => {
    const mine = { ...base, title: 'Gym Plus' };
    const theirs = { ...base, color: 'red' };
    expect(merge(base, mine, theirs)).toEqual({
      merged: { ...base, title: 'Gym Plus', color: 'red' },
      clashes: [],
    });
  });

  it('keeps this device’s value when both changed a field, and says where the other one was', () => {
    const mine = { ...base, title: 'Mine' };
    const theirs = { ...base, title: 'Theirs', favourite: true };
    const result = merge(base, mine, theirs);
    expect(result.merged).toEqual({ ...base, title: 'Mine', favourite: true });
    expect(result.clashes).toEqual([{ field: 'title', theirs: 'Theirs' }]);
  });

  it('is no clash when both changed a field to the same value', () => {
    const edited = { ...base, title: 'Same' };
    expect(merge(base, edited, { ...edited })).toEqual({ merged: edited, clashes: [] });
  });

  it('treats a list as one field: two changes to a list are a clash and not an interleaving', () => {
    const result = merge(base, { ...base, tags: ['a', 'c'] }, { ...base, tags: ['a', 'b', 'd'] });
    expect(result.merged.tags).toEqual(['a', 'c']);
    expect(result.clashes).toEqual([{ field: 'tags', theirs: ['a', 'b', 'd'] }]);
  });

  it('compares nested values by what they hold, in any key order', () => {
    expect(same({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
    expect(same([1], { 0: 1 })).toBe(false);
    expect(same(null, undefined)).toBe(false);
    const result = merge(base, { ...base, n: { x: 1 } }, { ...base, n: { x: 2 } });
    expect(result.merged.n).toEqual({ x: 2 });
    expect(result.clashes).toEqual([]);
  });

  it('keeps this device’s side of a difference when there is no base to say who changed what, and takes what only the other side has', () => {
    const result = merge(null, { a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(result.merged).toEqual({ a: 1, b: 2, c: 4 });
    expect(result.clashes).toEqual([{ field: 'b', theirs: 3 }]);
  });

  it('takes a field a side removed, when only that side changed it', () => {
    const { favourite: _f, ...without } = base;
    expect(merge(base, base, without).merged).toEqual(without);
    expect(merge(base, without, base).merged).toEqual(without);
  });

  it('gives every field back when nothing changed on either side', () => {
    expect(merge(base, base, base)).toEqual({ merged: base, clashes: [] });
  });

  it('is symmetric about who edited what, apart from which side wins a clash', () => {
    const a = { ...base, title: 'A', color: 'red' };
    const b = { ...base, title: 'B', favourite: true };
    const ab = merge(base, a, b).merged;
    const ba = merge(base, b, a).merged;
    expect(ab).toEqual({ ...base, title: 'A', color: 'red', favourite: true });
    expect(ba).toEqual({ ...base, title: 'B', color: 'red', favourite: true });
  });
});
