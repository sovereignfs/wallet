import { BlockList, isIP } from 'node:net';

/**
 * Who a request is from, for the limits that are kept per address (DESIGN.md §7): read from `X-Forwarded-For`, which only the reverse proxy in front of
 * Wallet can be believed about, and **the same rules as better-auth applies to the sign-in's limit**, so that every limit in the app agrees on who is who.
 *
 *  - With no `WALLET_AUTH_TRUSTED_PROXIES`, only a header with **one** address is believed: a chain, which a client can start with whatever it likes, is not.
 *  - With them, the chain is read **from the right**, past every hop that is one of the proxies, and the first that is not is the client: what a client put
 *    to the left of that cannot change who it is taken for.
 *  - An address that is not one, or no header, is `null`: nobody can say who it was, and the caller counts it with the others like it.
 *
 * An IPv4-mapped IPv6 address is its IPv4 address, and any other IPv6 address is its /64, which is what one machine's range is, so that changing the end of an
 * address changes nothing. Node's own `net`, and nothing else.
 */

type Family = 'ipv4' | 'ipv6';
interface Proxy {
  readonly address: string;
  /** `undefined` for a single address. */
  readonly prefix: number | undefined;
  readonly family: Family;
}

/** One entry of the setting: an IP address, or a range such as `10.0.0.0/8` or `fd00::/8`; or `null`. */
function parseProxy(entry: string): Proxy | null {
  const slash = entry.lastIndexOf('/');
  const address = slash === -1 ? entry : entry.slice(0, slash);
  const version = isIP(address);
  if (version === 0) return null;
  const family: Family = version === 4 ? 'ipv4' : 'ipv6';
  if (slash === -1) return { address, prefix: undefined, family };
  const digits = entry.slice(slash + 1);
  if (!/^\d{1,3}$/.test(digits)) return null;
  const prefix = Number(digits);
  return prefix <= (family === 'ipv4' ? 32 : 128) ? { address, prefix, family } : null;
}

/** Whether `entry` is an IP address or a range, for the setting to check at start-up. */
export const isAddressOrRange = (entry: string): boolean => parseProxy(entry) !== null;

const lists = new WeakMap<readonly string[], BlockList>();

/** The proxies as Node's address matcher, made once for each list the settings hold. */
function listOf(entries: readonly string[]): BlockList {
  const kept = lists.get(entries);
  if (kept) return kept;
  const list = new BlockList();
  for (const entry of entries) {
    const proxy = parseProxy(entry);
    if (!proxy) continue;
    if (proxy.prefix === undefined) list.addAddress(proxy.address, proxy.family);
    else list.addSubnet(proxy.address, proxy.prefix, proxy.family);
  }
  lists.set(entries, list);
  return list;
}

/** An IPv6 address as its eight groups of four hex digits, whatever way it was written (`::` shortened, a dotted IPv4 tail, a zone). */
function groupsOf(address: string): string[] {
  let text = address.split('%')[0] ?? address;
  const tail = text.slice(text.lastIndexOf(':') + 1);
  if (isIP(tail) === 4) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number);
    text = `${text.slice(0, text.lastIndexOf(':') + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const pad = (group: string) => group.padStart(4, '0').toLowerCase();
  if (!text.includes('::')) return text.split(':').map(pad);
  const [head = '', rest = ''] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = rest === '' ? [] : rest.split(':');
  return [
    ...left.map(pad),
    ...Array<string>(8 - left.length - right.length).fill('0000'),
    ...right.map(pad),
  ];
}

/** The address with an IPv4-mapped IPv6 address as its IPv4 address, and nothing else changed. */
function plain(given: string): string {
  // A zone (`fe80::1%eth0`) is the machine's own naming of a link, and means nothing to an address that arrived over the network.
  const address = given.split('%')[0] ?? given;
  if (isIP(address) !== 6) return address;
  const groups = groupsOf(address);
  if (groups.slice(0, 5).every((group) => group === '0000') && groups[5] === 'ffff') {
    const high = Number.parseInt(groups[6] ?? '0', 16);
    const low = Number.parseInt(groups[7] ?? '0', 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return address;
}

/** What a limit is counted under: the IPv4 address, or the /64 of an IPv6 one. */
function keyOf(address: string): string {
  const ip = plain(address);
  if (isIP(ip) === 4) return ip;
  return `${groupsOf(ip).slice(0, 4).join(':')}::/64`;
}

/**
 * The client's address, from the value of `X-Forwarded-For` and the settings' trusted proxies, as a key to count its requests under; or `null` when nobody can
 * say (no header, one that is not addresses, or, with no trusted proxy, a chain).
 */
export function clientAddress(
  forwardedFor: string | null | undefined,
  trusted: readonly string[] = [],
): string | null {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');
  if (hops.length === 0) return null;
  if (trusted.length === 0) {
    const only = hops[0] as string;
    return hops.length === 1 && isIP(only) !== 0 ? keyOf(only) : null;
  }
  const list = listOf(trusted);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = plain(hops[i] as string);
    const version = isIP(hop);
    if (version === 0) return null;
    if (list.check(hop, version === 4 ? 'ipv4' : 'ipv6')) continue;
    return keyOf(hop);
  }
  return null;
}
