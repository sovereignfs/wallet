import { describe, expect, it } from 'vitest';
import { suiteStep, toCore } from './suite';

describe('suite mode’s sign-in and sign-up (DESIGN.md §25.1)', () => {
  it('sends someone with no session to core at once, to come back to the front address', () => {
    expect(toCore()).toBe('/api/auth/sign-in/sovereign?returnTo=%2F');
    expect(suiteStep(false, undefined)).toEqual({ kind: 'go', to: toCore() });
  });

  it('asks core for its sign-up, not its sign-in, from the sign-up page', () => {
    expect(toCore('create')).toBe('/api/auth/sign-in/sovereign?prompt=create&returnTo=%2F');
    expect(suiteStep(false, undefined, 'create')).toEqual({ kind: 'go', to: toCore('create') });
  });

  it('sends someone with a session to the front address, never to core', () => {
    expect(suiteStep(true, undefined)).toEqual({ kind: 'go', to: '/' });
    expect(suiteStep(true, 'sovereign', 'create')).toEqual({ kind: 'go', to: '/' });
  });

  it('shows a failure at core once, with a way to try again, and does not send the person back by itself', () => {
    expect(suiteStep(false, 'sovereign')).toEqual({
      kind: 'show',
      error: 'sovereign',
      retry: toCore(),
    });
    // The retry asks for what was asked for: a failed sign-up is tried again as a sign-up.
    expect(suiteStep(false, 'sovereign_unreachable', 'create')).toEqual({
      kind: 'show',
      error: 'sovereign_unreachable',
      retry: toCore('create'),
    });
  });
});
