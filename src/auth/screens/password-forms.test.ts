import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResetForm } from './ResetForm';
import { SignInForm } from './SignInForm';
import { SignUpForm } from './SignUpForm';

/**
 * A form a browser can send before the page runs is sent as a GET, with every named box in the address, and so in the history and a proxy's access log: for
 * these three, the password itself, which the page otherwise never sends. The forms are `@sovereignfs/ui`'s; what Wallet relies on of them is that, as the
 * server draws them, they cannot be sent, and would be sent by POST if something sent them all the same.
 */
const FORMS: readonly [string, ReactElement][] = [
  ['sign-in', createElement(SignInForm, { canSignUp: true, canReset: true })],
  ['sign-up', createElement(SignUpForm, { minLength: 10 })],
  [
    'reset',
    createElement(ResetForm, {
      minLength: 10,
      token: 'token',
      email: 'ada@example.com',
      canAskAgain: true,
    }),
  ],
];

describe.each(FORMS)('the %s form, as the server draws it', (_name, form) => {
  const html = renderToStaticMarkup(form);

  it('cannot be sent: every button that would send it is off', () => {
    const buttons = (html.match(/<button[^>]*>/g) ?? []).filter((tag) =>
      tag.includes('type="submit"'),
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toContain('disabled=""');
  });

  it('would put nothing in the address if it were sent: it posts', () => {
    const forms = html.match(/<form[^>]*>/g) ?? [];
    expect(forms).toHaveLength(1);
    expect(forms[0]).toContain('method="post"');
  });
});
