import { Landing } from '@/src/landing/Landing';
import { site } from '@/src/site';
import { AppShell } from '@/src/ui/AppShell';

// The front address (DESIGN.md §26.5). For a visitor, this page; for someone with a session cookie, the proxy has already rewritten the request to the
// app (`/home`, which opens on the cards) before it gets here, and the address stays `/`.
export default function Front() {
  return (
    <AppShell name={site.name}>
      <Landing />
    </AppShell>
  );
}
