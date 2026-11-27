/**
 * What the landing page says (DESIGN.md §26.5). Plain sentences, in the words of DESIGN.md §4: "wallet", "entry", "card", "recovery kit". Never "vault",
 * "E2EE", "client" or "tenant", and never a promise that nobody can read what is kept (DESIGN.md §8.6): it is encrypted in the browser, and not yet audited. No third-party content, and nothing here is loaded from elsewhere.
 */
export const landing = {
  heading: 'Your wallet, locked in your browser',
  lead: 'The cards in your pocket, in one place, encrypted on your device before they go anywhere. The server stores bytes it has no key for. Not yet independently audited.',
  signIn: 'Sign in',
  signInSuite: 'Sign in with Sovereign',
  signUp: 'Create an account',
  noSignIn: 'Signing in is not set up on this server.',
  features: [
    {
      title: 'Locked in your browser',
      body: 'Everything is encrypted on your device before it leaves it, with keys that stay in your browser. Keep your recovery kit: it is the way back if you forget your password.',
    },
    {
      title: 'Open at the till, offline',
      body: 'Unlock with your fingerprint or face, tap a card, and its code fills the screen, with no signal at all.',
    },
    {
      title: 'Yours alone, or part of your instance',
      body: 'Wallet runs on its own, or on a Sovereign instance you already use, signed in the same way as your other apps.',
    },
  ],
} as const;
