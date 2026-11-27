/**
 * What the proxy needs of the settings. It runs on the Edge runtime, where `node:fs` is not there, so it cannot use `./env` (which reads secret
 * files), and it needs only a few settings, none of them a secret. `process.env` is read here, in `src/config`, as everywhere (see
 * `process-env.test.ts`). Nothing in this file may import a Node built-in.
 */
export function edgeSettings(env: Record<string, string | undefined> = process.env): {
  /** The app is served over https (`WALLET_URL`). */
  secure: boolean;
  /** `next dev`. */
  development: boolean;
  /** Local sign-in is on (`WALLET_AUTH_LOCAL`) and no core is (suite mode wins): when it is not, the sign-in pages do not exist. */
  authLocal: boolean;
  /** Sign-in through a core is set up (`WALLET_CORE_URL`): sign-in and sign-up send a person to it, though the other pages of local sign-in do not exist. */
  authSovereign: boolean;
} {
  const local = (env.WALLET_AUTH_LOCAL ?? '').trim().toLowerCase();
  return {
    authLocal: (local === '1' || local === 'true') && (env.WALLET_CORE_URL ?? '').trim() === '',
    authSovereign: (env.WALLET_CORE_URL ?? '').trim() !== '',
    secure: (env.WALLET_URL ?? '').startsWith('https://'),
    development: env.NODE_ENV === 'development',
  };
}
