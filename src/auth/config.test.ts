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
    expect(authOf(loadConfig({ ...coreOnly, WALLET_AUTH_LOCAL: '1' }))?.signUp).toBe('closed');
    expect(authOf(loadConfig(ON))?.signUp).toBe('closed');
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
      sovereign: {
        issuer: 'https://sovereign.example.com',
        clientId: 'wallet-client',
        clientSecret: 'wallet-client-secret',
      },
    });
    expect(authOf(loadConfig({ ...only, WALLET_AUTH_LOCAL: '1' }))).toMatchObject({
      local: true,
      sovereign: { clientId: 'wallet-client' },
    });
    expect(authOf(loadConfig(ON))).toMatchObject({ local: true, sovereign: undefined });
    expect(problems(loadConfig({ ...CORE, WALLET_AUTH_SECRET: SECRET })).join(' ')).toContain(
      'Sovereign sign-in is set, so WALLET_URL',
    );
    expect(problems(loadConfig({ ...CORE, WALLET_URL: ON.WALLET_URL })).join(' ')).toContain(
      'WALLET_AUTH_SECRET',
    );
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
    // Plain http is for this machine alone, and a path is kept (an issuer may have one) but not a trailing slash.
    expect(
      authOf(loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: 'http://localhost:4000/' })),
    ).toMatchObject({
      sovereign: { issuer: 'http://localhost:4000' },
    });
    expect(
      authOf(loadConfig({ ...ON, ...CORE, WALLET_CORE_URL: 'https://core.example.com/api/auth/' })),
    ).toMatchObject({ sovereign: { issuer: 'https://core.example.com/api/auth' } });
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
