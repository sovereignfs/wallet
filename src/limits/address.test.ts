import { describe, expect, it } from 'vitest';
import { clientAddress, isAddressOrRange } from './address';

/**
 * Who a request is from, for the limits kept per address (src/limits/address.ts): the rules better-auth applies to the sign-in's limit, so that no limit of the
 * app can be got round by a header the client wrote.
 */
describe('the proxies the setting names', () => {
  it('accepts an address and a range of either family, and nothing else', () => {
    for (const entry of ['10.0.0.1', '10.0.0.0/8', '0.0.0.0/0', '::1', 'fd00::/8', '2001:db8::/32'])
      expect(isAddressOrRange(entry), entry).toBe(true);
    for (const entry of [
      '',
      'proxy.example.com',
      '10.0.0',
      '10.0.0.0/33',
      '10.0.0.0/',
      '10.0.0.0/8/9',
      '10.0.0.0/-1',
      'fd00::/129',
      '10.0.0.0 /8',
    ])
      expect(isAddressOrRange(entry), entry).toBe(false);
  });
});

describe('the client’s address, with no proxy named', () => {
  it('is the one address of a header that has one, and nobody’s when there is none or the header is not an address', () => {
    expect(clientAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddress(' 203.0.113.7 ')).toBe('203.0.113.7');
    for (const header of [null, undefined, '', ' , ', 'unknown', '203.0.113.7:4000', '999.1.1.1'])
      expect(clientAddress(header), String(header)).toBeNull();
  });

  it('does not believe a chain: a client can start one with anything', () => {
    expect(clientAddress('198.51.100.1, 203.0.113.7')).toBeNull();
    expect(clientAddress('203.0.113.7, 203.0.113.7')).toBeNull();
  });
});

describe('the client’s address, behind proxies that are named', () => {
  const trusted = ['10.0.0.0/8', '192.168.1.5', 'fd00::/8'];

  it('is the first hop from the right that is not a proxy, whatever is written to its left', () => {
    expect(clientAddress('203.0.113.7, 10.1.2.3', trusted)).toBe('203.0.113.7');
    expect(clientAddress('1.1.1.1, 2.2.2.2, 203.0.113.7, 10.1.2.3, 192.168.1.5', trusted)).toBe(
      '203.0.113.7',
    );
    // Rotating what is on the left changes nothing about who it is.
    expect(clientAddress('6.6.6.6, 203.0.113.7, 10.0.0.1', trusted)).toBe(
      clientAddress('7.7.7.7, 203.0.113.7, 10.0.0.1', trusted),
    );
    // A proxy's address written on the left is not a reason to look no further right.
    expect(clientAddress('10.9.9.9, 203.0.113.9', trusted)).toBe('203.0.113.9');
    // A header with one address that is not a proxy is the client, as with none named.
    expect(clientAddress('203.0.113.7', trusted)).toBe('203.0.113.7');
  });

  it('is nobody’s when every hop is a proxy, or one of them is not an address', () => {
    expect(clientAddress('10.0.0.1, 10.0.0.2', trusted)).toBeNull();
    expect(clientAddress('203.0.113.7, not-an-address, 10.0.0.1', trusted)).toBeNull();
    expect(clientAddress('203.0.113.7:4000, 10.0.0.1', trusted)).toBeNull();
    expect(clientAddress(null, trusted)).toBeNull();
  });

  it('reads an IPv6 proxy as a proxy, and counts an IPv6 client by its /64, so that the end of an address is not a way round a limit', () => {
    const a = clientAddress('2001:db8:1:2::1, fd00::5', trusted);
    const b = clientAddress('2001:DB8:1:2:ffff:ffff:ffff:ffff, fd00::5', trusted);
    expect(a).toBe(b);
    expect(a).toBe('2001:0db8:0001:0002::/64');
    expect(clientAddress('2001:db8:1:3::1, fd00::5', trusted)).not.toBe(a);
  });

  it('counts an IPv4-mapped IPv6 address as its IPv4 address, for a client and for a proxy', () => {
    expect(clientAddress('::ffff:203.0.113.7, 10.0.0.1', trusted)).toBe('203.0.113.7');
    expect(clientAddress('::ffff:cb00:7107', trusted)).toBe('203.0.113.7');
    expect(clientAddress('203.0.113.7, ::ffff:10.0.0.1', trusted)).toBe('203.0.113.7');
    expect(clientAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('is not thrown by an address written with a zone, a dotted tail or a shortened end', () => {
    expect(() => clientAddress('fe80::1%eth0, 10.0.0.1', trusted)).not.toThrow();
    expect(clientAddress('64:ff9b::203.0.113.7, 10.0.0.1', trusted)).toMatch(/::\/64$/);
    expect(clientAddress('::1', ['::1'])).toBeNull();
  });
});
