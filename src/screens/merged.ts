import type { Body, Shape } from '../core/entries';
import type { Merged, Wallet } from '../local/wallet';

/**
 * Undo for a merge that kept this device's value over another's (DESIGN.md §11.5): the other device's value is written back, as an ordinary change, so
 * that it goes to the server and every device like any edit.
 */
export async function restoreOther(wallet: Wallet | null, merged: Merged): Promise<void> {
  if (!wallet) return;
  const entry = await wallet.loadBody(merged.entryId);
  if (!entry) return;
  const shape = { ...entry.shape } as Record<string, unknown>;
  const body = entry.body ? ({ ...entry.body } as Record<string, unknown>) : null;
  for (const clash of merged.clashes) {
    if (clash.part === 'shape') shape[clash.field] = clash.theirs;
    else if (body) body[clash.field] = clash.theirs;
  }
  await wallet.update(merged.entryId, shape as unknown as Shape, body as unknown as Body | null);
}
