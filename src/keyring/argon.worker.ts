import { argon2id } from 'hash-wasm';

/**
 * Argon2id off the page's own thread (DESIGN.md §9.3): 64 MiB and three passes take about a second on a phone, and the page must not freeze for it. The
 * worker is this app's own file (`worker-src 'self'`), and the module it compiles is `hash-wasm`'s, under the policy's `'wasm-unsafe-eval'`.
 */
interface Request {
  readonly id: number;
  readonly passcode: string;
  readonly salt: Uint8Array;
  readonly memoryKiB: number;
  readonly iterations: number;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, passcode, salt, memoryKiB, iterations } = event.data;
  try {
    const hash = await argon2id({
      password: passcode,
      salt,
      parallelism: 1,
      iterations,
      memorySize: memoryKiB,
      hashLength: 32,
      outputType: 'binary',
    });
    (self as unknown as Worker).postMessage({ id, hash }, [hash.buffer]);
  } catch {
    (self as unknown as Worker).postMessage({ id, failed: true });
  }
};
