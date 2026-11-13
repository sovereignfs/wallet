import bwipjs from 'bwip-js/browser';

type BwipRawOptions = Parameters<typeof bwipjs.raw>[0];

/**
 * Drawing a code (DESIGN.md §13.2): `bwip-js` (MIT) makes the modules, and Wallet draws them, as an SVG with the quiet zone the format asks for, **black
 * on white whatever the theme**, since a scanner reads contrast and a dark theme would invert it. Drawn in the browser; nothing is fetched. In 0.1.0 the
 * format is QR; the rest of §13.2 draws through the same two functions.
 */
export interface Modules {
  /** Modules on a side. */
  readonly size: number;
  /** `rows[y][x]`: true where the module is dark. */
  readonly rows: readonly (readonly boolean[])[];
}

/** QR's error correction: M (15%) reads reliably and keeps the code small enough to scan from a phone's screen. */
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export function qrModules(payload: string, ecLevel: EcLevel = 'M'): Modules {
  const [drawing] = bwipjs.raw({
    bcid: 'qrcode',
    // bwip-js takes the text as it is and encodes it as UTF-8, which is what readers assume (`read.ts`).
    text: payload,
    // The typings of the generic entry leave out the symbology's own options; the library takes them.
    eclevel: ecLevel,
  } as BwipRawOptions);
  // A two-dimensional code comes back as pixels; a linear one as bars, which a QR code never is.
  if (!drawing || !('pixs' in drawing)) throw new Error('could not make a code');
  const size = drawing.pixx;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(drawing.pixs[y * size + x] === 1);
    rows.push(row);
  }
  return { size, rows };
}

/** The quiet zone of a QR code is four modules on every side. */
export const QUIET = 4;

/** The path of the dark modules, one run at a time, in the code's own units (one module is one unit), inside its quiet zone. */
export function pathOf(modules: Modules, quiet = QUIET): string {
  const parts: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    const row = modules.rows[y] ?? [];
    let x = 0;
    while (x < modules.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < modules.size && row[end]) end++;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  return parts.join('');
}

/** The side of the drawing, in modules, quiet zone included. */
export const sideOf = (modules: Modules, quiet = QUIET): number => modules.size + 2 * quiet;

/** The code as a standalone SVG document, for a place that has no component (an image to save). */
export function qrSvg(payload: string, ecLevel: EcLevel = 'M'): string {
  const modules = qrModules(payload, ecLevel);
  const side = sideOf(modules);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${pathOf(modules)}" fill="#000"/></svg>`;
}

/** The code as pixels (RGBA, `scale` pixels to a module, the quiet zone in white), which is what a scanner reads, and what a test decodes back. */
export function qrPixels(
  payload: string,
  scale = 8,
  ecLevel: EcLevel = 'M',
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const modules = qrModules(payload, ecLevel);
  const side = sideOf(modules) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) {
      if (!modules.rows[y]?.[x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const at = ((y + QUIET) * scale + dy) * side * 4 + ((x + QUIET) * scale + dx) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
    }
  return { data, width: side, height: side };
}
