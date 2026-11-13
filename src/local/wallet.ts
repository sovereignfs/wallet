import { type Body, type Shape, parseBody, parseShape } from '../core/entries';
import { fromBase64Url, toBase64Url } from '../core/encoding';
import { merge } from '../core/sync/merge';
import {
  MAX_MUTATIONS,
  type MutationWire,
  PROTOCOL_VERSION,
  type Refusal,
  type RowWire,
} from '../core/sync/protocol';
import { createEntryKey, seal } from '../core/vault';
import type { Keyring } from '../keyring/keyring';
import type { LocalDatabase, OutboxItem, RefusedItem } from './db';
import { type Opened, openSealed, sealedOfRow } from './open';
import * as store from './store';
import type { Transport } from './transport';

/**
 * The wallet as a screen sees it (DESIGN.md §11.1): the device's store, opened into an in-memory index while the keyring is unlocked, with **the one path
 * every write goes through** (`put`, `remove`: validate, seal, write the outbox in one transaction) and the sync that sends it and takes what the server
 * has. Locking empties the index; **sync runs while locked** (the store is ciphertext), except for merging a stale edit, which needs the keys and waits.
 *
 * A write never waits for the network: it is on the device when the call returns, and the loop sends it.
 */
export interface OpenEntry {
  readonly id: string;
  readonly shape: Shape;
  /** The body, or null when the entry has none or it has not been opened yet (`bodyLoaded`). */
  readonly body: Body | null;
  readonly bodyLoaded: boolean;
  /** The version the server has that this device knows of. */
  readonly version: number;
  /** Whether the device has changes the server has not answered. */
  readonly pending: boolean;
}

/** An entry that is held and cannot be opened (a value from a newer version, or one that was damaged). It is kept, and said so. */
export interface Unopened {
  readonly id: string;
  readonly reason: 'unreadable' | 'newer';
}

export interface Merged {
  readonly entryId: string;
  /** Fields of the shape or body where both sides changed and this device's was kept; `theirs` is the other, for Undo. */
  readonly clashes: readonly { part: 'shape' | 'body'; field: string; theirs: unknown }[];
}

export type SyncOutcome =
  | {
      readonly status: 'ok';
      readonly applied: number;
      readonly refused: number;
      readonly pulled: number;
    }
  | { readonly status: 'offline' | 'unauthorized' | 'update' | 'failed' };

export interface WalletOptions {
  readonly accountId: string;
  readonly db: LocalDatabase;
  readonly keyring: Keyring;
  readonly transport: Transport;
  readonly now?: () => number;
  /** Called when a stale edit was merged and this device's value won a clash, for the toast with Undo. */
  readonly onMerged?: (merged: Merged) => void;
  /** Called after a write, to ask the loop to sync soon. */
  readonly onChange?: () => void;
}

/** A model the screen made is not one the format takes. The sentence is for the person. */
export class InvalidEntry extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'InvalidEntry';
  }
}

export class Wallet {
  readonly accountId: string;
  private readonly db: LocalDatabase;
  private readonly keyring: Keyring;
  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly options: WalletOptions;
  private opened = new Map<string, OpenEntry>();
  private unopened = new Map<string, Unopened>();
  private snapshot: readonly OpenEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private syncing: Promise<SyncOutcome> | undefined;
  private generation = 0;

  constructor(options: WalletOptions) {
    this.options = options;
    this.accountId = options.accountId;
    this.db = options.db;
    this.keyring = options.keyring;
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.keyring.subscribe((state) => {
      if (state === 'locked') this.clear();
      else void this.load();
    });
  }

  // ---- what a screen reads ----

  /** Every entry that is open, in no particular order. A new array each time something changes, so that a screen can compare it. */
  getSnapshot = (): readonly OpenEntry[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(id: string): OpenEntry | undefined {
    return this.opened.get(id);
  }

  unopenedEntries(): readonly Unopened[] {
    return [...this.unopened.values()];
  }

  private publish(): void {
    this.snapshot = [...this.opened.values()];
    for (const listener of [...this.listeners]) listener();
  }

  // ---- opening ----

  /** Opens every shape the device holds, then every body, into the index. Called when the wallet unlocks. */
  async load(): Promise<void> {
    if (this.keyring.state !== 'unlocked') return;
    const generation = ++this.generation;
    const rows = await store.allRows(this.db);
    const ids = new Set([
      ...rows.map((r) => r.id),
      ...(await store.outboxItems(this.db)).map((i) => i.mutation.entryId),
    ]);
    const next = new Map<string, OpenEntry>();
    const failed = new Map<string, Unopened>();
    for (const id of ids) {
      const result = await this.effective(id, false);
      // The wallet locked, or locked and unlocked again, while this was going: the newer load has it.
      if (generation !== this.generation) return;
      if (result === 'gone' || result === undefined) continue;
      if ('reason' in result) failed.set(id, result);
      else next.set(id, result);
    }
    this.opened = next;
    this.unopened = failed;
    this.publish();
    // Bodies, in the background: a list needs shapes only, and a body is opened when its entry is.
    for (const entry of [...next.values()]) {
      if (generation !== this.generation) return;
      await this.loadBody(entry.id);
    }
  }

  /** Opens an entry's body, if it has one and it is not open. */
  async loadBody(id: string): Promise<OpenEntry | undefined> {
    const held = this.opened.get(id);
    if (!held || held.bodyLoaded) return held;
    const result = await this.effective(id, true);
    if (result === 'gone' || result === undefined || 'reason' in result) return held;
    if (this.keyring.state !== 'unlocked') return held;
    this.opened.set(id, result);
    this.publish();
    return result;
  }

  /** The entry as the device sees it: the server's row with this device's unsent changes laid over it. */
  private async effective(
    id: string,
    withBody: boolean,
  ): Promise<OpenEntry | Unopened | 'gone' | undefined> {
    if (this.keyring.state !== 'unlocked') return undefined;
    const row = await store.rowOf(this.db, id);
    const pending = await store.pendingFor(this.db, id);
    const last = pending.at(-1);
    if (last?.mutation.op === 'delete') return 'gone';
    let sealed = row && row.deletedAt === null ? sealedOfRow(row) : undefined;
    if (last?.mutation.op === 'put')
      sealed = {
        id,
        wrappedKey: last.mutation.wrappedKey ?? '',
        shape: last.mutation.shape ?? null,
        body: last.mutation.body ?? null,
      };
    if (!sealed) return 'gone';
    const opened: Opened = await openSealed(this.accountId, this.keyring, sealed, withBody);
    if (!opened.ok) return { id, reason: opened.reason };
    return {
      id,
      shape: opened.shape,
      body: opened.body,
      bodyLoaded: withBody || sealed.body === null,
      version: row?.version ?? 0,
      pending: pending.length > 0,
    };
  }

  /** Recomputes one entry in the index from the store. */
  private async refresh(id: string): Promise<void> {
    const keepBody = this.opened.get(id)?.bodyLoaded ?? true;
    const result = await this.effective(id, keepBody);
    if (this.keyring.state !== 'unlocked') return;
    if (result === 'gone' || result === undefined) {
      this.opened.delete(id);
      this.unopened.delete(id);
    } else if ('reason' in result) {
      this.opened.delete(id);
      this.unopened.set(id, result);
    } else {
      this.unopened.delete(id);
      this.opened.set(id, result);
    }
    this.publish();
  }

  /** Locking: nothing opened stays. */
  clear(): void {
    this.generation++;
    this.opened = new Map();
    this.unopened = new Map();
    this.publish();
  }

  // ---- the one path every write goes through ----

  /** Makes an entry. Returns its id. Refuses what the format does not take, with a sentence. */
  async create(shape: Shape, body: Body | null, id: string = crypto.randomUUID()): Promise<string> {
    await this.write(id, shape, body, true);
    return id;
  }

  async update(id: string, shape: Shape, body: Body | null): Promise<void> {
    await this.write(id, shape, body, false);
  }

  /**
   * Validates, seals, and writes the outbox in one transaction, then the index. `shape` and `body` are the whole entry: a put replaces both, so a caller
   * that changes one passes the other as it was.
   */
  private async write(id: string, shape: Shape, body: Body | null, isNew: boolean): Promise<void> {
    const checkedShape = parseShape(shape);
    if (!checkedShape.ok) throw new InvalidEntry(checkedShape.reason);
    let checkedBody: Body | null = null;
    if (body !== null) {
      const parsed = parseBody(checkedShape.value.kind, body);
      if (!parsed.ok) throw new InvalidEntry(parsed.reason);
      checkedBody = parsed.value;
    }
    const vault = this.keyring.vaultKey;
    const row = await store.rowOf(this.db, id);
    const pending = await store.pendingFor(this.db, id);
    const last = pending.at(-1);

    let wrappedKey: string;
    let keys;
    if (isNew) {
      if (row || last) throw new InvalidEntry('That entry already exists.');
      const made = await createEntryKey(vault, this.accountId, id);
      wrappedKey = toBase64Url(made.wrapped);
      keys = made.keys;
      this.keyring.rememberEntryKeys(id, keys);
    } else {
      // The key of the latest change that carries one (a delete carries none), or the server's row.
      const lastPut = [...pending].reverse().find((item) => item.mutation.wrappedKey);
      wrappedKey = lastPut?.mutation.wrappedKey ?? row?.wrappedKey ?? '';
      const bytes = fromBase64Url(wrappedKey);
      if (!bytes) throw new InvalidEntry('That entry is not here.');
      keys = await this.keyring.entryKeys(id, bytes);
    }
    const sealedShape = await seal(keys.aes, 'shape', this.accountId, id, checkedShape.value);
    const sealedBody = checkedBody
      ? await seal(keys.aes, 'body', this.accountId, id, checkedBody)
      : undefined;

    const mutation: MutationWire = {
      id: crypto.randomUUID(),
      op: 'put',
      entryId: id,
      baseVersion: last ? last.mutation.baseVersion + 1 : (row?.version ?? 0),
      tier: 'synced',
      wrappedKey,
      shape: toBase64Url(sealedShape),
      ...(sealedBody ? { body: toBase64Url(sealedBody) } : {}),
    };
    await store.enqueue(this.db, mutation, last ? last.base : (row ?? null), this.now());
    await this.refresh(id);
    this.options.onChange?.();
  }

  /** Deletes an entry: a tombstone on the server, and gone from the index at once. */
  async remove(id: string): Promise<void> {
    const row = await store.rowOf(this.db, id);
    const pending = await store.pendingFor(this.db, id);
    const last = pending.at(-1);
    if (!row && !last) return;
    await store.enqueue(
      this.db,
      {
        id: crypto.randomUUID(),
        op: 'delete',
        entryId: id,
        baseVersion: last ? last.mutation.baseVersion + 1 : (row?.version ?? 0),
        tier: 'synced',
      },
      last ? last.base : (row ?? null),
      this.now(),
    );
    await this.refresh(id);
    this.options.onChange?.();
  }

  // ---- syncing ----

  /** Sends the outbox and takes what the server has. One at a time: a second call while one is running waits for it and then runs. */
  sync(): Promise<SyncOutcome> {
    const run = async (): Promise<SyncOutcome> => {
      if (this.syncing) await this.syncing.catch(() => undefined);
      return this.round();
    };
    const turn = run();
    this.syncing = turn.then(
      () => undefined as never,
      () => undefined as never,
    );
    return turn;
  }

  private async round(): Promise<SyncOutcome> {
    let applied = 0;
    let refused = 0;
    let pulled = 0;
    // Several passes while there is more to take, or a merge made a change to send; never unboundedly.
    for (let pass = 0; pass < 20; pass++) {
      const outbox = (await store.outboxItems(this.db)).filter((item) => !item.stale);
      const blocked = new Set(
        (await store.outboxItems(this.db)).filter((i) => i.stale).map((i) => i.mutation.entryId),
      );
      const sending = outbox
        .filter((item) => !blocked.has(item.mutation.entryId))
        .slice(0, MAX_MUTATIONS);
      const result = await this.transport.sync({
        v: PROTOCOL_VERSION,
        deviceId: await store.deviceId(this.db),
        cursor: await store.cursorOf(this.db),
        mutations: sending.map((item) => item.mutation),
      });
      if (result.kind !== 'ok') return { status: result.kind };
      const { answer } = result;
      const byId = new Map(sending.map((item) => [item.mutation.id, item]));
      const now = this.now();
      const appliedRows = answer.applied.flatMap((each) => {
        const item = byId.get(each.mutationId);
        if (!item) return [];
        const m = item.mutation;
        const row: RowWire = {
          id: m.entryId,
          tier: m.tier,
          version: each.version,
          seq: each.seq,
          wrappedKey: m.wrappedKey ?? item.base?.wrappedKey ?? '',
          shape: m.op === 'put' ? (m.shape ?? null) : null,
          body: m.op === 'put' ? (m.body ?? null) : null,
          deletedAt: m.op === 'delete' ? now : null,
          createdAt: item.base?.createdAt ?? now,
          updatedAt: now,
        };
        return [{ item, row }];
      });
      await store.applyAnswer(this.db, {
        applied: appliedRows,
        rows: answer.rows,
        cursor: answer.cursor,
        mode: answer.mode,
        vaultVersion: answer.vaultVersion,
      });
      applied += appliedRows.length;
      pulled += answer.rows.length;

      const touched = new Set<string>([
        ...appliedRows.map((a) => a.row.id),
        ...answer.rows.map((r) => r.id),
      ]);
      let merged = false;
      for (const refusal of answer.refused) {
        const item = byId.get(refusal.mutationId);
        if (!item) continue;
        refused++;
        const entryId = item.mutation.entryId;
        touched.add(entryId);
        if (refusal.code === 'stale') {
          const current = refusal.current;
          if (!current) continue;
          if (item.n !== undefined) await store.markStale(this.db, item.n, current);
          merged = (await this.mergeStale(entryId)) || merged;
        } else {
          await store.refuse(this.db, entryId, refusal.code satisfies Refusal, now);
        }
      }
      for (const id of touched) await this.refresh(id);
      await this.refreshVault(answer.vaultVersion);
      if (!answer.more && !merged) return { status: 'ok', applied, refused, pulled };
    }
    return { status: 'ok', applied, refused, pulled };
  }

  /** Keeps the device's copy of the vault header current: a device that has an older one fetches the new one. */
  private async refreshVault(serverVersion: number | null): Promise<void> {
    if (serverVersion === null) return;
    const held = await store.vaultOf(this.db);
    if (held && held.version >= serverVersion) return;
    const vault = await this.transport.vault();
    if (vault) await store.saveVault(this.db, vault);
  }

  /**
   * Settles every stale change of an entry that is waiting, when the wallet is unlocked (DESIGN.md §11.5): field by field, this device's value kept on a
   * clash; an edit against a delete restores the entry; both deleted is deleted. Returns whether it made a change to send.
   */
  async mergeStale(entryId: string): Promise<boolean> {
    const items = await store.pendingFor(this.db, entryId);
    const first = items[0];
    const last = items.at(-1);
    const current = items.find((i) => i.stale)?.stale;
    if (!first || !last || !current) return false;
    if (this.keyring.state !== 'unlocked') return false;
    const row = (await store.rowOf(this.db, entryId)) ?? current;
    const fresh = current.version >= row.version ? current : row;

    // A delete against an edit: the edit stands, and this delete is let go. Both deleted: deleted, and there is nothing to send.
    if (last.mutation.op === 'delete') {
      await this.dropPending(entryId);
      return false;
    }

    // An edit against a delete: the edit restores the entry.
    if (fresh.deletedAt !== null) {
      await store.replacePending(this.db, entryId, {
        mutation: { ...last.mutation, id: crypto.randomUUID(), baseVersion: fresh.version },
        base: fresh,
        queuedAt: this.now(),
      });
      return true;
    }

    const keys = await this.keyring.entryKeys(
      entryId,
      fromBase64Url(last.mutation.wrappedKey ?? '') ?? new Uint8Array(),
    );
    const open = async (
      sealed: { id: string; wrappedKey: string; shape: string | null; body: string | null } | null,
    ) => (sealed ? openSealed(this.accountId, this.keyring, sealed, true) : null);
    const base = await open(first.base ? sealedOfRow(first.base) : null);
    const mine = await open({
      id: entryId,
      wrappedKey: last.mutation.wrappedKey ?? '',
      shape: last.mutation.shape ?? null,
      body: last.mutation.body ?? null,
    });
    const theirs = await open(sealedOfRow(fresh));
    if (!mine?.ok || !theirs?.ok || (base && !base.ok)) {
      // What cannot be opened cannot be merged: this device's version is sent over it, so that nothing typed is lost.
      await store.replacePending(this.db, entryId, {
        mutation: { ...last.mutation, id: crypto.randomUUID(), baseVersion: fresh.version },
        base: fresh,
        queuedAt: this.now(),
      });
      return true;
    }
    const shape = merge(
      base?.ok ? (base.shape as unknown as Record<string, unknown>) : null,
      mine.shape as unknown as Record<string, unknown>,
      theirs.shape as unknown as Record<string, unknown>,
    );
    const body =
      mine.body && theirs.body
        ? merge(
            base?.ok && base.body ? (base.body as unknown as Record<string, unknown>) : null,
            mine.body as unknown as Record<string, unknown>,
            theirs.body as unknown as Record<string, unknown>,
          )
        : { merged: mine.body ?? theirs.body, clashes: [] };
    const checkedShape = parseShape(shape.merged);
    const checkedBody = body.merged
      ? parseBody(checkedShape.ok ? checkedShape.value.kind : 'card', body.merged)
      : null;
    if (!checkedShape.ok || (checkedBody && !checkedBody.ok)) {
      await store.refuse(this.db, entryId, 'invalid', this.now());
      return false;
    }
    const sealedShape = await seal(keys.aes, 'shape', this.accountId, entryId, checkedShape.value);
    const sealedBody = checkedBody?.ok
      ? await seal(keys.aes, 'body', this.accountId, entryId, checkedBody.value)
      : undefined;
    await store.replacePending(this.db, entryId, {
      mutation: {
        id: crypto.randomUUID(),
        op: 'put',
        entryId,
        baseVersion: fresh.version,
        tier: last.mutation.tier,
        wrappedKey: last.mutation.wrappedKey ?? '',
        shape: toBase64Url(sealedShape),
        ...(sealedBody ? { body: toBase64Url(sealedBody) } : {}),
      },
      base: fresh,
      queuedAt: this.now(),
    });
    const clashes = [
      ...shape.clashes.map((c) => ({ part: 'shape' as const, ...c })),
      ...body.clashes.map((c) => ({ part: 'body' as const, ...c })),
    ];
    if (clashes.length > 0) this.options.onMerged?.({ entryId, clashes });
    return true;
  }

  private async dropPending(entryId: string): Promise<void> {
    const tx = this.db.transaction('outbox', 'readwrite');
    for (const item of await tx.store.index('byEntry').getAll(entryId))
      if (item.n !== undefined) await tx.store.delete(item.n);
    await tx.done;
  }

  /** Called when the wallet unlocks with changes that waited for it: merges each. */
  async mergeWaiting(): Promise<boolean> {
    const ids = new Set(
      (await store.outboxItems(this.db)).filter((i) => i.stale).map((i) => i.mutation.entryId),
    );
    let again = false;
    for (const id of ids) again = (await this.mergeStale(id)) || again;
    for (const id of ids) await this.refresh(id);
    return again;
  }

  // ---- Couldn't sync ----

  refusedChanges(): Promise<RefusedItem[]> {
    return store.refusedItems(this.db);
  }

  async retry(entryId: string): Promise<void> {
    await store.retryRefused(this.db, entryId, this.now());
    await this.refresh(entryId);
    this.options.onChange?.();
  }

  async discard(entryId: string): Promise<void> {
    await store.discardRefused(this.db, entryId);
    await this.refresh(entryId);
  }

  /** How many changes have not been answered. */
  async unsentCount(): Promise<number> {
    return (await store.outboxItems(this.db)).length;
  }

  /** The outbox as it is, for the tests. */
  outbox(): Promise<OutboxItem[]> {
    return store.outboxItems(this.db);
  }
}
