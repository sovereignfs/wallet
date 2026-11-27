import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The tool as the image runs it (DESIGN.md §25.1): one bundled file, made by `scripts/build-tools.mjs`, run with `node`. A package that is imported in a way the bundle
 * cannot follow, or a driver that is no longer left outside it, shows here, and not in the container. The settings are given whole, since a developer's own must not
 * reach it.
 */
const ROOT = path.resolve(__dirname, '../..');
const FILE = path.join(ROOT, 'tools/wallet-admin.mjs');

beforeAll(() => {
  execFileSync('node', ['scripts/build-tools.mjs'], { cwd: ROOT, stdio: 'pipe' });
}, 120_000);

function tool(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('node', [FILE, ...args], {
    cwd: ROOT,
    // Only what the case gives, and what Node needs to be found; `NODE_ENV` because the types of a Next app ask for it.
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env },
    encoding: 'utf8',
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe('the bundled tool', () => {
  it('runs, with nothing around it but node, and shows how to use it', () => {
    const answer = tool(['--help']);
    expect(answer.code).toBe(0);
    expect(answer.out).toContain('accounts reset-link EMAIL');
  });

  it('reads the settings as the server does, and says which are wrong and never what they hold', () => {
    const answer = tool(['accounts', 'reset-link', 'ada@example.com'], {
      WALLET_URL: 'https://wallet.example.com',
      WALLET_AUTH_LOCAL: '1',
      WALLET_AUTH_SECRET: 'not-long-enough-and-secret',
    });
    expect(answer.code).toBe(1);
    expect(answer.err).toContain('WALLET_AUTH_SECRET must be at least 32 characters');
    expect(answer.err).not.toContain('not-long-enough-and-secret');
    expect(answer.out).toBe('');
  });

  it('says there are no accounts where sign-in is off, which takes no database', () => {
    const answer = tool(['accounts', 'reset-link', 'ada@example.com']);
    expect(answer.code).toBe(1);
    expect(answer.err).toContain('sign-in is not set up');
    expect(answer.out).toBe('');
  });
});
