/**
 * Text encodings the portable core shares (DESIGN.md §5.1): in a file of their own so that the server, which never imports the vault format,
 * can read and write the base64url of sealed values it only stores.
 */
/**
 * base64url without padding: the alphabet that has no `.` or `:` to split on and that a JSON string carries as it is. One byte string has one spelling:
 * `fromBase64Url` refuses text that is not the canonical form of its bytes.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP)
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const ALPHABET = /^[A-Za-z0-9_-]*$/;

/** The bytes of base64url text, or `undefined` if it is not that. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!ALPHABET.test(text) || text.length % 4 === 1) return undefined;
  const padded =
    text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return toBase64Url(out) === text ? out : undefined;
  } catch {
    return undefined;
  }
}
