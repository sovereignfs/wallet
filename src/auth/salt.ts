/**
 * The document the page reads before it derives the sign-in value, `/api/sign-in-salt` (auth.md §4, rule 1): the instance's vault id, which is the salt, and
 * whether a password stored before the package can still move. Anyone may ask for it, signed in or not, and each ask used to be two reads of the database.
 *
 *  - **The vault id is made once and never changes**, so it is read once and kept.
 *  - **`moving` can only go from true to false** while a process runs: the marks that make it true are put on at the first start after an upgrade, and are
 *    taken off by a move or by their time running out. So a `false` is kept for a minute and then read again, which also covers a second process that
 *    started a moment before the first marked them; and **a `true` is never kept**, because a stale one would have the page send a password it need not
 *    (DESIGN.md §25.1), and it is a read only while a window is open.
 *
 * A failed read is not kept: the next ask tries again.
 */
export interface SaltDocument {
  readonly vaultId: string;
  readonly moving: boolean;
}

export interface SaltSource {
  vaultId(): Promise<string>;
  moving(): Promise<boolean>;
  now(): number;
}

/** How long a "no password can move" is believed. */
export const NOT_MOVING_FOR_MS = 60_000;

export function cachedSalt(source: SaltSource): () => Promise<SaltDocument> {
  let vaultId: string | undefined;
  let notMovingUntil = 0;
  return async () => {
    vaultId ??= await source.vaultId();
    if (source.now() < notMovingUntil) return { vaultId, moving: false };
    const moving = await source.moving();
    notMovingUntil = moving ? 0 : source.now() + NOT_MOVING_FOR_MS;
    return { vaultId, moving };
  };
}
