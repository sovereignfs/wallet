import {
  PROTOCOL_VERSION,
  type SyncRequest,
  type SyncResponse,
  parseSyncResponse,
} from '../core/sync/protocol';

/**
 * How the device talks to its server (DESIGN.md §11.3): `POST /api/sync`. It is a small interface so that the tests give the device a
 * server of their own, and the browser's is `fetchTransport`. **The browser talks only to its own server** (AGENTS.md): the address is a path.
 */
export type SyncResult =
  | { readonly kind: 'ok'; readonly answer: SyncResponse }
  /** No network, or the server did not answer: the outbox stays, and the loop tries again. */
  | { readonly kind: 'offline' }
  /** The session has ended: sign in again; nothing on the device is touched (DESIGN.md §11.8). */
  | { readonly kind: 'unauthorized' }
  /** The server wants a newer protocol than this device speaks: update, and keep the outbox. */
  | { readonly kind: 'update' }
  | { readonly kind: 'failed'; readonly status: number };

export interface Transport {
  sync(request: SyncRequest): Promise<SyncResult>;
}

export function fetchTransport(fetcher: typeof fetch = (...args) => fetch(...args)): Transport {
  return {
    async sync(request) {
      let response: Response;
      try {
        response = await fetcher('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          credentials: 'same-origin',
        });
      } catch {
        return { kind: 'offline' };
      }
      if (response.status === 401) return { kind: 'unauthorized' };
      if (response.status === 426) return { kind: 'update' };
      if (!response.ok) return { kind: 'failed', status: response.status };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { kind: 'failed', status: response.status };
      }
      const answer = parseSyncResponse(body);
      // An answer that is not what the protocol says is not trusted with the device's cursor.
      return answer && answer.v === PROTOCOL_VERSION
        ? { kind: 'ok', answer }
        : { kind: 'failed', status: response.status };
    },
  };
}
