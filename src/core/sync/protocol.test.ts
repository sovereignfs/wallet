import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../vault/bytes';
import { MAX_MUTATIONS, parseSyncRequest, parseSyncResponse, sealedText } from './protocol';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sealed = toBase64Url(new Uint8Array(40).fill(7));

const put = (n: number, extra: object = {}) => ({
  id: ID(n),
  op: 'put',
  entryId: ID(100 + n),
  baseVersion: 0,
  tier: 'synced',
  wrappedKey: sealed,
  shape: sealed,
  ...extra,
});
const request = (extra: object = {}) =>
  JSON.stringify({ v: 1, deviceId: ID(9), cursor: 0, mutations: [put(1)], ...extra });

describe('parsing a sync request', () => {
  it('accepts a put, with and without a body, and a delete', () => {
    const parsed = parseSyncRequest(
      request({
        mutations: [
          put(1),
          put(2, { body: sealed }),
          { id: ID(3), op: 'delete', entryId: ID(103), baseVersion: 4, tier: 'synced' },
        ],
      }),
    );
    expect(parsed.ok && parsed.request.mutations.map((m) => m.op)).toEqual([
      'put',
      'put',
      'delete',
    ]);
  });

  it.each([
    ['not JSON', 'nope'],
    ['not an object', '[]'],
    ['no device id', request({ deviceId: 'x' })],
    ['a negative cursor', request({ cursor: -1 })],
    ['a fractional cursor', request({ cursor: 1.5 })],
    ['mutations that are not a list', request({ mutations: {} })],
    ['a mutation with a bad id', request({ mutations: [put(1, { id: 'x' })] })],
    ['an op that is not known', request({ mutations: [put(1, { op: 'move' })] })],
    ['a tier that is not known', request({ mutations: [put(1, { tier: 'cloud' })] })],
    ['a put with no shape', request({ mutations: [put(1, { shape: undefined })] })],
    ['a put with no wrapped key', request({ mutations: [put(1, { wrappedKey: undefined })] })],
    ['a delete carrying a shape', request({ mutations: [put(1, { op: 'delete' })] })],
    ['a negative base version', request({ mutations: [put(1, { baseVersion: -1 })] })],
    ['the same mutation twice', request({ mutations: [put(1), put(1)] })],
    [
      'too many mutations',
      request({ mutations: Array.from({ length: MAX_MUTATIONS + 1 }, (_, i) => put(i + 1)) }),
    ],
  ])('refuses %s', (_name, text) => {
    expect(parseSyncRequest(text)).toEqual({ ok: false, code: 'invalid' });
  });

  it('says a protocol version it does not know is unsupported, so that a device keeps its outbox and is told to update', () => {
    expect(parseSyncRequest(request({ v: 2 }))).toEqual({ ok: false, code: 'unsupported' });
  });
});

describe('sealed text', () => {
  it('is canonical base64url within a size, and nothing else', () => {
    expect(sealedText(sealed, 100)?.length).toBe(40);
    expect(sealedText(sealed, 39)).toBeUndefined();
    expect(sealedText('not base64!', 100)).toBeUndefined();
    expect(sealedText(5, 100)).toBeUndefined();
    expect(sealedText('AAB', 100)).toBeUndefined(); // stray bits: another spelling of AAA
  });
});

describe('parsing an answer', () => {
  const answer = {
    v: 1,
    applied: [{ mutationId: ID(1), seq: 3, version: 1 }],
    refused: [{ mutationId: ID(2), code: 'stale' }],
    rows: [],
    cursor: 3,
    more: false,
    mode: 'normal',
    vaultVersion: 1,
  };

  it('accepts what the server sends', () => {
    expect(parseSyncResponse(answer)).toEqual(answer);
  });

  it.each([
    ['another version', { ...answer, v: 2 }],
    [
      'a refusal that is not known',
      { ...answer, refused: [{ mutationId: ID(2), code: 'because' }] },
    ],
    ['a row with no id', { ...answer, rows: [{ version: 1 }] }],
    ['no cursor', { ...answer, cursor: undefined }],
    ['a mode that is not known', { ...answer, mode: 'x' }],
  ])('does not trust %s', (_name, bad) => {
    expect(parseSyncResponse(bad)).toBeUndefined();
  });
});
