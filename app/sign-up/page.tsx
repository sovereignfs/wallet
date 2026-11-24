import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { SignUpForm } from '@/src/auth/screens/SignUpForm';
import { authSettings, signUpAvailable } from '@/src/auth/server';
import { getSession } from '@/src/auth/session';
import { SuitePage } from '@/src/auth/suite-page';
import { AuthLink } from '@sovereignfs/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const settings = authSettings();
  // Suite mode: an account is made at core, so this page sends the browser there, asking for its sign-up (`prompt=create`, DESIGN.md §25.1).
  if (settings?.sovereign) return <SuitePage query={await searchParams} prompt="create" />;
  if (!settings?.local) notFound();
  if (await getSession()) redirect('/');

  if (!(await signUpAvailable())) {
    return (
      <AuthShell
        title="Sign-up is closed"
        lead="Wallet is not taking new accounts. If you have one, sign in; otherwise ask whoever runs this instance."
        footer={<AuthLink href="/sign-in">Go to sign in</AuthLink>}
        footerAlign="start"
      />
    );
  }

  return (
    <AuthShell title="Create your account">
      <SignUpForm minLength={settings.passwordMinLength} />
    </AuthShell>
  );
}
