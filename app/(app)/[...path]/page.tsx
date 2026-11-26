import { notFound } from 'next/navigation';
import { requireAccount } from '@/src/auth/session';
import { AppRoutes } from '@/src/screens/AppRoutes';
import { addressOf } from '@/src/screens/addresses';

/**
 * Every address of the signed-in area (DESIGN.md §26.5): the cards (`/`, which the proxy shows from `/home`, and `/cards`), setup, a card, showing it, and
 * Settings. The server checks the address and the session and renders this one page; **which screen it is, is chosen in the browser from the address**
 * (`AppRoutes`), so that moving between them never asks the server and works with no connection. The server has nothing it could say about whether a card is
 * there. An address that is none of these is a 404 for everyone, before anyone is asked who they are.
 */
export default async function AppPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!addressOf(`/${path.join('/')}`)) notFound();
  await requireAccount();
  return <AppRoutes />;
}
