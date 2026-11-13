import { requireAccount } from '@/src/auth/session';

export const metadata = { title: 'Set up your wallet' };

/** The setup itself is drawn by the signed-in frame, which knows whether the wallet has a vault (`src/screens/SignedInArea.tsx`): this is its address. */
export default async function SetupPage() {
  await requireAccount();
  return null;
}
