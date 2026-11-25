/**
 * The sign-in routes that exist only with mail (DESIGN.md §6): asking for a reset, and sending and using a verification link. **Without mail they are not
 * mounted**: they answer 404, as a route that is not there, and not a refusal that says mail is off. The path is the one better-auth serves, under `/api/auth`.
 *
 * **Using a reset link is not here:** it needs no mail, only a link, which an operator can make (`wallet-admin accounts reset-link`, DESIGN.md §25.1) when mail
 * cannot be sent, and it is the package's own split: of the routes about passwords only the ones that *send* need it (`NEEDS_MAIL` in `@sovereignfs/auth`).
 */
const ONLY_WITH_MAIL = [
  '/api/auth/request-password-reset',
  '/api/auth/send-verification-email',
  '/api/auth/verify-email',
];

export function needsMail(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return ONLY_WITH_MAIL.some((each) => path === each || path.startsWith(`${each}/`));
}
