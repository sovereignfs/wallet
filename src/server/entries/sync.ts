import { PAGE_ROWS, PROTOCOL_VERSION, parseSyncRequest } from '../../core/sync/protocol';
import type { SyncResponse } from '../../core/sync/protocol';
import { readCapped } from '../../access/body';
import type { Limits } from '../../config';
import type { Database } from '../../db/client';
import type { Limiter, Rule } from '../../limits/rate';
import { applyMutation, modeOf, pullRows } from './apply';

/**
 * `POST /api/sync` (DESIGN.md §11.3): the outbox in order, then the rows past the cursor. The account is the session's and no request says otherwise.
 * `docs/specs/sync-protocol.md` is the specification.
 */
export interface SyncDeps {
  readonly database: Database;
  readonly limiter: Limiter;
  readonly limits: Limits;
  readonly now: () => number;
}

/** A request is at most this many bytes: a body is up to 256 KB sealed and 4/3 larger as text, and a request holds a few of them. */
export const REQUEST_MAX_BYTES = 4 * 1024 * 1024;
const RATE: Rule = { limit: 240, windowMs: 60_000 };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

export async function handleSync(
  request: Request,
  accountId: string,
  deps: SyncDeps,
): Promise<Response> {
  const taken = await deps.limiter.take(`sync:${accountId}`, RATE);
  if (!taken.ok)
    return json(
      429,
      { code: 'RATE_LIMITED' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  const text = await readCapped(request, REQUEST_MAX_BYTES);
  if (text === null) return json(413, { code: 'TOO_LARGE' });
  const parsed = parseSyncRequest(text);
  // A device too old (or too new) for this server is told so, and keeps its outbox.
  if (!parsed.ok)
    return parsed.code === 'unsupported'
      ? json(426, { code: 'UPDATE_REQUIRED', v: PROTOCOL_VERSION })
      : json(400, { code: 'BAD_REQUEST' });
  const { mutations, cursor } = parsed.request;

  const applied: SyncResponse['applied'][number][] = [];
  const refused: SyncResponse['refused'][number][] = [];
  for (const m of mutations) {
    const result = await applyMutation(deps.database, accountId, m, {
      now: deps.now(),
      limits: deps.limits,
    });
    if (result.status === 'applied')
      applied.push({ mutationId: m.id, seq: result.seq, version: result.version });
    else
      refused.push({
        mutationId: m.id,
        code: result.code,
        ...(result.current ? { current: result.current } : {}),
      });
  }

  const { rows, more } = await pullRows(deps.database, accountId, cursor, PAGE_ROWS);
  const answer: SyncResponse = {
    v: PROTOCOL_VERSION,
    applied,
    refused,
    rows,
    cursor: rows.at(-1)?.seq ?? cursor,
    more,
    mode: await modeOf(deps.database, accountId),
  };
  return json(200, answer);
}
