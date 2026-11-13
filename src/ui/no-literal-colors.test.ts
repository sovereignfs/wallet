import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Style with `--sv-*` tokens only (AGENTS.md): **no screen or style names a colour of its own.** The exceptions are the ones the design gives and the file
 * says: a code is drawn black on white whatever the theme, so that a scanner reads contrast (`src/barcode/CodeView.tsx`), and the icons and the web manifest
 * are files for the platform, which has no tokens; the canvas a picture of a code is laid on white on before it is read (`camera.ts`) is pixels and not interface;
 * and the page the service worker builds itself for an address it cannot answer (`src/sw/source.ts`) has no stylesheet to take tokens from.
 */
const ROOT = path.resolve(__dirname, '../..');
const ALLOWED = new Set([
  path.join('src', 'barcode', 'CodeView.tsx'),
  path.join('src', 'barcode', 'draw.ts'),
  path.join('src', 'barcode', 'camera.ts'),
  path.join('src', 'sw', 'source.ts'),
  path.join('src', 'ui', 'WalletMark.tsx'),
  path.join('app', 'manifest.ts'),
  path.join('app', 'layout.tsx'),
]);

function walk(folder: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, folder))) {
    const relative = path.join(folder, entry);
    if (statSync(path.join(ROOT, relative)).isDirectory()) out.push(...walk(relative));
    else if (/\.(css|tsx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(relative);
  }
  return out;
}

describe('colours', () => {
  it('are tokens everywhere but where the design says otherwise', () => {
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    const offenders = [...walk('src'), ...walk('app')]
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => {
        // Comments are not colours.
        const code = readFileSync(path.join(ROOT, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return literal.test(code);
      });
    expect(offenders).toEqual([]);
  });

  it('are found when they are there (the check can fail)', () => {
    expect('color: #fff'.match(/#[0-9a-fA-F]{3,8}\b/)).not.toBeNull();
    expect('background: rgba(0, 0, 0, 0.5)'.match(/\brgba?\(/)).not.toBeNull();
  });
});
