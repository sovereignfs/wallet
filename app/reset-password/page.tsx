import { notFound } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { ResetForm } from '@/src/auth/screens/ResetForm';
import { authSettings, mailAvailable } from '@/src/auth/server';
import { resetAddress } from '@/src/auth/reset';

// Choosing a new password with the link that was sent, or that an operator made (`wallet-admin accounts reset-link`), which needs no mail. The token is in the
// address and is good once; the new password is derived with the address it belongs to. Only a standalone instance has passwords to reset.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const settings = authSettings();
  if (!settings?.local) notFound();
  const { token } = await searchParams;
  const given = typeof token === 'string' ? token : '';
  return (
    <AuthShell title="Choose a new password">
      <ResetForm
        minLength={settings.passwordMinLength}
        token={given}
        email={given ? await resetAddress(given) : null}
        canAskAgain={mailAvailable()}
      />
    </AuthShell>
  );
}
