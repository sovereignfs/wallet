import { type Derive, deriveHere } from './wrappers';

/**
 * Argon2id for the screens: in a worker where there is one, and on the page's own thread where there is not (a worker that cannot start is not an
 * error: the passcode still works, and takes a second of the page). The passcode is posted to the worker and nowhere else.
 */
let worker: Worker | undefined | null;
let next = 0;

function start(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./argon.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

export const deriveInWorker: Derive = (passcode, salt, params) => {
  const w = start();
  if (!w) return deriveHere(passcode, salt, params);
  const id = ++next;
  return new Promise((resolve, reject) => {
    const onMessage = (
      event: MessageEvent<{ id: number; hash?: Uint8Array<ArrayBuffer>; failed?: boolean }>,
    ) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (event.data.hash) resolve(event.data.hash);
      else reject(new Error('could not derive'));
    };
    // A worker that fails to run (a policy that refuses it, a file that did not load) falls back to the page's own thread, once.
    const onError = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      worker = null;
      deriveHere(passcode, salt, params).then(resolve, reject);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({
      id,
      passcode,
      salt,
      memoryKiB: params.memoryKiB,
      iterations: params.iterations,
    });
  });
};
