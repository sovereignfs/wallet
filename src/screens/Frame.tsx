'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@sovereignfs/ui';
import styles from './Frame.module.css';

const LINKS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: '/', label: 'Home', icon: 'house', match: (p) => p === '/' || p === '/home' },
  { href: '/cards', label: 'Cards', icon: 'credit-card', match: (p) => p.startsWith('/cards') },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings',
    match: (p) => p.startsWith('/settings'),
  },
];

/** Where a person goes (DESIGN.md §26.2): Home, Cards and Settings; documents and health arrive with their releases. */
export function Frame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/';
  return (
    <div className={styles.frame}>
      <nav className={styles.nav} aria-label="Wallet">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={styles.link}
            aria-current={link.match(path) ? 'page' : undefined}
          >
            <Icon name={link.icon} size="md" aria-hidden />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
