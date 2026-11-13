import { notFound } from 'next/navigation';
import { requireAccount } from '@/src/auth/session';
import { isUuid } from '@/src/core/entries/types';
import { CardScreen } from '@/src/screens/CardScreen';

export const metadata = { title: 'Card' };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccount();
  const { id } = await params;
  // An address that is not an entry's id is not found; the page cannot say more, since the server knows nothing of what a card is.
  if (!isUuid(id)) notFound();
  return <CardScreen id={id} />;
}
