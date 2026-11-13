import { requireAccount } from '@/src/auth/session';
import { AppRoutes } from '@/src/screens/AppRoutes';

/**
 * Every address of the signed-in area (DESIGN.md §26.5): Home (`/`, which the proxy shows from `/home`), setup, the cards, a card, showing it, and
 * Settings. The server checks the session and renders this one page; **which screen it is, is chosen in the browser from the address** (`AppRoutes`), so that
 * moving between them never asks the server and works with no connection. The server has nothing it could say about whether a card is there.
 */
export default async function AppPage() {
  await requireAccount();
  return <AppRoutes />;
}
