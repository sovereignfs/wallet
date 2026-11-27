import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Limiter } from '../limits/rate';
import { type DeleteDeps, deleteAccount, deletionPreview } from './delete-account';

/**
 * `/api/account/delete` (DESIGN.md §28): standalone it asks for the password; in suite mode deleting the account is core's, and nothing here does it. The routine
 * that deletes is `people.test.ts`'s.
 */
const { deletePerson } = vi.hoisted(() => ({ deletePerson: vi.fn(async () => undefined) }));
vi.mock('./people', () => ({ deletePerson }));

const CORE = 'https://sovereign.example.com';
const open: Limiter = { take: async () => ({ ok: true }) };

function deps(over: Partial<DeleteDeps> = {}): DeleteDeps {
  return {
    database: {} as never,
    authDatabase: {} as never,
    limiter: open,
    now: () => 0,
    core: undefined,
    verify: async (_request, password) => password === 'the-sign-in-value',
    ...over,
  };
}

const post = (body: unknown, raw?: string) =>
  new Request('http://localhost:3000/api/account/delete', {
    method: 'POST',
    body: raw ?? JSON.stringify(body),
  });

beforeEach(() => deletePerson.mockClear());

describe('what deleting the account asks', () => {
  it('says alone that it asks for the password, and in suite mode where core is', async () => {
    expect(await deletionPreview(deps()).json()).toEqual({ password: true, core: null });
    expect(await deletionPreview(deps({ core: CORE })).json()).toEqual({
      password: false,
      core: CORE,
    });
  });
});

describe('deleting the account, standalone', () => {
  it('deletes the session’s account for the right password, and says so with a 204', async () => {
    const reply = await deleteAccount(post({ password: 'the-sign-in-value' }), 'account-1', deps());
    expect(reply.status).toBe(204);
    expect(deletePerson).toHaveBeenCalledTimes(1);
    expect(deletePerson).toHaveBeenCalledWith(expect.anything(), 'account-1');
  });

  it('deletes nothing for a wrong password, for none, or for what is not a password', async () => {
    const verify = vi.fn(async () => false);
    const wrong = await deleteAccount(post({ password: 'guess' }), 'account-1', deps({ verify }));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ code: 'WRONG_PASSWORD' });
    // What a person who signed in through Sovereign used to send, an empty value, proves nothing now: it is not a request.
    for (const body of [{ password: '' }, {}, { password: 7 }, { password: 'x'.repeat(1001) }]) {
      const reply = await deleteAccount(post(body), 'account-1', deps({ verify }));
      expect(reply.status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect(
      (await deleteAccount(post(null, 'not json'), 'account-1', deps({ verify }))).status,
    ).toBe(400);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(deletePerson).not.toHaveBeenCalled();
  });

  it('refuses a body that is too large unread, and a person who tries too often, before asking for the password', async () => {
    const verify = vi.fn(async () => true);
    expect(
      (await deleteAccount(post(null, 'x'.repeat(2000)), 'account-1', deps({ verify }))).status,
    ).toBe(413);
    const limited: Limiter = { take: async () => ({ ok: false, retryAfterMs: 61_000 }) };
    const reply = await deleteAccount(
      post({ password: 'the-sign-in-value' }),
      'account-1',
      deps({ verify, limiter: limited }),
    );
    expect(reply.status).toBe(429);
    expect(reply.headers.get('retry-after')).toBe('61');
    expect(verify).not.toHaveBeenCalled();
    expect(deletePerson).not.toHaveBeenCalled();
  });
});

describe('deleting the account, in suite mode', () => {
  it('is not here: it is core’s to do, and neither a password nor anything else deletes it from here', async () => {
    const take = vi.fn(async () => ({ ok: true }) as const);
    const verify = vi.fn(async () => true);
    const reply = await deleteAccount(
      post({ password: 'the-sign-in-value' }),
      'account-1',
      deps({ core: CORE, verify, limiter: { take } }),
    );
    expect(reply.status).toBe(404);
    // Refused before anything is counted or checked.
    expect(take).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(deletePerson).not.toHaveBeenCalled();
  });
});
