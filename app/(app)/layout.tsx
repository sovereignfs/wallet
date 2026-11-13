import type { ReactNode } from 'react';
import { requireSession } from '@/src/auth/session';
import { SignedInArea } from '@/src/screens/SignedInArea';

// Everything for someone who is signed in (DESIGN.md §26.2): the session is checked here, and the composition is `SignedInArea`, which the offline shell
// makes too. The server renders nothing of a wallet, since it has nothing it could open.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <SignedInArea accountId={session.user.id} name={session.user.name} email={session.user.email}>
      {children}
    </SignedInArea>
  );
}
