import { describe, expect, it } from 'vitest';
import { landing } from './content';

describe('what the landing page says', () => {
  it('has something to say in every place it says anything', () => {
    for (const text of [
      landing.heading,
      landing.lead,
      landing.signIn,
      landing.signInSuite,
      landing.signUp,
      landing.noSignIn,
    ])
      expect(text.trim()).not.toBe('');
    expect(landing.features.length).toBeGreaterThan(0);
    for (const feature of landing.features) {
      expect(feature.title.trim()).not.toBe('');
      expect(feature.body.trim()).not.toBe('');
    }
    expect(new Set(landing.features.map((f) => f.title)).size).toBe(landing.features.length);
  });

  it('promises nothing that is not built in 0.1.0: no documents, health, backup, sharing, family or reminders', () => {
    const said = JSON.stringify(landing).toLowerCase();
    for (const word of [
      'passport',
      'document',
      'health',
      'backup',
      'shar',
      'family',
      'reminder',
      'journal',
    ]) {
      expect(said, word).not.toContain(word);
    }
  });

  it('keeps to the words of the interface: never vault, tier, E2EE, tenant, client or plugin', () => {
    const said = JSON.stringify(landing).toLowerCase();
    for (const word of ['vault', 'tier', 'e2ee', 'tenant', 'client', 'plugin', 'dek'])
      expect(said, word).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});
