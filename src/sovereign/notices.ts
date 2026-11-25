import { coreNotices } from '@sovereignfs/auth/core';
import { clientAddress } from '../limits/address';
import type { Limiter, Rule } from '../limits/rate';

/**
 * Core's two notices (DESIGN.md §15.2, auth.md §8): `POST /api/sovereign/backchannel-logout` and `POST /api/sovereign/account-deleted`. The
 * package's `coreNotices` verifies each (signature, issuer, audience, event, expiry), remembers its `jti` so a replay ends nothing, ends the
 * sessions through better-auth's adapter (of the core session a logout names, or every session of the person) and drops the person's
 * refresh token; an account-deleted notice is answered only once Wallet's own deletion has run. **Wallet adds two guards in front of
 * it**: a notice is a small form, so a body over 16 KB is refused unread, and a caller may send only so many a minute. `guarded` is the same two guards
 * for the one other route core calls with a token, the export (`src/portability/core-export.ts`).
 *
 * **The count is the caller's, by its address** (`src/limits/address.ts`), and a kind of request has its own: these routes have no session to count, and one
 * count for everybody would let anyone who can reach them spend it and have core's own notices (a person's sessions ended, an account deleted) refused.
 */
export const MAX_BODY_BYTES = 16 * 1024;
export const NOTICE_RATE: Rule = { limit: 300, windowMs: 60 * 1000 };

/** What counts a caller of a guarded route. */
export interface Guard {
  /** What is counted under, with the caller's address: one for each kind of request. */
  readonly bucket: string;
  readonly rule: Rule;
  /** `WALLET_AUTH_TRUSTED_PROXIES`: whose `X-Forwarded-For` is believed. */
  readonly trustedProxies: readonly string[];
}

export type NoticeHandlers = ReturnType<typeof coreNotices>;

const answer = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });

/** The body, read no further than the limit, or undefined when it is larger. */
async function capped(request: Request): Promise<Uint8Array | undefined> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** One of the package's handlers, or the SDK's, behind Wallet's guards. */
export function guarded(
  handle: (request: Request) => Promise<Response>,
  limiter: Limiter | undefined,
  guard: Partial<Guard> = {},
): (request: Request) => Promise<Response> {
  const { bucket = 'sovereign-notice', rule = NOTICE_RATE, trustedProxies = [] } = guard;
  return async (request) => {
    if (limiter) {
      // Nobody who can say who they are is counted with those who cannot, and nobody with a named address.
      const address = clientAddress(request.headers.get('x-forwarded-for'), trustedProxies);
      const taken = await limiter.take(`${bucket}:${address ?? 'unknown'}`, rule);
      if (!taken.ok)
        return answer(429, { 'retry-after': String(Math.ceil(taken.retryAfterMs / 1000)) });
    }
    let body: Uint8Array | undefined;
    try {
      body = await capped(request);
    } catch {
      return answer(400);
    }
    if (body === undefined) return answer(413);
    return handle(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: body as BodyInit,
      }),
    );
  };
}
