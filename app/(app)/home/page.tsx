import { requireAccount } from '@/src/auth/session';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  await requireAccount();
  return <p style={{ padding: 'var(--sv-space-6)' }}>Home</p>;
}
