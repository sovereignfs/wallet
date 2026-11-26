import { redirect } from 'next/navigation';
import { requireAccount } from '@/src/auth/session';
import { AuthShell } from '@/src/auth/screens/AuthShell';
import { KitScreen } from '@/src/keys/KitScreen';
import { keySource } from '@/src/keys/server/source';

// The recovery kit, once, after the keys are made (RFC 0001). An instance that runs alone has it; hosted, the kit is core's.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your recovery kit' };

export default async function KitPage() {
  await requireAccount();
  const source = await keySource();
  if (source?.kind !== 'vault') redirect('/');
  return (
    <AuthShell title="Keep your recovery kit">
      <KitScreen vaultId={source.vaultId} />
    </AuthShell>
  );
}
