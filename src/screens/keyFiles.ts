import { isProtectedKeyFile, openProtectedKeyFile } from '../core/vault';

/**
 * What a key file or paste is: a key as it is, or a file that a passphrase protects (DESIGN.md §7.1). **The passphrase is asked for only when the file
 * needs one, and is used once.** Nothing here reads more than the text it was given.
 */
export type KeyInput =
  | { readonly kind: 'key'; readonly text: string }
  | { readonly kind: 'protected'; readonly text: string };

export function classify(text: string): KeyInput {
  return isProtectedKeyFile(text) ? { kind: 'protected', text } : { kind: 'key', text };
}

/** The key inside a protected file, or `wrong_passphrase`, or `not_a_key_file`. */
export async function openProtected(
  text: string,
  passphrase: string,
): Promise<
  { ok: true; text: string } | { ok: false; reason: 'wrong_passphrase' | 'not_a_key_file' }
> {
  try {
    return { ok: true, text: await openProtectedKeyFile(text, passphrase) };
  } catch (error) {
    const kind = (error as { kind?: string }).kind;
    return { ok: false, reason: kind === 'wrong_key' ? 'wrong_passphrase' : 'not_a_key_file' };
  }
}

/** Saves text as a file in the browser: the key file, the recovery sheet. Nothing is sent anywhere. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The address is kept a moment, since some browsers read it after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
