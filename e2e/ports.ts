/**
 * Every port the browser tests use, each shifted by `WALLET_E2E_PORT_OFFSET`, so that several runs can share a machine: a second run on one machine gives itself an offset, and has its own instances, databases and fake services.
 * Plain TypeScript with no syntax Node cannot strip, since `e2e/fake-sovereign-server.ts` is run by Node and reads this too.
 */
const offset = Number(process.env.WALLET_E2E_PORT_OFFSET ?? 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 20_000) {
  throw new Error('WALLET_E2E_PORT_OFFSET must be a whole number from 0 to 20000');
}

export const PORTS = {
  /** The app under test, taking local sign-in, on the database the environment names. */
  app: 3996 + offset,
  /** The instance that takes only Sovereign sign-in (`e2e/sovereign.spec.ts`). */
  sovereign: 3995 + offset,
  /** The fake Sovereign: the OIDC provider, and the control port a test says who signs in next on. */
  coreAuth: 3190 + offset,
  coreControl: 3191 + offset,
} as const;
