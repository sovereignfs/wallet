import { describe, expect, it } from 'vitest';
import { USAGE, parseArgs } from './args';

describe('what wallet-admin is asked to do', () => {
  it('makes a reset link for one address, trimmed', () => {
    expect(parseArgs(['accounts', 'reset-link', 'ada@example.com'])).toEqual({
      ok: true,
      command: { kind: 'reset-link', email: 'ada@example.com' },
    });
    expect(parseArgs(['accounts', 'reset-link', '  ada@example.com '])).toMatchObject({
      ok: true,
      command: { email: 'ada@example.com' },
    });
  });

  it('shows how to use it, for the three ways of asking', () => {
    for (const word of ['--help', '-h', 'help'])
      expect(parseArgs([word]), word).toEqual({ ok: true, command: { kind: 'help' } });
    expect(USAGE).toContain('accounts reset-link EMAIL');
    // The way to run it is the one that works in the image.
    expect(USAGE).toContain('node tools/wallet-admin.mjs');
  });

  it('refuses what it does not understand, saying which, and never guesses a command', () => {
    const refused = (argv: string[]) => {
      const parsed = parseArgs(argv);
      if (parsed.ok) throw new Error(`${argv.join(' ')} was understood`);
      return parsed.message;
    };
    expect(refused([])).toContain('needs a command');
    expect(refused(['accounts'])).toContain('has no command');
    expect(refused(['accounts', 'delete', 'ada@example.com'])).toContain('has no command');
    expect(refused(['reset-link', 'ada@example.com'])).toContain('has no command');
    expect(refused(['accounts', 'reset-link'])).toContain('one address');
    expect(refused(['accounts', 'reset-link', 'a@b.c', 'd@e.f'])).toContain('one address');
    for (const email of ['', '   ', 'no-at-sign', 'ada @example.com', 'ada@exa mple.com'])
      expect(refused(['accounts', 'reset-link', email]), email).toContain('not an email address');
  });
});
