import { requireAccount } from '@/src/auth/session';
import { SettingsScreen } from '@/src/screens/SettingsScreen';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireAccount();
  return <SettingsScreen />;
}
