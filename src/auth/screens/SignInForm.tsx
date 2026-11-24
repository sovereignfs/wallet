'use client';

import { useEffect, useState } from 'react';
import {
  emailRequestProblem,
  passkeyProblem,
  signInWithPasskey,
  signInWithPassword,
  verifySecondStep,
} from '@sovereignfs/auth/client';
import {
  AuthButton,
  AuthError,
  AuthNotice,
  SignInForm as Form,
  TwoFactorForm,
} from '@sovereignfs/ui';
import { authClient, deriveForSignIn, passwordMoves } from '../client';

/**
 * Email and password, for a standalone instance (DESIGN.md §25.1): the design system's forms on `@sovereignfs/auth`'s flows (auth.md §7). In suite
 * mode there is no form: `/sign-in` sends the browser to core (`src/auth/suite-page.tsx`). The password never leaves the browser: what is sent is the
 * sign-in value made from it, except once to move a password Wallet stored before (`passwordMoves`). No message says whether an address has an account.
 */
export function SignInForm({ canSignUp, canReset }: { canSignUp: boolean; canReset: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [secondStep, setSecondStep] = useState(false);
  const [over, setOver] = useState(false);
  // Known only in the browser, so it is read after the first render, never during it.
  const [passkeys, setPasskeys] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  useEffect(() => setPasskeys(typeof window.PublicKeyCredential === 'function'), []);

  // A full navigation, not a client-side one: `/` is a different page now that there is a session, and the server decides which.
  const signedIn = () => window.location.assign('/');

  async function onPassword(values: { email: string; password: string }) {
    setPending(true);
    setError(undefined);
    setUnverified(false);
    const result = await signInWithPassword(
      authClient,
      deriveForSignIn,
      values,
      undefined,
      passwordMoves,
    );
    if (result.outcome === 'signed-in') return signedIn();
    setPending(false);
    if (result.outcome === 'second-step') setSecondStep(true);
    else if (result.outcome === 'unverified') setUnverified(true);
    else if (result.outcome === 'refused') setError(result.message);
    else if (result.outcome === 'not-ready')
      setError('This page could not get ready to sign you in. Reload it and try again.');
    else setError('Signing in did not work. Try again.');
  }

  async function onPasskey() {
    setPasskeyPending(true);
    setError(undefined);
    const result = await signInWithPasskey(authClient);
    if (!result.error) return signedIn();
    setPasskeyPending(false);
    setError(passkeyProblem(result.error));
  }

  async function onCode(values: { code: string; backup: boolean }) {
    setPending(true);
    setError(undefined);
    const result = await verifySecondStep(authClient, values);
    if (result.outcome === 'signed-in') return signedIn();
    setPending(false);
    if (result.outcome === 'over') setOver(true);
    else if (result.outcome === 'refused') setError(result.message);
    else setError('The code could not be checked. Try again.');
  }

  const passkey = passkeys
    ? { pending: passkeyPending, onClick: () => void onPasskey() }
    : undefined;

  if (secondStep)
    return (
      <TwoFactorForm
        error={error}
        pending={pending}
        over={over}
        passkey={passkey}
        onSubmit={(values) => void onCode(values)}
        onModeChange={() => setError(undefined)}
        signInAgainHref="/sign-in"
      />
    );

  return (
    <Form
      appName="Wallet"
      error={error}
      pending={pending}
      unverified={unverified}
      renderUnverified={(email) => <SendAgain email={email} />}
      passkey={passkey}
      onSubmit={(values) => void onPassword(values)}
      forgotPasswordHref={canReset ? '/forgot-password' : undefined}
      signUpHref={canSignUp ? '/sign-up' : undefined}
    />
  );
}

/** Sends the verification link again, for an address whose password was right and which is not verified yet. */
function SendAgain({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  if (sent) return <AuthNotice>A new link is on its way to {email}.</AuthNotice>;

  async function send() {
    setSending(true);
    setProblem(undefined);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/' });
    setSending(false);
    if (!error) setSent(true);
    else setProblem(emailRequestProblem(error) ?? 'The link could not be sent. Try again.');
  }

  return (
    <>
      {problem ? <AuthError>{problem}</AuthError> : null}
      <AuthButton variant="secondary" loading={sending} onClick={() => void send()}>
        Send the link again
      </AuthButton>
    </>
  );
}
