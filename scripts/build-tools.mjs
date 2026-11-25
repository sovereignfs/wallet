// Bundles the operator tools into single files for the image (`tools/`), since the standalone server carries no TypeScript and no source: `node tools/wallet-admin.mjs`
// (DESIGN.md §25.1), as Tusk's `tools/encrypt-data.mjs`. Run by the Dockerfile's build stage after `next build`. Everything the tool imports from Wallet and its
// dependencies goes in, except the database drivers, which are native code or are in the standalone server's own `node_modules` (`@libsql/client`, with `libsql`
// under it, and `pg`), where the file finds them from `/app/tools`.
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

mkdirSync('tools', { recursive: true });
await build({
  entryPoints: { 'wallet-admin': 'src/admin/main.ts' },
  outdir: 'tools',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@libsql/client', 'libsql', 'pg', 'pg-native'],
  // The licences of what is bundled stay in the file, at its end.
  legalComments: 'eof',
  banner: {
    // `bundle` turns some of the packages' `require`s into this, which an ES module does not have.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
