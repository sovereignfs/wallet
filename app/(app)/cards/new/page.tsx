import { requireAccount } from '@/src/auth/session';
import { NewCard } from '@/src/screens/NewCard';

export const metadata = { title: 'Add a card' };

export default async function NewCardPage() {
  await requireAccount();
  return <NewCard />;
}
