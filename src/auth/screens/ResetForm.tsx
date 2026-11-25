'use client';

import { useState } from 'react';
import { resetPassword } from '@sovereignfs/auth/client';
import { AuthNotice, AuthLink, ResetPasswordForm } from '@sovereignfs/ui';
import { authClient, signInValue } from '../client';
import { passwordPolicy } from '../policy';

/**
 * Chooses a new password with the token from the link, on the design system's form: the new password is sent as the sign-in value made with
 * the address the link was sent to, which the page found from the token (`src/auth/reset.ts`). The link is good once; using it ends every
 * other session of the account.
 */
export function ResetForm({
  minLength,
  token,
  email,
  canAskAgain,
}: {
  minLength: number;
  token: string;
  /** The address the link was sent to, or nothing for a link that is not, or no longer, good. */
  email: string | null;
  /** Whether a new link can be asked for (the instance sends mail). Without, whoever runs the instance makes one. */
  canAskAgain: boolean;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(email === null);
  const [done, setDone] = useState(false);

  async function onSubmit(values: { password: string; confirm: string }) {
    if (!email) return setExpired(true);
    setPending(true);
    setError(undefined);
    const result = await resetPassword(authClient, signInValue, {
      ...values,
      address: email,
      token,
      policy: passwordPolicy(minLength),
    });
    setPending(false);
    if (result.outcome === 'done') setDone(true);
    else if (result.outcome === 'expired') setExpired(true);
    else setError(result.message);
  }

  if (done)
    return (
      <AuthNotice>
        Your password is changed, and you are signed out everywhere else.{' '}
        <AuthLink href="/sign-in">Sign in</AuthLink>
      </AuthNotice>
    );
  // The form's own words for a link that is gone offer to ask for another, which an instance with no mail cannot send.
  if (expired && !canAskAgain)
    return (
      <>
        <AuthNotice tone="warning">
          This link has expired or was already used. A link works once, for an hour. Ask whoever
          runs this instance for a new one.
        </AuthNotice>
        <AuthLink href="/sign-in">Back to sign in</AuthLink>
      </>
    );
  return (
    <ResetPasswordForm
      passwordHint={`At least ${minLength} characters.`}
      error={error}
      expired={expired}
      pending={pending}
      onSubmit={(values) => void onSubmit(values)}
      signInHref="/sign-in"
      newLinkHref="/forgot-password"
    />
  );
}
