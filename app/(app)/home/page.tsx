import { requireAccount } from '@/src/auth/session';
import { HomeScreen } from '@/src/screens/HomeScreen';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  await requireAccount();
  return <HomeScreen />;
}
