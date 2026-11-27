import type { confirmPassword } from '@sovereignfs/auth/server';
import { readCapped } from '../../access/body';

/**
 * `/api/keys/confirm` (DESIGN.md §9.4): is this the signed-in account's own password? The lock screen asks **before it gives the suite's vault anything made from
 * what was typed,** because an account that has no keys yet gets them from the first password it is given, typo and all. What is sent is the sign-in value, never
 * the password, and the check is the sign-in package's own (`confirmPassword`, auth.md §4, rule 3), which counts wrong answers per account.
 */
export type Verify = (password: string) => ReturnType<typeof confirmPassword>;

const answer = (status: 200 | 400 | 403 | 413 | 429, code?: string): Response =>
  new Response(JSON.stringify(code ? { code } : { ok: true }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function confirmResponse(request: Request, verify: Verify): Promise<Response> {
  const body = await readCapped(request, 1024);
  if (body === null) return answer(413, 'TOO_LARGE');
  let password: unknown;
  try {
    password = (JSON.parse(body) as { password?: unknown }).password;
  } catch {
    return answer(400, 'BAD_REQUEST');
  }
  if (typeof password !== 'string' || password === '') return answer(400, 'BAD_REQUEST');
  const checked = await verify(password);
  if (checked === 'ok') return answer(200);
  return checked === 'limited' ? answer(429, 'RATE_LIMITED') : answer(403, 'WRONG_PASSWORD');
}
