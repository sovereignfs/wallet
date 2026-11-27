import { describe, expect, it } from 'vitest';
import { addressOf, titleOf } from './addresses';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('the addresses of the signed-in area', () => {
  it.each([
    // Wallet opens on the cards.
    ['/', { screen: 'cards' }],
    ['/home', { screen: 'cards' }],
    ['/cards', { screen: 'cards' }],
    ['/cards/', { screen: 'cards' }],
    ['/cards/new', { screen: 'new-card' }],
    ['/settings', { screen: 'settings' }],
    ['/setup', { screen: 'setup' }],
    [`/cards/${ID}`, { screen: 'card', id: ID }],
    [`/cards/${ID}/show`, { screen: 'show', id: ID }],
  ])('%s is a screen', (path, expected) => {
    expect(addressOf(path)).toEqual(expected);
  });

  it.each([
    '/not-found',
    '/cards/not-an-id',
    `/cards/${ID.toUpperCase()}`,
    `/cards/${ID}/edit`,
    `/cards/${ID}/show/more`,
    '/settings/security',
    '/cards/new/more',
    '/api/keys/root',
    '//evil.example',
  ])('%s is not an address, so the server answers 404 and a screen says it is not here', (path) => {
    expect(addressOf(path)).toBeUndefined();
    expect(titleOf(addressOf(path))).toBe('Not found');
  });
});
