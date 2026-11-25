import { describe, expect, it, vi } from 'vitest';
import type { Limiter, Rule, Taken } from '../limits/rate';
import { MAX_BODY_BYTES, NOTICE_RATE, guarded } from './notices';

/**
 * The guards in front of the routes core calls with a token (`guarded`, src/sovereign/notices.ts): a body over 16 KB is refused unread, and a caller may send
 * only so many a minute, **counted by its address and by the kind of request**. These routes have no session, so one count for everybody would let anyone who
 * can reach them use it up and have core's own notices refused.
 */

/** A limiter that counts by key as the real one does, in a window that never ends, and says what it was asked to count. */
function counting() {
  const counts = new Map<string, number>();
  const asked: { key: string; rule: Rule }[] = [];
  const limiter: Limiter = {
    take: async (key, rule): Promise<Taken> => {
      asked.push({ key, rule });
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count <= rule.limit ? { ok: true } : { ok: false, retryAfterMs: 59_001 };
    },
  };
  return { limiter, asked };
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://wallet.example.com/api/sovereign/backchannel-logout', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });

const ok = () => new Response(null, { status: 200 });

describe('what is counted, and under what', () => {
  it('counts a caller by its address and by the kind of request, so that nobody else’s tries are its own', async () => {
    const { limiter, asked } = counting();
    const handle = vi.fn(async () => ok());
    const notices = guarded(handle, limiter);
    const exports = guarded(handle, limiter, { bucket: 'sovereign-export' });
    await notices(post('a=1', { 'x-forwarded-for': '203.0.113.7' }));
    await exports(post('a=1', { 'x-forwarded-for': '203.0.113.7' }));
    await notices(post('a=1', { 'x-forwarded-for': '203.0.113.8' }));
    await notices(post('a=1'));
    expect(asked.map((each) => each.key)).toEqual([
      'sovereign-notice:203.0.113.7',
      'sovereign-export:203.0.113.7',
      'sovereign-notice:203.0.113.8',
      'sovereign-notice:unknown',
    ]);
    expect(asked[0]?.rule).toEqual(NOTICE_RATE);
  });

  it('does not let one address use up another’s tries: the caller that is refused is the one that went over', async () => {
    const { limiter } = counting();
    const handle = vi.fn(async () => ok());
    const answer = guarded(handle, limiter, { rule: { limit: 2, windowMs: 60_000 } });
    const from = (address: string) => answer(post('a=1', { 'x-forwarded-for': address }));
    expect((await from('198.51.100.1')).status).toBe(200);
    expect((await from('198.51.100.1')).status).toBe(200);
    const refused = await from('198.51.100.1');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('60');
    // Another address, which core's notices may come from, is not shut out by that one.
    expect((await from('203.0.113.50')).status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(3);
  });

  it('counts those nobody can name together, and not with anybody named', async () => {
    const { limiter } = counting();
    const answer = guarded(async () => ok(), limiter, { rule: { limit: 1, windowMs: 60_000 } });
    expect((await answer(post('a=1', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).status).toBe(200);
    expect((await answer(post('a=1'))).status).toBe(429);
    expect((await answer(post('a=1', { 'x-forwarded-for': '203.0.113.7' }))).status).toBe(200);
  });

  it('reads a chain from the right behind the proxies it is given, and does not believe a chain without them', async () => {
    const { limiter, asked } = counting();
    const named = guarded(async () => ok(), limiter, { trustedProxies: ['10.0.0.0/8'] });
    // What a client wrote to the left is not who it is.
    await named(post('a=1', { 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.9' }));
    await named(post('a=1', { 'x-forwarded-for': '7.7.7.7, 203.0.113.7, 10.0.0.9' }));
    const alone = guarded(async () => ok(), limiter);
    await alone(post('a=1', { 'x-forwarded-for': '7.7.7.7, 203.0.113.7, 10.0.0.9' }));
    expect(asked.map((each) => each.key)).toEqual([
      'sovereign-notice:203.0.113.7',
      'sovereign-notice:203.0.113.7',
      'sovereign-notice:unknown',
    ]);
  });
});

describe('what is refused before anything reads it', () => {
  it('refuses a body over the limit, declared or not, without calling the handler', async () => {
    const { limiter } = counting();
    const handle = vi.fn(async () => ok());
    const answer = guarded(handle, limiter);
    const big = 'x'.repeat(MAX_BODY_BYTES + 1);
    expect((await answer(post(big))).status).toBe(413);
    expect(
      (await answer(post('a=1', { 'content-length': String(MAX_BODY_BYTES + 1) }))).status,
    ).toBe(413);
    // A request that does not say how long it is, and sends too much: read no further than the limit.
    const chunks = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(4096).fill(97));
      },
    });
    const streamed = new Request('https://wallet.example.com/x', {
      method: 'POST',
      body: chunks,
      duplex: 'half',
    } as RequestInit);
    expect((await answer(streamed)).status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it('hands on a body that is within it, whole and as it was sent, with the method and headers', async () => {
    const seen: { body: string; method: string; type: string | null }[] = [];
    const answer = guarded(async (request) => {
      seen.push({
        body: await request.text(),
        method: request.method,
        type: request.headers.get('content-type'),
      });
      return new Response('{"ok":true}', { status: 202 });
    }, counting().limiter);
    const reply = await answer(post('export_request_token=abc.def.ghi'));
    expect(reply.status).toBe(202);
    expect(seen).toEqual([
      {
        body: 'export_request_token=abc.def.ghi',
        method: 'POST',
        type: 'application/x-www-form-urlencoded',
      },
    ]);
  });

  it('counts before it reads, so a refused caller costs no more than the count', async () => {
    const answer = guarded(async () => ok(), counting().limiter, {
      rule: { limit: 0, windowMs: 60_000 },
    });
    // A body that would be refused as too large is not read at all by a caller that is already over.
    expect((await answer(post('x'.repeat(MAX_BODY_BYTES + 1)))).status).toBe(429);
  });
});
