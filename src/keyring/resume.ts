import type { LockTimers } from './keyring';

/**
 * Whether a page that was reloaded may open the wallet again without asking (DESIGN.md §9.2). **No key is kept for this.** What brings the wallet back is the
 * suite's key, which the SDK keeps for the session and which only opens with the server; what is kept here is **when the wallet was last used and when its page
 * was left**, two times in `sessionStorage`, which a reload of the tab keeps and closing the tab lets go.
 *
 * It errs toward locking: a time that is missing, unreadable, from the future or past either lock time means locked.
 */
export interface Mark {
  /** When the wallet was last used while it was unlocked. */
  readonly used: number;
  /** When its page was left (hidden, reloaded), if the page said so. */
  readonly left?: number;
}

/** The hidden lock's own time (`'1m'`), as the keyring counts it. */
export const HIDDEN_MS = 60_000;
/** How long after proving the account (signing in, Sovereign's release) the wallet goes on to open without asking again: long enough to keep a recovery kit. */
export const ARRIVAL_MS = 15 * 60_000;

/** Whether the lock times set on this device have neither of them run out. */
export function stillOpen(mark: Mark, timers: LockTimers, now: number): boolean {
  // "As soon as it is hidden": a page that was reloaded was hidden.
  if (timers.hidden === 'now') return false;
  const unused = now - mark.used;
  if (!(unused >= 0 && unused < timers.idleMinutes * 60_000)) return false;
  if (timers.hidden === 'never') return true;
  // Away since the page was left; for a page that went without saying so (a crash), since it was last used.
  const away = now - (mark.left ?? mark.used);
  return away >= 0 && away < HIDDEN_MS;
}

const ARRIVED = 'wallet.arrived';
const markKey = (accountId: string) => `wallet.open.${accountId}`;

/** The tab's storage, doing nothing where the browser refuses it: the wallet then asks after a reload, which is the safe way round. */
function read(key: string): string | null {
  try {
    return globalThis.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.sessionStorage.removeItem(key);
    else globalThis.sessionStorage.setItem(key, value);
  } catch {
    // Nothing is kept, so nothing is resumed.
  }
}

export function readMark(accountId: string): Mark | undefined {
  try {
    const value: unknown = JSON.parse(read(markKey(accountId)) ?? 'null');
    if (typeof value !== 'object' || value === null) return undefined;
    const { used, left } = value as Record<string, unknown>;
    if (typeof used !== 'number' || (left !== undefined && typeof left !== 'number'))
      return undefined;
    return left === undefined ? { used } : { used, left };
  } catch {
    return undefined;
  }
}
/** **Only while the wallet is unlocked** may this be written: a locked screen that refreshed it would earn a reload it has no right to. */
export const writeMark = (accountId: string, mark: Mark): void =>
  write(markKey(accountId), JSON.stringify(mark));
export const clearMark = (accountId: string): void => write(markKey(accountId), null);

/** The person has just proved the account in this tab. */
export const arrive = (now: number = Date.now()): void => write(ARRIVED, String(now));
export function arrived(now: number = Date.now()): boolean {
  const since = now - Number(read(ARRIVED) ?? Number.NaN);
  return since >= 0 && since < ARRIVAL_MS;
}
export const clearArrival = (): void => write(ARRIVED, null);

/** At a lock, at sign-out and when the account is deleted: nothing is left that would open the wallet without being asked. */
export function forgetResume(accountId: string): void {
  clearMark(accountId);
  clearArrival();
}
