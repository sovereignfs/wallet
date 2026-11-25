import { createSovereign } from '@sovereignfs/sdk';
import { createFakeCore } from '@sovereignfs/sdk/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discardingTokenStore, sdkSessionStore } from '../auth/sdk-stores';
import { type TestAuth, makeAuth } from '../auth/test-support';
import { testTarget } from '../db/test-support';
import { type ExportWiring, answerCoreExport } from './core-export';

/**
 * Core's request for an export, through the real SDK client and its store in the auth store (what `sovereignClient()` is), against the SDK's fake core: a
 * signed request is answered, one that core did not sign is not, and **a request answered once is refused the second time even by a client made afresh**, as
 * after a restart or by another process, because the token's `jti` is in the database and not in a process's memory.
 */
const { leg } = testTarget();
let t: TestAuth;
beforeAll(async () => {
  t = await makeAuth({ local: false, signUp: 'open' });
});
afterAll(async () => t.close());

function wiring(core: ReturnType<typeof createFakeCore>): ExportWiring {
  // A client as `sovereignClient()` makes one, with nothing of an earlier one in memory.
  const client = createSovereign({
    appUrl: 'https://wallet.example.com',
    coreUrl: core.url,
    clientId: core.credentials.clientId,
    clientSecret: core.credentials.clientSecret,
    fetch: core.fetch,
    sessionStore: sdkSessionStore(() => Promise.resolve(t.store)),
    tokenStore: discardingTokenStore,
  });
  return { client, limiter: undefined, trustedProxies: [], records: async () => [] };
}

const request = (token: string) =>
  new Request('https://wallet.example.com/api/sovereign/export', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ export_request_token: token }).toString(),
  });

describe(`an export request through the SDK (${leg})`, () => {
  it('answers a request core signed, and refuses the same one again from a client made afresh', async () => {
    const core = createFakeCore();
    const token = await core.exportRequestToken({ sub: 'sub-export-1' });
    const first = await answerCoreExport(request(token), wiring(core));
    expect(first?.status).toBe(200);
    expect(first?.headers.get('content-type')).toBe('application/x-tar');
    await first?.arrayBuffer();
    // Another client, as after a restart: the first one's memory is gone, and the database is not.
    const again = await answerCoreExport(request(token), wiring(core));
    expect(again?.status).toBe(400);
    // Another request for the same person is another token, and is answered.
    const next = await answerCoreExport(
      request(await core.exportRequestToken({ sub: 'sub-export-1' })),
      wiring(core),
    );
    expect(next?.status).toBe(200);
    await next?.arrayBuffer();
  });

  it('refuses a request that core did not sign, and one that is no request at all', async () => {
    const core = createFakeCore();
    const forged = await core.exportRequestToken({ sub: 'sub-export-2' }, { wrong: 'signature' });
    expect((await answerCoreExport(request(forged), wiring(core)))?.status).toBe(400);
    expect((await answerCoreExport(request('not.a.token'), wiring(core)))?.status).toBe(400);
    expect((await answerCoreExport(request(''), wiring(core)))?.status).toBe(400);
  });
});
