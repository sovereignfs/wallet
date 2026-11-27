import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { SignInForm } from '@/src/auth/screens/SignInForm';
import { authSettings, mailAvailable, signUpAvailable } from '@/src/auth/server';
import { getSession } from '@/src/auth/session';
import { SuitePage } from '@/src/auth/suite-page';

// Decided per request from the settings and the visitor's cookies. Left to Next it would be prerendered at build time, with no settings, as the
// "off" 404 it would then keep.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const settings = authSettings();
  if (!settings) notFound();
  // Suite mode: through core only, so this page sends the browser there (DESIGN.md §25.1).
  if (settings.sovereign) return <SuitePage query={await searchParams} />;
  if (!settings.local) notFound();
  if (await getSession()) redirect('/');
  return (
    <AuthShell title="Sign in to Wallet">
      <SignInForm canSignUp={await signUpAvailable()} canReset={mailAvailable()} />
    </AuthShell>
  );
}
