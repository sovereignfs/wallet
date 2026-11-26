'use client';

import { useState } from 'react';
import { signUp, signUpProblem } from '@sovereignfs/auth/client';
import { SignUpForm as Form, type SignUpValues } from '@sovereignfs/ui';
import { kitPath } from '../../keys/vault-client';
import { arrive } from '../../keyring/resume';
import { authClient, currentVault, deriveForSignIn } from '../client';
import { passwordPolicy } from '../policy';

/**
 * Name, email and password, on the design system's form and `@sovereignfs/auth`'s sign-up (auth.md §7): the password is checked against the
 * policy here, since the server only sees the sign-in value made from it. Without mail there is nothing to confirm, so the account is made
 * and the person is signed in; with mail the form waits for the link.
 */
export function SignUpForm({ minLength }: { minLength: number }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | undefined>();
  const policy = passwordPolicy(minLength);

  async function onSubmit(values: SignUpValues) {
    const problem = signUpProblem({ ...values, policy });
    if (problem) return setError(problem);
    setPending(true);
    setError(undefined);
    const result = await signUp(authClient, deriveForSignIn, { ...values, callbackURL: '/' });
    if (result.outcome === 'signed-in') {
      // The keys are made now, from the same password, and the recovery kit is shown before anything else (RFC 0001).
      await (await currentVault()).afterSignIn(result.secret).catch(() => undefined);
      arrive();
      return window.location.assign(kitPath());
    }
    setPending(false);
    if (result.outcome === 'waiting') setWaitingFor(values.email);
    else if (result.outcome === 'refused') setError(result.message);
    else setError('This page could not get ready. Reload it and try again.');
  }

  return (
    <Form
      appName="Wallet"
      passwordHint={`At least ${minLength} characters.`}
      error={error}
      pending={pending}
      waitingFor={waitingFor}
      onSubmit={(values) => void onSubmit(values)}
      signInHref="/sign-in"
    />
  );
}
