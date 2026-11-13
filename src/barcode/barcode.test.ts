import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_PAYLOAD } from '../core/entries';
import { QUIET, pathOf, qrModules, qrPixels, qrSvg, sideOf } from './draw';
import { readQr } from './read';

/** Every payload a card may carry is drawn, and **read back by zxing, a different library, to the same text**. */
const PAYLOADS = [
  'A',
  '1234567890123',
  'https://example.com/member/4711?x=1&y=2#frag',
  'MEMBER:ANA-LOPEZ|GOLD|2027-12-31',
  'Ünïcödé · ダークモード · 😀 · العربية',
  'line one\nline two\ttabbed',
  'x'.repeat(500),
  '0'.repeat(MAX_PAYLOAD),
  ['{"id":"b5f3","k":"v"}'].join(''),
];

describe('drawing a code', () => {
  it.each(
    PAYLOADS.map((p) => [p.length > 40 ? `${p.slice(0, 20)}… (${p.length})` : p, p] as const),
  )('draws %s and reads it back to the same text', async (_name, payload) => {
    for (const scale of [4, 8]) {
      const found = await readQr(qrPixels(payload, scale));
      expect(found?.text, `scale ${scale}`).toBe(payload);
      expect(found?.format).toBe('qr');
    }
  });

  it('reads each error correction level back', async () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const)
      expect((await readQr(qrPixels('https://example.com/a', 6, level)))?.text).toBe(
        'https://example.com/a',
      );
  });

  it('gives a quiet zone of four modules on every side, and draws nothing in it', () => {
    const modules = qrModules('hello');
    const side = sideOf(modules);
    expect(side).toBe(modules.size + 2 * QUIET);
    const { data } = qrPixels('hello', 1);
    for (let i = 0; i < side; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, side - 1],
        [0, i],
        [side - 1, i],
        [i, QUIET - 1],
      ] as const)
        expect(data[(y * side + x) * 4], `${x},${y}`).toBe(255);
    }
  });

  it('draws black on white, in a document of its own, whatever the theme', () => {
    const svg = qrSvg('hello');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
    // The path stays inside the drawing.
    const side = sideOf(qrModules('hello'));
    for (const [x, y] of [...pathOf(qrModules('hello')).matchAll(/M(\d+) (\d+)/g)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    )) {
      expect(x).toBeGreaterThanOrEqual(QUIET);
      expect(y).toBeLessThan(side - QUIET);
    }
  });

  it('draws a code that is a square of the right size for the version', () => {
    expect(qrModules('A').size).toBe(21);
    expect(qrModules('x'.repeat(100)).size % 4).toBe(1);
    expect(qrModules('hello').rows.every((row) => row.length === 21)).toBe(true);
  });

  it('is the same drawing every time for the same text, so that a card does not change as it is shown', () => {
    expect(qrSvg('https://example.com')).toBe(qrSvg('https://example.com'));
    expect(qrSvg('a')).not.toBe(qrSvg('b'));
  });
});

describe('reading', () => {
  it('finds nothing in a picture with no code, and does not make one up', async () => {
    const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
    expect(await readQr(blank)).toBeNull();
    const noise = new Uint8ClampedArray(200 * 200 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    expect(await readQr({ data: noise, width: 200, height: 200 })).toBeNull();
  });

  it('reads a code with a little damage, which is what error correction is for', async () => {
    const image = qrPixels('https://example.com/damaged', 8, 'Q');
    // Scratch a small block out of the middle.
    const side = image.width;
    for (let y = side / 2 - 12; y < side / 2 + 12; y++)
      for (let x = side / 2 - 12; x < side / 2 + 12; x++) {
        const at = (y * side + x) * 4;
        image.data[at] = image.data[at + 1] = image.data[at + 2] = 255;
      }
    expect((await readQr(image))?.text).toBe('https://example.com/damaged');
  });
});

describe('the scanner’s WebAssembly', () => {
  it('is served by this app: the copy in public/ is the module the installed library ships', () => {
    const copy = readFileSync(join(__dirname, '../../public/zxing/zxing_reader.wasm'));
    const shipped = readFileSync(
      join(__dirname, '../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'),
    );
    expect(copy.equals(shipped)).toBe(true);
  });
});
