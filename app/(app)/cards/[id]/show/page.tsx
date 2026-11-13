import { notFound } from 'next/navigation';
import { requireAccount } from '@/src/auth/session';
import { isUuid } from '@/src/core/entries/types';
import { ShowCard } from '@/src/screens/ShowCard';

export const metadata = { title: 'Show card' };

export default async function ShowCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccount();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <ShowCard id={id} />;
}
