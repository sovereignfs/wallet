import type { Metadata } from 'next';
import { OfflineApp } from '@/src/screens/OfflineApp';

export const metadata: Metadata = { title: 'Wallet', robots: { index: false, follow: false } };

/**
 * The one page the service worker keeps (DESIGN.md §26.6), answered for an address of the signed-in area when there is no network. **It holds nothing of a
 * person** and asks nothing of the session: it is the same for everyone, and is the page the app starts from on a device with no server to ask. Who is signed
 * in is found on the device, in the browser (`OfflineApp`), and the wallet is locked until it is unlocked.
 */
export default function ShellPage() {
  return <OfflineApp />;
}
