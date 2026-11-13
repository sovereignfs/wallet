'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AccountMenu } from '../auth/screens/AccountMenu';
import { rememberIdentity } from '../identity';
import { site } from '../site';
import { AppShell } from '../ui/AppShell';
import { RegisterWorker } from './RegisterWorker';

/**
 * The frame of everything for someone who is signed in (DESIGN.md §26.2). The server's layout makes it with who is signed in, and the offline shell makes
 * it with who the device remembers. It remembers the person on the device (`rememberIdentity`), so that the shell can open for them with no server to ask.
 */
export function SignedInArea({
  accountId,
  name,
  email,
  children,
}: {
  accountId: string;
  name: string;
  email: string;
  children: ReactNode;
}) {
  useEffect(() => rememberIdentity({ id: accountId, name, email }), [accountId, name, email]);
  return (
    <AppShell name={site.name} account={<AccountMenu name={name} email={email} />}>
      <RegisterWorker />
      {children}
    </AppShell>
  );
}
