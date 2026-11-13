import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

/**
 * The frame of a page before sign-in, and of the pages that are not the wallet itself (not found, an error): a header row with the wordmark and
 * the main area. The signed-in area has its own frame (`src/screens/SignedInArea.tsx`: side navigation, the lock, search and the phone's footer).
 *
 * The wordmark is set in the design system's typeface (a page may not name another, and may not fetch one), heavy and tight; a screen reader says
 * the name.
 */
export function AppShell({
  name,
  toolbar,
  bell,
  account,
  footer,
  children,
}: {
  name: string;
  /** What goes before the wordmark. */
  toolbar?: ReactNode;
  /** The bell, at the right of the header (after 0.1.0). */
  bell?: ReactNode;
  /** The person's avatar menu, at the right of the header. */
  account?: ReactNode;
  /** The phone's footer. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    // `sv-app-shell` is where the design system's footer publishes its height (`--sv-shell-footer-height`), so that sheets and dialogs clear it.
    <div id="sv-app-shell" className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.lead}>
          {toolbar}
          <a href="/" className={styles.brand} aria-label={name}>
            <span className={styles.wordmark} aria-hidden>
              wallet.
            </span>
          </a>
        </div>
        <div className={styles.actions}>
          {bell}
          {account}
        </div>
      </header>
      <div className={styles.main}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </div>
  );
}
