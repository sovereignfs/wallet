/**
 * Where core's own pages are (DESIGN.md §25.1), which Settings links to in suite mode: Wallet copies none of core's profile, security or account pages.
 * Taken from Shopper's `src/auth/core-links.ts`, without its picture of the person: Wallet shows initials.
 */

/** An address on core: `core` is its origin (`WALLET_CORE_URL`, no path), `path` one of its pages (`/profile`, `/security`, `/delete-account`). */
export const coreLink = (core: string, path: string): string => new URL(path, core).href;
