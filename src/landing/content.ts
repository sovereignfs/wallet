/**
 * What the landing page says (DESIGN.md §26.5). Plain sentences, in the words of DESIGN.md §4: "wallet", "entry", "card", "wallet key", "only you
 * can read it". Never "vault", "E2EE", "client" or "tenant". No third-party content, and nothing here is loaded from elsewhere.
 */
export const landing = {
  heading: 'Only you can read your wallet',
  lead: 'The cards in your pocket, in one place, locked with a key only you hold. Not us, not the server, not whoever runs it.',
  signIn: 'Sign in',
  signUp: 'Create an account',
  noSignIn: 'Signing in is not set up on this server.',
  features: [
    {
      title: 'Locked in your browser',
      body: 'Everything is encrypted on your device before it leaves it. The server keeps scrambled bytes it cannot open, and nobody can recover your wallet if you lose your key.',
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
