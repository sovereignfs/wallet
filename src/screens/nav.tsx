'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type AnchorHTMLAttributes, type MouseEvent, useMemo } from 'react';

/**
 * Moving between screens (DESIGN.md §26.6). **It never asks the server:** a screen is chosen from the address by `AppRoutes`, and going to another is the
 * browser's own history (`pushState`), which Next's router follows (`usePathname`, `useSearchParams` change with it). So moving about works with no network,
 * and **never reloads the page**, which would lock the wallet, since its keys are in memory only. A real load happens only for a first visit, a reload and
 * what leaves the app (signing out).
 */
export { usePathname, useSearchParams };

function go(href: string, mode: 'push' | 'replace'): void {
  if (mode === 'push') window.history.pushState(null, '', href);
  else window.history.replaceState(null, '', href);
}

export interface Navigator {
  push(href: string): void;
  replace(href: string): void;
}

export function useRouter(): Navigator {
  return useMemo(
    () => ({ push: (href) => go(href, 'push'), replace: (href) => go(href, 'replace') }),
    [],
  );
}

/** An address of this app: a path, never another origin and never `//host`. */
const isInternal = (href: string) => href.startsWith('/') && !href.startsWith('//');

export function Link({
  href,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        // A click that means something else (a new tab, a download, another origin) is the browser's.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target === '_blank' ||
          !isInternal(href)
        )
          return;
        event.preventDefault();
        go(href, 'push');
        window.scrollTo?.(0, 0);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
