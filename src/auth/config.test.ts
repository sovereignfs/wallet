import { describe, expect, it } from 'vitest';
import { loadConfig, type LoadResult } from '../config';

const SECRET = 'a-secret-that-is-at-least-thirty-two-characters-long';
const ON = {
  WALLET_URL: 'https://wallet.example.com',
  WALLET_AUTH_LOCAL: '1',
  WALLET_AUTH_SECRET: SECRET,
};

function problems(result: LoadResult): readonly string[] {
  if (result.ok) throw new Error('the settings were accepted');
  return result.problems;
}

function authOf(result: LoadResult) {
  if (!result.ok) throw new Error(result.problems.join(' '));
  return result.config.auth;
}

const CORE = {
  WALLET_CORE_URL: 'https://sovereign.example.com',
  WALLET_CORE_CLIENT_ID: 'wallet-client',
  WALLET_CORE_CLIENT_SECRET: 'wallet-client-secret',
};

describe('sign-in settings', () => {
  it('are off when local sign-in is not asked for, and then nothing else of them is read', () => {
    expect(authOf(loadConfig({}))).toBeUndefined();
    expect(
      authOf(loadConfig({ WALLET_AUTH_LOCAL: '0', WALLET_AUTH_SECRET: 'short' })),
    ).toBeUndefined();
    expect(authOf(loadConfig({ WALLET_AUTH_LOCAL: 'false' }))).toBeUndefined();
  });

  it('are on with an address and a secret, and sign-up is closed unless it is said to be open', () => {
    expect(authOf(loadConfig(ON))).toEqual({
      url: 'https://wallet.example.com',
      secret: SECRET,
      signUp: 'closed',
      passwordMinLength: 10,
      local: true,
      trustedProxies: [],
      sovereign: undefined,
    });
    expect(
      authOf(loadConfig({ ...ON, WALLET_AUTH_LOCAL: 'true', WALLET_AUTH_SIGNUP: 'OPEN' })),
    ).toMatchObject({
      signUp: 'open',
    });
    expect(authOf(loadConfig({ ...ON, WALLET_AUTH_PASSWORD_MIN_LENGTH: '14' }))).toMatchObject({
      passwordMinLength: 14,
    });
  });

  it('read the secret from a file, and keep it out of what they report', () => {
    const result = loadConfig(
      { ...ON, WALLET_AUTH_SECRET: undefined, WALLET_AUTH_SECRET_FILE: '/run/secret' },
      () => `${SECRET}\n`,
    );
    expect(authOf(result)).toMatchObject({ secret: SECRET });
    const short = problems(loadConfig({ ...ON, WALLET_AUTH_SECRET: 'hunter2' })).join(' ');
    expect(short).toContain('WALLET_AUTH_SECRET');
    expect(short).not.toContain('hunter2');
  });

  it('stop the server when a way is on and a thing it needs is missing or wrong', () => {
    expect(problems(loadConfig({ ...ON, WALLET_AUTH_SECRET: undefined })).join(' ')).toContain(
      'WALLET_AUTH_SECRET',
    );
    expect(problems(loadConfig({ ...ON, WALLET_URL: undefined })).join(' ')).toContain(
      'WALLET_URL',
    );
    expect(problems(loadConfig({ ...ON, WALLET_AUTH_SIGNUP: 'anyone' })).join(' ')).toContain(
      'WALLET_AUTH_SIGNUP',
    );
    expect(problems(loadConfig({ ...ON, WALLET_AUTH_LOCAL: 'yes' })).join(' ')).toContain(
      'WALLET_AUTH_LOCAL',
    );
    for (const bad of ['3', '1000', 'ten'])
      expect(
        problems(loadConfig({ ...ON, WALLET_AUTH_PASSWORD_MIN_LENGTH: bad })).join(' '),
      ).toContain('WALLET_AUTH_PASSWORD_MIN_LENGTH');
  });

  it('open sign-up by default only when a core is the only way in, and keep what the operator says either way', () => {
    const coreOnly = { WALLET_URL: ON.WALLET_URL, WALLET_AUTH_SECRET: SECRET, ...CORE };
    expect(authOf(loadConfig(coreOnly))?.signUp).toBe('open');
    expect(authOf(loadConfig({ ...coreOnly, WALLET_AUTH_SIGNUP: 'closed' }))?.signUp).toBe(
      'closed',
    );
    // Set both ways, it runs in suite mode, where who may sign up is the core's: open, not Wallet's own `closed`.
    expect(authOf(loadConfig({ ...coreOnly, WALLET_AUTH_LOCAL: '1' }))?.signUp).toBe('open');
    expect(authOf(loadConfig(ON))?.signUp).toBe('closed');
  });

  it('read the proxies in front of Wallet as addresses and ranges, and name a wrong entry by its place and never by what it says', () => {
    expect(authOf(loadConfig(ON))?.trustedProxies).toEqual([]);
    expect(
      authOf(
        loadConfig({
          ...ON,
          WALLET_AUTH_TRUSTED_PROXIES: ' 10.0.0.0/8 , 192.168.1.5,fd00::/8,,::1 ',
        }),
      )?.trustedProxies,
    ).toEqual(['10.0.0.0/8', '192.168.1.5', 'fd00::/8', '::1']);
    // Suite mode has them too: its notices and its export are counted per address.
    expect(
      authOf(loadConfig({ ...ON, ...CORE, WALLET_AUTH_TRUSTED_PROXIES: '172.16.0.0/12' }))
        ?.trustedProxies,
    ).toEqual(['172.16.0.0/12']);
    const wrong = problems(
      loadConfig({ ...ON, WALLET_AUTH_TRUSTED_PROXIES: '10.0.0.1, secret-proxy.example.com' }),
    );
    expect(wrong).toEqual([
      'WALLET_AUTH_TRUSTED_PROXIES entry 2 must be an IP address or a range such as 10.0.0.0/8.',
    ]);
    expect(wrong.join()).not.toContain('secret-proxy');
    for (const bad of ['10.0.0.0/33', '10.0.0.0/', 'fd00::/129', '10.0.0/8', '*', 'unknown'])
      expect(
        problems(loadConfig({ ...ON, WALLET_AUTH_TRUSTED_PROXIES: bad })).join(),
        bad,
      ).toContain('WALLET_AUTH_TRUSTED_PROXIES entry 1');
  });

  it('say about a wrong address only once: the address check already reported it', () => {
    const reported = problems(loadConfig({ ...ON, WALLET_URL: 'http://wallet.example.com' }));
    expect(reported.filter((problem) => problem.includes('WALLET_URL'))).toHaveLength(1);
  });

  it('are on with a core alone: Sovereign sign-in with no password, still needing an address and a secret', () => {
    const only = { WALLET_URL: ON.WALLET_URL, WALLET_AUTH_SECRET: SECRET, ...CORE };
    expect(authOf(loadConfig(only))).toEqual({
      url: 'https://wallet.example.com',
      secret: SECRET,
      // A core alone decides who may sign in, so sign-up is open unless the operator closes it.
      signUp: 'open',
      passwordMinLength: 10,
      local: false,
      trustedProxies: [],
      sovereign: {
        issuer: 'https://sovereign.example.com',
        clientId: 'wallet-client',
        clientSecret: 'wallet-client-secret',
      },
    });
    expect(authOf(loadConfig(ON))).toMatchObject({ local: true, sovereign: undefined });
    expect(authOf(loadConfig(ON))?.localIgnored).toBeUndefined();
    expect(problems(loadConfig({ ...CORE, WALLET_AUTH_SECRET: SECRET })).join(' ')).toContain(
      'Sovereign sign-in is set, so WALLET_URL',
    );
    expect(problems(loadConfig({ ...CORE, WALLET_URL: ON.WALLET_URL })).join(' ')).toContain(
      'WALLET_AUTH_SECRET',
    );
  });

  it('start in suite mode when both ways in are set: local sign-in off, and the settings to remove named', () => {
    const both = {
      ...ON,
      WALLET_AUTH_SIGNUP: 'closed',
      WALLET_AUTH_PASSWORD_MIN_LENGTH: '12',
      ...CORE,
    };
    expect(authOf(loadConfig(both))).toMatchObject({
      local: false,
      localIgnored: ['WALLET_AUTH_LOCAL', 'WALLET_AUTH_SIGNUP', 'WALLET_AUTH_PASSWORD_MIN_LENGTH'],
      sovereign: { issuer: 'https://sovereign.example.com' },
    });
    // Only what was given is named, and a core alone, or local alone, has nothing to say.
    expect(authOf(loadConfig({ ...ON, ...CORE }))?.localIgnored).toEqual(['WALLET_AUTH_LOCAL']);
    const { WALLET_AUTH_LOCAL: _local, ...coreOnly } = { ...ON, ...CORE };
    expect(authOf(loadConfig(coreOnly))?.localIgnored).toBeUndefined();
    expect(authOf(loadConfig(ON))?.localIgnored).toBeUndefined();
  });

  it('read the client secret from a file, and keep it out of what they report', () => {
    const result = loadConfig(
      {
        ...ON,
        ...CORE,
        WALLET_CORE_CLIENT_SECRET: undefined,
        WALLET_CORE_CLIENT_SECRET_FILE: '/s',
      },
      () => 'from-a-file\n',
    );
    expect(authOf(result)).toMatchObject({ sovereign: { clientSecret: 'from-a-file' } });
  });

  it('stop the server on a partial set of core settings, and on a core address that would send the secret in the clear', () => {
    for (const missing of Object.keys(CORE)) {
      const partial = { ...ON, ...CORE, [missing]: undefined };
      expect(problems(loadConfig(partial)).join(' ')).toContain(missing);
    }
    const insecure = problems(
      loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: 'http://sovereign.example.com' }),
    ).join(' ');
    expect(insecure).toContain('WALLET_CORE_URL must be https');
    expect(insecure).not.toContain('wallet-client-secret');
    // Plain http is for this machine alone, and the address is the instance's own: core's issuer, with no path, which the SDK requires.
    expect(
      authOf(loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: 'http://localhost:4000/' })),
    ).toMatchObject({
      sovereign: { issuer: 'http://localhost:4000' },
    });
    expect(
      problems(
        loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: 'https://core.example.com/api/auth/' }),
      ).join(' '),
    ).toContain('WALLET_CORE_URL is the instance’s own address, with no path');
    for (const bad of [
      'not an address',
      'https://core.example.com/?x=1',
      'https://u:p@core.example.com',
    ])
      expect(problems(loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: bad })).join(' ')).toContain(
        'WALLET_CORE_URL',
      );
  });
});
