import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

/**
 * Reading a code from pixels (DESIGN.md §13.2): `zxing-wasm` (MIT, with zxing-cpp's Apache-2.0), which is the same C++ library compiled to WebAssembly, served
 * by Wallet from `/zxing/` (`scripts/copy-wasm.mjs`) and compiled under the policy's `'wasm-unsafe-eval'`. The browser's own `BarcodeDetector` is tried first
 * where it has QR (`camera.ts`); this is the fallback and what reads an image file. In 0.1.0 only QR is accepted.
 */
export interface Scanned {
  /** The text the code carries. */
  readonly text: string;
  readonly format: 'qr';
}

export interface Pixels {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
}

let prepared: Promise<unknown> | undefined;

/** Tells the module where its `.wasm` is: this app's own address, in the browser; the package's own file under Node, where there is no address. */
function prepare(locate: boolean): Promise<unknown> {
  prepared ??= prepareZXingModule({
    fireImmediately: true,
    ...(locate
      ? {
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path,
          },
        }
      : {}),
  });
  return prepared;
}

/**
 * What a code carries is bytes, and almost every code made today means them as UTF-8 (so does Wallet's own). The library decodes bytes with no declared
 * character set as Latin-1, which turns "Ü" into "Ã\u009c"; the bytes are read as UTF-8 here, and the library's text is the answer only for bytes that are not.
 */
function utf8Of(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Reads the first QR code in an image, or `null` when there is none. */
export async function readQr(image: Pixels): Promise<Scanned | null> {
  await prepare(typeof window !== 'undefined');
  const results = await readBarcodes(
    { data: image.data, width: image.width, height: image.height, colorSpace: 'srgb' } as ImageData,
    { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 },
  );
  const found = results.find((result) => result.isValid && result.format === 'QRCode');
  if (!found) return null;
  return { text: utf8Of(found.bytes) ?? found.text, format: 'qr' };
}
