import { describe, expect, it } from 'vitest';

import { isBlockedAddress } from '../../lib/drop/private-address';

describe('isBlockedAddress', () => {
  it('blocks loopback, private, and link-local IPv4', () => {
    for (const address of [
      '127.0.0.1',
      '127.1.1.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '0.0.0.0',
      '255.255.255.255',
      '224.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '99.84.0.1']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('blocks alternate notations rather than trying to interpret them', () => {
    // 2130706433 and 0x7f.1 are both 127.0.0.1 to a permissive parser.
    for (const address of ['2130706433', '0x7f000001', '127.1', '017700000001', '']) {
      expect(isBlockedAddress(address, 4), address).toBe(true);
    }
  });

  it('blocks loopback and private IPv6', () => {
    for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
      expect(isBlockedAddress(address, 6), address).toBe(true);
    }
  });

  it('allows public IPv6', () => {
    for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isBlockedAddress(address, 6), address).toBe(false);
    }
  });

  it('sees through IPv4-mapped and NAT64 wrappers', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254', 6)).toBe(true);
    expect(isBlockedAddress('64:ff9b::10.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:8.8.8.8', 6)).toBe(false);
  });
});
