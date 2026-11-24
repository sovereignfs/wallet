import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth, mailAvailable } from '@/src/auth/server';
import { needsMail } from '@/src/auth/mail-routes';

// Every request is answered by better-auth, mounted at /api/auth. With no sign-in on there is nothing mounted: 404, as if the routes did not exist
// (DESIGN.md §6). In suite mode the local routes are off in the package itself (`localAccounts`), and what is left is signing in through core.
export const dynamic = 'force-dynamic';

const notFound = () => new Response(null, { status: 404 });

export async function GET(request: Request): Promise<Response> {
  const auth = await getAuth();
  if (!auth || (!mailAvailable() && needsMail(new URL(request.url).pathname))) return notFound();
  const start = new URL(request.url).pathname === '/api/auth/sign-in/sovereign';
  let answer: Response;
  try {
    answer = await toNextJsHandler(auth).GET(request);
  } catch (error) {
    if (!start) throw error;
    answer = new Response(null, { status: 502 });
  }
  // Core could not be reached to start a sign-in: the person is told so on the sign-in page, with a way to try again, and not shown an error.
  return start && answer.status >= 500 ? unreachable() : answer;
}

function unreachable(): Response {
  return new Response(null, {
    status: 303,
    headers: { location: '/sign-in?error=sovereign_unreachable' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await getAuth();
  if (!auth || (!mailAvailable() && needsMail(new URL(request.url).pathname))) return notFound();
  return toNextJsHandler(auth).POST(request);
}
