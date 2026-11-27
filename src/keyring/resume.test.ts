import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { LockTimers } from './keyring';
import {
  ARRIVAL_MS,
  HIDDEN_MS,
  arrive,
  arrived,
  forgetResume,
  readMark,
  stillOpen,
  writeMark,
} from './resume';

/**
 * Whether a reloaded page may open the wallet again without asking (DESIGN.md §9.2). Every case that is not plainly inside both lock times is locked.
 */
const NOW = 1_800_000_000_000;
const timers = (over: Partial<LockTimers> = {}): LockTimers => ({
  idleMinutes: 5,
  hidden: '1m',
  ...over,
});

describe('whether the wallet is still open for a page that was reloaded', () => {
  it('is, for a page used a moment ago and left a moment ago', () => {
    expect(stillOpen({ used: NOW - 2_000, left: NOW - 500 }, timers(), NOW)).toBe(true);
  });

  it('counts the idle time from the last use: locked at the setting, not before', () => {
    for (const idleMinutes of [1, 5, 15, 60] as const) {
      const limit = idleMinutes * 60_000;
      const left = NOW - 10;
      expect(
        stillOpen({ used: NOW - limit + 1, left }, timers({ idleMinutes }), NOW),
        `${idleMinutes}`,
      ).toBe(true);
      expect(
        stillOpen({ used: NOW - limit, left }, timers({ idleMinutes }), NOW),
        `${idleMinutes}`,
      ).toBe(false);
    }
  });

  it('counts the hidden time from when the page was left, whatever the idle time', () => {
    const mark = { used: NOW - 3 * 60_000, left: NOW - HIDDEN_MS + 1 };
    expect(stillOpen(mark, timers(), NOW)).toBe(true);
    expect(stillOpen({ ...mark, left: NOW - HIDDEN_MS }, timers(), NOW)).toBe(false);
    // "Never when hidden" leaves the idle time alone to decide.
    expect(stillOpen({ ...mark, left: NOW - 4 * 60_000 }, timers({ hidden: 'never' }), NOW)).toBe(
      true,
    );
  });

  it('counts from the last use for a page that went without saying it was leaving', () => {
    expect(stillOpen({ used: NOW - HIDDEN_MS + 1 }, timers(), NOW)).toBe(true);
    expect(stillOpen({ used: NOW - HIDDEN_MS }, timers(), NOW)).toBe(false);
  });

  it('is never open for “as soon as it is hidden”, since a reloaded page was hidden', () => {
    expect(stillOpen({ used: NOW, left: NOW }, timers({ hidden: 'now' }), NOW)).toBe(false);
  });

  it('is locked for a time from the future, as a clock set back would make', () => {
    expect(stillOpen({ used: NOW + 1_000, left: NOW }, timers(), NOW)).toBe(false);
    expect(stillOpen({ used: NOW, left: NOW + 1_000 }, timers(), NOW)).toBe(false);
  });
});

describe('what the tab keeps', () => {
  const kept = new Map<string, string>();
  const was = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  beforeEach(() => {
    kept.clear();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => kept.get(key) ?? null,
        setItem: (key: string, value: string) => void kept.set(key, value),
        removeItem: (key: string) => void kept.delete(key),
      },
    });
  });
  afterAll(() => {
    if (was) Object.defineProperty(globalThis, 'sessionStorage', was);
    else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('is times and nothing else, for one account', () => {
    writeMark('ada', { used: 1, left: 2 });
    expect(readMark('ada')).toEqual({ used: 1, left: 2 });
    expect(readMark('grace')).toBeUndefined();
    expect([...kept.values()]).toEqual(['{"used":1,"left":2}']);
  });

  it('reads nothing from what is not such a record', () => {
    for (const bad of ['x', 'null', '5', '{}', '{"used":"1"}', '{"used":1,"left":"2"}']) {
      kept.set('wallet.open.ada', bad);
      expect(readMark('ada'), bad).toBeUndefined();
    }
  });

  it('remembers that the person has just proved the account, for a while', () => {
    expect(arrived(NOW)).toBe(false);
    arrive(NOW);
    expect(arrived(NOW + ARRIVAL_MS - 1)).toBe(true);
    expect(arrived(NOW + ARRIVAL_MS)).toBe(false);
    expect(arrived(NOW - 1)).toBe(false);
  });

  it('is let go together', () => {
    writeMark('ada', { used: 1 });
    arrive(NOW);
    forgetResume('ada');
    expect(readMark('ada')).toBeUndefined();
    expect(arrived(NOW)).toBe(false);
  });

  it('is nothing, and breaks nothing, where the browser refuses storage', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(() => writeMark('ada', { used: 1 })).not.toThrow();
    expect(() => arrive(NOW)).not.toThrow();
    expect(readMark('ada')).toBeUndefined();
    expect(arrived(NOW)).toBe(false);
  });
});
