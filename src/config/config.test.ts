import { describe, expect, it } from 'vitest';
import { loadConfig, type LoadResult } from './index';
import { ConfigError } from '@sovereignfs/config';
import { readEnvironment, readSecret } from './env';

/** The problems of a bad environment, which every test below wants to read and none expects to be empty. */
function problems(result: LoadResult): readonly string[] {
  if (result.ok) throw new Error('the settings were accepted');
  return result.problems;
}

describe('loadConfig', () => {
  it('accepts no settings at all, and the database is then an sqld service at its default address', () => {
    const result = loadConfig({});
    expect(result).toMatchObject({
      ok: true,
      config: { url: undefined, worker: true, database: { database: { form: 'sqld' } } },
    });
  });

  it('reports a wrong database setting with the others, naming it', () => {
    const [problem] = problems(loadConfig({ WALLET_DB_DIALECT: 'mysql' }));
    expect(problem).toContain('WALLET_DB_DIALECT');
  });

  it('reads the PostgreSQL address from a file, and keeps it out of what it reports', () => {
    const result = loadConfig(
      { WALLET_DB_DIALECT: 'postgres', WALLET_POSTGRES_URL_FILE: '/run/db' },
      () => 'postgres://u:hunter2@db:5432/wallet\n',
    );
    expect(result).toMatchObject({ ok: true });
    const bad = problems(
      loadConfig(
        { WALLET_DB_DIALECT: 'postgres', WALLET_POSTGRES_URL_FILE: '/run/db' },
        () => 'hunter2 is not a url',
      ),
    );
    expect(bad.join(' ')).not.toContain('hunter2');
  });

  describe('WALLET_URL', () => {
    it('keeps the origin of an https address', () => {
      expect(loadConfig({ WALLET_URL: 'https://wallet.example.com/' })).toMatchObject({
        ok: true,
        config: { url: 'https://wallet.example.com' },
      });
    });

    it.each([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://x.localhost',
    ])('allows plain http on this machine: %s', (url) => {
      expect(loadConfig({ WALLET_URL: url }).ok).toBe(true);
    });

    it('refuses plain http anywhere else, naming the setting and not the value', () => {
      const [problem] = problems(loadConfig({ WALLET_URL: 'http://wallet.example.com' }));
      expect(problem).toContain('WALLET_URL');
      expect(problem).not.toContain('wallet.example.com');
    });

    it.each([
      ['not an address', 'not-an-address-value'],
      ['another scheme', 'ftp://wallet.example.com'],
      ['a path', 'https://wallet.example.com/app'],
      ['a query', 'https://wallet.example.com/?a=1'],
      ['a user name', 'https://me:secret@wallet.example.com'],
    ])('refuses %s, and never prints it', (_what, url) => {
      const result = problems(loadConfig({ WALLET_URL: url }));
      expect(result.join(' ')).toContain('WALLET_URL');
      expect(result.join(' ')).not.toContain('secret');
      expect(result.join(' ')).not.toContain(url);
    });
  });

  describe('WALLET_WORKER', () => {
    it('is on unless it says off', () => {
      expect(loadConfig({ WALLET_WORKER: 'off' })).toMatchObject({ config: { worker: false } });
      expect(loadConfig({ WALLET_WORKER: 'on' })).toMatchObject({ config: { worker: true } });
    });

    it('refuses anything else', () => {
      expect(problems(loadConfig({ WALLET_WORKER: 'yes' }))[0]).toContain('WALLET_WORKER');
    });
  });

  const SIGNED_IN = {
    WALLET_URL: 'https://wallet.example.com',
    WALLET_AUTH_SECRET: 'a-secret-that-is-at-least-thirty-two-characters-long',
  };

  describe('settings that go together', () => {
    it.each([
      ['WALLET_CORE_URL', 'Sovereign sign-in'],
      ['WALLET_CORE_CLIENT_ID', 'Sovereign sign-in'],
    ])('stops on %s given alone', (name, what) => {
      const [problem] = problems(loadConfig({ [name]: 'value-that-must-not-appear' }));
      expect(problem).toContain(what);
      expect(problem).not.toContain('value-that-must-not-appear');
    });

    it('names what is missing', () => {
      const [problem] = problems(
        loadConfig({ WALLET_CORE_URL: 'https://core.example.com', WALLET_CORE_CLIENT_ID: 'a' }),
      );
      expect(problem).toContain('WALLET_CORE_CLIENT_SECRET is missing');
    });

    it('accepts all of a group', () => {
      expect(
        loadConfig({
          ...SIGNED_IN,
          WALLET_CORE_URL: 'https://core.example.com',
          WALLET_CORE_CLIENT_ID: 'a',
          WALLET_CORE_CLIENT_SECRET: 'b',
        }).ok,
      ).toBe(true);
    });

    it('counts a secret given as a file as given', () => {
      const files: Record<string, string> = { '/run/secret': 's3cret\n' };
      const result = loadConfig(
        {
          ...SIGNED_IN,
          WALLET_CORE_URL: 'https://core.example.com',
          WALLET_CORE_CLIENT_ID: 'a',
          WALLET_CORE_CLIENT_SECRET_FILE: '/run/secret',
        },
        (path) => files[path] ?? '',
      );
      expect(result.ok).toBe(true);
    });

    it('stops on an SMTP host with no sender', () => {
      expect(problems(loadConfig({ WALLET_SMTP_HOST: 'smtp.example.com' }))[0]).toContain(
        'WALLET_SMTP_FROM',
      );
      expect(
        loadConfig({ WALLET_SMTP_HOST: 'smtp.example.com', WALLET_SMTP_FROM: 'Tasks <a@b.c>' }).ok,
      ).toBe(true);
    });
  });

  describe('the instance key', () => {
    const key = Buffer.alloc(32, 7);
    const other = Buffer.alloc(32, 9);
    const ringOf = (result: LoadResult) => (result.ok ? result.config.encryption : undefined);

    it('is optional: with none there is no ring, and nothing is wrong', () => {
      const result = loadConfig({});
      expect(result.ok && result.config.encryption).toBeUndefined();
    });

    it('is read in base64, URL-safe base64 and hex, from the setting or its file, and known by a fingerprint', () => {
      for (const text of [key.toString('base64'), key.toString('base64url'), key.toString('hex')]) {
        const ring = ringOf(loadConfig({ WALLET_ENCRYPTION_KEY: text }));
        expect(ring?.current.key.equals(key), text).toBe(true);
        expect(ring?.current.fingerprint).toMatch(/^[0-9a-f]{16}$/);
        expect(ring?.previous).toBeUndefined();
      }
      const fromFile = ringOf(
        loadConfig({ WALLET_ENCRYPTION_KEY_FILE: '/run/key' }, () => `${key.toString('base64')}\n`),
      );
      expect(fromFile?.current.key.equals(key)).toBe(true);
    });

    it('may have the key it replaces beside it, for the restart that moves the credentials', () => {
      const ring = ringOf(
        loadConfig({
          WALLET_ENCRYPTION_KEY: key.toString('hex'),
          WALLET_ENCRYPTION_KEY_PREVIOUS: other.toString('hex'),
        }),
      );
      expect(ring?.current.key.equals(key)).toBe(true);
      expect(ring?.previous?.key.equals(other)).toBe(true);
      expect(ring?.previous?.fingerprint).not.toBe(ring?.current.fingerprint);
    });

    it('stops the server for a key that is not one, a previous key with no current one, and the same key twice, naming the setting and never its value', () => {
      const secret = 'hunter2-NOT-A-KEY';
      const wrong = problems(loadConfig({ WALLET_ENCRYPTION_KEY: secret }));
      expect(wrong.join(' ')).toContain('WALLET_ENCRYPTION_KEY is not a key');
      expect(
        problems(loadConfig({ WALLET_ENCRYPTION_KEY: Buffer.alloc(16).toString('hex') })).join(' '),
      ).toContain('not a key');
      expect(
        problems(
          loadConfig({
            WALLET_ENCRYPTION_KEY: key.toString('hex'),
            WALLET_ENCRYPTION_KEY_PREVIOUS: secret,
          }),
        ).join(' '),
      ).toContain('WALLET_ENCRYPTION_KEY_PREVIOUS is not a key');
      expect(
        problems(loadConfig({ WALLET_ENCRYPTION_KEY_PREVIOUS: key.toString('hex') })).join(' '),
      ).toContain('no WALLET_ENCRYPTION_KEY to move');
      expect(
        problems(
          loadConfig({
            WALLET_ENCRYPTION_KEY: key.toString('hex'),
            WALLET_ENCRYPTION_KEY_PREVIOUS: key.toString('base64'),
          }),
        ).join(' '),
      ).toContain('the same key');
      for (const message of [
        ...wrong,
        ...problems(
          loadConfig({
            WALLET_ENCRYPTION_KEY: key.toString('hex'),
            WALLET_ENCRYPTION_KEY_PREVIOUS: secret,
          }),
        ),
      ])
        expect(message).not.toContain(secret);
    });
  });

  it('reports every problem at once, so that one run fixes them all', () => {
    const result = problems(
      loadConfig({ WALLET_URL: 'wallet', WALLET_WORKER: 'x', WALLET_ENTRY_MAX_KB: '0' }),
    );
    expect(result).toHaveLength(3);
  });

  it('turns an unreadable secret file into a problem that names the variable and not the path', () => {
    const result = problems(
      loadConfig({ WALLET_AUTH_SECRET_FILE: '/run/secrets/nowhere' }, () => {
        throw new Error('ENOENT /run/secrets/nowhere');
      }),
    );
    expect(result.join(' ')).toContain('WALLET_AUTH_SECRET_FILE');
    expect(result.join(' ')).not.toContain('/run/secrets/nowhere');
  });
});

describe('reading the environment', () => {
  const read = (env: Record<string, string | undefined>, name: string, readFile?: () => string) => {
    const reading = readEnvironment(env, readFile);
    if (!reading.ok) throw new Error(reading.problems.join(' '));
    return reading.read(name);
  };

  it('reads the plain name', () => {
    expect(read({ WALLET_URL: 'a' }, 'WALLET_URL')).toBe('a');
  });

  it('treats an empty value as no value', () => {
    expect(read({ WALLET_URL: '' }, 'WALLET_URL')).toBeUndefined();
    expect(read({}, 'WALLET_URL')).toBeUndefined();
  });

  it('reads a secret from its file, and drops one trailing line break and no more', () => {
    expect(
      read({ WALLET_AUTH_SECRET_FILE: '/f' }, 'WALLET_AUTH_SECRET', () => ' spaced \n\n'),
    ).toBe(' spaced \n');
  });

  it('refuses a secret given both ways (contracts/env.md §3: the file no longer wins)', () => {
    const reading = readEnvironment(
      { WALLET_AUTH_SECRET: 'plain', WALLET_AUTH_SECRET_FILE: '/f' },
      () => 'x',
    );
    expect(reading).toEqual({
      ok: false,
      problems: ['WALLET_AUTH_SECRET is set together with WALLET_AUTH_SECRET_FILE; set only one.'],
    });
    expect(
      problems(loadConfig({ WALLET_AUTH_SECRET: 'plain', WALLET_AUTH_SECRET_FILE: '/f' })),
    ).toHaveLength(1);
  });

  it('refuses a file for a setting that is not a secret, rather than ignoring it', () => {
    expect(
      readEnvironment({ WALLET_CORE_URL_FILE: '/run/core' }, () => 'https://core.test'),
    ).toEqual({
      ok: false,
      problems: ['WALLET_CORE_URL_FILE is not read: only a secret can be given as a file.'],
    });
  });

  it('names the variable, never the path or the cause, of a file that cannot be read', () => {
    const reading = readEnvironment({ WALLET_AUTH_SECRET_FILE: '/secret/path' }, () => {
      throw new Error('boom /secret/path');
    });
    expect(reading).toEqual({
      ok: false,
      problems: ['WALLET_AUTH_SECRET_FILE names a file that cannot be read.'],
    });
  });

  it('reads one secret alone, and throws a ConfigError for a file it cannot read', () => {
    expect(readSecret({ WALLET_POSTGRES_URL: 'p' }, 'WALLET_POSTGRES_URL')).toBe('p');
    expect(() =>
      readSecret({ WALLET_POSTGRES_URL_FILE: '/x' }, 'WALLET_POSTGRES_URL', () => {
        throw new Error('no');
      }),
    ).toThrow(ConfigError);
  });
});

describe('the limits', () => {
  it('have the defaults of DESIGN.md §29.5', () => {
    const result = loadConfig({});
    expect(result.ok && result.config.limits).toEqual({
      storageBytes: 500 * 1024 * 1024,
      entryBodyBytes: 256 * 1024,
      entries: 50_000,
    });
  });

  it('are settings, read as whole numbers', () => {
    const result = loadConfig({
      WALLET_STORAGE_MAX_ACCOUNT_MB: '10',
      WALLET_ENTRY_MAX_KB: '16',
      WALLET_LIMIT_ENTRIES: '20',
    });
    expect(result.ok && result.config.limits).toEqual({
      storageBytes: 10 * 1024 * 1024,
      entryBodyBytes: 16 * 1024,
      entries: 20,
    });
  });

  it.each(['0', '-1', '1.5', 'many'])('stop the server on %s, naming the setting', (value) => {
    const [problem] = problems(loadConfig({ WALLET_LIMIT_ENTRIES: value }));
    expect(problem).toContain('WALLET_LIMIT_ENTRIES');
    expect(problem).not.toContain(value === '0' ? 'zzz' : value + ' ');
  });
});
