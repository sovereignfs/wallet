import { requireAccount } from '@/src/auth/session';
import { CardsScreen } from '@/src/screens/CardsScreen';

export const metadata = { title: 'Cards' };

export default async function CardsPage() {
  await requireAccount();
  return <CardsScreen />;
}
