// Copies the code scanner's WebAssembly module into public/, so that Wallet serves it itself: **the browser talks only to its own server** (AGENTS.md), and
// nothing is loaded from a CDN. Run before `dev` and `build`; the copy is not committed (.gitignore), and `src/barcode/wasm.test.ts` checks it is the
// module the installed zxing-wasm ships.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'node_modules', 'zxing-wasm');
const out = join(import.meta.dirname, '..', 'public', 'zxing');
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'dist', 'reader', 'zxing_reader.wasm'), join(out, 'zxing_reader.wasm'));
